# Security Model

## Principles

1. **Defense in depth** — authorization is enforced independently at the API
   layer (middleware) and the database layer (RLS + triggers). Both must fail
   for a data leak.
2. **Least privilege** — the app's database role can only do what the grants
   allow; owner credentials never serve traffic.
3. **Deny by default** — RLS means a table with no matching policy returns
   nothing; new tables are private until a policy says otherwise.

## Application roles

| Role | Granted to | Capabilities |
| --- | --- | --- |
| `ceo` | Every self-registered member | Manage own profile, documents, plan selection. |
| `support` | Staff (assigned by admin) | Read all member profiles/CVs/payments; add internal support notes. Cannot modify accounts. |
| `admin` | Platform operators | Everything support can, plus change roles/status, curate testimonials, read the audit log, delete accounts. |

Role changes are triple-guarded: admin-only API route, RLS update policy, and
the `guard_privileged_columns` trigger.

## Authentication

- Passwords hashed with **bcrypt (cost 12)**; policy: ≥10 chars with upper,
  lower, and digit (zod-enforced server-side, mirrored client-side).
- Session: JWT (2 h expiry) carrying `{sub, role}` in an **httpOnly,
  SameSite=Lax cookie**, `Secure` in production. No tokens in localStorage.
- Login returns the identical error for unknown email vs wrong password, and
  auth endpoints are rate-limited (20 attempts / 15 min / IP).
- Suspended accounts are refused at login.

## Input & upload hardening

- Every body is validated with zod; unknown profile fields are ignored via an
  explicit column allow-list (no mass assignment).
- All SQL uses parameterized queries; the two dynamic fragments (profile
  update, admin patch) build column lists only from hard-coded maps.
- Uploads: MIME allow-list (CV: pdf/doc/docx; photo: jpeg/png/webp), size caps
  (5 MB / 2 MB), multer memory storage, stored as `bytea` under RLS. Filenames
  are quoted/sanitized in `Content-Disposition` on download.
- `helmet` sets CSP and standard hardening headers; JSON body limit 100 kB;
  `trust proxy` matches Railway's TLS-terminating edge.

## Auditability

`audit_log` (append-only, admin-read-only) records registration, logins,
profile and document changes, plan selections, admin account changes, and
support notes — with actor, target, and details JSON.

## Payment stub — explicit boundary

The registration flow includes plan selection and a Pay button. The button
calls `POST /api/payments/intent`, which **only records the chosen plan**
(`status='stub_pending'`) and returns a notice. There is deliberately no card
form, no processor SDK, and no code path that could transmit payment data.
When a real processor is added, keep card data out of this system entirely
(hosted checkout / tokenization) and flip `users.status` via webhook.

## Known gaps (accepted for POC — address before production)

- No email verification or password-reset flow.
- No MFA (recommended for admin accounts at minimum).
- JWTs are stateless — no server-side revocation before expiry.
- TLS certificate verification to Postgres is relaxed (`rejectUnauthorized:
  false`) because Railway's proxy presents a self-signed chain; pin the CA when
  Railway exposes one.
- Secrets live in Railway environment variables; consider a secret manager as
  the team grows.
