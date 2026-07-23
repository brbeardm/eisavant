# Deployment — Railway & eisavant.com

## Topology

Railway project **eisavant** (`44090689-f363-4f39-8658-5ea921b77179`):

- **Postgres** — PostgreSQL 18 with volume (created via `railway add --database postgres`).
- **app** — Node service built from this repo (`railway.json`: Nixpacks,
  `npm install && npm run build`, `npm start`, healthcheck `/api/health`).

The Express server serves both `/api/*` and the built SPA, so one service and
one domain cover the whole site.

## Required service variables (app service)

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference; internal network) — used only if you run migrations from the service. |
| `APP_DATABASE_URL` | `postgresql://eisavant_app:<APP_DB_PASSWORD>@postgres.railway.internal:5432/railway` |
| `APP_DB_PASSWORD` | Password for `eisavant_app` (migration runner syncs it). |
| `JWT_SECRET` | 64+ random characters. |
| `NODE_ENV` | `production` |

`PORT` is injected by Railway automatically.

## Deploying

Push to `main` on GitHub with the repo connected to the service (or run
`railway up --service app` from the repo root). Build + start come from
`railway.json`.

### Migrations

Run from a developer machine against the **public** proxy URL:

```bash
# .env carries DATABASE_URL (public proxy) + APP_DB_PASSWORD
npm run migrate
npm run seed        # first time only: creates the admin account
cd server && npx tsx src/scripts/verify-rls.ts
```

(Alternatively run them as a Railway one-off with the internal URL.)

## Custom domain: eisavant.com

1. Railway dashboard → app service → **Settings → Networking → Custom Domain**
   → add `eisavant.com` (and `www.eisavant.com` if desired).
2. Railway shows a CNAME target (e.g. `xxxx.up.railway.app`). At your DNS
   provider add:
   - `www` → CNAME → the Railway target.
   - Apex `eisavant.com`: use your provider's CNAME-flattening/ALIAS/ANAME to
     the same target (Cloudflare, Namecheap, Route 53 all support this).
3. Railway provisions TLS automatically once DNS propagates.
4. The auth cookie is `Secure` in production, so the site must be served over
   HTTPS (Railway handles this).

## Operational notes

- **Logs**: `railway logs --service app`.
- **Rollback**: redeploy a previous deployment from the dashboard.
- **DB credential rotation**: change `APP_DB_PASSWORD`, re-run `npm run migrate`
  (it syncs the role password), update `APP_DATABASE_URL`, redeploy.
- **Backups**: enable Railway Postgres backups in the dashboard before real
  member data arrives.
