import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { logAudit } from '../db/audit.js';
import { withContext } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { CV_MIME_TYPES, PHOTO_MIME_TYPES, profileUpdateSchema } from '../validation/schemas.js';

export const profileRouter = Router();
profileRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxCvBytes, files: 1 },
});

const PROFILE_COLUMNS: Record<string, string> = {
  firstName: 'first_name',
  lastName: 'last_name',
  title: 'title',
  company: 'company',
  industry: 'industry',
  companySize: 'company_size',
  country: 'country',
  phone: 'phone',
  linkedinUrl: 'linkedin_url',
  website: 'website',
  bio: 'bio',
  coachingGoals: 'coaching_goals',
  referralSource: 'referral_source',
};

profileRouter.get('/', async (req, res, next) => {
  try {
    const ctx = { userId: req.user!.id, role: req.user!.role };
    const profile = await withContext(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT u.email, u.role, u.status, u.created_at, p.*,
                (SELECT filename FROM documents d WHERE d.user_id = u.id AND d.kind = 'cv') AS cv_filename,
                EXISTS (SELECT 1 FROM documents d WHERE d.user_id = u.id AND d.kind = 'profile_photo') AS has_photo,
                (SELECT plan FROM payments pay WHERE pay.user_id = u.id ORDER BY pay.created_at DESC LIMIT 1) AS selected_plan
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
         WHERE u.id = $1`,
        [req.user!.id],
      );
      return rows[0];
    });
    if (!profile) throw new HttpError(404, 'Profile not found');
    return res.json(profile);
  } catch (err) {
    return next(err);
  }
});

profileRouter.put('/', async (req, res, next) => {
  try {
    const updates = profileUpdateSchema.parse(req.body);
    const entries = Object.entries(updates).filter(([k]) => PROFILE_COLUMNS[k]);
    if (entries.length === 0) throw new HttpError(400, 'No valid fields to update');

    const setClauses = entries.map(([k], i) => `${PROFILE_COLUMNS[k]} = $${i + 2}`);
    const values = entries.map(([, v]) => v);

    const ctx = { userId: req.user!.id, role: req.user!.role };
    const updated = await withContext(ctx, async (client) => {
      const { rows } = await client.query(
        `UPDATE profiles SET ${setClauses.join(', ')} WHERE user_id = $1 RETURNING *`,
        [req.user!.id, ...values],
      );
      await logAudit(client, {
        actorUserId: req.user!.id,
        action: 'profile.updated',
        targetUserId: req.user!.id,
        details: { fields: entries.map(([k]) => k) },
      });
      return rows[0];
    });
    if (!updated) throw new HttpError(404, 'Profile not found');
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

function documentGuards(kind: 'cv' | 'profile_photo') {
  return kind === 'cv'
    ? { allowed: CV_MIME_TYPES, maxBytes: config.maxCvBytes, label: 'CV' }
    : { allowed: PHOTO_MIME_TYPES, maxBytes: config.maxPhotoBytes, label: 'Photo' };
}

for (const kind of ['cv', 'profile_photo'] as const) {
  const path = kind === 'cv' ? '/cv' : '/photo';
  const { allowed, maxBytes, label } = documentGuards(kind);

  profileRouter.put(path, upload.single('file'), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) throw new HttpError(400, `${label} file is required`);
      if (!allowed.has(file.mimetype)) throw new HttpError(400, `Unsupported ${label} file type`);
      if (file.size > maxBytes) throw new HttpError(400, `${label} exceeds the size limit`);

      const ctx = { userId: req.user!.id, role: req.user!.role };
      await withContext(ctx, async (client) => {
        await client.query(
          `INSERT INTO documents (user_id, kind, filename, mime_type, size_bytes, data)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, kind) DO UPDATE SET
             filename = EXCLUDED.filename,
             mime_type = EXCLUDED.mime_type,
             size_bytes = EXCLUDED.size_bytes,
             data = EXCLUDED.data,
             uploaded_at = now()`,
          [req.user!.id, kind, file.originalname, file.mimetype, file.size, file.buffer],
        );
        await logAudit(client, {
          actorUserId: req.user!.id,
          action: `document.uploaded.${kind}`,
          targetUserId: req.user!.id,
          details: { filename: file.originalname, size: file.size },
        });
      });
      return res.json({ ok: true, filename: file.originalname });
    } catch (err) {
      return next(err);
    }
  });

  // Streams the caller's own file. Staff access members' files through the
  // admin router, which applies the same RLS but different authorization.
  profileRouter.get(path, async (req, res, next) => {
    try {
      const ctx = { userId: req.user!.id, role: req.user!.role };
      const doc = await withContext(ctx, async (client) => {
        const { rows } = await client.query(
          `SELECT filename, mime_type, data FROM documents WHERE user_id = $1 AND kind = $2`,
          [req.user!.id, kind],
        );
        return rows[0] as { filename: string; mime_type: string; data: Buffer } | undefined;
      });
      if (!doc) throw new HttpError(404, `No ${label} uploaded`);
      res.setHeader('Content-Type', doc.mime_type);
      res.setHeader(
        'Content-Disposition',
        `${kind === 'cv' ? 'attachment' : 'inline'}; filename="${doc.filename.replace(/"/g, '')}"`,
      );
      return res.send(doc.data);
    } catch (err) {
      return next(err);
    }
  });
}
