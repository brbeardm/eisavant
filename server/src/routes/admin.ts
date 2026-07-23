import { Router } from 'express';
import { logAudit } from '../db/audit.js';
import { withContext } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { adminUserUpdateSchema, supportNoteSchema } from '../validation/schemas.js';

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
        `SELECT u.id, u.email, u.role, u.status, u.created_at, p.*,
                (SELECT filename FROM documents d WHERE d.user_id = u.id AND d.kind = 'cv') AS cv_filename
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
         WHERE u.id = $1`,
        [targetId],
      );
      if (!rows[0]) return null;
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
    if (!updates.role && !updates.status) throw new HttpError(400, 'Nothing to update');
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
