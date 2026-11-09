'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const API_TOKEN = process.env.PATRUL_API_TOKEN || '';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ROLES = new Set(['nachalnik', 'zam', 'uchet', 'dokumentoved']);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => console.error('Unexpected PostgreSQL client error:', err.message));

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  if (!API_TOKEN) return false;
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(API_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('Тело запроса слишком большое');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('Ожидается корректный JSON');
    err.status = 400;
    throw err;
  }
}

async function initDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('Не задана переменная DATABASE_URL');
  if (!API_TOKEN) console.warn('PATRUL_API_TOKEN is not set; data endpoints are disabled.');
  await pool.query(
    'CREATE TABLE IF NOT EXISTS patrul_role_data (' +
    'role TEXT PRIMARY KEY, data JSONB NOT NULL, ' +
    'version BIGINT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/health') {
    try {
      await pool.query('SELECT 1');
      return send(res, 200, { ok: true, database: 'connected' });
    } catch {
      return send(res, 503, { ok: false, database: 'unavailable' });
    }
  }

  const match = url.pathname.match(/^\/api\/data\/([a-z_]+)$/);
  if (!match || !['GET', 'PUT'].includes(req.method)) {
    return send(res, 404, { error: 'Маршрут не найден' });
  }
  if (!authorized(req)) return send(res, 401, { error: 'Требуется авторизация' });

  const role = match[1];
  if (!ROLES.has(role)) return send(res, 400, { error: 'Неизвестная роль' });

  try {
    if (req.method === 'GET') {
      const result = await pool.query(
        'SELECT data, version, updated_at FROM patrul_role_data WHERE role = $1',
        [role]
      );
      if (result.rowCount === 0) {
        return send(res, 200, { role, data: null, version: 0, updatedAt: null });
      }
      const row = result.rows[0];
      return send(res, 200, {
        role,
        data: row.data,
        version: Number(row.version),
        updatedAt: row.updated_at
      });
    }

    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0 ||
        !Object.prototype.hasOwnProperty.call(body, 'data')) {
      return send(res, 400, {
        error: 'Нужны поля data и expectedVersion (целое неотрицательное число)'
      });
    }

    const result = await pool.query(
      'INSERT INTO patrul_role_data (role, data, version, updated_at) ' +
      'VALUES ($1, $2::jsonb, 1, NOW()) ' +
      'ON CONFLICT (role) DO UPDATE SET data = EXCLUDED.data, ' +
      'version = patrul_role_data.version + 1, updated_at = NOW() ' +
      'WHERE patrul_role_data.version = $3 ' +
      'RETURNING data, version, updated_at',
      [role, JSON.stringify(body.data), body.expectedVersion]
    );

    if (result.rowCount === 0) {
      const current = await pool.query(
        'SELECT version FROM patrul_role_data WHERE role = $1',
        [role]
      );
      return send(res, 409, {
        error: 'Данные уже изменились. Сначала загрузите актуальную версию.',
        currentVersion: current.rowCount ? Number(current.rows[0].version) : 0
      });
    }

    const row = result.rows[0];
    return send(res, 200, {
      role,
      data: row.data,
      version: Number(row.version),
      updatedAt: row.updated_at
    });
  } catch (err) {
    if (err.status) return send(res, err.status, { error: err.message });
    console.error('API request failed:', err.message);
    return send(res, 500, { error: 'Внутренняя ошибка сервера' });
  }
});

initDatabase().then(() => {
  server.listen(PORT, '0.0.0.0', () => console.log('Patrul API listening on port ' + PORT));
}).catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
