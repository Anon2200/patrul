BEGIN;
CREATE TABLE IF NOT EXISTS patrul_mail_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
  created_by UUID NOT NULL REFERENCES patrul_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS patrul_mail_participants (
  thread_id UUID NOT NULL REFERENCES patrul_mail_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES patrul_users(id) ON DELETE RESTRICT,
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (thread_id,user_id)
);
CREATE INDEX IF NOT EXISTS patrul_mail_participants_user_idx
  ON patrul_mail_participants(user_id,thread_id);
CREATE TABLE IF NOT EXISTS patrul_mail_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES patrul_mail_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES patrul_users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS patrul_mail_messages_thread_idx
  ON patrul_mail_messages(thread_id,created_at,id);
COMMIT;
