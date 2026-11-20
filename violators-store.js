'use strict';

// Общий реестр нарушителей: чистая логика над одним документом.
// Модуль не знает ни про базу, ни про HTTP: auth.js читает/пишет документ целиком,
// а здесь проверяются права роли и применяются операции. Благодаря этому логику можно
// проверить без PostgreSQL (test/violators-store.test.js).

const DEFAULT_TYPES = [
  'Нарушение лок. акта №36',
  'Нарушение лок. акта №2',
  'Опоздание',
  'Нарушение дисциплины',
  'Отсутствие студ. билета',
  'Курение в неположенном месте',
  'Другое'
];
const FALLBACK_TYPE = 'Другое';
const TRASH_DAYS = 30;
const UNDO_WINDOW_MS = 2 * 60 * 1000;
const MAX_RECORDS = 50000;
const MAX_AUDIT = 1000;
const MAX_TYPES = 40;
const MAX_OPS_PER_REQUEST = 5000;

// Права повторяют разделение в сайте реестра: «админ» записывает и правит,
// «разработчик» восстанавливает из корзины, смотрит журнал и копирует базу.
const ROLE_PERMS = {
  nachalnik: ['add', 'update', 'delete', 'import', 'settings'],
  dokumentoved: ['add', 'update', 'delete', 'import'],
  uchet: ['restore', 'purge', 'replaceAll', 'audit', 'settings']
};
const OP_PERM = {
  add: 'add',
  update: 'update',
  delete: 'delete',
  undo: 'delete',
  import: 'import',
  settings: 'settings',
  restore: 'restore',
  purge: 'purge',
  replaceAll: 'replaceAll'
};
const OP_LABEL = {
  add: 'добавлено нарушение',
  update: 'правка записи',
  delete: 'удаление в корзину',
  undo: 'отмена удаления',
  import: 'импорт из таблицы',
  settings: 'изменены настройки',
  restore: 'восстановление из корзины',
  purge: 'окончательное удаление',
  replaceAll: 'база восстановлена из копии'
};

class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function fail(status, message) {
  throw new StoreError(status, message);
}

function emptyDoc() {
  return {
    records: [],
    nextId: 1,
    settings: { types: DEFAULT_TYPES.slice(), deviantMin: 2, resetAt: '' },
    audit: []
  };
}

function text(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normTime(value) {
  const match = String(value == null ? '' : value).match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) return '';
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return '';
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function nameKey(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/\s+/g, ' ').trim();
}

function cleanTypes(list) {
  if (!Array.isArray(list)) fail(400, 'Список видов нарушений должен быть массивом');
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const name = text(item, 60);
    const key = nameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  if (!seen.has(nameKey(FALLBACK_TYPE))) out.push(FALLBACK_TYPE);
  if (out.length > MAX_TYPES) fail(400, 'Слишком много видов нарушений (не больше ' + MAX_TYPES + ')');
  return out;
}

function cleanSettings(raw, base) {
  const next = { ...base };
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'types')) next.types = cleanTypes(raw.types);
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'deviantMin')) {
    const n = Number(raw.deviantMin);
    if (!Number.isInteger(n) || n < 1 || n > 50) fail(400, 'Порог должен быть целым числом от 1 до 50');
    next.deviantMin = n;
  }
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'resetAt')) {
    const v = String(raw.resetAt || '');
    if (v && !isDate(v)) fail(400, 'Некорректная дата начала учёта');
    next.resetAt = v;
  }
  return next;
}

function cleanRecord(input, settings, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Некорректная запись');
  const fio = text(input.fio, 120);
  if (fio.length < 2) fail(400, 'Укажите ФИО обучающегося');
  const d = String(input.d || '');
  if (!isDate(d)) fail(400, 'Укажите корректную дату нарушения');
  let type = text(input.type, 60);
  let comment = text(input.comment, 1000);
  const known = settings.types.find(item => nameKey(item) === nameKey(type));
  if (known) {
    type = known;
  } else if (options.lenient) {
    if (type && type !== FALLBACK_TYPE) comment = comment ? type + ': ' + comment : type;
    type = FALLBACK_TYPE;
  } else {
    fail(400, 'Неизвестный вид нарушения');
  }
  return {
    d,
    t: normTime(input.t),
    fio,
    grp: text(input.grp, 40),
    type,
    patrol: text(input.patrol, 120),
    comment: comment.slice(0, 1000),
    meas: text(input.meas, 300),
    post: text(input.post, 80),
    rep: input.rep === true
  };
}

function normalizeDoc(raw) {
  const base = emptyDoc();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const settings = {
    types: base.settings.types,
    deviantMin: base.settings.deviantMin,
    resetAt: ''
  };
  try { Object.assign(settings, cleanSettings(raw.settings || {}, settings)); } catch (_) { /* повреждённые настройки заменяются значениями по умолчанию */ }
  const records = [];
  const used = new Set();
  let maxId = 0;
  for (const item of Array.isArray(raw.records) ? raw.records : []) {
    if (!item || typeof item !== 'object') continue;
    let clean;
    try { clean = cleanRecord(item, settings, { lenient: true }); } catch (_) { continue; }
    let id = Number.isSafeInteger(item.id) && item.id > 0 && !used.has(item.id) ? item.id : 0;
    if (!id) id = Math.max(maxId, ...used, 0) + 1;
    used.add(id);
    maxId = Math.max(maxId, id);
    records.push({
      id,
      ...clean,
      src: text(item.src, 20),
      who: text(item.who, 120),
      cAt: text(item.cAt, 40),
      uAt: text(item.uAt, 40),
      del: text(item.del, 40),
      delBy: text(item.delBy, 60)
    });
    if (records.length >= MAX_RECORDS) break;
  }
  const audit = (Array.isArray(raw.audit) ? raw.audit : []).slice(-MAX_AUDIT).map(item => ({
    ts: text(item && item.ts, 40),
    role: text(item && item.role, 20),
    actor: text(item && item.actor, 120),
    action: text(item && item.action, 80),
    details: text(item && item.details, 300)
  }));
  return {
    records,
    nextId: Math.max(maxId + 1, Number.isSafeInteger(raw.nextId) ? raw.nextId : 1),
    settings,
    audit
  };
}

function purgeExpiredTrash(doc, nowMs) {
  const cutoff = nowMs - TRASH_DAYS * 24 * 3600 * 1000;
  const before = doc.records.length;
  doc.records = doc.records.filter(r => !r.del || Date.parse(r.del) >= cutoff);
  return before - doc.records.length;
}

function importKey(r) {
  return [nameKey(r.fio), r.d, r.t, nameKey(r.type), nameKey(r.comment)].join('|');
}

function idList(op) {
  const ids = Array.isArray(op.ids) ? op.ids : [op.id];
  const out = [];
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id < 1) fail(400, 'Некорректный номер записи');
    out.push(id);
  }
  if (!out.length) fail(400, 'Не указаны записи');
  if (out.length > MAX_OPS_PER_REQUEST) fail(400, 'Слишком много записей за один раз');
  return out;
}

function applyOne(doc, op, ctx) {
  const nowIso = new Date(ctx.nowMs).toISOString();
  const find = id => doc.records.find(r => r.id === id);
  switch (op.op) {
    case 'add': {
      if (doc.records.length >= MAX_RECORDS) fail(409, 'Достигнут предел числа записей');
      const clean = cleanRecord(op.rec, doc.settings);
      const rec = { id: doc.nextId++, ...clean, src: ctx.role, who: ctx.actor, cAt: nowIso, uAt: nowIso, del: '', delBy: '' };
      doc.records.push(rec);
      return { details: '№' + rec.id + ' ' + rec.fio + ', ' + rec.type, id: rec.id };
    }
    case 'update': {
      const id = idList({ id: op.id })[0];
      const rec = find(id);
      if (!rec || rec.del) fail(404, 'Запись не найдена');
      const clean = cleanRecord({ ...rec, ...(op.rec || {}) }, doc.settings, { lenient: true });
      Object.assign(rec, clean, { uAt: nowIso });
      return { details: '№' + rec.id + ' ' + rec.fio, id: rec.id };
    }
    case 'delete': {
      const ids = idList(op);
      let n = 0;
      for (const id of ids) {
        const rec = find(id);
        if (!rec || rec.del) continue;
        rec.del = nowIso;
        rec.delBy = ctx.userId;
        n++;
      }
      return { details: 'записей: ' + n + (ids.length === 1 ? ' (№' + ids[0] + ')' : ''), count: n };
    }
    case 'undo': {
      const ids = idList(op);
      let n = 0;
      for (const id of ids) {
        const rec = find(id);
        if (!rec || !rec.del || rec.delBy !== ctx.userId || ctx.nowMs - Date.parse(rec.del) > UNDO_WINDOW_MS) continue;
        rec.del = '';
        rec.delBy = '';
        n++;
      }
      return { details: 'записей: ' + n, count: n };
    }
    case 'restore': {
      const ids = idList(op);
      let n = 0;
      for (const id of ids) {
        const rec = find(id);
        if (!rec || !rec.del) continue;
        rec.del = '';
        rec.delBy = '';
        n++;
      }
      return { details: 'записей: ' + n, count: n };
    }
    case 'purge': {
      const ids = op.all === true ? doc.records.filter(r => r.del).map(r => r.id) : idList(op);
      const set = new Set(ids);
      const before = doc.records.length;
      doc.records = doc.records.filter(r => !(set.has(r.id) && r.del));
      const n = before - doc.records.length;
      return { details: 'записей: ' + n, count: n };
    }
    case 'import': {
      if (!Array.isArray(op.records) || !op.records.length) fail(400, 'В файле нет записей');
      if (op.records.length > MAX_OPS_PER_REQUEST) fail(400, 'Слишком много записей за один раз (не больше ' + MAX_OPS_PER_REQUEST + ')');
      const have = new Set(doc.records.filter(r => !r.del).map(importKey));
      const settings = { ...doc.settings, types: doc.settings.types.slice() };
      let added = 0;
      let skipped = 0;
      for (const item of op.records) {
        if (doc.records.length >= MAX_RECORDS) { skipped++; continue; }
        if (op.keepTypes === true && item && typeof item.type === 'string') {
          const t = text(item.type, 60);
          if (t && !settings.types.some(x => nameKey(x) === nameKey(t)) && settings.types.length < MAX_TYPES) {
            settings.types.splice(Math.max(0, settings.types.length - 1), 0, t);
          }
        }
        let clean;
        try { clean = cleanRecord(item, settings, { lenient: true }); } catch (_) { skipped++; continue; }
        const key = importKey(clean);
        if (have.has(key)) { skipped++; continue; }
        have.add(key);
        doc.records.push({
          id: doc.nextId++, ...clean,
          src: ctx.role, who: text(item.who, 120) || ctx.actor,
          cAt: nowIso, uAt: nowIso, del: '', delBy: ''
        });
        added++;
      }
      doc.settings.types = settings.types;
      return { details: 'добавлено ' + added + ', пропущено ' + skipped, added, skipped };
    }
    case 'settings': {
      const next = cleanSettings(op.settings || {}, doc.settings);
      if (op.resetNow === true) next.resetAt = ctx.today;
      if (op.rename) {
        const from = text(op.rename.from, 60), to = text(op.rename.to, 60);
        const idx = next.types.findIndex(x => nameKey(x) === nameKey(from));
        if (idx < 0) fail(400, 'Вид нарушения не найден');
        if (nameKey(from) === nameKey(FALLBACK_TYPE)) fail(400, 'Вид «Другое» переименовать нельзя');
        if (!to) fail(400, 'Введите новое название');
        if (nameKey(to) !== nameKey(from) && next.types.some(x => nameKey(x) === nameKey(to))) fail(400, 'Такой вид уже есть');
        const old = next.types[idx];
        next.types = next.types.slice();
        next.types[idx] = to;
        doc.records.forEach(r => { if (r.type === old) r.type = to; });
      }
      doc.settings = next;
      return { details: 'порог ' + next.deviantMin + (next.resetAt ? ', учёт с ' + next.resetAt : '') + ', видов: ' + next.types.length };
    }
    case 'replaceAll': {
      if (!op.doc || typeof op.doc !== 'object' || !Array.isArray(op.doc.records)) fail(400, 'Файл не похож на копию реестра нарушителей');
      const next = normalizeDoc(op.doc);
      if (!next.records.length && doc.records.length && op.confirmEmpty !== true) fail(400, 'Копия пуста: подтвердите замену пустой копией');
      const keepAudit = doc.audit;
      doc.records = next.records;
      doc.nextId = Math.max(next.nextId, doc.nextId);
      doc.settings = next.settings;
      doc.audit = keepAudit;
      return { details: 'записей в копии: ' + next.records.length };
    }
    default:
      return fail(400, 'Неизвестная операция');
  }
}

// ctx: { role, userId, actor, nowMs }
function applyOps(doc, ops, ctx) {
  if (!Array.isArray(ops) || !ops.length) fail(400, 'Нет операций');
  if (ops.length > MAX_OPS_PER_REQUEST) fail(400, 'Слишком много операций');
  const perms = ROLE_PERMS[ctx.role] || [];
  const context = { ...ctx, today: new Date(ctx.nowMs).toISOString().slice(0, 10) };
  // Проверяем права до первого изменения: запрос выполняется целиком или не выполняется.
  for (const op of ops) {
    if (!op || typeof op !== 'object' || !OP_PERM[op.op]) fail(400, 'Неизвестная операция');
    if (!perms.includes(OP_PERM[op.op])) fail(403, 'Для вашей роли это действие недоступно');
  }
  const working = normalizeDoc(JSON.parse(JSON.stringify(doc)));
  const results = [];
  purgeExpiredTrash(working, ctx.nowMs);
  for (const op of ops) {
    const result = applyOne(working, op, context);
    results.push(result);
    working.audit.push({
      ts: new Date(ctx.nowMs).toISOString(),
      role: ctx.role,
      actor: ctx.actor,
      action: OP_LABEL[op.op],
      details: String(result.details || '').slice(0, 300)
    });
  }
  if (working.audit.length > MAX_AUDIT) working.audit = working.audit.slice(-MAX_AUDIT);
  return { doc: working, results };
}

function viewFor(doc, role, version) {
  const perms = ROLE_PERMS[role] || [];
  const showTrash = perms.includes('restore');
  return {
    version,
    perms,
    settings: doc.settings,
    trashDays: TRASH_DAYS,
    records: showTrash ? doc.records : doc.records.filter(r => !r.del),
    audit: perms.includes('audit') ? doc.audit.slice(-300).reverse() : []
  };
}

module.exports = {
  DEFAULT_TYPES,
  FALLBACK_TYPE,
  TRASH_DAYS,
  UNDO_WINDOW_MS,
  MAX_RECORDS,
  ROLE_PERMS,
  StoreError,
  emptyDoc,
  normalizeDoc,
  applyOps,
  viewFor
};
