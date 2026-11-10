(() => {
  'use strict';
  const role = window.PATRUL_ROLE;
  const configs = {
    nachalnik: {
      title: 'Рабочий центр начальника',
      modules: [
        {id:'tasks',name:'Контроль поручений',desc:'Ответственные, сроки и исполнение',fields:[['responsible','Ответственный'],['deadline','Срок исполнения','date'],['priority','Приоритет','select',['Обычный','Важный','Срочный']],['details','Содержание поручения','area']]},
        {id:'incidents',name:'Журнал происшествий',desc:'Регистрация событий и принятых мер',fields:[['time','Время','time'],['place','Место'],['people','Участники'],['details','Описание и обстоятельства','area'],['measures','Принятые меры','area']]},
        {id:'posts',name:'Контроль постов',desc:'Проверки, замечания и повторный контроль',fields:[['post','Пост','select',['КПП','Территория','УК-1','УК-2','Другое']],['inspector','Проверяющий'],['findings','Замечания','area'],['deadline','Срок устранения','date'],['photo','Фотография замечания','file']]},
        {id:'analytics',name:'Аналитика нарушений',desc:'Сводные показатели из журнала нарушений',kind:'analytics'},
        {id:'reports',name:'Конструктор отчётов',desc:'Сводка за выбранный период с печатью',kind:'reports'},
        {id:'summary',name:'Сводка за день',desc:'Явка, обходы, нарушения и поручения',kind:'summary'}
      ]
    },
    zam: {
      title: 'Рабочий центр заместителя',
      modules: [
        {id:'shift',name:'Карточка развода',desc:'Контроль подготовки смены',fields:[['date','Дата развода','date'],['time','Время','time'],['attendance','Явка, ФИО и отметки','area'],['uniform','Форма и внешний вид','area'],['readiness','Готовность и инструктаж','area']]},
        {id:'corrections',name:'Контроль устранения',desc:'Повторные проверки и закрытие замечаний',fields:[['post','Пост / место'],['responsible','Ответственный'],['deadline','Срок устранения','date'],['result','Результат повторной проверки','area'],['checkedAt','Дата проверки','date']]},
        {id:'briefings',name:'Шаблоны докладов',desc:'Заготовки и готовые тексты докладов',kind:'templates'},
      ]
    },
    uchet: {
      title: 'Рабочий центр старшего мастера',
      modules: [
        {id:'equipmentSummary',name:'Сводка по имуществу',desc:'Состояние, ремонты, выдача и ближайшие проверки',kind:'equipmentSummary'},
        {id:'equipment',name:'Паспорта имущества',desc:'Инвентарные номера, состояние и хранение',fields:[['inventory','Инвентарный номер'],['category','Категория'],['serial','Серийный номер'],['location','Место хранения'],['condition','Состояние','select',['Исправно','Требует проверки','Неисправно','Списано']],['responsible','Ответственный']]},
        {id:'repairs',name:'История ремонтов',desc:'Неисправности, ремонт и возврат',fields:[['inventory','Инвентарный номер'],['problem','Неисправность','area'],['sentAt','Передано в ремонт','date'],['service','Исполнитель ремонта'],['returnedAt','Возвращено','date'],['result','Результат ремонта','area']]},
        {id:'issuance',name:'Выдача и возврат',desc:'Кому и какое имущество выдано',fields:[['inventory','Инвентарный номер'],['item','Наименование'],['recipient','Получатель'],['issuedAt','Дата выдачи','date'],['returnedAt','Дата возврата','date'],['condition','Состояние при возврате']]},
        {id:'inventory',name:'Инвентаризационные сверки',desc:'Фактическое наличие и расхождения',fields:[['date','Дата проверки','date'],['location','Место хранения'],['book','По учёту','number'],['fact','Фактически','number'],['difference','Выявленные расхождения','area'],['commission','Проверяющие']]},
        {id:'purchases',name:'Контроль закупок',desc:'Заявки, стоимость и согласование',fields:[['item','Что требуется'],['quantity','Количество','number'],['cost','Ориентировочная стоимость','number'],['supplier','Поставщик'],['deadline','Желаемый срок','date'],['approval','Согласование','select',['Подготовка','На согласовании','Одобрено','Отклонено','Приобретено']]]},
        {id:'maintenance',name:'Сроки обслуживания',desc:'Проверки, ТО и напоминания',fields:[['inventory','Инвентарный номер'],['procedure','Что проверить / обслужить'],['deadline','Дата следующей проверки','date'],['responsible','Ответственный'],['result','Результат последней проверки','area']]}
      ]
    },
    dokumentoved: {
      title: 'Рабочий центр документоведа',
      modules: [
        {id:'numbering',name:'Нумерация документов',desc:'Отдельный последовательный реестр по годам',kind:'numbering'},
        {id:'incoming',name:'Входящие документы',desc:'Регистрация поступивших материалов',fields:[['sender','Отправитель'],['sourceNumber','Входящий номер отправителя'],['receivedAt','Дата поступления','date'],['kind','Тип документа'],['summary','Краткое содержание','area'],['deadline','Срок рассмотрения','date']]},
        {id:'movement',name:'Движение документов',desc:'Передача, рассмотрение и исполнение',fields:[['documentNumber','Номер документа'],['recipient','Кому передан'],['sentAt','Дата передачи','date'],['stage','Этап','select',['Зарегистрирован','Передан','На рассмотрении','На доработке','Исполнен','В архиве']],['deadline','Срок исполнения','date'],['note','Примечание','area']]},
        {id:'archive',name:'Поиск по архиву',desc:'Единый поиск по созданным записям и реестрам',kind:'archive'},
        {id:'deadlines',name:'Контроль сроков',desc:'Приближающиеся и просроченные документы',kind:'deadlines'},
        {id:'templates',name:'Библиотека шаблонов',desc:'Заготовки форм и документов',kind:'templates'}
      ]
    }
  };
  if(!configs[role]) return;
  // Personal task lists are stored in the current account's existing synced data.
  // They do not pretend to be cross-role assignments; no existing records are migrated.
  Object.keys(configs).forEach(roleKey=>{
    const cfg=configs[roleKey];
    if(roleKey!=='nachalnik' && !cfg.modules.some(m=>m.id==='personalTasks')){
      cfg.modules.unshift({id:'personalTasks',name:'Мои задачи',desc:'Личный список дел, приоритеты и сроки',fields:[
        ['assignedBy','Кто поставил задачу'],
        ['deadline','Срок выполнения','date'],
        ['priority','Приоритет','select',['Обычный','Важный','Срочный']],
        ['details','Что необходимо сделать','area']
      ]});
    } else if(roleKey==='nachalnik' && !cfg.modules.some(m=>m.id==='personalTasks')){
      cfg.modules.unshift({id:'personalTasks',name:'Мои задачи',desc:'Личный список дел, приоритеты и сроки',fields:[
        ['assignedBy','Источник задачи'],
        ['deadline','Срок выполнения','date'],
        ['priority','Приоритет','select',['Обычный','Важный','Срочный']],
        ['details','Что необходимо сделать','area']
      ]});
    }
  });
  Object.keys(configs).forEach(roleKey=>{const cfg=configs[roleKey];if(!cfg.modules.some(m=>m.id==='audit'))cfg.modules.push({id:'audit',name:'История действий',desc:'Журнал операций рабочего центра',kind:'audit'});if(!cfg.modules.some(m=>m.id==='deadlines'))cfg.modules.push({id:'deadlines',name:'Контроль сроков',desc:'Просроченные и предстоящие сроки',kind:'deadlines'});});
  const config=configs[role];
  const $=s=>document.querySelector(s);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  const dateText=s=>{if(!s)return '—';const p=s.split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:s};
  const uid=()=>window.crypto&&crypto.randomUUID?crypto.randomUUID():'ops-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  let active=false, currentModule='', editingId='', filterText='', filterStatus='Все записи', reportFrom=today().slice(0,8)+'01', reportTo=today();
  let drawOriginal=draw;
  function data(){if(!D.opsHub||typeof D.opsHub!=='object')D.opsHub={};if(!Array.isArray(D.opsHub.records))D.opsHub.records=[];if(!Array.isArray(D.opsHub.audit))D.opsHub.audit=[];if(!D.opsHub.drafts||typeof D.opsHub.drafts!=='object')D.opsHub.drafts={};return D.opsHub;}
  function records(id){return data().records.filter(r=>r.module===id&&!r.archived);}
  function log(action,record){const h=data().audit;h.unshift({id:uid(),at:new Date().toISOString(),action:action,module:record.module,title:record.title,recordId:record.id});if(h.length>300)h.length=300;}
  function persist(){if(typeof save==='function')save();}
  function moduleById(id){return config.modules.find(m=>m.id===id);}
  function navTarget(){return role==='zam'?$('#bn'):$('#nv');}
  function mountNav(){
    const target=navTarget();if(!target)return;
    let b=$('#ops-hub-btn');
    if(!b){b=document.createElement('button');b.id='ops-hub-btn';b.type='button';b.className=role==='zam'?'':'n';b.innerHTML='<span aria-hidden="true">✦</span><span>Рабочий центр</span>';b.addEventListener('click',()=>{active=true;render();});}
    if(role==='zam'){b.className='';b.style.cssText='flex:0 0 76px;min-width:76px;border:0;background:transparent;color:inherit;font:600 10px/1.2 system-ui;padding:7px 3px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer';}
    else b.className='n'+(active?' on':'');
    if(b.parentElement!==target)target.appendChild(b);
    b.classList.toggle('on',active);
  }
  function shell(content){
    const root=$('#m');if(!root)return;
    root.innerHTML='<section class="ops-shell"><div class="ops-top"><div><div class="ops-eyebrow">ПАТРУЛЬНАЯ СЛУЖБА · ИНСТРУМЕНТЫ</div><h1>'+esc(config.title)+'</h1><p>Новые записи хранятся вместе с данными вашей учётной записи и синхронизируются с сервером.</p></div><button type="button" class="ops-secondary" data-ops="exit">К обзору кабинета</button></div>'+content+'</section>';
    mountNav();
  }
  function countOpen(){return data().records.filter(r=>!r.archived&&r.status!=='Выполнено'&&r.status!=='Закрыто'&&r.status!=='Исполнено'&&r.status!=='В архиве').length;}
  function dueRecords(){const t=today();return data().records.filter(r=>!r.archived&&(r.fields.deadline||r.fields.due)&&String(r.fields.deadline||r.fields.due)<t&&r.status!=='Выполнено'&&r.status!=='Закрыто'&&r.status!=='Исполнено'&&r.status!=='В архиве');}
  function home(){
    const due=dueRecords(),aud=data().audit.slice(0,8),now=today();
    const openTasks=records('personalTasks').filter(r=>!['Выполнено','Закрыто','Исполнено'].includes(r.status))
      .sort((a,b)=>String(a.fields.deadline||'9999-12-31').localeCompare(String(b.fields.deadline||'9999-12-31')));
    const nextTasks=openTasks.filter(r=>r.fields.deadline&&r.fields.deadline>=now).slice(0,5);
    const cards=config.modules.map(m=>'<button type="button" class="ops-card" data-ops="module" data-id="'+m.id+'"><span class="ops-card-icon">✧</span><b>'+esc(m.name)+'</b><span>'+esc(m.desc)+'</span><small>'+records(m.id).length+' активных записей</small></button>').join('');
    const dueToday=data().records.filter(r=>!r.archived&&(r.fields.deadline||r.fields.due)===now&&!['Выполнено','Закрыто','Исполнено','В архиве'].includes(r.status)).length;const alerts=due.length||dueToday?'<div class="ops-alert"><b>Требуют внимания: '+due.length+' просрочено · '+dueToday+' на сегодня</b><span>Откройте контроль сроков, чтобы посмотреть записи и ответственных.</span><button type="button" class="ops-secondary" data-ops="module" data-id="deadlines">Открыть контроль сроков</button></div>':'<div class="ops-good">Просроченных записей и сроков на сегодня нет.</div>';
    const taskPanel='<div class="ops-panel"><div class="ops-panel-head"><div><h2>Ближайшие личные задачи</h2><p class="ops-muted">Личный список текущей учётной записи</p></div><button type="button" class="ops-secondary" data-ops="module" data-id="personalTasks">Открыть задачи</button></div>'+
      (nextTasks.length?nextTasks.map(r=>'<div class="ops-task-row"><div><b>'+esc(r.title)+'</b><span>'+esc(r.fields.priority||'Обычный приоритет')+' · '+dateText(r.fields.deadline)+'</span></div><div class="ops-task-actions"><span class="ops-status">'+esc(r.status)+'</span><button type="button" class="ops-task-done" data-ops="complete" data-id="'+r.id+'">Готово</button></div></div>').join(''):'<p class="ops-muted">Ближайших задач пока нет. Добавьте задачу, чтобы не забыть о важном.</p>')+'</div>';
    const recent=aud.length?aud.map(a=>'<div class="ops-history-row"><span>'+esc(new Date(a.at).toLocaleString())+'</span><b>'+esc(a.action)+'</b><span>'+esc(a.title)+'</span></div>').join(''):'<p class="ops-muted">История новых операций появится после добавления записей.</p>';
    shell('<div class="ops-stats"><div><b>'+config.modules.length+'</b><span>рабочих разделов</span></div><div><b>'+data().records.filter(r=>!r.archived).length+'</b><span>активных записей</span></div><div><b>'+countOpen()+'</b><span>незакрытых записей</span></div><div><b>'+due.length+'</b><span>просроченных сроков</span></div></div>'+alerts+taskPanel+'<div class="ops-grid">'+cards+'</div><div class="ops-panel"><h2>Последние действия</h2>'+recent+'</div><div class="ops-panel"><h2>Общий поиск</h2><div class="ops-search"><input id="ops-global-search" placeholder="Номер, ФИО, название, содержание…"><button type="button" class="ops-primary" data-ops="search">Найти</button></div><p class="ops-muted">Поиск охватывает записи рабочего центра этой роли, включая архивные.</p></div>');
  }
  function statusOptions(selected){return ['Новая','В работе','На проверке','Выполнено','Закрыто'].map(x=>'<option'+(selected===x?' selected':'')+'>'+x+'</option>').join('');}
  function recordText(r){return [r.title,r.status,r.date,...Object.values(r.fields||{})].join(' ').toLowerCase();}
  function deadlineState(record){
    const raw=record.fields&&(record.fields.deadline||record.fields.due);
    if(!raw)return 'Без срока';
    const value=String(raw).slice(0,10),now=today();
    if(value<now)return 'Просрочено';
    if(value===now)return 'Сегодня';
    return 'Предстоит';
  }
  function searchCard(record){
    const module=moduleById(record.module),archived=!!record.archived;
    const deadline=record.fields&&(record.fields.deadline||record.fields.due);
    const responsible=record.fields&&(record.fields.responsible||record.fields.recipient||record.fields.assignedBy);
    return '<article class="ops-record ops-search-result"><div class="ops-record-head"><div><small>'+esc(module?module.name:record.module)+(record.number?' · № '+esc(record.number):'')+' · '+dateText(record.date)+'</small><h3>'+esc(record.title)+'</h3></div><span class="ops-status">'+esc(record.status)+'</span></div>'+
      (responsible?'<p><b>Ответственный / источник:</b> '+esc(responsible)+'</p>':'')+
      (deadline?'<p><b>Срок:</b> '+dateText(deadline)+' · '+esc(deadlineState(record))+'</p>':'')+
      (archived?'<p class="ops-muted">Запись находится в архиве</p>':'')+
      '<div class="ops-actions">'+(!archived?'<button type="button" data-ops="edit" data-id="'+record.id+'">Открыть запись</button>':'')+'</div></article>';
  }
  function globalSearch(query){
    const q=String(query||'').trim().toLowerCase();
    const rows=data().records.filter(record=>{
      const haystack=recordText(record)+' '+String(record.number||'')+' '+String(record.module||'');
      return q&&haystack.includes(q);
    }).sort((a,b)=>String(b.updatedAt||b.date||'').localeCompare(String(a.updatedAt||a.date||'')));
    shell('<div class="ops-panel"><div class="ops-panel-head"><div><h2>Результаты общего поиска</h2><p class="ops-muted">Поиск по всем разделам рабочего центра, включая архив</p></div><button type="button" class="ops-secondary" data-ops="home">К рабочему центру</button></div>'+
      '<div class="ops-search"><input id="ops-global-search" value="'+esc(query)+'" placeholder="Номер, ФИО, название или содержание…"><button type="button" class="ops-primary" data-ops="search">Найти</button></div>'+
      '<p class="ops-count">Найдено записей: '+rows.length+'</p><div id="ops-search-results">'+(rows.length?rows.slice(0,100).map(searchCard).join(''):'<div class="ops-empty">'+(q?'Совпадений не найдено.':'Введите слово, номер или фамилию для поиска.')+'</div>')+'</div>'+
      (rows.length>100?'<p class="ops-muted">Показаны первые 100 результатов. Уточните запрос для более точного поиска.</p>':'')+'</div>');
  }
  function card(r,m){
    const details=(m.fields||[]).filter(f=>f[2]!=='file').map(f=>{const v=r.fields[f[0]];return v?'<div><span>'+esc(f[1])+':</span> '+esc(v)+'</div>':'';}).join('');
    const photo=r.fields.photo?'<img class="ops-photo" src="'+r.fields.photo+'" alt="Прикреплённая фотография">':'';
    return '<article class="ops-record"><div class="ops-record-head"><div><small>'+dateText(r.date)+(r.number?' · № '+esc(r.number):'')+'</small><h3>'+esc(r.title)+'</h3></div><span class="ops-status">'+esc(r.status)+'</span></div>'+details+photo+(r.fields.note?'<p>'+esc(r.fields.note)+'</p>':'')+'<div class="ops-actions">'+(m.id==='personalTasks'?'<button type="button" data-ops="complete" data-id="'+r.id+'">Отметить выполненной</button>':'')+'<button type="button" data-ops="edit" data-id="'+r.id+'">Изменить</button><button type="button" data-ops="status" data-id="'+r.id+'">Изменить статус</button><button type="button" data-ops="archive" data-id="'+r.id+'">В архив</button></div></article>';
  }
  function list(id){
    currentModule=id;const m=moduleById(id);if(!m){home();return;}
    if(m.kind==='analytics'){analytics();return;}if(m.kind==='equipmentSummary'){equipmentSummary();return;}if(m.kind==='summary'){summary();return;}if(m.kind==='reports'){reports();return;}if(m.kind==='templates'){templates();return;}if(m.kind==='numbering'){numbering();return;}if(m.kind==='archive'){archive();return;}if(m.kind==='deadlines'){deadlines();return;}if(m.kind==='audit'){audit();return;}
    const all=records(id).filter(r=>(filterStatus==='Все записи'||r.status===filterStatus)&&(!filterText||recordText(r).includes(filterText.toLowerCase()))).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const rows=all.length?all.map(r=>card(r,m)).join(''):'<div class="ops-empty">Записей пока нет. Нажмите «Добавить запись», чтобы создать первую.</div>';
    shell('<div class="ops-toolbar"><button class="ops-primary" data-ops="new">＋ Добавить запись</button><button class="ops-secondary" data-ops="home">Все разделы</button><input id="ops-filter" placeholder="Поиск в разделе…" value="'+esc(filterText)+'"><select id="ops-status"><option>Все записи</option>'+statusOptions(filterStatus)+'</select></div><div class="ops-count">Найдено записей: '+all.length+'</div><div class="ops-list">'+rows+'</div>');
  }
  function form(id,record){
    const m=moduleById(id);if(!m)return;
    editingId=record?record.id:'';
    const fields=(m.fields||[]).map(f=>{
      const value=record&&record.fields?record.fields[f[0]]||'':'';
      const label='<label>'+esc(f[1]);
      if(f[2]==='area')return '<div class="ops-field">'+label+'<textarea name="'+f[0]+'" rows="3">'+esc(value)+'</textarea></label></div>';
      if(f[2]==='select')return '<div class="ops-field">'+label+'<select name="'+f[0]+'">'+(f[3]||[]).map(v=>'<option'+(value===v?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label></div>';
      if(f[2]==='file')return '<div class="ops-field">'+label+'<input type="file" name="'+f[0]+'" accept="image/*"><small>Изображение будет уменьшено перед сохранением (до 135 КБ).</small>'+(value?'<img class="ops-photo" src="'+value+'" alt="Текущая фотография">':'')+'</label></div>';
      const type=['date','time','number'].includes(f[2])?f[2]:'text';
      return '<div class="ops-field">'+label+'<input type="'+type+'" name="'+f[0]+'" value="'+esc(value)+'"></label></div>';
    }).join('');
    const draft=data().drafts[id]||{};
    const title=record?record.title:(draft.title||'');
    const date=record?record.date:(draft.date||today());
    const status=record?record.status:(draft.status||'Новая');
    shell('<div class="ops-panel"><h2>'+(record?'Изменение записи':'Новая запись')+' · '+esc(m.name)+'</h2><form id="ops-record-form"><div class="ops-form-grid"><div class="ops-field"><label>Название / краткая тема<input name="title" required maxlength="180" value="'+esc(title)+'"></label></div><div class="ops-field"><label>Дата записи<input name="date" type="date" required value="'+esc(date)+'"></label></div><div class="ops-field"><label>Статус<select name="status">'+statusOptions(status)+'</select></label></div>'+fields+'</div><div class="ops-form-actions"><button class="ops-primary" type="submit">Сохранить запись</button><button class="ops-secondary" type="button" data-ops="cancel">Отмена</button></div><p class="ops-muted">Черновик формы сохраняется автоматически. Существующие записи кабинета не изменяются.</p></form></div>');
    const f=$('#ops-record-form');
    f.addEventListener('input',()=>{
      const fd=new FormData(f),d={};for(const [k,v] of fd.entries())if(typeof v==='string')d[k]=v;
      data().drafts[id]=d;persist();
    });
    f.addEventListener('submit',async e=>{
      e.preventDefault();
      try{
        const fd=new FormData(f),values={};for(const [k,v] of fd.entries())if(typeof v==='string')values[k]=v;
        for(const field of m.fields||[]){if(field[2]==='file'){const file=f.elements[field[0]].files[0];if(file)values[field[0]]=await compressImage(file);else if(record&&record.fields[field[0]])values[field[0]]=record.fields[field[0]];}}
        const now=new Date().toISOString(),existing=record&&data().records.find(r=>r.id===record.id);
        let target=existing?{...existing,title:values.title.trim(),date:values.date,status:values.status,fields:values,updatedAt:now}:{id:uid(),module:id,title:values.title.trim(),date:values.date,status:values.status,fields:values,createdAt:now,updatedAt:now,archived:false};
        if(!existing&&id==='numbering'){const y=(values.date||today()).slice(0,4);const n=data().records.filter(r=>r.module==='numbering'&&String(r.date).startsWith(y)).length+1;target.number=String(n).padStart(3,'0')+'/'+y;}
        const projected=JSON.parse(JSON.stringify(D)),rows=projected.opsHub.records,index=existing?rows.findIndex(r=>r.id===existing.id):-1;
        if(index>=0)rows[index]=target;else rows.unshift(target);
        if(JSON.stringify(projected).length>1800000)throw new Error('Общий объём данных приблизился к лимиту синхронизации. Сохранение остановлено, прежние записи не изменены. Уменьшите вложение или создайте резервную копию и освободите место.');
        if(existing){Object.assign(existing,target);log('Изменена запись',existing);}else{data().records.unshift(target);log('Создана запись',target);}
        delete data().drafts[id];persist();editingId='';list(id);
      }catch(err){alert(err&&err.message?err.message:'Не удалось сохранить запись. Исходные данные не изменены.');}
    });
  }
  async function compressImage(file){
    if(!file.type.startsWith('image/'))throw new Error('Можно прикрепить только изображение.');
    if(file.size>12*1024*1024)throw new Error('Исходное изображение больше 12 МБ.');
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
      const scale=Math.min(1,1200/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      let quality=.72,out=canvas.toDataURL('image/jpeg',quality);
      while(out.length>180000&&quality>.35){quality-=.08;out=canvas.toDataURL('image/jpeg',quality);}
      if(out.length>180000)throw new Error('Не удалось уменьшить фотографию до допустимого размера.');
      return out;
    }finally{URL.revokeObjectURL(url);}
  }
  function equipmentSummary(){
    const equipment=records('equipment'),repairs=records('repairs'),issuance=records('issuance'),maintenance=records('maintenance'),purchases=records('purchases'),checks=records('inventory');
    const needsAttention=equipment.filter(r=>['Неисправно','Требует проверки'].includes((r.fields||{}).condition));
    const inRepair=repairs.filter(r=>!(r.fields||{}).returnedAt);
    const issued=issuance.filter(r=>!(r.fields||{}).returnedAt);
    const currentDay=today(),limitDate=new Date(currentDay+'T00:00:00');limitDate.setDate(limitDate.getDate()+30);const limitDay=[limitDate.getFullYear(),String(limitDate.getMonth()+1).padStart(2,'0'),String(limitDate.getDate()).padStart(2,'0')].join('-');
    const activeMaintenance=maintenance.filter(r=>!['Выполнено','Закрыто','Исполнено'].includes(r.status));
    const overdue=activeMaintenance.filter(r=>(r.fields||{}).deadline&&r.fields.deadline<currentDay);
    const upcomingMaintenance=activeMaintenance.filter(r=>(r.fields||{}).deadline&&r.fields.deadline>=currentDay&&r.fields.deadline<=limitDay);
    const pendingPurchases=purchases.filter(r=>!['Одобрено','Отклонено','Приобретено'].includes((r.fields||{}).approval));
    const discrepancies=checks.filter(r=>{const f=r.fields||{},book=Number(f.book),fact=Number(f.fact);return f.book!==undefined&&f.book!==''&&f.fact!==undefined&&f.fact!==''&&Number.isFinite(book)&&Number.isFinite(fact)&&book!==fact;});
    const section=(title,rows,empty)=>'<div class="ops-panel"><h3>'+title+'</h3>'+(rows.length?rows.slice(0,5).map(r=>'<article class="ops-record"><b>'+esc(r.title)+'</b><p>'+esc((r.fields||{}).inventory||(r.fields||{}).item||(r.fields||{}).location||'')+((r.fields||{}).deadline?' · срок: '+dateText(r.fields.deadline):'')+((r.fields||{}).responsible?' · '+esc(r.fields.responsible):'')+'</p></article>').join(''):'<p class="ops-muted">'+empty+'</p>')+'</div>';
    shell('<div class="ops-panel"><div class="ops-panel-head"><div><h2>Сводка по имуществу</h2><p class="ops-muted">Показатели рассчитаны по записям рабочего центра. Данные учёта не изменяются.</p></div><button type="button" class="ops-secondary" data-ops="home">Все разделы</button></div><div class="ops-stats"><div><b>'+equipment.length+'</b><span>позиций на учёте</span></div><div><b>'+needsAttention.length+'</b><span>требуют внимания</span></div><div><b>'+inRepair.length+'</b><span>в ремонте</span></div><div><b>'+issued.length+'</b><span>выдано без возврата</span></div><div><b>'+overdue.length+'</b><span>просрочено ТО</span></div><div><b>'+upcomingMaintenance.length+'</b><span>ТО в ближайшие 30 дней</span></div><div><b>'+pendingPurchases.length+'</b><span>закупок на рассмотрении</span></div></div></div>'+
      section('Имущество, требующее внимания',needsAttention,'Нет позиций с состоянием «Неисправно» или «Требует проверки».')+
      section('Имущество в ремонте',inRepair,'Нет незавершённых ремонтов.')+
      section('Выданное имущество без отметки о возврате',issued,'Нет незакрытых выдач.')+
      section('Просроченные сроки обслуживания',overdue,'Просроченных проверок и ТО нет.')+
      section('Проверки и ТО в ближайшие 30 дней',upcomingMaintenance,'На ближайшие 30 дней обслуживание не запланировано.')+
      section('Закупки на рассмотрении',pendingPurchases,'Нет закупок, ожидающих решения.')+
      section('Инвентаризационные расхождения',discrepancies,'По заполненным числовым полям расхождений не найдено.'));
  }
  function summary(){
    const t=today(),viol=Array.isArray(D.viol)?D.viol.filter(v=>v.d===t).length:0,inc=Array.isArray(D.inc)?D.inc.filter(v=>v.d===t).length:0,rounds=Array.isArray(D.rounds)?D.rounds.filter(v=>v.d===t).length:0,tasks=records('tasks').filter(r=>r.status!=='Выполнено'&&r.status!=='Закрыто').length;
    const duty=D.duty&&D.duty[t],staff=Array.isArray(D.staff)?D.staff.length:0;
    shell('<div class="ops-stats"><div><b>'+staff+'</b><span>в личном составе</span></div><div><b>'+viol+'</b><span>нарушений сегодня</span></div><div><b>'+inc+'</b><span>происшествий сегодня</span></div><div><b>'+rounds+'</b><span>обходов сегодня</span></div></div><div class="ops-panel"><h2>Итоги службы за '+dateText(t)+'</h2><p>Незакрытых поручений рабочего центра: <b>'+tasks+'</b></p><p>Итог службы: '+esc(duty&&duty.summary?duty.summary:'В существующем журнале итог за сегодня пока не заполнен.')+'</p><button class="ops-primary" data-ops="print-summary">Печать сводки</button><button class="ops-secondary" data-ops="home">Назад</button></div>');
  }
  function analytics(){
    const items=Array.isArray(D.viol)?D.viol:[],map={};items.forEach(v=>{const k=v.type||v.kind||'Не указан тип';map[k]=(map[k]||0)+1;});
    const rows=Object.keys(map).sort((a,b)=>map[b]-map[a]).map(k=>'<tr><td>'+esc(k)+'</td><td>'+map[k]+'</td></tr>').join('');
    shell('<div class="ops-panel"><h2>Аналитика зарегистрированных нарушений</h2><div class="ops-stats"><div><b>'+items.length+'</b><span>всего записей</span></div><div><b>'+items.filter(v=>String(v.d||'').startsWith(today().slice(0,7))).length+'</b><span>за текущий месяц</span></div><div><b>'+items.filter(v=>v.d===today()).length+'</b><span>сегодня</span></div></div><table class="ops-table"><thead><tr><th>Тип нарушения</th><th>Количество</th></tr></thead><tbody>'+(rows||'<tr><td colspan="2">Данных пока нет</td></tr>')+'</tbody></table><button class="ops-secondary" data-ops="home">Назад</button></div>');
  }
  function reports(){
    const rows=data().records.filter(r=>!r.archived&&r.date>=reportFrom&&r.date<=reportTo).sort((a,b)=>a.date.localeCompare(b.date));
    shell('<div class="ops-panel"><h2>Отчёт за период</h2><div class="ops-toolbar"><label>С <input type="date" id="ops-from" value="'+reportFrom+'"></label><label>По <input type="date" id="ops-to" value="'+reportTo+'"></label><button class="ops-primary" data-ops="report-refresh">Сформировать</button><button class="ops-secondary" data-ops="print">Печать</button></div><p>Записей рабочего центра за период: <b>'+rows.length+'</b></p><div id="ops-report">'+(rows.map(r=>'<article class="ops-record"><small>'+dateText(r.date)+' · '+esc(moduleById(r.module)?.name||r.module)+'</small><h3>'+esc(r.title)+'</h3><p>'+esc(r.status)+'</p><p>'+esc(Object.entries(r.fields||{}).filter(x=>typeof x[1]==='string'&&!x[1].startsWith('data:image')).map(x=>x[0]+': '+x[1]).join(' · '))+'</p></article>').join('')||'<p>За этот период записей нет.</p>')+'</div></div>');
  }
  function templates(){
    const samples=role==='zam'?[['Обычный доклад','Докладываю: пост ____. Время ____. Обстановка ____. Замечания ____. Принятые меры ____.'],['Срочный доклад','СРОЧНО. Время ____. Место ____. Событие ____. Участники ____. Принятые меры ____. Требуется помощь: ____.'],]:[['Служебная записка','Кому: ____\\nОт кого: ____\\nТема: ____\\nСодержание: ____\\nДата: ____'],['Акт проверки','АКТ ПРОВЕРКИ\\nДата и место: ____\\nКомиссия: ____\\nПроверено: ____\\nВыявлено: ____\\nРешение: ____'],['Сопроводительное письмо','Направляется для рассмотрения: ____\\nПриложение: ____\\nОтветственный: ____']];
    shell('<div class="ops-panel"><h2>Готовые заготовки</h2>'+samples.map((x,i)=>'<article class="ops-record"><h3>'+esc(x[0])+'</h3><textarea class="ops-template" id="ops-tpl-'+i+'" rows="5">'+esc(x[1])+'</textarea><button class="ops-primary" data-ops="copy-template" data-id="'+i+'">Скопировать текст</button></article>').join('')+'<p class="ops-muted">Перед использованием заполните пропуски и проверьте реквизиты.</p></div>');
  }
  function numbering(){
    const rows=records('numbering').sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    shell('<div class="ops-panel"><h2>Последовательный реестр</h2><p>Нумерация ведётся отдельно в новом реестре рабочего центра и не меняет номера существующих документов.</p><button class="ops-primary" data-ops="new">＋ Зарегистрировать документ</button><table class="ops-table"><thead><tr><th>Номер</th><th>Дата</th><th>Название</th><th>Статус</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.number||'—')+'</td><td>'+dateText(r.date)+'</td><td>'+esc(r.title)+'</td><td>'+esc(r.status)+'</td></tr>').join('')+'</tbody></table></div>');
  }
  function archive(){
    const all=data().records.filter(r=>r.archived||r.module==='incoming'||r.module==='numbering'||r.module==='movement');
    shell('<div class="ops-panel"><h2>Поиск по архиву и реестрам</h2><input id="ops-archive-search" placeholder="Введите номер, дату, ФИО или ключевое слово"><div id="ops-archive-results">'+archiveRows(all,'')+'</div></div>');
  }
  function archiveRows(all,q){
    const found=all.filter(r=>!q||recordText(r).includes(q.toLowerCase())||String(r.number||'').toLowerCase().includes(q.toLowerCase()));
    return found.length?found.map(r=>'<article class="ops-record"><small>'+dateText(r.date)+' · '+esc(r.number||r.module)+'</small><h3>'+esc(r.title)+'</h3><p>'+esc(r.status)+(r.archived?' · Архив':'')+'</p></article>').join(''):'<p class="ops-muted">Совпадений не найдено.</p>';
  }
  function deadlines(){
    const closedStatuses=['Выполнено','Закрыто','Исполнено','В архиве'];
    const rows=data().records.filter(r=>!r.archived&&!closedStatuses.includes(r.status)&&r.fields&&(r.fields.deadline||r.fields.due)).sort((a,b)=>String(a.fields.deadline||a.fields.due).localeCompare(String(b.fields.deadline||b.fields.due)));
    const late=rows.filter(r=>deadlineState(r)==='Просрочено'),todayRows=rows.filter(r=>deadlineState(r)==='Сегодня'),upcoming=rows.filter(r=>deadlineState(r)==='Предстоит');
    const row=r=>'<article class="ops-record"><div class="ops-record-head"><div><small>'+dateText(r.fields.deadline||r.fields.due)+' · '+esc(moduleById(r.module)?.name||r.module)+'</small><h3>'+esc(r.title)+'</h3></div><span class="ops-deadline-tag '+(deadlineState(r)==='Просрочено'?'is-late':deadlineState(r)==='Сегодня'?'is-today':'')+'">'+esc(deadlineState(r))+'</span></div><p>'+esc(r.status)+' · '+esc(r.fields.responsible||r.fields.recipient||r.fields.assignedBy||'Ответственный не указан')+'</p><div class="ops-actions"><button type="button" data-ops="edit" data-id="'+r.id+'">Открыть запись</button></div></article>';
    shell('<div class="ops-stats"><div><b>'+late.length+'</b><span>просрочено</span></div><div><b>'+todayRows.length+'</b><span>срок сегодня</span></div><div><b>'+upcoming.length+'</b><span>предстоит</span></div></div><div class="ops-panel"><h2>Календарь сроков</h2><p class="ops-muted">Сроки из записей всех разделов текущего рабочего центра.</p>'+
      (rows.length?'<h3>Просроченные</h3>'+(late.map(row).join('')||'<p class="ops-muted">Просроченных сроков нет.</p>')+'<h3>На сегодня</h3>'+(todayRows.map(row).join('')||'<p class="ops-muted">На сегодня сроков нет.</p>')+'<h3>Предстоящие</h3>'+(upcoming.map(row).join('')||'<p class="ops-muted">Предстоящих сроков нет.</p>'):'<div class="ops-empty">Записей со сроками пока нет.</div>')+'</div>');
  }
  function audit(){
    const rows=data().audit;
    shell('<div class="ops-panel"><div class="ops-panel-head"><div><h2>История действий</h2><p class="ops-muted">Последние операции рабочего центра, максимум 300 записей</p></div><button type="button" class="ops-secondary" data-ops="home">К рабочему центру</button></div><input id="ops-audit-search" placeholder="Поиск по действию, разделу или записи"><p id="ops-audit-count" class="ops-count">Записей в журнале: '+rows.length+'</p><div id="ops-audit-results">'+(rows.map(r=>'<div class="ops-history-row"><span>'+esc(new Date(r.at).toLocaleString())+'</span><b>'+esc(r.action)+'</b><span>'+esc(r.title)+'</span></div>').join('')||'<p class="ops-muted">Операций пока нет.</p>')+'</div></div>');
  }
  function render(){if(!active)return;home();}
  function goHome(){active=false;currentModule='';drawOriginal();mountNav();}
  function bindGlobal(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-ops]');if(!b)return;
      const action=b.dataset.ops,id=b.dataset.id;
      if(action==='home'){home();return;}
      if(action==='exit'){goHome();return;}
      if(action==='module'){filterText='';filterStatus='Все записи';list(id);return;}
      if(action==='new'){form(currentModule||'numbering',null);return;}
      if(action==='edit'){const r=data().records.find(x=>x.id===id);if(r)form(r.module,r);return;}
      if(action==='cancel'){list(currentModule);return;}
      if(action==='complete'){const r=data().records.find(x=>x.id===id);if(r){r.status='Выполнено';r.updatedAt=new Date().toISOString();log('Задача отмечена выполненной',r);persist();if(active)home();}return;}
      if(action==='archive'){const r=data().records.find(x=>x.id===id);if(r){r.archived=true;r.updatedAt=new Date().toISOString();log('Перемещена в архив',r);persist();list(r.module);}return;}
      if(action==='status'){const r=data().records.find(x=>x.id===id);if(r){const next=prompt('Новый статус: Новая, В работе, На проверке, Выполнено или Закрыто',r.status);if(next&&['Новая','В работе','На проверке','Выполнено','Закрыто','Исполнено','В архиве'].includes(next)){r.status=next;r.updatedAt=new Date().toISOString();log('Изменён статус',r);persist();list(r.module);}}return;}
      if(action==='search'){globalSearch($('#ops-global-search')?.value||'');return;}
      if(action==='report-refresh'){reportFrom=$('#ops-from').value;reportTo=$('#ops-to').value;reports();return;}
      if(action==='print'||action==='print-summary'){window.print();return;}
      if(action==='copy-template'){const v=$('#ops-tpl-'+id)?.value||'';if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(v).then(()=>alert('Текст скопирован')).catch(()=>alert(v));else alert(v);return;}
    });
    document.addEventListener('input',e=>{
      if(e.target.id==='ops-filter'){filterText=e.target.value;const p=e.target.selectionStart;list(currentModule);const n=$('#ops-filter');if(n){n.focus();n.setSelectionRange(p,p);}}
      if(e.target.id==='ops-archive-search'){const q=e.target.value;const target=$('#ops-archive-results');if(target)target.innerHTML=archiveRows(data().records.filter(r=>r.archived||r.module==='incoming'||r.module==='numbering'||r.module==='movement'),q);}
      if(e.target.id==='ops-audit-search'){const q=e.target.value;const rows=data().audit.filter(r=>(String(r.action)+' '+String(r.title)+' '+String(r.module)).toLowerCase().includes(q.toLowerCase()));const target=$('#ops-audit-results');if(target)target.innerHTML=rows.length?rows.map(r=>'<div class="ops-history-row"><span>'+esc(new Date(r.at).toLocaleString())+'</span><b>'+esc(r.action)+'</b><span>'+esc(r.title)+'</span></div>').join(''):'<p class="ops-muted">Совпадений в истории нет.</p>';const count=$('#ops-audit-count');if(count)count.textContent='Записей в журнале: '+rows.length;}
      if(e.target.id==='ops-global-search'&&$('#ops-search-results')){const q=e.target.value;const rows=q.trim()?data().records.filter(r=>(recordText(r)+' '+String(r.number||'')+' '+String(r.module||'')).includes(q.trim().toLowerCase())).sort((a,b)=>String(b.updatedAt||b.date||'').localeCompare(String(a.updatedAt||a.date||''))):[];const target=$('#ops-search-results');target.innerHTML=rows.length?rows.slice(0,100).map(searchCard).join(''):'<div class="ops-empty">'+(q.trim()?'Совпадений не найдено.':'Введите слово, номер или фамилию для поиска.')+'</div>';}
    });
    document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='ops-global-search'){e.preventDefault();globalSearch(e.target.value);}});
    document.addEventListener('change',e=>{if(e.target.id==='ops-status'){filterStatus=e.target.value;list(currentModule);}});
  }
  const style=document.createElement('style');
  style.textContent='.ops-shell{max-width:1100px;margin:0 auto;padding:8px 0 36px;color:var(--tx,#172536)}.ops-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:18px}.ops-top h1{margin:4px 0;font-size:clamp(22px,3vw,30px)}.ops-top p,.ops-muted{color:var(--mu,#718096);font-size:13px}.ops-eyebrow{font-size:10px;letter-spacing:1.4px;color:var(--mu)}.ops-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.ops-panel-head h2{margin:0}.ops-task-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--bd)}.ops-task-row:last-child{border-bottom:0}.ops-task-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.ops-deadline-tag{display:inline-flex;align-items:center;border:1px solid var(--bd);border-radius:999px;padding:5px 9px;font-size:11px;white-space:nowrap;background:var(--card)}.ops-deadline-tag.is-late{border-color:#d97757;color:#b5472b;background:#fff2ed}.ops-deadline-tag.is-today{border-color:#d49b35;color:#8a5a08;background:#fff8e8}.ops-search-result{margin:10px 0}.ops-task-done{border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:8px;padding:6px 9px;font:inherit;font-size:12px;cursor:pointer}.ops-task-row>div{display:grid;gap:4px}.ops-task-row>div span{font-size:12px;color:var(--mu)}.ops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:12px}.ops-card,.ops-panel,.ops-record{background:var(--card,#fff);border:1px solid var(--bd,#dbe3ec);border-radius:13px;padding:15px;color:var(--tx,#172536)}.ops-card{display:grid;gap:8px;text-align:left;cursor:pointer;min-height:130px}.ops-card b{font-size:15px}.ops-card span,.ops-card small{color:var(--mu,#718096);font-size:12px}.ops-card-icon{font-size:20px}.ops-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;margin:14px 0}.ops-stats>div{padding:14px;border:1px solid var(--bd,#dbe3ec);border-radius:12px;background:var(--card,#fff);display:grid;gap:4px}.ops-stats b{font-size:24px}.ops-stats span{font-size:12px;color:var(--mu)}.ops-alert,.ops-good{padding:13px;border-radius:10px;margin:12px 0;display:grid;gap:4px;background:var(--warn-bg,#fff7e6);border:1px solid var(--bd)}.ops-good{background:var(--card)}.ops-toolbar,.ops-search,.ops-form-actions,.ops-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}.ops-toolbar input{flex:1;min-width:150px}.ops-primary,.ops-secondary,.ops-actions button{border:1px solid var(--bd,#ccd5e0);border-radius:9px;padding:10px 13px;cursor:pointer;background:var(--card,#fff);color:var(--tx,#172536);font:inherit}.ops-primary{background:#176b65;color:white;border-color:#176b65}.ops-record{margin:10px 0}.ops-record h3{margin:5px 0 10px;font-size:16px}.ops-record small,.ops-record div{font-size:12px;color:var(--mu)}.ops-record div{margin:4px 0}.ops-record div span{font-weight:600}.ops-record-head{display:flex;justify-content:space-between;gap:10px}.ops-status{font-size:11px;padding:5px 8px;border-radius:20px;background:var(--bg,#eef2f7);white-space:nowrap;height:max-content}.ops-empty{padding:28px;text-align:center;color:var(--mu);border:1px dashed var(--bd);border-radius:12px}.ops-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.ops-field label{display:grid;gap:6px;font-size:13px;font-weight:600}.ops-field input,.ops-field textarea,.ops-field select,.ops-toolbar input,.ops-toolbar select,.ops-search input,.ops-panel>input,.ops-template{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--bd,#ccd5e0);border-radius:8px;background:var(--card,#fff);color:var(--tx,#172536);font:inherit}.ops-field small{font-weight:400;color:var(--mu)}.ops-photo{display:block;max-width:220px;max-height:180px;object-fit:contain;margin-top:8px;border-radius:8px}.ops-table{width:100%;border-collapse:collapse;margin:14px 0}.ops-table th,.ops-table td{text-align:left;padding:9px;border-bottom:1px solid var(--bd);font-size:13px}.ops-history-row{display:grid;grid-template-columns:minmax(145px,1fr) minmax(110px,.7fr) 2fr;gap:8px;padding:9px 0;border-bottom:1px solid var(--bd);font-size:12px}.ops-history-row span:first-child{color:var(--mu)}@media(max-width:560px){.ops-shell{padding:4px 0 24px}.ops-top{display:grid;gap:10px}.ops-top>button{width:100%;min-height:42px}.ops-history-row{grid-template-columns:1fr 1fr}.ops-history-row span:last-child{grid-column:1/-1}.ops-toolbar>*{max-width:100%;width:100%;min-height:42px;box-sizing:border-box}.ops-search{display:grid;grid-template-columns:1fr}.ops-search>*{width:100%;min-height:42px;box-sizing:border-box}.ops-record-head{display:block}.ops-record-head>.ops-status,.ops-record-head>.ops-deadline-tag{display:inline-flex;margin:4px 0}.ops-task-row{align-items:flex-start;flex-direction:column}.ops-task-actions{width:100%;justify-content:space-between}.ops-actions button{min-height:40px;flex:1}.ops-form-actions>*{flex:1;min-height:42px}.ops-table{display:block;max-width:100%;overflow-x:auto}.ops-panel{min-width:0}.ops-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:360px){.ops-stats>div{padding:10px}.ops-stats b{font-size:20px}.ops-card,.ops-panel,.ops-record{padding:12px}}@media print{#nv,#bn,#hd,#patrul-cloud-status,#ops-hub-btn,.ops-top button,.ops-toolbar,.ops-actions,.ops-form-actions{display:none!important}.ops-shell{max-width:none}.ops-record,.ops-panel{break-inside:avoid;border:0}}';
  document.head.appendChild(style);
  const menu=navTarget();
  if(menu){menu.addEventListener('click',e=>{if(e.target.closest('#ops-hub-btn'))return;if(e.target.closest('button[data-act="tab"]')||e.target.closest('button[data-v]')){if(active){active=false;setTimeout(mountNav,0);}}},true);}
  const observer=new MutationObserver(()=>{mountNav();});
  if(menu)observer.observe(menu,{childList:true});
  const drawPatched=function(keep){drawOriginal(keep);mountNav();if(active)render();};
  draw=drawPatched;
  bindGlobal();
  mountNav();
})();