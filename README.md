# Eisavant — CEO Coaching & Mentoring Platform (POC)

Proof-of-concept membership platform for **eisavant.com**: prominent-CEO testimonials,
executive registration with CV/photo upload, member profile management, admin/support
tooling, and a stubbed payment step — all backed by PostgreSQL **row-level security**
on Railway.

## Stack

| Layer    | Technology                                                     |
| -------- | -------------------------------------------------------------- |
| Frontend | React 18 + TypeScript + Vite (responsive SPA, `client/`)        |
| Backend  | Node.js + Express + TypeScript (`server/`)                      |
| Database | PostgreSQL 18 on Railway, RLS enforced for every query          |
| Auth     | bcrypt + JWT in httpOnly cookies; roles: `ceo`, `support`, `admin` |
| Hosting  | Railway (single service serves API + built SPA)                 |

## Quick start (local)

```bash
npm install
copy .env.example .env        # fill in real values
npm run migrate               # creates schema, RLS policies, app DB role
npm run seed                  # creates the initial admin account
npm run dev                   # API on :8080, Vite dev server on :5173
```

Verify the row-level security policies against the live database at any time:

```bash
cd server && npx tsx src/scripts/verify-rls.ts
```

## Documentation

All project documentation lives in [`zzz_documentation/`](zzz_documentation/):

1. [Architecture](zzz_documentation/01_architecture.md)
2. [Database & row-level security](zzz_documentation/02_database_and_rls.md)
3. [Security model](zzz_documentation/03_security_model.md)
4. [API reference](zzz_documentation/04_api_reference.md)
5. [Deployment (Railway + eisavant.com)](zzz_documentation/05_deployment_railway.md)

## Status / intentional POC limits

- **Payments are stubbed**: plan selection is recorded, the Pay button stops short of
  any processor call. No card data is ever collected.
- Aside from D. Brian Beardmore's, the homepage testimonials are **fictional
  placeholders** — replace with licensed, consented testimonials before launch.
- Email verification and password reset are not yet implemented.
