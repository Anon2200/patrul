-- Independent duty schedule and daily roster storage.
-- No legacy patrul_role_data duty payload is migrated: old rosters are intentionally retired.
BEGIN;

CREATE TABLE IF NOT EXISTS patrul_duty_schedule (
  duty_date DATE PRIMARY KEY,
  assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
  substitutions JSONB NOT NULL DEFAULT '[]'::jsonb,
  version BIGINT NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES patrul_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patrul_duty_schedule_assignments_array CHECK (jsonb_typeof(assignments) = 'array'),
  CONSTRAINT patrul_duty_schedule_substitutions_array CHECK (jsonb_typeof(substitutions) = 'array')
);

CREATE INDEX IF NOT EXISTS patrul_duty_schedule_date_idx
  ON patrul_duty_schedule (duty_date);

CREATE TABLE IF NOT EXISTS patrul_duty_rosters (
  duty_date DATE PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version BIGINT NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES patrul_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patrul_duty_rosters_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE INDEX IF NOT EXISTS patrul_duty_rosters_updated_idx
  ON patrul_duty_rosters (updated_at DESC);

COMMIT;
