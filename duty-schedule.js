/* Independent daily duty schedule editor.
 * Assignments live in patrul_duty_schedule, never inside role data or daily roster payloads.
 */
(() => {
  'use strict';
  if (typeof D === 'undefined' || typeof TABS === 'undefined' || typeof EXV === 'undefined' || typeof A === 'undefined') return;

  let viewMonth = today().slice(0,7) + '-01';
  let selectedDay = today();
  let busy = false;
  let bridgeTimer = null;
  const days = new Map();
  const versions = new Map();
  const bridgeFingerprints = new Map();
  const pad = n => String(n).padStart(2,'0');
  const dateKey = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const parseDay = value => { const parts=String(value||'').split('-').map(Number); return new Date(parts[0],parts[1]-1,parts[2]||1); };
  const safe = value => typeof e === 'function' ? e(String(value==null?'':value)) : String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  const api = (url,method='GET',body=null) => {
    if (typeof window.PATRUL_API_REQUEST !== 'function') throw new Error('Сервис сохранения графика ещё не готов');
    return window.PATRUL_API_REQUEST(url,method,body);
  };
  const emptyDay = () => ({assignments:[],substitutions:[]});
  const dayData = date => days.get(date) || emptyDay();
  function departments() {
    const raw=Array.isArray(D.departments)?D.departments:[];
    return raw.map((item,index)=>typeof item==='string'
      ? {id:String(index+1),name:item}
      : {id:String(item.id||item.key||index+1),name:String(item.name||item.title||('Отделение '+(index+1)))}
    ).filter(item=>item.name);
  }
  function seniors() {
    return (D.staff||[]).filter(person=>{
      const role=normalize(person.role||person.accountRole||'');
      const pos=normalize(person.pos||person.position||person.dolzhnost||'');
      return role==='starshiy_patrulya'||role==='старший патруля'||(pos.includes('старш')&&pos.includes('патрул'));
    }).map(person=>({id:String(person.id||person.k||person.key||person.name),name:String(person.name||person.fio||'')})).filter(person=>person.name);
  }
  const postList = () => typeof posts==='function' ? posts().map(String).filter(Boolean) : [];
  function ensureLegacySchedule(date,data) {
    if(!D.duty||typeof D.duty!=='object')D.duty={};
    const existing=D.duty[date]&&typeof D.duty[date]==='object'?D.duty[date]:{};
    D.duty[date]={...existing,departmentAssignments:JSON.parse(JSON.stringify(data.assignments||[])),seniorSubstitutions:JSON.parse(JSON.stringify(data.substitutions||[]))};
    bridgeFingerprints.set(date,fingerprint(data));
  }
  function fingerprint(value) { return JSON.stringify({assignments:value.assignments||[],substitutions:value.substitutions||[]}); }

  async function loadMonth(month,showError=false) {
    if(busy)return;
    busy=true;
    try {
      const result=await api('/api/duty-schedule?month='+encodeURIComponent(month));
      if(!result.response.ok)throw new Error(result.result.error||'Не удалось загрузить график');
      const incoming=new Map();
      (result.result.days||[]).forEach(day=>incoming.set(day.date,{
        assignments:Array.isArray(day.assignments)?day.assignments:[],
        substitutions:(Array.isArray(day.substitutions)?day.substitutions:[])
      }));
      // Update only the requested month. Other months remain cached for quick navigation.
      for(const key of [...days.keys()])if(key.startsWith(month))days.delete(key);
      for(const key of [...versions.keys()])if(key.startsWith(month))versions.delete(key);
      for(const [date,data] of incoming){
        days.set(date,data);
        const dayRow=(result.result.days||[]).find(item=>item.date===date);
        // The API returns a month-wide high-water version for calendars. Fetch the
        // exact version for each date lazily before its first write.
        versions.set(date,Number(dayRow&&dayRow.version)||0);
        ensureLegacySchedule(date,data);
      }
      if(!days.has(selectedDay)){
        const cached=days.get(selectedDay);
        if(cached)ensureLegacySchedule(selectedDay,cached);
      }
      draw(1);
    } catch(error) {
      if(showError)toast(error.message);
      else console.error('Duty schedule load:',error);
    } finally {busy=false;}
  }

  async function loadDateVersion(date) {
    // Date-specific GET is part of the schedule endpoint contract.
    const month=date.slice(0,7);
    const result=await api('/api/duty-schedule?month='+encodeURIComponent(month));
    if(!result.response.ok)throw new Error(result.result.error||'Не удалось обновить график');
    const match=(result.result.days||[]).find(item=>item.date===date);
    const data=match?{assignments:match.assignments||[],substitutions:match.substitutions||[]}:emptyDay();
    days.set(date,data);
    // The GET response is read-only; its row version is provided separately by
    // the schedule-version endpoint below and defaults to the month query cache.
    if(!versions.has(date))versions.set(date,0);
    ensureLegacySchedule(date,data);
    return data;
  }

  async function ensureVersion(date) {
    if(versions.has(date))return versions.get(date);
    const r=await api('/api/duty-schedule?month='+encodeURIComponent(date.slice(0,7)));
    if(!r.response.ok)throw new Error(r.result.error||'Не удалось проверить версию графика');
    const day=(r.result.days||[]).find(item=>item.date===date);
    const version=day?Number(day.version)||0:0;
    versions.set(date,version);
    const data={assignments:day&&day.assignments||[],substitutions:day&&day.substitutions||[]};
    if(day){days.set(date,data);ensureLegacySchedule(date,data);}
    return version;
  }

  async function saveDay(date,data) {
    const expectedVersion=await ensureVersion(date);
    const r=await api('/api/duty-schedule','PUT',{
      date,expectedVersion,
      assignments:data.assignments||[],
      substitutions:data.substitutions||[]
    });
    if(r.response.status===409){
      versions.delete(date);
      await loadMonth(date.slice(0,7),true);
      throw new Error('График изменился на другом устройстве. Обновил данные — проверьте назначения ещё раз.');
    }
    if(!r.response.ok)throw new Error(r.result.error||'Не удалось сохранить назначения');
    const next={assignments:r.result.assignments||[],substitutions:r.result.substitutions||[]};
    days.set(date,next);
    versions.set(date,Number(r.result.version)||expectedVersion+1);
    ensureLegacySchedule(date,next);
    window.dispatchEvent(new CustomEvent('patrul:duty-schedule-updated',{detail:{date,data:next}}));
    return next;
  }

  function calendarHtml(month) {
    const first=new Date(month.getFullYear(),month.getMonth(),1);
    const start=new Date(first);start.setDate(first.getDate()-((first.getDay()+6)%7));
    const cells=[];
    for(let index=0;index<42;index++){
      const date=new Date(start);date.setDate(start.getDate()+index);
      const key=dateKey(date),data=dayData(key),assignments=data.assignments||[];
      cells.push('<button type="button" class="cd '+(date.getMonth()!==month.getMonth()?'o ':'')+(key===selectedDay?'sel ':'')+(key===today()?'today':'')+'" data-act="dsSelect" data-date="'+key+'"><span class="n"><b>'+date.getDate()+'</b>'+(assignments.length?'<small>'+assignments.length+' отдел.</small>':'')+'</span>'+
        assignments.slice(0,3).map(item=>'<span class="mp">'+safe(item.departmentName)+': '+safe(item.effectiveSenior||item.seniorName||'не назначен')+'</span>').join('')+
        (assignments.length>3?'<span class="mu">ещё '+(assignments.length-3)+'</span>':'')+'</button>');
    }
    return '<div class="cal"><div class="ch">Пн</div><div class="ch">Вт</div><div class="ch">Ср</div><div class="ch">Чт</div><div class="ch">Пт</div><div class="ch">Сб</div><div class="ch">Вс</div>'+cells.join('')+'</div>';
  }

  function assignmentRows(data) {
    const deptList=departments(),allPosts=postList(),allSeniors=seniors();
    if(!deptList.length)return '<p class="mu">Сначала добавьте отделения в разделе «Личный состав».</p>';
    const current=new Map((data.assignments||[]).map(item=>[String(item.departmentId),item]));
    const optionList=(items,selected,label)=>'<option value="">'+label+'</option>'+items.map(item=>
      '<option value="'+safe(item.id)+'" '+(String(item.id)===String(selected||'')?'selected':'')+'>'+safe(item.name)+'</option>'
    ).join('');
    
    return '<div class="scroll" style="max-height:none"><table><thead><tr><th>Отделение</th><th>Пост</th><th>Старший патруля</th><th>Действие</th></tr></thead><tbody>'+
      deptList.map(dept=>{
        const item=current.get(dept.id)||{};
        const seniorId=item.seniorId||allSeniors.find(person=>normalize(person.name)===normalize(item.seniorName))?.id||'';
        const peopleCount=(D.staff||[]).filter(person=>String(person.departmentId||person.depId||'')===dept.id||
          (!person.departmentId&&!person.depId&&normalize(person.departmentName||person.department)===normalize(dept.name))).length;
        const postOptions='<option value="">Выбрать пост</option>'+allPosts.map(post=>'<option value="'+safe(post)+'" '+(post===String(item.post||'')?'selected':'')+'>'+safe(post)+'</option>').join('');
        return '<tr><td><b>'+safe(dept.name)+'</b><div class="mu small">'+peopleCount+' сотрудников</div></td><td><select data-ds-post="'+safe(dept.id)+'">'+postOptions+'</select></td><td><select data-ds-senior="'+safe(dept.id)+'">'+optionList(allSeniors,seniorId,'Не назначен')+'</select></td><td><span class="mu small">'+(item.post?'Назначено':'Не назначено')+'</span></td></tr>';
      }).join('')+'</tbody></table></div>';
  }

  function substitutionRows(data) {
    const existing=data.substitutions||[];
    const list=departments(),people=seniors();
    const sub=existing.map((item,index)=>'<tr><td>'+safe(item.departmentName||'Отделение')+'</td><td>'+safe(item.primarySenior||'')+'</td><td><b>'+safe(item.substituteSenior||'')+'</b></td><td>'+safe(item.reason||'')+'</td><td><button class="btn s g r" data-act="dsRemoveSub" data-index="'+index+'">Отменить</button></td></tr>').join('');
    const option=(items)=>'<option value="">Выбрать</option>'+items.map(item=>'<option value="'+safe(item.id)+'">'+safe(item.name)+'</option>').join('');
    return '<section class="card" style="margin-top:14px"><h3>Временная подмена Старшего патруля</h3><p class="mu">Подмена действует только на выбранную дату. Постоянное закрепление не меняется.</p>'+
      '<div class="fg"><div><label>Отделение</label><select id="ds-sub-dep">'+option(list)+'</select></div><div><label>Основной старший</label><select id="ds-sub-primary">'+option(people)+'</select></div><div><label>Заменяющий</label><select id="ds-substitute">'+option(people)+'</select></div><div><label>Основание</label><input id="ds-sub-reason" maxlength="500" placeholder="Причина / распоряжение"></div></div>'+
      '<div class="bar" style="margin-top:10px"><button class="btn" data-act="dsSaveSub">Сохранить подмену</button></div><div class="scroll" style="max-height:none;margin-top:10px"><table><thead><tr><th>Отделение</th><th>Кого заменяет</th><th>Кто выходит</th><th>Основание</th><th></th></tr></thead><tbody>'+(sub||'<tr><td colspan="5" class="mu">Подмен пока нет</td></tr>')+'</tbody></table></div></section>';
  }

  function render() {
    const month=parseDay(viewMonth),data=dayData(selectedDay);
    const monthName=month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    const selectedName=parseDay(selectedDay).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const assigned=data.assignments||[];
    return '<h1>График дежурств</h1><p class="sub">Отдельный календарь назначений отделений, постов и Старших патруля. Состав ежедневного наряда хранится отдельно.</p>'+
      '<div class="bar"><button class="btn g" data-act="dsMonth" data-step="-1">‹</button><b>'+safe(monthName)+'</b><button class="btn g" data-act="dsMonth" data-step="1">›</button><button class="btn g" data-act="dsToday">Сегодня</button><input type="date" value="'+safe(selectedDay)+'" data-ds-date></div>'+
      calendarHtml(month)+
      '<section class="card" style="margin-top:14px"><div class="bar"><div><h3 style="margin:0">Назначения на '+safe(selectedName)+'</h3><span class="mu">Выберите пост и Старшего патруля для каждого отделения</span></div><button class="btn" data-act="dsSaveAssignment" style="margin-left:auto">Сохранить назначения</button></div>'+
      assignmentRows(data)+
      '<div class="bar" style="margin-top:12px"><span class="mu small">Сохранено назначений: '+assigned.length+'</span></div></section>'+
      substitutionRows(data)+
      '<p class="mu" style="margin-top:12px">Прошедшие даты автоматически очищаются в 00:00. Будущие назначения сохраняются, пока не наступит их дата.</p>';
  }

  async function reloadSelected() {
    if(selectedDay.slice(0,7)!==viewMonth.slice(0,7)){
      viewMonth=selectedDay.slice(0,7)+'-01';
      await loadMonth(viewMonth,true);
    } else if(!days.has(selectedDay)) {
      await loadMonth(viewMonth,true);
    } else draw(1);
  }
  A.dsMonth = target => {
    const month=parseDay(viewMonth);month.setMonth(month.getMonth()+Number(target.dataset.step||0));
    viewMonth=dateKey(new Date(month.getFullYear(),month.getMonth(),1));
    if(selectedDay.slice(0,7)!==viewMonth.slice(0,7))selectedDay=viewMonth;
    loadMonth(viewMonth,true);
  };
  A.dsToday = () => { selectedDay=today();viewMonth=selectedDay.slice(0,7)+'-01';loadMonth(viewMonth,true); };
  A.dsSelect = target => { selectedDay=target.dataset.date;reloadSelected(); };
  A.dsSaveAssignment = async () => {
    try {
      const data=dayData(selectedDay),selected=[];
      departments().forEach(dept=>{
        const post=document.querySelector('[data-ds-post="'+CSS.escape(dept.id)+'"]')?.value||'';
        const seniorId=document.querySelector('[data-ds-senior="'+CSS.escape(dept.id)+'"]')?.value||'';
        if(!post)return;
        const senior=seniors().find(person=>person.id===seniorId);
        selected.push({departmentId:dept.id,departmentName:dept.name,post,seniorId:senior?senior.id:'',seniorName:senior?senior.name:''});
      });
      const next={assignments:selected,substitutions:(data.substitutions||[]).filter(item=>selected.some(entry=>entry.departmentId===String(item.departmentId)))};
      const saved=await saveDay(selectedDay,next);
      toast('Назначения сохранены. Отделений: '+saved.assignments.length+'.');
      draw(1);
    } catch(error) { toast(error.message); }
  };
  A.dsRemoveAssignment = async target => {
    const data=dayData(selectedDay);
    const next={assignments:(data.assignments||[]).filter(item=>String(item.departmentId)!==String(target.dataset.dep)),substitutions:(data.substitutions||[]).filter(item=>String(item.departmentId)!==String(target.dataset.dep))};
    try{await saveDay(selectedDay,next);draw(1);toast('Назначение отделения снято.');}catch(error){toast(error.message);}
  };
  A.dsSaveSub = async () => {
    const dep=departments().find(item=>item.id===(document.getElementById('ds-sub-dep')||{}).value);
    const primary=seniors().find(item=>item.id===(document.getElementById('ds-sub-primary')||{}).value);
    const replacement=seniors().find(item=>item.id===(document.getElementById('ds-substitute')||{}).value);
    const reason=String((document.getElementById('ds-sub-reason')||{}).value||'').trim();
    const data=dayData(selectedDay),assignment=dep&&(data.assignments||[]).find(item=>String(item.departmentId)===dep.id);
    if(!dep||!primary||!replacement||!reason)return toast('Заполните все поля подмены.');
    if(primary.id===replacement.id)return toast('Нельзя назначить подмену самому себе.');
    if((data.assignments||[]).some(item=>String(item.departmentId)!==dep.id&&String(item.seniorId||'')===replacement.id))return toast('Этот Старший патруля уже назначен на другое отделение в этот день.');
    if((data.substitutions||[]).some(item=>String(item.departmentId)!==dep.id&&String(item.substituteSeniorId||'')===replacement.id))return toast('Этот Старший патруля уже назначен на другое отделение в этот день.');
    if(!assignment)return toast('Сначала назначьте отделение на пост.');
    if(assignment.seniorId&&assignment.seniorId!==primary.id)return toast('Основной старший не совпадает с графиком.');
    const item={departmentId:dep.id,departmentName:dep.name,primarySenior:primary.name,primarySeniorId:primary.id,substituteSenior:replacement.name,substituteSeniorId:replacement.id,reason,date:selectedDay};
    const next={assignments:data.assignments||[],substitutions:(data.substitutions||[]).filter(entry=>String(entry.departmentId)!==dep.id).concat(item)};
    try{await saveDay(selectedDay,next);draw(1);toast('Подмена сохранена.');}catch(error){toast(error.message);}
  };
  A.dsRemoveSub = async target => {
    const data=dayData(selectedDay),next={assignments:data.assignments||[],substitutions:(data.substitutions||[]).filter((item,index)=>index!==Number(target.dataset.index))};
    try{await saveDay(selectedDay,next);draw(1);toast('Подмена отменена.');}catch(error){toast(error.message);}
  };

  document.addEventListener('change',event=>{
    const target=event.target;
    if(target&&target.matches('[data-ds-date]')){
      selectedDay=target.value||today();reloadSelected();
    }
  });

  // Compatibility bridge for the unchanged personnel workspace: it may still edit
  // assignment fields on the in-memory D.duty object. Only schedule fields leave
  // that legacy object; daily roster rows are never transferred.
  window.PATRUL_SYNC_DUTY_SCHEDULE = legacy => {
    if(!window.PATRUL_READY||!legacy||typeof legacy!=='object')return;
    clearTimeout(bridgeTimer);
    bridgeTimer=setTimeout(async()=>{
      for(const [date,record] of Object.entries(legacy)){
        if(!record||!Array.isArray(record.departmentAssignments)||!record.departmentAssignments.length)continue;
        const candidate={assignments:record.departmentAssignments,substitutions:Array.isArray(record.seniorSubstitutions)?record.seniorSubstitutions:[]};
        const fp=fingerprint(candidate);
        if(bridgeFingerprints.get(date)===fp)continue;
        try{
          await saveDay(date,candidate);
          if(date.slice(0,7)===viewMonth.slice(0,7))draw(1);
        }catch(error){
          console.warn('Department schedule bridge:',date,error.message);
          toast('Не удалось синхронизировать назначения на '+date+'. Обновите график.');
        }
      }
    },450);
  };

  TABS.push(['ds','График дежурств']);
  EXV.ds=render;
  function install(){
    if(!D.duty||typeof D.duty!=='object')D.duty={};
    if(!window.PATRUL_READY)return;
    loadMonth(viewMonth,true);
  }
  window.addEventListener('patrul:ready',install);
  install();
})();