(() => {
  'use strict';
  const role = window.PATRUL_ROLE;
  const api = '/api/session-data/' + encodeURIComponent(role);
  let version = 0, ready = false, busy = false, queued = false, suppressUpload = false, timer = null, retryTimer = null, retryCount = 0, unsavedChanges = false;
  let csrfToken = '', currentUser = null;
  const localDataKey = role + '_v1';
  function clearLocalData(){try{localStorage.removeItem(localDataKey);}catch(_){}}
  window.addEventListener('beforeunload',event=>{if(unsavedChanges){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&ready&&unsavedChanges)upload(localSnapshot());});
  window.addEventListener('pagehide',()=>{if(ready&&unsavedChanges)upload(localSnapshot());});
  function unlockPage(){const gate=document.getElementById('patrul-auth-gate');if(gate)gate.remove();document.body.style.visibility='';}

  const badge = document.createElement('div');
  badge.id = 'patrul-cloud-status';
  badge.className = 'patrul-menu-status';
  badge.style.cssText = 'display:flex;flex-direction:column;gap:5px;min-width:0;color:inherit';
  const statusLabel = document.createElement('span');
  statusLabel.textContent = 'Система: проверка входа';
  badge.appendChild(statusLabel);
  const menuControlsStyle = document.createElement('style');
  menuControlsStyle.textContent = `
    .patrul-menu-link{display:flex;gap:8px;align-items:center;box-sizing:border-box;text-decoration:none;cursor:pointer}
    #nv .patrul-menu-link{width:100%;border:0;background:transparent;color:#c5d1e2;font:inherit;font-weight:600;padding:10px 12px;border-radius:9px;text-align:left}
    #nv .patrul-menu-link:hover{background:rgba(255,255,255,.08)}
    #bn{overflow-x:auto;scrollbar-width:none}
    #bn button:not(.patrul-menu-link){flex:0 0 58px}
    #bn::-webkit-scrollbar{display:none}
    #bn .patrul-menu-link{flex:0 0 66px;min-width:66px;max-width:90px;justify-content:center;flex-direction:column;gap:3px;padding:7px 3px;color:var(--mu);font:600 10px/1.1 system-ui;text-align:center;white-space:normal}
    #bn .patrul-menu-link svg{width:22px;height:22px}
    .patrul-menu-link .patrul-unread{display:inline-block;min-width:16px;padding:1px 4px;border-radius:10px;background:#d64545;color:#fff;font-size:10px;line-height:16px}
    #patrul-cloud-status{margin-top:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.16);font:12px/1.35 system-ui}
    #patrul-cloud-status button{align-self:flex-start;border:0;border-radius:6px;padding:4px 8px;cursor:pointer}
    #bn #patrul-cloud-status{flex:0 0 116px;min-width:116px;max-width:140px;margin:0;padding:5px 4px;border-top:0;border-left:1px solid var(--bd);justify-content:center;gap:3px;color:var(--mu);font:9px/1.2 system-ui;text-align:center}
    #bn #patrul-cloud-status span{overflow-wrap:anywhere}
    #bn #patrul-cloud-status button{align-self:center;font-size:9px;padding:2px 5px}
    @media(max-width:760px){
      #nv .patrul-menu-link{flex-direction:column;gap:3px;justify-content:center;text-align:center;white-space:normal;flex:1 0 auto;min-width:68px;max-width:84px;width:auto;padding:8px 4px 7px;font-size:10px;line-height:1.1}
      #nv .patrul-menu-link svg{width:22px;height:22px}
      #nv #patrul-cloud-status{flex:0 0 116px;min-width:116px;max-width:140px;margin:0;padding:5px 4px;border-top:0;border-left:1px solid rgba(255,255,255,.16);justify-content:center;gap:3px;text-align:center;font:9px/1.2 system-ui}
      #nv #patrul-cloud-status button{align-self:center;font-size:9px;padding:2px 5px}
    }
    #nv #patrul-admin-users{margin-top:4px}
    @media print{#patrul-cloud-status,#patrul-mail-button,#patrul-mail-link,#patrul-admin-users{display:none!important;visibility:hidden!important}}
  `;
  document.head.appendChild(menuControlsStyle);
  function status(s,color) { statusLabel.textContent='Система: '+s; statusLabel.style.color=color||'inherit'; }
  function localSnapshot() {
    return JSON.stringify(D);
  }
  function loadCloudData(data) {
    const localExchange=D&&D.sx&&typeof D.sx.pw==='string'?D.sx.pw:'';
    const remoteExchange=data&&data.sx&&typeof data.sx.pw==='string'?data.sx.pw:'';
    D=norm(data);
    if(D.sx&&typeof D.sx==='object') delete D.sx.pw;
    const exchange=localExchange||remoteExchange;
    if(exchange){if(!D.sx||typeof D.sx!=='object')D.sx={};D.sx.pw=exchange;}
  }
  function backup(snapshot) {
    try {
      const copy=JSON.parse(snapshot);
      if(copy.sx&&typeof copy.sx==='object')delete copy.sx.pw;
      const blob=new Blob([JSON.stringify(copy)],{type:'application/json'}), url=URL.createObjectURL(blob);
      const a=document.createElement('a'), stamp=new Date().toISOString().replace(/[:.]/g,'-');
      a.href=url;a.download='patrul-'+role+'-backup-'+stamp+'.json';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);return true;
    } catch(_){return false;}
  }
  const metaKey='patrul_session_meta_'+role;
  function meta(){try{return JSON.parse(localStorage.getItem(metaKey)||'null');}catch(_){return null;}}
  async function fingerprint(snapshot){const copy=JSON.parse(snapshot);if(copy.sx&&typeof copy.sx==='object')delete copy.sx.pw;const material=JSON.stringify(copy);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(material));return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function saveMeta(snapshot){try{localStorage.setItem(metaKey,JSON.stringify({version,fingerprint:await fingerprint(snapshot)}));}catch(_){}}
  async function request(url,method='GET',body=null) {
    const headers={};
    if(body!==null) headers['Content-Type']='application/json';
    if(csrfToken) headers['X-Patrul-CSRF']=csrfToken;
    const response=await fetch(url,{method,credentials:'same-origin',headers,keepalive:method==='PUT',...(body!==null?{body:JSON.stringify(body)}:{})});
    let result={};try{result=await response.json();}catch(_){}
    return {response,result};
  }
  function panel(html) {
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:10001;background:#08101cdd;display:grid;place-items:center;padding:16px;overflow:auto;visibility:visible';
    const box=document.createElement('div');
    box.style.cssText='background:#fff;color:#18222f;padding:22px;border-radius:14px;width:min(440px,100%);max-height:90vh;overflow:auto;font:14px system-ui;box-shadow:0 16px 50px #0005';
    box.innerHTML=html;overlay.appendChild(box);document.body.appendChild(overlay);
    return {overlay,box};
  }
  function loginPanel(message) {
    return new Promise(resolve=>{
      const p=panel('<h3 style="margin:0 0 8px">Вход в систему</h3><p style="color:#536174">Введите личный логин и пароль сотрудника.</p><p data-msg style="color:#b42318"></p><form data-login><input name="username" autocomplete="username" placeholder="Логин" required style="box-sizing:border-box;width:100%;padding:11px;margin:5px 0;border:1px solid #cbd5e1;border-radius:8px"><input name="password" type="password" autocomplete="current-password" placeholder="Пароль" required style="box-sizing:border-box;width:100%;padding:11px;margin:5px 0;border:1px solid #cbd5e1;border-radius:8px"><button style="width:100%;padding:11px;margin-top:10px;background:#167d70;color:white;border:0;border-radius:8px;font-weight:600">Войти</button></form><details style="margin-top:14px"><summary>Первичная настройка владельца системы</summary><p style="color:#536174">Используйте только если учётных записей ещё нет. Секрет первичной настройки должен быть заранее задан в переменных сервера.</p><form data-bootstrap><input name="bootstrapSecret" type="password" placeholder="Секрет первичной настройки" required style="box-sizing:border-box;width:100%;padding:10px;margin:4px 0"><input name="displayName" placeholder="Ваше имя" required style="box-sizing:border-box;width:100%;padding:10px;margin:4px 0"><input name="username" placeholder="Логин (латиница)" required style="box-sizing:border-box;width:100%;padding:10px;margin:4px 0"><input name="password" type="password" minlength="12" placeholder="Пароль (не менее 12 символов)" required style="box-sizing:border-box;width:100%;padding:10px;margin:4px 0"><button style="width:100%;padding:10px;background:#344054;color:white;border:0;border-radius:8px">Создать учётную запись Старшего мастера</button></form></details>');
      const msg=p.box.querySelector('[data-msg]');if(message)msg.textContent=message;
      p.box.querySelector('[data-login]').addEventListener('submit',async e=>{
        e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));
        const btn=e.currentTarget.querySelector('button');btn.disabled=true;btn.textContent='Проверка…';
        try{const r=await request('/api/auth/login','POST',b);if(!r.response.ok){msg.textContent=r.result.error||'Не удалось войти';}
          else{csrfToken=r.result.csrfToken;currentUser=r.result.user;p.overlay.remove();resolve(currentUser);return;}}
        catch(_){msg.textContent='Нет связи с сервером';}
        btn.disabled=false;btn.textContent='Войти';
      });
      p.box.querySelector('[data-bootstrap]').addEventListener('submit',async e=>{
        e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));
        const btn=e.currentTarget.querySelector('button');btn.disabled=true;btn.textContent='Создание…';
        try{const r=await request('/api/auth/bootstrap','POST',b);if(!r.response.ok){msg.textContent=r.result.error||'Не удалось создать администратора';}
          else{csrfToken=r.result.csrfToken;currentUser=r.result.user;p.overlay.remove();resolve(currentUser);return;}}
        catch(_){msg.textContent='Нет связи с сервером';}
        btn.disabled=false;btn.textContent='Создать учётную запись Старшего мастера';
      });
    });
  }
  function forcePasswordChange() {
    return new Promise(resolve=>{
    const p=panel('<h3>Смена временного пароля</h3><p>Для продолжения задайте личный пароль длиной не менее 12 символов.</p><p data-msg style="color:#b42318"></p><form><input name="currentPassword" type="password" placeholder="Текущий временный пароль" required style="box-sizing:border-box;width:100%;padding:11px;margin:5px 0"><input name="newPassword" type="password" minlength="12" placeholder="Новый пароль (12+ символов)" required style="box-sizing:border-box;width:100%;padding:11px;margin:5px 0"><button style="width:100%;padding:11px;background:#167d70;color:white;border:0;border-radius:8px">Сохранить новый пароль</button></form>');
    p.box.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget)),btn=e.currentTarget.querySelector('button');btn.disabled=true;
      try{const r=await request('/api/auth/change-password','POST',b);if(!r.response.ok){p.box.querySelector('[data-msg]').textContent=r.result.error||'Ошибка';btn.disabled=false;}
        else{currentUser.mustChangePassword=false;p.overlay.remove();resolve(true);}}
      catch(_){p.box.querySelector('[data-msg]').textContent='Нет связи';btn.disabled=false;}
    });
    });
  }
  function scheduleRetry() {
    if (!ready || retryTimer) return;
    const delay = Math.min(30000, 1000 * (2 ** Math.min(retryCount, 5)));
    retryCount += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (ready && unsavedChanges) upload(localSnapshot());
    }, delay);
  }
  async function upload(snapshot) {
    if(!ready||busy){queued=true;return false;}busy=true;queued=false;
    let saved=false;
    try{
      const r=await request(api,'PUT',{expectedVersion:version,data:JSON.parse(snapshot)});
      if(r.response.status===409){
        ready=false;
        const preserved=backup(localSnapshot());
        status('конфликт версий — данные не перезаписаны','#9a6700');
        alert('Данные изменились на другом устройстве. Сервер не перезаписан. '+(preserved?'Сохранена резервная копия текущих изменений.':'Не удалось автоматически скачать резервную копию. Не закрывайте эту вкладку.'));
      }
      else if(r.response.status===401){ready=false;status('сеанс завершён — войдите снова','#9a6700');}
      else if(!r.response.ok){
        status((r.result.error||'ошибка сохранения')+' · повторяем отправку','#9a6700');
        if(r.response.status>=500||r.response.status===429)scheduleRetry();
      }
      else{
        version=Number(r.result.version||version);
        await saveMeta(snapshot);
        clearLocalData();
        const current=localSnapshot();
        unsavedChanges=current!==snapshot;
        retryCount=0;
        if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
        saved=true;
        status(unsavedChanges?'есть новые изменения · сохраняем':'подключено · сохранено','#176b50');
        if(unsavedChanges)queued=true;
      }
    }catch(_){
      status('нет связи · изменения сохранены в этой вкладке, повторяем отправку','#9a6700');
      scheduleRetry();
    }
    finally{
      busy=false;
      if(queued&&ready){queued=false;scheduleUpload();}
    }
    return saved;
  }
  function scheduleUpload(){if(!ready)return;unsavedChanges=true;clearTimeout(timer);timer=setTimeout(()=>upload(localSnapshot()),700);}
  save=function(){try{if(typeof exSched==='function')exSched();}catch(_){}if(ready&&!suppressUpload)scheduleUpload();if(ready&&!suppressSharedUpload)scheduleSharedUpload();};
  window.PATRUL_SAVE_NOW=async function(){
    if(!ready)return false;
    if(timer){clearTimeout(timer);timer=null;}
    for(let attempt=0;attempt<5;attempt++){
      while(busy)await new Promise(resolve=>setTimeout(resolve,80));
      if(!ready)return false;
      if(timer){clearTimeout(timer);timer=null;}
      queued=false;unsavedChanges=true;
      const saved=await upload(localSnapshot());
      if(!saved)return false;
      if(!unsavedChanges)return true;
    }
    status('сохранение не завершено — остались новые изменения','#9a6700');
    return false;
  };


  let sharedVersion=0, sharedReady=false, sharedBusy=false, sharedTimer=null, sharedPollTimer=null;
  let sharedBaseline=null, suppressSharedUpload=false;
  function copyJson(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function sharedNameKey(value){return String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\\p{L}\\p{N}]+/gu,' ').trim();}
  function sharedPayload(){return{staff:Array.isArray(D.staff)?D.staff:[],departments:Array.isArray(D.departments)?D.departments:[]};}
  function sharedPayloadJson(value){return JSON.stringify({staff:value.staff||[],departments:value.departments||[]});}
  function mergeRemappedObject(target,source){
    if(!source||typeof source!=='object')return target;
    if(!target||typeof target!=='object')return copyJson(source);
    for(const [key,value] of Object.entries(source)){
      if(target[key]===undefined){target[key]=copyJson(value);continue;}
      if(target[key]&&value&&typeof target[key]==='object'&&typeof value==='object'&&!Array.isArray(target[key])&&!Array.isArray(value))mergeRemappedObject(target[key],value);
    }
    return target;
  }
  function remapStaffReferences(value,staffAliases,departmentAliases,depth=0){
    if(!value||typeof value!=='object'||depth>32)return value;
    if(Array.isArray(value)){value.forEach(item=>remapStaffReferences(item,staffAliases,departmentAliases,depth+1));return value;}
    for(const key of Object.keys(value)){
      const child=value[key];
      if(key==='k'&&typeof child==='string'&&staffAliases[child])value[key]=staffAliases[child];
      if((key==='departmentId'||key==='deptId'||key==='department_id')&&child!=null&&departmentAliases[String(child)])value[key]=departmentAliases[String(child)];
      if(child&&typeof child==='object')remapStaffReferences(child,staffAliases,departmentAliases,depth+1);
      const mappedKey=staffAliases[key];
      if(mappedKey&&mappedKey!==key){
        if(value[mappedKey]===undefined)value[mappedKey]=value[key];
        else if(value[mappedKey]&&value[key]&&typeof value[mappedKey]==='object'&&typeof value[key]==='object'&&!Array.isArray(value[mappedKey])&&!Array.isArray(value[key]))mergeRemappedObject(value[mappedKey],value[key]);
        delete value[key];
      }
    }
    return value;
  }
  function mergeLocalRosterList(remote,local,idField,aliases){
    const result=copyJson(Array.isArray(remote)?remote:[]);
    for(const raw of Array.isArray(local)?local:[]){
      if(!raw||typeof raw!=='object')continue;
      const item=copyJson(raw),oldId=String(item[idField]||'');
      if(aliases&&aliases[oldId])item[idField]=aliases[oldId];
      const nameKey=sharedNameKey(item.name);
      let index=result.findIndex(entry=>String(entry&&entry[idField]||'')===String(item[idField]||''));
      if(index<0&&nameKey)index=result.findIndex(entry=>sharedNameKey(entry&&entry.name)===nameKey);
      if(index>=0){const canonicalId=result[index][idField];result[index]={...result[index],...item,[idField]:canonicalId};}
      else if(nameKey)result.push(item);
    }
    const seen=new Set();
    return result.filter(item=>{const key=sharedNameKey(item&&item.name);if(!key||seen.has(key))return false;seen.add(key);return true;});
  }
  function mergeSharedList(base,local,remote,idField){
    const keyOf=item=>String(item&&item[idField]||'');
    const baseMap=new Map((base||[]).map(item=>[keyOf(item),item]).filter(entry=>entry[0]));
    const localMap=new Map((local||[]).map(item=>[keyOf(item),item]).filter(entry=>entry[0]));
    const result=copyJson(remote||[]),remoteMap=new Map();
    result.forEach((item,index)=>remoteMap.set(keyOf(item),index));
    for(const [id,oldItem] of baseMap){
      const localItem=localMap.get(id);
      if(!localItem){
        const remoteIndex=remoteMap.get(id);
        if(remoteIndex!==undefined)result.splice(remoteIndex,1);
        remoteMap.clear();result.forEach((item,index)=>remoteMap.set(keyOf(item),index));
      }else if(JSON.stringify(localItem)!==JSON.stringify(oldItem)){
        const remoteIndex=remoteMap.get(id);
        if(remoteIndex===undefined){remoteMap.set(id,result.length);result.push(copyJson(localItem));}
        else result[remoteIndex]=copyJson(localItem);
      }
    }
    for(const [id,item] of localMap)if(!baseMap.has(id)&&!remoteMap.has(id)){remoteMap.set(id,result.length);result.push(copyJson(item));}
    const byName=new Map(),deduped=[];
    for(const item of result){
      const key=sharedNameKey(item&&item.name);
      if(!key){deduped.push(item);continue;}
      if(!byName.has(key)){byName.set(key,item);deduped.push(item);}
      else Object.assign(byName.get(key),item,{[idField]:byName.get(key)[idField]});
    }
    return deduped;
  }
  function applySharedRoster(response,redraw){
    const before=localSnapshot(),data=response&&response.data?response.data:{staff:[],departments:[],aliases:{},departmentAliases:{}};
    const staffAliases=data.aliases&&data.aliases[role]||{},departmentAliases=data.departmentAliases&&data.departmentAliases[role]||{};
    remapStaffReferences(D,staffAliases,departmentAliases);
    D.staff=copyJson(Array.isArray(data.staff)?data.staff:[]);
    D.departments=copyJson(Array.isArray(data.departments)?data.departments:[]);
    sharedVersion=Number(response.version||sharedVersion||1);
    sharedBaseline={staff:copyJson(D.staff),departments:copyJson(D.departments)};
    sharedReady=true;
    const changed=localSnapshot()!==before;
    if(changed&&ready)scheduleUpload();
    if(redraw&&ready){suppressUpload=true;suppressSharedUpload=true;try{if(typeof draw==='function')draw(1);}finally{suppressUpload=false;suppressSharedUpload=false;}}
    return changed;
  }
  async function initializeSharedRoster(mergeLocal){
    const localStaff=copyJson(Array.isArray(D.staff)?D.staff:[]),localDepartments=copyJson(Array.isArray(D.departments)?D.departments:[]);
    const r=await request('/api/shared-staff');
    if(!r.response.ok)throw new Error(r.result.error||'Не удалось загрузить общий список личного состава');
    const aliases=r.result.data&&r.result.data.aliases&&r.result.data.aliases[role]||{};
    const departmentAliases=r.result.data&&r.result.data.departmentAliases&&r.result.data.departmentAliases[role]||{};
    const remapped=applySharedRoster(r.result,false);
    if(mergeLocal){
      D.staff=mergeLocalRosterList(D.staff,localStaff,'k',aliases);
      D.departments=mergeLocalRosterList(D.departments,localDepartments,'id',departmentAliases);
      if(sharedPayloadJson(sharedPayload())!==sharedPayloadJson(sharedBaseline))scheduleSharedUpload();
    }
    return remapped;
  }
  async function uploadSharedRoster(){
    if(!sharedReady||!ready||sharedBusy)return false;
    if(sharedPayloadJson(sharedPayload())===sharedPayloadJson(sharedBaseline))return true;
    sharedBusy=true;
    try{
      let payload=copyJson(sharedPayload());
      for(let attempt=0;attempt<4;attempt++){
        const r=await request('/api/shared-staff','PUT',{expectedVersion:sharedVersion,data:payload});
        if(r.response.status===409&&r.result&&r.result.data){
          const remote=r.result.data,latest=copyJson(sharedPayload());
          const merged={
            staff:mergeSharedList(sharedBaseline.staff,latest.staff,remote.staff,'k'),
            departments:mergeSharedList(sharedBaseline.departments,latest.departments,remote.departments,'id')
          };
          applySharedRoster({data:remote,version:r.result.version},false);
          const aliases=remote.aliases&&remote.aliases[role]||{},departmentAliases=remote.departmentAliases&&remote.departmentAliases[role]||{};
          D.staff=mergeLocalRosterList(D.staff,merged.staff,'k',aliases);
          D.departments=mergeLocalRosterList(D.departments,merged.departments,'id',departmentAliases);
          payload=copyJson(sharedPayload());
          continue;
        }
        if(!r.response.ok)throw new Error(r.result.error||'Не удалось сохранить общий список личного состава');
        const latest=copyJson(sharedPayload()),changedDuringUpload=sharedPayloadJson(latest)!==sharedPayloadJson(payload);
        applySharedRoster(r.result,false);
        if(changedDuringUpload){
          const aliases=r.result.data&&r.result.data.aliases&&r.result.data.aliases[role]||{},departmentAliases=r.result.data&&r.result.data.departmentAliases&&r.result.data.departmentAliases[role]||{};
          D.staff=mergeLocalRosterList(D.staff,latest.staff,'k',aliases);
          D.departments=mergeLocalRosterList(D.departments,latest.departments,'id',departmentAliases);
          scheduleSharedUpload();
        }
        return true;
      }
      status('личный состав изменился параллельно · повторяем синхронизацию','#9a6700');
      scheduleSharedUpload();return false;
    }catch(error){
      status('ошибка синхронизации личного состава · повторяем отправку','#9a6700');
      clearTimeout(sharedTimer);sharedTimer=setTimeout(uploadSharedRoster,2500);return false;
    }finally{sharedBusy=false;}
  }
  function scheduleSharedUpload(){
    if(!sharedReady||!ready||suppressSharedUpload)return;
    if(sharedPayloadJson(sharedPayload())===sharedPayloadJson(sharedBaseline))return;
    clearTimeout(sharedTimer);sharedTimer=setTimeout(()=>uploadSharedRoster(),350);
  }
  async function pollSharedRoster(){
    if(!ready||!sharedReady||document.visibilityState==='hidden')return;
    try{
      const r=await request('/api/shared-staff');if(!r.response.ok)return;
      if(Number(r.result.version||0)===sharedVersion)return;
      if(sharedPayloadJson(sharedPayload())!==sharedPayloadJson(sharedBaseline))await uploadSharedRoster();
      else{
        const changed=applySharedRoster(r.result,false);
        if(changed){suppressUpload=true;suppressSharedUpload=true;try{if(typeof draw==='function')draw(1);}finally{suppressUpload=false;suppressSharedUpload=false;}scheduleUpload();}
      }
    }catch(_){}
  }
  function startSharedPolling(){if(sharedPollTimer)clearInterval(sharedPollTimer);sharedPollTimer=setInterval(pollSharedRoster,8000);}

  async function adminPanel() {
    const p=panel(`
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><h2 style="margin:0 0 5px;font-size:21px">Управление сотрудниками</h2>
        <p style="margin:0;color:#64748b;line-height:1.45">Создавайте учётные записи, назначайте роли и управляйте доступом.</p></div>
        <button type="button" data-close aria-label="Закрыть" style="border:0;background:#f1f5f9;border-radius:8px;padding:8px 11px;font-size:18px;cursor:pointer">×</button>
      </div>
      <div data-msg role="status" aria-live="polite" style="margin:12px 0"></div>
      <section style="margin:14px 0;padding:14px;border:1px solid #dbe4ea;border-radius:12px;background:#f8fafc">
        <h3 style="margin:0 0 10px;font-size:16px">Добавить сотрудника</h3>
        <form data-create style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px">
          <label style="display:grid;gap:5px;font-weight:600">ФИО сотрудника<input name="displayName" autocomplete="name" placeholder="Например, Иван Петров" required maxlength="120" style="box-sizing:border-box;width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-weight:400"></label>
          <label style="display:grid;gap:5px;font-weight:600">Логин (латиница)<input name="username" autocomplete="off" placeholder="Например, ivan.petrov" required maxlength="64" pattern="[A-Za-z0-9._-]+" style="box-sizing:border-box;width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-weight:400"></label>
          <label style="display:grid;gap:5px;font-weight:600">Роль<select name="role" style="box-sizing:border-box;width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:white;font:inherit;font-weight:400"><option value="nachalnik">Начальник патруля</option><option value="zam">Заместитель начальника патруля</option><option value="dokumentoved">Документовед</option></select></label>
          <div style="display:flex;align-items:end"><button data-create-btn style="width:100%;padding:11px;background:#167d70;color:white;border:0;border-radius:8px;font-weight:700;cursor:pointer">Создать учётную запись</button></div>
        </form>
        <p style="margin:9px 0 0;color:#64748b;font-size:12px">Временный пароль создаётся автоматически. Сотрудник сменит его при первом входе.</p>
        <div data-temp-result></div>
      </section>
      <section>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <h3 style="margin:4px 0;font-size:16px">Учётные записи</h3><span data-count style="font-size:12px;color:#64748b"></span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:9px 0">
          <input data-search type="search" placeholder="Поиск по имени или логину" aria-label="Поиск сотрудников" style="flex:1;min-width:190px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit">
          <select data-filter aria-label="Фильтр по статусу" style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:white;font:inherit"><option value="all">Все сотрудники</option><option value="active">Активные</option><option value="blocked">Заблокированные</option></select>
          <button type="button" data-refresh style="padding:9px 12px;border:1px solid #cbd5e1;background:white;border-radius:8px;cursor:pointer">Обновить</button>
        </div>
        <div data-users aria-live="polite" style="display:grid;gap:9px">Загрузка списка…</div>
      </section>
      <details style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px"><summary style="cursor:pointer;font-weight:600">Журнал действий администратора</summary><button type="button" data-audit style="margin:10px 0;padding:8px 11px;border:1px solid #cbd5e1;background:white;border-radius:8px;cursor:pointer">Загрузить последние действия</button><div data-audit-list></div></details>
    `);
    p.box.style.width='min(760px,100%)';
    p.box.style.maxHeight='92vh';
    p.box.style.padding='20px';
    const msg=p.box.querySelector('[data-msg]'),list=p.box.querySelector('[data-users]');
    const roleNames={nachalnik:'Начальник патруля',zam:'Заместитель начальника патруля',dokumentoved:'Документовед',uchet:'Старший мастер'};
    let users=[];
    function notice(text,type='info'){
      msg.textContent=text;msg.style.cssText='margin:12px 0;padding:10px 12px;border-radius:8px;line-height:1.4;background:'+(type==='error'?'#fef2f2':type==='success'?'#ecfdf5':'#eff6ff')+';color:'+(type==='error'?'#991b1b':type==='success'?'#065f46':'#1e40af');
    }
    async function copyValue(value,button){
      try{await navigator.clipboard.writeText(value);button.textContent='Скопировано';}
      catch(_){const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();let ok=false;try{ok=document.execCommand('copy')}catch(__){}field.remove();button.textContent=ok?'Скопировано':'Скопируйте пароль вручную';}
      setTimeout(()=>{if(button.isConnected)button.textContent='Копировать пароль';},1800);
    }
    function showTemporaryPassword(password,heading){
      const target=p.box.querySelector('[data-temp-result]');target.replaceChildren();
      const wrap=document.createElement('div');wrap.style.cssText='margin-top:12px;padding:12px;border:1px solid #86efac;background:#f0fdf4;border-radius:9px';
      const title=document.createElement('strong');title.textContent=heading;wrap.appendChild(title);
      const note=document.createElement('p');note.textContent='Сохраните пароль сейчас: повторно посмотреть его будет нельзя. Передайте сотруднику лично или по защищённому каналу. При первом входе пароль потребуется сменить.';note.style.cssText='font-size:12px;line-height:1.4;color:#166534;margin:6px 0';wrap.appendChild(note);
      const line=document.createElement('div');line.style.cssText='display:flex;gap:7px;flex-wrap:wrap';
      const field=document.createElement('input');field.readOnly=true;field.value=password;field.autocomplete='off';field.style.cssText='flex:1;min-width:180px;padding:10px;border:1px solid #86efac;border-radius:7px;font:14px ui-monospace,monospace';
      const copy=document.createElement('button');copy.type='button';copy.textContent='Копировать пароль';copy.style.cssText='padding:9px 12px;border:0;border-radius:7px;background:#166534;color:white;cursor:pointer';copy.addEventListener('click',()=>copyValue(password,copy));
      line.append(field,copy);wrap.appendChild(line);target.appendChild(wrap);
    }
    function renderUsers(){
      const q=p.box.querySelector('[data-search]').value.trim().toLowerCase(),filter=p.box.querySelector('[data-filter]').value;
      const visible=users.filter(u=>(filter==='all'||(filter==='active'?u.active:!u.active))&&(!q||(u.displayName+' '+u.username).toLowerCase().includes(q)));
      p.box.querySelector('[data-count]').textContent='Всего: '+users.length+' · активно: '+users.filter(u=>u.active).length+' · заблокировано: '+users.filter(u=>!u.active).length;
      list.replaceChildren();
      if(!visible.length){const empty=document.createElement('p');empty.textContent=users.length?'По заданным условиям сотрудники не найдены.':'Учётных записей пока нет.';empty.style.cssText='padding:16px;text-align:center;color:#64748b;background:#f8fafc;border-radius:9px';list.appendChild(empty);return;}
      visible.forEach(u=>{
        const card=document.createElement('article');card.style.cssText='padding:13px;border:1px solid #e2e8f0;border-radius:11px;background:white';
        const top=document.createElement('div');top.style.cssText='display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap';
        const identity=document.createElement('div');const name=document.createElement('strong');name.textContent=u.displayName;name.style.cssText='display:block;font-size:15px';const login=document.createElement('span');login.textContent='@'+u.username;login.style.cssText='display:block;margin-top:3px;color:#64748b;font-size:13px';identity.append(name,login);
        const status=document.createElement('span');status.textContent=u.active?'Активен':'Заблокирован';status.style.cssText='padding:4px 8px;border-radius:20px;font-size:12px;font-weight:600;background:'+(u.active?'#dcfce7':'#fee2e2')+';color:'+(u.active?'#166534':'#991b1b');
        top.append(identity,status);card.appendChild(top);
        const meta=document.createElement('p');meta.textContent=(roleNames[u.role]||u.role)+(u.systemAdmin?' · владелец системы':'');meta.style.cssText='margin:9px 0;color:#475569;font-size:13px';card.appendChild(meta);
        if(!u.systemAdmin){
          const actions=document.createElement('div');actions.style.cssText='display:flex;gap:7px;flex-wrap:wrap;align-items:center';
          const role=document.createElement('select');role.setAttribute('aria-label','Роль сотрудника '+u.displayName);['nachalnik','zam','dokumentoved'].forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=roleNames[v];o.selected=v===u.role;role.appendChild(o);});role.style.cssText='flex:1;min-width:170px;padding:8px;border:1px solid #cbd5e1;border-radius:7px;background:white';
          const save=document.createElement('button');save.type='button';save.textContent='Сохранить роль';save.style.cssText='padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;cursor:pointer';
          save.addEventListener('click',async()=>{save.disabled=true;const x=await request('/api/admin/users/'+u.id,'PATCH',{role:role.value,active:u.active,displayName:u.displayName});save.disabled=false;if(!x.response.ok)notice(x.result.error||'Не удалось изменить роль','error');else{notice('Роль сотрудника обновлена.','success');await refresh();}});
          const toggle=document.createElement('button');toggle.type='button';toggle.textContent=u.active?'Заблокировать':'Разблокировать';toggle.style.cssText='padding:8px 10px;border:0;border-radius:7px;background:'+(u.active?'#fff1f2':'#ecfdf5')+';color:'+(u.active?'#9f1239':'#166534')+';cursor:pointer';
          toggle.addEventListener('click',async()=>{if(!confirm((u.active?'Заблокировать':'Разблокировать')+' учётную запись '+u.displayName+'?'))return;toggle.disabled=true;const x=await request('/api/admin/users/'+u.id,'PATCH',{role:u.role,active:!u.active,displayName:u.displayName});if(!x.response.ok){toggle.disabled=false;notice(x.result.error||'Не удалось изменить доступ','error');}else{notice(u.active?'Учётная запись заблокирована.':'Доступ восстановлен.','success');await refresh();}});
          const reset=document.createElement('button');reset.type='button';reset.textContent='Сбросить пароль';reset.style.cssText='padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;background:white;cursor:pointer';
          reset.addEventListener('click',async()=>{if(!confirm('Сбросить пароль для '+u.displayName+'? Сотруднику потребуется новый временный пароль.'))return;reset.disabled=true;const x=await request('/api/admin/users/'+u.id+'/reset-password','POST',{});reset.disabled=false;if(!x.response.ok)notice(x.result.error||'Не удалось сбросить пароль','error');else{notice('Временный пароль создан.','success');showTemporaryPassword(x.result.temporaryPassword,'Новый временный пароль для '+u.displayName);}});
          actions.append(role,save,toggle,reset);card.appendChild(actions);
        }
        list.appendChild(card);
      });
    }
    async function refresh(){
      list.textContent='Загружаем список сотрудников…';
      const r=await request('/api/admin/users');
      if(!r.response.ok){list.textContent=r.result.error||'Не удалось загрузить сотрудников';notice('Не удалось обновить список сотрудников.','error');return;}
      users=r.result.users||[];renderUsers();
    }
    p.box.querySelector('[data-search]').addEventListener('input',renderUsers);
    p.box.querySelector('[data-filter]').addEventListener('change',renderUsers);
    p.box.querySelector('[data-refresh]').addEventListener('click',refresh);
    p.box.querySelector('[data-create]').addEventListener('submit',async e=>{
      e.preventDefault();const form=e.currentTarget,btn=form.querySelector('[data-create-btn]'),data=Object.fromEntries(new FormData(form));btn.disabled=true;btn.textContent='Создаём…';
      const r=await request('/api/admin/users','POST',data);
      btn.disabled=false;btn.textContent='Создать учётную запись';
      if(!r.response.ok){notice(r.result.error||'Не удалось создать сотрудника','error');return;}
      notice('Учётная запись создана.','success');showTemporaryPassword(r.result.temporaryPassword,'Временный пароль для '+data.displayName);form.reset();await refresh();
    });
    p.box.querySelector('[data-audit]').addEventListener('click',async()=>{
      const target=p.box.querySelector('[data-audit-list]');target.textContent='Загружаем журнал…';
      const r=await request('/api/admin/audit?limit=50');
      if(!r.response.ok){target.textContent=r.result.error||'Не удалось загрузить журнал';return;}
      target.replaceChildren();
      if(!r.result.events.length){target.textContent='Записей пока нет.';return;}
      r.result.events.forEach(ev=>{const item=document.createElement('p');item.style.cssText='border-top:1px solid #e5e7eb;padding:8px 0;margin:0;font-size:12px;line-height:1.4';item.textContent=new Date(ev.created_at).toLocaleString()+' · '+ev.event_type+' · '+(ev.actor_name||ev.actor_username||'система')+(ev.target_name?' → '+ev.target_name:'');target.appendChild(item);});
    });
    p.box.querySelector('[data-close]').addEventListener('click',()=>p.overlay.remove());
    await refresh();
  }
  function addControls() {
    const menu = document.querySelector(role==='zam'?'#bn':'#nv');
    const mail=document.createElement('a');
    mail.id='patrul-mail-button';
    mail.className='patrul-menu-link';
    mail.href='/mail.html';
    mail.setAttribute('aria-label','Открыть внутреннюю почту');
    mail.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>Почта</span>';
    const unread=document.createElement('span');
    unread.className='patrul-unread';
    unread.hidden=true;
    mail.appendChild(unread);
    async function refreshMailCount(){try{const r=await request('/api/mail/unread');if(r.response.ok&&r.result.count>0){unread.hidden=false;unread.textContent=String(r.result.count>99?'99+':r.result.count)}else unread.hidden=true}catch(_){}}
    refreshMailCount();
    setInterval(()=>{if(!document.hidden)refreshMailCount()},30000);

    const row=document.createElement('div');
    row.style.cssText='display:flex;gap:6px;align-items:center;margin-top:2px;flex-wrap:wrap';
    const flush=document.createElement('button');
    flush.type='button';
    flush.textContent='Сохранить сейчас';
    flush.title='Немедленно отправить последние изменения на сервер';
    flush.addEventListener('click',async()=>{flush.disabled=true;flush.textContent='Сохраняем…';if(!ready){status('подождите загрузки данных','#9a6700');}else if(!unsavedChanges){status('подключено · сохранено','#176b50');}else{await upload(localSnapshot());}flush.disabled=false;flush.textContent='Сохранить сейчас';});
    row.appendChild(flush);
    const out=document.createElement('button');
    out.type='button';
    out.textContent='Выйти';
    out.addEventListener('click',async()=>{await request('/api/auth/logout','POST',{});location.reload();});
    row.appendChild(out);
    badge.appendChild(row);

    let adminButton=null;
    if(currentUser&&currentUser.systemAdmin&&currentUser.role==='uchet'){
      adminButton=document.createElement('button');
      adminButton.type='button';
      adminButton.id='patrul-admin-users';
      adminButton.className='n patrul-menu-link';
      adminButton.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M19 8v6M16 11h6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>Управление сотрудниками</span>';
      adminButton.addEventListener('click',adminPanel);
    }

    function mountMenuControls(){
      const target=document.querySelector(role==='zam'?'#bn':'#nv');
      if(!target)return;
      if(!mail.isConnected||mail.parentElement!==target)target.appendChild(mail);
      if(adminButton&&(!adminButton.isConnected||adminButton.parentElement!==target))target.appendChild(adminButton);
      if(!badge.isConnected||badge.parentElement!==target)target.appendChild(badge);
    }
    mountMenuControls();
    const menuObserver=new MutationObserver(mountMenuControls);
    if(menu)menuObserver.observe(menu,{childList:true});

    function addDocumentShareButton(){
      const paper=document.querySelector('.paper');
      if(!paper||!paper.isConnected)return;
      let bar=paper.previousElementSibling;
      while(bar&&!bar.classList.contains('bar'))bar=bar.previousElementSibling;
      if(!bar||bar.querySelector('[data-mail-document-share]'))return;
      const share=document.createElement('button');share.type='button';share.dataset.mailDocumentShare='1';share.className='btn';share.textContent='Отправить по почте';share.title='Прикрепить текущий документ к новому письму';
      share.addEventListener('click',async()=>{
        try{
          const title=paper.querySelector('h2')?.textContent?.trim()||document.querySelector('[data-chg="doc"] option:checked')?.textContent||'Рабочий документ';
          const styles=Array.from(document.querySelectorAll('style')).map(x=>x.textContent).join(String.fromCharCode(10));
          const html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title.replace(/[<>&"]/g,' ')+'</title><style>'+styles+'body{background:#fff!important;color:#000!important}.paper{margin:0 auto!important;box-shadow:none!important}</style></head><body>'+paper.outerHTML+'</body></html>';
          const blob=new Blob([html],{type:'text/html;charset=utf-8'});
          if(blob.size>3*1024*1024)throw new Error('Документ слишком большой для прямой передачи. Сохраните его как PDF и прикрепите к письму вручную.');
          const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
          for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
          const safe=String(title).split('/').join(' ').split(String.fromCharCode(92)).join(' ').trim().slice(0,70)||'document';
          sessionStorage.setItem('patrul_mail_document_draft',JSON.stringify({name:safe+'.html',size:bytes.length,data:btoa(binary)}));
          location.href='/mail.html?compose=1&document=1';
        }catch(err){alert(err.message||'Не удалось подготовить документ к отправке');}
      });
      bar.appendChild(share);
    }
    addDocumentShareButton();
    const documentObserver=new MutationObserver(()=>addDocumentShareButton());
    documentObserver.observe(document.getElementById('m')||document.body,{childList:true,subtree:true});
  }
  async function start() {
    status('проверка входа');
    try{
      let auth=await request('/api/auth/me');
      if(!auth.response.ok){currentUser=await loginPanel();}else{currentUser=auth.result.user;csrfToken=auth.result.csrfToken;}
      if(!currentUser)return;
      if(currentUser.role!==role){status('нет доступа к выбранной роли','#9a6700');const denied=panel('<h3>Нет доступа к разделу</h3><p>Ваша персональная учётная запись не назначена для этой роли. Обратитесь к Старшему мастеру.</p><button type="button" data-retry style="width:100%;padding:11px">Вернуться к выбору роли</button>');denied.box.querySelector('[data-retry]').addEventListener('click',()=>location.href='/');return;}
      if(currentUser.mustChangePassword)await forcePasswordChange();
      addControls();
      const fetched=await request(api);
      if(!fetched.response.ok)throw new Error(fetched.result.error||'Ошибка загрузки данных');
      const data=fetched.result;version=Number(data.version||0);
      let cachedRaw=null;try{cachedRaw=localStorage.getItem(localDataKey);}catch(_){}
      const hadLocalData=typeof cachedRaw==='string'&&cachedRaw.length>0;
      if(hadLocalData){
        try{const cached=JSON.parse(cachedRaw);if(!cached||typeof cached!=='object'||Array.isArray(cached))throw new Error('Некорректный формат');D=norm(cached);}
        catch(_){throw new Error('Старый локальный кэш не удалось безопасно прочитать; он не удалён.');}
      }
      const local=localSnapshot(),previous=meta(),localFingerprint=await fingerprint(local);
      if(data.data===null){
        await initializeSharedRoster(!!hadLocalData);
        ready=true;
        if(sharedPayloadJson(sharedPayload())!==sharedPayloadJson(sharedBaseline)&&!(await uploadSharedRoster()))throw new Error('Не удалось синхронизировать общий список личного состава; раздел оставлен закрытым.');
        if(!(await upload(localSnapshot())))throw new Error('Не удалось сохранить начальные данные на сервере; раздел оставлен закрытым.');
        draw();window.PATRUL_USER=currentUser;window.PATRUL_READY=true;window.dispatchEvent(new Event('patrul:ready'));unlockPage();startSharedPolling();return;
      }
      const remote=norm(data.data);
      const remoteSnapshot=JSON.stringify(remote);
      const localChanged=hadLocalData&&!!previous&&previous.fingerprint!==localFingerprint;
      const serverChanged=hadLocalData&&!!previous&&Number(previous.version)!==version;
      const firstConflict=hadLocalData&&!previous&&local!==remoteSnapshot;
      if(firstConflict||(localChanged&&serverChanged)){
        const useCloud=window.confirm('На этом устройстве и в облаке разные данные.\n\nОК — скачать НЕЗАШИФРОВАННУЮ копию локальных данных и загрузить облачную версию.\\nОтмена — оставить раздел закрытым; локальные данные не удаляются.');
        if(!useCloud){status('версии различаются — раздел закрыт до разрешения конфликта','#9a6700');throw new Error('Локальная и серверная версии различаются. Раздел оставлен закрытым, локальный кэш сохранён. Повторите вход и выберите серверную версию после сохранения локальной копии.');}
        if(!backup(local))throw new Error('Не удалось создать локальную резервную копию; данные не изменены.');
      }else if(localChanged&&!serverChanged){
        await initializeSharedRoster(true);
        ready=true;
        if(sharedPayloadJson(sharedPayload())!==sharedPayloadJson(sharedBaseline)&&!(await uploadSharedRoster()))throw new Error('Не удалось синхронизировать общий список личного состава; раздел оставлен закрытым.');
        if(!(await upload(localSnapshot())))throw new Error('Не удалось синхронизировать локальные изменения; раздел оставлен закрытым.');
        draw();window.PATRUL_USER=currentUser;window.PATRUL_READY=true;window.dispatchEvent(new Event('patrul:ready'));unlockPage();startSharedPolling();return;
      }
      loadCloudData(data.data);
      await initializeSharedRoster(false);
      const mergedSnapshot=localSnapshot(),needsUpload=mergedSnapshot!==remoteSnapshot;
      await saveMeta(mergedSnapshot);clearLocalData();ready=true;suppressUpload=true;try{draw();}finally{suppressUpload=false;}
      status('подключено · данные загружены','#176b50');window.PATRUL_USER=currentUser;window.PATRUL_READY=true;window.dispatchEvent(new Event('patrul:ready'));unlockPage();if(needsUpload)scheduleUpload();startSharedPolling();
    }catch(e){status('ошибка подключения; доступ закрыт','#9a6700');console.error('Patrul session sync:',e);const locked=panel('<h3>Нет подтверждённого доступа</h3><p>Не удалось проверить личную учётную запись и загрузить данные с сервера. Локальные сведения скрыты. Проверьте соединение и попробуйте ещё раз.</p><button type="button" data-retry style="width:100%;padding:11px;background:#167d70;color:white;border:0;border-radius:8px">Повторить проверку</button>');locked.box.querySelector('[data-retry]').addEventListener('click',()=>location.reload());}
  }
  start();
})();