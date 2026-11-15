-- Shared personnel roster, initialized lazily from existing role snapshots.
-- The payload remains encrypted with the configured Patrul data-encryption key.
CREATE TABLE IF NOT EXISTS patrul_shared_staff (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  data JSONB,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patrul_shared_staff_version_nonnegative CHECK (version >= 0)
);

INSERT INTO patrul_shared_staff (id, data, version)
VALUES (1, NULL, 0)
ON CONFLICT (id) DO NOTHING;
