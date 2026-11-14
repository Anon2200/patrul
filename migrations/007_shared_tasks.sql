-- Shared cross-role assignments and in-app notifications.
-- Applied automatically during server startup; safe to run more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS patrul_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES patrul_users(id) ON DELETE RESTRICT,
  assignee_user_id UUID NOT NULL REFERENCES patrul_users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  priority TEXT NOT NULL DEFAULT 'Обычный' CHECK (priority IN ('Обычный','Важный','Срочный')),
  status TEXT NOT NULL DEFAULT 'Новая' CHECK (status IN ('Новая','В работе','На проверке','Выполнено','Отменено')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT patrul_tasks_creator_not_null CHECK (creator_user_id IS NOT NULL),
  CONSTRAINT patrul_tasks_assignee_not_null CHECK (assignee_user_id IS NOT NULL)
);

-- Extend the status constraint for the manager's return-for-revision stage.
-- Drop/recreate by name so this also upgrades databases where the table already exists.
ALTER TABLE patrul_tasks DROP CONSTRAINT IF EXISTS patrul_tasks_status_check;
ALTER TABLE patrul_tasks ADD CONSTRAINT patrul_tasks_status_check
  CHECK (status IN ('Новая','В работе','На проверке','На доработку','Выполнено','Отменено'));

CREATE INDEX IF NOT EXISTS patrul_tasks_assignee_status_idx
  ON patrul_tasks (assignee_user_id, status, due_date);
CREATE INDEX IF NOT EXISTS patrul_tasks_creator_created_idx
  ON patrul_tasks (creator_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS patrul_task_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES patrul_tasks(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES patrul_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (length(btrim(event_type)) BETWEEN 1 AND 80),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS patrul_task_events_task_idx
  ON patrul_task_events (task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS patrul_task_notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES patrul_users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES patrul_tasks(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (length(btrim(notification_type)) BETWEEN 1 AND 80),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 1000),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS patrul_task_notifications_unread_idx
  ON patrul_task_notifications (user_id, created_at DESC)
  WHERE is_read = FALSE;

COMMIT;
