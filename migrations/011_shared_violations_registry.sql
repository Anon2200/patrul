-- Shared encrypted violations registry for Commander and Document Officer.
-- The Senior Master receives maintenance metadata only, never the records themselves.
BEGIN;

CREATE TABLE IF NOT EXISTS patrul_violation_registry (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  data JSONB,
  version BIGINT NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES patrul_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patrul_violation_registry_data_object
    CHECK (data IS NULL OR jsonb_typeof(data) = 'object')
);

INSERT INTO patrul_violation_registry(id, data, version)
VALUES (1, NULL, 0)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS patrul_violation_registry_updated_idx
  ON patrul_violation_registry (updated_at DESC);

COMMIT;
