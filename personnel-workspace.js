(() => {
'use strict';
const role=window.PATRUL_ROLE||'',canManage=role==='nachalnik'||role==='zam';
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const POS=['Начальник патруля','Заместитель начальника патруля','Старший мастер патруля','Документовед патруля','Старший патруля','Патрульный'];
let state={staff:[],departments:[]},version=1,activeTab='office',activeDept='',busy=false,knownSnapshot='';
function pageStyle(){
 if($('#pw-style'))return;
 const st=document.createElement('style');st.id='pw-style';
 st.textContent='.pw-wrap{max-width:1320px;margin:0 auto}.pw-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px;flex-wrap:wrap}.pw-head h1{margin:0 0 4px}.pw-sub{color:var(--mu);margin:0}.pw-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 18px}.pw-tab{border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:9px;padding:9px 15px;font:inherit;font-weight:650;cursor:pointer}.pw-tab.on{background:var(--ac);border-color:var(--ac);color:#fff}.pw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}.pw-card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:16px;min-width:0}.pw-card h3{margin:0 0 8px}.pw-stat{display:flex;gap:8px;flex-wrap:wrap;color:var(--mu);font-size:12px}.pw-line{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--bd)}.pw-main{min-width:0;flex:1}.pw-name{font-weight:700}.pw-muted{font-size:12px;color:var(--mu)}.pw-pill{display:inline-flex;border-radius:20px;padding:3px 9px;background:var(--acs);color:var(--ac);font-size:12px;font-weight:650}.pw-pill.off{background:var(--hv);color:var(--mu)}.pw-actions{display:flex;gap:6px;flex-wrap:wrap}.pw-empty{padding:28px;text-align:center;color:var(--mu)}.pw-modal{position:fixed;inset:0;z-index:10020;background:#08101ccc;display:grid;place-items:center;padding:14px;overflow:auto}.pw-dialog{background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:14px;padding:20px;width:min(560px,100%);max-height:94vh;overflow:auto;box-shadow:0 20px 60px #0005}.pw-dialog h2{margin:0 0 14px}.pw-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pw-fields label{display:block;font-size:12px;color:var(--mu);font-weight:650;margin:0 0 4px}.pw-fields input,.pw-fields select{width:100%;min-width:0}.pw-wide{grid-column:1/-1}.pw-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}.pw-note{padding:10px 12px;border-radius:9px;background:var(--hv);color:var(--mu);margin:10px 0}.pw-nav-active{background:var(--ac)!important;color:#fff!important}@media(max-width:640px){.pw-fields{grid-template-columns:1fr}.pw-wide{grid-column:auto}.pw-line{align-items:flex-start;flex-wrap:wrap}.pw-line .pw-actions{width:100%}}';
 if(!canManage)st.textContent+='#m [data-act="stnew"],#m [data-act="stedit"]{display:none!important}';
 document.head.appendChild(st);
}
function applyBridge(redraw){const b=window.PATRUL_PERSONNEL_BRIDGE;if(b)b.setStaff(state.staff,state.departments,!!redraw);}
async function apiGet(){
 if(typeof window.PATRUL_SHARED_REQUEST!=='function')throw new Error('Защищённая сессия ещё не готова');
 const r=await window.PATRUL_SHARED_REQUEST()('/api/shared-personnel');
 if(!r.response.ok)throw new Error(r.result.error||'Не удалось загрузить общий список');
 state=r.result.data||{staff:[],departments:[]};version=Number(r.result.version||1);knownSnapshot=JSON.stringify(state);applyBridge(true);
}
async function apiSave(next){
 if(!canManage||busy)return false;busy=true;
 try{
  const r=await window.PATRUL_SHARED_REQUEST()('/api/shared-personnel','PUT',{expectedVersion:version,data:next});
  if(r.response.status===409){await apiGet();render();alert(r.result.error||'Список изменился в другом окне. Загружена актуальная версия.');return false;}
  if(!r.response.ok)throw new Error(r.result.error||'Не удалось сохранить изменения');
  state=r.result.data;version=Number(r.result.version);knownSnapshot=JSON.stringify(state);applyBridge(false);render();return true;
 }catch(e){alert(e.message||'Ошибка сохранения');return false;}finally{busy=false;}
}
function currentLocal(){const b=window.PATRUL_PERSONNEL_BRIDGE;return b?{staff:b.getStaff(),departments:state.departments}:null;}
async function syncLegacy(){
 if(!canManage||busy)return;const local=currentLocal();if(!local)return;
 const snap=JSON.stringify(local);if(snap!==knownSnapshot)await apiSave(local);
}
function addNav(){
 const target=$(role==='zam'?'#bn':'#nv');if(!target||$('#pw-nav'))return;
 const btn=document.createElement('button');btn.id='pw-nav';btn.type='button';btn.className='n';
 btn.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M17 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9"/></svg><span>Личный состав</span>';
 btn.addEventListener('click',()=>{activeTab='office';render();});target.appendChild(btn);
}
function shell(){return '<div class="pw-wrap"><header class="pw-head"><div><h1>Личный состав</h1><p class="pw-sub">Единый актуальный список сотрудников и распределение по девяти отделениям</p></div><div class="pw-actions">'+(canManage?'<button class="btn" data-pw="new">Добавить сотрудника</button>':'<span class="pw-pill off">Просмотр</span>')+'</div></header><div class="pw-tabs"><button class="pw-tab '+(activeTab==='office'?'on':'')+'" data-pw="tab" data-v="office">Нач. состав</button><button class="pw-tab '+(activeTab==='departments'?'on':'')+'" data-pw="tab" data-v="departments">Отделения</button></div><div id="pw-content"></div></div>';}
function staffLine(p){
 const dept=state.departments.find(d=>d.id===p.departmentId);
 return '<div class="pw-line"><div class="pw-main"><div class="pw-name">'+esc(p.name)+'</div><div class="pw-muted">'+esc(p.pos||'Должность не указана')+(p.grp?' · '+esc(p.grp):'')+(dept?' · '+esc(dept.name):'')+(p.tel?' · '+esc(p.tel):'')+'</div></div><span class="pw-pill '+(p.st==='в строю'?'':'off')+'">'+esc(p.st||'Статус не указан')+'</span>'+(canManage?'<div class="pw-actions"><button class="btn s g" data-pw="edit" data-k="'+esc(p.k)+'">Изменить</button></div>':'')+'</div>';
}
function officeView(){
 const a=state.staff.filter(p=>!p.departmentId||!['Старший патруля','Патрульный'].includes(p.pos));
 return '<div class="pw-card"><div class="pw-head"><div><h3>Начальствующий и руководящий состав</h3><div class="pw-stat">'+a.length+' сотрудников</div></div></div>'+(a.length?a.map(staffLine).join(''):'<div class="pw-empty">Сотрудники пока не добавлены</div>')+'</div>';
}
function deptView(){
 if(!state.departments.length)return '<div class="pw-empty">Отделения пока не загружены</div>';
 if(!state.departments.some(d=>d.id===activeDept))activeDept=state.departments[0].id;
 const d=state.departments.find(x=>x.id===activeDept);
 const tabs='<div class="pw-grid">'+state.departments.map(x=>{
  const members=state.staff.filter(p=>p.departmentId===x.id),senior=members.some(p=>p.pos==='Старший патруля'&&p.st==='в строю');
  return '<button class="pw-card" style="text-align:left;cursor:pointer;color:var(--tx);border-color:'+(x.id===activeDept?'var(--ac)':'var(--bd)')+'" data-pw="department" data-k="'+esc(x.id)+'"><h3>'+esc(x.name)+'</h3><div class="pw-stat">'+members.length+' в составе · '+(senior?'старший назначен':'старший не назначен')+'</div></button>';
 }).join('')+'</div>';
 if(!d)return tabs;
 const members=state.staff.filter(p=>p.departmentId===d.id),seniors=members.filter(p=>p.pos==='Старший патруля'),patrol=members.filter(p=>p.pos==='Патрульный'),others=members.filter(p=>!['Старший патруля','Патрульный'].includes(p.pos));
 return tabs+'<div class="pw-card" style="margin-top:14px"><div class="pw-head"><div><h3>'+esc(d.name)+'</h3><div class="pw-stat">Старший патруля: '+seniors.length+' · Патрульные: '+patrol.length+'</div></div>'+(canManage?'<button class="btn s g" data-pw="rename-dept" data-k="'+esc(d.id)+'">Переименовать</button>':'')+'</div><h3 style="font-size:14px">Старший патруля</h3>'+(seniors.length?seniors.map(staffLine).join(''):'<div class="pw-note">Старший патруля не назначен</div>')+'<h3 style="font-size:14px;margin-top:18px">Патрульные</h3>'+(patrol.length?patrol.map(staffLine).join(''):'<div class="pw-empty">В отделении пока нет патрульных</div>')+(others.length?'<h3 style="font-size:14px;margin-top:18px">Другие сотрудники</h3>'+others.map(staffLine).join(''):'')+(canManage?'<div class="pw-foot"><button class="btn" data-pw="new" data-dept="'+esc(d.id)+'">Добавить в отделение</button></div>':'')+'</div>';
}
function render(){
 const main=$('#m');if(!main)return;pageStyle();const b=$('#pw-nav');if(b)b.classList.add('pw-nav-active');
 main.innerHTML=shell();const c=$('#pw-content');if(c)c.innerHTML=activeTab==='office'?officeView():deptView();
}
function closeModal(){const m=$('#pw-modal');if(m)m.remove();}
function form(p){
 const editing=!!(p&&p.k),dept=p?.departmentId||'',pos=p?.pos||'Патрульный';
 const options=state.departments.map(d=>'<option value="'+esc(d.id)+'" '+(d.id===dept?'selected':'')+'>'+esc(d.name)+'</option>').join('');
 const roleOptions=POS.map(x=>'<option '+(x===pos?'selected':'')+'>'+esc(x)+'</option>').join('');
 const m=document.createElement('div');m.id='pw-modal';m.className='pw-modal';
 m.innerHTML='<div class="pw-dialog"><h2>'+(editing?'Карточка сотрудника':'Новый сотрудник')+'</h2><div class="pw-fields"><div class="pw-wide"><label>ФИО</label><input id="pw-name" maxlength="160" value="'+esc(p?.name||'')+'" required></div><div><label>Должность</label><select id="pw-pos">'+roleOptions+'</select></div><div><label>Отделение</label><select id="pw-dept"><option value="">Нач. состав / не распределён</option>'+options+'</select></div><div><label>Группа</label><input id="pw-grp" maxlength="100" value="'+esc(p?.grp||'')+'"></div><div><label>Телефон</label><input id="pw-tel" maxlength="60" value="'+esc(p?.tel||'')+'"></div><div><label>Статус</label><select id="pw-status">'+['в строю','отстранён','не в составе'].map(x=>'<option '+(x===(p?.st||'в строю')?'selected':'')+'>'+x+'</option>').join('')+'</select></div></div><div class="pw-note">В каждом отделении допускается один действующий старший патруля. Старший и патрульные входят в состав отделения.</div><div class="pw-foot"><button class="btn g" data-pw="cancel">Отмена</button><button class="btn" data-pw="save-staff" data-k="'+esc(p?.k||'')+'">Сохранить</button></div></div>';
 document.body.appendChild(m);
}
function renameDept(id){
 const d=state.departments.find(x=>x.id===id);if(!d)return;
 const name=prompt('Название отделения',d.name);if(name==null)return;
 const value=name.trim();if(!value)return alert('Название не может быть пустым');
 const next=JSON.parse(JSON.stringify(state));next.departments.find(x=>x.id===id).name=value;apiSave(next);
}
function eventAction(ev){
 const t=ev.target.closest('[data-pw]');if(!t)return;
 const a=t.dataset.pw;ev.preventDefault();
 if(a==='tab'){activeTab=t.dataset.v;render();}
 else if(a==='department'){activeDept=t.dataset.k;render();}
 else if(a==='new'){form({departmentId:t.dataset.dept||'',pos:'Патрульный',st:'в строю'});}
 else if(a==='edit'){const p=state.staff.find(x=>x.k===t.dataset.k);if(p)form(p);}
 else if(a==='cancel')closeModal();
 else if(a==='rename-dept')renameDept(t.dataset.k);
 else if(a==='save-staff'){
  const name=$('#pw-name').value.trim(),pos=$('#pw-pos').value,departmentId=$('#pw-dept').value||null;
  if(!name)return alert('Укажите ФИО сотрудника');
  if(['Старший патруля','Патрульный'].includes(pos)&&!departmentId)return alert('Для старшего патруля и патрульного выберите отделение');
  const next=JSON.parse(JSON.stringify(state)),key=t.dataset.k;let p=key?next.staff.find(x=>x.k===key):null;
  if(!p){p={k:'staff-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),st:'в строю'};next.staff.push(p);}
  Object.assign(p,{name,pos,departmentId,grp:$('#pw-grp').value.trim(),tel:$('#pw-tel').value.trim(),st:$('#pw-status').value});
  if(pos==='Старший патруля'&&p.st==='в строю'&&departmentId&&next.staff.some(x=>x.k!==p.k&&x.departmentId===departmentId&&x.pos==='Старший патруля'&&x.st==='в строю'))return alert('В этом отделении уже назначен действующий старший патруля');
  closeModal();apiSave(next);
 }
}
function init(){
 pageStyle();addNav();const target=$(role==='zam'?'#bn':'#nv');
 if(target)new MutationObserver(addNav).observe(target,{childList:true});
 const main=$('#m');
 document.addEventListener('click',eventAction);
 if(main){
  const obs=new MutationObserver(()=>{if(!canManage||busy)return;const local=currentLocal();if(!local)return;const snap=JSON.stringify(local);if(snap!==knownSnapshot){clearTimeout(init.timer);init.timer=setTimeout(syncLegacy,250);}});
  obs.observe(main,{childList:true,subtree:true});
 }
 apiGet().catch(e=>{const c=$('#pw-content');if(c)c.innerHTML='<div class="pw-card pw-empty">'+esc(e.message)+'</div>';});
}
window.addEventListener('patrul:ready',init,{once:true});
if(window.PATRUL_READY)init();
})();