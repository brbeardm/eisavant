import { Router } from 'express';
import { logAudit } from '../db/audit.js';
import { withContext } from '../db/pool.js';
import { ctxOf, requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

/**
 * Client-company portal. RLS does the heavy lifting:
 *   - positions/candidates are visible only for the caller's own company;
 *   - a candidate's profile row is invisible below 'identified' disclosure,
 *     so the joined columns come back NULL and we return the anonymous shape;
 *   - the CV document row is invisible below 'full', so has_cv is false.
 */
export const clientRouter = Router();
clientRouter.use(requireAuth, requireRole('client'));

clientRouter.get('/positions', async (req, res, next) => {
  try {
    const result = await withContext(ctxOf(req), async (client) => {
      const { rows: positions } = await client.query(
        `SELECT p.id, p.title, p.description, p.status, p.created_at, cc.name AS company_name
         FROM positions p JOIN client_companies cc ON cc.id = p.client_company_id
         ORDER BY p.created_at DESC`,
      );
      const { rows: candidates } = await client.query(
        `SELECT pc.id, pc.position_id, pc.disclosure_level, pc.stage, pc.summary,
                pr.first_name, pr.last_name, pr.title, pr.company, pr.industry,
                pr.country, pr.bio, pr.linkedin_url,
                EXISTS (
                  SELECT 1 FROM documents d
                  WHERE d.user_id = pc.candidate_user_id AND d.kind = 'cv'
                ) AS has_cv
         FROM position_candidates pc
         LEFT JOIN profiles pr ON pr.user_id = pc.candidate_user_id
         ORDER BY pc.created_at`,
      );
      await logAudit(client, {
        actorUserId: req.user!.id,
        action: 'client.slate_viewed',
        details: { positions: positions.length, candidates: candidates.length },
      });
      return positions.map((p) => ({
        ...p,
        candidates: candidates
          .filter((c) => c.position_id === p.id)
          .map((c) => ({
            id: c.id,
            disclosure_level: c.disclosure_level,
            stage: c.stage,
            summary: c.summary,
            // NULL profile columns mean RLS withheld identity (anonymous).
            identified: c.first_name !== null,
            name: c.first_name !== null ? `${c.first_name} ${c.last_name}` : null,
            title: c.title,
            company: c.company,
            industry: c.industry,
            country: c.country,
            bio: c.bio,
            linkedin_url: c.linkedin_url,
            has_cv: c.has_cv,
          })),
      }));
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

// CV download for candidates at 'full' disclosure. The documents RLS policy
// is the gate — below 'full' the row simply does not exist for this caller.
clientRouter.get('/candidates/:pcId/cv', async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.pcId)) throw new HttpError(400, 'Invalid id');
    const doc = await withContext(ctxOf(req), async (client) => {
      const { rows } = await client.query(
        `SELECT d.filename, d.mime_type, d.data, pc.candidate_user_id
         FROM position_candidates pc
         JOIN documents d ON d.user_id = pc.candidate_user_id AND d.kind = 'cv'
         WHERE pc.id = $1`,
        [req.params.pcId],
      );
      if (rows[0]) {
        await logAudit(client, {
          actorUserId: req.user!.id,
          action: 'client.cv_downloaded',
          targetUserId: rows[0].candidate_user_id,
          details: { positionCandidateId: req.params.pcId },
        });
      }
      return rows[0] as
        | { filename: string; mime_type: string; data: Buffer }
        | undefined;
    });
    if (!doc) throw new HttpError(404, 'CV not available');
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.filename.replace(/"/g, '')}"`);
    return res.send(doc.data);
  } catch (err) {
    return next(err);
  }
});
