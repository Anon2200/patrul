-- Shared registry of students who violated the rules ("Нарушители").
-- One encrypted document shared by the commander, the documentation officer and the senior master.
-- Applied automatically during server startup; safe to run more than once.
CREATE TABLE IF NOT EXISTS patrul_violators (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  data JSONB,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patrul_violators_version_nonnegative CHECK (version >= 0)
);

INSERT INTO patrul_violators (id, data, version)
VALUES (1, NULL, 0)
ON CONFLICT (id) DO NOTHING;
