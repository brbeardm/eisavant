import { Router } from 'express';
import { logAudit } from '../db/audit.js';
import { withContext } from '../db/pool.js';
import { ctxOf, requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import {
  adminUserUpdateSchema,
  candidateAssignSchema,
  candidateUpdateSchema,
  companySchema,
  positionSchema,
  supportNoteSchema,
} from '../validation/schemas.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin', 'support'));

const uuidParam = (value: string): string => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Invalid user id');
  }
  return value;
};

// Staff directory view. RLS grants support/admin SELECT over users+profiles.
adminRouter.get('/users', async (req, res, next) => {
  try {
    const ctx = { userId: req.user!.id, role: req.user!.role };
    const users = await withContext(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT u.id, u.email, u.role, u.status, u.created_at,
                p.first_name, p.last_name, p.title, p.company, p.industry, p.country
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
         ORDER BY u.created_at DESC`,
      );
      return rows;
    });
    return res.json(users);
  } catch (err) {
    return next(err);
  }
});

adminRouter.get('/users/:id', async (req, res, next) => {
  try {
    const targetId = uuidParam(req.params.id);
    const ctx = { userId: req.user!.id, role: req.user!.role };
    const detail = await withContext(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT u.id, u.email, u.role, u.status, u.created_at, u.client_company_id, p.*,
                (SELECT filename FROM documents d WHERE d.user_id = u.id AND d.kind = 'cv') AS cv_filename
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
         WHERE u.id = $1`,
        [targetId],
      );
      if (!rows[0]) return null;
      // Read audit: staff views of a member's full profile are recorded.
      await logAudit(client, {
        actorUserId: req.user!.id,
        action: 'staff.profile_viewed',
        targetUserId: targetId,
      });
      const { rows: notes } = await client.query(
        `SELECT sn.id, sn.note, sn.created_at, p.first_name AS author_first_name, p.last_name AS author_last_name
         FROM support_notes sn
         LEFT JOIN profiles p ON p.user_id = sn.author_id
         WHERE sn.user_id = $1
         ORDER BY sn.created_at DESC`,
        [targetId],
      );
      const { rows: payments } = await client.query(
        `SELECT id, plan, amount_cents, currency, status, created_at
         FROM payments WHERE user_id = $1 ORDER BY created_at DESC`,
        [targetId],
      );
      return { ...rows[0], notes, payments };
    });
    if (!detail) throw new HttpError(404, 'User not found');
    return res.json(detail);
  } catch (err) {
    return next(err);
  }
});

// Role/status changes are admin-only — enforced here, by RLS, and by the
// guard_privileged_columns trigger.
adminRouter.patch('/users/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const targetId = uuidParam(req.params.id);
    const updates = adminUserUpdateSchema.parse(req.body);
    if (!updates.role && !updates.status && updates.clientCompanyId === undefined) {
      throw new HttpError(400, 'Nothing to update');
    }
    if (targetId === req.user!.id && updates.role && updates.role !== 'admin') {
      throw new HttpError(400, 'Admins cannot demote their own account');
    }

    const ctx = { userId: req.user!.id, role: req.user!.role };
    const updated = await withContext(ctx, async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [targetId];
      if (updates.role) {
        values.push(updates.role);
        sets.push(`role = $${values.length}`);
      }
      if (updates.status) {
        values.push(updates.status);
        sets.push(`status = $${values.length}`);
      }
      if (updates.clientCompanyId !== undefined) {
        values.push(updates.clientCompanyId);
        sets.push(`client_company_id = $${values.length}`);
      }
      const { rows } = await client.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING id, email, role, status`,
        values,
      );
      if (rows[0]) {
        await logAudit(client, {
          actorUserId: req.user!.id,
          action: 'admin.user_updated',
          targetUserId: targetId,
          details: updates,
        });
      }
      return rows[0];
    });
    if (!updated) throw new HttpError(404, 'User not found');
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/users/:id/notes', async (req, res, next) => {
  try {
    const targetId = uuidParam(req.params.id);
    const { note } = supportNoteSchema.parse(req.body);
    const ctx = { userId: req.user!.id, role: req.user!.role };
    const created = await withContext(ctx, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO support_notes (user_id, author_id, note)
         VALUES ($1, $2, $3)
         RETURNING id, note, created_at`,
        [targetId, req.user!.id, note],
      );
      await logAudit(client, {
        actorUserId: req.user!.id,
        action: 'support.note_added',
        targetUserId: targetId,
      });
      return rows[0];
    });
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

// Staff download of a member's CV (support assists with profile issues).
adminRouter.get('/users/:id/cv', async (req, res, next) => {
  try {
    const targetId = uuidParam(req.params.id);
    const ctx = { userId: req.user!.id, role: req.user!.role };
    const doc = await withContext(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT filename, mime_type, data FROM documents WHERE user_id = $1 AND kind = 'cv'`,
        [targetId],
      );
      if (rows[0]) {
        // Read audit: staff CV downloads are recorded.
        await logAudit(client, {
          actorUserId: req.user!.id,
          action: 'staff.cv_downloaded',
          targetUserId: targetId,
        });
      }
      return rows[0] as { filename: string; mime_type: string; data: Buffer } | undefined;
    });
    if (!doc) throw new HttpError(404, 'No CV on file');
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.filename.replace(/"/g, '')}"`);
    return res.send(doc.data);
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// Recruiting management (admin only): client companies, positions, candidate
// slates and their disclosure levels. Support is deliberately excluded.
// ---------------------------------------------------------------------------

adminRouter.get('/companies', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = await withContext(ctxOf(req), async (client) => {
      const { rows } = await client.query(
        `SELECT cc.id, cc.name, cc.contact_email, cc.created_at,
                (SELECT count(*)::int FROM positions p WHERE p.client_company_id = cc.id) AS position_count,
                (SELECT count(*)::int FROM users u WHERE u.client_company_id = cc.id) AS user_count
         FROM client_companies cc ORDER BY cc.name`,
      );
      return rows;
    });
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/companies', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, contactEmail } = companySchema.parse(req.body);
    const created = await withContext(ctxOf(req), async (client) => {
      const { rows } = await client.query(
        `INSERT INTO client_companies (name, contact_email) VALUES ($1, $2)
         RETURNING id, name, contact_email, created_at`,
        [name, contactEmail],
      );
      await logAudit(client, {
        actorUserId: req.user!.id,
        action: 'admin.company_created',
        details: { name },
      });
      return rows[0];
    });
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

adminRouter.get('/positions', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await withContext(ctxOf(req), async (client) => {
      const { rows: positions } = await client.query(
        `SELECT p.id, p.title, p.description, p.status, p.created_at,
                p.client_company_id, cc.name AS company_name
         FROM positions p JOIN client_companies cc ON cc.id = p.client_company_id
         ORDER BY p.created_at DESC`,
      );
      const { rows: candidates } = await client.query(
        `SELECT pc.id, pc.position_id, pc.candidate_user_id, pc.disclosure_level,
                pc.stage, pc.summary, pr.first_name, pr.last_name, pr.company
         FROM position_candidates pc
         LEFT JOIN profiles pr ON pr.user_id = pc.candidate_user_id
         ORDER BY pc.created_at`,
      );
      return positions.map((p) => ({
        ...p,
        candidates: candidates.filter((c) => c.position_id === p.id),
      }));
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/positions', requireRole('admin'), async (req, res, next) => {
  try {
    const { clientCompanyId, title, description } = positionSchema.parse(req.body);
    const created = await withContext(ctxOf(req), async (client) => {
      const { rows } = await client.query(
        `INSERT INTO positions (client_company_id, title, description)
         VALUES ($1, $2, $3)
         RETURNING id, client_company_id, title, description, status, created_at`,
        [clientCompanyId, title, description],
      );
      await logAudit(client, {
        actorUserId: req.user!.id,
        action: 'admin.position_created',
        details: { positionId: rows[0].id, title },
      });
      return rows[0];
    });
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/positions/:id/candidates', requireRole('admin'), async (req, res, next) => {
  try {
    const positionId = uuidParam(req.params.id);
    const body = candidateAssignSchema.parse(req.body);
    const created = await withContext(ctxOf(req), async (client) => {
      const { rows } = await client.query(
        `INSERT INTO position_candidates
           (position_id, candidate_user_id, disclosure_level, stage, summary, added_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, position_id, candidate_user_id, disclosure_level, stage, summary`,
        [positionId, body.candidateUserId, body.disclosureLevel, body.stage, body.summary, req.user!.id],
      );
      await logAudit(client, {
        actorUserId: req.user!.id,
        action: 'admin.candidate_assigned',
        targetUserId: body.candidateUserId,
        details: { positionId, disclosureLevel: body.disclosureLevel },
      });
      return rows[0];
    });
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

adminRouter.patch('/candidates/:pcId', requireRole('admin'), async (req, res, next) => {
  try {
    const pcId = uuidParam(req.params.pcId);
    const updates = candidateUpdateSchema.parse(req.body);
    const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
    if (entries.length === 0) throw new HttpError(400, 'Nothing to update');
    const columns: Record<string, string> = {
      disclosureLevel: 'disclosure_level',
      stage: 'stage',
      summary: 'summary',
    };
    const updated = await withContext(ctxOf(req), async (client) => {
      const sets = entries.map(([k], i) => `${columns[k]} = $${i + 2}`);
      const { rows } = await client.query(
        `UPDATE position_candidates SET ${sets.join(', ')}
         WHERE id = $1
         RETURNING id, position_id, candidate_user_id, disclosure_level, stage, summary`,
        [pcId, ...entries.map(([, v]) => v)],
      );
      if (rows[0]) {
        await logAudit(client, {
          actorUserId: req.user!.id,
          action: 'admin.candidate_updated',
          targetUserId: rows[0].candidate_user_id,
          details: updates,
        });
      }
      return rows[0];
    });
    if (!updated) throw new HttpError(404, 'Candidate assignment not found');
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

adminRouter.get('/audit', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = { userId: req.user!.id, role: req.user!.role };
    const rows = await withContext(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT id, actor_user_id, action, target_user_id, details, created_at
         FROM audit_log ORDER BY created_at DESC LIMIT 200`,
      );
      return rows;
    });
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});
