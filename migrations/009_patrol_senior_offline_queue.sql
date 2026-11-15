BEGIN;

ALTER TABLE patrul_patrol_senior_entries
  ADD COLUMN IF NOT EXISTS client_entry_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS patrol_senior_entries_client_id_idx
  ON patrul_patrol_senior_entries (senior_user_id, client_entry_id)
  WHERE client_entry_id IS NOT NULL;

COMMIT;
