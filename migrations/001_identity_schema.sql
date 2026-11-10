-- Identity schema foundation for Patrul.
-- This file is intentionally NOT executed by server startup.
-- Apply only to an isolated test database after review and a verified backup.
BEGIN;

CREATE TABLE IF NOT EXISTS patrul_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('nachalnik', 'zam', 'uchet', 'dokumentoved')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system_admin BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES patrul_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patrul_users_username_nonempty CHECK (length(btrim(username)) BETWEEN 3 AND 100),
  CONSTRAINT patrul_users_display_name_nonempty CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  CONSTRAINT patrul_users_password_hash_nonempty CHECK (length(password_hash) BETWEEN 20 AND 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS patrul_users_username_ci_unique
  ON patrul_users (lower(username));

CREATE INDEX IF NOT EXISTS patrul_users_active_role_idx
  ON patrul_users (role, is_active);

CREATE TABLE IF NOT EXISTS patrul_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES patrul_users(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE,
  csrf_token_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT patrul_sessions_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS patrul_sessions_user_active_idx
  ON patrul_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS patrul_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID REFERENCES patrul_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  target_user_id UUID REFERENCES patrul_users(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patrul_audit_event_type_nonempty CHECK (length(btrim(event_type)) BETWEEN 1 AND 100),
  CONSTRAINT patrul_audit_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS patrul_audit_created_at_idx
  ON patrul_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS patrul_audit_actor_idx
  ON patrul_audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patrul_audit_target_idx
  ON patrul_audit_log (target_user_id, created_at DESC);

COMMIT;
