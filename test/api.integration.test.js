'use strict';

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

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

test('health endpoint confirms PostgreSQL connectivity', async () => {
  const response = await api('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, database: 'connected' });
});

test('security headers are present on API and static responses', async () => {
  const apiResponse = await api('/api/health');
  assert.equal(apiResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(apiResponse.headers.get('x-frame-options'), 'DENY');
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

  const noCsrf = await sessionApi('/api/admin/users', {}, adminCookie);
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
