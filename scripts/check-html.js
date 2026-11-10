'use strict';

const fs = require('node:fs');
const vm = require('node:vm');

const rolePages = {
  'nachalnik.html': 'nachalnik',
  'zam.html': 'zam',
  'uchet.html': 'uchet',
  'dokumentoved.html': 'dokumentoved'
};

function fail(message) {
  console.error('FAIL: ' + message);
  process.exitCode = 1;
}

const server = fs.readFileSync('server.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
const cloudSync = fs.readFileSync('cloud-sync.js', 'utf8');
const cacheManifest = serviceWorker.match(/const ASSETS = \[([\s\S]*?)\];/);

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

if (countMatches(index, /name="theme-color"/g) !== 1 ||
    countMatches(index, /rel="apple-touch-icon"/g) !== 1) {
  fail('index.html must contain one theme-color and one apple-touch-icon declaration');
}


if (!server.includes("['/', 'index.html']")) fail('server does not serve / as index.html');

if (!server.includes("require('./auth')") || !server.includes('handleAuth(req, res, url)')) {
  fail('server must route requests through the individual authentication module');
}
if (!server.includes("require('./data-crypto')") || !server.includes('validateDataEncryptionKey()')) {
  fail('server must require the application data-encryption key before starting');
}
if (!server.includes("PATRUL_LEGACY_ROLE_TOKENS_ENABLED !== 'true'")) {
  fail('legacy shared role-token API must be disabled by default');
}
for (const route of ['/api/auth/login', '/api/auth/me', '/api/auth/change-password', '/api/admin/users', '/api/session-data/']) {
  if (!cloudSync.includes(route)) fail('browser client missing individual-auth route ' + route);
}
if (cloudSync.includes('Authorization') || cloudSync.includes('Bearer ')) {
  fail('browser client must not send shared bearer tokens');
}

if (!cloudSync.includes("const localDataKey = role + '_v1'") ||
    !cloudSync.includes('localStorage.removeItem(localDataKey)')) {
  fail('cloud sync must remove the plaintext role-data cache after server confirmation');
}
if (cloudSync.includes('originalSave()')) {
  fail('cloud sync must not persist full application data through the legacy localStorage save function');
}
if (!cloudSync.includes("window.addEventListener('beforeunload'")) {
  fail('cloud sync must warn before closing with unsaved in-memory changes');
}
if (!cloudSync.includes('function forcePasswordChange() {\n    return new Promise(resolve=>') || !cloudSync.includes('await forcePasswordChange()')) {
  fail('the workspace must wait for a required temporary-password change before loading data');
}
if (!cloudSync.includes('const material=JSON.stringify(copy)') || !cloudSync.includes('delete copy.sx.pw')) {
  fail('sync fingerprints and local conflict backups must not expose the exchange password');
}


for (const [file, role] of Object.entries(rolePages)) {
  if (!server.includes("['/" + file + "', '" + file + "']")) {
    fail('server route missing for ' + file);
  }
  if (!index.includes('href="' + file + '"')) fail('index.html link missing for ' + file);

  const html = fs.readFileSync(file, 'utf8');
  if (countMatches(html, /name="theme-color"/g) !== 1 ||
      countMatches(html, /rel="apple-touch-icon"/g) !== 1 ||
      countMatches(html, /name="apple-mobile-web-app-capable"/g) !== 1) {
    fail(file + ' must not contain duplicate PWA metadata declarations');
  }
  if (!html.includes("window.PATRUL_ROLE='" + role + "'")) {
    fail(file + ' has an incorrect or missing role identifier');
  }
  if (!html.includes('src="cloud-sync.js"')) fail(file + ' does not load cloud-sync.js');
  if (!html.includes('id="patrul-auth-gate"')) fail(file + ' must hide its workspace until authentication succeeds');
  if (html.includes('localStorage.setItem(KEY,JSON.stringify(D))')) fail(file + ' must not persist plaintext application data in localStorage');
  if (!html.includes('function load(){return norm(seed())')) fail(file + ' must not load legacy local data before authentication');
  if (!html.includes('delete copy.sx.pw')) fail(file + ' manual backup must not export the shared exchange password');
  if (!html.includes("if(!pw)throw new Error('needpw')") || !html.includes("throw new Error('unencrypted')") || html.includes("return useZ?'ПАТРУЛЬ1Z'")) fail(file + ' inter-role exchange must reject unencrypted packets');

  const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());

  if (!inlineScripts.length) fail(file + ' has no inline application script');

  inlineScripts.forEach((source, index) => {
    try {
      new vm.Script(source, { filename: file + ':inline-' + (index + 1) });
    } catch (error) {
      fail(file + ' inline script ' + (index + 1) + ': ' + error.message);
    }
  });

  console.log(file + ': ' + inlineScripts.length + ' inline script(s) checked');
}

for (const asset of ['cloud-sync.js', 'sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png']) {
  if (!server.includes("['/" + asset + "', '" + asset + "']")) {
    fail('server public-file allowlist missing ' + asset);
  }
}

if (!serviceWorker.includes("url.pathname.startsWith('/api/')")) {
  fail('service worker must bypass all API requests');
}
if (!serviceWorker.includes('ASSET_PATHS.has(url.pathname)')) {
  fail('service worker must cache only explicitly allowlisted static assets');
}
if (!cacheManifest || !cacheManifest[1].includes("'/cloud-sync.js'")) {
  fail('service worker static cache must include cloud-sync.js');
}

if (!serviceWorker.includes('cloud-sync.js')) {
  // The sync script is loaded by the HTML and cached through normal network fetches.
  console.log('sw.js: cloud-sync.js is fetched dynamically and cached by the fetch handler');
}

if (!process.exitCode) console.log('Patrul static checks passed.');
