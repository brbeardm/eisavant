# Architecture

## Overview

Eisavant is a monorepo with two npm workspaces deployed as a **single Railway
service** in front of a Railway PostgreSQL database.

```
┌────────────────────────────── Railway project: eisavant ─────────────────────────────┐
│                                                                                      │
│  ┌───────────── app service ─────────────┐        ┌────────── Postgres ───────────┐  │
│  │  Express (Node 20+, TypeScript)       │        │  PostgreSQL 18                │  │
│  │  ├── /api/*  JSON API                 │─ TCP ─▶│  RLS on every table           │  │
│  │  └── /*      static React SPA         │        │  roles: postgres (owner),     │  │
│  │      (client/dist, built by Vite)     │        │         eisavant_app (app)    │  │
│  └───────────────────────────────────────┘        └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────┘
        ▲
        │ HTTPS (Railway edge, custom domain eisavant.com)
   Browser (responsive React SPA)
```

## Repository layout

```
├── client/                 React 18 + Vite + TypeScript SPA
│   └── src/
│       ├── pages/          Home, Register, Login, Dashboard, Admin, AdminUserDetail
│       ├── components/     Layout (nav/footer), Avatar
│       ├── api.ts          fetch wrapper (cookie credentials, error typing)
│       └── auth.tsx        session context (GET /api/auth/me)
├── server/                 Express + TypeScript API
│   └── src/
│       ├── index.ts        app entry; serves client/dist in production
│       ├── config.ts       env validation
│       ├── db/
│       │   ├── pool.ts     withContext(): binds user identity to Postgres session
│       │   ├── migrate.ts  migration runner (owner credentials only)
│       │   └── migrations/ 001_init.sql (schema + RLS), 002_seed_testimonials.sql
│       ├── middleware/     auth (JWT cookie), errors
│       ├── routes/         auth, profile, testimonials, payments (stub), admin
│       ├── validation/     zod schemas + upload MIME allow-lists
│       └── scripts/        seed.ts (admin bootstrap), verify-rls.ts (RLS test suite)
├── zzz_documentation/      this documentation
├── railway.json            Railway build/deploy config
└── package.json            npm workspaces + top-level scripts
```

## Key decisions

| Decision | Rationale |
| --- | --- |
| Single service serves API **and** SPA | One deploy, one domain, no CORS surface; cookies are first-party. |
| Files (CV/photo) stored as `bytea` in Postgres | The same RLS policies that protect profile rows protect the files. Right-sized for a POC; move to object storage (S3/R2) with signed URLs at scale. |
| RLS enforced in the database, roles enforced in the API | Two independent layers must both fail for a data leak (see security model doc). |
| App connects as `eisavant_app`, never as `postgres` | Superusers/table owners bypass RLS. Only the migration runner and seed script use owner credentials. |
| JWT in httpOnly cookie (not localStorage) | Immune to token theft via XSS; SameSite=Lax mitigates CSRF for state-changing POSTs. |
| Payment stub records intent only | Lets the whole registration UX be exercised with zero PCI exposure. |

## Request lifecycle

1. Browser calls `/api/...` with the `eisavant_token` cookie.
2. `requireAuth` verifies the JWT and attaches `{ id, role }` to the request.
3. Route handler validates input with zod.
4. `withContext({userId, role}, fn)` opens a transaction and runs
   `set_config('app.user_id', …), set_config('app.role', …)`.
5. Every SQL statement inside runs under RLS policies that read those settings.
6. Mutations append to `audit_log` in the same transaction.
