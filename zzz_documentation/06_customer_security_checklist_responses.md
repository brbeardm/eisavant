# Securing the Current Lovable + Supabase Application — Point-by-Point Response

**Scope.** This document responds to the security checklist for the existing
Lovable + Supabase application in DEV. The recommendation is to **stay on
Lovable + Supabase** and harden the current build. Each point below maps to a
concrete fix, verification step, or operating practice on that stack — no
re-platforming is proposed.

---

## Part 1 — The six risk areas: how to fix each in the current app

### A. Missing or overly broad Row Level Security policies

**Fix in Supabase:**
1. Find every exposed table with RLS off:
   ```sql
   SELECT schemaname, tablename FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename NOT IN (
       SELECT tablename FROM pg_tables t
       JOIN pg_class c ON c.relname = t.tablename
       WHERE c.relrowsecurity
     );
   ```
   (Supabase's **Security Advisor** in the dashboard flags these too.)
2. Enable RLS on each: `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;`
   A table with RLS on and **no policies** returns nothing — safe by default.
3. Write one policy **per operation** (SELECT / INSERT / UPDATE / DELETE), not
   a single `FOR ALL`, and scope each to `auth.uid()`:
   ```sql
   CREATE POLICY "read own rows" ON public.profiles
     FOR SELECT USING (auth.uid() = user_id);
   CREATE POLICY "update own rows" ON public.profiles
     FOR UPDATE USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
   ```
4. Treat `USING (true)` as a red flag: acceptable only for intentionally
   public, read-only content (e.g., published testimonials), never on writes.

### B. Accidentally exposing a secret or service-role key

**Fix in Supabase / Lovable:**
1. Confirm the frontend uses **only** the anon/publishable key. That key is
   safe to ship *provided RLS is correct* (which is why Part A comes first).
2. Search the Lovable project code **and prompt history** for `service_role`,
   `sb_secret`, and any pasted keys — keys pasted into prompts can end up in
   generated code.
3. If the service-role key has ever appeared in frontend code or a prompt,
   **rotate it now**: Supabase Dashboard → Settings → API → rotate.
4. The service-role key may live only in Supabase **Edge Function secrets**
   (`supabase secrets set`), never in anything the browser downloads.

### C. Relying on the interface to enforce security

**Fix in Supabase:**
1. Assume every user can call the auto-generated REST API directly with the
   anon key — the UI is not a security boundary.
2. Re-express every "admin-only" or "owner-only" rule that currently exists
   only as a hidden button/page as an RLS policy or an Edge Function check.
3. For role-based rules, keep a `user_roles` table (itself RLS-protected) and
   check it inside policies via a `SECURITY DEFINER` helper:
   ```sql
   CREATE FUNCTION public.is_admin() RETURNS boolean
   LANGUAGE sql SECURITY DEFINER STABLE
   AS $$ SELECT EXISTS (SELECT 1 FROM user_roles
                        WHERE user_id = auth.uid() AND role = 'admin') $$;
   ```
   Never trust a role value sent from the client.

### D. Public file-storage buckets

**Fix in Supabase Storage:**
1. Inventory buckets (Dashboard → Storage). Set every bucket holding résumés,
   client files, or member documents to **private**.
2. Add policies on `storage.objects` so users reach only their own folder,
   using the convention that uploads go under `auth.uid()/...`:
   ```sql
   CREATE POLICY "own files" ON storage.objects
     FOR SELECT USING (
       bucket_id = 'resumes'
       AND (storage.foldername(name))[1] = auth.uid()::text
     );
   ```
   (Mirror the same check on INSERT/UPDATE/DELETE with `WITH CHECK`.)
3. When a file must be shared (e.g., staff reviewing a résumé), generate a
   **short-lived signed URL** (`createSignedUrl`, minutes not days) — never
   flip the bucket to public.

### E. AI-generated policies that are technically valid but too permissive

**Fix / verification practice:**
1. Manually review every policy Lovable generated: does each table have
   separate, scoped policies for all four operations? Do UPDATE/INSERT
   policies include `WITH CHECK`? Is there any `USING (true)` on private data?
2. Run both **Lovable's security scan** and **Supabase's Security Advisor**
   after changes — and treat them as smoke detectors, not sign-off.
3. Add a repeatable policy test (see checklist item 2 below) so permissiveness
   regressions are caught when Lovable regenerates or edits schema.

### F. Sensitive operations running in the browser

**Fix in Supabase:**
1. Move payments, admin mutations, and any third-party API call that uses a
   secret (Stripe, email, AI providers) into **Edge Functions**.
2. Store those credentials as function secrets (`supabase secrets set`);
   verify the caller's JWT inside the function before acting.
3. The browser should only ever hold: the anon key, the user's own session
   token, and calls to Edge Functions / RLS-protected tables.

---

## Part 2 — The nine-point minimum checklist, applied to the DEV app

| # | Checklist item | Action on the current Lovable + Supabase app |
|---|---|---|
| 1 | Turn on RLS for every table, including profile and junction tables | Run the audit query from Part A; enable RLS everywhere, **including** junction/link tables (they leak relationships even when the main tables are locked). Add scoped per-operation policies. Re-check Security Advisor until it reports zero unprotected tables. |
| 2 | Test the app logged out and as a different user | Create two throwaway test accounts. Test three ways: (a) the UI logged out, (b) the UI as user B trying to reach user A's data, and (c) **directly against the REST API** with the anon key and with user B's JWT (curl/Postman) — attackers use the API, not the UI. Script these calls so they can be rerun after every change. |
| 3 | Confirm users can only retrieve their own records | Using user B's session in the API tests above, attempt `select` on user A's rows in every table (profiles, documents, payments, notes, junctions). Expect zero rows everywhere. Any row returned = a policy to fix before anything else ships. |
| 4 | Search the code for service_role, sb_secret, passwords, Stripe keys | Search the repository, Lovable-generated files, environment files, **and Lovable prompt history** for `service_role`, `sb_secret`, `sk_live`, `password`, `api_key`. Anything found in frontend-reachable code: remove it, move it to Edge Function secrets, and **rotate the exposed key**. |
| 5 | Keep privileged code in Edge Functions, not React files | Inventory every place the frontend writes data or calls an external service. Anything requiring elevated rights or a secret becomes an Edge Function; the React code calls the function with the user's JWT and receives only what that user may see. |
| 6 | Review Supabase Storage bucket policies | Set résumé/document buckets to private; add per-user `storage.objects` policies (Part D); replace any public URLs already shared with signed URLs; confirm no bucket holding member data is public. |
| 7 | Enable two-factor authentication | Turn on 2FA for the **Lovable account** and the **Supabase account** (and GitHub, if the project syncs there). Also enable Supabase Auth's leaked-password protection and email confirmation for app users while in that settings area. |
| 8 | Run Lovable's security scan after every meaningful database change | Make it a standing rule: schema change → run Lovable security scan → run Supabase Security Advisor → rerun the item-2/3 API test script. Keep the checklist in the repo so it survives team changes. |
| 9 | No real health/financial/SSN/confidential client data before a professional review | Keep DEV on synthetic data only. Before real candidate résumés, compensation, interview notes, rankings, or client information enter the system: commission an independent security review of the Supabase policies, enable database backups/PITR, and turn on the auth hardening from item 7. |

---

## Part 3 — Because this is an executive-search application

The consultant is right to classify it as a **confidential-data application**.
Beyond the checklist, three practices fit the data it will hold, all within
Supabase:

1. **Separate the most sensitive data.** Keep compensation, interview notes,
   and rankings in their own tables with the strictest policies (staff-only),
   rather than as columns on a general profile table — so one permissive
   profile policy can never expose them.
2. **Audit access.** Add an append-only audit table (insert-only policy)
   written by triggers or Edge Functions for sensitive reads/writes — who
   viewed a candidate's compensation or downloaded a résumé, and when.
3. **Disclose progressively to clients.** If client companies will view
   candidates, gate identity/CV visibility per candidate through a junction
   table checked in RLS — anonymous summary first, identity and documents only
   when explicitly raised — so disclosure is a database rule, not a UI
   convention.

**Bottom line:** the current Lovable + Supabase app can absolutely be made
production-grade for this use case. The sequence that matters: lock down RLS
(items 1–3) → sweep and rotate secrets (4) → move privileged logic to Edge
Functions (5) → close storage (6) → then the operating habits (7–8) — and hold
the line on item 9 until an independent review passes.
