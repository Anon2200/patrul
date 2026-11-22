'use strict';
// Окно «Патруля» для Windows: открывает рабочий сайт. Данные хранятся на сервере, поэтому нужен интернет.
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

function readConfig() {
  const candidates = [path.join(process.resourcesPath || '', 'app-config.json'), path.join(__dirname, '..', 'app-config.json')];
  for (const file of candidates) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* пробуем следующий путь */ }
  }
  return { name: 'Патруль', url: '' };
}

const config = readConfig();
const siteUrl = String(process.env.PATRUL_APP_URL || config.url || '').replace(/\/+$/, '');
let siteOrigin = '';
try { siteOrigin = new URL(siteUrl).origin; } catch (_) { /* адрес не задан */ }
const offlinePage = path.join(__dirname, 'offline.html');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function load() {
  if (!siteOrigin) return win.loadFile(offlinePage, { query: { reason: 'config' } });
  return win.loadURL(siteUrl + '/').catch(() => win.loadFile(offlinePage, { query: { url: siteUrl } }));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 600,
    title: config.name || 'Патруль', backgroundColor: '#0f172a', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  Menu.setApplicationMenu(null);

  // Внутри окна открывается только наш сайт, внешние ссылки уходят в обычный браузер.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).origin === siteOrigin) return { action: 'allow' }; } catch (_) { /* неверная ссылка */ }
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return;
    let origin = '';
    try { origin = new URL(url).origin; } catch (_) { /* пусто */ }
    if (origin !== siteOrigin) { event.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
  });
  win.webContents.on('did-fail-load', (_event, code, _desc, failedUrl, isMainFrame) => {
    if (isMainFrame && code !== -3 && !String(failedUrl).startsWith('file://')) win.loadFile(offlinePage, { query: { url: siteUrl } });
  });
  win.on('closed', () => { win = null; });
  load();
}

app.whenReady().then(() => {
  // Камера (сканирование QR) разрешена только для нашего сайта.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    let origin = '';
    try { origin = new URL(details.requestingUrl || wc.getURL()).origin; } catch (_) { /* пусто */ }
    callback(origin === siteOrigin && permission === 'media');
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
