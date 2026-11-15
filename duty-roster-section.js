/* Fresh commander's duty-roster workspace.
 * Keeps the existing document theme and data model, but owns the complete
 * "Наряд на службу" screen instead of patching fragments into the old markup.
 */
(() => {
  'use strict';
  if (typeof D === 'undefined' || typeof TABS === 'undefined' || typeof EXV === 'undefined' || typeof A === 'undefined') return;

  const esc = value => typeof e === 'function' ? e(String(value == null ? '' : value)) : String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => String(value == null ? '' : value).trim();
  const norm = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const dateRecord = date => {
    if (!D.duty[date]) D.duty[date] = typeof ddef === 'function' ? ddef() : { rows:{}, defects:[], incs:[] };
    const record = D.duty[date];
    if (!record.rows || typeof record.rows !== 'object') record.rows = {};
    if (!Array.isArray(record.defects)) record.defects = [];
    if (!Array.isArray(record.incs)) record.incs = [];
    if (!Array.isArray(record.departmentAssignments)) record.departmentAssignments = [];
    return record;
  };
  const deptList = () => {
    const source = Array.isArray(D.departments) ? D.departments : Array.isArray(D.set && D.set.departments) ? D.set.departments : [];
    const list = source.map((item, index) => typeof item === 'string'
      ? { id:String(index + 1), name:item }
      : { id:String(item.id || item.key || index + 1), name:String(item.name || item.title || ('Отделение ' + (index + 1))) }
    ).filter(item => item.name);
    if (list.length) return list;
    const grouped = new Map();
    (D.staff || []).forEach(person => {
      const name = clean(person && (person.departmentName || person.department || person.depName || person.otdelenie));
      if (!name) return;
      const number = Number(person.sq);
      const id = Number.isInteger(number) && number > 0 ? 'legacy-' + number : 'legacy-' + (grouped.size + 1);
      if (!grouped.has(id)) grouped.set(id,name);
    });
    if (grouped.size) return [...grouped].map(([id,name]) => ({id,name}));
    return Array.from({length:9}, (_, index) => ({id:'legacy-' + (index + 1),name:'Отделение ' + (index + 1)}));
  };
  const personDepartment = person => {
    const id = person && (person.departmentId != null ? person.departmentId : person.depId);
    if (id != null && clean(id)) return { id:String(id), name:'' };
    const legacy = Number(person && person.sq);
    if (Number.isInteger(legacy) && legacy > 0) return { id:'legacy-' + legacy, name:'' };
    return { id:'', name:clean(person && (person.departmentName || person.department || person.depName || person.otdelenie)) };
  };
  const membersOf = department => {
    const unique = new Map();
    (D.staff || []).filter(person => {
      if (!person || !clean(person.name || person.fio)) return false;
      const status = norm(person.st || person.status);
      if (['уволен','исключен','исключён','не в штате'].includes(status)) return false;
      const ref = personDepartment(person);
      return ref.id ? ref.id === String(department.id) : !!ref.name && norm(ref.name) === norm(department.name);
    }).forEach(person => {
      const name = clean(person.name || person.fio), key = fullNameKey(name);
      const current = unique.get(key);
      if (!current) unique.set(key,{ name, pos:clean(person.pos || person.position || person.dolzhnost), id:String(person.id || person.k || person.key || name) });
      else if (!current.pos) current.pos = clean(person.pos || person.position || person.dolzhnost);
    });
    return [...unique.values()];
  };
  const assignment = (record, id) => record.departmentAssignments.find(item => String(item.departmentId) === String(id));
  const fullNameKey = value => norm(value).replace(/[.,]/g,'').replace(/\s+/g,' ');
  const initialsKey = value => {
    const parts = fullNameKey(value).split(' ').filter(Boolean);
    if (parts.length < 2) return '';
    return parts[0] + ' ' + parts.slice(1).map(part => part[0]).join('');
  };
  const rowName = row => clean(row && (row.fio || row.name));
  const nonEmpty = value => value !== undefined && value !== null && clean(value) !== '';
  const personMatches = (row, members) => {
    const key = fullNameKey(rowName(row));
    if (!key) return [];
    const exact = members.filter(member => fullNameKey(member.name) === key);
    if (exact.length) return exact;
    const rowParts = key.split(' ').filter(Boolean);
    if (rowParts.length < 2) return [];
    const abbreviated = members.filter(member => {
      const parts = fullNameKey(member.name).split(' ').filter(Boolean);
      if (parts[0] !== rowParts[0] || parts.length < 2) return false;
      const given = rowParts.slice(1);
      if (given.every(part => part.length === 1)) return given.every((part,index) => parts[index + 1] && parts[index + 1][0] === part);
      return given.every((part,index) => parts[index + 1] && (parts[index + 1] === part || (part.length === 1 && parts[index + 1][0] === part)));
    });
    if (abbreviated.length) return abbreviated;
    const initials = initialsKey(rowName(row));
    return initials ? members.filter(member => initialsKey(member.name) === initials) : [];
  };
  const makePlan = (record, post, members) => {
    const allRows = [];
    Object.keys(record.rows || {}).forEach(existingPost => (record.rows[existingPost] || []).forEach((row,index) => {
      if (row && rowName(row)) allRows.push({ post:existingPost, index, row });
    }));
    const memberPlans = [];
    const issues = [];
    members.forEach(member => {
      const found = [];
      allRows.forEach(entry => {
        const matches = personMatches(entry.row, [member]);
        if (matches.length) found.push(entry);
      });
      const merged = {};
      const sources = found.map(entry => entry.row);
      sources.forEach(source => Object.keys(source).forEach(key => {
        if (!nonEmpty(source[key])) return;
        if (nonEmpty(merged[key]) && String(merged[key]) !== String(source[key])) {
          issues.push('Для «' + member.name + '» конфликтует поле «' + key + '» в разных строках.');
        } else merged[key] = source[key];
      }));
      const ambiguous = allRows.filter(entry => {
        const key = initialsKey(rowName(entry.row));
        return key && key === initialsKey(member.name) && fullNameKey(rowName(entry.row)) !== fullNameKey(member.name);
      });
      if (ambiguous.length) {
        const candidates = members.filter(other => initialsKey(other.name) === initialsKey(member.name));
        if (candidates.length > 1) issues.push('Сокращённое ФИО «' + rowName(ambiguous[0].row) + '» неоднозначно.');
      }
      memberPlans.push({ member, found, merged });
    });
    const seen = new Set();
    const duplicates = [];
    allRows.forEach(entry => {
      const matches = personMatches(entry.row, members);
      if (matches.length > 1) issues.push('Строка «' + rowName(entry.row) + '» подходит нескольким сотрудникам.');
      if (matches.length === 1) {
        const key = fullNameKey(matches[0].name);
        if (seen.has(key)) duplicates.push(entry);
        seen.add(key);
      }
    });
    return { post, members, memberPlans, issues:[...new Set(issues)], duplicates };
  };
  const applyPlan = (record, plan) => {
    if (plan.issues.length) return { applied:false, reason:plan.issues.join(' ') };
    const memberNames = new Set(plan.members.map(member => fullNameKey(member.name)));
    const rows = record.rows || (record.rows = {});
    const keptTarget = (rows[plan.post] || []).filter(row => !rowName(row) || !personMatches(row, plan.members).length);
    const rebuilt = [];
    const defaults = { tin:clean(record.t1), tout:clean(record.t2) };
    plan.memberPlans.forEach(item => {
      const row = { ...item.merged };
      row.fio = item.member.name;
      if (!nonEmpty(row.pos)) row.pos = item.member.pos;
      if (!nonEmpty(row.tin)) row.tin = defaults.tin;
      if (!nonEmpty(row.tout)) row.tout = defaults.tout;
      rebuilt.push(row);
    });
    rows[plan.post] = keptTarget.concat(rebuilt);
    Object.keys(rows).forEach(post => {
      if (post === plan.post) return;
      rows[post] = (rows[post] || []).filter(row => !rowName(row) || !personMatches(row, plan.members).length);
    });
    return { applied:true, moved:plan.memberPlans.filter(item => item.found.some(entry => entry.post !== plan.post)).length, added:plan.memberPlans.filter(item => !item.found.length).length, already:plan.memberPlans.filter(item => item.found.some(entry => entry.post === plan.post)).length, duplicatesRemoved:plan.duplicates.length };
  };
  const postOptions = selected => '<option value="">Выбрать пост</option>' + posts().map(post => '<option value="' + esc(post) + '" ' + (post === selected ? 'selected' : '') + '>' + esc(post) + '</option>').join('');
  const departmentAssignmentsHtml = record => {
    const depts = deptList();
    if (!depts.length) return '<p class="mu">Сначала добавьте отделения в разделе «Личный состав».</p>';
    return '<div class="scroll" style="max-height:none"><table><thead><tr><th>Отделение</th><th>Назначенный пост на дату</th><th>Личный состав</th><th>Старший патруля</th><th>Статус</th></tr></thead><tbody>' +
      depts.map(dept => {
        const current = assignment(record, dept.id);
        const members = membersOf(dept);
        const senior = members.find(person => /старш.*патрул/i.test(person.pos));
        return '<tr><td><b>' + esc(dept.name) + '</b></td><td><select data-duty-assignment-post="' + esc(dept.id) + '">' + postOptions(current && current.post || '') + '</select></td><td>' + members.length + ' чел.</td><td>' + esc(current && current.seniorName || senior && senior.name || '—') + '</td><td>' + (current && current.post ? '<span class="tag">Назначено</span>' : '<span class="tag y">Не назначено</span>') + ' <button class="btn s g" data-act="newDutySaveAssignment" data-dep="' + esc(dept.id) + '">Сохранить</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  };
  const rosterHtml = (record, date) => posts().map(post => {
    const rows = Array.from({length:Math.max(3,(record.rows[post] || []).length)}, (_,index) => (record.rows[post] || [])[index] || {});
    return '<div class="card" style="margin:0 0 12px"><div class="bar" style="justify-content:space-between;margin-bottom:8px"><div><h3 style="margin:0">Пост: ' + esc(post) + '</h3><span class="mu">' + rows.filter(row => rowName(row)).length + ' сотрудников</span></div><button class="btn s g" data-act="drow" data-p="' + esc(post) + '">+ строка</button></div><div class="scroll" style="max-height:none"><table><thead><tr><th>ФИО</th><th>Должность</th><th>Снаряжение</th><th>Заступление</th><th>Сдача</th></tr></thead><tbody>' +
      rows.map((row,index) => {
        const prefix = 'rows|' + post + '|' + index + '|';
        const field = key => 'value="' + esc(row[key] || '') + '" data-chg="duty" data-p="' + esc(prefix + key) + '"';
        const senior = typeof isSeniorPatrolRow === 'function' ? isSeniorPatrolRow(row) : /старш.*патрул/i.test(row.pos || '');
        const kit = typeof postKitText === 'function' ? postKitText(post) : '';
        return '<tr><td><input list="dl_staff" ' + field('fio') + '></td><td><input ' + field('pos') + '></td><td>' + (senior ? (row.fio && kit ? '<div class="kit-display">' + esc(kit) + '</div>' : '<input ' + field('eq') + ' placeholder="Снаряжение Старшему">') : '<span class="mu small">Не выдаётся</span>') + '</td><td><input type="time" ' + field('tin') + '></td><td><input type="time" ' + field('tout') + '></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }).join('');
  const defectsHtml = record => '<div class="scroll" style="max-height:none"><table><thead><tr><th>Время</th><th>Пост</th><th>Описание</th><th>Кто допустил</th><th>Принятые меры</th><th>Устранено</th><th></th></tr></thead><tbody>' +
    (record.defects.length ? record.defects.map((item,index) => {
      const prefix = 'defects|' + index + '|';
      const field = key => 'value="' + esc(item[key] || '') + '" data-chg="duty" data-p="' + prefix + key + '"';
      return '<tr><td><input type="time" ' + field('t') + '></td><td><select data-chg="duty" data-p="' + prefix + 'post"><option></option>' + posts().map(post => '<option ' + (item.post === post ? 'selected' : '') + '>' + esc(post) + '</option>').join('') + '</select></td><td><input ' + field('text') + '></td><td><input list="dl_staff" ' + field('who') + '></td><td><input ' + field('meas') + '></td><td><input type="checkbox" style="width:auto;min-height:0" data-chg="duty" data-p="' + prefix + 'fixed" ' + (item.fixed ? 'checked' : '') + '></td><td><button class="btn s g r" data-act="ddefdel" data-i="' + index + '">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="mu" style="text-align:center">Недочётов нет</td></tr>') + '</tbody></table></div><div class="bar" style="margin:8px 0"><button class="btn s g" data-act="ddefadd">+ недочёт</button></div>';
  const incidentsHtml = record => '<div class="scroll" style="max-height:none"><table><thead><tr><th>Время</th><th>Пост</th><th>Происшествие / замечание</th><th>Принятые меры</th><th></th></tr></thead><tbody>' +
    (record.incs.length ? record.incs.map((item,index) => {
      const prefix = 'incs|' + index + '|';
      const field = key => 'value="' + esc(item[key] || '') + '" data-chg="duty" data-p="' + prefix + key + '"';
      return '<tr><td><input type="time" ' + field('t') + '></td><td><select data-chg="duty" data-p="' + prefix + 'post"><option></option>' + posts().map(post => '<option ' + (item.post === post ? 'selected' : '') + '>' + esc(post) + '</option>').join('') + '</select></td><td><input ' + field('text') + '></td><td><input ' + field('meas') + '></td><td><button class="btn s g r" data-act="dindel" data-i="' + index + '">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="mu" style="text-align:center">Происшествий нет</td></tr>') + '</tbody></table></div><div class="bar" style="margin:8px 0"><button class="btn s g" data-act="dinadd">+ запись</button></div>';
  function render() {
    const date = dsel;
    const record = dateRecord(date);
    const [peopleCount, defectCount, fixedCount] = dcount(record);
    const assignmentCount = record.departmentAssignments.length;
    const filled = posts().reduce((sum,post) => sum + (record.rows[post] || []).filter(row => rowName(row)).length,0);
    return '<h1>Наряд на службу</h1><p class="sub">Единый документ смены: назначения отделений, состав по постам, снаряжение, недочёты, происшествия и итоговый рапорт.</p>' +
      '<div class="bar"><button class="btn g" data-act="dday" data-d="-1">‹</button><input type="date" value="' + esc(date) + '" data-chg="dsel"><button class="btn g" data-act="dday" data-d="1">›</button><button class="btn g" data-act="dtoday">Сегодня</button><span class="mu">' + esc(fl(date)) + '</span><button class="btn" style="margin-left:auto" data-act="prdoc" data-doc="d1">Печать книги службы</button><button class="btn g" data-act="prdoc" data-doc="d2">Рапорт об итогах</button></div>' +
      '<div class="kpis"><div class="card kpi" style="cursor:default"><div><b>' + filled + '</b><span>сотрудников в наряде</span></div></div><div class="card kpi" style="cursor:default"><div><b>' + assignmentCount + '</b><span>назначений отделений</span></div></div><div class="card kpi" style="cursor:default"><div><b>' + defectCount + '</b><span>недочётов</span></div></div><div class="card kpi" style="cursor:default"><div><b>' + fixedCount + '</b><span>устранено</span></div></div></div>' +
      '<div class="card" style="margin-bottom:14px"><h3>1. Параметры смены</h3><div class="fg" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))"><div><label>Смена с</label><input type="time" value="' + esc(record.t1) + '" data-chg="duty" data-p="t1"></div><div><label>Смена до</label><input type="time" value="' + esc(record.t2) + '" data-chg="duty" data-p="t2"></div><div><label>Начальник патруля</label><input list="dl_staff" value="' + esc(record.boss) + '" data-chg="duty" data-p="boss"></div><div><label>Заместитель начальника</label><input list="dl_staff" value="' + esc(record.dep) + '" data-chg="duty" data-p="dep"></div><div><label>Дежурный по помещению</label><input list="dl_staff" value="' + esc(record.dut) + '" data-chg="duty" data-p="dut"></div><div><label>Инструктаж</label><div style="display:flex;gap:8px;align-items:center;min-height:40px"><input type="checkbox" style="width:auto;min-height:0" data-chg="duty" data-p="brief" ' + (record.brief ? 'checked' : '') + '> проведён в <input type="time" style="width:110px" value="' + esc(record.briefT) + '" data-chg="duty" data-p="briefT"></div></div></div></div>' +
      '<div class="card" style="margin-bottom:14px"><div class="bar" style="justify-content:space-between"><div><h3 style="margin:0">2. Распределение отделений по постам</h3><span class="mu">На каждую дату берётся отдельное назначение из «Графика дежурств».</span></div><button class="btn s g" data-act="newDutyReloadAssignments">Обновить назначения</button></div>' + departmentAssignmentsHtml(record) +
      '<div class="bar" style="margin:12px 0 0"><button class="btn" data-act="newDutyRebuildDay">Пересобрать наряд на эту дату</button><button class="btn g" data-act="newDutyRebuildAll">Пересобрать наряд на все дни</button></div><p class="mu" style="margin:8px 0 0">Пересборка переносит личный состав на назначенные посты, убирает дубли и сохраняет время, снаряжение, подписи и заполненные поля. Дни без назначения не меняются.</p></div>' +
      '<div class="sec">3. Состав наряда и получение снаряжения <span class="mu small">(снаряжение получает только Старший патруля)</span></div>' + rosterHtml(record,date) +
      '<div class="sec">4. Недочёты при несении службы</div>' + defectsHtml(record) +
      '<div class="sec">5. Происшествия и замечания по оборудованию</div>' + incidentsHtml(record) +
      '<div class="sec">6. Итоги службы</div><div class="card"><label style="display:block;font-size:12px;font-weight:600;color:var(--mu);margin-bottom:4px">Итоги дня</label><textarea rows="4" style="width:100%" data-chg="duty" data-p="summary">' + esc(record.summary) + '</textarea><div class="bar" style="margin:12px 0 0"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" style="width:auto;min-height:0" data-chg="duty" data-p="rep" ' + (record.rep ? 'checked' : '') + '> Доложено руководству в <input type="time" style="width:110px" value="' + esc(record.repT) + '" data-chg="duty" data-p="repT"></label></div></div>';
  }
  function rebuildDate(date, departmentId) {
    const record = D.duty[date];
    if (!record || !Array.isArray(record.departmentAssignments)) return { skipped:true, reason:'Нет назначений на дату.' };
    const targets = record.departmentAssignments.filter(item => !departmentId || String(item.departmentId) === String(departmentId));
    if (!targets.length) return { skipped:true, reason:'Нет назначения отделения на дату.' };
    let moved=0, added=0, already=0, duplicatesRemoved=0, applied=0;
    const errors=[];
    targets.forEach(item => {
      const dept = deptList().find(entry => String(entry.id) === String(item.departmentId));
      const post = clean(item.post);
      if (!dept || !posts().includes(post)) { errors.push((item.departmentName || item.departmentId) + ': назначенный пост не найден.'); return; }
      const members = membersOf(dept);
      if (!members.length) { errors.push(dept.name + ': не найден личный состав.'); return; }
      const plan = makePlan(record,post,members);
      if (plan.issues.length) { errors.push(dept.name + ': ' + plan.issues.join(' ')); return; }
      const result = applyPlan(record,plan);
      if (!result.applied) { errors.push(dept.name + ': ' + result.reason); return; }
      moved += result.moved; added += result.added; already += result.already; duplicatesRemoved += result.duplicatesRemoved; applied++;
    });
    return { applied, moved, added, already, duplicatesRemoved, errors };
  }
  function rebuildAll(departmentId) {
    const dates = Object.keys(D.duty || {}).sort();
    const totals = { datesChecked:0, datesChanged:0, moved:0, added:0, already:0, duplicatesRemoved:0, skipped:0, errors:[] };
    dates.forEach(date => {
      const record = D.duty[date];
      if (!record || !Array.isArray(record.departmentAssignments)) { totals.skipped++; return; }
      const targets = record.departmentAssignments.filter(item => !departmentId || String(item.departmentId) === String(departmentId));
      if (!targets.length) return;
      totals.datesChecked++;
      const result = rebuildDate(date,departmentId);
      if (result.skipped) { totals.skipped++; return; }
      if (result.applied) totals.datesChanged++;
      totals.moved += result.moved || 0; totals.added += result.added || 0; totals.already += result.already || 0; totals.duplicatesRemoved += result.duplicatesRemoved || 0;
      result.errors.forEach(error => totals.errors.push(date + ': ' + error));
    });
    return totals;
  }
  A.newDutySaveAssignment = target => {
    const dept = deptList().find(item => String(item.id) === String(target.dataset.dep));
    const select = Array.from(document.querySelectorAll('[data-duty-assignment-post]')).find(item => String(item.dataset.dutyAssignmentPost) === String(target.dataset.dep));
    const post = select && select.value;
    if (!dept || !post) return toast('Выберите пост для отделения.');
    const record = dateRecord(dsel);
    const current = assignment(record,dept.id);
    const senior = membersOf(dept).find(person => /старш.*патрул/i.test(person.pos));
    const next = { departmentId:dept.id, departmentName:dept.name, post, seniorId:current && current.seniorId || '', seniorName:current && current.seniorName || senior && senior.name || '', updatedAt:new Date().toISOString(), updatedBy:(window.PATRUL_USER && window.PATRUL_USER.name) || 'Начальник патруля' };
    if (current) Object.assign(current,next); else record.departmentAssignments.push(next);
    save(); draw(1); toast('Назначение отделения сохранено.');
  };
  A.newDutyReloadAssignments = () => { draw(1); toast('Назначения обновлены из сохранённого графика.'); };
  A.newDutyRebuildDay = () => {
    const result = rebuildDate(dsel);
    if (result.skipped) return toast(result.reason);
    save(); draw(1);
    toast('Готово: перенесено ' + result.moved + ', добавлено ' + result.added + ', уже на месте ' + result.already + ', дублей убрано ' + result.duplicatesRemoved + (result.errors.length ? '. Проблем: ' + result.errors.length : '.'));
    if (result.errors.length) modal('<h3>Пересборка: требуется проверка</h3><p>' + result.errors.map(esc).join('<br>') + '</p><div class="bar"><button class="btn" data-act="cl">Закрыть</button></div>');
  };
  A.newDutyRebuildAll = () => {
    const confirmation = document.createElement('div');
    confirmation.className = 'ov';
    confirmation.innerHTML = '<div class="mod"><h3>Пересобрать наряд на все дни?</h3><p>Будут обработаны только даты с сохранёнными назначениями отделений. Для каждой даты используется свой пост из графика. Даты без назначения и записи с конфликтами останутся без изменений.</p><div class="bar"><button class="btn" data-new-duty-confirm>Пересобрать</button><button class="btn g" data-new-duty-cancel>Отмена</button></div></div>';
    confirmation.addEventListener('click',event => {
      if (event.target.hasAttribute('data-new-duty-cancel') || event.target === confirmation) confirmation.remove();
      if (!event.target.hasAttribute('data-new-duty-confirm')) return;
      confirmation.remove();
      const totals = rebuildAll();
      save(); draw(1);
      const message = 'Дат проверено: ' + totals.datesChecked + '; обновлено: ' + totals.datesChanged + '; перенесено: ' + totals.moved + '; добавлено: ' + totals.added + '; уже на месте: ' + totals.already + '; дублей убрано: ' + totals.duplicatesRemoved + '; пропущено: ' + totals.skipped + '; проблем: ' + totals.errors.length + '.';
      toast(message);
      if (totals.errors.length) modal('<h3>Пересборка завершена с предупреждениями</h3><p>' + totals.errors.slice(0,30).map(esc).join('<br>') + (totals.errors.length > 30 ? '<br>… и ещё ' + (totals.errors.length-30) : '') + '</p><div class="bar"><button class="btn" data-act="cl">Закрыть</button></div>');
    });
    document.body.appendChild(confirmation);
  };
  const tabIndex = TABS.findIndex(item => item[0] === 'nr');
  if (tabIndex < 0) TABS.push(['nr','Наряд на службу']);
  function install() {
    EXV.nr = render;
    if (typeof draw === 'function' && tab === 'nr') draw(1);
  }
  window.addEventListener('patrul:ready', install);
  install();
  if (window.PATRUL_READY) install();
})();