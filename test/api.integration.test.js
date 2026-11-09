'use strict';

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const port = 43187;
const baseUrl = `http://127.0.0.1:${port}`;
const tokens = {
  nachalnik: 'ci-token-nachalnik-not-production',
  zam: 'ci-token-zam-not-production',
  uchet: 'ci-token-uchet-not-production',
  dokumentoved: 'ci-token-dokumentoved-not-production'
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

async function authorizedApi(path, options = {}) {
  return api(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      authorization: `Bearer ${tokens[path.split('/').pop()] || tokens.nachalnik}`
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

test('data endpoints reject requests without a role token', async () => {
  const response = await api('/api/data/nachalnik');
  assert.equal(response.status, 401);
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

test('a role token cannot read another role', async () => {
  const response = await authorizedApi('/api/data/zam', {
    headers: { authorization: `Bearer ${tokens.nachalnik}` }
  });
  assert.equal(response.status, 401);
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
