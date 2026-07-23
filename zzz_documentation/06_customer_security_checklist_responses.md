# Security Checklist — Response & Assessment

**Context.** The security checklist provided is written for applications built
on **Lovable + Supabase**, where the database is exposed through an
auto-generated API and security depends on correctly configured Supabase
policies. The platform architecture we are proposing is **not** built on
Supabase: it is a custom Express/TypeScript API in front of PostgreSQL hosted
on Railway, and the database is never directly reachable from a browser. That
architectural difference resolves several checklist items by construction. The
checklist is *good advice* — none of it is noise — but in this architecture
most items are already implemented, and items 1–3 are continuously re-verified
by an automated test suite rather than checked by hand.

Status legend: ✅ satisfied · 🤝 satisfied, with an action for the account owner
· ⏳ agreed, planned before real confidential data.

## The consultant's six risk areas

| # | Concern (Supabase framing) | Response | Status |
|---|---|---|---|
| A | Missing or overly broad Row Level Security policies | RLS is `ENABLE` + `FORCE` on **every** application table with deny-by-default, hand-written policies per role (anonymous, member, support, admin, client). | ✅ |
| B | Accidentally exposing a secret or service-role key | There is no auto-generated database API and no publishable key. The browser holds **zero** database credentials. Owner credentials are used only by migration/seed scripts from a git-ignored environment file; the running app uses a restricted `NOBYPASSRLS` database role. | ✅ |
| C | Relying on the interface to enforce security | Authorization is enforced three times independently: API middleware, database RLS policies, and a database trigger for privilege changes. Hiding a button protects nothing here either — the database itself refuses unauthorized queries. | ✅ |
| D | Public file-storage buckets | No storage buckets exist. Résumés and photos are stored **inside PostgreSQL** under the same RLS policies as the owning profile. A client company can only read a candidate's CV at the "full" disclosure level. | ✅ |
| E | AI-generated policies that are technically valid but too permissive | Policies are hand-scoped and regression-tested by a 23-assertion verification suite that runs against the live database as the app's own restricted role. The suite is rerun after every schema change. | ✅ |
| F | Sensitive operations running in the browser | All privileged logic runs server-side. Auth tokens are httpOnly cookies (invisible to JavaScript). The payment step is a server-side stub that never touches card data. | ✅ |

## The nine-point minimum checklist

| # | Checklist item | Response | Status |
|---|---|---|---|
| 1 | Turn on RLS for every table, including profile and junction tables | Done, including junction tables. `FORCE` is set so even the table-owner path cannot bypass it. New tables are private until a policy grants access. | ✅ automated |
| 2 | Test the app while logged out and while logged in as a different user | This is exactly what the verification suite does: it exercises the database as an anonymous caller, as two different members, as support staff, as a client company, and as admin — and asserts each sees only what they should. | ✅ automated |
| 3 | Confirm users can only retrieve their own records | Asserted directly: a member sees only their own account row, cannot read or update another member's profile, and cannot read staff notes. Cross-user updates affect 0 rows. | ✅ automated |
| 4 | Search the code for service_role, sb_secret, passwords, Stripe keys | No such keys exist in this stack. The repository contains no credentials: the environment file is git-ignored, the checked-in example ships placeholders only, and production secrets live in the hosting platform's service variables. Re-scan on every review. | ✅ |
| 5 | Keep privileged code out of React/frontend files | All privileged code is in the server-side API (the equivalent of Edge Functions in this architecture). The frontend only calls the API with a session cookie. | ✅ |
| 6 | Review storage bucket policies | N/A — no buckets. Files are RLS-protected database rows. If files later move to object storage for scale, they will be private-only with short-lived signed URLs, never public buckets. | ✅ |
| 7 | Enable two-factor authentication on platform accounts | Applies to the source-control and hosting accounts that control the infrastructure. Action for the account owner: enable 2FA on both. In-app MFA for admin logins is on the pre-production list. | 🤝 owner action |
| 8 | Run a security scan after every meaningful database change | The equivalent here is stronger than a generic scan: the RLS verification suite runs after every migration and fails if any policy regresses. It has already caught one real bug during development. | ✅ automated |
| 9 | Avoid real health/financial/SSN/confidential client data until a professional review | Agreed without reservation. No real confidential data is held during the proof-of-concept phase. Before real candidate dossiers (compensation, interview notes) are stored: professional security review, plus email verification, password reset, MFA, and token revocation. | ⏳ gate before launch |

## What "already automated" means (and what it does not)

Items 1–3 are not *dismissed* — they are *implemented and re-checked by code*
on every schema change, which is more reliable than a one-time manual review.
However, the automated suite proves the policies do what **we** intended; it
cannot prove our intentions are complete. That is why item 9 stands: an
independent professional review remains the gate before real confidential
executive-search data enters the system.

## Executive-search readiness

The consultant's closing paragraph — résumés, compensation, interview notes,
rankings, client information — is the direction this architecture already
anticipates:

- **Client role**: client-company users see only their own company's
  positions and candidate slates. Company assignment is admin-only, guarded at
  the database-trigger level like role changes.
- **Disclosure ladder**: candidates appear to client companies as *anonymous*
  (summary only) → *identified* (name + profile) → *full* (adds CV), controlled
  per-candidate by admins and enforced by row-level security — not by the UI.
- **Read auditing**: staff profile views, staff CV downloads, client slate
  views, and client CV downloads are all written to an append-only audit log.
- **Narrowed support visibility**: support staff have no access to recruiting
  tables. Future compensation and interview-note tables should follow the same
  pattern: separate tables, strictest-possible policies, read-audited.
