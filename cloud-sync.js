(() => {
  'use strict';
  const role = window.PATRUL_ROLE;
  const api = '/api/session-data/' + encodeURIComponent(role);
  let version = 0, ready = false, busy = false, queued = false, suppressUpload = false, timer = null, retryTimer = null, retryCount = 0, unsavedChanges = false;
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
  async function fingerprint(snapshot){const copy=JSON.parse(snapshot);if(copy.sx&&typeof copy.sx==='object')delete copy.sx.pw;const material=JSON.stringify(copy);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(material));return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');}
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
  save=function(){try{if(typeof exSched==='function')exSched();}catch(_){}if(ready&&!suppressUpload)scheduleUpload();};

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
    const row=document.createElement('div');row.style.cssText='display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap';
    if(currentUser&&currentUser.systemAdmin&&currentUser.role==='uchet'){const a=document.createElement('button');a.type='button';a.textContent='Управление сотрудниками';a.setAttribute('aria-label','Открыть управление сотрудниками');a.style.cssText='position:fixed;left:14px;bottom:14px;z-index:10002;padding:12px 16px;border:0;border-radius:10px;background:#167d70;color:#fff;font:600 14px system-ui;box-shadow:0 4px 18px #0004;cursor:pointer';a.addEventListener('click',adminPanel);document.body.appendChild(a);const mobile=document.createElement('style');mobile.textContent='@media(max-width:760px){#patrul-admin-users{bottom:88px!important;left:10px!important}}';a.id='patrul-admin-users';document.head.appendChild(mobile);}
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