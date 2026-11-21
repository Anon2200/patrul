'use strict';

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
process.env.PATRUL_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');
const { encryptData, decryptData, migratePlaintextRows } = require('../server/data-crypto');

const port = 43187;
const baseUrl = `http://127.0.0.1:${port}`;
const tokens = {
  nachalnik: 'ci-only-nachalnik-token-2026-not-production',
  zam: 'ci-only-zam-token-2026-not-production',
  uchet: 'ci-only-uchet-token-2026-not-production',
  dokumentoved: 'ci-only-dokumentoved-token-2026-not-production'
};
const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/patrul_test';

function currentDutyDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:process.env.PATRUL_TIME_ZONE || 'Europe/Moscow',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const values={};
  for(const part of parts)if(part.type!=='literal')values[part.type]=part.value;
  return values.year+'-'+values.month+'-'+values.day;
}

const testDutyDate = currentDutyDate();

test('cloud status updates preserve employee and logout controls', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/cloud-sync.js'), 'utf8');
  assert.ok(source.includes("const statusLabel = document.createElement('span')"));
  assert.ok(source.includes('badge.appendChild(statusLabel)'));
  assert.ok(source.includes('statusLabel.textContent='));
  assert.ok(source.includes('badge.appendChild(row)'));
  assert.ok(!source.includes("function status(s,color) { badge.textContent="));
});

let serverProcess;
let pool;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Server exited during startup (code ${serverProcess.exitCode})`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (_) {
      // The server may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Server did not become healthy within 15 seconds');
}

async function api(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
}

async function authorizedApi(path, options = {}, suppliedToken) {
  const role = path.split('/').pop();
  return api(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      authorization: `Bearer ${suppliedToken || tokens[role] || tokens.nachalnik}`
    }
  });
}

before(async () => {
  pool = new Pool({ connectionString: databaseUrl });
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      PATRUL_LEGACY_ROLE_TOKENS_ENABLED: 'true',
      PATRUL_BOOTSTRAP_SECRET: 'ci-bootstrap-secret-only-not-production',
      PATRUL_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
      PATRUL_PUBLIC_ORIGIN: baseUrl,
      PATRUL_TOKEN_NACHALNIK: tokens.nachalnik,
      PATRUL_TOKEN_ZAM: tokens.zam,
      PATRUL_TOKEN_UCHET: tokens.uchet,
      PATRUL_TOKEN_DOKUMENTOVED: tokens.dokumentoved
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let startupOutput = '';
  serverProcess.stdout.on('data', chunk => { startupOutput += chunk.toString(); });
  serverProcess.stderr.on('data', chunk => { startupOutput += chunk.toString(); });
  try {
    await waitForServer();
    await pool.query('TRUNCATE TABLE patrul_role_data, patrul_shared_staff');
  } catch (error) {
    throw new Error(`${error.message}\n${startupOutput}`);
  }
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
    await Promise.race([
      once(serverProcess, 'exit'),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
    if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
  }
  if (pool) await pool.end();
});

test('all four role pages encrypt exchange packets and reject plaintext', async () => {
  const strongPassword = 'CI-Shared-Exchange-Password-2026!';
  const value = { v: 1, roleData: 'encrypted-exchange-fixture' };
  for (const file of ['nachalnik.html', 'zam.html', 'uchet.html', 'dokumentoved.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
    const start = html.indexOf('function sxB64(');
    const end = html.indexOf('const SXCOL=', start);
    assert.ok(start >= 0 && end > start, file + ' must contain the exchange crypto functions');
    const sandbox = {
      D: { sx: { pw: strongPassword } },
      window: { crypto: webcrypto },
      crypto: webcrypto,
      TextEncoder, TextDecoder, Uint8Array, Blob, Response,
      CompressionStream, DecompressionStream, btoa, atob
    };
    sandbox.sxS = () => sandbox.D.sx;
    vm.runInNewContext(html.slice(start, end), sandbox, { filename: file });
    const packet = await sandbox.sxPack(value);
    assert.ok(packet.startsWith('ПАТРУЛЬ1E:'), file + ' must produce an encrypted packet');
    assert.equal(packet.includes(strongPassword), false);
    const unpacked = await sandbox.sxUnpack(packet);
    assert.equal(JSON.stringify(unpacked), JSON.stringify(value));
    sandbox.D.sx.pw = 'Different-Strong-Password-2026!';
    await assert.rejects(sandbox.sxUnpack(packet), error => error.message === 'badpw');

    sandbox.D.sx.pw = 'short-password';
    await assert.rejects(sandbox.sxPack(value), error => error.message === 'weakpw');
    sandbox.D.sx.pw = '';
    await assert.rejects(sandbox.sxPack(value), error => error.message === 'needpw');
    await assert.rejects(sandbox.sxUnpack('ПАТРУЛЬ1R:YWJj'), error => error.message === 'unencrypted');
  }
});

test('AES-GCM role data encryption authenticates ciphertext and role context', () => {
  const value = { privateMarker: 'must-not-leak', nested: { count: 7 } };
  const encrypted = encryptData(value, 'nachalnik');
  assert.deepEqual(decryptData(encrypted, 'nachalnik'), value);
  assert.throws(() => decryptData(encrypted, 'zam'));
  assert.throws(() => decryptData({ ...encrypted, kid: undefined }, 'nachalnik'), /Malformed encrypted role data envelope/);
  const configuredKey = process.env.PATRUL_DATA_ENCRYPTION_KEY;
  try {
    process.env.PATRUL_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64url');
    assert.throws(() => decryptData(encrypted, 'nachalnik'), /does not match stored data/);
  } finally {
    process.env.PATRUL_DATA_ENCRYPTION_KEY = configuredKey;
  }

  const changedTag = Buffer.from(encrypted.tag, 'base64url');
  changedTag[0] ^= 1;
  assert.throws(() => decryptData({ ...encrypted, tag: changedTag.toString('base64url') }, 'nachalnik'));
});

test('health endpoint confirms PostgreSQL connectivity', async () => {
  const response = await api('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, database: 'connected' });
});

test('security headers are present on API and static responses', async () => {
  const apiResponse = await api('/api/health');
  assert.equal(apiResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(apiResponse.headers.get('x-frame-options'), 'DENY');
  assert.equal(apiResponse.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  assert.equal(apiResponse.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(apiResponse.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=()');
  assert.equal(apiResponse.headers.get('cache-control'), 'no-store');

  const pageResponse = await api('/index.html');
  assert.equal(pageResponse.status, 200);
  assert.equal(pageResponse.headers.get('x-frame-options'), 'DENY');
  assert.equal(pageResponse.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  assert.equal(pageResponse.headers.get('cache-control'), 'no-store');
});

test('data endpoints reject reads and writes without a role token', async () => {
  const read = await api('/api/data/nachalnik');
  assert.equal(read.status, 401);
  const write = await api('/api/data/nachalnik', {
    method: 'PUT',
    body: JSON.stringify({ expectedVersion: 0, data: { marker: 'unauthorized' } })
  });
  assert.equal(write.status, 401);
});

test('repeated invalid role tokens are throttled and valid access clears the counter', async () => {
  const reset = await authorizedApi('/api/data/nachalnik', {}, tokens.nachalnik);
  assert.equal(reset.status, 200);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await authorizedApi('/api/data/nachalnik', {}, 'definitely-wrong-token');
    assert.equal(response.status, 401, `invalid attempt ${attempt + 1} should be rejected`);
  }

  const blocked = await authorizedApi('/api/data/nachalnik', {}, 'definitely-wrong-token');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);

  const allowed = await authorizedApi('/api/data/nachalnik', {}, tokens.nachalnik);
  assert.equal(allowed.status, 200);
});

test('first write creates version 1 and GET returns the saved JSON', async () => {
  const data = { marker: 'integration-test', nested: { count: 3 } };
  const write = await authorizedApi('/api/data/nachalnik', {
    method: 'PUT',
    body: JSON.stringify({ expectedVersion: 0, data })
  });
  assert.equal(write.status, 200);
  const written = await write.json();
  assert.equal(written.version, 1);
  assert.deepEqual(written.data, data);

  const read = await authorizedApi('/api/data/nachalnik');
  assert.equal(read.status, 200);
  const loaded = await read.json();
  assert.equal(loaded.version, 1);
  assert.deepEqual(loaded.data, data);
});

test('role data is encrypted in PostgreSQL rather than stored as plaintext JSON', async () => {
  const stored = await pool.query('SELECT data FROM patrul_role_data WHERE role = $1', ['nachalnik']);
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].data.__patrul_encrypted, 1);
  assert.equal(stored.rows[0].data.alg, 'A256GCM');
  assert.equal(JSON.stringify(stored.rows[0].data).includes('integration-test'), false);
});

test('stale expectedVersion is rejected without overwriting saved data', async () => {
  const staleWrite = await authorizedApi('/api/data/nachalnik', {
    method: 'PUT',
    body: JSON.stringify({ expectedVersion: 0, data: { marker: 'must-not-overwrite' } })
  });
  assert.equal(staleWrite.status, 409);
  assert.equal((await staleWrite.json()).currentVersion, 1);

  const read = await authorizedApi('/api/data/nachalnik');
  assert.deepEqual((await read.json()).data, {
    marker: 'integration-test',
    nested: { count: 3 }
  });
});

test('each role token is limited to its own role (all cross-role combinations)', async () => {
  const roles = Object.keys(tokens);
  for (const ownRole of roles) {
    const ownResponse = await authorizedApi(`/api/data/${ownRole}`, {}, tokens[ownRole]);
    assert.equal(ownResponse.status, 200, `${ownRole} must access its own record`);
    for (const otherRole of roles) {
      if (otherRole === ownRole) continue;
      const read = await authorizedApi(`/api/data/${otherRole}`, {}, tokens[ownRole]);
      assert.equal(read.status, 401, `${ownRole} must not read ${otherRole}`);

      const write = await authorizedApi(`/api/data/${otherRole}`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: 0,
          data: { marker: 'cross-role-write-must-be-rejected', attemptedBy: ownRole }
        })
      }, tokens[ownRole]);
      assert.equal(write.status, 401, `${ownRole} must not write ${otherRole}`);
    }
  }
});

test('role records are stored separately', async () => {
  const response = await authorizedApi('/api/data/zam');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.role, 'zam');
  assert.equal(result.data, null);
  assert.equal(result.version, 0);
});

test('legacy plaintext database rows are encrypted on first read without changing their contents', async () => {
  const legacy = { marker: 'legacy-row-to-migrate', nested: { safe: true } };
  await pool.query(
    'INSERT INTO patrul_role_data(role,data,version,updated_at) VALUES($1,$2::jsonb,1,NOW())',
    ['dokumentoved', JSON.stringify(legacy)]
  );
  const response = await authorizedApi('/api/data/dokumentoved');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, legacy);
  const stored = await pool.query('SELECT data FROM patrul_role_data WHERE role = $1', ['dokumentoved']);
  assert.equal(stored.rows[0].data.__patrul_encrypted, 1);
  assert.equal(JSON.stringify(stored.rows[0].data).includes('legacy-row-to-migrate'), false);
});

test('startup migration encrypts all existing plaintext role rows', async () => {
  const legacy = { startupMigrationMarker: 'encrypt-before-serving', safe: true };
  await pool.query(
    'INSERT INTO patrul_role_data(role,data,version,updated_at) VALUES($1,$2::jsonb,1,NOW())',
    ['uchet', JSON.stringify(legacy)]
  );
  const migrated = await migratePlaintextRows(pool);
  assert.equal(migrated, 1);
  const stored = await pool.query('SELECT data FROM patrul_role_data WHERE role = $1', ['uchet']);
  assert.equal(stored.rows[0].data.__patrul_encrypted, 1);
  assert.deepEqual(decryptData(stored.rows[0].data, 'uchet'), legacy);
});

test('unknown roles and malformed write payloads are rejected', async () => {
  const unknownRole = await authorizedApi('/api/data/not_a_role');
  assert.equal(unknownRole.status, 400);

  const malformed = await authorizedApi('/api/data/zam', {
    method: 'PUT',
    body: JSON.stringify({ expectedVersion: -1, data: {} })
  });
  assert.equal(malformed.status, 400);
});


let adminCookie = '';
let adminCsrf = '';
let employeeCookie = '';
let employeeCsrf = '';
let employeeId = '';
let employeeTemporaryPassword = '';

async function sessionApi(path, options = {}, cookie = '', csrf = '') {
  return fetch(baseUrl + path, {
    ...options,
    headers: {
      'origin': baseUrl,
      'x-forwarded-proto': 'http',
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-patrul-csrf': csrf } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
}

test('bootstrap creates the first Senior Master admin and establishes a session', async () => {
  const response = await sessionApi('/api/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify({
      bootstrapSecret: 'ci-bootstrap-secret-only-not-production',
      username: 'senior.master',
      displayName: 'CI Senior Master',
      password: 'CI-Admin-Password-Only-For-Tests-2026!'
    })
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.user.role, 'uchet');
  assert.equal(result.user.systemAdmin, true);
  adminCsrf = result.csrfToken;
  adminCookie = (response.headers.get('set-cookie') || '').split(';')[0];
  assert.match(adminCookie, /^__Host-patrul_session=/);
  assert.ok(adminCsrf.length >= 40);
});

test('personal login session, CSRF protection, and role authorization work', async () => {
  const malformedCookie = await sessionApi('/api/auth/me', {}, '__Host-patrul_session=%');
  assert.equal(malformedCookie.status, 401);

  const me = await sessionApi('/api/auth/me', {}, adminCookie);
  assert.equal(me.status, 200);
  const meBody = await me.json();
  assert.equal(meBody.user.username, 'senior.master');
  adminCsrf = meBody.csrfToken;

  const adminRead = await sessionApi('/api/admin/users', {}, adminCookie);
  assert.equal(adminRead.status, 200);
  const adminOwnRole = await sessionApi('/api/session-data/uchet', {}, adminCookie);
  assert.equal(adminOwnRole.status, 200);
  const adminOtherRole = await sessionApi('/api/session-data/nachalnik', {}, adminCookie);
  assert.equal(adminOtherRole.status, 403);
  const noCsrf = await sessionApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username: 'blocked.create', displayName: 'Blocked Create', role: 'zam' })
  }, adminCookie);
  assert.equal(noCsrf.status, 403);

  const create = await sessionApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username: 'employee.zam', displayName: 'CI Employee', role: 'zam' })
  }, adminCookie, adminCsrf);
  assert.equal(create.status, 201);
  const created = await create.json();
  employeeId = created.user.id;
  employeeTemporaryPassword = created.temporaryPassword;
  assert.ok(employeeTemporaryPassword.length >= 20);
  assert.equal(created.user.mustChangePassword, true);

  const employeeLogin = await sessionApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'employee.zam', password: employeeTemporaryPassword })
  });
  assert.equal(employeeLogin.status, 200);
  const loginBody = await employeeLogin.json();
  employeeCsrf = loginBody.csrfToken;
  employeeCookie = (employeeLogin.headers.get('set-cookie') || '').split(';')[0];
  assert.equal(loginBody.user.role, 'zam');
  assert.equal(loginBody.user.mustChangePassword, true);

  const blockedUntilPasswordChange = await sessionApi('/api/session-data/zam', {}, employeeCookie);
  assert.equal(blockedUntilPasswordChange.status, 403);

  const changed = await sessionApi('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: employeeTemporaryPassword,
      newPassword: 'CI-Employee-Changed-Password-2026!'
    })
  }, employeeCookie, employeeCsrf);
  assert.equal(changed.status, 200);

  const allowed = await sessionApi('/api/session-data/zam', {}, employeeCookie);
  assert.equal(allowed.status, 200);
  const employeeAdminDenied = await sessionApi('/api/admin/users', {}, employeeCookie);
  assert.equal(employeeAdminDenied.status, 403);
  const forbidden = await sessionApi('/api/session-data/nachalnik', {}, employeeCookie);
  assert.equal(forbidden.status, 403);

  const writeWithoutCsrf = await sessionApi('/api/session-data/zam', {
    method: 'PUT',
    body: JSON.stringify({ expectedVersion: 0, data: { ci: true } })
  }, employeeCookie);
  assert.equal(writeWithoutCsrf.status, 403);

  const write = await sessionApi('/api/session-data/zam', {
    method: 'PUT',
    body: JSON.stringify({ expectedVersion: 0, data: { ci: true } })
  }, employeeCookie, employeeCsrf);
  assert.equal(write.status, 200);
  assert.equal((await write.json()).version, 1);
  const stored = await pool.query('SELECT data FROM patrul_role_data WHERE role = $1', ['zam']);
  assert.equal(stored.rows[0].data.__patrul_encrypted, 1);
  assert.equal(JSON.stringify(stored.rows[0].data).includes('"ci":true'), false);

  const concurrent = await Promise.all([
    sessionApi('/api/session-data/zam', {
      method: 'PUT',
      body: JSON.stringify({ expectedVersion: 1, data: { winner: 'device-a' } })
    }, employeeCookie, employeeCsrf),
    sessionApi('/api/session-data/zam', {
      method: 'PUT',
      body: JSON.stringify({ expectedVersion: 1, data: { winner: 'device-b' } })
    }, employeeCookie, employeeCsrf)
  ]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
  const latest = await sessionApi('/api/session-data/zam', {}, employeeCookie);
  assert.equal(latest.status, 200);
  assert.ok(['device-a', 'device-b'].includes((await latest.json()).data.winner));
});


test('senior master has audited read-only access to every role cabinet', async () => {
  const roleList = await sessionApi('/api/control/roles', {}, adminCookie);
  assert.equal(roleList.status, 200);
  assert.deepEqual((await roleList.json()).roles.map(item => item.id), [
    'nachalnik', 'zam', 'uchet', 'dokumentoved', 'starshiy_patrulya'
  ]);

  for (const role of ['nachalnik', 'zam', 'uchet', 'dokumentoved']) {
    const read = await sessionApi('/api/control/role-data/' + role, {}, adminCookie);
    assert.equal(read.status, 200, 'control read should work for ' + role);
    const body = await read.json();
    assert.equal(body.role, role);
    assert.equal(body.readOnly, true);
    assert.equal(body.actorRole, 'uchet');

    const audit = await pool.query(
      "SELECT details FROM patrul_audit_log WHERE event_type='role_control_viewed' AND details->>'targetRole'=$1 ORDER BY id DESC LIMIT 1",
      [role]
    );
    assert.equal(audit.rowCount, 1, 'audit row should exist for ' + role);
    assert.equal(audit.rows[0].details.mode, 'read_only');
  }

  const write = await sessionApi('/api/control/role-data/nachalnik', {
    method: 'PUT',
    body: JSON.stringify({ data: { changedByControl: true } })
  }, adminCookie, adminCsrf);
  assert.equal(write.status, 405);

  const employeeDenied = await sessionApi('/api/control/role-data/nachalnik', {}, employeeCookie);
  assert.equal(employeeDenied.status, 403);
});

test('shared tasks can be assigned, tracked, and notified across roles', async () => {
  const noCsrf = await sessionApi('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ assigneeId: employeeId, title: 'Проверка поручения' })
  }, adminCookie);
  assert.equal(noCsrf.status, 403);

  const create = await sessionApi('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      assigneeId: employeeId,
      title: 'Проверить тестовое поручение',
      description: 'Проверить получение и изменение статуса',
      priority: 'Важный',
      dueDate: testDutyDate
    })
  }, adminCookie, adminCsrf);
  assert.equal(create.status, 201);
  const created = await create.json();
  assert.equal(created.task.assigneeId, employeeId);
  assert.equal(created.task.status, 'Новая');

  const recipients = await sessionApi('/api/tasks/recipients', {}, adminCookie);
  assert.equal(recipients.status, 200);
  assert.ok((await recipients.json()).recipients.some(person => person.id === employeeId));

  const inbox = await sessionApi('/api/tasks', {}, employeeCookie);
  assert.equal(inbox.status, 200);
  const inboxBody = await inbox.json();
  assert.equal(inboxBody.canViewAll, false);
  assert.ok(inboxBody.tasks.some(task => task.id === created.task.id));
  assert.ok(inboxBody.unreadNotifications >= 2);
  assert.ok(inboxBody.notifications.some(item => item.type === 'assigned'));
  assert.ok(inboxBody.notifications.some(item => item.type === 'due_today'));
  const repeatedInbox = await sessionApi('/api/tasks', {}, employeeCookie);
  assert.equal(repeatedInbox.status, 200);
  assert.equal((await repeatedInbox.json()).notifications.filter(item => item.type === 'due_today').length, 1);

  const blockedStatus = await sessionApi('/api/tasks/' + created.task.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'В работе' })
  }, employeeCookie);
  assert.equal(blockedStatus.status, 403);

  const status = await sessionApi('/api/tasks/' + created.task.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'В работе' })
  }, employeeCookie, employeeCsrf);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).task.status, 'В работе');

  const prematureComplete = await sessionApi('/api/tasks/' + created.task.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Выполнено' })
  }, employeeCookie, employeeCsrf);
  assert.equal(prematureComplete.status, 403);

  const review = await sessionApi('/api/tasks/' + created.task.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'На проверке' })
  }, employeeCookie, employeeCsrf);
  assert.equal(review.status, 200);
  assert.equal((await review.json()).task.status, 'На проверке');

  const revisionWithoutReason = await sessionApi('/api/tasks/' + created.task.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'На доработку' })
  }, adminCookie, adminCsrf);
  assert.equal(revisionWithoutReason.status, 400);

  const revision = await sessionApi('/api/tasks/' + created.task.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'На доработку', comment: 'Уточнить итоговую дату и приложить акт проверки.' })
  }, adminCookie, adminCsrf);
  assert.equal(revision.status, 200);
  assert.equal((await revision.json()).task.status, 'На доработку');

  const resume = await sessionApi('/api/tasks/' + created.task.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'В работе' })
  }, employeeCookie, employeeCsrf);
  assert.equal(resume.status, 200);
  assert.equal((await resume.json()).task.status, 'В работе');

  const finalReview = await sessionApi('/api/tasks/' + created.task.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'На проверке' })
  }, employeeCookie, employeeCsrf);
  assert.equal(finalReview.status, 200);
  assert.equal((await finalReview.json()).task.status, 'На проверке');

  const complete = await sessionApi('/api/tasks/' + created.task.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Выполнено' })
  }, adminCookie, adminCsrf);
  assert.equal(complete.status, 200);
  assert.equal((await complete.json()).task.status, 'Выполнено');

  const creatorInbox = await sessionApi('/api/tasks', {}, adminCookie);
  assert.equal(creatorInbox.status, 200);
  const creatorInboxBody = await creatorInbox.json();
  assert.equal(creatorInboxBody.canViewAll, true);
  assert.ok(creatorInboxBody.tasks.some(task => task.id === created.task.id));
  assert.ok(creatorInboxBody.unreadNotifications >= 1);

  const history = await sessionApi('/api/tasks/' + created.task.id + '/events', {}, employeeCookie);
  assert.equal(history.status, 200);
  const historyBody = await history.json();
  assert.equal(historyBody.events.length, 7);
  assert.deepEqual(historyBody.events.map(event => event.type), ['created','status_changed','status_changed','status_changed','status_changed','status_changed','status_changed']);
  assert.equal(historyBody.events[3].details.comment, 'Уточнить итоговую дату и приложить акт проверки.');

  const employeeRead = await sessionApi('/api/tasks/notifications/read', {
    method: 'POST',
    body: JSON.stringify({})
  }, employeeCookie, employeeCsrf);
  assert.equal(employeeRead.status, 200);
  const employeeReadInbox = await sessionApi('/api/tasks', {}, employeeCookie);
  assert.equal((await employeeReadInbox.json()).unreadNotifications, 0);

  const doneRead = await sessionApi('/api/tasks/notifications/read', {
    method: 'POST',
    body: JSON.stringify({})
  }, adminCookie, adminCsrf);
  assert.equal(doneRead.status, 200);

});

test('document numbers are server-issued sequentially per year and role-protected', async () => {
  const createUser = await sessionApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username: 'ci.documenter', displayName: 'CI Documenter', role: 'dokumentoved' })
  }, adminCookie, adminCsrf);
  assert.equal(createUser.status, 201);
  const temporaryPassword = (await createUser.json()).temporaryPassword;
  const login = await sessionApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'ci.documenter', password: temporaryPassword })
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  const docCookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const docCsrf = loginBody.csrfToken;
  const passwordChanged = await sessionApi('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: temporaryPassword, newPassword: 'CI-Documenter-Changed-Password-2026!' })
  }, docCookie, docCsrf);
  assert.equal(passwordChanged.status, 200);

  const withoutCsrf = await sessionApi('/api/documents/next-number', {
    method: 'POST',
    body: JSON.stringify({ date: '2026-12-01' })
  }, docCookie);
  assert.equal(withoutCsrf.status, 403);

  const wrongRole = await sessionApi('/api/documents/next-number', {
    method: 'POST',
    body: JSON.stringify({ date: '2026-12-01' })
  }, employeeCookie, employeeCsrf);
  assert.equal(wrongRole.status, 403);

  const invalidDate = await sessionApi('/api/documents/next-number', {
    method: 'POST',
    body: JSON.stringify({ date: '2026-02-31' })
  }, docCookie, docCsrf);
  assert.equal(invalidDate.status, 400);

  const concurrent = await Promise.all(Array.from({ length: 6 }, () => sessionApi('/api/documents/next-number', {
    method: 'POST',
    body: JSON.stringify({ date: '2026-12-01' })
  }, docCookie, docCsrf)));
  assert.deepEqual(concurrent.map(response => response.status), [201,201,201,201,201,201]);
  const numbers = await Promise.all(concurrent.map(async response => (await response.json()).number));
  assert.deepEqual(numbers.slice().sort(), ['001/2026','002/2026','003/2026','004/2026','005/2026','006/2026']);

  const nextYear = await sessionApi('/api/documents/next-number', {
    method: 'POST',
    body: JSON.stringify({ date: '2027-01-01' })
  }, docCookie, docCsrf);
  assert.equal(nextYear.status, 201);
  assert.equal((await nextYear.json()).number, '001/2027');

  const legacySeed = await sessionApi('/api/documents/next-number', {
    method: 'POST',
    body: JSON.stringify({ date: '2027-02-01', minimumSequence: 10 })
  }, docCookie, docCsrf);
  assert.equal(legacySeed.status, 201);
  assert.equal((await legacySeed.json()).number, '011/2027');
});

test('post kit issue aggregates duplicate rows and never over-issues stock', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/uchet.html'), 'utf8');
  const start = source.indexOf('function issuePostKit(t){');
  const end = source.indexOf('\nfunction returnPostKit', start);
  assert.ok(start >= 0 && end > start, 'post kit issue function must exist');
  const issueSource = source.slice(start, end);
  const kit = { id: 'post-1', name: 'КПП', items: [{ id: 'radio-1', name: 'Рация', qty: 2 }, { id: 'radio-1', name: 'Рация', qty: 2 }] };
  const item = { id: 'radio-1', name: 'Рация', state: 'Отличное' };
  const D = { postEquipment: [kit], items: [item], ops: [], set: { master: 'CI' } };
  let stock = 3, toastMessages = [], audit = [];
  const context = {
    D, GONE: ['Утеряно','Списано'], BAD: ['Требует ремонта','В ремонте','Неисправно'],
    postRecipient: p => 'Пост: '+p.id,
    postIssued: p => {
      const target='Пост: '+p.id;
      const qty=D.ops.filter(row=>row.w===target&&row.id==='radio-1').reduce((sum,row)=>sum+(row.op==='Выдача'?row.qty:row.op==='Возврат'?-row.qty:0),0);
      return qty>0?[{id:'radio-1',qty,item}]:[];
    },
    cur: () => stock,
    toast: message => toastMessages.push(message),
    aud: message => audit.push(message),
    draw: () => {},
    today: () => '2026-11-15'
  };
  const issue = vm.runInNewContext(issueSource+'; issuePostKit',context);
  issue({dataset:{id:'post-1'}});
  assert.equal(D.ops.length,0,'shortage must not partially issue any kit row');
  assert.match(toastMessages[0],/Недостаточно на складе/);

  stock=4;toastMessages=[];
  issue({dataset:{id:'post-1'}});
  assert.equal(D.ops.length,1,'duplicate rows must collapse to one stock operation');
  assert.equal(D.ops[0].qty,4,'duplicate quantities must be summed before issuing');
  assert.equal(D.ops[0].op,'Выдача');

  issue({dataset:{id:'post-1'}});
  assert.equal(D.ops.length,1,'repeated issue must not issue the kit twice');
  assert.match(toastMessages.at(-1),/уже выдан/);
});

test('role workspaces expose shared task and controlled inspection modules', () => {
  const workspace = fs.readFileSync(path.join(__dirname, '..', 'public/ops-workspace.js'), 'utf8');
  assert.ok(workspace.includes("id:'sharedTasks'"));
  assert.ok(workspace.includes("id:'roleControl'"));
  assert.ok(workspace.includes('/api/control/role-data/'));
  assert.ok(workspace.includes('/api/tasks/recipients'));
  assert.ok(workspace.includes("function loadChiefOperationalOverview"));
  assert.ok(workspace.includes("fetch('/api/shared-staff'"));
  assert.ok(workspace.includes("fetch('/api/patrol-senior/reports?limit=200'"));
  assert.ok(workspace.includes("D.duty[today()]"));
  assert.ok(workspace.includes("ops-chief-overview"));
  assert.ok(workspace.includes("id:'rollCall'"));
  assert.ok(workspace.includes("function rollCall("));
  assert.ok(workspace.includes("fetch('/api/shared-staff'"));
  assert.ok(workspace.includes('ops-rollcall-all-present'));
  assert.ok(workspace.includes('function printRollCall('));
  assert.ok(workspace.includes("window.addEventListener('afterprint',cleanup,{once:true})"));
  assert.ok(workspace.includes("window.addEventListener('pagehide',cleanup,{once:true})"));
  assert.ok(!workspace.includes("window.print();\\n    cleanup();"));
  assert.ok(workspace.includes('data-ops="rollcall-print"'));
  assert.ok(workspace.includes('ops-rollcall-print-surface'));
  assert.ok(workspace.includes("id:'inspections'"));
  assert.ok(workspace.includes("id:'handover'"));
  assert.ok(workspace.includes("id:'approvals'"));
  assert.ok(workspace.includes('ops-crossrole-task-summary'));
  assert.ok(workspace.includes('result.notifications'));
  assert.ok(workspace.includes('taskNotificationMarkup'));
  const seniorUiSource = fs.readFileSync(path.join(__dirname, '..', 'public/patrol-senior.js'), 'utf8');
  assert.ok(seniorUiSource.includes("taskTab.textContent=unreadCount"));
  assert.ok(seniorUiSource.includes("if(activeTab!=='tasks')loadSeniorTasks()"));
  assert.ok(workspace.includes('task-from-record'));
  assert.ok(workspace.includes('documentVersionModules'));
  assert.ok(workspace.includes('function saveDocumentVersion'));
  assert.ok(workspace.includes('function showRecordVersions'));
  assert.ok(workspace.includes('function restoreDocumentVersion'));
  assert.ok(workspace.includes('data-ops="versions"'));
  assert.ok(workspace.includes("saveDocumentVersion(existing)"));
  assert.ok(workspace.includes('startTaskFromRecord'));
  assert.ok(workspace.includes('/api/documents/next-number'));
  assert.ok(workspace.includes('minimumSequence'));
  assert.ok(workspace.includes('notificationMarkup'));
  assert.ok(workspace.includes('due_today'));
  const seniorUi = fs.readFileSync(path.join(__dirname, '..', 'public/patrol-senior.js'), 'utf8');
  assert.ok(seniorUi.includes('r.result.notifications'));
  assert.ok(seniorUi.includes('notificationMarkup'));
  const server = fs.readFileSync(path.join(__dirname, '..', 'server/server.js'), 'utf8');
  assert.ok(server.includes('008_document_numbering.sql'));
  const senior = fs.readFileSync(path.join(__dirname, '..', 'public/patrol-senior.js'), 'utf8');
  assert.ok(senior.includes('loadSeniorTasks'));
  assert.ok(senior.includes('/api/tasks'));
  assert.ok(senior.includes("data-task-history"));
  const master = fs.readFileSync(path.join(__dirname, '..', 'public/uchet.html'), 'utf8');
  assert.ok(master.includes('function issuePostKit'));
  assert.ok(master.includes('const issued=postIssued(p),changes=[],requirements=new Map()'));
  assert.ok(master.includes('requirements.set(id,(requirements.get(id)||0)+rawQuantity)'));
  assert.ok(master.includes('const quantity=Math.max(0,required-outstanding),available=cur(item)'));
  assert.ok(master.includes('function returnPostKit'));
  assert.ok(master.includes('kitissue:issuePostKit'));
  assert.ok(master.includes('kitreturn:returnPostKit'));
  assert.ok(master.includes('function postIssueSummary'));
  assert.ok(master.includes('Перед удалением поста оформите возврат выданного имущества'));
  assert.ok(master.includes("function postRecipient(p){return 'Пост: '+String(p.name||'').trim()+' ['+String(p.id||'')+']';}"));
  assert.ok(master.includes('function outstandingIssueQty'));
  assert.ok(master.includes('Нельзя выдавать неисправное имущество или имущество в ремонте'));
  assert.ok(master.includes('Нельзя удалить позицию: сначала оформите возврат всего выданного количества'));
});

test('shared personnel roster deduplicates legacy role lists and synchronizes across roles', async () => {
  const legacyHead = {
    set: {},
    staff: [
      { k: 'head-ivanov', name: 'Иванов Иван Иванович', pos: 'Патрульный', grp: '1', tel: '', st: 'в строю', sq: 1 },
      { k: 'head-duplicate', name: ' Иванов   Иван Иванович ', pos: 'Патрульный', grp: '1', tel: '', st: 'в строю' },
      { k: 'senior-sidorov', name: 'Сидоров Сергей Сергеевич', pos: 'Старший патруля', grp: '1', tel: '555-02', st: 'в строю', departmentId: 'head-dep-1', birthDate: '1998-04-12' }
    ],
    departments: [{ id: 'head-dep-1', name: 'Отделение 1', order: 1 }],
    duty: { [testDutyDate]: { rows: { 'КПП': [{ fio: 'Сидоров Сергей Сергеевич' }] } } }
  };
  const legacyDok = {
    set: {},
    staff: [
      { k: 'dok-ivanov', name: 'иванов иван иванович', pos: 'Патрульный', grp: '1', tel: '555-01', st: 'в строю' },
      { k: 'dok-petrov', name: 'Петров Пётр Петрович', pos: 'Патрульный', grp: '2', tel: '', st: 'в строю' }
    ],
    departments: [
      { id: 'dok-dep-1', name: 'Отделение 1', order: 1 },
      { id: 'dok-dep-2', name: 'Отделение 2', order: 2 }
    ]
  };
  for (const [role, data] of [['nachalnik', legacyHead], ['dokumentoved', legacyDok]]) {
    await pool.query(
      'INSERT INTO patrul_role_data(role,data,version,updated_at) VALUES($1,$2::jsonb,1,NOW()) ' +
      'ON CONFLICT(role) DO UPDATE SET data=EXCLUDED.data,version=patrul_role_data.version+1,updated_at=NOW()',
      [role, JSON.stringify(encryptData(data, role))]
    );
  }

  const deniedWrite = await sessionApi('/api/shared-staff', {
    method: 'PUT',
    body: JSON.stringify({ expectedVersion: 1, data: { staff: [], departments: [] } })
  }, employeeCookie);
  assert.equal(deniedWrite.status, 403);

  const initial = await sessionApi('/api/shared-staff', {}, employeeCookie);
  assert.equal(initial.status, 200);
  const initialBody = await initial.json();
  assert.equal(initialBody.data.staff.length, 3);
  assert.equal(initialBody.data.departments.length, 2);
  assert.equal(initialBody.data.aliases.nachalnik['head-duplicate'], 'head-ivanov');
  assert.equal(initialBody.data.aliases.dokumentoved['dok-ivanov'], 'head-ivanov');
  assert.equal(initialBody.data.departmentAliases.dokumentoved['dok-dep-1'], 'head-dep-1');
  assert.equal(initialBody.data.staff.find(person => person.k === 'head-ivanov').tel, '555-01');
  assert.equal(initialBody.data.staff.find(person => person.k === 'head-ivanov').departmentId, 'head-dep-1');
  
  const seniorListResponse = await sessionApi('/api/patrol-senior/eligible', {}, adminCookie);
  assert.equal(seniorListResponse.status, 200);
  const seniorList = await seniorListResponse.json();
  assert.ok(seniorList.seniors.some(person => person.staffKey === 'senior-sidorov' && !person.registered));
  const activationWithoutCsrf = await sessionApi('/api/patrol-senior/activation-code', {
    method: 'POST',
    body: JSON.stringify({ staffKey: 'senior-sidorov' })
  }, adminCookie);
  assert.equal(activationWithoutCsrf.status, 403);
  const invalidActivation = await sessionApi('/api/patrol-senior/enroll', {
    method: 'POST',
    body: JSON.stringify({ surname: 'Сидоров', activationCode: '11111111', pin: '246810' })
  });
  assert.equal(invalidActivation.status, 401);
  const issueCode = await sessionApi('/api/patrol-senior/activation-code', {
    method: 'POST',
    body: JSON.stringify({ staffKey: 'senior-sidorov' })
  }, adminCookie, adminCsrf);
  assert.equal(issueCode.status, 201);
  const issuedCode = await issueCode.json();
  assert.match(issuedCode.code, /^\d{8}$/);
  assert.equal(issuedCode.staffName, 'Сидоров Сергей Сергеевич');
  const seniorEnroll = await sessionApi('/api/patrol-senior/enroll', {
    method: 'POST',
    body: JSON.stringify({ surname: 'Сидоров', activationCode: issuedCode.code, pin: '246810' })
  });
  assert.equal(seniorEnroll.status, 201);
  const seniorBody = await seniorEnroll.json();
  assert.equal(seniorBody.user.role, 'starshiy_patrulya');
  const seniorCookie = (seniorEnroll.headers.get('set-cookie') || '').split(';')[0];

  // Head owns the schedule editor. Department assignments are written to the
  // independent schedule table; old embedded daily roster rows must not return.
  const headCreate=await sessionApi('/api/admin/users',{
    method:'POST',
    body:JSON.stringify({username:'employee.head',displayName:'CI Head',role:'nachalnik'})
  },adminCookie,adminCsrf);
  assert.equal(headCreate.status,201);
  const headCreated=await headCreate.json();
  const headLogin=await sessionApi('/api/auth/login',{
    method:'POST',
    body:JSON.stringify({username:'employee.head',password:headCreated.temporaryPassword})
  });
  assert.equal(headLogin.status,200);
  const headLoginBody=await headLogin.json();
  const headCookie=(headLogin.headers.get('set-cookie')||'').split(';')[0];
  const headCsrf=headLoginBody.csrfToken;
  const headPasswordChanged=await sessionApi('/api/auth/change-password',{
    method:'POST',
    body:JSON.stringify({currentPassword:headCreated.temporaryPassword,newPassword:'CI-Head-Changed-Password-2026!'})
  },headCookie,headCsrf);
  assert.equal(headPasswordChanged.status,200);
  const cleanHeadData=await sessionApi('/api/session-data/nachalnik',{},headCookie);
  assert.equal(cleanHeadData.status,200);
  const cleanHeadBody=await cleanHeadData.json();
  assert.equal(Object.prototype.hasOwnProperty.call(cleanHeadBody.data,'duty'),false);

  const scheduleWrite=await sessionApi('/api/duty-schedule',{
    method:'PUT',
    body:JSON.stringify({
      date:testDutyDate,expectedVersion:0,
      assignments:[{departmentId:'head-dep-1',departmentName:'Отделение 1',post:'КПП',seniorId:'senior-sidorov',seniorName:'Сидоров Сергей Сергеевич'}],
      substitutions:[]
    })
  },headCookie,headCsrf);
  assert.equal(scheduleWrite.status,200);

  const independentRoster=await sessionApi('/api/duty-roster?date='+encodeURIComponent(testDutyDate),{},headCookie);
  assert.equal(independentRoster.status,200);
  const independentRosterBody=await independentRoster.json();
  assert.deepEqual(independentRosterBody.data,{});
  const seniorCannotReadFullRoster=await sessionApi('/api/duty-roster?date='+encodeURIComponent(testDutyDate),{},seniorCookie);
  assert.equal(seniorCannotReadFullRoster.status,403);

  // Bulk rebuild must include calendar dates even before a daily roster row exists.
  const bulkRosterBefore=await sessionApi('/api/duty-roster?all=1',{},headCookie);
  assert.equal(bulkRosterBefore.status,200);
  const bulkBeforeBody=await bulkRosterBefore.json();
  const scheduledOnlyDay=bulkBeforeBody.items.find(item=>item.date===testDutyDate);
  assert.ok(scheduledOnlyDay,'scheduled date must be returned for all-date rebuild');
  assert.equal(scheduledOnlyDay.version,0);
  assert.equal(scheduledOnlyDay.data,null);
  assert.equal(scheduledOnlyDay.schedule.assignments.length,1);

  const createScheduledRoster=await sessionApi('/api/duty-roster',{
    method:'PUT',
    body:JSON.stringify({
      date:testDutyDate,expectedVersion:0,
      data:{rows:{'КПП':[{fio:'Сидоров Сергей Сергеевич',pos:'Старший патруля'}]}}
    })
  },headCookie,headCsrf);
  assert.equal(createScheduledRoster.status,200);
  assert.equal((await createScheduledRoster.json()).version,1);

  const bulkRosterAfter=await sessionApi('/api/duty-roster?all=1',{},headCookie);
  assert.equal(bulkRosterAfter.status,200);
  const bulkAfterBody=await bulkRosterAfter.json();
  const savedScheduledDay=bulkAfterBody.items.find(item=>item.date===testDutyDate);
  assert.equal(savedScheduledDay.version,1);
  assert.equal(savedScheduledDay.data.rows['КПП'][0].fio,'Сидоров Сергей Сергеевич');
  const seniorControlView = await sessionApi('/api/control/role-data/starshiy_patrulya', {}, adminCookie);
  assert.equal(seniorControlView.status, 200);
  const seniorControlBody = await seniorControlView.json();
  assert.equal(seniorControlBody.readOnly, true);
  assert.ok(seniorControlBody.data.accounts.some(account => account.displayName === 'Сидоров Сергей Сергеевич'));
  const patrolCannotInspect = await sessionApi('/api/control/role-data/nachalnik', {}, seniorCookie);
  assert.equal(patrolCannotInspect.status, 403);
  const seniorCannotAssignTasks = await sessionApi('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ assigneeId: employeeId, title: 'Поручение без полномочий' })
  }, seniorCookie, seniorBody.csrfToken);
  assert.equal(seniorCannotAssignTasks.status, 403);
  const reusedCode = await sessionApi('/api/patrol-senior/enroll', {
    method: 'POST',
    body: JSON.stringify({ surname: 'Сидоров', activationCode: issuedCode.code, pin: '135790' })
  });
  assert.equal(reusedCode.status, 409);
  const seniorWorkspace = await sessionApi('/api/patrol-senior/workspace?date=' + testDutyDate, {}, seniorCookie);
  assert.equal(seniorWorkspace.status, 200);
  const seniorWorkspaceBody = await seniorWorkspace.json();
  assert.equal(seniorWorkspaceBody.department.id, 'head-dep-1');
  assert.equal(seniorWorkspaceBody.post, 'КПП');
  assert.equal(seniorWorkspaceBody.roster.length, 2);
  const seniorSharedDenied = await sessionApi('/api/shared-staff', {}, seniorCookie);
  assert.equal(seniorSharedDenied.status, 403);
  const seniorEligibleDenied = await sessionApi('/api/patrol-senior/eligible', {}, seniorCookie);
  assert.equal(seniorEligibleDenied.status, 403);
  const seniorOtherRoleDenied = await sessionApi('/api/session-data/nachalnik', {}, seniorCookie);
  assert.equal(seniorOtherRoleDenied.status, 403);
  const seniorAdminDenied = await sessionApi('/api/admin/users', {}, seniorCookie);
  assert.equal(seniorAdminDenied.status, 403);
  const seniorAttendance = await sessionApi('/api/patrol-senior/entries', {
    method: 'POST',
    body: JSON.stringify({ type: 'attendance', date: seniorWorkspaceBody.date, staffKey: 'head-ivanov', status: 'present', title: 'Проверка явки' })
  }, seniorCookie, seniorBody.csrfToken);
  assert.equal(seniorAttendance.status, 201);
  const seniorAttendanceUpdate = await sessionApi('/api/patrol-senior/entries', {
    method: 'POST',
    body: JSON.stringify({ type: 'attendance', date: seniorWorkspaceBody.date, staffKey: 'head-ivanov', status: 'late', title: 'Повторная отметка явки' })
  }, seniorCookie, seniorBody.csrfToken);
  assert.equal(seniorAttendanceUpdate.status, 201);
  const queuedHandoverPayload = { type: 'shift_end', date: seniorWorkspaceBody.date, title: 'Передача смены', body: 'Принимает смену: Иванов\nНезакрытые вопросы: проверка поста\nСостояние имущества: без замечаний', clientEntryId: '9d2a59a1-1a7b-4a61-8f49-3b4c3a24e5c6' };
  const seniorHandover = await sessionApi('/api/patrol-senior/entries', {
    method: 'POST',
    body: JSON.stringify(queuedHandoverPayload)
  }, seniorCookie, seniorBody.csrfToken);
  assert.equal(seniorHandover.status, 201);
  const seniorHandoverRetry = await sessionApi('/api/patrol-senior/entries', {
    method: 'POST',
    body: JSON.stringify(queuedHandoverPayload)
  }, seniorCookie, seniorBody.csrfToken);
  assert.equal(seniorHandoverRetry.status, 200);
  assert.equal((await seniorHandoverRetry.json()).duplicate, true);
  const conflictingHandoverRetry = await sessionApi('/api/patrol-senior/entries', {
    method: 'POST',
    body: JSON.stringify({ ...queuedHandoverPayload, body: queuedHandoverPayload.body + '\\nИзменённые данные' })
  }, seniorCookie, seniorBody.csrfToken);
  assert.equal(conflictingHandoverRetry.status, 409);
  const supervisorReports = await sessionApi('/api/patrol-senior/reports', {}, adminCookie);
  assert.equal(supervisorReports.status, 200);
  const supervisorReportsBody = await supervisorReports.json();
  assert.ok(supervisorReportsBody.entries.some(entry => entry.type === 'attendance' && entry.staffKey === 'head-ivanov'));
  assert.ok(supervisorReportsBody.entries.some(entry => entry.type === 'shift_end' && entry.title === 'Передача смены' && entry.body.includes('Незакрытые вопросы')));
  assert.equal(supervisorReportsBody.entries.filter(entry => entry.type === 'shift_end' && entry.title === 'Передача смены').length, 1);
  assert.ok(Array.isArray(supervisorReportsBody.latestAttendance));
  assert.ok(supervisorReportsBody.latestAttendance.some(entry => entry.staffKey === 'head-ivanov' && entry.status === 'late'));
  assert.equal(supervisorReportsBody.latestAttendance.filter(entry => entry.staffKey === 'head-ivanov').length, 1);
  const seniorReportsDenied = await sessionApi('/api/patrol-senior/reports', {}, seniorCookie);
  assert.equal(seniorReportsDenied.status, 403);
  const seniorLogin = await sessionApi('/api/patrol-senior/login', {
    method: 'POST',
    body: JSON.stringify({ surname: 'Сидоров', pin: '246810' })
  });
  assert.equal(seniorLogin.status, 200);
  const seniorLoginBody = await seniorLogin.json();
  const seniorLoginCookie = (seniorLogin.headers.get('set-cookie') || '').split(';')[0];
  const changedPin = await sessionApi('/api/patrol-senior/change-pin', {
    method: 'POST',
    body: JSON.stringify({ currentPin: '246810', newPin: '135790' })
  }, seniorLoginCookie, seniorLoginBody.csrfToken);
  assert.equal(changedPin.status, 200);
  const oldPinLogin = await sessionApi('/api/patrol-senior/login', {
    method: 'POST',
    body: JSON.stringify({ surname: 'Сидоров', pin: '246810' })
  });
  assert.equal(oldPinLogin.status, 401);
  const newPinLogin = await sessionApi('/api/patrol-senior/login', {
    method: 'POST',
    body: JSON.stringify({ surname: 'Сидоров', pin: '135790' })
  });
  assert.equal(newPinLogin.status, 200);
  const seniorPasswordLoginDenied = await sessionApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: seniorBody.user.username, password: 'not-a-patrol-senior-password' })
  });
  assert.equal(seniorPasswordLoginDenied.status, 401);

  const duplicateAndNew = {
    staff: [
      ...initialBody.data.staff,
      { k: 'duplicate-from-zam', name: 'ИВАНОВ Иван Иванович', pos: 'Патрульный' },
      { k: 'zam-sidorov', name: 'Сидоров Сидор Сидорович', pos: 'Патрульный', grp: '3', tel: '', st: 'в строю' }
    ],
    departments: initialBody.data.departments
  };
  const write = await sessionApi('/api/shared-staff', {
    method: 'PUT',
    body: JSON.stringify({ expectedVersion: initialBody.version, data: duplicateAndNew })
  }, employeeCookie, employeeCsrf);
  assert.equal(write.status, 200);
  const written = await write.json();
  assert.equal(written.data.staff.length, 4);
  assert.equal(written.data.aliases.zam['duplicate-from-zam'], 'head-ivanov');

  const forbiddenKitWrite = await sessionApi('/api/shared-staff', {
    method: 'PUT',
    body: JSON.stringify({ expectedVersion: written.version, data: { ...written.data, postEquipment: [{ id: 'post-test', name: 'КПП', items: [{ id: 'item-1', name: 'Рация', qty: 2, unit: 'шт.' }] }] } })
  }, employeeCookie, employeeCsrf);
  assert.equal(forbiddenKitWrite.status, 403);

  const visibleToOtherRole = await sessionApi('/api/shared-staff', {}, adminCookie);
  assert.equal(visibleToOtherRole.status, 200);
  assert.deepEqual((await visibleToOtherRole.json()).data.staff, written.data.staff);

  const stored = await pool.query('SELECT data FROM patrul_shared_staff WHERE id=1');
  assert.equal(stored.rows[0].data.__patrul_encrypted, 1);
  assert.equal(JSON.stringify(stored.rows[0].data).includes('Иванов'), false);

  const expectedVersion = written.version;
  const race = await Promise.all([
    sessionApi('/api/shared-staff', {
      method: 'PUT',
      body: JSON.stringify({
        expectedVersion,
        data: { staff: [...written.data.staff, { k: 'race-a', name: 'Кузнецов Алексей' }], departments: written.data.departments }
      })
    }, employeeCookie, employeeCsrf),
    sessionApi('/api/shared-staff', {
      method: 'PUT',
      body: JSON.stringify({
        expectedVersion,
        data: { staff: [...written.data.staff, { k: 'race-b', name: 'Орлов Олег' }], departments: written.data.departments }
      })
    }, adminCookie, adminCsrf)
  ]);
  assert.deepEqual(race.map(response => response.status).sort(), [200, 409]);
  const latest = await sessionApi('/api/shared-staff', {}, adminCookie);
  assert.equal(latest.status, 200);
  assert.equal((await latest.json()).version, expectedVersion + 1);
});

test('role client loads and polls the shared personnel roster', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/cloud-sync.js'), 'utf8');
  assert.ok(source.includes("request('/api/shared-staff')"));
  assert.ok(source.includes("request('/api/shared-staff','PUT'"));
  assert.ok(source.includes('startSharedPolling'));
  assert.ok(source.includes('remapStaffReferences'));
  assert.ok(source.includes('postEquipment'));
  const masterPage = fs.readFileSync(path.join(__dirname, '..', 'public/uchet.html'), 'utf8');
  const chiefPage = fs.readFileSync(path.join(__dirname, '..', 'public/nachalnik.html'), 'utf8');
  assert.ok(masterPage.includes('function postKits'));
  assert.ok(chiefPage.includes('postKitText'));
});


test('internal mail supports role-to-role conversations and restricts access to participants', async () => {
  const adminMe = await sessionApi('/api/auth/me', {}, adminCookie);
  assert.equal(adminMe.status, 200);
  adminCsrf = (await adminMe.json()).csrfToken;

  const recipients = await sessionApi('/api/mail/recipients', {}, adminCookie);
  assert.equal(recipients.status, 200);
  const directory = await recipients.json();
  assert.ok(directory.users.some(user => user.id === employeeId && user.role === 'zam'));

  const noCsrf = await sessionApi('/api/mail/threads', {
    method: 'POST',
    body: JSON.stringify({ toUserId: employeeId, subject: 'Запрос', body: 'Текст запроса' })
  }, adminCookie);
  assert.equal(noCsrf.status, 403);

  const created = await sessionApi('/api/mail/threads', {
    method: 'POST',
    body: JSON.stringify({ toUserId: employeeId, subject: 'Проверка почты', body: 'Прошу подготовить ответ по вопросу.', attachments: [{ name: 'test.txt', data: 'VGVzdCBhdHRhY2htZW50' }] })
  }, adminCookie, adminCsrf);
  assert.equal(created.status, 201);
  const threadId = (await created.json()).threadId;

  const outsiderCreate = await sessionApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username: 'mail.outsider', displayName: 'Mail Outsider', role: 'nachalnik' })
  }, adminCookie, adminCsrf);
  assert.equal(outsiderCreate.status, 201);
  const outsiderTemp = (await outsiderCreate.json()).temporaryPassword;
  const outsiderLogin = await sessionApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'mail.outsider', password: outsiderTemp })
  });
  assert.equal(outsiderLogin.status, 200);
  const outsiderSession = await outsiderLogin.json();
  const outsiderCookie = (outsiderLogin.headers.get('set-cookie') || '').split(';')[0];
  const outsiderChange = await sessionApi('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: outsiderTemp, newPassword: 'CI-Mail-Outsider-Password-2026!' })
  }, outsiderCookie, outsiderSession.csrfToken);
  assert.equal(outsiderChange.status, 200);
  const privateThread = await sessionApi('/api/mail/threads/' + threadId, {}, outsiderCookie);
  assert.equal(privateThread.status, 404);
  const storedAttachment = await pool.query('SELECT id FROM patrul_mail_attachments WHERE thread_id=$1',[threadId]);
  assert.equal(storedAttachment.rowCount,1);
  const outsiderAttachment = await sessionApi('/api/mail/attachments/'+storedAttachment.rows[0].id,{},outsiderCookie);
  assert.equal(outsiderAttachment.status,404);

  const inbox = await sessionApi('/api/mail/threads?box=inbox', {}, employeeCookie);
  assert.equal(inbox.status, 200);
  assert.ok((await inbox.json()).threads.some(thread => thread.id === threadId && thread.unreadCount === 1));

  const employeeMe = await sessionApi('/api/auth/me', {}, employeeCookie);
  assert.equal(employeeMe.status, 200);
  const employeeToken = (await employeeMe.json()).csrfToken;
  const opened = await sessionApi('/api/mail/threads/' + threadId, {}, employeeCookie);
  assert.equal(opened.status, 200);
  const openedBody=await opened.json();
  assert.equal(openedBody.messages.length,1);
  assert.equal(openedBody.messages[0].attachments.length,1);
  const attachmentId=openedBody.messages[0].attachments[0].id;
  const attachmentPreview=await sessionApi('/api/mail/attachments/'+attachmentId,{},employeeCookie);
  assert.equal(attachmentPreview.status,200);
  assert.match(attachmentPreview.headers.get('content-type'),/text\/plain/);
  assert.match(attachmentPreview.headers.get('content-disposition'),/^inline;/);
  assert.equal(await attachmentPreview.text(),'Test attachment');
  const attachmentDownload=await sessionApi('/api/mail/attachments/'+attachmentId+'?download=1',{},employeeCookie);
  assert.equal(attachmentDownload.status,200);
  assert.match(attachmentDownload.headers.get('content-disposition'),/^attachment;/);
  assert.equal(await attachmentDownload.text(),'Test attachment');

  const archiveNoCsrf = await sessionApi('/api/mail/archive', {
    method: 'POST',
    body: JSON.stringify({ attachmentId: openedBody.messages[0].attachments[0].id })
  }, employeeCookie);
  assert.equal(archiveNoCsrf.status, 403);

  const archiveSave = await sessionApi('/api/mail/archive', {
    method: 'POST',
    body: JSON.stringify({ attachmentId: openedBody.messages[0].attachments[0].id })
  }, employeeCookie, employeeToken);
  assert.equal(archiveSave.status, 201);
  const archiveSaved = await archiveSave.json();
  assert.ok(archiveSaved.id);

  const archiveList = await sessionApi('/api/mail/archive', {}, employeeCookie);
  assert.equal(archiveList.status, 200);
  const archiveItems = (await archiveList.json()).items;
  assert.equal(archiveItems.length, 1);
  assert.equal(archiveItems[0].name, 'test.txt');

  const archivedPreview = await sessionApi('/api/mail/archive/' + archiveSaved.id, {}, employeeCookie);
  assert.equal(archivedPreview.status, 200);
  assert.match(archivedPreview.headers.get('content-disposition'), /^inline;/);
  assert.equal(await archivedPreview.text(), 'Test attachment');
  const archivedDownload = await sessionApi('/api/mail/archive/' + archiveSaved.id + '?download=1', {}, employeeCookie);
  assert.equal(archivedDownload.status, 200);
  assert.match(archivedDownload.headers.get('content-disposition'), /^attachment;/);
  assert.match(archivedDownload.headers.get('content-type'), /text\/plain/);
  assert.equal(await archivedDownload.text(), 'Test attachment');

  const duplicateArchive = await sessionApi('/api/mail/archive', {
    method: 'POST',
    body: JSON.stringify({ attachmentId: openedBody.messages[0].attachments[0].id })
  }, employeeCookie, employeeToken);
  assert.equal(duplicateArchive.status, 201);
  assert.equal((await duplicateArchive.json()).id, archiveSaved.id);

  const outsiderArchive = await sessionApi('/api/mail/archive/' + archiveSaved.id, {}, outsiderCookie);
  assert.equal(outsiderArchive.status, 404);

  const reply = await sessionApi('/api/mail/threads/' + threadId + '/messages', {
    method: 'POST',
    body: JSON.stringify({ body: 'Ответ подготовлен.', attachments: [{ name: 'reply.txt', data: 'UmVwbHkgZmlsZQ==' }, { name: 'reply.png', data: 'iVBORw0KGgo=' }] })
  }, employeeCookie, employeeToken);
  assert.equal(reply.status, 201);

  const conversation = await sessionApi('/api/mail/threads/' + threadId, {}, adminCookie);
  assert.equal(conversation.status, 200);
  const conversationBody = await conversation.json();
  assert.equal(conversationBody.messages.length, 2);
  assert.equal(conversationBody.messages[1].body, 'Ответ подготовлен.');
  assert.equal(conversationBody.messages[1].attachments.length,2);
  const replyText=conversationBody.messages[1].attachments.find(x=>x.name==='reply.txt');
  const replyImage=conversationBody.messages[1].attachments.find(x=>x.name==='reply.png');
  assert.ok(replyText&&replyImage);
  const replyDownload=await sessionApi('/api/mail/attachments/'+replyText.id+'?download=1',{},adminCookie);
  assert.equal(replyDownload.status,200);
  assert.equal(await replyDownload.text(),'Reply file');
  const imageDownload=await sessionApi('/api/mail/attachments/'+replyImage.id+'?download=1',{},adminCookie);
  assert.equal(imageDownload.status,200);
  assert.match(imageDownload.headers.get('content-type'),/image\/png/);
  assert.match(imageDownload.headers.get('content-disposition'),/filename\*=UTF-8''reply.png/);
  assert.deepEqual(Buffer.from(await imageDownload.arrayBuffer()),Buffer.from('iVBORw0KGgo=','base64'));

  const archiveDelete = await sessionApi('/api/mail/archive/' + archiveSaved.id, {
    method: 'DELETE'
  }, employeeCookie, employeeToken);
  assert.equal(archiveDelete.status, 200);
  const emptyArchive = await sessionApi('/api/mail/archive', {}, employeeCookie);
  assert.deepEqual((await emptyArchive.json()).items, []);
});

test('administrator can block a user and all that user sessions are revoked', async () => {
  const adminMe = await sessionApi('/api/auth/me', {}, adminCookie);
  assert.equal(adminMe.status, 200);
  adminCsrf = (await adminMe.json()).csrfToken;

  const block = await sessionApi('/api/admin/users/' + employeeId, {
    method: 'PATCH',
    body: JSON.stringify({ active: false, role: 'zam', displayName: 'CI Employee' })
  }, adminCookie, adminCsrf);
  assert.equal(block.status, 200);

  const revoked = await sessionApi('/api/session-data/zam', {}, employeeCookie);
  assert.equal(revoked.status, 401);
});


test('bootstrap cannot be repeated and administrator can inspect the audit trail', async () => {
  const replay = await sessionApi('/api/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify({
      bootstrapSecret: 'ci-bootstrap-secret-only-not-production',
      username: 'second.admin',
      displayName: 'Second Admin',
      password: 'CI-Second-Admin-Password-2026!'
    })
  });
  assert.equal(replay.status, 409);

  const me = await sessionApi('/api/auth/me', {}, adminCookie);
  assert.equal(me.status, 200);
  adminCsrf = (await me.json()).csrfToken;
  const audit = await sessionApi('/api/admin/audit?limit=100', {}, adminCookie, adminCsrf);
  assert.equal(audit.status, 200);
  const result = await audit.json();
  assert.ok(result.events.some(event => event.event_type === 'bootstrap_admin_created'));
  assert.ok(result.events.some(event => event.event_type === 'user_created'));
  assert.ok(result.events.some(event => event.event_type === 'user_updated'));
});


test('cross-origin login and bootstrap requests are rejected', async () => {
  for (const route of ['/api/auth/login', '/api/auth/bootstrap']) {
    const response = await fetch(baseUrl + route, {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ username: 'attacker', password: 'not-a-real-password', bootstrapSecret: 'invalid' })
    });
    assert.equal(response.status, 403, route + ' must reject a foreign Origin');
  }
});

test('login rate limit blocks repeated invalid credentials', async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await sessionApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'rate.limit.test', password: 'definitely-wrong-password' })
    });
    assert.equal(response.status, 401);
  }
  const limited = await sessionApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'rate.limit.test', password: 'definitely-wrong-password' })
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('administrator cannot disable or change the role of the last admin account', async () => {
  const me = await sessionApi('/api/auth/me', {}, adminCookie);
  assert.equal(me.status, 200);
  adminCsrf = (await me.json()).csrfToken;

  const disableSelf = await sessionApi('/api/admin/users/' + (await pool.query(
    'SELECT id FROM patrul_users WHERE username = $1', ['senior.master']
  )).rows[0].id, {
    method: 'PATCH',
    body: JSON.stringify({ active: false, role: 'uchet', displayName: 'CI Senior Master' })
  }, adminCookie, adminCsrf);
  assert.equal(disableSelf.status, 400);

  const changeOwnRole = await sessionApi('/api/admin/users/' + (await pool.query(
    'SELECT id FROM patrul_users WHERE username = $1', ['senior.master']
  )).rows[0].id, {
    method: 'PATCH',
    body: JSON.stringify({ active: true, role: 'nachalnik', displayName: 'CI Senior Master' })
  }, adminCookie, adminCsrf);
  assert.equal(changeOwnRole.status, 400);
});

test('password reset issues a temporary password and revokes existing sessions', async () => {
  const me = await sessionApi('/api/auth/me', {}, adminCookie);
  assert.equal(me.status, 200);
  adminCsrf = (await me.json()).csrfToken;

  const restore = await sessionApi('/api/admin/users/' + employeeId, {
    method: 'PATCH',
    body: JSON.stringify({ active: true, role: 'zam', displayName: 'CI Employee' })
  }, adminCookie, adminCsrf);
  assert.equal(restore.status, 200);

  const oldLogin = await sessionApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'employee.zam', password: 'CI-Employee-Changed-Password-2026!' })
  });
  assert.equal(oldLogin.status, 200);
  const oldCookie = (oldLogin.headers.get('set-cookie') || '').split(';')[0];

  const reset = await sessionApi('/api/admin/users/' + employeeId + '/reset-password', {
    method: 'POST',
    body: JSON.stringify({})
  }, adminCookie, adminCsrf);
  assert.equal(reset.status, 200);
  const temporaryPassword = (await reset.json()).temporaryPassword;
  assert.ok(temporaryPassword.length >= 20);

  const revoked = await sessionApi('/api/session-data/zam', {}, oldCookie);
  assert.equal(revoked.status, 401);

  const freshLogin = await sessionApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'employee.zam', password: temporaryPassword })
  });
  assert.equal(freshLogin.status, 200);
  const freshBody = await freshLogin.json();
  assert.equal(freshBody.user.mustChangePassword, true);
  const freshCookie = (freshLogin.headers.get('set-cookie') || '').split(';')[0];

  const changed = await sessionApi('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: temporaryPassword,
      newPassword: 'CI-Employee-After-Reset-2026!'
    })
  }, freshCookie, freshBody.csrfToken);
  assert.equal(changed.status, 200);

  const adminAgain = await sessionApi('/api/auth/me', {}, adminCookie);
  assert.equal(adminAgain.status, 200);
  adminCsrf = (await adminAgain.json()).csrfToken;
  const roleChange = await sessionApi('/api/admin/users/' + employeeId, {
    method: 'PATCH',
    body: JSON.stringify({ active: true, role: 'dokumentoved', displayName: 'CI Employee' })
  }, adminCookie, adminCsrf);
  assert.equal(roleChange.status, 200);
  const roleRevoked = await sessionApi('/api/session-data/zam', {}, freshCookie);
  assert.equal(roleRevoked.status, 401);
  const newRoleRevoked = await sessionApi('/api/session-data/dokumentoved', {}, freshCookie);
  assert.equal(newRoleRevoked.status, 401);
});

test('login rate limit also bounds attempts across different usernames from one IP', async () => {
  let blocked = false;
  for (let attempt = 0; attempt < 65; attempt += 1) {
    const response = await sessionApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'ip.limit.' + attempt, password: 'definitely-wrong-password' })
    });
    assert.ok([401, 429].includes(response.status), 'unexpected status on attempt ' + (attempt + 1));
    if (response.status === 429) blocked = true;
  }
  const overflow = await sessionApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'ip.limit.overflow', password: 'definitely-wrong-password' })
  });
  assert.equal(overflow.status, 429);
  assert.ok(Number(overflow.headers.get('retry-after')) > 0);
  assert.ok(blocked || overflow.status === 429);
});

test('expired server sessions are rejected', async () => {
  const cookieValue = adminCookie.split('=').slice(1).join('=');
  const tokenHash = require('node:crypto').createHash('sha256').update(decodeURIComponent(cookieValue)).digest();
  await pool.query(
    "UPDATE patrul_sessions SET created_at = NOW() - INTERVAL '13 days', expires_at = NOW() - INTERVAL '1 minute' WHERE token_hash = $1",
    [tokenHash]
  );
  const response = await sessionApi('/api/auth/me', {}, adminCookie);
  assert.equal(response.status, 401);
});



function createFakeIndexedDB() {
  const databases = new Map();
  function request(tx, operation) {
    const item = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      try {
        item.result = operation();
        if (typeof item.onsuccess === 'function') item.onsuccess({ target: item });
        queueMicrotask(() => { if (tx && typeof tx.oncomplete === 'function') tx.oncomplete({ target: tx }); });
      } catch (error) {
        item.error = error;
        if (tx) tx.error = error;
        if (typeof item.onerror === 'function') item.onerror({ target: item });
        if (tx && typeof tx.onabort === 'function') tx.onabort({ target: tx });
      }
    });
    return item;
  }
  class FakeDatabase {
    constructor() { this.stores = new Map(); this.objectStoreNames = { contains: name => this.stores.has(name) }; }
    createObjectStore(name, options = {}) {
      this.stores.set(name, { keyPath: options.keyPath || null, rows: new Map() });
      return this.objectStore(name);
    }
    objectStore(name, tx = null) {
      const data = this.stores.get(name);
      if (!data) throw new Error('Unknown object store: ' + name);
      return {
        get: key => request(tx, () => data.rows.get(key)),
        getAll: () => request(tx, () => Array.from(data.rows.values())),
        put: (value, explicitKey) => request(tx, () => {
          const key = data.keyPath ? value[data.keyPath] : explicitKey;
          if (key === undefined) throw new Error('Missing IndexedDB key');
          data.rows.set(key, value);
          return key;
        }),
        delete: key => request(tx, () => { data.rows.delete(key); return undefined; })
      };
    }
    transaction(name) {
      const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
      tx.objectStore = storeName => this.objectStore(storeName, tx);
      return tx;
    }
    close() {}
  }
  return {
    open(name) {
      const item = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        let db = databases.get(name);
        if (!db) {
          db = new FakeDatabase();
          databases.set(name, db);
          item.result = db;
          if (typeof item.onupgradeneeded === 'function') item.onupgradeneeded({ target: item });
        } else item.result = db;
        if (typeof item.onsuccess === 'function') item.onsuccess({ target: item });
      });
      return item;
    },
    peek(name, storeName, key) {
      const db = databases.get(name);
      return db && db.stores.get(storeName) ? db.stores.get(storeName).rows.get(key) : undefined;
    }
  };
}

test('Patrol Senior offline queue encrypts local records and replays them after reauthentication', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/patrol-senior.js'), 'utf8');
  const nl = String.fromCharCode(10);
  const hook = [
    'window.__offlineTest = {',
    '  setWorkspace(value) { workspace = value; },',
    '  getWorkspace() { return workspace; },',
    '  setRender(fn) { render = fn; },',
    '  setLoadWorkspace(fn) { loadWorkspace = fn; },',
    '  setRequest(fn) { request = fn; },',
    '  setActiveTab(value) { activeTab = value; },',
    '  getState() { return { offlineMode, pendingOfflineCount, flushingOffline, offlineWarning }; },',
    '  queueOfflineEntry, readOfflineEncrypted, saveOfflineEncrypted, listOfflineRecords,',
    '  removeOfflineRecord, restoreOfflineWorkspace, flushOfflineQueue, offlineKey',
    '};'
  ].join(nl) + nl;
  const instrumented = source.replace('init();' + nl + '})();', hook + '})();');
  assert.notEqual(instrumented, source, 'test instrumentation point must exist');
  const fakeIndexedDB = createFakeIndexedDB();
  const sessionValues = new Map();
  const sessionStorageMock = {
    getItem(key) { return sessionValues.has(key) ? sessionValues.get(key) : null; },
    setItem(key, value) { sessionValues.set(key, String(value)); },
    removeItem(key) { sessionValues.delete(key); }
  };
  const root = {
    innerHTML: '',
    querySelector() { return { addEventListener() {}, querySelector() { return { disabled: false }; } }; },
    querySelectorAll() { return []; }
  };
  const navigatorMock = { onLine: false };
  const windowMock = { indexedDB: fakeIndexedDB, crypto: webcrypto, addEventListener() {} };
  const context = {
    window: windowMock,
    document: { getElementById: () => root },
    indexedDB: fakeIndexedDB,
    crypto: webcrypto,
    navigator: navigatorMock,
    sessionStorage: sessionStorageMock,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Date,
    Map,
    Promise,
    queueMicrotask,
    alert() {}
  };
  vm.runInNewContext(instrumented, context, { filename: 'patrol-senior-offline.test.js' });
  const api = windowMock.__offlineTest;
  const userId = 'senior-user-offline-test';
  const savedAt = Date.now();
  sessionStorageMock.setItem('patrul-senior-offline-auth', JSON.stringify({ userId, savedAt }));
  api.setWorkspace({ user: { id: userId, role: 'starshiy_patrulya' }, senior: { name: 'Сидоров Сергей' }, roster: [{ name: 'Иванов Иван' }], date: new Date().toISOString().slice(0, 10), entries: [] });
  api.setRender(() => {});
  api.setActiveTab('tasks');

  const payload = {
    type: 'report',
    date: new Date().toISOString().slice(0, 10),
    title: 'Контрольная офлайн-запись',
    body: 'Конфиденциальное содержание, не должно лежать открытым текстом'
  };
  await api.queueOfflineEntry(payload);
  const pending = await api.listOfflineRecords('queue', userId);
  assert.equal(pending.length, 1);
  const clientEntryId = pending[0].id;
  const encrypted = fakeIndexedDB.peek('patrul-senior-secure-v1', 'queue', clientEntryId);
  assert.ok(encrypted && Array.isArray(encrypted.ciphertext));
  assert.equal(JSON.stringify(encrypted).includes(payload.body), false);
  const localKey = await api.offlineKey();
  assert.equal(localKey.extractable, false, 'offline AES-GCM key must be non-exportable');
  const cachedWorkspace = fakeIndexedDB.peek('patrul-senior-secure-v1', 'cache', 'workspace:' + userId);
  assert.ok(cachedWorkspace && Array.isArray(cachedWorkspace.ciphertext));
  assert.equal(JSON.stringify(cachedWorkspace).includes('Сидоров Сергей'), false,
    'cached workspace must not expose employee names in IndexedDB');
  const decrypted = await api.readOfflineEncrypted('queue', clientEntryId);
  assert.equal(decrypted.body, payload.body);
  assert.equal(decrypted.clientEntryId, clientEntryId);
  assert.equal(JSON.parse(sessionStorageMock.getItem('patrul-senior-offline-auth')).savedAt, savedAt,
    'queueing new offline work must not extend the eight-hour offline session');
  sessionStorageMock.setItem('patrul-senior-offline-auth', JSON.stringify({ userId, savedAt: Date.now() - 8 * 60 * 60 * 1000 - 1000 }));
  assert.equal(await api.restoreOfflineWorkspace(), false, 'offline restoration must stop after eight hours');
  sessionStorageMock.setItem('patrul-senior-offline-auth', JSON.stringify({ userId, savedAt }));

  let sent = [];
  api.setRequest(async (url, method, body) => {
    if (url === '/api/auth/me') {
      return { response: { ok: true, status: 200 }, result: { user: { id: userId, role: 'starshiy_patrulya' }, csrfToken: 'csrf-after-reconnect' } };
    }
    if (url === '/api/patrol-senior/entries') {
      sent.push({ method, body });
      return { response: { ok: true, status: 201 }, result: { duplicate: false } };
    }
    throw new Error('Unexpected offline replay request: ' + url);
  });
  api.setLoadWorkspace(async () => true);
  navigatorMock.onLine = true;
  await api.flushOfflineQueue();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.clientEntryId, clientEntryId);
  assert.equal((await api.listOfflineRecords('queue', userId)).length, 0);
  assert.equal(api.getState().pendingOfflineCount, 0);

  api.setWorkspace({ user: { id: userId, role: 'starshiy_patrulya' }, date: payload.date, entries: [] });
  await api.queueOfflineEntry({ ...payload, title: 'Вторая офлайн-запись' });
  const queuedBeforeExpiry = await api.listOfflineRecords('queue', userId);
  assert.equal(queuedBeforeExpiry.length, 1);
  api.setRequest(async () => ({ response: { ok: false, status: 401 }, result: { error: 'Сессия истекла' } }));
  await api.flushOfflineQueue();
  assert.equal((await api.listOfflineRecords('queue', userId)).length, 1,
    'an expired online session must not delete queued work');
  assert.equal(api.getWorkspace(), null);
  assert.equal(sessionStorageMock.getItem('patrul-senior-offline-auth'), null);
  assert.match(root.innerHTML, /Войдите снова, чтобы продолжить синхронизацию/);
});
