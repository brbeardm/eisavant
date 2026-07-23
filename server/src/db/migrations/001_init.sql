-- ============================================================================
-- eisavant.com — initial schema with row-level security
--
-- Security model
--   * The application NEVER connects as the table owner. It connects as
--     `eisavant_app` (created by the migration runner, NOBYPASSRLS), so every
--     policy below is enforced on every query.
--   * Per-request identity is bound with set_config('app.user_id', ...) and
--     set_config('app.role', ...) inside a transaction (see server/src/db/pool.ts).
--   * app.role is one of: anon | ceo | support | admin.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ----------------------------------------------------------------------------
-- Session helpers: single source of truth for "who is asking".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.role', true), ''), 'anon')
$$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  password_hash text   NOT NULL,
  role          text   NOT NULL DEFAULT 'ceo'
                CHECK (role IN ('ceo', 'support', 'admin')),
  status        text   NOT NULL DEFAULT 'pending_payment'
                CHECK (status IN ('pending_payment', 'active', 'suspended')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  title           text NOT NULL DEFAULT '',
  company         text NOT NULL DEFAULT '',
  industry        text NOT NULL DEFAULT '',
  company_size    text NOT NULL DEFAULT '',
  country         text NOT NULL DEFAULT '',
  phone           text NOT NULL DEFAULT '',
  linkedin_url    text NOT NULL DEFAULT '',
  website         text NOT NULL DEFAULT '',
  bio             text NOT NULL DEFAULT '',
  coaching_goals  text NOT NULL DEFAULT '',
  referral_source text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- CVs and profile photos, stored in-database so the same RLS policies that
-- protect profile data protect the files (appropriate at POC scale).
CREATE TABLE documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('cv', 'profile_photo')),
  filename    text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  integer NOT NULL,
  data        bytea NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind)
);

CREATE TABLE testimonials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ceo_name      text NOT NULL,
  ceo_title     text NOT NULL,
  company       text NOT NULL,
  headline      text NOT NULL,
  quote_short   text NOT NULL,
  quote_full    text NOT NULL,
  photo_url     text,
  display_order integer NOT NULL DEFAULT 0,
  published     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Payment *stub* records: captures the plan the member chose at registration.
-- No card data is ever stored; real processing is intentionally not implemented.
CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan         text NOT NULL CHECK (plan IN ('one_time', 'subscription')),
  amount_cents integer NOT NULL,
  currency     text NOT NULL DEFAULT 'USD',
  status       text NOT NULL DEFAULT 'stub_pending'
               CHECK (status IN ('stub_pending')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Internal notes support/admin staff keep while assisting a member.
CREATE TABLE support_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id  uuid,
  action         text NOT NULL,
  target_user_id uuid,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_support_notes_user ON support_notes(user_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX idx_testimonials_order ON testimonials(display_order) WHERE published;

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_touch    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Defense in depth: RLS policies cannot compare OLD vs NEW, so privilege
-- escalation (a CEO editing their own role/status) is blocked by trigger.
CREATE OR REPLACE FUNCTION guard_privileged_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status)
     AND app_role() <> 'admin' THEN
    RAISE EXCEPTION 'only admins may change role or account status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_guard_privileges BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_privileged_columns();

-- ----------------------------------------------------------------------------
-- Login lookup: unauthenticated requests may not read the users table, but
-- login needs the password hash for exactly one email. This SECURITY DEFINER
-- function is the single, narrow anon-accessible path.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_login_credentials(p_email citext)
RETURNS TABLE (id uuid, email citext, password_hash text, role text, status text)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT u.id, u.email, u.password_hash, u.role, u.status
  FROM users u
  WHERE u.email = p_email
$$;

-- ----------------------------------------------------------------------------
-- Row-level security policies
-- ----------------------------------------------------------------------------
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log     ENABLE ROW LEVEL SECURITY;

ALTER TABLE users         FORCE ROW LEVEL SECURITY;
ALTER TABLE profiles      FORCE ROW LEVEL SECURITY;
ALTER TABLE documents     FORCE ROW LEVEL SECURITY;
ALTER TABLE testimonials  FORCE ROW LEVEL SECURITY;
ALTER TABLE payments      FORCE ROW LEVEL SECURITY;
ALTER TABLE support_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log     FORCE ROW LEVEL SECURITY;

-- users: members see themselves; support sees everyone (to assist);
-- only admins create staff accounts or delete users.
CREATE POLICY users_select ON users FOR SELECT
  USING (id = app_user_id() OR app_role() IN ('admin', 'support'));

CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (
    (app_role() = 'anon' AND role = 'ceo' AND status = 'pending_payment')
    OR app_role() = 'admin'
  );

CREATE POLICY users_update ON users FOR UPDATE
  USING (id = app_user_id() OR app_role() = 'admin')
  WITH CHECK (id = app_user_id() OR app_role() = 'admin');

CREATE POLICY users_delete ON users FOR DELETE
  USING (app_role() = 'admin');

-- profiles: owners manage their own; support may read; admins manage all.
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (user_id = app_user_id() OR app_role() IN ('admin', 'support'));

CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (user_id = app_user_id() OR app_role() = 'admin');

CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (user_id = app_user_id() OR app_role() = 'admin')
  WITH CHECK (user_id = app_user_id() OR app_role() = 'admin');

CREATE POLICY profiles_delete ON profiles FOR DELETE
  USING (app_role() = 'admin');

-- documents (CV, photo): same ownership rules as profiles.
CREATE POLICY documents_select ON documents FOR SELECT
  USING (user_id = app_user_id() OR app_role() IN ('admin', 'support'));

CREATE POLICY documents_insert ON documents FOR INSERT
  WITH CHECK (user_id = app_user_id() OR app_role() = 'admin');

CREATE POLICY documents_update ON documents FOR UPDATE
  USING (user_id = app_user_id() OR app_role() = 'admin')
  WITH CHECK (user_id = app_user_id() OR app_role() = 'admin');

CREATE POLICY documents_delete ON documents FOR DELETE
  USING (user_id = app_user_id() OR app_role() = 'admin');

-- testimonials: the public homepage reads published rows; admins curate.
CREATE POLICY testimonials_select ON testimonials FOR SELECT
  USING (published OR app_role() = 'admin');

CREATE POLICY testimonials_write ON testimonials FOR ALL
  USING (app_role() = 'admin')
  WITH CHECK (app_role() = 'admin');

-- payments: members see and create their own stub records; staff can view;
-- nothing is ever updated or deleted except by admins.
CREATE POLICY payments_select ON payments FOR SELECT
  USING (user_id = app_user_id() OR app_role() IN ('admin', 'support'));

CREATE POLICY payments_insert ON payments FOR INSERT
  WITH CHECK (user_id = app_user_id() OR app_role() = 'admin');

CREATE POLICY payments_admin_update ON payments FOR UPDATE
  USING (app_role() = 'admin') WITH CHECK (app_role() = 'admin');

CREATE POLICY payments_admin_delete ON payments FOR DELETE
  USING (app_role() = 'admin');

-- support_notes: internal to staff; members cannot see notes about them.
CREATE POLICY support_notes_select ON support_notes FOR SELECT
  USING (app_role() IN ('admin', 'support'));

CREATE POLICY support_notes_insert ON support_notes FOR INSERT
  WITH CHECK (app_role() IN ('admin', 'support') AND author_id = app_user_id());

CREATE POLICY support_notes_admin ON support_notes FOR DELETE
  USING (app_role() = 'admin');

-- audit_log: append-only from the API; only admins may read it.
CREATE POLICY audit_log_insert ON audit_log FOR INSERT
  WITH CHECK (true);

CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (app_role() = 'admin');

-- ----------------------------------------------------------------------------
-- Grants for the application role (created by the migration runner).
-- No DELETE on audit_log; no TRUNCATE anywhere.
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO eisavant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, profiles, documents, testimonials, payments, support_notes TO eisavant_app;
GRANT SELECT, INSERT ON audit_log TO eisavant_app;
GRANT EXECUTE ON FUNCTION get_login_credentials(citext) TO eisavant_app;
GRANT EXECUTE ON FUNCTION app_user_id(), app_role() TO eisavant_app;
