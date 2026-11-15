(() => {
'use strict';
const root=document.getElementById('app');let csrf='',workspace=null,activeTab='overview';
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const dateText=v=>{const p=String(v||'').slice(0,10).split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'—');};
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const OFFLINE_DB='patrul-senior-secure-v1',OFFLINE_MARKER='patrul-senior-offline-auth',OFFLINE_SESSION_MS=8*60*60*1000;
let offlineMode=false,pendingOfflineCount=0,flushingOffline=false,offlineWarning='';
function openOfflineDb(){
return new Promise((resolve,reject)=>{
if(!window.indexedDB){reject(new Error('IndexedDB недоступен'));return;}
const request=indexedDB.open(OFFLINE_DB,1);
request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('keys'))db.createObjectStore('keys');if(!db.objectStoreNames.contains('cache'))db.createObjectStore('cache',{keyPath:'id'});if(!db.objectStoreNames.contains('queue'))db.createObjectStore('queue',{keyPath:'id'});};
request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Не удалось открыть локальное хранилище'));
});
}
async function offlineStore(storeName,mode,operation){
const db=await openOfflineDb();
return new Promise((resolve,reject)=>{
const tx=db.transaction(storeName,mode),store=tx.objectStore(storeName);let value;
try{value=operation(store);}catch(error){db.close();reject(error);return;}
tx.oncomplete=()=>{db.close();resolve(value&&value.result!==undefined?value.result:value);};
tx.onerror=()=>{const error=tx.error;db.close();reject(error||new Error('Ошибка локального хранилища'));};
tx.onabort=()=>{const error=tx.error;db.close();reject(error||new Error('Операция локального хранилища отменена'));};
});
}
async function offlineKey(){
if(!window.crypto||!crypto.subtle)throw new Error('Шифрование браузера недоступно');
let key=await offlineStore('keys','readonly',store=>store.get('aes-gcm'));
if(key)return key;
key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
await offlineStore('keys','readwrite',store=>store.put(key,'aes-gcm'));
return key;
}
async function saveOfflineEncrypted(storeName,id,userId,value){
const key=await offlineKey(),iv=crypto.getRandomValues(new Uint8Array(12));
const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));
const record={id,userId,iv:Array.from(iv),ciphertext:Array.from(new Uint8Array(encrypted)),createdAt:Date.now()};await offlineStore(storeName,'readwrite',store=>storeName==='keys'?store.put(value,id):store.put(record));
}
async function readOfflineEncrypted(storeName,id){
const record=await offlineStore(storeName,'readonly',store=>store.get(id));
if(!record)return null;
const key=await offlineKey(),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(record.iv)},key,new Uint8Array(record.ciphertext));
return JSON.parse(new TextDecoder().decode(plain));
}
async function removeOfflineRecord(storeName,id){await offlineStore(storeName,'readwrite',store=>store.delete(id));}
async function listOfflineRecords(storeName,userId){
const rows=await offlineStore(storeName,'readonly',store=>store.getAll());
return (rows||[]).filter(row=>row.userId===userId).sort((a,b)=>a.createdAt-b.createdAt);
}
async function rememberWorkspace(){
try{
const userId=workspace&&workspace.user&&String(workspace.user.id||'');
if(!userId)return false;
await saveOfflineEncrypted('cache','workspace:'+userId,userId,workspace);
sessionStorage.setItem(OFFLINE_MARKER,JSON.stringify({userId,savedAt:Date.now()}));
return true;
}catch(_){return false;}
}
async function restoreOfflineWorkspace(){
try{
const marker=JSON.parse(sessionStorage.getItem(OFFLINE_MARKER)||'null');
if(!marker||!marker.userId||!Number.isFinite(marker.savedAt)||Date.now()-marker.savedAt>OFFLINE_SESSION_MS||marker.savedAt>Date.now()+60000)return false;
const cached=await readOfflineEncrypted('cache','workspace:'+marker.userId);
if(!cached||!cached.user||String(cached.user.id)!==String(marker.userId)||cached.user.role!=='starshiy_patrulya')return false;
workspace=cached;csrf='';offlineMode=true;offlineWarning='Нет связи. Записи будут зашифрованы на этом устройстве и отправлены после восстановления подключения.';
pendingOfflineCount=(await listOfflineRecords('queue',marker.userId)).length;
render();return true;
}catch(_){return false;}
}
function newClientEntryId(){
if(crypto&&crypto.randomUUID)return crypto.randomUUID();
const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
async function queueOfflineEntry(payload){
const userId=workspace&&workspace.user&&String(workspace.user.id||'');
if(!userId||!sessionStorage.getItem(OFFLINE_MARKER))throw new Error('Нет подтверждённой онлайн-сессии для офлайн-очереди');
if(!window.indexedDB||!crypto||!crypto.subtle)throw new Error('Браузер не поддерживает защищённую офлайн-очередь');
const clientEntryId=payload.clientEntryId||newClientEntryId(),queued={...payload,clientEntryId};
await saveOfflineEncrypted('queue',clientEntryId,userId,queued);
const pending={entry_type:queued.type,staff_key:queued.staffKey||null,status:queued.status||null,title:queued.title||null,body:queued.body||null,created_at:new Date().toISOString(),pending:true,client_entry_id:clientEntryId};
workspace.entries=Array.isArray(workspace.entries)?workspace.entries:[];
workspace.entries.unshift(pending);pendingOfflineCount=(await listOfflineRecords('queue',userId)).length;
offlineMode=true;offlineWarning='Нет связи. Запись сохранена в зашифрованной очереди этого устройства.';
await rememberWorkspace();render();
}
async function flushOfflineQueue(){
if(flushingOffline||!workspace||!navigator.onLine)return;
const userId=workspace.user&&String(workspace.user.id||'');if(!userId)return;
flushingOffline=true;
try{
const auth=await request('/api/auth/me');
if(!auth.response.ok||!auth.result.user||auth.result.user.role!=='starshiy_patrulya'||String(auth.result.user.id)!==userId){
offlineMode=true;offlineWarning='Не удалось подтвердить прежнюю учётную запись. Офлайн-записи сохранены на этом устройстве.';return;
}
csrf=auth.result.csrfToken||'';
const queued=await listOfflineRecords('queue',userId);
for(const record of queued){
const payload=await readOfflineEncrypted('queue',record.id);
const result=await request('/api/patrol-senior/entries','POST',payload);
if(result.response.ok){await removeOfflineRecord('queue',record.id);continue;}
if(result.response.status===401||result.response.status===403){csrf='';offlineMode=true;offlineWarning='Сессия истекла или доступ изменён. Очередь сохранена; войдите снова под своей учётной записью.';break;}
offlineWarning=result.result.error||'Не удалось отправить одну из офлайн-записей. Она оставлена в очереди.';
break;
}
pendingOfflineCount=(await listOfflineRecords('queue',userId)).length;
if(!pendingOfflineCount){
offlineMode=false;offlineWarning='';
const date=workspace.date;
await loadWorkspace(date,{skipQueue:true});
}else{offlineMode=true;render();}
}catch(_){offlineMode=true;offlineWarning='Связь прервалась. Неотправленные записи остались в зашифрованной очереди.';pendingOfflineCount=(await listOfflineRecords('queue',userId).catch(()=>[])).length;render();}
finally{flushingOffline=false;}
}
async function request(url,method='GET',body=null){const headers={};if(body!==null)headers['Content-Type']='application/json';if(csrf)headers['X-Patrul-CSRF']=csrf;const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers,...(body!==null?{body:JSON.stringify(body)}:{})});let result={};try{result=await response.json();}catch(_){}return{response,result};}
function authScreen(text){root.innerHTML='<div class="auth-wrap"><section class="auth"><div class="eyebrow">Патрульная служба</div><h1>Старший патруля</h1><p>Вход по фамилии и личному PIN-коду. Для первого входа получите одноразовый код у начальника, заместителя, документоведа или мастера.</p><div data-message role="alert">'+esc(text||'')+'</div><form data-login><label>Фамилия<input name="surname" required maxlength="80" autocomplete="family-name"></label><label>PIN-код<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><button class="btn primary" type="submit">Войти</button></form><hr class="divider"><form data-enroll><strong>Первый вход</strong><label>Фамилия<input name="surname" required maxlength="80"></label><label>Одноразовый код активации<input name="activationCode" inputmode="numeric" pattern="[0-9]{8}" minlength="8" maxlength="8" autocomplete="one-time-code" required></label><label>Создайте PIN-код<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><label>Повторите PIN-код<input name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><button class="btn" type="submit">Создать PIN и войти</button></form></section></div>';
root.querySelector('[data-login]').addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget)),btn=e.currentTarget.querySelector('button');btn.disabled=true;try{const r=await request('/api/patrol-senior/login','POST',b);if(!r.response.ok)authMessage(r.result.error||'Не удалось войти');else{csrf=r.result.csrfToken;await loadWorkspace();}}catch(_){authMessage('Нет соединения с сервером');}finally{btn.disabled=false;}});
root.querySelector('[data-enroll]').addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));if(b.pin!==b.confirmPin){authMessage('PIN-коды не совпадают');return;}const btn=e.currentTarget.querySelector('button');btn.disabled=true;try{const r=await request('/api/patrol-senior/enroll','POST',{surname:b.surname,activationCode:b.activationCode,pin:b.pin});if(!r.response.ok)authMessage(r.result.error||'Не удалось создать PIN');else{csrf=r.result.csrfToken;await loadWorkspace();}}catch(_){authMessage('Нет соединения с сервером');}finally{btn.disabled=false;}});
}
function authMessage(t){const el=root.querySelector('[data-message]');if(el)el.textContent=t||'';}
function entriesOf(type){return(workspace.entries||[]).filter(x=>x.entry_type===type);}
function stat(label,value,icon){return '<div class="card span-4 metric-card"><div><div class="metric">'+esc(value)+'</div><div class="metric-label">'+esc(label)+'</div></div><div class="metric-icon">'+icon+'</div></div>';}
function teamMarkup(){
if(!workspace.roster.length)return '<div class="empty">В отделении пока нет записей личного состава.</div>';
const latest=new Map();for(const x of workspace.entries||[])if(x.entry_type==='attendance'&&x.staff_key&&!latest.has(x.staff_key))latest.set(x.staff_key,x.status);
return '<div class="list">'+workspace.roster.map(person=>'<div class="person"><div class="person-main"><strong>'+esc(person.name)+'</strong><span class="muted">'+esc(person.position||'Патрульный')+(person.phone?' · '+esc(person.phone):'')+'</span></div><div class="inline"><span class="pill">'+esc(person.status||'Статус не указан')+'</span><select data-status="'+esc(person.key)+'" aria-label="Явка '+esc(person.name)+'"><option value="present" '+(latest.get(person.key)==='present'?'selected':'')+'>Явился</option><option value="late" '+(latest.get(person.key)==='late'?'selected':'')+'>Опоздал</option><option value="absent" '+(latest.get(person.key)==='absent'?'selected':'')+'>Не явился</option><option value="excused" '+(latest.get(person.key)==='excused'?'selected':'')+'>Уважительная причина</option></select><button class="btn" data-attendance data-key="'+esc(person.key)+'">Сохранить</button></div></div>').join('')+'</div>';
}
function equipmentMarkup(){
if(!workspace.equipment.length)return '<div class="empty">Для назначенного поста нет настроенного комплекта. Обратитесь к мастеру или начальнику.</div>';
const latest=entriesOf('equipment');const labels={received:'получено',missing:'недостача',faulty:'неисправно',returned:'возвращено'};
return '<div class="list">'+workspace.equipment.map(item=>{const status=latest.find(x=>x.title===item.name)?.status;return '<div class="equipment"><div class="eq-main"><strong>'+esc(item.name)+'</strong><span class="muted">'+esc(item.qty)+' '+esc(item.unit||'шт.')+(status?' · '+esc(labels[status]||status):'')+'</span></div><div class="inline"><button class="btn" data-equipment-status="received" data-name="'+esc(item.name)+'">Получено</button><button class="btn danger" data-equipment-status="missing" data-name="'+esc(item.name)+'">Недостача</button><button class="btn" data-equipment-status="faulty" data-name="'+esc(item.name)+'">Неисправно</button><button class="btn" data-equipment-status="returned" data-name="'+esc(item.name)+'">Возврат</button></div></div>';}).join('')+'</div>';
}
function logMarkup(){
const entries=workspace.entries||[];if(!entries.length)return '<div class="empty">Записей за эту дату пока нет.</div>';
const labels={attendance:'Явка',report:'Доклад',equipment:'Оборудование',shift_start:'Заступление',shift_end:'Сдача смены',task_update:'Задача'};
return '<div class="list">'+entries.slice(0,30).map(x=>'<div class="entry"><div><strong>'+esc(x.title||labels[x.entry_type]||x.entry_type)+'</strong><div class="muted">'+esc(labels[x.entry_type]||x.entry_type)+' · '+esc(x.status||'')+(x.pending?' · ожидает синхронизации':'')+'</div>'+(x.body?'<div class="muted">'+esc(x.body)+'</div>':'')+'</div><span class="muted">'+esc(new Date(x.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))+'</span></div>').join('')+'</div>';
}
async function loadSeniorTasks(){
const host=root.querySelector('[data-tasks-list]');if(!host)return;
host.innerHTML='<div class="empty">Загружаем назначенные поручения…</div>';
try{
const r=await request('/api/tasks');
if(!r.response.ok){host.innerHTML='<div class="empty">'+esc(r.result.error||'Не удалось загрузить поручения')+'</div>';return;}
const tasks=Array.isArray(r.result.tasks)?r.result.tasks:[];
const taskTab=root.querySelector('[data-tab="tasks"]');
const unreadCount=Number(r.result.unreadNotifications||0);
if(taskTab)taskTab.textContent=unreadCount?'Поручения · '+unreadCount:'Поручения';
const notifications=Array.isArray(r.result.notifications)?r.result.notifications:[];
const notificationLabels={assigned:'Новое поручение',status_changed:'Изменён статус',due_today:'Срок сегодня',due_soon:'Срок завтра',overdue:'Просрочено'};
const notificationMarkup=notifications.length?'<div class="card span-12"><h3>Уведомления</h3>'+notifications.slice(0,6).map(item=>'<div class="entry"><div><strong>'+esc(item.title||notificationLabels[item.type]||item.type)+'</strong><div class="muted">'+esc(item.body||'')+'</div></div><span class="muted">'+(item.isRead?'Прочитано':'Новое')+'</span></div>').join('')+'</div>':'';
const terminal=['Выполнено','Отменено'];
host.innerHTML=notificationMarkup+'<div class="notice">Новых уведомлений: <b>'+Number(r.result.unreadNotifications||0)+'</b></div>'+
'<div class="inline" style="margin:10px 0"><button class="btn" data-task-read>Отметить уведомления прочитанными</button><button class="btn" data-task-refresh>Обновить</button></div>'+
(tasks.length?'<div class="list">'+tasks.map(task=>{
const due=task.dueDate?dateText(task.dueDate):'Без срока';
const taskActions=task.isAssignee&&!terminal.includes(task.status)?(task.status==='Новая'||task.status==='На доработку'?'<button class="btn" data-task-status="В работе" data-task-id="'+esc(task.id)+'">В работу</button>':task.status==='В работе'?'<button class="btn" data-task-status="На проверке" data-task-id="'+esc(task.id)+'">На проверку</button>':''):'';
const actions=(taskActions?'<div class="inline" style="margin-top:8px">'+taskActions+'</div>':'')+'<div class="inline" style="margin-top:8px"><button class="btn" data-task-history="'+esc(task.id)+'">История</button></div><div data-task-history-content="'+esc(task.id)+'" hidden></div>';
return '<article class="equipment" style="display:block;margin:9px 0"><div class="section-head"><strong>'+esc(task.title)+'</strong><span class="pill">'+esc(task.status)+'</span></div><p class="muted">'+esc(task.description||'Без дополнительного описания')+'</p><p class="muted">Постановщик: '+esc(task.creatorName)+' · Срок: '+esc(due)+' · Приоритет: '+esc(task.priority)+'</p>'+actions+'</article>';
}).join('')+'</div>':'<div class="empty">Назначенных поручений пока нет.</div>');
root.querySelectorAll('[data-task-status]').forEach(button=>button.addEventListener('click',async()=>{
button.disabled=true;
const result=await request('/api/tasks/'+encodeURIComponent(button.dataset.taskId),'PATCH',{status:button.dataset.taskStatus});
if(!result.response.ok){alert(result.result.error||'Не удалось изменить статус');button.disabled=false;return;}
loadSeniorTasks();
}));
root.querySelectorAll('[data-task-history]').forEach(button=>button.addEventListener('click',async()=>{
const id=button.dataset.taskHistory,host=root.querySelector('[data-task-history-content="'+CSS.escape(id)+'"]');
if(!host)return;
if(!host.hidden){host.hidden=true;button.textContent='История';return;}
host.hidden=false;host.innerHTML='<p class="muted">Загружаем историю…</p>';button.textContent='Скрыть историю';
const result=await request('/api/tasks/'+encodeURIComponent(id)+'/events');
if(!result.response.ok){host.textContent=result.result.error||'История недоступна';return;}
const labels={created:'Поручение создано',status_changed:'Изменён статус'};
const rows=(result.result.events||[]).map(event=>{
const details=event.details||{},date=event.createdAt?new Date(event.createdAt).toLocaleString('ru-RU'):'';
const detail=event.type==='created'?'Назначено исполнителю · '+(details.priority||'Обычный'):'Статус: '+(details.from||'—')+' → '+(details.to||'—');
return '<div class="equipment" style="display:block;margin:5px 0"><b>'+esc(labels[event.type]||event.type)+'</b><p class="muted">'+esc(date)+' · '+esc(event.actorName||'Система')+' · '+esc(detail)+'</p></div>';
}).join('');
host.innerHTML=rows||'<p class="muted">Событий пока нет.</p>';
}));
root.querySelector('[data-task-refresh]')?.addEventListener('click',loadSeniorTasks);
root.querySelector('[data-task-read]')?.addEventListener('click',async()=>{
const result=await request('/api/tasks/notifications/read','POST',{});
if(!result.response.ok){alert(result.result.error||'Не удалось отметить уведомления');return;}
loadSeniorTasks();
});
}catch(_){host.innerHTML='<div class="empty">Нет соединения с сервером поручений.</div>';}
}
function render(){
if(!workspace){authScreen();return;}
const latestAttendance=new Map();for(const entry of entriesOf('attendance'))if(entry.staff_key&&!latestAttendance.has(entry.staff_key))latestAttendance.set(entry.staff_key,entry.status);const present=[...latestAttendance.values()].filter(status=>status==='present'||status==='late').length,start=entriesOf('shift_start').length>0,end=entriesOf('shift_end').length>0;
root.innerHTML='<div class="shell"><header class="top"><div><div class="eyebrow">Патрульная служба · Рабочее место</div><h1>Старший патруля</h1><p>'+esc(workspace.senior.name)+' · '+esc(workspace.department.name)+' · '+esc(dateText(workspace.date))+'</p></div><div class="top-actions"><label style="min-width:150px;color:#eaf2f7">Дата службы<input type="date" data-date value="'+esc(workspace.date)+'" style="margin-top:4px"></label><a class="btn dark" href="/mail.html" style="text-decoration:none">Служебная почта</a><button class="btn dark" data-action="refresh">Обновить</button><button class="btn dark" data-action="change-pin">Сменить PIN</button><button class="btn dark" data-action="logout">Выйти</button></div></header>'+((offlineMode||pendingOfflineCount)?'<div class="notice warn" role="status">'+esc(offlineWarning||('Ожидает отправки записей: '+pendingOfflineCount))+' · Вход офлайн доступен только в этой ранее авторизованной вкладке</div>':'')+
'<nav class="tabs"><button data-tab="overview" class="'+(activeTab==='overview'?'active':'')+'">Обзор</button><button data-tab="team" class="'+(activeTab==='team'?'active':'')+'">Личный состав</button><button data-tab="equipment" class="'+(activeTab==='equipment'?'active':'')+'">Оборудование</button><button data-tab="reports" class="'+(activeTab==='reports'?'active':'')+'">Доклады и журнал</button><button data-tab="tasks" class="'+(activeTab==='tasks'?'active':'')+'">Поручения</button></nav>'+
'<section class="panel '+(activeTab==='overview'?'active':'')+'" data-panel="overview"><div class="grid">'+stat('Сотрудников в отделении',workspace.roster.length,'♙')+stat('Отмечено прибывшими',present,'✓')+stat('Назначенный пост',workspace.post||'Не назначен','⌖')+
'<div class="card span-8"><div class="section-head"><div><h2>Несение службы</h2><p class="sub">Смена фиксируется в журнале отделения.</p></div><span class="pill '+(end?'ok':start?'warn':'')+'">'+(end?'Смена завершена':start?'Смена началась':'Ожидает заступления')+'</span></div><div class="notice '+(workspace.post?'':'warn')+'">'+(workspace.postConflict?'В наряде сотрудники отделения указаны сразу на нескольких постах. Уточните распределение у руководства.':workspace.post?'На выбранную дату отделению назначен пост «'+esc(workspace.post)+'».':'В наряде начальника на выбранную дату пост отделения пока не указан. Уточните назначение у руководства.')+'</div><div class="inline" style="margin-top:13px"><button class="btn primary" data-action="shift-start" '+(start?'disabled':'')+'>Заступил на службу</button><button class="btn" data-action="shift-end" '+(!start||end?'disabled':'')+'>Сдать смену и передать дела</button></div></div>'+
'<div class="card span-4"><h2>Комплект поста</h2><p class="sub">'+(workspace.post?'Стандартный комплект назначенного поста':'Нет назначенного поста')+'</p>'+(workspace.equipment.length?'<div class="list">'+workspace.equipment.map(x=>'<div class="equipment"><div class="eq-main"><strong>'+esc(x.name)+'</strong><span class="muted">'+esc(x.qty)+' '+esc(x.unit||'шт.')+'</span></div></div>').join('')+'</div>':'<div class="empty">Список оборудования пока недоступен.</div>')+'</div>'+
'<div class="card span-12"><div class="section-head"><div><h2>Состав смены</h2><p class="sub">Сотрудники только вашего отделения.</p></div><button class="btn" data-tab="team">Отметить явку</button></div>'+teamMarkup()+'</div></div></section>'+
'<section class="panel '+(activeTab==='team'?'active':'')+'" data-panel="team"><div class="grid"><div class="card span-12"><h2>Личный состав отделения</h2><p class="sub">Отмечайте явку патрульных. Изменять сам список сотрудников здесь нельзя.</p>'+teamMarkup()+'</div></div></section>'+
'<section class="panel '+(activeTab==='equipment'?'active':'')+'" data-panel="equipment"><div class="grid"><div class="card span-12"><h2>Оборудование и снаряжение</h2><p class="sub">Комплект подставляется по посту из наряда начальника. Отметка не списывает имущество со склада.</p>'+equipmentMarkup()+'</div></div></section>'+
'<section class="panel '+(activeTab==='reports'?'active':'')+'" data-panel="reports"><div class="grid"><div class="card span-6"><h2>Доклад руководству</h2><p class="sub">Сообщение передаётся в служебный журнал.</p><form data-report class="form-grid"><label>Тема доклада<input name="title" maxlength="160" required placeholder="Например, итоги смены"></label><label>Тип доклада<select name="kind"><option value="Итоги смены">Итоги смены</option><option value="Происшествие">Происшествие</option><option value="Замечание">Замечание</option><option value="Недостача">Недостача</option><option value="Другое">Другое</option></select></label><label class="full">Текст<textarea name="body" maxlength="4000" required placeholder="Опишите ситуацию, принятые меры и результат"></textarea></label><div class="full"><button class="btn primary" type="submit">Отправить доклад</button></div></form></div><div class="card span-6"><h2>Журнал смены</h2><p class="sub">Отметки явки, оборудования и доклады за '+esc(dateText(workspace.date))+'.</p>'+logMarkup()+'</div></div></section>'+
'<section class="panel '+(activeTab==='tasks'?'active':'')+'" data-panel="tasks"><div class="grid"><div class="card span-12"><h2>Поручения руководства</h2><p class="sub">Задачи, назначенные вам руководителями. Изменение статуса автоматически уведомляет постановщика.</p><div data-tasks-list><div class="empty">Откройте раздел, чтобы загрузить поручения.</div></div></div></div></section>'+
'<div class="footer">Полномочия ограничены вашим отделением. Настройки системы, общий личный состав, расписание постов и склад недоступны.</div></div>';
root.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{activeTab=btn.dataset.tab;render();}));
if(activeTab==='tasks')loadSeniorTasks();
root.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>action(btn.dataset.action)));
const dateInput=root.querySelector('[data-date]');if(dateInput)dateInput.addEventListener('change',()=>loadWorkspace(dateInput.value));
root.querySelectorAll('[data-attendance]').forEach(btn=>btn.addEventListener('click',()=>saveEntry({type:'attendance',date:workspace.date,staffKey:btn.dataset.key,status:root.querySelector('[data-status="'+CSS.escape(btn.dataset.key)+'"]').value,title:'Отметка явки'})));
root.querySelectorAll('[data-equipment-status]').forEach(btn=>btn.addEventListener('click',()=>saveEntry({type:'equipment',date:workspace.date,status:btn.dataset.equipmentStatus,title:btn.dataset.name,body:btn.dataset.name})));
const report=root.querySelector('[data-report]');if(report)report.addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(report));await saveEntry({type:'report',date:workspace.date,title:b.kind+': '+b.title,body:b.body});});
}
async function saveEntry(payload){
const entry={...payload,clientEntryId:payload.clientEntryId||newClientEntryId()};
if(offlineMode||!navigator.onLine){try{await queueOfflineEntry(entry);}catch(error){alert(error.message||'Не удалось сохранить офлайн-запись');}return;}
try{
const r=await request('/api/patrol-senior/entries','POST',entry);
if(r.response.ok){await loadWorkspace(workspace.date);return;}
if(r.response.status>=500){try{await queueOfflineEntry(entry);}catch(error){alert(error.message||'Не удалось сохранить запись');}return;}
alert(r.result.error||'Не удалось сохранить запись');
}catch(_){try{await queueOfflineEntry(entry);}catch(error){alert(error.message||'Нет связи. Запись не сохранена.');}}
}
function openPinDialog(){
const dialog=document.createElement('dialog');dialog.style.cssText='border:0;border-radius:14px;padding:22px;width:min(420px,calc(100% - 28px));box-shadow:0 20px 60px #102a4350';
dialog.innerHTML='<form data-pin-form><h2 style="margin:0 0 6px">Смена PIN-кода</h2><p class="muted">Введите текущий PIN и задайте новый из 6 цифр.</p><label>Текущий PIN<input name="currentPin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><label style="margin-top:10px">Новый PIN<input name="newPin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><label style="margin-top:10px">Повторите новый PIN<input name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><div class="inline" style="margin-top:15px"><button class="btn primary" type="submit">Сохранить</button><button class="btn" type="button" data-cancel>Отмена</button></div><p data-error class="muted" role="alert"></p></form>';
document.body.appendChild(dialog);dialog.showModal();
dialog.querySelector('[data-cancel]').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>dialog.remove());
dialog.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const error=dialog.querySelector('[data-error]');if(b.newPin!==b.confirmPin){error.textContent='Новые PIN-коды не совпадают';return;}const button=e.currentTarget.querySelector('[type=submit]');button.disabled=true;try{const r=await request('/api/patrol-senior/change-pin','POST',{currentPin:b.currentPin,newPin:b.newPin});if(!r.response.ok){error.textContent=r.result.error||'Не удалось изменить PIN';button.disabled=false;return;}dialog.close();alert('PIN-код успешно изменён.');}catch(_){error.textContent='Нет соединения с сервером';button.disabled=false;}});
}
async function action(name){if(name==='refresh'){await loadWorkspace(workspace.date);return;}if(name==='change-pin'){openPinDialog();return;}if(name==='logout'){try{await request('/api/auth/logout','POST',{});}catch(_){}csrf='';workspace=null;offlineMode=false;pendingOfflineCount=0;offlineWarning='';sessionStorage.removeItem(OFFLINE_MARKER);activeTab='overview';authScreen('Вы вышли из системы');return;}if(name==='shift-start'){await saveEntry({type:'shift_start',date:workspace.date,title:'Заступление на службу',body:'Старший патруля отметил начало смены'});return;}if(name==='shift-end'){const recipient=prompt('Кому передаёте смену?','');if(recipient===null)return;const issues=prompt('Незакрытые вопросы и задачи (если нет — оставьте пустым):','');if(issues===null)return;const equipment=prompt('Состояние имущества и комплекта поста:','Без замечаний');if(equipment===null)return;const body=['Принимает смену: '+(recipient.trim()||'не указано'),'Незакрытые вопросы: '+(issues.trim()||'нет'),'Состояние имущества: '+(equipment.trim()||'не указано')].join('\n');await saveEntry({type:'shift_end',date:workspace.date,title:'Передача смены',body});}}
async function loadWorkspace(date=today(),options={}){
let r;
try{r=await request('/api/patrol-senior/workspace?date='+encodeURIComponent(date));}
catch(_){if(await restoreOfflineWorkspace())return false;authScreen('Нет соединения. Офлайн-доступ возможен только после входа в этой вкладке и только в течение 8 часов.');return false;}
if(!r.response.ok){if(r.response.status===401){csrf='';workspace=null;sessionStorage.removeItem(OFFLINE_MARKER);authScreen(r.result.error||'Войдите в систему');return false;}authScreen(r.result.error||'Нет доступа к кабинету');return false;}
workspace=r.result;offlineMode=false;offlineWarning='';await rememberWorkspace();const userId=workspace.user&&String(workspace.user.id||'');pendingOfflineCount=userId?(await listOfflineRecords('queue',userId)).length:0;
render();if(activeTab!=='tasks')loadSeniorTasks();
if(!options.skipQueue&&pendingOfflineCount)await flushOfflineQueue();
return true;
}
async function init(){
try{
const r=await request('/api/auth/me');
if(r.response.ok){
if(r.result.user.role==='starshiy_patrulya'){csrf=r.result.csrfToken;await loadWorkspace();return;}
root.innerHTML='<div class="auth-wrap"><section class="auth"><h1>Нет доступа</h1><p>Эта страница предназначена только для роли «Старший патруля».</p><a href="/">Вернуться к выбору раздела</a></section></div>';return;
}
if(r.response.status===401){sessionStorage.removeItem(OFFLINE_MARKER);authScreen();return;}
authScreen(r.result.error||'Нет доступа к кабинету');return;
}catch(_){}
if(!(await restoreOfflineWorkspace()))authScreen('Нет связи. Вход офлайн не предусмотрен: сначала войдите в систему при подключении к интернету.');
}
window.addEventListener('offline',()=>{if(workspace){offlineMode=true;offlineWarning='Нет связи. Новые отметки будут поставлены в зашифрованную очередь.';render();}});
window.addEventListener('online',()=>{if(workspace)flushOfflineQueue();else init();});
init();
})();
