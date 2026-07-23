-- ============================================================================
-- Executive-search groundwork (the three rework items):
--   1. New application role: 'client' — a client-company user who can view
--      their company's open CEO positions and candidate slates.
--   2. Controlled cross-party disclosure: position_candidates carries a
--      per-candidate disclosure_level (anonymous → identified → full) that
--      gates how much of a member's profile/CV a client can see.
--   3. Narrowed staff visibility: support has NO access to the recruiting
--      tables (client_companies, positions, position_candidates); read
--      auditing of sensitive views is added at the API layer.
-- ============================================================================

-- 1. Extend the role model ---------------------------------------------------
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ceo', 'support', 'admin', 'client'));

CREATE TABLE client_companies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  contact_email text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN client_company_id uuid
  REFERENCES client_companies(id) ON DELETE SET NULL;

-- Session helper: the client user's company, bound per-request like app.user_id.
CREATE OR REPLACE FUNCTION app_company_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '')::uuid
$$;

-- Company assignment is as privileged as role: admin-only (defense in depth).
CREATE OR REPLACE FUNCTION guard_privileged_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.client_company_id IS DISTINCT FROM OLD.client_company_id)
     AND app_role() <> 'admin' THEN
    RAISE EXCEPTION 'only admins may change role, status, or company assignment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- Login lookup now also returns the client company (return type change
-- requires drop + recreate).
DROP FUNCTION get_login_credentials(citext);
CREATE FUNCTION get_login_credentials(p_email citext)
RETURNS TABLE (id uuid, email citext, password_hash text, role text, status text, client_company_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT u.id, u.email, u.password_hash, u.role, u.status, u.client_company_id
  FROM users u
  WHERE u.email = p_email
$$;
GRANT EXECUTE ON FUNCTION get_login_credentials(citext) TO eisavant_app;
GRANT EXECUTE ON FUNCTION app_company_id() TO eisavant_app;

-- 2. Positions & disclosure-gated candidate slates ---------------------------
CREATE TABLE positions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_company_id uuid NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'on_hold', 'filled', 'closed')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE position_candidates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id       uuid NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The disclosure ladder: what the client company may see of this candidate.
  --   anonymous  → only the admin-written summary (no identity, no profile)
  --   identified → name, title, profile details
  --   full       → identified + CV download
  disclosure_level  text NOT NULL DEFAULT 'anonymous'
                    CHECK (disclosure_level IN ('anonymous', 'identified', 'full')),
  stage             text NOT NULL DEFAULT 'sourced'
                    CHECK (stage IN ('sourced', 'screening', 'interviewing', 'finalist', 'placed')),
  summary           text NOT NULL DEFAULT '',
  added_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (position_id, candidate_user_id)
);

CREATE INDEX idx_positions_company ON positions(client_company_id);
CREATE INDEX idx_position_candidates_position ON position_candidates(position_id);
CREATE INDEX idx_position_candidates_candidate ON position_candidates(candidate_user_id);

CREATE TRIGGER position_candidates_touch BEFORE UPDATE ON position_candidates
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE client_companies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_companies    FORCE ROW LEVEL SECURITY;
ALTER TABLE positions           FORCE ROW LEVEL SECURITY;
ALTER TABLE position_candidates FORCE ROW LEVEL SECURITY;

-- Recruiting tables: admin manages; clients read their own company only.
-- Support is deliberately excluded (narrowed staff visibility).
CREATE POLICY client_companies_select ON client_companies FOR SELECT
  USING (app_role() = 'admin' OR (app_role() = 'client' AND id = app_company_id()));
CREATE POLICY client_companies_write ON client_companies FOR ALL
  USING (app_role() = 'admin') WITH CHECK (app_role() = 'admin');

CREATE POLICY positions_select ON positions FOR SELECT
  USING (
    app_role() = 'admin'
    OR (app_role() = 'client' AND client_company_id = app_company_id())
  );
CREATE POLICY positions_write ON positions FOR ALL
  USING (app_role() = 'admin') WITH CHECK (app_role() = 'admin');

CREATE POLICY position_candidates_select ON position_candidates FOR SELECT
  USING (
    app_role() = 'admin'
    OR (app_role() = 'client' AND EXISTS (
      SELECT 1 FROM positions p
      WHERE p.id = position_id AND p.client_company_id = app_company_id()
    ))
  );
CREATE POLICY position_candidates_write ON position_candidates FOR ALL
  USING (app_role() = 'admin') WITH CHECK (app_role() = 'admin');

-- Disclosure gates on existing tables: clients see a candidate's profile only
-- at 'identified' or above, and the CV only at 'full'.
DROP POLICY profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    user_id = app_user_id()
    OR app_role() IN ('admin', 'support')
    OR (app_role() = 'client' AND EXISTS (
      SELECT 1 FROM position_candidates pc
      JOIN positions p ON p.id = pc.position_id
      WHERE pc.candidate_user_id = profiles.user_id
        AND p.client_company_id = app_company_id()
        AND pc.disclosure_level IN ('identified', 'full')
    ))
  );

DROP POLICY documents_select ON documents;
CREATE POLICY documents_select ON documents FOR SELECT
  USING (
    user_id = app_user_id()
    OR app_role() IN ('admin', 'support')
    OR (app_role() = 'client' AND kind = 'cv' AND EXISTS (
      SELECT 1 FROM position_candidates pc
      JOIN positions p ON p.id = pc.position_id
      WHERE pc.candidate_user_id = documents.user_id
        AND p.client_company_id = app_company_id()
        AND pc.disclosure_level = 'full'
    ))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON client_companies, positions, position_candidates TO eisavant_app;
