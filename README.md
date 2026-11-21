# Патруль

Служебный сайт патруля: кабинеты начальника, заместителя, документоведа, старшего мастера и старшего патруля.
Сервер на Node.js (без фреймворков) и PostgreSQL, интерфейс — обычные HTML-страницы со скриптами.

## Структура

| Папка | Что внутри |
|---|---|
| `public/` | Страницы кабинетов (`*.html`), клиентские скрипты, service worker, манифесты, иконки. Отдаются сервером только по списку `PUBLIC_FILES` |
| `server/` | Сервер и API: `server.js`, `auth.js` (вход, роли, маршруты), `data-crypto.js`, `duty-store.js`, `violators-store.js` |
| `migrations/` | SQL-схема, применяется автоматически при запуске (001–011) |
| `scripts/` | `check-html.js` (статические проверки), `reset-database.sql` (полный сброс данных) |
| `test/` | Модульные и интеграционные тесты (интеграционные требуют PostgreSQL) |
| `docs/` | Документация: запуск, база, безопасность, авторизация |
| `server.js` | Точка входа для хостинга, запускает `server/server.js` |

## Раздел «Нарушители»

Общий для начальника и документоведа (запись, правка, удаление, досье, девианты, статистика, отчёт, CSV)
и старшего мастера (корзина, журнал действий, резервная копия, виды нарушений). Логика: `server/violators-store.js`,
интерфейс: `public/violators-section.js`, API: `/api/violators`.

## Запуск и проверка

```bash
npm install
DATABASE_URL=postgres://... PATRUL_DATA_ENCRYPTION_KEY=... PATRUL_PUBLIC_ORIGIN=http://localhost:3000 npm start
npm run check              # синтаксис и статические проверки
npm run test:integration   # тесты; нужен PostgreSQL по DATABASE_URL
```

Первый запуск и чистый запуск: `docs/LAUNCH_GUIDE_RU.md`, `docs/NEW_LAUNCH.md`.
