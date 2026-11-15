/* Complete duty-roster workspace.
 * Replaces the old roster screen while preserving the existing D.duty data model.
 */
(() => {
  'use strict';
  if (typeof D === 'undefined' || typeof TABS === 'undefined' || typeof EXV === 'undefined' || typeof A === 'undefined') return;

  let pane = 'overview';
  const esc = value => typeof e === 'function' ? e(String(value == null ? '' : value)) : String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => String(value == null ? '' : value).trim();
  const norm = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const fullNameKey = value => norm(value).replace(/[.,]/g, '').replace(/\s+/g, ' ');
  const rowName = row => clean(row && (row.fio || row.name));
  const nonEmpty = value => value !== undefined && value !== null && clean(value) !== '';
  const dateRecord = date => {
    if (!D.duty || typeof D.duty !== 'object') D.duty = {};
    if (!D.duty[date]) D.duty[date] = typeof ddef === 'function' ? ddef() : { rows:{}, defects:[], incs:[] };
    const record = D.duty[date];
    if (!record.rows || typeof record.rows !== 'object' || Array.isArray(record.rows)) record.rows = {};
    if (!Array.isArray(record.defects)) record.defects = [];
    if (!Array.isArray(record.incs)) record.incs = [];
    if (!Array.isArray(record.departmentAssignments)) record.departmentAssignments = [];
    if (!Array.isArray(record.seniorSubstitutions)) record.seniorSubstitutions = [];
    return record;
  };
  const departments = () => {
    const source = Array.isArray(D.departments) ? D.departments : Array.isArray(D.set && D.set.departments) ? D.set.departments : [];
    const list = source.map((item,index) => typeof item === 'string'
      ? { id:String(index + 1), name:item }
      : { id:String(item.id || item.key || index + 1), name:String(item.name || item.title || ('Отделение ' + (index + 1))) }
    ).filter(item => item.name);
    if (list.length) return list;
    const grouped = new Map();
    (D.staff || []).forEach(person => {
      const name = clean(person && (person.departmentName || person.department || person.depName || person.otdelenie));
      if (!name) return;
      const n = Number(person.sq);
      const id = Number.isInteger(n) && n > 0 ? 'legacy-' + n : 'legacy-' + (grouped.size + 1);
      if (!grouped.has(id)) grouped.set(id,name);
    });
    if (grouped.size) return [...grouped].map(([id,name]) => ({id,name}));
    return Array.from({length:9},(_,index) => ({id:'legacy-' + (index + 1),name:'Отделение ' + (index + 1)}));
  };
  const personDepartment = person => {
    const id = person && (person.departmentId != null ? person.departmentId : person.depId);
    if (id != null && clean(id)) return {id:String(id),name:''};
    const n = Number(person && person.sq);
    if (Number.isInteger(n) && n > 0) return {id:'legacy-' + n,name:''};
    return {id:'',name:clean(person && (person.departmentName || person.department || person.depName || person.otdelenie))};
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
      if (!current) unique.set(key,{name,pos:clean(person.pos || person.position || person.dolzhnost),id:String(person.id || person.k || person.key || name)});
      else if (!current.pos) current.pos = clean(person.pos || person.position || person.dolzhnost);
    });
    return [...unique.values()];
  };
  const assignmentFor = (record,id) => record.departmentAssignments.find(item => String(item.departmentId) === String(id));
  const initialsKey = value => {
    const parts = norm(value).split(' ').filter(Boolean);
    if (parts.length < 2) return '';
    const surname = parts[0].replace(/[.,]/g,'');
    const tail = parts.slice(1);
    const initials = norm(value).includes('.') ? tail.join('').replace(/[^a-zа-яё]/g,'') : tail.map(part => part[0]).join('');
    return initials ? surname + ' ' + initials.replace(/ё/g,'е') : '';
  };
  const personMatches = (row,members) => {
    const key = fullNameKey(rowName(row));
    if (!key) return [];
    const exact = members.filter(member => fullNameKey(member.name) === key);
    if (exact.length) return exact;
    const initials = initialsKey(rowName(row));
    if (initials) {
      const abbreviated = members.filter(member => initialsKey(member.name) === initials);
      if (abbreviated.length) return abbreviated;
    }
    const parts = key.split(' ').filter(Boolean);
    if (parts.length < 2) return [];
    return members.filter(member => {
      const candidate = fullNameKey(member.name).split(' ').filter(Boolean);
      if (candidate[0] !== parts[0] || candidate.length < 2) return false;
      const given = parts.slice(1);
      if (given.length > candidate.length - 1) return false;
      return given.every((part,index) => part.length === 1
        ? candidate[index + 1] && candidate[index + 1][0] === part
        : candidate[index + 1] === part);
    });
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const postsList = () => typeof posts === 'function' ? posts().map(clean).filter(Boolean) : [];
  const isSenior = row => typeof isSeniorPatrolRow === 'function'
    ? isSeniorPatrolRow(row)
    : /старш.*патрул/i.test(clean(row && row.pos));
  const kitText = post => typeof postKitText === 'function' ? postKitText(post) : '';
  const options = (items,selected) => '<option value="">Не выбрано</option>' + items.map(item =>
    '<option value="' + esc(item) + '" ' + (String(item) === String(selected || '') ? 'selected' : '') + '>' + esc(item) + '</option>'
  ).join('');

  function makePlan(record,post,members) {
    const allRows = [];
    Object.keys(record.rows || {}).forEach(existingPost => (record.rows[existingPost] || []).forEach((row,index) => {
      if (row && rowName(row)) allRows.push({post:existingPost,index,row});
    }));
    const issues = [];
    const memberPlans = members.map(member => {
      const found = allRows.filter(entry => personMatches(entry.row,[member]).length === 1);
      const merged = {};
      found.forEach(entry => Object.keys(entry.row).forEach(key => {
        if (!nonEmpty(entry.row[key]) || key === 'fio' || key === 'name') return;
        if (nonEmpty(merged[key]) && String(merged[key]) !== String(entry.row[key])) {
          issues.push('У сотрудника «' + member.name + '» расходятся значения поля «' + key + '» в нескольких строках.');
        } else merged[key] = entry.row[key];
      }));
      return {member,found,merged};
    });
    allRows.forEach(entry => {
      const matches = personMatches(entry.row,members);
      if (matches.length > 1) issues.push('Строка «' + rowName(entry.row) + '» неоднозначна: подходит нескольким сотрудникам отделения.');
    });
    const matchedKeys = new Set();
    const duplicates = [];
    allRows.forEach(entry => {
      const matches = personMatches(entry.row,members);
      if (matches.length !== 1) return;
      const key = fullNameKey(matches[0].name);
      if (matchedKeys.has(key)) duplicates.push(entry);
      matchedKeys.add(key);
    });
    return {post,members,memberPlans,issues:[...new Set(issues)],duplicates};
  }
  function applyPlan(record,plan) {
    if (plan.issues.length) return {applied:false,reason:plan.issues.join(' ')};
    const rows = record.rows || (record.rows = {});
    const keepTarget = (rows[plan.post] || []).filter(row => !rowName(row) || !personMatches(row,plan.members).length);
    const rebuilt = [];
    const defaults = {tin:clean(record.t1),tout:clean(record.t2)};
    plan.memberPlans.forEach(item => {
      const row = {...item.merged};
      row.fio = item.member.name;
      if (!nonEmpty(row.pos)) row.pos = item.member.pos;
      if (!nonEmpty(row.tin)) row.tin = defaults.tin;
      if (!nonEmpty(row.tout)) row.tout = defaults.tout;
      rebuilt.push(row);
    });
    rows[plan.post] = keepTarget.concat(rebuilt);
    Object.keys(rows).forEach(existingPost => {
      if (existingPost === plan.post) return;
      rows[existingPost] = (rows[existingPost] || []).filter(row => !rowName(row) || !personMatches(row,plan.members).length);
    });
    return {
      applied:true,
      moved:plan.memberPlans.filter(item => item.found.some(entry => entry.post !== plan.post)).length,
      added:plan.memberPlans.filter(item => !item.found.length).length,
      already:plan.memberPlans.filter(item => item.found.some(entry => entry.post === plan.post)).length,
      duplicatesRemoved:plan.duplicates.length
    };
  }
  function rebuildDate(date,departmentId) {
    const original = D.duty && D.duty[date];
    if (!original || !Array.isArray(original.departmentAssignments) || !original.departmentAssignments.length) {
      return {skipped:true,reason:'На эту дату нет сохранённых назначений отделений.'};
    }
    const targets = original.departmentAssignments.filter(item => !departmentId || String(item.departmentId) === String(departmentId));
    if (!targets.length) return {skipped:true,reason:'Для выбранного отделения нет назначения на эту дату.'};
    const working = clone(original);
    const totals = {applied:0,moved:0,added:0,already:0,duplicatesRemoved:0,errors:[]};
    const usedPeople = new Set();
    for (const item of targets) {
      const dept = departments().find(entry => String(entry.id) === String(item.departmentId));
      const post = clean(item.post);
      if (!dept) { totals.errors.push((item.departmentName || item.departmentId) + ': отделение не найдено в личном составе.'); continue; }
      if (!post || !postsList().includes(post)) { totals.errors.push(dept.name + ': пост из графика не найден в текущем списке постов.'); continue; }
      const members = membersOf(dept);
      if (!members.length) { totals.errors.push(dept.name + ': в отделении нет сотрудников в строю.'); continue; }
      const overlap = members.filter(person => usedPeople.has(fullNameKey(person.name)));
      if (overlap.length) { totals.errors.push(dept.name + ': сотрудник уже включён в другое назначенное отделение (' + overlap.map(x => x.name).join(', ') + ').'); continue; }
      members.forEach(person => usedPeople.add(fullNameKey(person.name)));
      const plan = makePlan(working,post,members);
      if (plan.issues.length) { totals.errors.push(dept.name + ': ' + plan.issues.join(' ')); continue; }
      const result = applyPlan(working,plan);
      if (!result.applied) { totals.errors.push(dept.name + ': ' + result.reason); continue; }
      totals.applied++;
      totals.moved += result.moved;
      totals.added += result.added;
      totals.already += result.already;
      totals.duplicatesRemoved += result.duplicatesRemoved;
    }
    if (totals.errors.length) return {...totals,skipped:true,reason:'Дата не изменена: сначала устраните ошибки назначений.',errors:totals.errors};
    original.rows = working.rows || {};
    return {...totals,skipped:false};
  }
  function rebuildAll(departmentId) {
    const totals = {datesChecked:0,datesChanged:0,moved:0,added:0,already:0,duplicatesRemoved:0,skipped:0,errors:[]};
    Object.keys(D.duty || {}).sort().forEach(date => {
      const record = D.duty[date];
      if (!record || !Array.isArray(record.departmentAssignments)) return;
      if (!record.departmentAssignments.some(item => !departmentId || String(item.departmentId) === String(departmentId))) return;
      totals.datesChecked++;
      const result = rebuildDate(date,departmentId);
      if (result.skipped) {
        totals.skipped++;
        (result.errors || (result.reason ? [result.reason] : [])).forEach(error => totals.errors.push(date + ': ' + error));
        return;
      }
      if (result.applied) totals.datesChanged++;
      totals.moved += result.moved || 0;
      totals.added += result.added || 0;
      totals.already += result.already || 0;
      totals.duplicatesRemoved += result.duplicatesRemoved || 0;
    });
    return totals;
  }
  function paneButton(key,label) {
    return '<button type="button" class="nr-tab ' + (pane === key ? 'active' : '') + '" data-act="nrPane" data-pane="' + key + '">' + label + '</button>';
  }
  function assignmentPanel(record,date) {
    const list = departments();
    if (!list.length) return '<p class="mu">Сначала добавьте отделения в разделе «Личный состав».</p>';
    return '<div class="nr-table-wrap"><table class="nr-table"><thead><tr><th>Отделение</th><th>Назначенный пост</th><th>Старший патруля</th><th>Личный состав</th><th>Состояние</th></tr></thead><tbody>' +
      list.map(dept => {
        const current = assignmentFor(record,dept.id);
        const senior = current && current.seniorName || '—';
        const count = membersOf(dept).length;
        const valid = current && current.post && postsList().includes(current.post);
        return '<tr><td><b>' + esc(dept.name) + '</b></td><td>' + esc(current && current.post || 'Не назначен') + '</td><td>' + esc(senior) + '</td><td>' + count + ' чел.</td><td>' +
          (valid ? '<span class="nr-status good">Назначено</span>' : current ? '<span class="nr-status bad">Проверить пост</span>' : '<span class="nr-status muted">Нет назначения</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="nr-hint">Назначения на дату берутся из «Графика дежурств». Менять пост и старшего патруля нужно там — здесь наряд использует сохранённый график.</p>';
  }
  function rosterPanel(record) {
    const allPosts = postsList();
    if (!allPosts.length) return '<div class="nr-empty">Сначала добавьте посты в настройках.</div>';
    return allPosts.map(post => {
      const source = record.rows[post] || [];
      const rows = Array.from({length:Math.max(2,source.length)},(_,index) => source[index] || {});
      const filled = rows.filter(row => rowName(row)).length;
      return '<section class="nr-post"><div class="nr-post-head"><div><h3>' + esc(post) + '</h3><span>' + filled + ' сотрудников</span></div><button class="btn s g" data-act="drow" data-p="' + esc(post) + '">+ строка</button></div>' +
        '<div class="nr-table-wrap"><table class="nr-table nr-roster"><thead><tr><th>ФИО</th><th>Должность</th><th>Снаряжение</th><th>Заступление</th><th>Сдача</th></tr></thead><tbody>' +
        rows.map((row,index) => {
          const prefix = 'rows|' + post + '|' + index + '|';
          const field = key => 'value="' + esc(row[key] || '') + '" data-chg="duty" data-p="' + esc(prefix + key) + '"';
          const senior = isSenior(row);
          const kit = kitText(post);
          const equipment = senior
            ? (kit && row.fio ? '<div class="nr-kit">' + esc(kit) + '</div>' : '<input ' + field('eq') + ' placeholder="Выданное снаряжение">')
            : '<span class="nr-muted">Не выдаётся</span>';
          return '<tr><td><input list="dl_staff" ' + field('fio') + ' placeholder="Фамилия Имя Отчество"></td><td><input ' + field('pos') + ' placeholder="Должность"></td><td>' + equipment + '</td><td><input type="time" ' + field('tin') + '></td><td><input type="time" ' + field('tout') + '></td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }).join('');
  }
  function eventsPanel(record) {
    const postOptions = options(postsList(),'');
    const defects = record.defects.length ? record.defects.map((item,index) => {
      const prefix = 'defects|' + index + '|';
      const field = key => 'value="' + esc(item[key] || '') + '" data-chg="duty" data-p="' + prefix + key + '"';
      return '<tr><td><input type="time" ' + field('t') + '></td><td><select data-chg="duty" data-p="' + prefix + 'post">' + options(postsList(),item.post) + '</select></td><td><input ' + field('text') + ' placeholder="Что выявлено"></td><td><input list="dl_staff" ' + field('who') + ' placeholder="Сотрудник"></td><td><input ' + field('meas') + ' placeholder="Принятые меры"></td><td><input type="checkbox" data-chg="duty" data-p="' + prefix + 'fixed" ' + (item.fixed ? 'checked' : '') + '></td><td><button class="btn s g r" data-act="ddefdel" data-i="' + index + '">Удалить</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="nr-empty-cell">Недочётов пока нет</td></tr>';
    const incidents = record.incs.length ? record.incs.map((item,index) => {
      const prefix = 'incs|' + index + '|';
      const field = key => 'value="' + esc(item[key] || '') + '" data-chg="duty" data-p="' + prefix + key + '"';
      return '<tr><td><input type="time" ' + field('t') + '></td><td><select data-chg="duty" data-p="' + prefix + 'post">' + options(postsList(),item.post) + '</select></td><td><input ' + field('text') + ' placeholder="Происшествие или замечание"></td><td><input ' + field('meas') + ' placeholder="Принятые меры"></td><td><button class="btn s g r" data-act="dindel" data-i="' + index + '">Удалить</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="nr-empty-cell">Происшествий и замечаний пока нет</td></tr>';
    return '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Недочёты службы</h3><p>Фиксируйте выявленное, ответственного и принятые меры</p></div><button class="btn s" data-act="ddefadd">+ Недочёт</button></div><div class="nr-table-wrap"><table class="nr-table"><thead><tr><th>Время</th><th>Пост</th><th>Описание</th><th>Кто допустил</th><th>Меры</th><th>Устранено</th><th></th></tr></thead><tbody>' + defects + '</tbody></table></div></section>' +
      '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Происшествия и замечания</h3><p>Серьёзные случаи дополнительно регистрируйте в разделе «Происшествия»</p></div><button class="btn s" data-act="dinadd">+ Запись</button></div><div class="nr-table-wrap"><table class="nr-table"><thead><tr><th>Время</th><th>Пост</th><th>Описание</th><th>Принятые меры</th><th></th></tr></thead><tbody>' + incidents + '</tbody></table></div></section>';
  }
  function shiftPanel(record) {
    return '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Параметры смены</h3><p>Данные сохраняются в наряде выбранной даты</p></div></div><div class="nr-fields">' +
      '<label>Начало смены<input type="time" value="' + esc(record.t1 || '') + '" data-chg="duty" data-p="t1"></label>' +
      '<label>Окончание смены<input type="time" value="' + esc(record.t2 || '') + '" data-chg="duty" data-p="t2"></label>' +
      '<label>Начальник патруля<input list="dl_staff" value="' + esc(record.boss || '') + '" data-chg="duty" data-p="boss"></label>' +
      '<label>Заместитель начальника<input list="dl_staff" value="' + esc(record.dep || '') + '" data-chg="duty" data-p="dep"></label>' +
      '<label>Дежурный по помещению<input list="dl_staff" value="' + esc(record.dut || '') + '" data-chg="duty" data-p="dut"></label>' +
      '<label class="nr-check"><input type="checkbox" data-chg="duty" data-p="brief" ' + (record.brief ? 'checked' : '') + '> Инструктаж проведён</label>' +
      '<label>Время инструктажа<input type="time" value="' + esc(record.briefT || '') + '" data-chg="duty" data-p="briefT"></label>' +
      '</div></section>';
  }
  function reportPanel(record) {
    return '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Итоги службы</h3><p>Кратко зафиксируйте результат дежурства и доклад руководству</p></div></div>' +
      '<label class="nr-report-label">Итоги дня<textarea rows="6" data-chg="duty" data-p="summary" placeholder="Что выполнено, какие задачи решены, что требует внимания…">' + esc(record.summary || '') + '</textarea></label>' +
      '<label class="nr-check"><input type="checkbox" data-chg="duty" data-p="rep" ' + (record.rep ? 'checked' : '') + '> Итоги доложены руководству</label>' +
      '<label class="nr-report-time">Время доклада<input type="time" value="' + esc(record.repT || '') + '" data-chg="duty" data-p="repT"></label></section>';
  }
  function summaryCards(record) {
    const count = postsList().reduce((sum,post) => sum + (record.rows[post] || []).filter(row => rowName(row)).length,0);
    const assigned = record.departmentAssignments.length;
    const defects = record.defects.length;
    const fixed = record.defects.filter(item => item.fixed).length;
    const incidents = record.incs.length;
    return '<div class="nr-stats"><div><b>' + count + '</b><span>сотрудников в наряде</span></div><div><b>' + assigned + '</b><span>назначений отделений</span></div><div><b>' + defects + '</b><span>недочётов</span></div><div><b>' + fixed + '/' + defects + '</b><span>устранено</span></div><div><b>' + incidents + '</b><span>происшествий</span></div></div>';
  }
  function overviewPanel(record,date) {
    return shiftPanel(record) +
      '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Назначения отделений на дату</h3><p>Сверка с календарём дежурств, отдельный пост для каждого дня</p></div><button class="btn s g" data-act="nrRefresh">Обновить</button></div>' + assignmentPanel(record,date) + '</section>' +
      '<section class="nr-panel nr-rebuild"><div><h3>Сформировать состав наряда</h3><p>Переносит сотрудников на посты из графика, убирает дубли. Существующие времена, снаряжение, подписи и дополнительные поля сохраняются. Если обнаружен конфликт, соответствующая дата не меняется.</p></div><div class="nr-actions"><button class="btn" data-act="nrRebuildDay">Пересобрать эту дату</button><button class="btn g" data-act="nrRebuildAll">Пересобрать все дни</button></div></section>' +
      '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Состав по постам</h3><p>Краткий просмотр текущего распределения</p></div><button class="btn s g" data-act="nrPane" data-pane="roster">Открыть состав</button></div>' +
      '<div class="nr-post-summary">' + postsList().map(post => {
        const names = (record.rows[post] || []).filter(row => rowName(row)).map(row => rowName(row));
        return '<div><b>' + esc(post) + '</b><span>' + (names.length ? names.map(esc).join(', ') : 'Пока никого нет') + '</span></div>';
      }).join('') + '</div></section>';
  }
  function render() {
    const date = typeof dsel === 'string' && dsel ? dsel : (typeof today === 'function' ? today() : new Date().toISOString().slice(0,10));
    const record = dateRecord(date);
    const dateLabel = typeof fl === 'function' ? fl(date) : date;
    let body = '';
    if (pane === 'overview') body = overviewPanel(record,date);
    else if (pane === 'roster') body = rosterPanel(record);
    else if (pane === 'events') body = eventsPanel(record);
    else if (pane === 'report') body = reportPanel(record);
    else if (pane === 'equipment') body = rosterPanel(record);
    return '<style>' +
      '.nr-shell{max-width:1500px;margin:0 auto}.nr-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}.nr-date{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.nr-date input{width:155px}.nr-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 14px}.nr-tab{border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:9px;padding:9px 13px;font:inherit;font-size:13px;cursor:pointer}.nr-tab.active{border-color:var(--ac);background:var(--acs);font-weight:700}.nr-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:9px;margin:0 0 14px}.nr-stats>div{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;min-width:0}.nr-stats b{display:block;font-size:23px;font-variant-numeric:tabular-nums}.nr-stats span{display:block;color:var(--mu);font-size:12px;margin-top:3px}.nr-panel{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px;margin:0 0 13px;min-width:0}.nr-panel h3,.nr-post h3{margin:0;font-size:16px}.nr-panel-head,.nr-post-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.nr-panel-head p,.nr-post-head span{color:var(--mu);font-size:12px;margin:4px 0 0}.nr-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px 14px}.nr-fields label,.nr-report-label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--mu);font-weight:600}.nr-fields input,.nr-report-label textarea,.nr-report-time input{width:100%;box-sizing:border-box}.nr-fields .nr-check,.nr-check{display:flex;align-items:center;gap:8px;flex-direction:row;color:var(--tx);font-size:13px}.nr-check input{width:auto}.nr-report-label textarea{margin:6px 0 12px;min-height:130px}.nr-report-time{display:flex;flex-direction:column;gap:5px;width:min(220px,100%);font-size:12px;color:var(--mu)}.nr-report-time input{width:100%}.nr-table-wrap{width:100%;overflow:auto}.nr-table{width:100%;border-collapse:collapse;min-width:720px}.nr-table th,.nr-table td{padding:9px 8px;border-bottom:1px solid var(--bd);text-align:left;vertical-align:middle}.nr-table th{font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}.nr-table td input:not([type=checkbox]){min-width:110px;width:100%;box-sizing:border-box}.nr-table td input[type=time]{min-width:105px}.nr-status{display:inline-block;border-radius:20px;padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap}.nr-status.good{background:#e4f4ea;color:#216b3d}.nr-status.bad{background:#fff0df;color:#96510c}.nr-status.muted{background:var(--hv);color:var(--mu)}.nr-hint,.nr-muted{font-size:12px;color:var(--mu)}.nr-hint{margin:10px 0 0}.nr-rebuild{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;border-color:var(--ac)}.nr-rebuild p{max-width:760px;margin:5px 0 0;color:var(--mu);font-size:12px;line-height:1.5}.nr-actions{display:flex;gap:8px;flex-wrap:wrap}.nr-post{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:13px;margin-bottom:12px}.nr-roster{min-width:820px}.nr-kit{font-size:12px;max-width:260px;white-space:normal}.nr-empty,.nr-empty-cell{color:var(--mu);padding:18px;text-align:center}.nr-post-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.nr-post-summary>div{border:1px solid var(--bd);border-radius:9px;padding:10px;min-width:0}.nr-post-summary b,.nr-post-summary span{display:block}.nr-post-summary span{font-size:12px;color:var(--mu);margin-top:5px;overflow-wrap:anywhere}.nr-mobile-note{font-size:11px;color:var(--mu)}@media(max-width:650px){.nr-panel{padding:12px}.nr-date{width:100%}.nr-date input{flex:1;min-width:130px}.nr-actions{width:100%}.nr-actions button{flex:1}}' +
      '</style><div class="nr-shell"><div class="nr-head"><div><h1 style="margin-bottom:4px">Наряд на службу</h1><p class="sub" style="margin:0">Единый рабочий документ смены — назначения, личный состав, снаряжение, контроль и итоговый рапорт.</p></div><div class="nr-date"><button class="btn g" data-act="dday" data-d="-1">‹</button><input type="date" value="' + esc(date) + '" data-chg="dsel"><button class="btn g" data-act="dday" data-d="1">›</button><button class="btn g" data-act="dtoday">Сегодня</button><button class="btn s" data-act="prdoc" data-doc="d1">Печать книги</button><button class="btn s g" data-act="prdoc" data-doc="d2">Рапорт</button></div></div>' +
      summaryCards(record) + '<nav class="nr-tabs">' + paneButton('overview','Обзор смены') + paneButton('roster','Состав наряда') + paneButton('equipment','Снаряжение') + paneButton('events','Недочёты и происшествия') + paneButton('report','Итоги службы') + '</nav>' + body + '</div>';
  }

  A.nrPane = target => { pane = target.dataset.pane || 'overview'; draw(1); };
  A.nrRefresh = () => { draw(1); toast('Данные графика обновлены.'); };
  A.nrRebuildDay = () => {
    const result = rebuildDate(dsel);
    if (result.skipped) {
      const errors = result.errors || [result.reason || 'Дата не обработана.'];
      return modal('<h3>Наряд не изменён</h3><p>' + errors.map(esc).join('<br>') + '</p><div class="bar"><button class="btn" data-act="cl">Закрыть</button></div>');
    }
    save(); draw(1);
    toast('Наряд обновлён: перенесено ' + result.moved + ', добавлено ' + result.added + ', уже на месте ' + result.already + ', дублей удалено ' + result.duplicatesRemoved + '.');
  };
  A.nrRebuildAll = () => {
    const overlay = document.createElement('div');
    overlay.className = 'ov';
    overlay.innerHTML = '<div class="mod"><h3>Пересобрать наряды на все дни?</h3><p>Проверяются все сохранённые даты с назначениями. Для каждой даты используется её собственный пост из графика. Если на конкретной дате обнаружен конфликт, эта дата останется без изменений. Даты без назначений не затрагиваются.</p><div class="bar"><button class="btn" data-nr-confirm>Пересобрать все дни</button><button class="btn g" data-nr-cancel>Отмена</button></div></div>';
    overlay.addEventListener('click',event => {
      if (event.target.hasAttribute('data-nr-cancel') || event.target === overlay) { overlay.remove(); return; }
      if (!event.target.hasAttribute('data-nr-confirm')) return;
      overlay.remove();
      const totals = rebuildAll();
      save(); draw(1);
      const message = 'Дат проверено: ' + totals.datesChecked + '; обновлено: ' + totals.datesChanged + '; сотрудников перенесено: ' + totals.moved + '; добавлено: ' + totals.added + '; уже на месте: ' + totals.already + '; дублей удалено: ' + totals.duplicatesRemoved + '; без изменений: ' + totals.skipped + '.';
      toast(message);
      if (totals.errors.length) modal('<h3>Нужна проверка отдельных дат</h3><p>' + totals.errors.slice(0,40).map(esc).join('<br>') + (totals.errors.length > 40 ? '<br>… и ещё ' + (totals.errors.length - 40) : '') + '</p><div class="bar"><button class="btn" data-act="cl">Закрыть</button></div>');
    });
    document.body.appendChild(overlay);
  };
  A.nrResetRoster = () => {
    const overlay = document.createElement('div');
    overlay.className = 'ov';
    overlay.innerHTML = '<div class="mod"><h3>Очистить состав наряда за ' + esc(typeof fl === 'function' ? fl(dsel) : dsel) + '?</h3><p>Будут удалены только строки сотрудников по постам за выбранную дату. График назначений, параметры смены, недочёты, происшествия и итоги останутся на месте. Это действие нельзя отменить.</p><div class="bar"><button class="btn g r" data-nr-reset-confirm>Очистить состав</button><button class="btn" data-nr-reset-cancel>Отмена</button></div></div>';
    overlay.addEventListener('click',event => {
      if (event.target.hasAttribute('data-nr-reset-cancel') || event.target === overlay) { overlay.remove(); return; }
      if (!event.target.hasAttribute('data-nr-reset-confirm')) return;
      overlay.remove();
      const record = dateRecord(dsel);
      record.rows = {};
      save(); draw(1);
      toast('Состав наряда за выбранную дату очищен. Назначения и остальные записи сохранены.');
    });
    document.body.appendChild(overlay);
  };
  A.newDutySaveAssignment = () => toast('Назначения изменяются в разделе «График дежурств».');
  A.newDutyReloadAssignments = A.nrRefresh;
  A.newDutyRebuildDay = A.nrRebuildDay;
  A.newDutyRebuildAll = A.nrRebuildAll;

  const tabIndex = TABS.findIndex(item => item[0] === 'nr');
  if (tabIndex < 0) TABS.push(['nr','Наряд на службу']);
  function install() {
    EXV.nr = render;
    if (typeof draw === 'function' && tab === 'nr') draw(1);
  }
  window.addEventListener('patrul:ready',install);
  install();
  if (window.PATRUL_READY) install();
})();