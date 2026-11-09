(() => {
  'use strict';
  const role = window.PATRUL_ROLE;
  const tokenKey = 'patrul_role_access_' + role;
  const metaKey = 'patrul_cloud_meta_' + role;
  const api = '/api/data/' + encodeURIComponent(role);
  let version = 0, ready = false, busy = false, queued = false, suppressUpload = false, timer = null;
  const originalSave = save;

  const badge = document.createElement('div');
  badge.id = 'patrul-cloud-status';
  badge.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:10000;padding:7px 11px;border-radius:9px;background:#16304f;color:#fff;font:12px/1.4 system-ui;box-shadow:0 2px 12px #0003;max-width:260px';
  badge.textContent = 'Облако: не подключено';
  document.body.appendChild(badge);
  function status(s, color) {
    badge.textContent = 'Облако: ' + s;
    badge.style.background = color || '#16304f';
  }
  // Пароль шифрования обмена между ролями хранится только в браузере.
  // Никогда не отправляем его в PostgreSQL вместе с рабочими данными.
  function localSnapshot() {
    const copy = JSON.parse(JSON.stringify(D));
    if (copy.sx && typeof copy.sx === 'object') delete copy.sx.pw;
    return JSON.stringify(copy);
  }
  function loadCloudData(remoteData) {
    const localExchangePassword = D && D.sx && typeof D.sx.pw === 'string' ? D.sx.pw : '';
    D = norm(remoteData);
    if (D.sx && typeof D.sx === 'object') delete D.sx.pw;
    if (localExchangePassword) {
      if (!D.sx || typeof D.sx !== 'object') D.sx = {};
      D.sx.pw = localExchangePassword;
    }
  }
  function downloadLocalBackup(snapshot) {
    try {
      const blob = new Blob([snapshot], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = 'patrul-' + role + '-backup-' + stamp + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return true;
    } catch (_) {
      return false;
    }
  }
  function meta() { try { return JSON.parse(localStorage.getItem(metaKey) || 'null'); } catch (_) { return null; } }
  function saveMeta(snapshot) {
    try { localStorage.setItem(metaKey, JSON.stringify({ version, snapshot })); } catch (_) {}
  }
  async function request(method, body, token) {
    const response = await fetch(api, {
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    let result = {};
    try { result = await response.json(); } catch (_) {}
    return { response, result };
  }
  function loginPanel(message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;background:#08101ccc;display:grid;place-items:center;padding:16px';
      overlay.innerHTML = `<form style="background:#fff;color:#18222f;padding:22px;border-radius:14px;width:min(380px,100%);font:14px system-ui;box-shadow:0 16px 50px #0005"><h3 style="margin:0 0 8px">Подключение общей базы</h3><p style="margin:0 0 12px;color:#536174">Введите пароль доступа для раздела «${role}». Он не должен давать доступ к другим ролям.</p><p data-msg style="color:#b42318;margin:0 0 8px"></p><input type="password" autocomplete="current-password" placeholder="Пароль раздела" required style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit"><div style="display:flex;gap:8px;margin-top:14px"><button type="submit" style="flex:1;padding:10px;border:0;border-radius:8px;background:#167d70;color:white;font:600 14px system-ui">Подключить</button><button type="button" data-cancel style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#18222f;font:14px system-ui">Позже</button></div></form>`;
      document.body.appendChild(overlay);
      const form = overlay.querySelector('form'), input = overlay.querySelector('input'), msg = overlay.querySelector('[data-msg]');
      if (message) msg.textContent = message;
      input.focus();
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const value = input.value;
        if (!value) return;
        const button = form.querySelector('button[type=submit]');
        button.disabled = true; button.textContent = 'Проверка…';
        try {
          const { response, result } = await request('GET', null, value);
          if (response.status === 401) { msg.textContent = 'Пароль не подошёл. Проверьте его и попробуйте ещё раз.'; }
          else if (!response.ok) { msg.textContent = result.error || 'Не удалось подключиться.'; }
          else { overlay.remove(); resolve(value); return; }
        } catch (_) { msg.textContent = 'Нет связи с сервером. Проверьте интернет и повторите.'; }
        button.disabled = false; button.textContent = 'Подключить';
      });
      overlay.querySelector('[data-cancel]').addEventListener('click', () => { overlay.remove(); resolve(null); });
    });
  }
  async function upload(snapshot) {
    if (!ready || busy) { queued = true; return; }
    busy = true; queued = false;
    try {
      const { response, result } = await request('PUT', { expectedVersion: version, data: JSON.parse(snapshot) }, sessionStorage.getItem(tokenKey));
      if (response.status === 409) {
        ready = false;
        status('конфликт изменений — данные не перезаписаны', '#9a6700');
        alert('Обнаружены изменения этой роли на другом устройстве. Я не стал перезаписывать данные. Обновите страницу и проверьте актуальную версию.');
      } else if (response.status === 401) {
        ready = false; sessionStorage.removeItem(tokenKey);
        status('пароль изменён — обновите страницу', '#9a6700');
      } else if (!response.ok) {
        status('ошибка сохранения; копия осталась на устройстве', '#9a6700');
      } else {
        version = Number(result.version || version);
        saveMeta(snapshot);
        status('подключено · сохранено', '#176b50');
      }
    } catch (_) {
      status('нет связи; копия сохранена на устройстве', '#9a6700');
    } finally {
      busy = false;
      if (queued && ready) { queued = false; scheduleUpload(); }
    }
  }
  function scheduleUpload() {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(() => upload(localSnapshot()), 700);
  }
  save = function () {
    originalSave();
    if (ready && !suppressUpload) scheduleUpload();
  };

  async function start() {
    status('ожидает пароль');
    let token = sessionStorage.getItem(tokenKey);
    let data;
    if (!token) token = await loginPanel();
    if (!token) { status('работает только на этом устройстве', '#6b7280'); return; }
    try {
      let fetched = await request('GET', null, token);
      if (fetched.response.status === 401) {
        sessionStorage.removeItem(tokenKey);
        token = await loginPanel('Пароль этого раздела неверный или был заменён. Введите действующий пароль.');
        if (!token) { status('работает только на этом устройстве', '#6b7280'); return; }
        fetched = await request('GET', null, token);
      }
      if (!fetched.response.ok) throw new Error(fetched.result.error || 'Ошибка подключения');
      sessionStorage.setItem(tokenKey, token);
      data = fetched.result;
      version = Number(data.version || 0);
      const current = localSnapshot();
      const previous = meta();
      if (data.data === null) {
        ready = true;
        await upload(current);
      } else {
        const remoteCopy = norm(data.data);
        const remoteHadExchangePassword = !!(remoteCopy.sx && typeof remoteCopy.sx === 'object' && remoteCopy.sx.pw);
        if (remoteCopy.sx && typeof remoteCopy.sx === 'object') delete remoteCopy.sx.pw;
        const remoteSnapshot = JSON.stringify(remoteCopy);
        const localChanged = !!previous && previous.snapshot !== current;
        const serverChanged = !!previous && Number(previous.version) !== version;
        const firstConnectionConflict = !previous && current !== remoteSnapshot;
        const concurrentChangeConflict = localChanged && serverChanged;

        if (firstConnectionConflict || concurrentChangeConflict) {
          const useCloud = window.confirm(
            'На этом устройстве и в облаке есть разные данные.\\n\\n' +
            'Нажмите «ОК», чтобы сначала скачать резервную копию данных этого устройства, а затем открыть облачную версию.\\n' +
            'Нажмите «Отмена», чтобы оставить данные этого устройства без изменений и пока не подключать облако.'
          );
          if (!useCloud) {
            ready = false;
            status('разные версии — локальные данные сохранены', '#9a6700');
            return;
          }
          if (!downloadLocalBackup(current)) {
            ready = false;
            status('не удалось создать резервную копию', '#9a6700');
            alert('Не удалось скачать резервную копию. Данные не изменены. Освободите место для загрузок и повторите.');
            return;
          }
        } else if (localChanged && !serverChanged) {
          ready = true;
          await upload(current);
          return;
        }

        loadCloudData(data.data);
        originalSave();
        saveMeta(localSnapshot());
        ready = true;
        suppressUpload = true;
        try { draw(); } finally { suppressUpload = false; }
        status('подключено · данные загружены', '#176b50');
        if (remoteHadExchangePassword) await upload(localSnapshot());
      }
    } catch (err) {
      status('не удалось подключиться; локальная копия сохранена', '#9a6700');
      console.error('Patrul cloud sync:', err);
    }
  }
  start();
})();