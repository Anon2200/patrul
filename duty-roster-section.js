/* Independent daily duty roster UI.
 * This module reads/writes patrul_duty_rosters only; schedule assignments are separate.
 */
(() => {
  'use strict';
  if (typeof D === 'undefined' || typeof TABS === 'undefined' || typeof EXV === 'undefined' || typeof A === 'undefined') return;

  let pane='overview';
  let loadToken=0;
  let busyAll=false;
  let loadedAll=false;
  const rosters=new Map();
  const versions=new Map();
  const schedules=new Map();
  const saveTimers=new Map();
  const saving=new Set();
  const saveErrors=new Map();
  const revisions=new Map();
  const pendingConflicts=new Map();
  const defaultRecord=()=>({t1:'',t2:'',boss:'',dep:'',dut:'',brief:false,briefT:'',rows:{},defects:[],incs:[],summary:'',rep:false,repT:''});
  const clone=value=>JSON.parse(JSON.stringify(value==null?{}:value));
  const clean=value=>String(value==null?'':value).trim();
  const normalize=value=>clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ');
  const nameKey=value=>normalize(value).replace(/[.,]/g,'');
  const escape=value=>typeof e==='function'?e(String(value==null?'':value)):String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=(url,method='GET',body=null)=>{
    if(typeof window.PATRUL_API_REQUEST!=='function')throw new Error('Сервис сохранения наряда ещё не готов');
    return window.PATRUL_API_REQUEST(url,method,body);
  };
  const selectedDate=()=>typeof dsel==='string'&&dsel?dsel:today();
  const scheduleFor=date=>schedules.get(date)||{assignments:[],substitutions:[]};
  const recordFor=date=>rosters.get(date)||defaultRecord();
  function mirrorLegacy(date) {
    if(!D.duty||typeof D.duty!=='object')D.duty={};
    D.duty[date]={...clone(recordFor(date)),departmentAssignments:clone(scheduleFor(date).assignments||[]),seniorSubstitutions:clone(scheduleFor(date).substitutions||[])};
  }
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value);
  const allPosts=()=>typeof posts==='function'?posts().map(String).filter(Boolean):[];
  const postKit=post=>typeof postKitText==='function'?postKitText(post):'';
  const staffPerson=name=>(D.staff||[]).find(person=>nameKey(person.name||person.fio)===nameKey(name));
  const positionOf=row=>clean(row&&row.pos)||(staffPerson(rowName(row))&&clean(staffPerson(rowName(row)).pos))||'';
  const isSenior=row=>/старш.*патрул/i.test(positionOf(row))||scheduleFor(selectedDate()).assignments.some(item=>nameKey(item.effectiveSenior||item.seniorName)===nameKey(rowName(row)));
  const rowName=row=>clean(row&&(row.fio||row.name));

  function membersOf(department) {
    const unique=new Map();
    (D.staff||[]).filter(person=>{
      if(!person||!clean(person.name||person.fio))return false;
      const status=normalize(person.st||person.status);
      if(['уволен','исключен','исключён','не в штате','отстранён','отстранен'].includes(status))return false;
      const id=person.departmentId!=null?String(person.departmentId):person.depId!=null?String(person.depId):'';
      const name=clean(person.departmentName||person.department||person.depName||person.otdelenie);
      return id? id===String(department.id) : normalize(name)===normalize(department.name);
    }).forEach(person=>{
      const name=clean(person.name||person.fio),key=nameKey(name),existing=unique.get(key);
      if(!existing)unique.set(key,{name,pos:clean(person.pos||person.position||person.dolzhnost),id:String(person.id||person.k||person.key||name)});
      else if(!existing.pos)existing.pos=clean(person.pos||person.position||person.dolzhnost);
    });
    return [...unique.values()];
  }
  function departments() {
    const source=Array.isArray(D.departments)?D.departments:Array.isArray(D.set&&D.set.departments)?D.set.departments:[];
    const list=source.map((item,index)=>typeof item==='string'?{id:String(index+1),name:item}:{id:String(item.id||item.key||index+1),name:String(item.name||item.title||('Отделение '+(index+1)))}).filter(item=>item.name);
    if(list.length)return list;
    const found=new Map();
    (D.staff||[]).forEach(person=>{
      const name=clean(person.departmentName||person.department||person.depName||person.otdelenie);
      if(!name)return;
      const id=String(person.departmentId||person.depId||'legacy-'+(found.size+1));
      if(!found.has(id))found.set(id,name);
    });
    return [...found].map(([id,name])=>({id,name}));
  }
  function membersMatch(row,members) {
    const key=nameKey(rowName(row));
    if(!key)return [];
    const exact=members.filter(person=>nameKey(person.name)===key);
    if(exact.length)return exact;
    const parts=key.split(' ').filter(Boolean);
    if(parts.length<2)return [];
    return members.filter(person=>{
      const candidate=nameKey(person.name).split(' ').filter(Boolean);
      if(candidate[0]!==parts[0]||candidate.length<2)return false;
      const given=parts.slice(1);
      if(given.length===1&&given[0].length<=3){
        const initials=candidate.slice(1).map(part=>part[0]).join('');
        const token=given[0];
        return token===initials||(token.length===1&&candidate[1][0]===token);
      }
      if(given.length>candidate.length-1)return false;
      return given.every((part,index)=>part.length===1?candidate[index+1]&&candidate[index+1][0]===part:candidate[index+1]===part);
    });
  }
  function makePlan(record,post,members) {
    const allRows=[];
    Object.keys(record.rows||{}).forEach(existingPost=>(Array.isArray(record.rows[existingPost])?record.rows[existingPost]:[]).forEach((row,index)=>{
      if(row&&rowName(row))allRows.push({post:existingPost,index,row});
    }));
    const issues=[];
    const memberPlans=members.map(member=>{
      const found=allRows.filter(entry=>membersMatch(entry.row,[member]).length===1);
      const merged={};
      found.forEach(entry=>Object.keys(entry.row).forEach(key=>{
        if(!nonEmpty(entry.row[key])||key==='fio'||key==='name')return;
        if(nonEmpty(merged[key])&&String(merged[key])!==String(entry.row[key]))issues.push('У сотрудника «'+member.name+'» конфликтуют сохранённые значения поля «'+key+'».');
        else merged[key]=entry.row[key];
      }));
      return {member,found,merged};
    });
    allRows.forEach(entry=>{
      const matches=membersMatch(entry.row,members);
      if(matches.length>1)issues.push('Сокращённое ФИО «'+rowName(entry.row)+'» подходит нескольким сотрудникам отделения.');
    });
    const seen=new Set(),duplicates=[];
    allRows.forEach(entry=>{
      const matches=membersMatch(entry.row,members);
      if(matches.length!==1)return;
      const key=nameKey(matches[0].name);
      if(seen.has(key))duplicates.push(entry);
      seen.add(key);
    });
    return {post,members,memberPlans,issues:[...new Set(issues)],duplicates};
  }
  function nonEmpty(value){return value!==undefined&&value!==null&&clean(value)!=='';}
  function applyPlan(record,plan) {
    if(plan.issues.length)return {applied:false,reason:plan.issues.join(' ')};
    const rows=record.rows||(record.rows={});
    const keep=(Array.isArray(rows[plan.post])?rows[plan.post]:[]).filter(row=>!rowName(row)||!membersMatch(row,plan.members).length);
    const rebuilt=[];
    plan.memberPlans.forEach(item=>{
      const row={...item.merged};
      row.fio=item.member.name;
      if(!nonEmpty(row.pos))row.pos=item.member.pos;
      if(!nonEmpty(row.tin))row.tin=clean(record.t1);
      if(!nonEmpty(row.tout))row.tout=clean(record.t2);
      rebuilt.push(row);
    });
    rows[plan.post]=keep.concat(rebuilt);
    Object.keys(rows).forEach(existingPost=>{
      if(existingPost===plan.post)return;
      rows[existingPost]=(Array.isArray(rows[existingPost])?rows[existingPost]:[]).filter(row=>!rowName(row)||!membersMatch(row,plan.members).length);
    });
    return {
      applied:true,
      moved:plan.memberPlans.filter(item=>item.found.some(entry=>entry.post!==plan.post)).length,
      added:plan.memberPlans.filter(item=>!item.found.length).length,
      already:plan.memberPlans.filter(item=>item.found.some(entry=>entry.post===plan.post)).length,
      duplicatesRemoved:plan.duplicates.length
    };
  }
  function rebuildDate(date,record,schedule) {
    const assignments=Array.isArray(schedule&&schedule.assignments)?schedule.assignments:[];
    if(!assignments.length)return {skipped:true,reason:'На выбранную дату нет назначений отделений в графике.'};
    const working=clone(record),totals={applied:0,moved:0,added:0,already:0,duplicatesRemoved:0,errors:[]},used=new Set();
    for(const assignment of assignments){
      const dept=departments().find(item=>String(item.id)===String(assignment.departmentId));
      const post=clean(assignment.post);
      if(!dept){totals.errors.push((assignment.departmentName||assignment.departmentId)+': отделение не найдено в личном составе.');continue;}
      if(!post||!allPosts().includes(post)){totals.errors.push(dept.name+': пост не найден в настройках.');continue;}
      const members=membersOf(dept);
      if(!members.length){totals.errors.push(dept.name+': не найден личный состав в строю.');continue;}
      const overlap=members.filter(person=>used.has(nameKey(person.name)));
      if(overlap.length){totals.errors.push(dept.name+': сотрудник также включён в другое отделение ('+overlap.map(person=>person.name).join(', ')+').');continue;}
      members.forEach(person=>used.add(nameKey(person.name)));
      const plan=makePlan(working,post,members);
      if(plan.issues.length){totals.errors.push(dept.name+': '+plan.issues.join(' '));continue;}
      const result=applyPlan(working,plan);
      if(!result.applied){totals.errors.push(dept.name+': '+result.reason);continue;}
      totals.applied++;totals.moved+=result.moved;totals.added+=result.added;totals.already+=result.already;totals.duplicatesRemoved+=result.duplicatesRemoved;
    }
    if(totals.errors.length)return {...totals,skipped:true,errors:totals.errors,reason:'Наряд за эту дату не изменён из-за конфликтов.'};
    return {...totals,skipped:false,data:working};
  }

  async function loadOne(date,force=false) {
    if(!validDate(date))return;
    if(!force&&rosters.has(date))return;
    const token=++loadToken;
    try{
      const result=await api('/api/duty-roster?date='+encodeURIComponent(date));
      if(!result.response.ok)throw new Error(result.result.error||'Не удалось загрузить наряд');
      if(token!==loadToken&&date===selectedDate())return;
      rosters.set(date,{...defaultRecord(),...(result.result.data||{}),rows:result.result.data&&result.result.data.rows||{},defects:result.result.data&&result.result.data.defects||[],incs:result.result.data&&result.result.data.incs||[]});
      versions.set(date,Number(result.result.version)||0);
      schedules.set(date,result.result.schedule||{assignments:[],substitutions:[]});
      mirrorLegacy(date);
      saveErrors.delete(date);
      draw(1);
    }catch(error){
      saveErrors.set(date,error.message);
      draw(1);
    }
  }
  async function loadAll() {
    if(busyAll)return false;
    if(saveTimers.size||saving.size||pendingConflicts.size){
      toast('Сначала дождитесь сохранения текущих изменений и разрешите конфликты наряда.');
      return false;
    }
    busyAll=true;
    loadedAll=false;
    try{
      const result=await api('/api/duty-roster?all=1');
      if(!result.response.ok)throw new Error(result.result.error||'Не удалось загрузить сохранённые наряды');
      if(!result.result||!Array.isArray(result.result.items))throw new Error('Сервер вернул некорректный список дат наряда');

      // The server response is the source of truth for all scheduled and saved active dates.
      rosters.clear();versions.clear();schedules.clear();
      result.result.items.forEach(item=>{
        rosters.set(item.date,{...defaultRecord(),...(item.data||{}),rows:item.data&&item.data.rows||{},defects:item.data&&item.data.defects||[],incs:item.data&&item.data.incs||[]});
        versions.set(item.date,Number(item.version)||0);
        schedules.set(item.date,item.schedule||{assignments:[],substitutions:[]});
        mirrorLegacy(item.date);
      });
      loadedAll=true;
      return true;
    }catch(error){
      toast(error.message||'Не удалось загрузить сохранённые наряды. Пересборка отменена.');
      return false;
    }finally{busyAll=false;}
  }
  function queuePersist(date) {
    if(saveTimers.has(date))clearTimeout(saveTimers.get(date));
    const timer=setTimeout(()=>persistDate(date),550);
    saveTimers.set(date,timer);
  }
  function syncSave(date) {
    revisions.set(date,(revisions.get(date)||0)+1);
    if(pendingConflicts.has(date))return;
    saveErrors.delete(date);
    queuePersist(date);
  }
  async function persistDate(date) {
    if(pendingConflicts.has(date))return;
    const timer=saveTimers.get(date);if(timer)clearTimeout(timer);
    saveTimers.delete(date);
    if(saving.has(date)){queuePersist(date);return;}
    saving.add(date);
    const revision=revisions.get(date)||0;
    const expectedVersion=versions.get(date)||0;
    const snapshot=clone(recordFor(date));
    try{
      const result=await api('/api/duty-roster','PUT',{date,expectedVersion,data:snapshot});
      if(result.response.status===409){
        const reload=await api('/api/duty-roster?date='+encodeURIComponent(date));
        if(reload.response.ok){
          const remote={...defaultRecord(),...(reload.result.data||{}),rows:reload.result.data&&reload.result.data.rows||{},defects:reload.result.data&&reload.result.data.defects||[],incs:reload.result.data&&reload.result.data.incs||[]};
          const remoteVersion=Number(reload.result.version)||0;
          versions.set(date,remoteVersion);
          schedules.set(date,reload.result.schedule||{assignments:[],substitutions:[]});
          pendingConflicts.set(date,{remote,version:remoteVersion});
          mirrorLegacy(date);
        }
        throw new Error('Наряд изменился на другом устройстве. Ваши правки сохранены в этой вкладке. Выберите загрузку серверной версии или подтверждённую замену.');
      }
      if(!result.response.ok)throw new Error(result.result.error||'Не удалось сохранить наряд');
      versions.set(date,Number(result.result.version)||expectedVersion+1);
      if((revisions.get(date)||0)===revision){
        rosters.set(date,{...defaultRecord(),...(result.result.data||{})});
        saveErrors.delete(date);
      }
      mirrorLegacy(date);
      // Acknowledged save updates the server version; avoid noisy toast for every field.
    }catch(error){
      saveErrors.set(date,error.message);
      if(date===selectedDate())toast(error.message);
    }finally{
      saving.delete(date);
      if((revisions.get(date)||0)!==revision&&!pendingConflicts.has(date))queuePersist(date);
      draw(1);
    }
  }
  function getPath(object,path){return path.split('|').reduce((value,key)=>value==null?undefined:value[key],object);}
  function setPath(object,path,value){const keys=path.split('|');let target=object;for(let i=0;i<keys.length-1;i++){const key=keys[i];if(target[key]==null)target[key]=/^\d+$/.test(keys[i+1])?[]:{};target=target[key];}target[keys[keys.length-1]]=value;}
  function updateField(target) {
    const date=target.dataset.nrDate||selectedDate(),record=recordFor(date),path=target.dataset.nrField;
    if(!path)return;
    const value=target.type==='checkbox'?target.checked:target.value;
    setPath(record,path,value);
    const parts=path.split('|');
    if(parts[0]==='rows'&&parts[parts.length-1]==='fio'){
      const row=getPath(record,parts.slice(0,-1).join('|'));
      const person=staffPerson(value);
      if(person&&!clean(row.pos))row.pos=person.pos||person.position||'';
    }
    syncSave(date);
  }
  function rowsOf(record,post) {
    const source=Array.isArray(record.rows&&record.rows[post])?record.rows[post]:[];
    return Array.from({length:Math.max(2,source.length)},(_,index)=>source[index]||{});
  }
  function field(path,value,type='text',placeholder='') {
    return 'type="'+type+'" value="'+escape(value||'')+'" data-nr-field="'+escape(path)+'" data-nr-date="'+escape(selectedDate())+'"'+(placeholder?' placeholder="'+escape(placeholder)+'"':'');
  }
  function assignmentPanel(date) {
    const schedule=scheduleFor(date),assignments=schedule.assignments||[];
    if(!assignments.length)return '<div class="nr-empty">На эту дату отделения ещё не распределены по постам. Откройте «График дежурств» и сохраните назначения.</div>';
    return '<div class="nr-table-wrap"><table class="nr-table"><thead><tr><th>Отделение</th><th>Пост</th><th>Старший патруля</th><th>Личный состав</th><th>Подмена</th></tr></thead><tbody>'+
      assignments.map(item=>{
        const dept=departments().find(entry=>String(entry.id)===String(item.departmentId));
        const sub=(schedule.substitutions||[]).find(entry=>String(entry.departmentId)===String(item.departmentId));
        const count=dept?membersOf(dept).length:0;
        return '<tr><td><b>'+escape(item.departmentName||dept&&dept.name||'Отделение')+'</b></td><td>'+escape(item.post||'Не назначен')+'</td><td>'+escape(item.seniorName||'—')+'</td><td>'+count+' чел.</td><td>'+(sub?'<span class="nr-status good">'+escape(sub.substituteSenior)+'</span>':'<span class="nr-status muted">Нет</span>')+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  function rosterPanel(record,date) {
    const postsList=allPosts();
    if(!postsList.length)return '<div class="nr-empty">Сначала добавьте посты в настройках.</div>';
    return '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Состав наряда по постам</h3><p>Сотрудники, время заступления и сдачи службы</p></div><button class="btn s g" data-act="nrResetRoster">Сбросить состав за дату</button></div></section>'+
      postsList.map(post=>{
        const rows=rowsOf(record,post),filled=rows.filter(row=>rowName(row)).length;
        return '<section class="nr-post"><div class="nr-post-head"><div><h3>'+escape(post)+'</h3><span>'+filled+' сотрудников</span></div><button class="btn s g" data-act="nrAddRow" data-post="'+escape(post)+'">+ строка</button></div><div class="nr-table-wrap"><table class="nr-table nr-roster"><thead><tr><th>ФИО</th><th>Должность</th><th>Снаряжение</th><th>Заступление</th><th>Сдача</th></tr></thead><tbody>'+
          rows.map((row,index)=>{
            const prefix='rows|'+post+'|'+index+'|',senior=isSeniorForDate(date,row,post),kit=postKit(post);
            const equipment=senior?(kit&&row.fio?'<div class="nr-kit">'+escape(kit)+'</div>':'<input '+field(prefix+'eq',row.eq,'text','Выданное снаряжение')+'>'):'<span class="nr-muted">Не выдаётся</span>';
            return '<tr><td><input list="dl_staff" '+field(prefix+'fio',row.fio,'text','Фамилия Имя Отчество')+'></td><td><input '+field(prefix+'pos',row.pos,'text','Должность')+'></td><td>'+equipment+'</td><td><input '+field(prefix+'tin',row.tin,'time')+'></td><td><input '+field(prefix+'tout',row.tout,'time')+'></td></tr>';
          }).join('')+'</tbody></table></div></section>';
      }).join('');
  }
  function isSeniorForDate(date,row,post) {
    if(/старш.*патрул/i.test(clean(row.pos||staffPerson(rowName(row))?.pos)))return true;
    return (scheduleFor(date).assignments||[]).some(item=>{const sub=(scheduleFor(date).substitutions||[]).find(entry=>String(entry.departmentId)===String(item.departmentId));const effective=sub&&sub.substituteSenior||item.seniorName;return item.post===post&&nameKey(effective)===nameKey(rowName(row));});
  }
  function equipmentPanel(record,date) {
    const entries=[];
    allPosts().forEach(post=>(record.rows[post]||[]).forEach((row,index)=>{
      if(rowName(row)&&isSeniorForDate(date,row,post))entries.push({post,row,index});
    }));
    if(!entries.length)return '<section class="nr-panel"><h3>Получение снаряжения</h3><p class="nr-empty">Старший патруля пока не внесён в состав наряда.</p></section>';
    return '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Получение снаряжения</h3><p>Снаряжение выдаётся только Старшему патруля каждого назначенного поста</p></div></div><div class="nr-table-wrap"><table class="nr-table"><thead><tr><th>Пост</th><th>Старший патруля</th><th>Комплект по посту</th><th>Примечание о выдаче</th></tr></thead><tbody>'+
      entries.map(item=>'<tr><td>'+escape(item.post)+'</td><td><b>'+escape(rowName(item.row))+'</b></td><td>'+escape(postKit(item.post)||'Не задан в настройках')+'</td><td><input '+field('rows|'+item.post+'|'+item.index+'|eq',item.row.eq,'text','Выдано / замечание')+'></td></tr>').join('')+
      '</tbody></table></div></section>';
  }
  function eventsPanel(record) {
    const defects=record.defects.length?record.defects.map((item,index)=>{
      const p='defects|'+index+'|';
      return '<tr><td><input '+field(p+'t',item.t,'time')+'></td><td><select data-nr-field="'+p+'post" data-nr-date="'+escape(selectedDate())+'"><option value="">Не выбран</option>'+allPosts().map(post=>'<option value="'+escape(post)+'" '+(post===item.post?'selected':'')+'>'+escape(post)+'</option>').join('')+'</select></td><td><input '+field(p+'text',item.text,'text','Что выявлено')+'></td><td><input list="dl_staff" '+field(p+'who',item.who,'text','Сотрудник')+'></td><td><input '+field(p+'meas',item.meas,'text','Принятые меры')+'></td><td><input type="checkbox" data-nr-field="'+p+'fixed" data-nr-date="'+escape(selectedDate())+'" '+(item.fixed?'checked':'')+'></td><td><button class="btn s g r" data-act="nrDeleteDefect" data-index="'+index+'">Удалить</button></td></tr>';
    }).join(''):'<tr><td colspan="7" class="nr-empty-cell">Недочётов пока нет</td></tr>';
    const incidents=record.incs.length?record.incs.map((item,index)=>{
      const p='incs|'+index+'|';
      return '<tr><td><input '+field(p+'t',item.t,'time')+'></td><td><select data-nr-field="'+p+'post" data-nr-date="'+escape(selectedDate())+'"><option value="">Не выбран</option>'+allPosts().map(post=>'<option value="'+escape(post)+'" '+(post===item.post?'selected':'')+'>'+escape(post)+'</option>').join('')+'</select></td><td><input '+field(p+'text',item.text,'text','Происшествие или замечание')+'></td><td><input '+field(p+'meas',item.meas,'text','Принятые меры')+'></td><td><button class="btn s g r" data-act="nrDeleteIncident" data-index="'+index+'">Удалить</button></td></tr>';
    }).join(''):'<tr><td colspan="5" class="nr-empty-cell">Происшествий и замечаний пока нет</td></tr>';
    return '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Недочёты службы</h3><p>Фиксируйте выявленное, ответственного и принятые меры</p></div><button class="btn s" data-act="nrAddDefect">+ Недочёт</button></div><div class="nr-table-wrap"><table class="nr-table"><thead><tr><th>Время</th><th>Пост</th><th>Описание</th><th>Кто допустил</th><th>Меры</th><th>Устранено</th><th></th></tr></thead><tbody>'+defects+'</tbody></table></div></section>'+
      '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Происшествия и замечания</h3><p>Серьёзные случаи дополнительно регистрируйте в разделе «Происшествия»</p></div><button class="btn s" data-act="nrAddIncident">+ Запись</button></div><div class="nr-table-wrap"><table class="nr-table"><thead><tr><th>Время</th><th>Пост</th><th>Описание</th><th>Принятые меры</th><th></th></tr></thead><tbody>'+incidents+'</tbody></table></div></section>';
  }
  function shiftPanel(record) {
    return '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Параметры смены</h3><p>Сохраняются в отдельной записи выбранного дня</p></div></div><div class="nr-fields">'+
      '<label>Начало смены<input '+field('t1',record.t1,'time')+'></label><label>Окончание смены<input '+field('t2',record.t2,'time')+'></label>'+
      '<label>Начальник патруля<input list="dl_staff" '+field('boss',record.boss)+'></label><label>Заместитель начальника<input list="dl_staff" '+field('dep',record.dep)+'></label>'+
      '<label>Дежурный по помещению<input list="dl_staff" '+field('dut',record.dut)+'></label>'+
      '<label class="nr-check"><input type="checkbox" data-nr-field="brief" data-nr-date="'+escape(selectedDate())+'" '+(record.brief?'checked':'')+'> Инструктаж проведён</label>'+
      '<label>Время инструктажа<input '+field('briefT',record.briefT,'time')+'></label></div></section>';
  }
  function reportPanel(record) {
    return '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Итоги службы</h3><p>Сводка за выбранные сутки</p></div></div>'+
      '<label class="nr-report-label">Итоги дня<textarea rows="6" data-nr-field="summary" data-nr-date="'+escape(selectedDate())+'" placeholder="Что выполнено, какие задачи решены, что требует внимания…">'+escape(record.summary||'')+'</textarea></label>'+
      '<label class="nr-check"><input type="checkbox" data-nr-field="rep" data-nr-date="'+escape(selectedDate())+'" '+(record.rep?'checked':'')+'> Итоги доложены руководству</label>'+
      '<label class="nr-report-time">Время доклада<input '+field('repT',record.repT,'time')+'></label></section>';
  }
  function stats(record,date) {
    const count=allPosts().reduce((sum,post)=>sum+(record.rows[post]||[]).filter(row=>rowName(row)).length,0);
    const assignments=scheduleFor(date).assignments||[];
    const defects=record.defects.length,fixed=record.defects.filter(item=>item.fixed).length;
    return '<div class="nr-stats"><div><b>'+count+'</b><span>сотрудников в наряде</span></div><div><b>'+assignments.length+'</b><span>назначений отделений</span></div><div><b>'+defects+'</b><span>недочётов</span></div><div><b>'+fixed+'/'+defects+'</b><span>устранено</span></div><div><b>'+record.incs.length+'</b><span>происшествий</span></div></div>';
  }
  function overview(record,date) {
    const assignments=scheduleFor(date).assignments||[];
    return shiftPanel(record)+
      '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Назначения отделений на дату</h3><p>Посты берутся из отдельного календаря дежурств</p></div><button class="btn s g" data-act="nrRefresh">Обновить</button></div>'+assignmentPanel(date)+'</section>'+
      '<section class="nr-panel nr-rebuild"><div><h3>Сформировать состав наряда</h3><p>Сотрудники перемещаются на посты из графика; дубли удаляются. Время, снаряжение, подписи и дополнительные поля сохраняются. При конфликте ФИО конкретная дата не изменяется.</p></div><div class="nr-actions"><button class="btn" data-act="nrRebuildDay">Пересобрать эту дату</button><button class="btn g" data-act="nrRebuildAll">Пересобрать все дни</button></div></section>'+
      '<section class="nr-panel"><div class="nr-panel-head"><div><h3>Состав по постам</h3><p>Сотрудники, назначенные на дату</p></div><button class="btn s g" data-act="nrPane" data-pane="roster">Открыть состав</button></div><div class="nr-post-summary">'+
      allPosts().map(post=>'<div><b>'+escape(post)+'</b><span>'+((record.rows[post]||[]).filter(row=>rowName(row)).map(row=>escape(rowName(row))).join(', ')||'Пока никого нет')+'</span></div>').join('')+
      '</div></section>';
  }
  function render() {
    const date=selectedDate();
    if(!rosters.has(date)){loadOne(date);return '<h1>Наряд на службу</h1><p class="sub">Загружаем отдельную запись наряда за '+escape(date)+'…</p>';}
    const record=recordFor(date),dayName=typeof fl==='function'?fl(date):date;
    let content='';
    if(pane==='overview')content=overview(record,date);
    else if(pane==='roster')content=rosterPanel(record,date);
    else if(pane==='equipment')content=equipmentPanel(record,date);
    else if(pane==='events')content=eventsPanel(record);
    else if(pane==='report')content=reportPanel(record);
    const issue=saveErrors.get(date);
    return '<style>'+
      '.nr-shell{max-width:1500px;margin:0 auto}.nr-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}.nr-date{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.nr-date input{width:155px}.nr-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 14px}.nr-tab{border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:9px;padding:9px 13px;font:inherit;font-size:13px;cursor:pointer}.nr-tab.active{border-color:var(--ac);background:var(--acs);font-weight:700}.nr-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:9px;margin:0 0 14px}.nr-stats>div{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;min-width:0}.nr-stats b{display:block;font-size:23px;font-variant-numeric:tabular-nums}.nr-stats span{display:block;color:var(--mu);font-size:12px;margin-top:3px}.nr-panel{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px;margin:0 0 13px;min-width:0}.nr-panel h3,.nr-post h3{margin:0;font-size:16px}.nr-panel-head,.nr-post-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.nr-panel-head p,.nr-post-head span{color:var(--mu);font-size:12px;margin:4px 0 0}.nr-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px 14px}.nr-fields label,.nr-report-label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--mu);font-weight:600}.nr-fields input,.nr-report-label textarea,.nr-report-time input{width:100%;box-sizing:border-box}.nr-fields .nr-check,.nr-check{display:flex;align-items:center;gap:8px;flex-direction:row;color:var(--tx);font-size:13px}.nr-check input{width:auto}.nr-report-label textarea{margin:6px 0 12px;min-height:130px}.nr-report-time{display:flex;flex-direction:column;gap:5px;width:min(220px,100%);font-size:12px;color:var(--mu)}.nr-report-time input{width:100%}.nr-table-wrap{width:100%;overflow:auto}.nr-table{width:100%;border-collapse:collapse;min-width:720px}.nr-table th,.nr-table td{padding:9px 8px;border-bottom:1px solid var(--bd);text-align:left;vertical-align:middle}.nr-table th{font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}.nr-table td input:not([type=checkbox]),.nr-table td select{min-width:110px;width:100%;box-sizing:border-box}.nr-table td input[type=time]{min-width:105px}.nr-status{display:inline-block;border-radius:20px;padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap}.nr-status.good{background:#e4f4ea;color:#216b3d}.nr-status.muted{background:var(--hv);color:var(--mu)}.nr-hint,.nr-muted{font-size:12px;color:var(--mu)}.nr-empty,.nr-empty-cell{color:var(--mu);padding:18px;text-align:center}.nr-rebuild{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;border-color:var(--ac)}.nr-rebuild p{max-width:760px;margin:5px 0 0;color:var(--mu);font-size:12px;line-height:1.5}.nr-actions{display:flex;gap:8px;flex-wrap:wrap}.nr-post{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:13px;margin-bottom:12px}.nr-roster{min-width:820px}.nr-kit{font-size:12px;max-width:260px;white-space:normal}.nr-post-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.nr-post-summary>div{border:1px solid var(--bd);border-radius:9px;padding:10px;min-width:0}.nr-post-summary b,.nr-post-summary span{display:block}.nr-post-summary span{font-size:12px;color:var(--mu);margin-top:5px;overflow-wrap:anywhere}.nr-warning{padding:10px 12px;border:1px solid #e2a24a;border-radius:9px;background:#fff7e9;color:#8a4b08;margin-bottom:12px;font-size:13px}@media(max-width:650px){.nr-panel{padding:12px}.nr-date{width:100%}.nr-date input{flex:1;min-width:130px}.nr-actions{width:100%}.nr-actions button{flex:1}}'+
      '</style><div class="nr-shell"><div class="nr-head"><div><h1 style="margin-bottom:4px">Наряд на службу</h1><p class="sub" style="margin:0">Отдельная дневная запись. Старые наряды автоматически удаляются в 00:00.</p></div><div class="nr-date"><button class="btn g" data-act="dday" data-d="-1">‹</button><input type="date" value="'+escape(date)+'" data-chg="dsel"><button class="btn g" data-act="dday" data-d="1">›</button><button class="btn g" data-act="dtoday">Сегодня</button><button class="btn s" data-act="nrPrintRoster">Печать книги</button><button class="btn s g" data-act="nrPrintReport">Рапорт</button></div></div>'+
      (issue?'<div class="nr-warning">'+escape(issue)+(pendingConflicts.has(date)?'<div class="nr-actions" style="margin-top:8px"><button class="btn s g" data-act="nrReloadServer">Загрузить версию сервера</button><button class="btn s r" data-act="nrOverwriteServer">Оставить мои изменения</button></div>':'')+'</div>':'')+
      stats(record,date)+'<nav class="nr-tabs">'+
      '<button class="nr-tab '+(pane==='overview'?'active':'')+'" data-act="nrPane" data-pane="overview">Обзор смены</button>'+
      '<button class="nr-tab '+(pane==='roster'?'active':'')+'" data-act="nrPane" data-pane="roster">Состав наряда</button>'+
      '<button class="nr-tab '+(pane==='equipment'?'active':'')+'" data-act="nrPane" data-pane="equipment">Снаряжение</button>'+
      '<button class="nr-tab '+(pane==='events'?'active':'')+'" data-act="nrPane" data-pane="events">Недочёты и происшествия</button>'+
      '<button class="nr-tab '+(pane==='report'?'active':'')+'" data-act="nrPane" data-pane="report">Итоги службы</button></nav>'+content+'</div>';
  }
  function refreshSelected(force=true){return loadOne(selectedDate(),force);}
  A.nrPane=target=>{pane=target.dataset.pane||'overview';draw(1);};
  A.nrRefresh=()=>{schedules.delete(selectedDate());loadOne(selectedDate(),true);};
  A.nrAddRow=target=>{const record=recordFor(selectedDate()),post=target.dataset.post;record.rows[post]=Array.isArray(record.rows[post])?record.rows[post]:[];record.rows[post].push({});syncSave(selectedDate());draw(1);};
  A.nrAddDefect=()=>{recordFor(selectedDate()).defects.push({});syncSave(selectedDate());draw(1);};
  A.nrDeleteDefect=target=>{recordFor(selectedDate()).defects.splice(Number(target.dataset.index),1);syncSave(selectedDate());draw(1);};
  A.nrAddIncident=()=>{recordFor(selectedDate()).incs.push({});syncSave(selectedDate());draw(1);};
  A.nrDeleteIncident=target=>{recordFor(selectedDate()).incs.splice(Number(target.dataset.index),1);syncSave(selectedDate());draw(1);};
  A.nrReloadServer=()=>{
    const date=selectedDate(),conflict=pendingConflicts.get(date);
    if(!conflict)return;
    rosters.set(date,conflict.remote);
    versions.set(date,conflict.version);
    pendingConflicts.delete(date);
    saveErrors.delete(date);
    mirrorLegacy(date);
    draw(1);
    toast('Загружена версия наряда с сервера.');
  };
  A.nrOverwriteServer=()=>{
    const date=selectedDate();
    if(!pendingConflicts.has(date))return;
    modal('<h3>Заменить серверный наряд вашей версией?</h3><p>Изменения, которые успели сохранить на другом устройстве, будут перезаписаны вашим текущим вариантом.</p><div class="bar"><button class="btn g r" data-nr-overwrite-confirm>Подтвердить замену</button><button class="btn g" data-act="cl">Отмена</button></div>');
    const confirm=document.querySelector('[data-nr-overwrite-confirm]');
    if(confirm)confirm.addEventListener('click',()=>{
      const conflict=pendingConflicts.get(date);
      if(!conflict)return;
      pendingConflicts.delete(date);
      versions.set(date,conflict.version);
      closeM();
      syncSave(date);
      persistDate(date);
    },{once:true});
  };
  A.nrResetRoster=()=>{
    const overlay=document.createElement('div');overlay.className='ov';
    overlay.innerHTML='<div class="mod"><h3>Сбросить состав наряда за '+escape(typeof fl==='function'?fl(selectedDate()):selectedDate())+'?</h3><p>Будут удалены только сотрудники по постам за выбранную дату. График назначений, параметры смены, недочёты, происшествия и итоги останутся без изменений.</p><div class="bar"><button class="btn g r" data-nr-reset-confirm>Сбросить состав</button><button class="btn" data-nr-reset-cancel>Отмена</button></div></div>';
    overlay.addEventListener('click',event=>{
      if(event.target.hasAttribute('data-nr-reset-cancel')||event.target===overlay){overlay.remove();return;}
      if(!event.target.hasAttribute('data-nr-reset-confirm'))return;
      overlay.remove();recordFor(selectedDate()).rows={};syncSave(selectedDate());draw(1);toast('Состав за выбранную дату очищен. Остальные данные не тронуты.');
    });
    document.body.appendChild(overlay);
  };

  A.nrRebuildDay=async()=>{
    const date=selectedDate(),record=recordFor(date),result=rebuildDate(date,record,scheduleFor(date));
    if(result.skipped){modal('<h3>Наряд не изменён</h3><p>'+result.errors.map(escape).join('<br>')+'</p><div class="bar"><button class="btn" data-act="cl">Закрыть</button></div>');return;}
    rosters.set(date,result.data);syncSave(date);
    await persistDate(date);
    toast('Пересборка завершена: перенесено '+result.moved+', добавлено '+result.added+', уже на месте '+result.already+', дублей удалено '+result.duplicatesRemoved+'.');
  };
  A.nrRebuildAll=async()=>{
    const overlay=document.createElement('div');overlay.className='ov';
    overlay.innerHTML='<div class="mod"><h3>Пересобрать все дни по графику?</h3><p>Будут обработаны все текущие и будущие даты с назначениями в календаре, даже если ежедневный наряд за эту дату ещё не создан. Существующие наряды без назначений не изменяются. Данные прошедших суток удаляются ежедневной очисткой. При конфликте ФИО конкретная дата останется без изменений.</p><div class="bar"><button class="btn" data-nr-all-confirm>Пересобрать</button><button class="btn g" data-nr-all-cancel>Отмена</button></div></div>';
    overlay.addEventListener('click',async event=>{
      if(event.target.hasAttribute('data-nr-all-cancel')||event.target===overlay){overlay.remove();return;}
      if(!event.target.hasAttribute('data-nr-all-confirm'))return;
      overlay.remove();
      if(!(await loadAll()))return;
      const totals={dates:0,changed:0,moved:0,added:0,already:0,duplicates:0,skipped:0,errors:[]};
      for(const [date,record] of rosters.entries()){
        const result=rebuildDate(date,record,scheduleFor(date));
        if(result.skipped){totals.skipped++;if(result.errors.length)totals.errors.push(date+': '+result.errors.join(' '));continue;}
        const expectedVersion=versions.get(date)||0;
        try{
          const saved=await api('/api/duty-roster','PUT',{date,expectedVersion,data:clone(result.data)});
          if(!saved.response.ok)throw new Error(saved.result.error||'Не удалось сохранить');
          versions.set(date,Number(saved.result.version)||expectedVersion+1);
          rosters.set(date,{...defaultRecord(),...(saved.result.data||{})});
          saveErrors.delete(date);
          totals.dates++;totals.changed++;totals.moved+=result.moved;totals.added+=result.added;totals.already+=result.already;totals.duplicates+=result.duplicatesRemoved;
        }catch(error){
          totals.errors.push(date+': '+error.message);
        }
      }
      draw(1);
      toast('Проверено дат: '+totals.dates+'; пересобрано: '+totals.changed+'; перенесено: '+totals.moved+'; добавлено: '+totals.added+'; уже на месте: '+totals.already+'; удалено дублей: '+totals.duplicates+'; без изменений: '+totals.skipped+'.');
      if(totals.errors.length)modal('<h3>Есть даты для ручной проверки</h3><p>'+totals.errors.slice(0,40).map(escape).join('<br>')+'</p><div class="bar"><button class="btn" data-act="cl">Закрыть</button></div>');
    });
    document.body.appendChild(overlay);
  };

  function printDocument(kind) {
    const date=selectedDate(),record=recordFor(date),dateLabel=typeof fl==='function'?fl(date):date;
    const lines=[];
    allPosts().forEach(post=>(record.rows[post]||[]).filter(row=>rowName(row)).forEach(row=>{
      const senior=isSeniorForDate(date,row,post),equipment=senior?(postKit(post)||row.eq||''):'—';
      lines.push('<tr><td>'+escape(post)+'</td><td>'+escape(rowName(row))+'</td><td>'+escape(row.pos||positionOf(row))+'</td><td>'+escape(equipment)+'</td><td>'+escape(row.tin||'')+'</td><td>'+escape(row.tout||'')+'</td><td>________________</td></tr>');
    }));
    const html=kind==='report'
      ? '<h1>РАПОРТ ОБ ИТОГАХ НЕСЕНИЯ СЛУЖБЫ</h1><p>Дата: '+escape(dateLabel)+'. Смена: '+escape(record.t1||'—')+' — '+escape(record.t2||'—')+'.</p><p>Личного состава в наряде: '+lines.length+'. Недочётов: '+record.defects.length+'. Происшествий: '+record.incs.length+'.</p><p><b>Итоги:</b> '+escape(record.summary||'—')+'</p><p>Доложено: '+(record.rep?'да':'нет')+(record.repT?' в '+escape(record.repT):'')+'.</p><p style="margin-top:50px">Начальник патруля __________________ / '+escape(record.boss||'')+'</p>'
      : '<h1>КНИГА СЛУЖБЫ. НАРЯД НА '+escape(dateLabel)+'</h1><p>Смена: '+escape(record.t1||'—')+' — '+escape(record.t2||'—')+'. Начальник патруля: '+escape(record.boss||'—')+'. Заместитель: '+escape(record.dep||'—')+'. Дежурный по помещению: '+escape(record.dut||'—')+'.</p><p>Инструктаж: '+(record.brief?'проведён':'не отмечен')+(record.briefT?' в '+escape(record.briefT):'')+'.</p><table><thead><tr><th>Пост</th><th>ФИО</th><th>Должность</th><th>Снаряжение (Старший патруля)</th><th>Заступление</th><th>Сдача</th><th>Подпись</th></tr></thead><tbody>'+(lines.join('')||'<tr><td colspan="7">Состав не заполнен</td></tr>')+'</tbody></table><h2>Недочёты</h2><table><tr><th>Время</th><th>Пост</th><th>Описание</th><th>Кто допустил</th><th>Меры</th><th>Устранено</th></tr>'+record.defects.map(item=>'<tr><td>'+escape(item.t)+'</td><td>'+escape(item.post)+'</td><td>'+escape(item.text)+'</td><td>'+escape(item.who)+'</td><td>'+escape(item.meas)+'</td><td>'+(item.fixed?'да':'нет')+'</td></tr>').join('')+'</table><h2>Происшествия и замечания</h2><table><tr><th>Время</th><th>Пост</th><th>Описание</th><th>Меры</th></tr>'+record.incs.map(item=>'<tr><td>'+escape(item.t)+'</td><td>'+escape(item.post)+'</td><td>'+escape(item.text)+'</td><td>'+escape(item.meas)+'</td></tr>').join('')+'</table>';
    const win=window.open('','_blank');
    if(!win){toast('Разрешите всплывающее окно для печати документа.');return;}
    win.document.open();
    win.document.write('<!doctype html><html lang="ru"><meta charset="utf-8"><title>'+escape(kind==='report'?'Рапорт':'Наряд на службу')+'</title><style>body{font:14px Arial,sans-serif;color:#111;margin:20mm}h1{text-align:center;font-size:18px;margin:0 0 20px}h2{font-size:15px;margin:24px 0 8px}table{width:100%;border-collapse:collapse;margin:10px 0 18px}th,td{border:1px solid #333;padding:6px;text-align:left;font-size:11px}th{background:#eee}p{line-height:1.5}@page{size:A4 landscape;margin:12mm}</style><body>'+html+'</body></html>');
    win.document.close();win.focus();win.print();
  }
  A.nrPrintRoster=()=>printDocument('roster');
  A.nrPrintReport=()=>printDocument('report');


  let observedDutyDate=typeof today==='function'?today():selectedDate();
  window.setInterval(()=>{
    const current=typeof today==='function'?today():selectedDate();
    if(current===observedDutyDate)return;
    const previous=observedDutyDate;
    observedDutyDate=current;
    if(saveTimers.has(previous)){clearTimeout(saveTimers.get(previous));saveTimers.delete(previous);}
    rosters.delete(previous);
    versions.delete(previous);
    schedules.delete(previous);
    saveErrors.delete(previous);
    revisions.delete(previous);
    pendingConflicts.delete(previous);
    if(D.duty&&typeof D.duty==='object')delete D.duty[previous];
    if(selectedDate()===previous){
      dsel=current;
      loadOne(current,true).then(()=>toast('Наступили новые сутки. Открыт новый дневной наряд.'));
    } else if(selectedDate()<current) {
      loadOne(selectedDate(),true);
    }
  },15000);

  window.addEventListener('patrul:duty-schedule-updated',event=>{
    const detail=event.detail||{};
    if(!detail.date||!detail.data)return;
    schedules.set(detail.date,detail.data);
    if(rosters.has(detail.date))mirrorLegacy(detail.date);
    if(detail.date===selectedDate())draw(1);
  });
  document.addEventListener('change',event=>{
    const target=event.target;
    if(!target||!target.dataset||!target.dataset.nrField)return;
    updateField(target);
  });
  document.addEventListener('change',event=>{
    const target=event.target;
    if(target&&target.matches('[data-chg="dsel"]'))loadOne(target.value||today(),true);
  });

  const tabIndex=TABS.findIndex(item=>item[0]==='nr');
  if(tabIndex<0)TABS.push(['nr','Наряд на службу']);
  function install() {
    EXV.nr=render;
    if(window.PATRUL_READY)loadOne(selectedDate());
    if(typeof draw==='function'&&tab==='nr')draw(1);
  }
  window.addEventListener('patrul:ready',install);
  install();
  if(window.PATRUL_READY)install();
})();