# API Reference

Base URL: `/api`. All responses are JSON. Authenticated routes require the
`eisavant_token` httpOnly cookie (set by register/login). Errors:
`{ "error": string, "details?": [{field, message}] }`.

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | — | `{status:'ok'}` if DB reachable, else 503. |

## Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | — (rate-limited) | Multipart. Fields: `email`, `password`, `firstName`, `lastName`, + optional profile fields (`title`, `company`, `industry`, `companySize`, `country`, `phone`, `linkedinUrl`, `website`, `bio`, `coachingGoals`, `referralSource`) + optional files `cv`, `photo`. Creates a `ceo`/`pending_payment` account, signs the caller in. 201 → `{id, role}`. |
| POST | `/auth/login` | — (rate-limited) | `{email, password}` → sets cookie, `{id, role}`. 401 on bad credentials, 403 if suspended. |
| POST | `/auth/logout` | — | Clears the cookie. |
| GET | `/auth/me` | any | `{id, email, role, status, first_name, last_name}`. |

## Profile (member self-service)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/profile` | any | Own account + profile + `cv_filename`, `has_photo`, `selected_plan`. |
| PUT | `/profile` | any | Partial update of profile fields (camelCase keys as in register). |
| PUT | `/profile/cv` | any | Multipart `file` (pdf/doc/docx ≤ 5 MB). Upserts. |
| GET | `/profile/cv` | any | Downloads own CV (attachment). |
| PUT | `/profile/photo` | any | Multipart `file` (jpeg/png/webp ≤ 2 MB). Upserts. |
| GET | `/profile/photo` | any | Streams own photo (inline). |

## Testimonials

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/testimonials` | — | Published testimonials for the homepage. |

## Payments (stub)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/payments/plans` | any | The two plans: `one_time` ($2,500) and `subscription` ($1,500/mo). |
| POST | `/payments/intent` | any | `{plan}` → records a `stub_pending` payment row and returns 202 with an explanatory `message`. **No processing occurs; this is the stub boundary.** |

## Admin & support (`support` or `admin` unless noted)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/admin/users` | staff | All members with profile summary. |
| GET | `/admin/users/:id` | staff | Full detail + support notes + payment records. |
| PATCH | `/admin/users/:id` | **admin** | `{role?, status?}`. Self-demotion blocked. |
| POST | `/admin/users/:id/notes` | staff | `{note}` → internal support note. |
| GET | `/admin/users/:id/cv` | staff | Download a member's CV. |
| GET | `/admin/audit` | **admin** | Latest 200 audit entries. |
