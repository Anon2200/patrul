(() => {
  'use strict';
  const role = window.PATRUL_ROLE;
  const api = '/api/session-data/' + encodeURIComponent(role);
  let version = 0, ready = false, busy = false, queued = false, suppressUpload = false, timer = null, unsavedChanges = false;
  let csrfToken = '', currentUser = null;
  const localDataKey = role + '_v1';
  function clearLocalData(){try{localStorage.removeItem(localDataKey);}catch(_){}}
  window.addEventListener('beforeunload',event=>{if(unsavedChanges){event.preventDefault();event.returnValue='';}});
  function unlockPage(){const gate=document.getElementById('patrul-auth-gate');if(gate)gate.remove();document.body.style.visibility='';}

  const badge = document.createElement('div');
  badge.id = 'patrul-cloud-status';
  badge.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:10000;padding:7px 11px;border-radius:9px;background:#16304f;color:#fff;font:12px/1.4 system-ui;box-shadow:0 2px 12px #0003;max-width:300px';
  document.body.appendChild(badge);
  function status(s,color) { badge.textContent='Система: '+s; badge.style.background=color||'#16304f'; }
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
  async function fingerprint(snapshot){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot));return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function saveMeta(snapshot){try{localStorage.setItem(metaKey,JSON.stringify({version,fingerprint:await fingerprint(snapshot)}));}catch(_){}}
  async function request(url,method='GET',body=null) {
    const headers={};
    if(body!==null) headers['Content-Type']='application/json';
    if(csrfToken) headers['X-Patrul-CSRF']=csrfToken;
    const response=await fetch(url,{method,credentials:'same-origin',headers,...(body!==null?{body:JSON.stringify(body)}:{})});
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
  async function upload(snapshot) {
    if(!ready||busy){queued=true;return false;}busy=true;queued=false;
    let saved=false;
    try{
      const r=await request(api,'PUT',{expectedVersion:version,data:JSON.parse(snapshot)});
      if(r.response.status===409){ready=false;status('конфликт версий — ничего не перезаписано','#9a6700');alert('Данные изменились на другом устройстве. Ничего не перезаписано. Обновите страницу и повторите проверку.');}
      else if(r.response.status===401){ready=false;status('сеанс завершён — войдите снова','#9a6700');}
      else if(!r.response.ok){status(r.result.error||'ошибка сохранения','#9a6700');}
      else{version=Number(r.result.version||version);await saveMeta(snapshot);clearLocalData();unsavedChanges=false;saved=true;status('подключено · сохранено','#176b50');}
    }catch(_){status('нет связи; изменения пока не сохранены на сервере','#9a6700');}
    finally{busy=false;if(queued&&ready){queued=false;scheduleUpload();}}
    return saved;
  }
  function scheduleUpload(){if(!ready)return;unsavedChanges=true;clearTimeout(timer);timer=setTimeout(()=>upload(localSnapshot()),700);}
  save=function(){try{if(typeof exSched==='function')exSched();}catch(_){}if(ready&&!suppressUpload)scheduleUpload();};

  async function adminPanel() {
    const p=panel('<h3 style="margin-top:0">Управление сотрудниками</h3><p data-msg style="color:#b42318"></p><form data-create><input name="displayName" placeholder="ФИО сотрудника" required style="box-sizing:border-box;width:100%;padding:9px;margin:4px 0"><input name="username" placeholder="Логин (латиница)" required style="box-sizing:border-box;width:100%;padding:9px;margin:4px 0"><select name="role" style="width:100%;padding:9px;margin:4px 0"><option value="nachalnik">Начальник</option><option value="zam">Заместитель</option><option value="uchet">Старший мастер</option><option value="dokumentoved">Документовед</option></select><button style="padding:10px;background:#167d70;color:white;border:0;border-radius:8px">Создать сотрудника</button></form><hr><div data-users>Загрузка…</div><button type="button" data-audit style="margin-top:10px;padding:9px">Журнал действий</button><div data-audit-list></div><button type="button" data-close style="margin-top:14px;padding:9px">Закрыть</button>');
    const msg=p.box.querySelector('[data-msg]'), list=p.box.querySelector('[data-users]');
    async function refresh(){
      const r=await request('/api/admin/users');if(!r.response.ok){msg.textContent=r.result.error||'Не удалось загрузить сотрудников';return;}
      list.replaceChildren();
      r.result.users.forEach(u=>{
        const card=document.createElement('section');card.style.cssText='border-top:1px solid #e5e7eb;padding:12px 0';
        const title=document.createElement('strong');title.textContent=u.displayName+' · '+u.username;card.appendChild(title);
        const info=document.createElement('p');info.textContent=u.role+' · '+(u.active?'активен':'заблокирован')+(u.systemAdmin?' · администратор':'');card.appendChild(info);
        const roleSelect=document.createElement('select');['nachalnik','zam','uchet','dokumentoved'].forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;o.selected=v===u.role;roleSelect.appendChild(o);});card.appendChild(roleSelect);
        const toggle=document.createElement('button');toggle.textContent=u.active?'Заблокировать':'Восстановить';toggle.style.margin='5px';toggle.addEventListener('click',async()=>{const x=await request('/api/admin/users/'+u.id,'PATCH',{role:roleSelect.value,active:!u.active,displayName:u.displayName});if(!x.response.ok)msg.textContent=x.result.error;else refresh();});card.appendChild(toggle);
        const change=document.createElement('button');change.textContent='Сохранить роль';change.addEventListener('click',async()=>{const x=await request('/api/admin/users/'+u.id,'PATCH',{role:roleSelect.value,active:u.active,displayName:u.displayName});if(!x.response.ok)msg.textContent=x.result.error;else refresh();});card.appendChild(change);
        const reset=document.createElement('button');reset.textContent='Сбросить пароль';reset.style.margin='5px';reset.addEventListener('click',async()=>{const x=await request('/api/admin/users/'+u.id+'/reset-password','POST',{});if(!x.response.ok)msg.textContent=x.result.error;else{const note=document.createElement('p');note.textContent='Временный пароль (покажется только сейчас): '+x.result.temporaryPassword;card.appendChild(note);}});card.appendChild(reset);
        list.appendChild(card);
      });
    }
    p.box.querySelector('[data-create]').addEventListener('submit',async e=>{
      e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget)),btn=e.currentTarget.querySelector('button');btn.disabled=true;
      const r=await request('/api/admin/users','POST',b);btn.disabled=false;
      if(!r.response.ok)msg.textContent=r.result.error||'Не удалось создать сотрудника';
      else{msg.textContent='Сотрудник создан. Передайте временный пароль лично: '+r.result.temporaryPassword+' . Он будет показан только сейчас.';e.currentTarget.reset();refresh();}
    });
    p.box.querySelector('[data-audit]').addEventListener('click',async()=>{
      const target=p.box.querySelector('[data-audit-list]');target.textContent='Загрузка журнала…';
      const r=await request('/api/admin/audit?limit=50');
      if(!r.response.ok){target.textContent=r.result.error||'Не удалось загрузить журнал';return;}
      target.replaceChildren();
      r.result.events.forEach(ev=>{
        const item=document.createElement('p');item.style.cssText='border-top:1px solid #e5e7eb;padding:7px 0;margin:0;font-size:12px';
        const date=new Date(ev.created_at).toLocaleString();
        item.textContent=date+' · '+ev.event_type+' · '+(ev.actor_name||ev.actor_username||'система')+(ev.target_name?' → '+ev.target_name:'');
        target.appendChild(item);
      });
    });
    p.box.querySelector('[data-close]').addEventListener('click',()=>p.overlay.remove());
    await refresh();
  }
  function addControls() {
    const row=document.createElement('div');row.style.cssText='display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap';
    if(currentUser&&currentUser.systemAdmin){const a=document.createElement('button');a.textContent='Сотрудники';a.style.cssText='border:0;border-radius:5px;padding:4px 7px';a.addEventListener('click',adminPanel);row.appendChild(a);}
    const out=document.createElement('button');out.textContent='Выйти';out.style.cssText='border:0;border-radius:5px;padding:4px 7px';out.addEventListener('click',async()=>{await request('/api/auth/logout','POST',{});location.reload();});row.appendChild(out);
    badge.appendChild(row);
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
      if(data.data===null){ready=true;if(!(await upload(local)))throw new Error('Не удалось сохранить начальные данные на сервере; раздел оставлен закрытым.');unlockPage();return;}
      const remote=norm(data.data);
      const remoteSnapshot=JSON.stringify(remote);
      const localChanged=hadLocalData&&!!previous&&previous.fingerprint!==localFingerprint;
      const serverChanged=hadLocalData&&!!previous&&Number(previous.version)!==version;
      const firstConflict=hadLocalData&&!previous&&local!==remoteSnapshot;
      if(firstConflict||(localChanged&&serverChanged)){
        const useCloud=window.confirm('На этом устройстве и в облаке разные данные.\n\nОК — скачать НЕЗАШИФРОВАННУЮ копию локальных данных и загрузить облачную версию.\\nОтмена — оставить раздел закрытым; локальные данные не удаляются.');
        if(!useCloud){status('версии различаются — раздел закрыт до разрешения конфликта','#9a6700');throw new Error('Локальная и серверная версии различаются. Раздел оставлен закрытым, локальный кэш сохранён. Повторите вход и выберите серверную версию после сохранения локальной копии.');}
        if(!backup(local))throw new Error('Не удалось создать локальную резервную копию; данные не изменены.');
      }else if(localChanged&&!serverChanged){ready=true;if(!(await upload(local)))throw new Error('Не удалось синхронизировать локальные изменения; раздел оставлен закрытым.');unlockPage();return;}
      loadCloudData(data.data);const mergedSnapshot=localSnapshot(),needsUpload=mergedSnapshot!==remoteSnapshot;await saveMeta(mergedSnapshot);clearLocalData();ready=true;suppressUpload=true;try{draw();}finally{suppressUpload=false;}
      status('подключено · данные загружены','#176b50');unlockPage();if(needsUpload)scheduleUpload();
    }catch(e){status('ошибка подключения; доступ закрыт','#9a6700');console.error('Patrul session sync:',e);const locked=panel('<h3>Нет подтверждённого доступа</h3><p>Не удалось проверить личную учётную запись и загрузить данные с сервера. Локальные сведения скрыты. Проверьте соединение и попробуйте ещё раз.</p><button type="button" data-retry style="width:100%;padding:11px;background:#167d70;color:white;border:0;border-radius:8px">Повторить проверку</button>');locked.box.querySelector('[data-retry]').addEventListener('click',()=>location.reload());}
  }
  start();
})();