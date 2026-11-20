'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../violators-store');

const NOW = Date.parse('2026-11-19T12:00:00.000Z');
const ctx = (role, extra = {}) => ({ role, userId: 'u-' + role, actor: role + ' user', nowMs: NOW, ...extra });
const rec = (extra = {}) => ({ fio: 'Иванов Иван', grp: 'ЗЧС-205', type: 'Опоздание', d: '2026-11-19', t: '8:05', comment: 'Опоздал на 10 минут', ...extra });

function withDoc(ops, role = 'nachalnik', doc = store.emptyDoc(), extra = {}) {
  return store.applyOps(doc, ops, ctx(role, extra));
}

test('пустой документ содержит виды нарушений из реестра', () => {
  const doc = store.emptyDoc();
  assert.deepEqual(doc.settings.types, ['Нарушение лок. акта №36', 'Нарушение лок. акта №2', 'Опоздание', 'Нарушение дисциплины', 'Отсутствие студ. билета', 'Курение в неположенном месте', 'Другое']);
  assert.equal(doc.settings.types.at(-1), 'Другое');
  assert.equal(doc.settings.deviantMin, 2);
});

test('начальник добавляет запись: время и текст очищаются, номер выдаётся сервером', () => {
  const { doc, results } = withDoc([{ op: 'add', rec: rec({ fio: '  Иванов   Иван ' }) }]);
  assert.equal(results[0].id, 1);
  assert.equal(doc.records[0].fio, 'Иванов Иван');
  assert.equal(doc.records[0].t, '08:05');
  assert.equal(doc.records[0].src, 'nachalnik');
  assert.equal(doc.nextId, 2);
  assert.equal(doc.audit.length, 1);
});

test('запись без ФИО, с плохой датой или неизвестным видом отклоняется', () => {
  assert.throws(() => withDoc([{ op: 'add', rec: rec({ fio: '' }) }]), { status: 400 });
  assert.throws(() => withDoc([{ op: 'add', rec: rec({ d: '2026-13-40' }) }]), { status: 400 });
  assert.throws(() => withDoc([{ op: 'add', rec: rec({ type: 'Выдуманный вид' }) }]), { status: 400 });
});

test('документовед записывает и правит, но не меняет настройки', () => {
  const first = withDoc([{ op: 'add', rec: rec() }], 'dokumentoved');
  const edited = withDoc([{ op: 'update', id: 1, rec: { grp: 'ПБ-101' } }], 'dokumentoved', first.doc);
  assert.equal(edited.doc.records[0].grp, 'ПБ-101');
  assert.equal(edited.doc.records[0].fio, 'Иванов Иван');
  assert.throws(() => withDoc([{ op: 'settings', settings: { deviantMin: 3 } }], 'dokumentoved', first.doc), { status: 403 });
  assert.throws(() => withDoc([{ op: 'settings', settings: { types: ['X'] } }], 'dokumentoved', first.doc), { status: 403 });
});

test('старший мастер не записывает нарушения, но видит корзину и журнал', () => {
  const base = withDoc([{ op: 'add', rec: rec() }, { op: 'add', rec: rec({ fio: 'Петров Пётр' }) }]).doc;
  assert.throws(() => withDoc([{ op: 'add', rec: rec() }], 'uchet', base), { status: 403 });
  assert.throws(() => withDoc([{ op: 'delete', id: 1 }], 'uchet', base), { status: 403 });
  const deleted = withDoc([{ op: 'delete', ids: [1] }], 'nachalnik', base).doc;
  const chiefView = store.viewFor(deleted, 'nachalnik', 3);
  const masterView = store.viewFor(deleted, 'uchet', 3);
  assert.equal(chiefView.records.length, 1);
  assert.equal(masterView.records.length, 2);
  assert.equal(chiefView.audit.length, 0);
  assert.ok(masterView.audit.length >= 3);
});

test('восстановление и окончательное удаление доступны только старшему мастеру', () => {
  const base = withDoc([{ op: 'add', rec: rec() }]).doc;
  const deleted = withDoc([{ op: 'delete', id: 1 }], 'dokumentoved', base).doc;
  assert.throws(() => withDoc([{ op: 'restore', id: 1 }], 'nachalnik', deleted), { status: 403 });
  assert.throws(() => withDoc([{ op: 'purge', id: 1 }], 'nachalnik', deleted), { status: 403 });
  const restored = withDoc([{ op: 'restore', id: 1 }], 'uchet', deleted).doc;
  assert.equal(restored.records[0].del, '');
  const gone = withDoc([{ op: 'purge', all: true }], 'uchet', deleted).doc;
  assert.equal(gone.records.length, 0);
  const keepActive = withDoc([{ op: 'purge', id: 1 }], 'uchet', base).doc;
  assert.equal(keepActive.records.length, 1, 'активную запись окончательно удалить нельзя');
});

test('отмена удаления работает только для автора и только две минуты', () => {
  const base = withDoc([{ op: 'add', rec: rec() }]).doc;
  const deleted = withDoc([{ op: 'delete', id: 1 }], 'nachalnik', base).doc;
  assert.equal(withDoc([{ op: 'undo', id: 1 }], 'nachalnik', deleted, { nowMs: NOW + 60 * 1000 }).doc.records[0].del, '');
  assert.notEqual(withDoc([{ op: 'undo', id: 1 }], 'nachalnik', deleted, { nowMs: NOW + 3 * 60 * 1000 }).doc.records[0].del, '');
  assert.notEqual(withDoc([{ op: 'undo', id: 1 }], 'dokumentoved', deleted, { userId: 'other' }).doc.records[0].del, '');
});

test('корзина очищается через 30 дней при следующей записи', () => {
  const base = withDoc([{ op: 'add', rec: rec() }]).doc;
  const deleted = withDoc([{ op: 'delete', id: 1 }], 'nachalnik', base).doc;
  const later = withDoc([{ op: 'add', rec: rec({ fio: 'Сидоров Сидор' }) }], 'nachalnik', deleted, { nowMs: NOW + 31 * 24 * 3600 * 1000 }).doc;
  assert.equal(later.records.length, 1);
  assert.equal(later.records[0].fio, 'Сидоров Сидор');
});

test('импорт пропускает дубли, неизвестные виды превращает в «Другое» и не падает на мусоре', () => {
  const rows = [
    rec(),
    rec(),
    rec({ fio: 'Петров Пётр', type: 'Вейп' }),
    { fio: '', d: '2026-11-19' },
    null
  ];
  const { doc, results } = withDoc([{ op: 'import', records: rows }]);
  assert.equal(results[0].added, 2);
  assert.equal(results[0].skipped, 3);
  const petrov = doc.records.find(r => r.fio === 'Петров Пётр');
  assert.equal(petrov.type, 'Другое');
  assert.match(petrov.comment, /Вейп/);
  const again = withDoc([{ op: 'import', records: rows.slice(0, 1) }], 'dokumentoved', doc);
  assert.equal(again.results[0].added, 0);
});

test('импорт со старым разделом начальника сохраняет прежние виды нарушений', () => {
  const { doc } = withDoc([{ op: 'import', keepTypes: true, records: [rec({ type: 'Форма одежды' })] }]);
  assert.ok(doc.settings.types.includes('Форма одежды'));
  assert.equal(doc.settings.types.at(-1), 'Другое');
  assert.equal(doc.records[0].type, 'Форма одежды');
});

test('настройки: порог, виды и сброс учёта проверяются', () => {
  assert.throws(() => withDoc([{ op: 'settings', settings: { deviantMin: 0 } }]), { status: 400 });
  assert.throws(() => withDoc([{ op: 'settings', settings: { resetAt: 'вчера' } }]), { status: 400 });
  const { doc } = withDoc([{ op: 'settings', settings: { deviantMin: 3, types: ['Опоздание', 'Драка'] } }]);
  assert.equal(doc.settings.deviantMin, 3);
  assert.deepEqual(doc.settings.types, ['Опоздание', 'Драка', 'Другое']);
  const reset = withDoc([{ op: 'settings', resetNow: true }], 'nachalnik', doc).doc;
  assert.equal(reset.settings.resetAt, '2026-11-19');
});

test('копия базы заменяет данные, но журнал остаётся; пустая копия требует подтверждения', () => {
  const source = withDoc([{ op: 'add', rec: rec() }, { op: 'add', rec: rec({ fio: 'Петров Пётр' }) }]).doc;
  const target = withDoc([{ op: 'add', rec: rec({ fio: 'Сидоров Сидор' }) }]).doc;
  const { doc } = withDoc([{ op: 'replaceAll', doc: source }], 'uchet', target);
  assert.equal(doc.records.length, 2);
  assert.ok(doc.audit.length >= 2);
  assert.throws(() => withDoc([{ op: 'replaceAll', doc: store.emptyDoc() }], 'uchet', doc), { status: 400 });
  assert.throws(() => withDoc([{ op: 'replaceAll', doc: source }], 'nachalnik', target), { status: 403 });
  assert.throws(() => withDoc([{ op: 'replaceAll', doc: { x: 1 } }], 'uchet', target), { status: 400 });
});

test('если одна операция из пачки запрещена, не применяется ни одна', () => {
  const base = store.emptyDoc();
  assert.throws(() => withDoc([{ op: 'add', rec: rec() }, { op: 'purge', all: true }], 'nachalnik', base), { status: 403 });
  assert.equal(base.records.length, 0);
});

test('повреждённый документ из базы приводится к безопасному виду', () => {
  const doc = store.normalizeDoc({ records: [{ fio: 'Иванов', d: '2026-11-19', type: 'Опоздание', id: 7 }, { fio: '', d: 'x' }, 5], nextId: 2, settings: { types: 'oops', deviantMin: -5 } });
  assert.equal(doc.records.length, 1);
  assert.ok(doc.nextId > 7);
  assert.equal(doc.settings.deviantMin, 2);
  assert.ok(Array.isArray(doc.settings.types));
});

test('старший мастер правит виды нарушений: добавление, переименование, удаление', () => {
  const base = withDoc([{ op: 'add', rec: rec({ type: 'Опоздание' }) }]).doc;
  const added = withDoc([{ op: 'settings', settings: { types: [...base.settings.types, 'Драка'] } }], 'uchet', base).doc;
  assert.ok(added.settings.types.includes('Драка'));
  const renamed = withDoc([{ op: 'settings', rename: { from: 'Опоздание', to: 'Опоздание на службу' } }], 'uchet', added).doc;
  assert.ok(renamed.settings.types.includes('Опоздание на службу'));
  assert.ok(!renamed.settings.types.includes('Опоздание'));
  assert.equal(renamed.records[0].type, 'Опоздание на службу');
  const removed = withDoc([{ op: 'settings', settings: { types: renamed.settings.types.filter(x => x !== 'Драка') } }], 'uchet', renamed).doc;
  assert.ok(!removed.settings.types.includes('Драка'));
  assert.equal(removed.records[0].type, 'Опоздание на службу', 'старые записи не теряются');
  assert.throws(() => withDoc([{ op: 'settings', rename: { from: 'Опоздание на службу', to: 'Другое' } }], 'uchet', removed), { status: 400 });
  assert.throws(() => withDoc([{ op: 'settings', rename: { from: 'Другое', to: 'Иное' } }], 'uchet', removed), { status: 400 });
  assert.throws(() => withDoc([{ op: 'settings', rename: { from: 'Нет такого', to: 'Иное' } }], 'uchet', removed), { status: 400 });
  assert.throws(() => withDoc([{ op: 'add', rec: rec({ type: 'Драка' }) }], 'nachalnik', removed), { status: 400 });
});
