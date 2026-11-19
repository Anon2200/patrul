'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createAuth } = require('./auth');
const { startDutyCleanup, DUTY_TIME_ZONE } = require('./duty-store');
const { validateDataEncryptionKey, encryptData, decryptData, readRoleData, migratePlaintextRows } = require('./data-crypto');

const PORT = Number(process.env.PORT || 3000);
const ROLE_TOKEN_ENV = {
  nachalnik: 'PATRUL_TOKEN_NACHALNIK',
  zam: 'PATRUL_TOKEN_ZAM',
  uchet: 'PATRUL_TOKEN_UCHET',
  dokumentoved: 'PATRUL_TOKEN_DOKUMENTOVED'
};
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ROLES = new Set(['nachalnik', 'zam', 'uchet', 'dokumentoved']);
const AUTH_FAILURE_LIMIT = 10;
const AUTH_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const authFailures = new Map();

// Разрешённые публичные файлы интерфейса. Не отдаём произвольные файлы с диска.
const PUBLIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/nachalnik.html', 'nachalnik.html'],
  ['/zam.html', 'zam.html'],
  ['/uchet.html', 'uchet.html'],
  ['/dokumentoved.html', 'dokumentoved.html'],
  ['/patrol-senior.html', 'patrol-senior.html'],
  ['/patrol-senior.js', 'patrol-senior.js'],
  ['/duty-schedule.js', 'duty-schedule.js'],
  ['/duty-calendar-global.js', 'duty-calendar-global.js'],
  ['/duty-roster-section.js', 'duty-roster-section.js'],
  ['/cloud-sync.js', 'cloud-sync.js'],
  ['/ops-workspace.js', 'ops-workspace.js'],
  ['/personal-workspace.js', 'personal-workspace.js'],
  ['/staff-workspace.js', 'staff-workspace.js'],
  ['/mail.html', 'mail.html'],
  ['/mail.js', 'mail.js'],
  ['/mail-viewer.html', 'mail-viewer.html'],
  ['/mail-viewer.js', 'mail-viewer.js'],
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
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'permissions-policy': 'camera=(self), microphone=(), geolocation=()'
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
// CURRENT_DATE в запросах (сроки поручений, журналы) должен считаться по московскому дню, а не по UTC.
pool.on('connect', (client) => {
  if (/^[A-Za-z0-9_\/+-]+$/.test(DUTY_TIME_ZONE)) {
    client.query("SET TIME ZONE '" + DUTY_TIME_ZONE + "'").catch((err) => console.error('Cannot set database time zone:', err.message));
  }
});

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

function authFailureKey(req, role) {
  let ip = req.socket.remoteAddress || 'unknown';
  if (process.env.PATRUL_TRUST_PROXY !== '0') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
    if (forwarded.length) ip = forwarded[forwarded.length - 1].slice(0, 64);
  }
  return ip + ':' + role;
}

function recordAuthFailure(req, role) {
  const now = Date.now();
  const key = authFailureKey(req, role);
  let entry = authFailures.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + AUTH_FAILURE_WINDOW_MS };
  }
  entry.count += 1;
  authFailures.delete(key);
  // Keep the in-memory limiter bounded if many client addresses are seen.
  if (authFailures.size >= 10000) authFailures.delete(authFailures.keys().next().value);
  authFailures.set(key, entry);
  return entry.count > AUTH_FAILURE_LIMIT
    ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    : 0;
}

function clearAuthFailures(req, role) {
  authFailures.delete(authFailureKey(req, role));
}

function authorized(req, role) {
  if (process.env.PATRUL_LEGACY_ROLE_TOKENS_ENABLED !== 'true') return false;
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

async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
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
  validateDataEncryptionKey();
  const publicOrigin = process.env.PATRUL_PUBLIC_ORIGIN || '';
  let parsedOrigin;
  try { parsedOrigin = new URL(publicOrigin); } catch { throw new Error('PATRUL_PUBLIC_ORIGIN must be configured as an exact HTTPS origin'); }
  if (parsedOrigin.origin !== publicOrigin || (parsedOrigin.protocol !== 'https:' && parsedOrigin.hostname !== '127.0.0.1' && parsedOrigin.hostname !== 'localhost')) {
    throw new Error('PATRUL_PUBLIC_ORIGIN must be an exact HTTPS origin (HTTP is allowed only for localhost tests)');
  }
  const configuredTokens = process.env.PATRUL_LEGACY_ROLE_TOKENS_ENABLED === 'true' ? Object.entries(ROLE_TOKEN_ENV)
    .map(([role, envName]) => ({ role, envName, value: process.env[envName] || '' }))
    .filter(item => item.value) : [];
  const weakTokens = configuredTokens.filter(item => Buffer.byteLength(item.value, 'utf8') < 32);
  if (weakTokens.length) {
    throw new Error('Role access tokens must contain at least 32 UTF-8 bytes: ' + weakTokens.map(item => item.envName).join(', '));
  }
  if (new Set(configuredTokens.map(item => item.value)).size !== configuredTokens.length) {
    throw new Error('Each configured role must have a different access token');
  }
  const missingRoleTokens = process.env.PATRUL_LEGACY_ROLE_TOKENS_ENABLED === 'true' ? Object.values(ROLE_TOKEN_ENV).filter(name => !process.env[name]) : [];
  if (missingRoleTokens.length) {
    console.warn('Role data access is disabled for roles without configured tokens:', missingRoleTokens.join(', '));
  }
  await pool.query(
    'CREATE TABLE IF NOT EXISTS patrul_role_data (' +
    'role TEXT PRIMARY KEY, data JSONB NOT NULL, ' +
    'version BIGINT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'
  );
  const identitySchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '001_identity_schema.sql'), 'utf8');
  await pool.query(identitySchema);
  const mailSchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '002_mail_schema.sql'), 'utf8');
  await pool.query(mailSchema);
  const mailAttachmentsSchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '003_mail_attachments.sql'), 'utf8');
  await pool.query(mailAttachmentsSchema);
  const mailArchiveSchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '004_mail_archive.sql'), 'utf8');
  await pool.query(mailArchiveSchema);
  const sharedStaffSchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '005_shared_staff_schema.sql'), 'utf8');
  await pool.query(sharedStaffSchema);
  const patrolSeniorSchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '006_patrol_senior_role.sql'), 'utf8');
  await pool.query(patrolSeniorSchema);
  const sharedTasksSchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '007_shared_tasks.sql'), 'utf8');
  await pool.query(sharedTasksSchema);
  const documentNumberingSchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '008_document_numbering.sql'), 'utf8');
  await pool.query(documentNumberingSchema);
  const patrolSeniorOfflineSchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '009_patrol_senior_offline_queue.sql'), 'utf8');
  await pool.query(patrolSeniorOfflineSchema);
  const independentDutySchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '010_independent_duty_storage.sql'), 'utf8');
  await pool.query(independentDutySchema);
  const violationsRegistrySchema = await fs.promises.readFile(path.join(__dirname, 'migrations', '011_shared_violations_registry.sql'), 'utf8');
  await pool.query(violationsRegistrySchema);
  await migratePlaintextRows(pool);
  await purgeLegacyCommanderDuty();
}

async function purgeLegacyCommanderDuty() {
  const client = await pool.connect();
  let moved = 0;
  try {
    await client.query('BEGIN');
    const q = await client.query("SELECT data,version FROM patrul_role_data WHERE role='nachalnik' FOR UPDATE");
    if (!q.rowCount) {
      await client.query('COMMIT');
      return;
    }
    const row = q.rows[0];
    const data = decryptData(row.data,'nachalnik');
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        !Object.prototype.hasOwnProperty.call(data,'duty')) {
      await client.query('COMMIT');
      return;
    }

    const legacyDuty = data.duty && typeof data.duty === 'object' && !Array.isArray(data.duty)
      ? data.duty : {};
    for (const [date,duty] of Object.entries(legacyDuty)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const parsed = new Date(date+'T00:00:00.000Z');
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) continue;
      const assignments = Array.isArray(duty && duty.departmentAssignments) ? duty.departmentAssignments : [];
      const substitutions = Array.isArray(duty && duty.seniorSubstitutions) ? duty.seniorSubstitutions : [];
      if (!assignments.length && !substitutions.length) continue;
      const inserted = await client.query(
        'INSERT INTO patrul_duty_schedule(duty_date,assignments,substitutions,version,updated_at) '+
        'VALUES($1::date,$2::jsonb,$3::jsonb,1,NOW()) ON CONFLICT(duty_date) DO NOTHING RETURNING duty_date',
        [date,JSON.stringify(assignments),JSON.stringify(substitutions)]
      );
      moved += inserted.rowCount;
    }

    // Drop the entire legacy duty payload: past rosters, daily rows, times,
    // equipment marks, defects, incidents and reports are intentionally retired.
    delete data.duty;
    const saved = await client.query(
      "UPDATE patrul_role_data SET data=$1::jsonb,version=version+1,updated_at=NOW() WHERE role='nachalnik' AND version=$2 RETURNING version",
      [JSON.stringify(encryptData(data,'nachalnik')),row.version]
    );
    if (!saved.rowCount) throw new Error('Commander role data changed while retiring legacy duty records');
    await client.query('COMMIT');
    console.info('Independent duty storage initialized: schedule days imported='+moved+'; legacy daily rosters retired.');
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    client.release();
  }
}

const handleAuth = createAuth(pool, send, readJson);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (await handleAuth(req, res, url)) return;

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
  if (!authorized(req, role)) {
    const retryAfter = recordAuthFailure(req, role);
    if (retryAfter) {
      return send(res, 429, { error: 'Слишком много неверных попыток. Повторите позже.' }, {
        'retry-after': String(retryAfter)
      });
    }
    return send(res, 401, { error: 'Нет доступа к данным этой роли' });
  }
  clearAuthFailures(req, role);

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
      const data = await readRoleData(pool, role, row);
      if (role === 'nachalnik' && data && typeof data === 'object' && !Array.isArray(data)) delete data.duty;
      return send(res, 200, {
        role,
        data,
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
      [role, JSON.stringify(encryptData(role === 'nachalnik' && body.data && typeof body.data === 'object' ? Object.fromEntries(Object.entries(body.data).filter(([key]) => key !== 'duty')) : body.data, role)), body.expectedVersion]
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
      data: body.data,
      version: Number(row.version),
      updatedAt: row.updated_at
    });
  } catch (err) {
    if (err.status) return send(res, err.status, { error: err.message });
    console.error('API request failed:', err.message);
    return send(res, 500, { error: 'Внутренняя ошибка сервера' });
  }
});

let stopDutyCleanup = null;
initDatabase().then(() => {
  stopDutyCleanup = startDutyCleanup(pool);
  server.listen(PORT, '0.0.0.0', () => console.log('Patrul API listening on port ' + PORT));
}).catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});

async function shutdown() {
  if (stopDutyCleanup) stopDutyCleanup();
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
