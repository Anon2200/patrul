-- ПОЛНЫЙ СБРОС ДАННЫХ «Патруля» (чистый запуск).
-- НЕОБРАТИМО удаляет все таблицы приложения: учётные записи, сессии, личный состав,
-- наряды, поручения, почту, журнал аудита, реестр нарушителей.
-- Перед запуском сделайте резервную копию PostgreSQL. Не выполняйте на рабочей базе без согласования.
-- Запуск:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/reset-database.sql
-- После сброса перезапустите приложение: оно само создаст все таблицы заново (миграции 001–011).

BEGIN;
DROP TABLE IF EXISTS
  patrul_violators,
  patrul_duty_rosters,
  patrul_duty_schedule,
  patrul_document_counters,
  patrul_task_notifications,
  patrul_task_events,
  patrul_tasks,
  patrul_patrol_senior_entries,
  patrul_patrol_senior_invites,
  patrul_patrol_senior_credentials,
  patrul_shared_staff,
  patrul_mail_archive,
  patrul_mail_attachments,
  patrul_mail_messages,
  patrul_mail_participants,
  patrul_mail_threads,
  patrul_audit_log,
  patrul_sessions,
  patrul_users,
  patrul_role_data
CASCADE;
COMMIT;
