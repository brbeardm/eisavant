import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { config } from '../config.js';
import { logAudit } from '../db/audit.js';
import { ANON, setContext, withContext } from '../db/pool.js';
import { AUTH_COOKIE, cookieOptions, issueToken, requireAuth, type AppRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { CV_MIME_TYPES, PHOTO_MIME_TYPES, loginSchema, registerSchema } from '../validation/schemas.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts — please try again later' },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxCvBytes, files: 2 },
});

const registrationUpload = upload.fields([
  { name: 'cv', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
]);

function validateUpload(
  file: Express.Multer.File | undefined,
  kind: 'cv' | 'profile_photo',
): Express.Multer.File | null {
  if (!file) return null;
  const allowed = kind === 'cv' ? CV_MIME_TYPES : PHOTO_MIME_TYPES;
  const maxBytes = kind === 'cv' ? config.maxCvBytes : config.maxPhotoBytes;
  if (!allowed.has(file.mimetype)) {
    throw new HttpError(400, `Unsupported ${kind === 'cv' ? 'CV' : 'photo'} file type`);
  }
  if (file.size > maxBytes) {
    throw new HttpError(400, `${kind === 'cv' ? 'CV' : 'Photo'} exceeds the size limit`);
  }
  return file;
}

authRouter.post('/register', authLimiter, registrationUpload, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const cv = validateUpload(files?.cv?.[0], 'cv');
    const photo = validateUpload(files?.photo?.[0], 'profile_photo');

    const passwordHash = await bcrypt.hash(body.password, 12);

    const user = await withContext(ANON, async (client) => {
      // Insert as anon — RLS only permits role='ceo', status='pending_payment'.
      // The id is generated app-side because anon has no SELECT policy on
      // users, and Postgres applies SELECT policies to RETURNING rows.
      const userId = crypto.randomUUID();
      await client.query(
        `INSERT INTO users (id, email, password_hash, role, status)
         VALUES ($1, $2, $3, 'ceo', 'pending_payment')`,
        [userId, body.email, passwordHash],
      );

      // The rest of the registration writes as the newly created member.
      await setContext(client, { userId, role: 'ceo' });

      await client.query(
        `INSERT INTO profiles (
           user_id, first_name, last_name, title, company, industry,
           company_size, country, phone, linkedin_url, website, bio,
           coaching_goals, referral_source
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          userId, body.firstName, body.lastName, body.title, body.company,
          body.industry, body.companySize, body.country, body.phone,
          body.linkedinUrl, body.website, body.bio, body.coachingGoals,
          body.referralSource,
        ],
      );

      for (const [kind, file] of [['cv', cv], ['profile_photo', photo]] as const) {
        if (!file) continue;
        await client.query(
          `INSERT INTO documents (user_id, kind, filename, mime_type, size_bytes, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, kind, file.originalname, file.mimetype, file.size, file.buffer],
        );
      }

      await logAudit(client, { actorUserId: userId, action: 'user.registered', targetUserId: userId });
      return { id: userId, role: 'ceo' as AppRole };
    });

    res.cookie(AUTH_COOKIE, issueToken(user), cookieOptions());
    return res.status(201).json({ id: user.id, role: user.role });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const row = await withContext(ANON, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM get_login_credentials($1)`,
        [email],
      );
      return rows[0] as
        | { id: string; password_hash: string; role: AppRole; status: string; client_company_id: string | null }
        | undefined;
    });

    // Constant-shape failure: same error whether the email or password is wrong.
    const ok = row && (await bcrypt.compare(password, row.password_hash));
    if (!ok) throw new HttpError(401, 'Invalid email or password');
    if (row.status === 'suspended') throw new HttpError(403, 'This account is suspended');

    await withContext({ userId: row.id, role: row.role, companyId: row.client_company_id }, (client) =>
      logAudit(client, { actorUserId: row.id, action: 'user.login', targetUserId: row.id }),
    );

    res.cookie(
      AUTH_COOKIE,
      issueToken({ id: row.id, role: row.role, companyId: row.client_company_id }),
      cookieOptions(),
    );
    return res.json({ id: row.id, role: row.role });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  return res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const me = await withContext({ userId: req.user!.id, role: req.user!.role }, async (client) => {
      const { rows } = await client.query(
        `SELECT u.id, u.email, u.role, u.status, u.client_company_id, p.first_name, p.last_name,
                EXISTS (
                  SELECT 1 FROM documents d
                  WHERE d.user_id = u.id AND d.kind = 'profile_photo'
                ) AS has_photo
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
         WHERE u.id = $1`,
        [req.user!.id],
      );
      return rows[0];
    });
    if (!me) throw new HttpError(401, 'Account no longer exists');
    return res.json(me);
  } catch (err) {
    return next(err);
  }
});
