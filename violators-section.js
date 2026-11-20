/* Раздел «Нарушители»: общий реестр для начальника, документоведа и старшего мастера.
   Повторяет функции сайта реестра (patrol-system): список с фильтрами и сортировкой, досье студента,
   девианты с порогом, статистика, отчёт, проверка качества данных, корзина, журнал действий,
   резервная копия, импорт и экспорт CSV. Данные общие и хранятся на сервере (/api/violators);
   права ролей проверяет сервер, здесь они только скрывают лишние кнопки. */
(() => {
  'use strict';
  const ROLE = window.PATRUL_ROLE;
  const API = '/api/violators';
  const PER_PAGE = 50;
  const TITLES = { nachalnik: 'Начальник патруля', dokumentoved: 'Документовед патруля', uchet: 'Старший мастер патруля' };
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  /* ===================== ядро: чистые функции (проверяются тестами) ===================== */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayStr = () => iso(new Date());
  const addDays = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
  const monday = s => addDays(s, -((new Date(s + 'T12:00').getDay() + 6) % 7));
  const fmtD = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '—';
  const pc = s => String(s == null ? '' : s).replace(/ё/g, 'е').replace(/Ё/g, 'Е').toLowerCase();
  const nameKey = s => pc(s).replace(/\s+/g, ' ').trim();
  const cmpStr = (a, b) => String(a || '').localeCompare(String(b || ''), 'ru');
  const tsOf = r => (r.d || '') + ' ' + (r.t || '00:00');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);

  function countBy(list, fn) {
    const m = new Map();
    for (const r of list) { const k = fn(r) || 'не указано'; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]));
  }

  function filterRecords(list, f, devKeys) {
    const q = pc(f.q || '').trim(), name = pc(f.name || '').trim(), grp = pc(f.group || '').trim();
    return list.filter(r => {
      if (r.del) return false;
      if (f.type && r.type !== f.type) return false;
      if (f.from && r.d < f.from) return false;
      if (f.to && r.d > f.to) return false;
      if (name && !pc(r.fio).includes(name)) return false;
      if (grp && !pc(r.grp).includes(grp)) return false;
      if (f.comment && !String(r.comment || '').trim()) return false;
      if (f.dev && !(devKeys && devKeys.has(nameKey(r.fio)))) return false;
      if (q && !pc([r.fio, r.grp, r.patrol, r.comment, r.meas, r.type].join(' ')).includes(q)) return false;
      return true;
    });
  }

  function sortRecords(list, col, dir) {
    const get = { id: r => r.id, d: r => tsOf(r), patrol: r => r.patrol, fio: r => r.fio, grp: r => r.grp, type: r => r.type }[col] || (r => tsOf(r));
    return list.slice().sort((a, b) => {
      let c = col === 'id' ? a.id - b.id : cmpStr(get(a), get(b));
      if (!c) c = a.id - b.id;
      return dir === 'asc' ? c : -c;
    });
  }

  function deviantList(list, settings) {
    const min = Math.max(1, Number(settings && settings.deviantMin) || 2), reset = (settings && settings.resetAt) || '';
    const m = new Map();
    for (const r of list) {
      if (r.del || (reset && r.d < reset)) continue;
      const k = nameKey(r.fio);
      let e = m.get(k);
      if (!e) { e = { key: k, name: r.fio, count: 0, groups: new Set(), types: new Map(), last: '' }; m.set(k, e); }
      e.count++;
      if (r.grp) e.groups.add(r.grp);
      e.types.set(r.type, (e.types.get(r.type) || 0) + 1);
      if (tsOf(r) > e.last) { e.last = tsOf(r); e.name = r.fio; }
    }
    return [...m.values()].filter(e => e.count >= min).map(e => ({
      key: e.key, name: e.name, count: e.count, groups: [...e.groups].sort(cmpStr),
      topType: [...e.types.entries()].sort((a, b) => b[1] - a[1])[0][0], lastDate: e.last.slice(0, 10)
    })).sort((a, b) => b.count - a.count || cmpStr(a.name, b.name));
  }

  function dossierOf(list, name) {
    const k = nameKey(name);
    if (!k) return null;
    const items = list.filter(r => !r.del && nameKey(r.fio) === k).sort((a, b) => tsOf(b).localeCompare(tsOf(a)) || b.id - a.id);
    if (!items.length) return null;
    return {
      name: items[0].fio, total: items.length, records: items,
      byType: countBy(items, r => r.type),
      byMonth: countBy(items, r => r.d.slice(0, 7)).sort((a, b) => cmpStr(a[0], b[0])),
      byPatrol: countBy(items, r => r.patrol),
      groups: [...new Set(items.map(r => r.grp).filter(Boolean))].sort(cmpStr),
      first: items[items.length - 1].d, last: items[0].d
    };
  }

  function statsOf(list, today) {
    const act = list.filter(r => !r.del), wk0 = monday(today), pwk0 = addDays(wk0, -7), yest = addDays(today, -1);
    const m0 = today.slice(0, 7), pm = addDays(m0 + '-01', -1).slice(0, 7);
    const within = (a, b) => act.filter(r => r.d >= a && r.d <= b).length;
    const days = []; for (let i = 13; i >= 0; i--) { const d = addDays(today, -i); days.push([fmtD(d).slice(0, 5), act.filter(r => r.d === d).length]); }
    const hours = new Map(); act.forEach(r => { if (r.t) { const h = r.t.slice(0, 2) + ':00'; hours.set(h, (hours.get(h) || 0) + 1); } });
    return {
      total: act.length, today: act.filter(r => r.d === today).length, yesterday: act.filter(r => r.d === yest).length,
      week: within(wk0, today), prevWeek: within(pwk0, addDays(wk0, -1)),
      month: act.filter(r => r.d.slice(0, 7) === m0).length, prevMonth: act.filter(r => r.d.slice(0, 7) === pm).length,
      days, byType: countBy(act, r => r.type), byGroup: countBy(act, r => r.grp).slice(0, 10), byPatrol: countBy(act, r => r.patrol).slice(0, 10),
      byWeekday: WEEKDAYS.map((n, i) => [n, act.filter(r => (new Date(r.d + 'T12:00').getDay() + 6) % 7 === i).length]),
      byHour: [...hours.entries()].sort((a, b) => cmpStr(a[0], b[0])),
      top: countBy(act, r => r.fio).slice(0, 10)
    };
  }

  function qualityOf(list, today) {
    const act = list.filter(r => !r.del), spell = new Map(), by = new Map();
    act.forEach(r => {
      const k = nameKey(r.fio); if (!spell.has(k)) spell.set(k, new Set()); spell.get(k).add(r.fio);
      const g = r.fio + '\u0000' + r.type; if (!by.has(g)) by.set(g, []); by.get(g).push(r);
    });
    const dups = [];
    for (const items of by.values()) {
      items.sort((a, b) => a.d.localeCompare(b.d) || a.id - b.id);
      for (let i = 1; i < items.length; i++) {
        const gap = dayDiff(items[i - 1].d, items[i].d);
        if (gap >= 0 && gap <= 3) { dups.push({ name: items[i].fio, type: items[i].type, dates: fmtD(items[i - 1].d) + ' / ' + fmtD(items[i].d), laterId: items[i].id }); break; }
      }
    }
    const yearAgo = addDays(today, -365);
    return {
      total: act.length, empty: act.filter(r => !String(r.fio).trim() || !String(r.grp).trim()).slice(0, 50),
      variants: [...spell.entries()].filter(e => e[1].size > 1).map(e => [e[0], [...e[1]].sort(cmpStr)]).slice(0, 50),
      dups: dups.slice(0, 50), old: act.filter(r => r.d < yearAgo).length
    };
  }

  const CSV_HEAD = ['ID', 'Патрульный', 'ФИО студента', 'Группа', 'Тип нарушения', 'Комментарий', 'Дата и время', 'Принятые меры', 'Доведено до куратора', 'Место / пост'];
  const csvRows = list => list.map(r => [r.id, r.patrol, r.fio, r.grp, r.type, r.comment, r.d + ' ' + (r.t || '00:00') + ':00', r.meas, r.rep ? 'да' : 'нет', r.post]);
  const csvText = list => '﻿' + [CSV_HEAD, ...csvRows(list)].map(row => row.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');

  function parseCsv(txt) {
    txt = String(txt || '').replace(/^﻿/, '');
    const first = txt.split('\n')[0] || '';
    const delim = [';', '\t', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let r = [], c = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { r.push(c); c = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x.trim())) rows.push(r); r = []; }
      else c += ch;
    }
    r.push(c); if (r.some(x => x.trim())) rows.push(r);
    return rows.map(x => x.map(y => y.trim()));
  }

  function parseDate(v) {
    v = String(v || '');
    let m = v.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(m[2]) + '-' + pad(m[1]);
    m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : '';
  }
  function parseTime(v) {
    const m = String(v || '').replace(/\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4}/, '').match(/(\d{1,2})[:.](\d{2})/);
    return m ? pad(m[1]) + ':' + m[2] : '';
  }

  const IMPORT_FIELDS = [['fio', /фио|фамил|студент|обуча|name/i], ['grp', /груп/i], ['type', /тип|вид|наруш/i], ['patrol', /патрул|выявил|кто/i],
    ['meas', /мер[ыа]|результат|реш/i], ['rep', /куратор|доведен|доложен/i], ['post', /пост|мест/i], ['comment', /коммент|примеч|суть|описан|обстоят|причин/i],
    ['time', /^время$/i], ['date', /дат/i]];

  function mapImport(rows, today) {
    if (!rows.length) return { records: [], skipped: 0 };
    const head = rows[0], map = {}, used = new Set();
    IMPORT_FIELDS.forEach(([f, re]) => { const i = head.findIndex((h, idx) => !used.has(idx) && re.test(h)); if (i >= 0) { map[f] = i; used.add(i); } });
    let body;
    if (Object.keys(map).length >= 2 && map.fio != null) body = rows.slice(1);
    else {
      body = rows;
      Object.keys(map).forEach(k => delete map[k]);
      Object.assign(map, head.length >= 7 ? { patrol: 1, fio: 2, grp: 3, type: 4, comment: 5, date: 6 } : { fio: 0, grp: 1, type: 2, date: 3, comment: 4 });
    }
    const cell = (r, f) => (map[f] != null ? r[map[f]] || '' : '');
    const records = []; let skipped = 0;
    body.forEach(r => {
      const fio = cell(r, 'fio').trim();
      if (!fio) { skipped++; return; }
      const dc = cell(r, 'date');
      records.push({
        fio, grp: cell(r, 'grp'), type: cell(r, 'type'), patrol: cell(r, 'patrol'), comment: cell(r, 'comment'), meas: cell(r, 'meas'), post: cell(r, 'post'),
        d: parseDate(dc) || today, t: parseTime(cell(r, 'time')) || parseTime(dc), rep: /^(да|1|true|\+|y)/i.test(cell(r, 'rep').trim())
      });
    });
    return { records, skipped };
  }

  const legacyShape = r => ({ k: r.id, fio: r.fio, grp: r.grp, type: r.type, d: r.d, t: r.t, post: r.post, by: r.patrol, meas: r.meas, rep: !!r.rep, note: r.comment });
  const fromLegacy = v => ({ fio: v.fio || '', grp: v.grp || '', type: v.type || '', d: v.d || '', t: v.t || '', patrol: v.by || '', meas: v.meas || '', post: v.post || '', comment: v.note || '', rep: !!v.rep });

  const core = { pc, nameKey, esc, fmtD, addDays, monday, filterRecords, sortRecords, deviantList, dossierOf, statsOf, qualityOf, csvText, parseCsv, mapImport, legacyShape, fromLegacy, countBy };
  window.PatrulViolatorsCore = core;
  if (!['nachalnik', 'dokumentoved', 'uchet'].includes(ROLE) || typeof A === 'undefined' || typeof EXV === 'undefined' || typeof TABS === 'undefined') return;

  /* ===================== состояние ===================== */
  const V = { loaded: false, err: '', version: 0, records: [], settings: { types: [], deviantMin: 2, resetAt: '' }, perms: [], audit: [], trashDays: 30, busy: false, pulled: 0 };
  const S = { v: 'list', q: '', name: '', group: '', type: '', from: '', to: '', comment: false, dev: false, sort: 'd', dir: 'desc', page: 1, sel: new Set(), dos: '', rf: '', rt: '', check: null, pending: null };
  const memo = { ver: -1, act: [], devList: [], devKeys: new Set(), legacy: [] };
  const can = p => V.perms.includes(p);
  const lastVisitKey = 'vz_last_visit_' + ROLE;
  let prevVisit = '';
  try { prevVisit = localStorage.getItem(lastVisitKey) || ''; localStorage.setItem(lastVisitKey, new Date().toISOString()); } catch (_) { /* хранилище недоступно */ }
  let legacy = [];

  function derived() {
    if (memo.ver !== V.version) {
      memo.ver = V.version;
      memo.act = V.records.filter(r => !r.del);
      memo.devList = deviantList(memo.act, V.settings);
      memo.devKeys = new Set(memo.devList.map(x => x.key));
      memo.legacy = memo.act.map(legacyShape);
    }
    return memo;
  }

  const inTab = () => typeof tab !== 'undefined' && tab === 'vl';
  const redraw = () => { if (typeof draw === 'function') draw(1); };
  function canRedraw() {
    const a = document.activeElement;
    if (document.querySelector('#md .mod')) return false;
    return !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }
  const say = (m, undo) => { if (typeof toast === 'function') toast(m, undo); };

  /* ===================== сеть ===================== */
  async function call(method, url, body) {
    const f = window.PATRUL_API_REQUEST;
    if (typeof f !== 'function') throw new Error('not-ready');
    return f(url, method, body === undefined ? null : body);
  }
  function applyView(v) {
    V.loaded = true; V.err = '';
    V.version = v.version; V.records = v.records || []; V.settings = v.settings || V.settings; V.perms = v.perms || []; V.audit = v.audit || []; V.trashDays = v.trashDays || 30;
    V.pulled = Date.now(); memo.ver = -1;
    S.sel = new Set([...S.sel].filter(id => V.records.some(r => r.id === id && !r.del)));
    hookLegacy();
  }
  async function pull(force) {
    try {
      const { response, result } = await call('GET', API + (!force && V.loaded ? '?since=' + V.version : ''));
      if (!response.ok) { if (!V.loaded) V.err = result.error || 'Не удалось загрузить реестр'; return false; }
      V.pulled = Date.now();
      if (result.unchanged) return false;
      applyView(result);
      return true;
    } catch (_) { if (!V.loaded) V.err = 'Нет связи с сервером'; return false; }
  }
  async function act(ops, message, opts = {}) {
    if (V.busy) return null;
    V.busy = true;
    try {
      const { response, result } = await call('POST', API, { ops });
      if (!response.ok) { say(result.error || 'Не удалось выполнить действие'); return null; }
      applyView(result);
      if (typeof closeM === 'function') closeM();
      redraw();
      if (message) say(message, opts.undo);
      return result;
    } catch (_) { say('Нет связи с сервером. Повторите позже'); return null; }
    finally { V.busy = false; }
  }

  /* ===================== прежние данные начальника ===================== */
  function mappedGetter() { return derived().legacy; }
  function patchObject(o) {
    if (ROLE !== 'nachalnik' || !o || typeof o !== 'object') return;
    const d = Object.getOwnPropertyDescriptor(o, 'viol');
    if (d && d.get) return;
    const own = d && Array.isArray(d.value) ? d.value : [];
    if (own.length && o.violMigrated !== true) { legacy = own.slice(); return; }
    Object.defineProperty(o, 'viol', { get: mappedGetter, set() { /* данные общие: запись только через сервер */ }, enumerable: false, configurable: true });
  }
  function hookLegacy() {
    if (ROLE !== 'nachalnik') return;
    try {
      if (typeof D !== 'undefined') patchObject(D);
      if (typeof norm === 'function' && !norm.vzHooked) {
        const orig = norm;
        const wrapped = function (j) { const r = orig(j); patchObject(r); return r; };
        wrapped.vzHooked = true;
        norm = wrapped;
      }
    } catch (_) { /* интерфейс продолжит работать со своими данными */ }
  }
  const legacyPending = () => ROLE === 'nachalnik' && can('import') && legacy.length > 0 && typeof D !== 'undefined' && D.violMigrated !== true;

  /* ===================== отрисовка ===================== */
  const tag = (c, t) => '<span class="tag ' + c + '">' + esc(t) + '</span>';
  const typeTag = t => tag(/дисциплин|курен|алкогол|драк|насил/i.test(t) ? 'b' : /опозд|акт|форма|вид|пропуск/i.test(t) ? 'y' : '', t);
  const bars = rows => {
    const mx = Math.max(1, ...rows.map(r => r[1]));
    return rows.length ? rows.map(r => '<div class="vz-bar"><span class="vz-bl" title="' + esc(r[0]) + '">' + esc(r[0]) + '</span><div class="vz-bt"><div class="vz-bf" style="width:' + Math.round(r[1] * 100 / mx) + '%"></div></div><b>' + r[1] + '</b></div>').join('') : '<div class="mu small">Нет данных</div>';
  };
  const kpi = (n, label, cls) => '<div class="vz-kpi ' + (cls || '') + '"><b>' + esc(n) + '</b><span>' + esc(label) + '</span></div>';
  const fld = (label, id, value, type, cls, extra) => '<div class="' + (cls || '') + '"><label>' + esc(label) + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value) + '" ' + (extra || '') + '></div>';
  const empty = text => '<div class="card empty" style="text-align:center;padding:22px">' + esc(text) + '</div>';
  const fmtTs = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  function navHtml() {
    const items = [['list', 'Список'], ['dev', 'Девианты'], ['dos', 'Досье'], ['stats', 'Статистика'], ['rep', 'Отчёт']];
    if (can('delete')) items.push(['qual', 'Качество данных']);
    if (can('settings')) items.push(['set', 'Настройки']);
    if (can('restore')) items.push(['trash', 'Корзина']);
    if (can('audit')) items.push(['audit', 'Журнал действий']);
    if (can('replaceAll')) items.push(['tools', 'Служебное']);
    return '<div class="vz-nav noprint">' + items.map(i => '<button class="chip ' + (S.v === i[0] ? 'on' : '') + '" data-act="vz_go" data-v="' + i[0] + '">' + i[1] + '</button>').join('') + '</div>';
  }

  function listData() {
    const m = derived(), all = sortRecords(filterRecords(m.act, S, m.devKeys), S.sort, S.dir);
    const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    if (S.page > pages) S.page = pages;
    return { all, pages, rows: all.slice((S.page - 1) * PER_PAGE, S.page * PER_PAGE), devKeys: m.devKeys };
  }
  function rowsHtml(ld) {
    const canEdit = can('update'), canDel = can('delete');
    return ld.rows.map(r => '<tr class="r ' + (S.sel.has(r.id) ? 'sel' : '') + '"><td><input type="checkbox" class="vz-cb" data-vz="sel" data-id="' + r.id + '" ' + (S.sel.has(r.id) ? 'checked' : '') + '></td>' +
      '<td><b>' + r.id + '</b></td><td>' + fmtD(r.d) + '<div class="mu">' + esc(r.t) + '</div></td><td>' + esc(r.patrol || '—') + '</td>' +
      '<td><button class="vz-link" data-act="vz_dosier" data-name="' + esc(r.fio) + '">' + esc(r.fio) + '</button> ' + (ld.devKeys.has(nameKey(r.fio)) ? tag('b', 'Девиант') : '') + '</td>' +
      '<td>' + (r.grp ? tag('', r.grp) : '—') + '</td><td>' + typeTag(r.type) + (r.post ? '<div class="mu">' + esc(r.post) + '</div>' : '') + '</td>' +
      '<td>' + esc(r.comment || '—') + (r.meas ? '<div class="mu">Меры: ' + esc(r.meas) + '</div>' : '') + '</td>' +
      '<td>' + (r.rep ? tag('', 'доложено куратору') : tag('y', 'не доложено')) + '</td>' +
      '<td class="num">' + (canEdit ? '<button class="btn s g" data-act="vz_edit" data-id="' + r.id + '">Правка</button> ' : '') + (canDel ? '<button class="btn s g r" data-act="vz_del" data-id="' + r.id + '">Удалить</button>' : '') + '</td></tr>').join('') ||
      '<tr><td colspan="10" class="empty" style="text-align:center;padding:18px">Нарушения не найдены</td></tr>';
  }
  const pagerHtml = ld => ld.pages > 1 ? '<button class="btn g" data-act="vz_page" data-d="-1" ' + (S.page <= 1 ? 'disabled' : '') + '>← Назад</button><span class="mu">стр. ' + S.page + ' из ' + ld.pages + '</span><button class="btn g" data-act="vz_page" data-d="1" ' + (S.page >= ld.pages ? 'disabled' : '') + '>Вперёд →</button>' : '';
  const th = (c, label) => '<th><a data-act="vz_sort" data-c="' + c + '">' + label + (S.sort === c ? (S.dir === 'asc' ? ' ↑' : ' ↓') : '') + '</a></th>';

  function listView() {
    const m = derived(), t = todayStr(), wk = addDays(t, -7), ld = listData();
    const fresh = prevVisit ? m.act.filter(r => r.cAt > prevVisit && r.src !== ROLE).length : 0;
    const types = V.settings.types || [];
    let h = '';
    if (legacyPending()) h += '<div class="card" style="margin-bottom:14px;border-color:var(--yl)"><b>В прежнем разделе есть ' + legacy.length + ' записей.</b> Перенесите их в общий реестр, чтобы их видели документовед и старший мастер. <div class="bar" style="margin:10px 0 0"><button class="btn" data-act="vz_migrate">Перенести записи</button></div></div>';
    h += '<div class="vz-kpis">' + kpi(m.act.filter(r => r.d === t).length, 'сегодня') + kpi(m.act.filter(r => r.d >= wk && r.d <= t).length, 'за 7 дней') +
      kpi(m.devList.length, 'девиантов', m.devList.length ? 'y' : '') + kpi(fresh, 'новых с прошлого входа') + kpi(m.act.filter(r => !r.rep).length, 'не доложено кураторам') + '</div>';
    h += '<div class="bar noprint" style="flex-wrap:wrap"><button class="btn g" data-act="vz_quick" data-k="today">Сегодня</button><button class="btn g" data-act="vz_quick" data-k="week">Эта неделя</button><button class="btn g" data-act="vz_quick" data-k="comment">С комментариями</button><button class="btn g" data-act="vz_quick" data-k="dev">Девианты</button><button class="btn g" data-act="vz_quick" data-k="reset">Сбросить</button></div>';
    h += '<div class="card noprint" style="margin-bottom:14px"><div class="vz-filters">' +
      '<div><label>Глобальный поиск</label><input data-vz="q" id="vz_f_q" value="' + esc(S.q) + '" placeholder="Студент, патрульный, группа, комментарий…"></div>' +
      '<div><label>ФИО студента</label><input data-vz="name" id="vz_f_name" value="' + esc(S.name) + '" placeholder="Поиск…"></div>' +
      '<div><label>Группа</label><input data-vz="group" id="vz_f_group" value="' + esc(S.group) + '" placeholder="Напр. ЗЧС-205"></div>' +
      '<div><label>Тип нарушения</label><select data-vz="type" id="vz_f_type"><option value="">Все типы</option>' + types.map(x => '<option ' + (S.type === x ? 'selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></div>' +
      '<div><label>С даты</label><input type="date" data-vz="from" id="vz_f_from" value="' + esc(S.from) + '"></div>' +
      '<div><label>По дату</label><input type="date" data-vz="to" id="vz_f_to" value="' + esc(S.to) + '"></div></div></div>';
    h += '<div class="bar noprint" style="flex-wrap:wrap"><b id="vz-cnt">Список нарушений · всего: ' + ld.all.length + '</b><span class="mu" id="vz-selc"></span><span style="margin-left:auto"></span>' +
      (can('add') ? '<button class="btn" data-act="vz_new">+ Добавить нарушение</button>' : '') +
      (can('delete') ? '<button class="btn g r" data-act="vz_bulkdel">Удалить выбранные</button>' : '') +
      '<button class="btn g" data-act="vz_bulkexp">Экспорт выбранных</button><button class="btn g" data-act="vz_exp">Экспорт CSV</button>' +
      (can('import') ? '<button class="btn g" data-act="vz_imp">Восстановить из CSV</button><input type="file" id="vz_file" data-vz="file-import" accept=".csv,.txt,.tsv" hidden>' : '') + '</div>';
    h += '<div class="scroll"><table><thead><tr><th style="width:36px"><input type="checkbox" class="vz-cb" data-vz="selall" title="Выбрать все на странице"></th>' + th('id', '#') + th('d', 'Дата') + th('patrol', 'Патрульный') + th('fio', 'Студент') + th('grp', 'Группа') + th('type', 'Тип') + '<th>Комментарий</th><th>Куратор</th><th></th></tr></thead><tbody id="vz-tb">' + rowsHtml(ld) + '</tbody></table></div>';
    h += '<div class="vz-pg noprint" id="vz-pg">' + pagerHtml(ld) + '</div>';
    return h;
  }

  function devView() {
    const m = derived(), l = m.devList;
    return '<div class="bar noprint"><b>Список девиантов · ' + l.length + '</b><span class="mu">Порог: ' + (V.settings.deviantMin || 2) + '+ нарушений' + (V.settings.resetAt ? ' · учёт с ' + fmtD(V.settings.resetAt) : '') + '</span>' +
      (can('settings') ? '<button class="btn g" style="margin-left:auto" data-act="vz_go" data-v="set">Изменить порог</button>' : '') + '</div>' +
      (l.length ? '<div class="scroll"><table><thead><tr><th>ФИО студента</th><th>Нарушений</th><th>Группы</th><th>Преобладающий тип</th><th>Последнее нарушение</th><th></th></tr></thead><tbody>' +
        l.map(d => '<tr class="r"><td><b>' + esc(d.name) + '</b> ' + tag('b', 'Девиант') + '</td><td>' + tag('y', d.count) + '</td><td>' + esc(d.groups.join(', ') || '—') + '</td><td>' + typeTag(d.topType) + '</td><td>' + fmtD(d.lastDate) + '</td><td class="num"><button class="btn s g" data-act="vz_dosier" data-name="' + esc(d.name) + '">Досье</button></td></tr>').join('') + '</tbody></table></div>' : empty('Девиантов не выявлено'));
  }

  function dosView() {
    const m = derived(), names = [...new Set(m.act.map(r => r.fio))].sort(cmpStr).slice(0, 3000), data = S.dos ? dossierOf(m.act, S.dos) : null;
    let h = '<div class="card noprint" style="margin-bottom:14px"><div class="bar" style="margin:0"><input id="vz_dos_in" list="vz_names" style="flex:1;min-width:220px" value="' + esc(S.dos) + '" placeholder="Введите ФИО студента…"><button class="btn" data-act="vz_dossearch">Найти</button></div><datalist id="vz_names">' + names.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></div>';
    if (!S.dos) return h + empty('Выберите студента, чтобы увидеть его досье');
    if (!data) return h + empty('Студент «' + S.dos + '» не найден в базе');
    h += '<div class="vz-kpis">' + kpi(data.total, 'нарушений') + kpi(data.groups.join(', ') || '—', 'группы студента') + kpi(fmtD(data.first), 'первое нарушение') + kpi(fmtD(data.last), 'последнее нарушение') + '</div>';
    h += '<h3 style="margin:0 0 10px">' + esc(data.name) + (m.devKeys.has(nameKey(data.name)) ? ' ' + tag('b', 'Девиант') : '') + '</h3>';
    h += '<div class="vz-grid"><div class="card"><h3 style="margin:0 0 8px">По типам нарушений</h3>' + bars(data.byType) + '</div><div class="card"><h3 style="margin:0 0 8px">По месяцам</h3>' + bars(data.byMonth) + '</div><div class="card"><h3 style="margin:0 0 8px">Кто фиксировал</h3>' + bars(data.byPatrol) + '</div></div>';
    h += '<div class="sec">Все нарушения · ' + data.total + '</div><div class="scroll"><table><thead><tr><th>Дата</th><th>Тип</th><th>Группа</th><th>Патрульный</th><th>Комментарий</th></tr></thead><tbody>' +
      data.records.map(r => '<tr><td>' + fmtD(r.d) + ' <span class="mu">' + esc(r.t) + '</span></td><td>' + typeTag(r.type) + '</td><td>' + esc(r.grp || '—') + '</td><td>' + esc(r.patrol || '—') + '</td><td>' + esc(r.comment || '—') + (r.meas ? '<div class="mu">Меры: ' + esc(r.meas) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
    return h;
  }

  function statsView() {
    const s = statsOf(derived().act, todayStr());
    const diff = (a, b) => (a >= b ? '+' : '−') + Math.abs(a - b) + ' к прошлому';
    return '<div class="vz-kpis">' + kpi(s.total, 'всего в базе') + kpi(s.today, 'сегодня (вчера: ' + s.yesterday + ')') + kpi(s.week, 'эта неделя · ' + diff(s.week, s.prevWeek)) + kpi(s.month, 'этот месяц · ' + diff(s.month, s.prevMonth)) + '</div>' +
      '<div class="vz-grid"><div class="card"><h3 style="margin:0 0 8px">За 14 дней</h3>' + bars(s.days) + '</div><div class="card"><h3 style="margin:0 0 8px">По типам</h3>' + bars(s.byType) + '</div><div class="card"><h3 style="margin:0 0 8px">По группам</h3>' + bars(s.byGroup) + '</div>' +
      '<div class="card"><h3 style="margin:0 0 8px">Кто фиксировал</h3>' + bars(s.byPatrol) + '</div><div class="card"><h3 style="margin:0 0 8px">По дням недели</h3>' + bars(s.byWeekday) + '</div><div class="card"><h3 style="margin:0 0 8px">По времени суток</h3>' + bars(s.byHour) + '</div>' +
      '<div class="card"><h3 style="margin:0 0 8px">Чаще всего нарушают</h3>' + bars(s.top) + '</div></div>';
  }

  function repView() {
    const t = todayStr(), from = S.rf || addDays(t, -6), to = S.rt || t, m = derived();
    const list = sortRecords(filterRecords(m.act, { from, to }), 'd', 'asc'), uniq = new Set(list.map(r => nameKey(r.fio))), cnt = new Map();
    list.forEach(r => cnt.set(nameKey(r.fio), (cnt.get(nameKey(r.fio)) || 0) + 1));
    const repeat = [...cnt.values()].filter(n => n >= 2).length;
    return '<div class="bar noprint" style="flex-wrap:wrap"><label class="mu">С</label><input type="date" data-vz="rf" value="' + esc(from) + '" style="width:auto"><label class="mu">по</label><input type="date" data-vz="rt" value="' + esc(to) + '" style="width:auto">' +
      '<button class="btn g" data-act="vz_period" data-k="week">Неделя</button><button class="btn g" data-act="vz_period" data-k="month">Месяц</button><button class="btn g" data-act="vz_period" data-k="all">Всё время</button><button class="btn" style="margin-left:auto" data-act="vz_print">Печать</button></div>' +
      '<div class="paper"><h2 style="text-align:center">ОТЧЁТ О НАРУШЕНИЯХ</h2><div style="text-align:center;margin-bottom:12px">за период с ' + fmtD(from) + ' по ' + fmtD(to) + '</div>' +
      '<p>Всего нарушений: <b>' + list.length + '</b>. Обучающихся: <b>' + uniq.size + '</b>, из них с повторными нарушениями: <b>' + repeat + '</b>.</p>' +
      '<div class="vz-grid"><div><b>По видам</b>' + bars(countBy(list, r => r.type)) + '</div><div><b>По группам</b>' + bars(countBy(list, r => r.grp).slice(0, 10)) + '</div></div>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:12px"><tr><th>№</th><th>Дата</th><th>ФИО</th><th>Группа</th><th>Вид</th><th>Комментарий / меры</th></tr>' +
      (list.map((r, i) => '<tr><td>' + (i + 1) + '</td><td>' + fmtD(r.d) + '</td><td>' + esc(r.fio) + '</td><td>' + esc(r.grp) + '</td><td>' + esc(r.type) + '</td><td>' + esc([r.comment, r.meas && 'Меры: ' + r.meas].filter(Boolean).join('. ')) + '</td></tr>').join('') || '<tr><td colspan="6" style="text-align:center">За выбранный период нарушений нет</td></tr>') + '</table></div>';
  }

  function qualView() {
    const q = qualityOf(derived().act, todayStr());
    return '<div class="vz-kpis">' + kpi(q.total, 'активных записей') + kpi(q.empty.length, 'с пустыми полями', q.empty.length ? 'y' : '') + kpi(q.variants.length, 'ФИО с разным написанием', q.variants.length ? 'y' : '') + kpi(q.dups.length, 'возможных дублей', q.dups.length ? 'y' : '') + kpi(q.old, 'старше года') + '</div>' +
      '<div class="sec">Возможные дубли (одно ФИО и вид в течение 3 дней)</div>' + (q.dups.length ? '<div class="scroll"><table><thead><tr><th>Студент</th><th>Вид</th><th>Даты</th><th></th></tr></thead><tbody>' + q.dups.map(d => '<tr><td>' + esc(d.name) + '</td><td>' + esc(d.type) + '</td><td>' + esc(d.dates) + '</td><td class="num"><button class="btn s g r" data-act="vz_dedup" data-id="' + d.laterId + '">Удалить повтор №' + d.laterId + '</button></td></tr>').join('') + '</tbody></table></div>' : empty('Дублей не найдено')) +
      '<div class="sec">Разные написания одного ФИО</div>' + (q.variants.length ? '<div class="scroll"><table><tbody>' + q.variants.map(v => '<tr><td>' + v[1].map(esc).join(' · ') + '</td></tr>').join('') + '</tbody></table></div>' : empty('Расхождений в написании нет')) +
      '<div class="sec">Записи с пустыми полями</div>' + (q.empty.length ? '<div class="scroll"><table><thead><tr><th>№</th><th>Дата</th><th>ФИО</th><th>Группа</th><th></th></tr></thead><tbody>' + q.empty.map(r => '<tr><td>' + r.id + '</td><td>' + fmtD(r.d) + '</td><td>' + esc(r.fio || '—') + '</td><td>' + esc(r.grp || '—') + '</td><td class="num">' + (can('update') ? '<button class="btn s g" data-act="vz_edit" data-id="' + r.id + '">Правка</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : empty('Пустых полей нет'));
  }

  function setView() {
    const types = V.settings.types || [];
    return '<div class="card" style="margin-bottom:14px"><h3 style="margin:0 0 8px">Девианты</h3><p class="mu" style="margin-top:0">Студент считается девиантом, если у него не меньше указанного числа нарушений с даты начала учёта.</p>' +
      '<div class="bar" style="margin:0;flex-wrap:wrap"><label class="mu">Порог</label><input type="number" id="vz_min" min="1" max="50" value="' + (V.settings.deviantMin || 2) + '" style="width:90px"><button class="btn" data-act="vz_setsave">Сохранить порог</button></div>' +
      '<div class="bar" style="margin:12px 0 0;flex-wrap:wrap"><span class="mu">Учёт ведётся ' + (V.settings.resetAt ? 'с ' + fmtD(V.settings.resetAt) : 'за всё время') + '</span><button class="btn g" data-act="vz_resetnow">Начать учёт с сегодняшнего дня</button>' + (V.settings.resetAt ? '<button class="btn g" data-act="vz_resetclear">Учитывать всё время</button>' : '') + '</div></div>' +
      '<div class="card"><h3 style="margin:0 0 8px">Виды нарушений</h3><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">' + types.map(x => '<span class="tag" style="padding:6px 10px">' + esc(x) + (x === 'Другое' ? '' : ' <a data-act="vz_typedel" data-t="' + esc(x) + '" style="cursor:pointer;margin-left:6px" title="Убрать">✕</a>') + '</span>').join('') + '</div>' +
      '<div class="bar" style="margin:0"><input id="vz_newtype" placeholder="Новый вид нарушения" style="flex:1;min-width:200px"><button class="btn" data-act="vz_typeadd">Добавить</button></div><p class="mu small">Убранный вид остаётся в старых записях, но выбрать его в новых нельзя.</p></div>';
  }

  function trashView() {
    const l = V.records.filter(r => r.del).sort((a, b) => b.del.localeCompare(a.del));
    return '<div class="bar noprint"><b>Корзина · ' + l.length + '</b><span class="mu">Записи хранятся ' + V.trashDays + ' дней, затем удаляются навсегда.</span>' + (l.length ? '<button class="btn g r" style="margin-left:auto" data-act="vz_purgeall">Очистить корзину</button>' : '') + '</div>' +
      (l.length ? '<div class="scroll"><table><thead><tr><th>№</th><th>Удалено</th><th>Студент</th><th>Группа</th><th>Тип</th><th>Дата нарушения</th><th></th></tr></thead><tbody>' + l.map(r => '<tr><td>' + r.id + '</td><td>' + esc(fmtTs(r.del)) + '</td><td>' + esc(r.fio) + '</td><td>' + esc(r.grp) + '</td><td>' + esc(r.type) + '</td><td>' + fmtD(r.d) + '</td><td class="num" style="white-space:nowrap"><button class="btn s" data-act="vz_restore" data-id="' + r.id + '">Восстановить</button> <button class="btn s g r" data-act="vz_purge" data-id="' + r.id + '">Навсегда</button></td></tr>').join('') + '</tbody></table></div>' : empty('Корзина пуста'));
  }

  function auditView() {
    return '<div class="bar noprint"><b>Журнал действий</b><span class="mu">Последние ' + V.audit.length + ' записей</span></div>' + (V.audit.length ? '<div class="scroll"><table><thead><tr><th>Время</th><th>Роль</th><th>Кто</th><th>Действие</th><th>Подробности</th></tr></thead><tbody>' + V.audit.map(a => '<tr><td>' + esc(fmtTs(a.ts)) + '</td><td>' + esc(TITLES[a.role] || a.role) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(a.action) + '</td><td class="mu">' + esc(a.details) + '</td></tr>').join('') + '</tbody></table></div>' : empty('Записей пока нет'));
  }

  function toolsView() {
    const trash = V.records.filter(r => r.del).length;
    const chk = S.check;
    return '<div class="vz-kpis">' + kpi('v' + V.version, 'версия данных') + kpi(V.records.length - trash, 'активных записей') + kpi(trash, 'в корзине') + kpi(V.pulled ? new Date(V.pulled).toLocaleTimeString('ru-RU') : '—', 'последнее обновление') + '</div>' +
      '<div class="vz-grid"><div class="card"><h3 style="margin:0 0 8px">Резервная копия</h3><p class="mu" style="margin-top:0">Файл содержит все записи, корзину и настройки. Храните его отдельно от сервера.</p><div class="bar" style="margin:0;flex-wrap:wrap"><button class="btn" data-act="vz_backup">Скачать копию</button><button class="btn g r" data-act="vz_dbimp">Восстановить из копии</button><input type="file" id="vz_dbfile" data-vz="file-backup" accept=".json" hidden></div></div>' +
      '<div class="card"><h3 style="margin:0 0 8px">Проверка данных</h3><p class="mu" style="margin-top:0">Ищет повторяющиеся номера, неверные даты и виды, которых нет в настройках.</p><div class="bar" style="margin:0"><button class="btn" data-act="vz_check">Проверить</button><button class="btn g" data-act="vz_refresh">Обновить с сервера</button></div>' +
      (chk ? '<div style="margin-top:10px">' + (chk.length ? chk.map(x => '<div class="small">• ' + esc(x) + '</div>').join('') : '<div class="small" style="color:var(--gr)">Проблем не найдено</div>') + '</div>' : '') + '</div></div>';
  }

  function vzView() {
    ensureFresh();
    const desc = ROLE === 'uchet' ? 'Служебный просмотр общего реестра: корзина, журнал действий, резервная копия и проверка данных. Записывают нарушения начальник и документовед.' :
      'Общий реестр обучающихся-нарушителей: запись, поиск, досье, девианты и отчёты. Записи видят начальник, документовед и старший мастер.';
    let body;
    if (!V.loaded) body = V.err ? '<div class="card" style="border-color:var(--red)"><b>' + esc(V.err) + '</b><div class="bar" style="margin:10px 0 0"><button class="btn" data-act="vz_refresh">Повторить</button></div></div>' : empty('Загрузка реестра…');
    else body = ({ list: listView, dev: devView, dos: dosView, stats: statsView, rep: repView, qual: qualView, set: setView, trash: trashView, audit: auditView, tools: toolsView }[S.v] || listView)();
    return '<h1>Нарушители</h1><p class="sub">' + esc(desc) + '</p><div class="vz">' + (V.loaded ? navHtml() : '') + body + '</div>';
  }

  /* ===================== формы ===================== */
  function formHtml(r) {
    const types = V.settings.types.slice();
    if (r.type && !types.includes(r.type)) types.unshift(r.type);
    const names = [...new Set(derived().act.map(x => x.fio))].sort(cmpStr).slice(0, 3000);
    const pats = [...new Set([...derived().act.map(x => x.patrol), ...(typeof D !== 'undefined' && Array.isArray(D.staff) ? D.staff.map(s => s.name) : [])].filter(Boolean))].sort(cmpStr).slice(0, 500);
    return '<h3>' + (r.id ? 'Нарушение №' + r.id : 'Новое нарушение') + '</h3><div class="vz-fg">' + fld('ФИО обучающегося', 'vz_fio', r.fio, 'text', 'w', 'list="vz_names" data-vz="fio" autocomplete="off"') + fld('Группа', 'vz_grp', r.grp) +
      '<div><label>Вид нарушения</label><select id="vz_type">' + types.map(x => '<option ' + (x === r.type ? 'selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></div>' +
      fld('Дата', 'vz_d', r.d, 'date') + fld('Время', 'vz_t', r.t, 'time') + fld('Кто выявил', 'vz_patrol', r.patrol, 'text', '', 'list="vz_pats"') + fld('Место / пост', 'vz_post', r.post, 'text', 'w') + fld('Принятые меры', 'vz_meas', r.meas, 'text', 'w') +
      '<div class="w"><label>Комментарий</label><textarea id="vz_comment" rows="3" style="width:100%">' + esc(r.comment) + '</textarea></div>' +
      '<div class="w"><label style="display:flex;flex-direction:row;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="vz_rep" style="width:auto;min-height:0" ' + (r.rep ? 'checked' : '') + '> Доведено до куратора группы</label></div></div>' +
      '<datalist id="vz_names">' + names.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist><datalist id="vz_pats">' + pats.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
      (r.id && r.who ? '<p class="mu small">Внёс: ' + esc(r.who) + (r.cAt ? ', ' + esc(fmtTs(r.cAt)) : '') + '</p>' : '') +
      '<div class="bar" style="margin:16px 0 0"><button class="btn" data-act="vz_save" data-id="' + (r.id || '') + '">Сохранить</button><button class="btn g" data-act="cl">Отмена</button>' + (r.id && can('delete') ? '<button class="btn g r" style="margin-left:auto" data-act="vz_del" data-id="' + r.id + '">Удалить</button>' : '') + '</div>';
  }
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const byId = id => V.records.find(r => r.id === Number(id));

  function download(name, text, type) {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function readText(file) {
    const b = await file.arrayBuffer();
    let s = new TextDecoder('utf-8').decode(b);
    if (s.includes('�')) s = new TextDecoder('windows-1251').decode(b);
    return s;
  }
  async function importRecords(records, keepTypes, label) {
    let added = 0, skipped = 0;
    for (let i = 0; i < records.length; i += 2000) {
      const r = await act([{ op: 'import', records: records.slice(i, i + 2000), keepTypes }]);
      if (!r) return null;
      added += r.results[0].added; skipped += r.results[0].skipped;
    }
    say(label + ': добавлено ' + added + (skipped ? ', пропущено ' + skipped : ''));
    return { added, skipped };
  }

  function refreshRows() {
    const tb = document.getElementById('vz-tb');
    if (!tb || !inTab() || S.v !== 'list') return redraw();
    const ld = listData();
    tb.innerHTML = rowsHtml(ld);
    const c = document.getElementById('vz-cnt'), p = document.getElementById('vz-pg');
    if (c) c.textContent = 'Список нарушений · всего: ' + ld.all.length;
    if (p) p.innerHTML = pagerHtml(ld);
    updSel();
  }
  function updSel() { const el = document.getElementById('vz-selc'); if (el) el.textContent = S.sel.size ? 'Выбрано: ' + S.sel.size : ''; }

  /* ===================== действия ===================== */
  const VA = {
    vz_go: t => { S.v = t.dataset.v; S.check = null; redraw(); },
    vz_sort: t => { const c = t.dataset.c; if (S.sort === c) S.dir = S.dir === 'asc' ? 'desc' : 'asc'; else { S.sort = c; S.dir = c === 'd' || c === 'id' ? 'desc' : 'asc'; } S.page = 1; redraw(); },
    vz_page: t => { S.page = Math.max(1, S.page + Number(t.dataset.d)); redraw(); },
    vz_quick: t => {
      const k = t.dataset.k, today = todayStr();
      if (k === 'reset') Object.assign(S, { q: '', name: '', group: '', type: '', from: '', to: '', comment: false, dev: false });
      else if (k === 'today') Object.assign(S, { from: today, to: today });
      else if (k === 'week') Object.assign(S, { from: monday(today), to: '' });
      else if (k === 'comment') S.comment = !S.comment;
      else if (k === 'dev') S.dev = !S.dev;
      S.page = 1; S.sel.clear(); redraw();
    },
    vz_refresh: async () => { await pull(true); redraw(); say('Данные обновлены'); },
    vz_new: () => {
      if (typeof modal !== 'function') return;
      const n = new Date();
      modal(formHtml({ d: todayStr(), t: pad(n.getHours()) + ':' + pad(n.getMinutes()), fio: '', grp: '', type: V.settings.types[0], patrol: '', post: '', meas: 'Профилактическая беседа', comment: '', rep: false }));
    },
    vz_edit: t => { const r = byId(t.dataset.id); if (r && typeof modal === 'function') modal(formHtml(r)); },
    vz_save: async t => {
      const id = Number(t.dataset.id) || 0, rec = { fio: val('vz_fio'), grp: val('vz_grp'), type: val('vz_type'), d: val('vz_d'), t: val('vz_t'), patrol: val('vz_patrol'), post: val('vz_post'), meas: val('vz_meas'), comment: val('vz_comment'), rep: !!(document.getElementById('vz_rep') || {}).checked };
      if (rec.fio.trim().length < 2) return say('Впишите ФИО обучающегося');
      if (!rec.d) return say('Укажите дату нарушения');
      if (!id && !rec.patrol.trim()) rec.patrol = TITLES[ROLE];
      await act([id ? { op: 'update', id, rec } : { op: 'add', rec }], id ? 'Изменения сохранены' : 'Нарушение записано');
    },
    vz_del: async t => {
      const id = Number(t.dataset.id), r = byId(id);
      if (!r || !confirm('Удалить запись №' + id + ' (' + r.fio + ')? Её можно будет вернуть только через старшего мастера.')) return;
      await act([{ op: 'delete', ids: [id] }], 'Запись перемещена в корзину', { undo: () => act([{ op: 'undo', ids: [id] }], 'Удаление отменено') });
    },
    vz_bulkdel: async () => {
      const ids = [...S.sel];
      if (!ids.length) return say('Выберите хотя бы одну запись');
      if (!confirm('Удалить выбранные записи: ' + ids.length + '? Вернуть их можно только через старшего мастера.')) return;
      S.sel.clear();
      await act([{ op: 'delete', ids }], 'Перемещено в корзину: ' + ids.length, { undo: () => act([{ op: 'undo', ids }], 'Удаление отменено') });
    },
    vz_bulkexp: () => { const l = V.records.filter(r => S.sel.has(r.id) && !r.del); if (!l.length) return say('Выберите хотя бы одну запись'); download('violations_selected_' + todayStr() + '.csv', csvText(l)); },
    vz_exp: () => { const l = sortRecords(filterRecords(derived().act, S, derived().devKeys), 'd', 'desc'); download('violations_' + todayStr() + '.csv', csvText(l)); say('Таблица сохранена: ' + l.length + ' записей'); },
    vz_imp: () => { const f = document.getElementById('vz_file'); if (f) f.click(); },
    vz_impgo: async () => { const p = S.pending; S.pending = null; if (p) await importRecords(p.records, false, 'Импорт из CSV'); },
    vz_dosier: t => { S.dos = t.dataset.name; S.v = 'dos'; redraw(); },
    vz_dossearch: () => { S.dos = val('vz_dos_in').trim(); redraw(); },
    vz_migrate: async () => {
      if (!legacyPending()) return;
      const r = await importRecords(legacy.map(fromLegacy), true, 'Перенос из прежнего раздела');
      if (r) { D.violMigrated = true; patchObject(D); legacy = []; redraw(); }
    },
    vz_period: t => { const k = t.dataset.k, today = todayStr(); if (k === 'week') { S.rf = addDays(today, -6); S.rt = today; } else if (k === 'month') { S.rf = today.slice(0, 8) + '01'; S.rt = today; } else { S.rf = '2000-01-01'; S.rt = today; } redraw(); },
    vz_print: () => window.print(),
    vz_dedup: async t => { const id = Number(t.dataset.id); if (confirm('Переместить повтор №' + id + ' в корзину?')) await act([{ op: 'delete', ids: [id] }], 'Повтор перемещён в корзину', { undo: () => act([{ op: 'undo', ids: [id] }], 'Удаление отменено') }); },
    vz_setsave: async () => { await act([{ op: 'settings', settings: { deviantMin: Number(val('vz_min')) } }], 'Порог сохранён'); },
    vz_resetnow: async () => { if (confirm('Начать учёт девиантов с сегодняшнего дня? Старые записи останутся в списке, но перестанут считаться повторными.')) await act([{ op: 'settings', resetNow: true }], 'Учёт начат с сегодняшнего дня'); },
    vz_resetclear: async () => { await act([{ op: 'settings', settings: { resetAt: '' } }], 'Учитываются все записи'); },
    vz_typeadd: async () => { const n = val('vz_newtype').trim(); if (!n) return say('Введите название вида'); await act([{ op: 'settings', settings: { types: [...V.settings.types.filter(x => x !== 'Другое'), n, 'Другое'] } }], 'Вид добавлен'); },
    vz_typedel: async t => { const n = t.dataset.t; if (confirm('Убрать вид «' + n + '» из списка?')) await act([{ op: 'settings', settings: { types: V.settings.types.filter(x => x !== n) } }], 'Вид убран'); },
    vz_restore: async t => { await act([{ op: 'restore', ids: [Number(t.dataset.id)] }], 'Запись восстановлена'); },
    vz_purge: async t => { if (confirm('Удалить запись навсегда? Это нельзя отменить.')) await act([{ op: 'purge', ids: [Number(t.dataset.id)] }], 'Запись удалена навсегда'); },
    vz_purgeall: async () => { if (confirm('Очистить корзину? Записи будут удалены навсегда.')) await act([{ op: 'purge', all: true }], 'Корзина очищена'); },
    vz_backup: () => { download('narushiteli_backup_' + todayStr() + '.json', JSON.stringify({ format: 'patrul-violators-1', exportedAt: new Date().toISOString(), records: V.records, settings: V.settings }, null, 1), 'application/json'); say('Резервная копия сохранена'); },
    vz_dbimp: () => { const f = document.getElementById('vz_dbfile'); if (f) f.click(); },
    vz_dbgo: async () => { const p = S.pending; S.pending = null; if (p && p.doc) await act([{ op: 'replaceAll', doc: p.doc, confirmEmpty: p.doc.records.length === 0 }], 'База восстановлена из копии'); },
    vz_check: () => {
      const probs = [], seen = new Set(), types = new Set(V.settings.types);
      V.records.forEach(r => {
        if (seen.has(r.id)) probs.push('Повторяется номер ' + r.id); seen.add(r.id);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.d)) probs.push('№' + r.id + ': неверная дата «' + r.d + '»');
        if (!types.has(r.type)) probs.push('№' + r.id + ': вида «' + r.type + '» нет в настройках');
        if (!String(r.fio).trim()) probs.push('№' + r.id + ': не указано ФИО');
      });
      S.check = probs.slice(0, 100); redraw();
    }
  };
  Object.assign(A, VA);

  /* ===================== события полей ===================== */
  document.addEventListener('input', ev => {
    const t = ev.target, k = t.dataset && t.dataset.vz;
    if (!k) return;
    if (['q', 'name', 'group'].includes(k)) { S[k] = t.value; S.page = 1; refreshRows(); }
    else if (k === 'fio') {
      const g = document.getElementById('vz_grp');
      if (g && !g.value) { const hit = derived().act.find(r => nameKey(r.fio) === nameKey(t.value) && r.grp); if (hit) g.value = hit.grp; }
    }
  });
  document.addEventListener('change', async ev => {
    const t = ev.target, k = t.dataset && t.dataset.vz;
    if (!k) return;
    if (['type', 'from', 'to'].includes(k)) { S[k] = t.value; S.page = 1; refreshRows(); }
    else if (k === 'rf' || k === 'rt') { S[k] = t.value; redraw(); }
    else if (k === 'sel') { const id = Number(t.dataset.id); if (t.checked) S.sel.add(id); else S.sel.delete(id); const tr = t.closest('tr'); if (tr) tr.classList.toggle('sel', t.checked); updSel(); }
    else if (k === 'selall') { listData().rows.forEach(r => { if (t.checked) S.sel.add(r.id); else S.sel.delete(r.id); }); refreshRows(); }
    else if (k === 'file-import' && t.files[0]) {
      const text = await readText(t.files[0]); t.value = '';
      const { records, skipped } = mapImport(parseCsv(text), todayStr());
      if (!records.length) return say('В файле не найдено записей');
      S.pending = { records };
      modal('<h3>Восстановление из CSV</h3><p>Найдено записей: <b>' + records.length + '</b>' + (skipped ? ' (пустых строк пропущено: ' + skipped + ')' : '') + '. Дубли уже существующих записей будут пропущены.</p><div class="bar" style="margin:16px 0 0"><button class="btn" data-act="vz_impgo">Импортировать</button><button class="btn g" data-act="cl">Отмена</button></div>');
    } else if (k === 'file-backup' && t.files[0]) {
      const text = await readText(t.files[0]); t.value = '';
      let doc = null; try { doc = JSON.parse(text); } catch (_) { /* не JSON */ }
      if (!doc || !Array.isArray(doc.records)) return say('Файл не похож на резервную копию реестра нарушителей');
      S.pending = { doc };
      modal('<h3>Восстановить из копии?</h3><p>В копии записей: <b>' + doc.records.length + '</b>. Текущие записи и настройки будут <b>заменены</b> данными из копии. Журнал действий сохранится.</p><div class="bar" style="margin:16px 0 0"><button class="btn g r" data-act="vz_dbgo">Заменить данные</button><button class="btn" data-act="cl">Отмена</button></div>');
    }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'vz_dos_in') { ev.preventDefault(); VA.vz_dossearch(); } });

  /* ===================== подключение к странице ===================== */
  const style = document.createElement('style');
  style.textContent = '.vz-nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}.vz-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 14px}' +
    '.vz-kpi{background:var(--card,#fff);border:1px solid var(--bd,#dce2ea);border-radius:12px;padding:12px 14px;min-width:0}.vz-kpi b{display:block;font-size:22px;overflow-wrap:anywhere}.vz-kpi span{color:var(--mu,#667487);font-size:12px}.vz-kpi.y{border-color:var(--yl,#a96f00);background:var(--yls,rgba(201,138,18,.12))}' +
    '.vz-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.vz-filters label,.vz-fg label{display:block;font-size:12px;font-weight:600;color:var(--mu,#667487);margin-bottom:4px}.vz-filters input,.vz-filters select,.vz-fg input,.vz-fg select{width:100%;box-sizing:border-box}' +
    '.vz-fg{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vz-fg .w{grid-column:1/-1}@media(max-width:560px){.vz-fg{grid-template-columns:1fr}}' +
    '.vz-bar{display:grid;grid-template-columns:minmax(90px,38%) 1fr 34px;gap:8px;align-items:center;margin:5px 0;font-size:13px}.vz-bl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vz-bt{height:9px;background:var(--hv,rgba(60,90,130,.07));border-radius:5px}.vz-bf{height:9px;background:var(--ac,#1f8a7d);border-radius:5px}.vz-bar b{text-align:right}' +
    '.vz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.vz tr.sel{background:var(--acs,rgba(31,138,125,.12))}.vz th a{color:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}' +
    '.vz-link{background:none;border:0;padding:0;color:inherit;border-bottom:1px dashed var(--mu,#667487);cursor:pointer;font:inherit;font-weight:700;text-align:left}.vz-pg{display:flex;gap:10px;align-items:center;justify-content:center;margin:12px 0}.vz-cb{width:18px;height:18px;min-height:0}';
  document.head.appendChild(style);

  if (typeof IC !== 'undefined' && !IC.vl) IC.vl = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01"/>';
  if (!TABS.some(x => x[0] === 'vl')) {
    const after = { dokumentoved: 'reg', uchet: 'by' }[ROLE], i = TABS.findIndex(x => x[0] === after);
    TABS.splice(i < 0 ? Math.max(0, TABS.length - 2) : i + 1, 0, ['vl', 'Нарушители']);
  }
  EXV.vl = vzView;
  hookLegacy();

  let lastEnsure = 0;
  function ensureFresh() {
    if (Date.now() - lastEnsure < 8000) return;
    lastEnsure = Date.now();
    pull(!V.loaded).then(changed => { if (changed && inTab() && canRedraw()) redraw(); });
  }

  let tries = 0;
  const boot = setInterval(async () => {
    tries++;
    if (V.loaded || tries > 90) return clearInterval(boot);
    if (typeof window.PATRUL_API_REQUEST !== 'function') return;
    if (await pull(true)) { clearInterval(boot); if ((ROLE === 'nachalnik' || inTab()) && canRedraw()) redraw(); }
  }, 2500);
  setInterval(async () => {
    if (!V.loaded || document.visibilityState !== 'visible' || V.busy) return;
    if (await pull(false) && (ROLE === 'nachalnik' || inTab()) && canRedraw()) redraw();
  }, 30000);
})();
