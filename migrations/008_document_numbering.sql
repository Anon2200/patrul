-- Server-side, concurrency-safe sequential document numbering.
BEGIN;

CREATE TABLE IF NOT EXISTS patrul_document_counters (
  year INTEGER PRIMARY KEY CHECK (year BETWEEN 2000 AND 9999),
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
