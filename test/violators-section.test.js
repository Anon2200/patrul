'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = { window: { PATRUL_ROLE: 'none' }, document: {}, localStorage: {}, console };
vm.runInNewContext(fs.readFileSync(__dirname + '/../public/violators-section.js', 'utf8'), sandbox);
const C = sandbox.window.PatrulViolatorsCore;
const R = (id, fio, d, extra = {}) => ({ id, fio, grp: 'ЗЧС-205', type: 'Опоздание', d, t: '08:00', patrol: 'Сидоров', comment: '', meas: '', post: '', rep: false, del: '', ...extra });
const list = [R(1, 'Иванов Иван', '2026-11-10'), R(2, 'Иванов Иван', '2026-11-11', { type: 'Нарушение дисциплины' }), R(3, 'Петров Пётр', '2026-11-12'), R(4, 'Петров Петр', '2026-11-12', { del: '2026-11-13T00:00:00Z' })];

test('ё и е считаются одной буквой при поиске и в досье', () => {
  assert.equal(C.filterRecords(list, { name: 'петр' }).length, 1);
  assert.equal(C.dossierOf(list, 'петров петр').total, 1);
});
test('девианты: порог и дата сброса учёта', () => {
  assert.equal(C.deviantList(list, { deviantMin: 2 }).map(x => x.name).join(), 'Иванов Иван');
  assert.equal(C.deviantList(list, { deviantMin: 1 }).length, 2);
  assert.equal(C.deviantList(list, { deviantMin: 2, resetAt: '2026-11-11' }).length, 0);
});
test('фильтры по датам, типу и сортировка', () => {
  assert.equal(C.filterRecords(list, { from: '2026-11-11', to: '2026-11-11' }).length, 1);
  assert.equal(C.filterRecords(list, { type: 'Нарушение дисциплины' })[0].id, 2);
  assert.equal(C.sortRecords(C.filterRecords(list, {}), 'd', 'desc').map(r => r.id).join(), '3,2,1');
});
test('проверка качества находит дубль в пределах 3 дней', () => {
  const q = C.qualityOf([R(1, 'Сидоров', '2026-11-10'), R(2, 'Сидоров', '2026-11-12')], '2026-11-20');
  assert.equal(q.dups.length, 1);
  assert.equal(q.dups[0].laterId, 2);
});
test('CSV: выгрузка с кавычками и обратный импорт', () => {
  const csv = C.csvText([R(1, 'Иванов "Ваня"', '2026-11-10', { comment: 'a;b' })]);
  const { records } = C.mapImport(C.parseCsv(csv), '2026-11-20');
  assert.equal(records.length, 1);
  assert.equal(records[0].fio, 'Иванов "Ваня"');
  assert.equal(records[0].comment, 'a;b');
  assert.equal(records[0].d, '2026-11-10');
  assert.equal(records[0].t, '08:00');
});
test('импорт без заголовков и с датой ДД.ММ.ГГГГ', () => {
  const { records } = C.mapImport(C.parseCsv('Иванов Иван;ЗЧС-205;Опоздание;05.11.2026;текст'), '2026-11-20');
  assert.equal(records[0].d, '2026-11-05');
  assert.equal(records[0].grp, 'ЗЧС-205');
});
test('статистика считает недели и месяцы', () => {
  const s = C.statsOf(list, '2026-11-12');
  assert.equal(s.total, 3);
  assert.equal(s.today, 1);
  assert.equal(s.month, 3);
});
test('экранирование HTML', () => assert.equal(C.esc('<b>"&'), '&lt;b&gt;&quot;&amp;'));
