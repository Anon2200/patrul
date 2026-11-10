BEGIN;
CREATE TABLE IF NOT EXISTS patrul_mail_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES patrul_mail_threads(id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL REFERENCES patrul_mail_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size BETWEEN 1 AND 8388608),
  file_data BYTEA NOT NULL,
  sha256 BYTEA NOT NULL CHECK (octet_length(sha256)=32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS patrul_mail_attachments_message_idx ON patrul_mail_attachments(message_id,id);
CREATE INDEX IF NOT EXISTS patrul_mail_attachments_thread_idx ON patrul_mail_attachments(thread_id);
COMMIT;
