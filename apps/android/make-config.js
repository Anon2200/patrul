'use strict';
// Создаёт capacitor.config.json из общего адреса сайта apps/app-config.json.
const fs = require('node:fs');
const path = require('node:path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app-config.json'), 'utf8'));
const url = String(process.env.PATRUL_APP_URL || cfg.url || '').replace(/\/+$/, '');
if (!/^https:\/\/[^/\s]+/.test(url)) { console.error('Нужен адрес сайта с https:// в apps/app-config.json'); process.exit(1); }
const out = {
  appId: 'ru.patrul.app',
  appName: cfg.name || 'Патруль',
  webDir: 'www',
  server: { url: url + '/', cleartext: false, allowNavigation: [new URL(url).host] },
  android: { allowMixedContent: false }
};
fs.writeFileSync(path.join(__dirname, 'capacitor.config.json'), JSON.stringify(out, null, 2) + '\n');
console.log('capacitor.config.json создан для', url);
