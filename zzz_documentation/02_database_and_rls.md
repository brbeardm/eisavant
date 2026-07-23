# Database & Row-Level Security

Database: PostgreSQL 18 on Railway (`eisavant` project, `Postgres` service).
Schema is applied by `server/src/db/migrate.ts` from `server/src/db/migrations/`.

## Postgres roles

| Role | Used by | Powers |
| --- | --- | --- |
| `postgres` | `npm run migrate`, `npm run seed` only | Owner; bypasses RLS. Never used by the app. |
| `eisavant_app` | The Express API (`APP_DATABASE_URL`) | `LOGIN NOBYPASSRLS NOSUPERUSER`; table grants only; **every query passes RLS**. |

The migration runner creates/updates `eisavant_app` using the `APP_DB_PASSWORD`
environment variable.

## Session identity

The API binds the authenticated caller to the connection per-transaction:

```sql
SELECT set_config('app.user_id', '<uuid-or-empty>', true),
       set_config('app.role',    'anon|ceo|support|admin', true);
```

Two helper functions are the single source of truth inside policies:

- `app_user_id()` → uuid or NULL
- `app_role()` → text, defaults to `'anon'`

`app.role` is set from the **verified JWT**, never from client input.

## Tables

| Table | Purpose |
| --- | --- |
| `users` | Credentials, application role (`ceo`/`support`/`admin`), account status (`pending_payment`/`active`/`suspended`). |
| `profiles` | Executive profile: name, title, company, industry, size, country, phone, LinkedIn, website, bio, coaching goals, referral source. |
| `documents` | CV (pdf/doc/docx ≤ 5 MB) and profile photo (jpeg/png/webp ≤ 2 MB) as `bytea`; one of each per user. |
| `testimonials` | Homepage testimonials (fictional placeholders in the seed). |
| `payments` | **Stub** plan-selection records; status is always `stub_pending`; no card data columns exist. |
| `support_notes` | Internal staff notes about a member; members can never read them. |
| `audit_log` | Append-only trail of registrations, logins, profile/document changes, admin actions. |
| `schema_migrations` | Migration bookkeeping (no RLS; not granted to the app role). |

## Policy matrix

`ENABLE` + `FORCE ROW LEVEL SECURITY` is set on every application table.

| Table | anon | ceo (member) | support | admin |
| --- | --- | --- | --- | --- |
| users | INSERT only (`role='ceo'`, `status='pending_payment'`) | SELECT/UPDATE own row¹ | SELECT all | ALL |
| profiles | — | SELECT/INSERT/UPDATE own | SELECT all | ALL |
| documents | — | SELECT/INSERT/UPDATE/DELETE own | SELECT all | ALL |
| testimonials | SELECT published | SELECT published | SELECT published | ALL |
| payments | — | SELECT/INSERT own | SELECT all | ALL |
| support_notes | — | — | SELECT + INSERT (as self) | + DELETE |
| audit_log | INSERT | INSERT | INSERT | + SELECT |

¹ A `BEFORE UPDATE` trigger (`guard_privileged_columns`) additionally rejects any
change to `users.role` or `users.status` unless `app_role() = 'admin'` — RLS
policies cannot compare OLD/NEW, so privilege escalation is blocked at the
trigger layer.

### Special cases worth knowing

- **Login**: anon cannot SELECT from `users`. The `SECURITY DEFINER` function
  `get_login_credentials(email)` is the one narrow path that returns the
  password hash for a single email; bcrypt comparison happens in the API.
- **Registration & RETURNING**: Postgres applies SELECT policies to `RETURNING`
  rows. Since anon has no SELECT policy on `users`, the API generates the user
  UUID client-side and inserts without `RETURNING`, then re-binds the session to
  the new user for the profile/document inserts in the same transaction.
- **Silent denials**: UPDATE/DELETE against rows hidden by RLS affect **0 rows**
  rather than erroring. The API treats 0-row mutations as not-found/denied.

## Verification

`server/src/scripts/verify-rls.ts` is a 16-assertion suite that runs against the
live database **as the app role** and proves, among other things:

- anon sees zero user rows but can register a pending CEO — and cannot insert an admin;
- a member sees only their own row, cannot read or update another member's
  profile, and cannot self-escalate role;
- support can read all members but cannot change roles or delete;
- only admin can read `audit_log`.

Run it after every schema change:

```bash
cd server && npx tsx src/scripts/verify-rls.ts
```

## Migrations

- Files run in filename order, once each, tracked in `schema_migrations`, each
  in its own transaction.
- Add a new file (e.g. `003_add_x.sql`) — never edit an applied migration.
- `npm run migrate` requires `DATABASE_URL` (owner) + `APP_DB_PASSWORD`.
