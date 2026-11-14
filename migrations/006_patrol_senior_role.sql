-- Patrol senior accounts and department-limited duty log.
-- Idempotent: applied automatically during server startup.
BEGIN;

ALTER TABLE patrul_users DROP CONSTRAINT IF EXISTS patrul_users_role_check;
ALTER TABLE patrul_users
  ADD CONSTRAINT patrul_users_role_check
  CHECK (role IN ('nachalnik', 'zam', 'uchet', 'dokumentoved', 'starshiy_patrulya'));

CREATE TABLE IF NOT EXISTS patrul_patrol_senior_credentials (
  user_id UUID PRIMARY KEY REFERENCES patrul_users(id) ON DELETE CASCADE,
  staff_key TEXT NOT NULL UNIQUE,
  department_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  surname_key TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patrol_senior_pin_hash_nonempty CHECK (length(pin_hash) BETWEEN 20 AND 500)
);

CREATE INDEX IF NOT EXISTS patrol_senior_surname_lookup_idx
  ON patrul_patrol_senior_credentials (surname_key);

CREATE TABLE IF NOT EXISTS patrul_patrol_senior_invites (
  staff_key TEXT PRIMARY KEY,
  activation_code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES patrul_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  CONSTRAINT patrol_senior_invite_hash_nonempty CHECK (length(activation_code_hash) BETWEEN 20 AND 500)
);

CREATE INDEX IF NOT EXISTS patrol_senior_invites_expiry_idx
  ON patrul_patrol_senior_invites (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS patrul_patrol_senior_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_user_id UUID NOT NULL REFERENCES patrul_users(id) ON DELETE RESTRICT,
  department_id TEXT NOT NULL,
  staff_key TEXT,
  entry_date DATE NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('attendance','report','equipment','shift_start','shift_end','task_update')),
  status TEXT,
  title TEXT,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS patrol_senior_entries_department_date_idx
  ON patrul_patrol_senior_entries (department_id, entry_date, created_at DESC);

CREATE INDEX IF NOT EXISTS patrol_senior_entries_user_idx
  ON patrul_patrol_senior_entries (senior_user_id, created_at DESC);

COMMIT;
