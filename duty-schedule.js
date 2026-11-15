/* Duty calendar and temporary senior-patrol substitutions.
 * Uses the existing encrypted role-data sync through the commander's D model.
 * A substitution is date- and department-scoped; it never changes permanent staff links.
 */
(function () {
  'use strict';
  if (typeof D === 'undefined' || typeof TABS === 'undefined' || typeof EXV === 'undefined' || typeof A === 'undefined') return;

  let viewMonth = today().slice(0, 7) + '-01';
  let selectedDay = today();
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = s => { const p = String(s || '').split('-').map(Number); return new Date(p[0], p[1] - 1, p[2] || 1); };
  const safe = s => typeof e === 'function' ? e(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dayData = d => {
    if (!D.duty[d]) D.duty[d] = typeof ddef === 'function' ? ddef() : { rows:{}, defects:[], incs:[] };
    const x = D.duty[d];
    if (!Array.isArray(x.departmentAssignments)) x.departmentAssignments = [];
    if (!Array.isArray(x.seniorSubstitutions)) x.seniorSubstitutions = [];
    return x;
  };
  const norm = s => String(s || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  function departments() {
    const raw = Array.isArray(D.departments) ? D.departments : Array.isArray(D.set && D.set.departments) ? D.set.departments : [];
    const list = raw.map((x, i) => typeof x === 'string' ? {id:String(i+1),name:x} : {id:String(x.id || x.key || i+1),name:String(x.name || x.title || ('Отделение '+(i+1)))}).filter(x => x.name);
    if (list.length) return list;
    const names = [...new Set((D.staff || []).map(x => x.departmentName || x.department || x.depName || x.otdelenie).filter(Boolean).map(String))];
    return (names.length ? names : Array.from({length:9}, (_,i) => 'Отделение '+(i+1))).map((name,i) => ({id:String(i+1),name}));
  }
  function seniors() {
    return (D.staff || []).filter(x => {
      const role = norm(x.role || x.accountRole || '');
      const pos = norm(x.pos || x.position || x.dolzhnost || '');
      return role === 'starshiy_patrulya' || role === 'старший патруля' || pos.includes('старш') && pos.includes('патрул');
    }).map(x => ({id:String(x.id || x.k || x.key || x.name),name:String(x.name || x.fio || ''),dept:String(x.departmentId || x.depId || x.departmentName || x.department || '')})).filter(x => x.name);
  }
  function assignmentFor(date, depId) { return dayData(date).departmentAssignments.find(x => String(x.departmentId) === String(depId)); }
  function effectiveSenior(date, assignment) {
    const sub = dayData(date).seniorSubstitutions.find(x => String(x.departmentId) === String(assignment.departmentId) && norm(x.primarySenior) === norm(assignment.seniorName));
    return sub ? sub.substituteSenior : assignment.seniorName;
  }
  function optionList(items, selected, emptyLabel) {
    return '<option value="">'+safe(emptyLabel)+'</option>' + items.map(x => '<option value="'+safe(x.id)+'" '+(String(x.id)===String(selected)?'selected':'')+'>'+safe(x.name)+'</option>').join('');
  }
  function render() {
    const month = parseDay(viewMonth), first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - ((first.getDay()+6)%7));
    const depts = departments(), people = seniors(), postsList = typeof posts === 'function' ? posts() : [];
    const cells = [];
    for (let i=0;i<42;i++) {
      const d = new Date(start); d.setDate(start.getDate()+i);
      const key = dateKey(d), data = D.duty[key], entries = data && Array.isArray(data.departmentAssignments) ? data.departmentAssignments : [];
      const subs = data && Array.isArray(data.seniorSubstitutions) ? data.seniorSubstitutions : [];
      cells.push('<button type="button" class="cd '+(d.getMonth()!==month.getMonth()?'o ':'')+(key===selectedDay?'sel ':'')+(key===today()?'today':'')+'" data-act="dsSelect" data-date="'+key+'"><span class="n"><b>'+d.getDate()+'</b>'+(entries.length?'<small>'+entries.length+' отдел.</small>':'')+'</span>'+entries.slice(0,3).map(x=>'<span class="mp">'+safe(x.departmentName)+': '+safe(effectiveSenior(key,x)||'не назначен')+'</span>').join('')+(subs.length?'<span class="mu">Подмен: '+subs.length+'</span>':'')+'</button>');
    }
    const selected = dayData(selectedDay);
    const rows = depts.map(dep => {
      const a = assignmentFor(selectedDay,dep.id) || {};
      const actual = effectiveSenior(selectedDay,a);
      return '<tr><td><b>'+safe(dep.name)+'</b></td><td><select data-ds-field="post" data-dep="'+safe(dep.id)+'">'+optionList(postsList.map((name,i)=>({id:name,name})),a.post,'Выбрать пост')+'</select></td><td><select data-ds-field="senior" data-dep="'+safe(dep.id)+'">'+optionList(people.map(x=>({id:x.id,name:x.name})),a.seniorId,'Выбрать старшего патруля')+'</select></td><td>'+safe(actual||'Не назначен')+'</td><td><button class="btn s g" data-act="dsSaveAssignment" data-dep="'+safe(dep.id)+'">Сохранить</button> <button class="btn s g r" data-act="dsRemoveAssignment" data-dep="'+safe(dep.id)+'">Снять</button></td></tr>';
    }).join('');
    const subRows = selected.seniorSubstitutions.map((x,i)=>'<tr><td>'+safe(x.departmentName)+'</td><td>'+safe(x.primarySenior)+'</td><td><b>'+safe(x.substituteSenior)+'</b></td><td>'+safe(x.reason)+'</td><td><button class="btn s g r" data-act="dsRemoveSub" data-index="'+i+'">Отменить</button></td></tr>').join('');
    return '<h1>График дежурств</h1><p class="sub">Календарь назначений отделений на посты и временных подмен старших патруля.</p>'+
      '<div class="bar"><button class="btn g" data-act="dsMonth" data-step="-1">‹</button><b>'+month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})+'</b><button class="btn g" data-act="dsMonth" data-step="1">›</button><button class="btn g" data-act="dsToday">Сегодня</button><input type="date" value="'+selectedDay+'" data-ds-date></div>'+
      '<div class="cal"><div class="ch">Пн</div><div class="ch">Вт</div><div class="ch">Ср</div><div class="ch">Чт</div><div class="ch">Пт</div><div class="ch">Сб</div><div class="ch">Вс</div>'+cells.join('')+'</div>'+
      '<div class="card" style="margin-bottom:14px"><div class="bar"><div><h3 style="margin:0">Назначения на '+safe(parseDay(selectedDay).toLocaleDateString('ru-RU'))+'</h3><span class="mu">Отделение, пост и закреплённый старший патруля</span></div></div>'+
      (postsList.length?'<div class="scroll" style="max-height:none"><table><thead><tr><th>Отделение</th><th>Пост</th><th>Старший патруля</th><th>Фактически дежурит</th><th>Действия</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="mu">Сначала настройте посты в разделе «Настройки».</p>')+
      '</div><div class="card" style="margin-bottom:14px"><h3>Оформить подмену старшего патруля</h3><p class="mu">Подмена действует только на выбранную дату и отделение. Постоянное закрепление не меняется.</p>'+
      '<div class="fg"><div><label>Дежурное отделение</label><select id="ds-sub-dep">'+optionList(depts.map(x=>({id:x.id,name:x.name})),depts[0]&&depts[0].id,'Выбрать отделение')+'</select></div>'+
      '<div><label>Основной старший патруля</label><select id="ds-sub-primary">'+optionList(people.map(x=>({id:x.id,name:x.name})), '', 'Выбрать основного')+'</select></div>'+
      '<div><label>Заменяющий старший патруля</label><select id="ds-substitute">'+optionList(people.map(x=>({id:x.id,name:x.name})), '', 'Выбрать заменяющего')+'</select></div>'+
      '<div><label>Основание подмены</label><input id="ds-sub-reason" maxlength="240" placeholder="Причина / распоряжение"></div></div>'+
      '<div class="bar" style="margin:12px 0 0"><button class="btn" data-act="dsSaveSub">Сохранить подмену</button></div>'+
      '<h3 style="margin-top:18px">Подмены на выбранную дату</h3><div class="scroll" style="max-height:none"><table><thead><tr><th>Отделение</th><th>Кого заменяет</th><th>Кто выходит</th><th>Основание</th><th></th></tr></thead><tbody>'+ (subRows || '<tr><td colspan="5" class="mu">Подмен пока нет.</td></tr>')+'</tbody></table></div></div>'+
      '<p class="mu">Назначения и подмены сохраняются в наряде соответствующей даты и попадают в общую синхронизацию данных начальника. После сохранения обновите кабинет, чтобы увидеть результат на других устройствах.</p>';
  }
  TABS.push(['ds','График дежурств']);
  EXV.ds = render;
  A.dsMonth = (t) => { const d=parseDay(viewMonth); d.setMonth(d.getMonth()+Number(t.dataset.step||0)); viewMonth=dateKey(new Date(d.getFullYear(),d.getMonth(),1)); draw(1); };
  A.dsToday = () => { selectedDay=today(); viewMonth=selectedDay.slice(0,7)+'-01'; draw(1); };
  A.dsSelect = t => { selectedDay=t.dataset.date; draw(1); };
  A.dsSaveAssignment = t => {
    const dep=departments().find(x=>x.id===t.dataset.dep); if(!dep)return;
    const row=t.closest('tr'), post=row.querySelector('[data-ds-field="post"]').value, seniorId=row.querySelector('[data-ds-field="senior"]').value;
    const senior=seniors().find(x=>x.id===seniorId); if(!post||!senior)return toast('Выберите пост и старшего патруля.');
    const conflict=dayData(selectedDay).departmentAssignments.some(x=>x.departmentId!==dep.id&&String(x.seniorId)===senior.id);
    if(conflict)return toast('Этот старший патруля уже назначен на другое отделение в этот день.');
    const d=dayData(selectedDay), old=assignmentFor(selectedDay,dep.id);
    const record={departmentId:dep.id,departmentName:dep.name,post,seniorId:senior.id,seniorName:senior.name,updatedAt:new Date().toISOString(),updatedBy:(window.PATRUL_USER&&window.PATRUL_USER.name)||'Начальник патруля'};
    if(old)Object.assign(old,record); else d.departmentAssignments.push(record);
    save();draw(1);toast('Назначение сохранено.');
  };
  A.dsRemoveAssignment = t => { const d=dayData(selectedDay); d.departmentAssignments=d.departmentAssignments.filter(x=>x.departmentId!==t.dataset.dep); d.seniorSubstitutions=d.seniorSubstitutions.filter(x=>x.departmentId!==t.dataset.dep); save();draw(1);toast('Назначение снято.'); };
  A.dsSaveSub = () => {
    const dep=departments().find(x=>x.id===(document.getElementById('ds-sub-dep')||{}).value);
    const primary=seniors().find(x=>x.id===(document.getElementById('ds-sub-primary')||{}).value);
    const replacement=seniors().find(x=>x.id===(document.getElementById('ds-substitute')||{}).value);
    const reason=(document.getElementById('ds-sub-reason')||{}).value||'';
    if(!dep||!primary||!replacement||!reason.trim())return toast('Заполните отделение, обоих старших патруля и основание.');
    if(primary.id===replacement.id)return toast('Нельзя назначить подмену самому себе.');
    const d=dayData(selectedDay), assignment=assignmentFor(selectedDay,dep.id);
    if(!assignment)return toast('Сначала назначьте основного старшего патруля этому отделению в графике.');
    if(assignment.seniorId!==primary.id)return toast('Выбранный основной старший не совпадает с назначением отделения.');
    const conflict=d.departmentAssignments.some(x=>x.departmentId!==dep.id&&String(x.seniorId)===replacement.id);
    if(conflict)return toast('Заменяющий уже назначен на другое отделение в этот день.');
    const existing=d.seniorSubstitutions.findIndex(x=>x.departmentId===dep.id);
    const item={departmentId:dep.id,departmentName:dep.name,primarySenior:primary.name,primarySeniorId:primary.id,substituteSenior:replacement.name,substituteSeniorId:replacement.id,reason:reason.trim(),date:selectedDay,createdAt:new Date().toISOString(),createdBy:(window.PATRUL_USER&&window.PATRUL_USER.name)||'Начальник патруля'};
    if(existing>=0)d.seniorSubstitutions[existing]=item;else d.seniorSubstitutions.push(item);
    save();draw(1);toast('Временная подмена сохранена.');
  };
  A.dsRemoveSub = t => { const d=dayData(selectedDay); d.seniorSubstitutions.splice(Number(t.dataset.index),1); save();draw(1);toast('Подмена отменена.'); };
  document.addEventListener('change',ev=>{const t=ev.target;if(t&&t.matches('[data-ds-date]')){selectedDay=t.value||today();viewMonth=selectedDay.slice(0,7)+'-01';draw(1);}});
})();