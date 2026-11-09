'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const ROLE_TOKEN_ENV = {
  nachalnik: 'PATRUL_TOKEN_NACHALNIK',
  zam: 'PATRUL_TOKEN_ZAM',
  uchet: 'PATRUL_TOKEN_UCHET',
  dokumentoved: 'PATRUL_TOKEN_DOKUMENTOVED'
};
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ROLES = new Set(['nachalnik', 'zam', 'uchet', 'dokumentoved']);

// Разрешённые публичные файлы интерфейса. Не отдаём произвольные файлы с диска.
const PUBLIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/nachalnik.html', 'nachalnik.html'],
  ['/zam.html', 'zam.html'],
  ['/uchet.html', 'uchet.html'],
  ['/dokumentoved.html', 'dokumentoved.html'],
  ['/cloud-sync.js', 'cloud-sync.js'],
  ['/sw.js', 'sw.js'],
  ['/nachalnik.webmanifest', 'nachalnik.webmanifest'],
  ['/zam.webmanifest', 'zam.webmanifest'],
  ['/uchet.webmanifest', 'uchet.webmanifest'],
  ['/dokumentoved.webmanifest', 'dokumentoved.webmanifest'],
  ['/icon-180.png', 'icon-180.png'],
  ['/icon-192.png', 'icon-192.png'],
  ['/icon-512.png', 'icon-512.png']
]);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png'
};

async function servePublicFile(req, res, pathname) {
  const fileName = PUBLIC_FILES.get(pathname);
  if (!fileName) return false;

  const filePath = path.join(__dirname, fileName);
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return false;
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(fileName)] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()'
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => {
        console.error('Static file read failed:', err.message);
        if (!res.headersSent) send(res, 500, { error: 'Не удалось прочитать файл' });
        else res.destroy(err);
      });
      stream.pipe(res);
    }
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

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
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()'
  });
  res.end(JSON.stringify(body));
}

function authorized(req, role) {
  const envName = ROLE_TOKEN_ENV[role];
  const expected = envName ? process.env[envName] || '' : '';
  if (!expected) return false;
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
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
  const missingRoleTokens = Object.values(ROLE_TOKEN_ENV).filter(name => !process.env[name]);
  if (missingRoleTokens.length) {
    console.warn('Role data access is disabled for roles without configured tokens:', missingRoleTokens.join(', '));
  }
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

  if (['GET', 'HEAD'].includes(req.method) && await servePublicFile(req, res, url.pathname)) {
    return;
  }

  const match = url.pathname.match(/^\/api\/data\/([a-z_]+)$/);
  if (!match || !['GET', 'PUT'].includes(req.method)) {
    return send(res, 404, { error: 'Маршрут не найден' });
  }
  const role = match[1];
  if (!ROLES.has(role)) return send(res, 400, { error: 'Неизвестная роль' });
  if (!authorized(req, role)) return send(res, 401, { error: 'Нет доступа к данным этой роли' });

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
