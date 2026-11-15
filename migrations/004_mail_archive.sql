BEGIN;
CREATE TABLE IF NOT EXISTS patrul_mail_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES patrul_users(id) ON DELETE CASCADE,
  source_attachment_id UUID NOT NULL,
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size BETWEEN 1 AND 8388608),
  file_data BYTEA NOT NULL,
  sha256 BYTEA NOT NULL CHECK (octet_length(sha256)=32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_user_id, source_attachment_id)
);
CREATE INDEX IF NOT EXISTS patrul_mail_archive_owner_idx
  ON patrul_mail_archive(owner_user_id, created_at DESC, id);
COMMIT;
