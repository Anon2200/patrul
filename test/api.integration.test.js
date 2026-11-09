'use strict';

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
process.env.PATRUL_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');
const { encryptData, decryptData } = require('../data-crypto');

const port = 43187;
const baseUrl = `http://127.0.0.1:${port}`;
const tokens = {
  nachalnik: 'ci-only-nachalnik-token-2026-not-production',
  zam: 'ci-only-zam-token-2026-not-production',
  uchet: 'ci-only-uchet-token-2026-not-production',
  dokumentoved: 'ci-only-dokumentoved-token-2026-not-production'
};
const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/patrul_test';

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
    await pool.query('TRUNCATE TABLE patrul_role_data');
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

test('AES-GCM role data encryption authenticates ciphertext and role context', () => {
  const value = { privateMarker: 'must-not-leak', nested: { count: 7 } };
  const encrypted = encryptData(value, 'nachalnik');
  assert.deepEqual(decryptData(encrypted, 'nachalnik'), value);
  assert.throws(() => decryptData(encrypted, 'zam'));

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
  assert.equal(apiResponse.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(apiResponse.headers.get('cache-control'), 'no-store');

  const pageResponse = await api('/index.html');
  assert.equal(pageResponse.status, 200);
  assert.equal(pageResponse.headers.get('x-frame-options'), 'DENY');
  assert.equal(pageResponse.headers.get('cache-control'), 'no-store');
});

test('data endpoints reject requests without a role token', async () => {
  const response = await api('/api/data/nachalnik');
  assert.equal(response.status, 401);
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
  const me = await sessionApi('/api/auth/me', {}, adminCookie);
  assert.equal(me.status, 200);
  const meBody = await me.json();
  assert.equal(meBody.user.username, 'senior.master');
  adminCsrf = meBody.csrfToken;

  const adminRead = await sessionApi('/api/admin/users', {}, adminCookie);
  assert.equal(adminRead.status, 200);
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
  const audit = await sessionApi('/api/admin/audit?limit=20', {}, adminCookie, adminCsrf);
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
