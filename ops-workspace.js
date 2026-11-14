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
        {id:'inspections',name:'План и журнал проверок постов',desc:'Плановые проверки, замечания, сроки и повторный контроль',fields:[['inspectionDate','Дата проверки','date'],['post','Пост / участок'],['inspector','Проверяющий'],['readiness','Готовность поста','select',['Готов','Замечания','Не готов']],['findings','Выявленные замечания','area'],['responsible','Ответственный за устранение'],['deadline','Срок устранения','date'],['recheck','Результат повторной проверки','area']]},
        {id:'handover',name:'Передача смены',desc:'Состояние смены, незакрытые вопросы и подтверждение приёма',fields:[['date','Дата передачи','date'],['time','Время передачи','time'],['fromPerson','Сдающий смену'],['toPerson','Принимающий смену'],['readiness','Готовность постов','select',['Готовы','Есть замечания','Не готовы']],['openIssues','Незакрытые вопросы','area'],['equipment','Состояние имущества','area'],['acceptedAt','Дата подтверждения приёма','date']]},
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
        {id:'approvals',name:'Резолюции и согласование',desc:'Кому направлен документ, решение руководителя и срок исполнения',fields:[['documentNumber','Регистрационный номер'],['documentKind','Вид документа'],['author','Подготовил'],['reviewer','Рассматривает'],['resolution','Резолюция руководителя','area'],['receivedAt','Дата направления','date'],['deadline','Срок исполнения','date'],['decision','Решение','select',['Ожидает рассмотрения','Согласовано','На доработку','Отклонено']],['decisionAt','Дата решения','date'],['executionResult','Результат исполнения','area']]},
        {id:'archive',name:'Поиск по архиву',desc:'Единый поиск по созданным записям и реестрам',kind:'archive'},
        {id:'deadlines',name:'Контроль сроков',desc:'Приближающиеся и просроченные документы',kind:'deadlines'},
        {id:'templates',name:'Библиотека шаблонов',desc:'Заготовки форм и документов',kind:'templates'}
      ]
    }
  };
  Object.keys(configs).forEach(roleKey=>configs[roleKey].modules.unshift({id:'sharedTasks',name:'Общие поручения',desc:'Назначенные задачи, сроки, исполнители и уведомления',kind:'sharedTasks'}));
  configs.uchet.modules.unshift({id:'roleControl',name:'Контроль кабинетов',desc:'Просмотр данных любой роли в режиме только чтения',kind:'roleControl'});
  Object.keys(configs).forEach(roleKey=>{const cfg=configs[roleKey];if(!cfg.modules.some(m=>m.id==='seniorReports'))cfg.modules.push({id:'seniorReports',name:'Доклады старших патруля',desc:'Смены, явка, оборудование и доклады за последние 30 дней',kind:'seniorReports'});});
  Object.keys(configs).forEach(roleKey=>{const cfg=configs[roleKey];if(!cfg.modules.some(m=>m.id==='seniorActivation'))cfg.modules.push({id:'seniorActivation',name:'Активация старших патруля',desc:'Выдача одноразовых кодов для первого входа',kind:'seniorActivation'});});
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
  const calendarDay=value=>{const day=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return '';const [y,m,d]=day.split('-').map(Number),date=new Date(y,m-1,d);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?day:'';};
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
    root.innerHTML='<section class="ops-shell"><div class="ops-top"><div><div class="ops-eyebrow">ПАТРУЛЬНАЯ СЛУЖБА · ИНСТРУМЕНТЫ</div><h1>'+esc(config.title)+'</h1><p>Доступ и действия ограничены полномочиями текущей учётной записи.</p></div><button type="button" class="ops-secondary" data-ops="exit">К обзору кабинета</button></div>'+content+'</section>';
    mountNav();
  }
  function countOpen(){return data().records.filter(r=>!r.archived&&r.status!=='Выполнено'&&r.status!=='Закрыто'&&r.status!=='Исполнено'&&r.status!=='В архиве').length;}
  function dueRecords(){const t=today();return data().records.filter(r=>{const fields=r.fields||{},raw=calendarDay(fields.deadline||fields.due);return !r.archived&&raw&&raw<t&&!['Выполнено','Закрыто','Исполнено','В архиве'].includes(r.status);});}
  function home(){
    const due=dueRecords(),aud=data().audit.slice(0,8),now=today();
    const taskDeadline=r=>calendarDay((r.fields||{}).deadline||(r.fields||{}).due);
    const taskPriority=r=>({Срочный:0,Важный:1,Обычный:2}[r.fields&&r.fields.priority]??2);
    const openTasks=records('personalTasks').filter(r=>!['Выполнено','Закрыто','Исполнено','В архиве'].includes(r.status))
      .sort((a,b)=>taskPriority(a)-taskPriority(b)||(taskDeadline(a)||'9999-12-31').localeCompare(taskDeadline(b)||'9999-12-31'));
    const lateTasks=openTasks.filter(r=>taskDeadline(r)&&taskDeadline(r)<now).slice(0,5);
    const todayTasks=openTasks.filter(r=>taskDeadline(r)===now).slice(0,5);
    const nextTasks=openTasks.filter(r=>taskDeadline(r)>now).slice(0,5);
    const undatedTasks=openTasks.filter(r=>!taskDeadline(r)).slice(0,5);
    const cards=config.modules.map(m=>'<button type="button" class="ops-card" data-ops="module" data-id="'+m.id+'"><span class="ops-card-icon">✧</span><b>'+esc(m.name)+'</b><span>'+esc(m.desc)+'</span><small>'+records(m.id).length+' активных записей</small></button>').join('');
    const dueToday=data().records.filter(r=>{const due=calendarDay(r.fields&&(r.fields.deadline||r.fields.due));return !r.archived&&due===now&&!['Выполнено','Закрыто','Исполнено','В архиве'].includes(r.status);}).length;const alerts=due.length||dueToday?'<div class="ops-alert"><b>Требуют внимания: '+due.length+' просрочено · '+dueToday+' на сегодня</b><span>Откройте контроль сроков, чтобы посмотреть записи и ответственных.</span><button type="button" class="ops-secondary" data-ops="module" data-id="deadlines">Открыть контроль сроков</button></div>':'<div class="ops-good">Просроченных записей и сроков на сегодня нет.</div>';
    const taskRows=(items,kind)=>items.map(r=>{const fields=r.fields||{},priority=fields.priority||'Обычный',deadline=taskDeadline(r);return '<div class="ops-task-row"><div><b>'+esc(r.title)+'</b><span>'+(kind==='late'?'Просрочено · ':kind==='today'?'Срок сегодня · ':'')+(deadline?dateText(deadline):'Без срока')+'</span></div><div class="ops-task-actions"><span class="ops-deadline-tag '+(priority==='Срочный'?'is-late':priority==='Важный'?'is-today':'')+'">'+esc(priority)+'</span>'+(kind==='late'?'<span class="ops-deadline-tag is-late">Просрочено</span>':kind==='today'?'<span class="ops-deadline-tag is-today">Сегодня</span>':'<span class="ops-status">'+esc(r.status)+'</span>')+'<button type="button" class="ops-task-done" data-ops="complete" data-id="'+r.id+'">Готово</button></div></div>';}).join('');
    const taskPanel='<div class="ops-panel"><div class="ops-panel-head"><div><h2>Ближайшие личные задачи</h2><p class="ops-muted">Личный список текущей учётной записи</p></div><button type="button" class="ops-secondary" data-ops="module" data-id="personalTasks">Открыть задачи</button></div>'+
      (lateTasks.length?'<h3>Просроченные задачи</h3>'+taskRows(lateTasks,'late'):'')+(todayTasks.length?'<h3>Срок сегодня</h3>'+taskRows(todayTasks,'today'):'')+(nextTasks.length?'<h3>Ближайшие задачи</h3>'+taskRows(nextTasks,'next'):'')+(undatedTasks.length?'<h3>Без срока</h3>'+taskRows(undatedTasks,'undated'):'')+(!lateTasks.length&&!todayTasks.length&&!nextTasks.length&&!undatedTasks.length?'<p class="ops-muted">Ближайших задач пока нет. Добавьте задачу, чтобы не забыть о важном.</p>':'')+'</div>';
    const recent=aud.length?aud.map(a=>'<div class="ops-history-row"><span>'+esc(new Date(a.at).toLocaleString())+'</span><b>'+esc(a.action)+'</b><span>'+esc(a.title)+'</span></div>').join(''):'<p class="ops-muted">История новых операций появится после добавления записей.</p>';
    shell('<div class="ops-stats"><div><b>'+config.modules.length+'</b><span>рабочих разделов</span></div><div><b>'+data().records.filter(r=>!r.archived).length+'</b><span>активных записей</span></div><div><b>'+countOpen()+'</b><span>незакрытых записей</span></div><div><b>'+due.length+'</b><span>просроченных сроков</span></div></div>'+alerts+'<div id="ops-crossrole-task-summary"></div>'+taskPanel+'<div class="ops-grid">'+cards+'</div><div class="ops-panel"><h2>Последние действия</h2>'+recent+'</div><div class="ops-panel"><h2>Общий поиск</h2><div class="ops-search"><input id="ops-global-search" placeholder="Номер, ФИО, название, содержание…"><button type="button" class="ops-primary" data-ops="search">Найти</button></div><p class="ops-muted">Поиск охватывает записи рабочего центра этой роли, включая архивные.</p></div>');
  }
  async function loadTaskSummary(){
    const host=$('#ops-crossrole-task-summary');if(!host)return;
    try{
      const response=await fetch('/api/tasks',{credentials:'same-origin',cache:'no-store'});
      let result={};try{result=await response.json();}catch(_){}
      if(!response.ok){host.innerHTML='';return;}
      const tasks=Array.isArray(result.tasks)?result.tasks:[];
      const open=tasks.filter(task=>!['Выполнено','Отменено'].includes(task.status));
      const dueDate=task=>task.dueDate?String(task.dueDate).slice(0,10):'';
      const late=open.filter(task=>dueDate(task)&&dueDate(task)<today());
      const dueToday=open.filter(task=>dueDate(task)===today());
      const urgent=open.filter(task=>task.priority==='Срочный');
      const roleNames={nachalnik:'Начальник',zam:'Заместитель',uchet:'Старший мастер',dokumentoved:'Документовед',starshiy_patrulya:'Старший патруля'};
      const rows=open.slice().sort((a,b)=>(dueDate(a)||'9999-12-31').localeCompare(dueDate(b)||'9999-12-31')).slice(0,5);
      const items=rows.map(task=>'<div class="ops-history-row"><span>'+esc(dueDate(task)?dateText(dueDate(task)):'Без срока')+'</span><b>'+esc(task.title)+'</b><span>'+esc(task.assigneeName)+' · '+esc(roleNames[task.assigneeRole]||task.assigneeRole)+' · '+esc(task.status)+'</span></div>').join('');
      host.innerHTML='<div class="ops-panel"><div class="ops-panel-head"><div><h2>Общие поручения</h2><p class="ops-muted">'+(result.canViewAll?'Общий контроль по всем ролям':'Поручения, назначенные вам или поставленные вами')+'</p></div><button type="button" class="ops-secondary" data-ops="module" data-id="sharedTasks">Открыть поручения</button></div>'+
        '<div class="ops-stats"><div><b>'+open.length+'</b><span>активных</span></div><div><b>'+late.length+'</b><span>просрочено</span></div><div><b>'+dueToday.length+'</b><span>срок сегодня</span></div><div><b>'+urgent.length+'</b><span>срочных</span></div><div><b>'+Number(result.unreadNotifications||0)+'</b><span>уведомлений</span></div></div>'+
        (items||'<p class="ops-muted">Активных поручений нет.</p>')+'</div>';
    }catch(_){host.innerHTML='';}
  }

  function startTaskFromRecord(recordId){
    const record=data().records.find(item=>item.id===recordId);if(!record)return;
    const module=moduleById(record.module),fields=record.fields||{};
    const details=Object.entries(fields).filter(([key,value])=>value!==''&&value!==null&&value!==undefined&&!(typeof value==='string'&&value.startsWith('data:image/')))
      .map(([key,value])=>key+': '+String(value)).join('\n').slice(0,3400);
    const description=['Источник: '+(module?module.name:record.module),record.number?'Номер: '+record.number:'','Дата записи: '+dateText(record.date),details].filter(Boolean).join('\n\n').slice(0,3900);
    sharedTasks({title:record.title,description,dueDate:calendarDay(fields.deadline||fields.due),priority:fields.priority||'Обычный'});
    loadTaskSummary();
  }

  function statusOptions(selected){return ['Новая','В работе','На проверке','Выполнено','Закрыто'].map(x=>'<option'+(selected===x?' selected':'')+'>'+x+'</option>').join('');}
  function searchableText(value){if(value===null||value===undefined)return '';if(Array.isArray(value))return value.map(searchableText).join(' ');if(typeof value==='object')return Object.entries(value).map(([key,item])=>key+' '+searchableText(item)).join(' ');const text=String(value);return text.startsWith('data:image/')?'':text;}
  function recordText(r){return searchableText([r.title,r.status,r.date,r.fields||{}]).toLocaleLowerCase('ru-RU');}
  function matchesSearch(value,query){const terms=String(query||'').toLocaleLowerCase('ru-RU').trim().split(/\s+/).filter(Boolean);const haystack=searchableText(value).toLocaleLowerCase('ru-RU');return terms.every(term=>haystack.includes(term));}
  function deadlineState(record){
    const raw=record.fields&&(record.fields.deadline||record.fields.due);
    if(!raw)return 'Без срока';
    const value=calendarDay(raw);if(!value)return 'Без срока';const now=today();
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
      return q&&matchesSearch(record,q);
    }).sort((a,b)=>String(b.updatedAt||b.date||'').localeCompare(String(a.updatedAt||a.date||'')));
    shell('<div class="ops-panel"><div class="ops-panel-head"><div><h2>Результаты общего поиска</h2><p class="ops-muted">Поиск по всем разделам рабочего центра, включая архив</p></div><button type="button" class="ops-secondary" data-ops="home">К рабочему центру</button></div>'+
      '<div class="ops-search"><input id="ops-global-search" value="'+esc(query)+'" placeholder="Номер, ФИО, название или содержание…"><button type="button" class="ops-primary" data-ops="search">Найти</button></div>'+
      '<p class="ops-count">Найдено записей: '+rows.length+'</p><div id="ops-search-results">'+(rows.length?rows.slice(0,100).map(searchCard).join(''):'<div class="ops-empty">'+(q?'Совпадений не найдено.':'Введите слово, номер или фамилию для поиска.')+'</div>')+'</div>'+
      (rows.length>100?'<p class="ops-muted">Показаны первые 100 результатов. Уточните запрос для более точного поиска.</p>':'')+'</div>');
  }
  function card(r,m){
    const details=(m.fields||[]).filter(f=>f[2]!=='file').map(f=>{const v=r.fields[f[0]];return v?'<div><span>'+esc(f[1])+':</span> '+esc(v)+'</div>':'';}).join('');
    const photo=r.fields.photo?'<img class="ops-photo" src="'+r.fields.photo+'" alt="Прикреплённая фотография">':'';
    return '<article class="ops-record"><div class="ops-record-head"><div><small>'+dateText(r.date)+(r.number?' · № '+esc(r.number):'')+'</small><h3>'+esc(r.title)+'</h3></div><span class="ops-status">'+esc(r.status)+'</span></div>'+details+photo+(r.fields.note?'<p>'+esc(r.fields.note)+'</p>':'')+'<div class="ops-actions">'+(m.id==='personalTasks'?'<button type="button" data-ops="complete" data-id="'+r.id+'">Отметить выполненной</button>':'')+'<button type="button" data-ops="task-from-record" data-id="'+r.id+'">Поставить поручение</button><button type="button" data-ops="edit" data-id="'+r.id+'">Изменить</button><button type="button" data-ops="status" data-id="'+r.id+'">Изменить статус</button><button type="button" data-ops="archive" data-id="'+r.id+'">В архив</button></div></article>';
  }
  async function seniorActivation(){
    currentModule='seniorActivation';
    shell('<div class="ops-count">Загружаем список назначенных старших патруля…</div>');
    try{
      const response=await fetch('/api/patrol-senior/eligible',{credentials:'same-origin',cache:'no-store'});
      let result={};try{result=await response.json();}catch(_){}
      if(!response.ok){shell('<div class="ops-empty">'+esc(result.error||'Не удалось загрузить список')+'</div><button class="ops-secondary" data-ops="home">К разделам</button>');return;}
      const rows=(Array.isArray(result.seniors)?result.seniors:[]).map(person=>
        '<article class="ops-record"><div class="ops-record-head"><div><b>'+esc(person.name)+'</b><div class="ops-muted">'+esc(person.departmentName)+'</div></div><span class="ops-status">'+(person.registered?'Уже зарегистрирован':person.codeIssued?'Код выдан':'Ожидает регистрации')+'</span></div>'+
        (person.registered?'<div class="ops-muted">У этого сотрудника уже есть вход по фамилии и PIN.</div>':'<button type="button" class="ops-primary" data-senior-issue data-staff-key="'+esc(person.staffKey)+'">'+(person.codeIssued?'Выдать новый код':'Выдать одноразовый код')+'</button><div class="ops-muted" data-code-output aria-live="polite"></div>')+
        '</article>'
      ).join('');
      shell('<div class="ops-toolbar"><button class="ops-secondary" data-ops="home">К разделам</button><button class="ops-secondary" id="ops-senior-activation-refresh">Обновить</button></div><div class="ops-count">Код выдаётся один раз, действует 30 минут; повторная выдача аннулирует прежний.</div><div class="ops-list">'+(rows||'<div class="ops-empty">В личном составе нет действующих старших патруля.</div>')+'</div>');
      const refresh=$('#ops-senior-activation-refresh');if(refresh)refresh.addEventListener('click',seniorActivation);
      document.querySelectorAll('[data-senior-issue]').forEach(button=>button.addEventListener('click',async()=>{
        button.disabled=true;
        const output=button.closest('.ops-record').querySelector('[data-code-output]');
        try{
          const issued=await fetch('/api/patrol-senior/activation-code',{
            method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Patrul-CSRF':window.PATRUL_CSRF||''},
            body:JSON.stringify({staffKey:button.dataset.staffKey})
          });
          let payload={};try{payload=await issued.json();}catch(_){}
          if(!issued.ok){if(output)output.textContent=payload.error||'Не удалось выдать код';button.disabled=false;return;}
          if(output)output.textContent='Одноразовый код: '+payload.code+'. Передайте его лично сотруднику. Срок действия — 30 минут.';
          button.textContent='Код выдан';
        }catch(_){if(output)output.textContent='Нет соединения с сервером. Код не выдан.';button.disabled=false;}
      }));
    }catch(_){
      shell('<div class="ops-empty">Нет соединения со списком старших патруля.</div><button class="ops-secondary" data-ops="home">К разделам</button>');
    }
  }
  async function seniorReports(){
    currentModule='seniorReports';
    shell('<div class="ops-count">Загружаем доклады и журнал старших патруля…</div>');
    try{
      const response=await fetch('/api/patrol-senior/reports',{credentials:'same-origin',cache:'no-store'});
      let result={};try{result=await response.json();}catch(_){}
      if(!response.ok){shell('<div class="ops-empty">'+esc(result.error||'Не удалось загрузить журнал старших патруля')+'</div><button class="ops-secondary" data-ops="home">К разделам</button>');return;}
      const labels={attendance:'Явка',report:'Доклад',equipment:'Оборудование',shift_start:'Заступление',shift_end:'Сдача смены',task_update:'Задача'};
      const entries=Array.isArray(result.entries)?result.entries:[];
      const rows=entries.map(entry=>{
        const stamp=entry.createdAt?new Date(entry.createdAt).toLocaleString('ru-RU'):'';
        return '<article class="ops-record"><div class="ops-record-head"><b>'+esc(entry.title||labels[entry.type]||entry.type)+'</b><span class="ops-status">'+esc(labels[entry.type]||entry.type)+'</span></div><div class="ops-muted">'+esc(entry.departmentName||entry.departmentId)+' · '+esc(entry.seniorName||'Старший патруля')+' · '+esc(dateText(String(entry.date||'')))+' '+esc(stamp)+'</div>'+(entry.status?'<p><b>Отметка:</b> '+esc(entry.status)+'</p>':'')+(entry.body?'<p>'+esc(entry.body)+'</p>':'')+'</article>';
      }).join('');
      shell('<div class="ops-toolbar"><button class="ops-secondary" data-ops="home">К разделам</button><button class="ops-secondary" id="ops-senior-refresh">Обновить</button></div><div class="ops-count">Записей за последние 30 дней: '+entries.length+'</div><div class="ops-list">'+(rows||'<div class="ops-empty">Записей от старших патруля пока нет.</div>')+'</div>');
      const refresh=$('#ops-senior-refresh');if(refresh)refresh.addEventListener('click',seniorReports);
    }catch(_){
      shell('<div class="ops-empty">Нет соединения с журналом старших патруля.</div><button class="ops-secondary" data-ops="home">К разделам</button>');
    }
  }
  async function sharedTasks(prefill=null){
    currentModule='sharedTasks';
    shell('<div class="ops-count">Загружаем общие поручения и уведомления…</div>');
    try{
      const [taskResponse,recipientResponse]=await Promise.all([
        fetch('/api/tasks',{credentials:'same-origin',cache:'no-store'}),
        fetch('/api/tasks/recipients',{credentials:'same-origin',cache:'no-store'})
      ]);
      let taskResult={},recipientResult={};
      try{taskResult=await taskResponse.json();}catch(_){}
      try{recipientResult=await recipientResponse.json();}catch(_){}
      if(!taskResponse.ok){shell('<div class="ops-empty">'+esc(taskResult.error||'Не удалось загрузить поручения')+'</div><button class="ops-secondary" data-ops="home">К разделам</button>');return;}
      if(!recipientResponse.ok){shell('<div class="ops-empty">'+esc(recipientResult.error||'Не удалось загрузить список исполнителей')+'</div><button class="ops-secondary" data-ops="home">К разделам</button>');return;}
      const tasks=Array.isArray(taskResult.tasks)?taskResult.tasks:[];
      const recipients=Array.isArray(recipientResult.recipients)?recipientResult.recipients:[];
      const roleNames={nachalnik:'Начальник',zam:'Заместитель',uchet:'Старший мастер',dokumentoved:'Документовед',starshiy_patrulya:'Старший патруля'};
      const terminal=['Выполнено','Отменено'];
      const cards=tasks.map(task=>{
        const due=task.dueDate?dateText(String(task.dueDate).slice(0,10)):'Без срока';
        const actions=[];
        if(task.isAssignee&&!terminal.includes(task.status)){
          if(['Новая','На доработку'].includes(task.status))actions.push('<button type="button" data-task-status="В работе" data-task-id="'+esc(task.id)+'">В работу</button>');
          if(task.status==='В работе')actions.push('<button type="button" data-task-status="На проверке" data-task-id="'+esc(task.id)+'">На проверку</button>');
        }
        if(task.isCreator&&task.status==='На проверке'){
          actions.push('<button type="button" data-task-status="Выполнено" data-task-id="'+esc(task.id)+'">Принять и закрыть</button>');
          actions.push('<button type="button" data-task-status="На доработку" data-task-id="'+esc(task.id)+'">На доработку</button>');
        }
        if(task.isCreator&&!terminal.includes(task.status))actions.push('<button type="button" data-task-status="Отменено" data-task-id="'+esc(task.id)+'">Отменить</button>');
        return '<article class="ops-record"><div class="ops-record-head"><div><small>'+esc(roleNames[task.creatorRole]||task.creatorRole)+' → '+esc(roleNames[task.assigneeRole]||task.assigneeRole)+'</small><h3>'+esc(task.title)+'</h3></div><span class="ops-status">'+esc(task.status)+'</span></div>'+
          '<p>'+esc(task.description||'Без дополнительного описания')+'</p><p><b>Постановщик:</b> '+esc(task.creatorName)+' · <b>Исполнитель:</b> '+esc(task.assigneeName)+'</p>'+
          '<p><b>Срок:</b> '+esc(due)+' · <b>Приоритет:</b> '+esc(task.priority)+'</p>'+
          '<div class="ops-actions">'+(actions.length?actions.join(''):'')+'<button type="button" data-task-history="'+esc(task.id)+'">История</button></div><div class="ops-task-history" data-task-history-content="'+esc(task.id)+'" hidden></div>'+'</article>';
      }).join('');
      const options=recipients.map(person=>'<option value="'+esc(person.id)+'">'+esc(person.displayName)+' · '+esc(roleNames[person.role]||person.role)+'</option>').join('');
      shell('<div class="ops-control-banner"><b>Единый список поручений</b><span>Поручения хранятся на сервере и доступны постановщику и назначенному исполнителю. Исполнитель отмечает ход работы, постановщик видит результат.</span></div>'+
        '<div class="ops-stats"><div><b>'+tasks.filter(x=>x.isAssignee&&!terminal.includes(x.status)).length+'</b><span>у меня на исполнении</span></div><div><b>'+tasks.filter(x=>x.isCreator&&!terminal.includes(x.status)).length+'</b><span>поставлено мной</span></div><div><b>'+Number(taskResult.unreadNotifications||0)+'</b><span>новых уведомлений</span></div></div>'+
        '<div class="ops-panel"><div class="ops-panel-head"><div><h2>Новое поручение</h2><p class="ops-muted">Получателем может быть сотрудник любой из пяти рабочих ролей.</p></div></div>'+
        '<form id="ops-shared-task-form"><div class="ops-form-grid"><div class="ops-field"><label>Исполнитель<select name="assigneeId" required><option value="">Выберите сотрудника</option>'+options+'</select></label></div>'+
        '<div class="ops-field"><label>Тема поручения<input name="title" required maxlength="180" placeholder="Кратко сформулируйте задачу" value="'+esc(prefill&&prefill.title||'')+'"></label></div>'+
        '<div class="ops-field"><label>Срок исполнения<input name="dueDate" type="date" value="'+esc(prefill&&prefill.dueDate||'')+'"></label></div>'+
        '<div class="ops-field"><label>Приоритет<select name="priority"><option>Обычный</option><option>Важный</option><option>Срочный</option></select></label></div>'+
        '<div class="ops-field" style="grid-column:1/-1"><label>Содержание поручения<textarea name="description" rows="3" maxlength="4000" placeholder="Укажите задачу, ожидаемый результат и важные детали">'+esc(prefill&&prefill.description||'')+'</textarea></label></div></div>'+
        '<div class="ops-form-actions"><button class="ops-primary" type="submit">Назначить поручение</button></div><p class="ops-muted" id="ops-task-form-message" role="status"></p></form></div>'+
        '<div class="ops-panel"><div class="ops-panel-head"><div><h2>Поручения и исполнение</h2><p class="ops-muted">'+(taskResult.canViewAll?'Полный обзор поручений всех ролей. Изменять статусы можно только у поручений, где вы постановщик или исполнитель.':'Показаны поручения, которые назначены вам или созданы вами.')+'</p></div>'+
        '<div class="ops-actions"><button type="button" class="ops-secondary" id="ops-task-read">Отметить уведомления прочитанными</button><button type="button" class="ops-secondary" id="ops-task-refresh">Обновить</button></div></div>'+
        '<div class="ops-list">'+(cards||'<div class="ops-empty">Поручений пока нет.</div>')+'</div></div>');
      const form=$('#ops-shared-task-form');
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        const button=form.querySelector('[type=submit]'),message=$('#ops-task-form-message');
        const values=Object.fromEntries(new FormData(form).entries());
        button.disabled=true;if(message)message.textContent='Отправляем поручение…';
        try{
          const response=await fetch('/api/tasks',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Patrul-CSRF':window.PATRUL_CSRF||''},body:JSON.stringify(values)});
          let result={};try{result=await response.json();}catch(_){}
          if(!response.ok){if(message)message.textContent=result.error||'Не удалось назначить поручение';button.disabled=false;return;}
          sharedTasks();
        }catch(_){if(message)message.textContent='Нет соединения с сервером. Поручение не создано.';button.disabled=false;}
      });
      document.querySelectorAll('[data-task-history]').forEach(button=>button.addEventListener('click',async()=>{
        const id=button.dataset.taskHistory,host=document.querySelector('[data-task-history-content="'+CSS.escape(id)+'"]');
        if(!host)return;
        if(!host.hidden){host.hidden=true;button.textContent='История';return;}
        host.hidden=false;host.innerHTML='<p class="ops-muted">Загружаем историю…</p>';button.textContent='Скрыть историю';
        try{
          const response=await fetch('/api/tasks/'+encodeURIComponent(id)+'/events',{credentials:'same-origin',cache:'no-store'});
          let result={};try{result=await response.json();}catch(_){}
          if(!response.ok){host.innerHTML='<p class="ops-muted">'+esc(result.error||'История недоступна')+'</p>';return;}
          const labels={created:'Поручение создано',status_changed:'Изменён статус'};
          const historyRows=(result.events||[]).map(event=>{
            const date=event.createdAt?new Date(event.createdAt).toLocaleString('ru-RU'):'';
            const details=event.details||{},description=event.type==='created'?'Назначено исполнителю. Приоритет: '+(details.priority||'—')+'. Срок: '+(details.dueDate||'без срока'):('Статус: '+(details.from||'—')+' → '+(details.to||'—')+(details.comment?' · Причина: '+details.comment:''));
            return '<div class="ops-history-row"><span>'+esc(date)+'</span><b>'+esc(labels[event.type]||event.type)+'</b><span>'+esc(event.actorName||'Система')+' · '+esc(description)+'</span></div>';
          }).join('');
          host.innerHTML='<div class="ops-task-history-list">'+(historyRows||'<p class="ops-muted">Событий пока нет.</p>')+'</div>';
        }catch(_){host.innerHTML='<p class="ops-muted">Нет соединения с журналом исполнения.</p>';}
      }));
      $('#ops-task-refresh')?.addEventListener('click',sharedTasks);
      $('#ops-task-read')?.addEventListener('click',async()=>{
        try{await fetch('/api/tasks/notifications/read',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Patrul-CSRF':window.PATRUL_CSRF||''},body:'{}'});sharedTasks();}
        catch(_){alert('Не удалось обновить состояние уведомлений.');}
      });
      document.querySelectorAll('[data-task-status]').forEach(button=>button.addEventListener('click',async()=>{
        button.disabled=true;
        try{
          const payload={status:button.dataset.taskStatus};
          if(payload.status==='На доработку'){
            const reason=prompt('Укажите, что именно требуется исправить:');
            if(!reason||!reason.trim()){button.disabled=false;return;}
            payload.comment=reason.trim();
          }
          const response=await fetch('/api/tasks/'+encodeURIComponent(button.dataset.taskId),{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Patrul-CSRF':window.PATRUL_CSRF||''},body:JSON.stringify(payload)});
          let result={};try{result=await response.json();}catch(_){}
          if(!response.ok){alert(result.error||'Не удалось изменить статус поручения');button.disabled=false;return;}
          sharedTasks();
        }catch(_){alert('Нет соединения с сервером.');button.disabled=false;}
      }));
    }catch(_){
      shell('<div class="ops-empty">Не удалось связаться с сервером поручений.</div><button class="ops-secondary" data-ops="home">К разделам</button>');
    }
  }

  const controlRoleLabels={nachalnik:'Начальник',zam:'Заместитель',uchet:'Старший мастер',dokumentoved:'Документовед',starshiy_patrulya:'Старший патруля'};
  const controlFieldLabels={staff:'Личный состав',departments:'Отделения',duty:'Наряды на службу',opsHub:'Рабочий центр',viol:'Журнал нарушений',inc:'Журнал происшествий',rounds:'Обходы',mat:'Материалы',settings:'Настройки',set:'Параметры',accounts:'Учётные записи старших патруля',entries:'Доклады и журнал старших патруля'};
  function controlPreview(value){
    try{
      return (JSON.stringify(value,(key,item)=>{
        if(typeof item==='string'&&item.startsWith('data:image/'))return '[изображение скрыто в контрольном просмотре]';
        if(typeof item==='string'&&item.length>6000)return item.slice(0,6000)+'… [текст сокращён]';
        return item;
      },2)||'null').slice(0,26000);
    }catch(_){return '[Не удалось сформировать представление данных]';}
  }
  async function roleControl(targetRole='nachalnik'){
    if(role!=='uchet'){home();return;}
    currentModule='roleControl';
    const options=Object.entries(controlRoleLabels).map(([id,name])=>'<option value="'+id+'"'+(id===targetRole?' selected':'')+'>'+name+'</option>').join('');
    shell('<div class="ops-control-banner"><b>КОНТРОЛЬНЫЙ ПРОСМОТР · ТОЛЬКО ЧТЕНИЕ</b><span>Вы остаетесь в своей учётной записи старшего мастера. Действия от имени другого сотрудника не выполняются; каждый просмотр фиксируется в журнале безопасности.</span></div>'+
      '<div class="ops-panel"><div class="ops-toolbar"><label style="min-width:230px">Кабинет для просмотра<select id="ops-control-role">'+options+'</select></label><button class="ops-secondary" data-ops="home">Завершить просмотр</button></div><div id="ops-control-content" class="ops-muted">Загружаем данные выбранной роли…</div></div>');
    const selector=$('#ops-control-role');
    if(selector)selector.addEventListener('change',()=>roleControl(selector.value));
    try{
      const response=await fetch('/api/control/role-data/'+encodeURIComponent(targetRole),{credentials:'same-origin',cache:'no-store'});
      let result={};try{result=await response.json();}catch(_){}
      const target=$('#ops-control-content');if(!target)return;
      if(!response.ok){target.innerHTML='<div class="ops-empty">'+esc(result.error||'Нет доступа к данным роли')+'</div>';return;}
      const data=result.data&&typeof result.data==='object'?result.data:{};
      const keys=Object.keys(data);
      const blocks=keys.map(key=>{
        const value=data[key],label=controlFieldLabels[key]||key;
        const size=Array.isArray(value)?value.length:value&&typeof value==='object'?Object.keys(value).length:'';
        return '<details class="ops-control-section"><summary>'+esc(label)+(size!==''?' · '+size+' элементов':'')+'</summary><pre>'+esc(controlPreview(value))+'</pre></details>';
      }).join('');
      const hub=data.opsHub&&typeof data.opsHub==='object'?data.opsHub:{};
      const recent=Array.isArray(hub.records)?hub.records.filter(item=>item&&!item.archived).slice().sort((a,b)=>String(b.updatedAt||b.date||'').localeCompare(String(a.updatedAt||a.date||''))).slice(0,20):[];
      const recentMarkup=recent.length?'<div class="ops-panel"><h3>Последние записи рабочего центра</h3>'+recent.map(item=>'<article class="ops-record"><small>'+esc(item.module||'Раздел')+' · '+esc(dateText(String(item.date||'')))+'</small><h3>'+esc(item.title||'Без названия')+'</h3><span class="ops-status">'+esc(item.status||'Без статуса')+'</span></article>').join('')+'</div>':'';
      target.innerHTML='<div class="ops-stats"><div><b>'+keys.length+'</b><span>разделов данных</span></div><div><b>'+recent.length+'</b><span>последних записей рабочего центра</span></div><div><b>'+Number(result.version||0)+'</b><span>версия данных</span></div></div><p class="ops-muted">Кабинет: <b>'+esc(controlRoleLabels[result.role]||result.role)+'</b> · Обновлено: '+esc(result.updatedAt?new Date(result.updatedAt).toLocaleString('ru-RU'):'нет сохранённых данных')+'</p>'+recentMarkup+
        '<div class="ops-panel"><h3>Структура данных кабинета</h3>'+(blocks||'<div class="ops-empty">В этом кабинете пока нет сохранённых данных.</div>')+'</div>'+
        '<p class="ops-muted">Контрольный режим не предоставляет кнопок сохранения, удаления или изменения чужих записей. Чтобы вернуться к работе старшего мастера, нажмите «Завершить просмотр».</p>';
    }catch(_){
      const target=$('#ops-control-content');if(target)target.innerHTML='<div class="ops-empty">Нет соединения с сервером контрольного просмотра.</div>';
    }
  }

  function list(id){
    currentModule=id;const m=moduleById(id);if(!m){home();return;}
    if(m.kind==='sharedTasks'){sharedTasks();return;}if(m.kind==='roleControl'){roleControl();return;}if(m.kind==='analytics'){analytics();return;}if(m.kind==='equipmentSummary'){equipmentSummary();return;}if(m.kind==='summary'){summary();return;}if(m.kind==='reports'){reports();return;}if(m.kind==='templates'){templates();return;}if(m.kind==='numbering'){numbering();return;}if(m.kind==='archive'){archive();return;}if(m.kind==='deadlines'){deadlines();return;}if(m.kind==='audit'){audit();return;}if(m.kind==='seniorReports'){seniorReports();return;}if(m.kind==='seniorActivation'){seniorActivation();return;}
    const all=records(id).filter(r=>(filterStatus==='Все записи'||r.status===filterStatus)&&(!filterText||matchesSearch(r,filterText))).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
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
        if(!existing&&id==='numbering'){
          const year=String(values.date||today()).slice(0,4);
          const localNumbers=data().records.filter(r=>r.module==='numbering'&&String(r.date).startsWith(year)).map(r=>{
            const match=String(r.number||'').match(/^(\\d+)\\/([0-9]{4})$/);
            return match&&match[2]===year?Number(match[1]):0;
          });
          const response=await fetch('/api/documents/next-number',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Patrul-CSRF':window.PATRUL_CSRF||''},body:JSON.stringify({date:values.date||today(),minimumSequence:Math.max(0,...localNumbers)})});
          let numbering={};try{numbering=await response.json();}catch(_){}
          if(!response.ok)throw new Error(numbering.error||'Не удалось получить следующий регистрационный номер');
          target.number=numbering.number;
        }
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
    const activeMaintenance=maintenance.filter(r=>!['Выполнено','Закрыто','Исполнено','В архиве'].includes(r.status));
    const maintenanceDay=r=>calendarDay((r.fields||{}).deadline);
    const overdue=activeMaintenance.filter(r=>maintenanceDay(r)&&maintenanceDay(r)<currentDay);
    const upcomingMaintenance=activeMaintenance.filter(r=>maintenanceDay(r)&&maintenanceDay(r)>=currentDay&&maintenanceDay(r)<=limitDay);
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
    const closed=['Выполнено','Закрыто','Исполнено','В архиве'];
    const completed=rows.filter(r=>closed.includes(r.status)).length;
    const overdue=rows.filter(r=>{const fields=r.fields||{},due=calendarDay(fields.deadline||fields.due);return !closed.includes(r.status)&&due&&due<today();}).length;
    const dueToday=rows.filter(r=>{const fields=r.fields||{},due=calendarDay(fields.deadline||fields.due);return !closed.includes(r.status)&&due&&due===today();}).length;
    const open=rows.length-completed;
    const grouped={};rows.forEach(r=>{const key=r.module||'other';grouped[key]=(grouped[key]||0)+1;});
    const breakdown=Object.keys(grouped).sort((a,b)=>grouped[b]-grouped[a]).map(key=>'<tr><td>'+esc(moduleById(key)?.name||key)+'</td><td>'+grouped[key]+'</td></tr>').join('');
    shell('<div class="ops-panel"><h2>Отчёт за период</h2><div class="ops-toolbar"><label>С <input type="date" id="ops-from" value="'+reportFrom+'"></label><label>По <input type="date" id="ops-to" value="'+reportTo+'"></label><button class="ops-primary" data-ops="report-refresh">Сформировать</button><button class="ops-secondary" data-ops="print">Печать</button></div><div class="ops-stats"><div><b>'+rows.length+'</b><span>всего записей</span></div><div><b>'+open+'</b><span>не завершено</span></div><div><b>'+completed+'</b><span>завершено</span></div><div><b>'+overdue+'</b><span>просрочено сейчас</span></div><div><b>'+dueToday+'</b><span>срок сегодня</span></div></div><h3>По разделам</h3><table class="ops-table"><thead><tr><th>Раздел</th><th>Записей</th></tr></thead><tbody>'+(breakdown||'<tr><td colspan="2">Нет данных за период</td></tr>')+'</tbody></table><div id="ops-report">'+(rows.map(r=>'<article class="ops-record"><small>'+dateText(r.date)+' · '+esc(moduleById(r.module)?.name||r.module)+'</small><h3>'+esc(r.title)+'</h3><p>'+esc(r.status)+'</p><p>'+esc(Object.entries(r.fields||{}).filter(x=>typeof x[1]==='string'&&!x[1].startsWith('data:image')).map(x=>x[0]+': '+x[1]).join(' · '))+'</p></article>').join('')||'<p>За этот период записей нет.</p>')+'</div></div>');
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
    const found=all.filter(r=>!q||matchesSearch(r,q));
    return found.length?found.map(r=>'<article class="ops-record"><small>'+dateText(r.date)+' · '+esc(r.number||r.module)+'</small><h3>'+esc(r.title)+'</h3><p>'+esc(r.status)+(r.archived?' · Архив':'')+'</p></article>').join(''):'<p class="ops-muted">Совпадений не найдено.</p>';
  }
  function deadlines(){
    const closedStatuses=['Выполнено','Закрыто','Исполнено','В архиве'];
    const rows=data().records.filter(r=>!r.archived&&!closedStatuses.includes(r.status)&&calendarDay(r.fields&&(r.fields.deadline||r.fields.due))).sort((a,b)=>calendarDay(a.fields.deadline||a.fields.due).localeCompare(calendarDay(b.fields.deadline||b.fields.due)));
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
      if(action==='task-from-record'){startTaskFromRecord(id);return;}
      if(action==='edit'){const r=data().records.find(x=>x.id===id);if(r)form(r.module,r);return;}
      if(action==='cancel'){list(currentModule);return;}
      if(action==='complete'){const r=data().records.find(x=>x.id===id);if(r){r.status='Выполнено';r.updatedAt=new Date().toISOString();log('Задача отмечена выполненной',r);persist();if(active)home();}return;}
      if(action==='archive'){const r=data().records.find(x=>x.id===id);if(r){r.archived=true;r.updatedAt=new Date().toISOString();log('Перемещена в архив',r);persist();list(r.module);}return;}
      if(action==='status'){const r=data().records.find(x=>x.id===id);if(r){const next=prompt('Новый статус: Новая, В работе, На проверке, Выполнено или Закрыто',r.status);if(next&&['Новая','В работе','На проверке','Выполнено','Закрыто','Исполнено','В архиве'].includes(next)){r.status=next;r.updatedAt=new Date().toISOString();log('Изменён статус',r);persist();list(r.module);}}return;}
      if(action==='search'){globalSearch($('#ops-global-search')?.value||'');return;}
      if(action==='report-refresh'){const from=$('#ops-from')?.value||'',to=$('#ops-to')?.value||'';if(!from||!to||from>to){alert('Укажите корректный период: дата начала не должна быть позже даты окончания.');return;}reportFrom=from;reportTo=to;reports();return;}
      if(action==='print'||action==='print-summary'){window.print();return;}
      if(action==='copy-template'){const v=$('#ops-tpl-'+id)?.value||'';if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(v).then(()=>alert('Текст скопирован')).catch(()=>alert(v));else alert(v);return;}
    });
    document.addEventListener('input',e=>{
      if(e.target.id==='ops-filter'){filterText=e.target.value;const p=e.target.selectionStart;list(currentModule);const n=$('#ops-filter');if(n){n.focus();n.setSelectionRange(p,p);}}
      if(e.target.id==='ops-archive-search'){const q=e.target.value;const target=$('#ops-archive-results');if(target)target.innerHTML=archiveRows(data().records.filter(r=>r.archived||r.module==='incoming'||r.module==='numbering'||r.module==='movement'),q);}
      if(e.target.id==='ops-audit-search'){const q=e.target.value;const rows=data().audit.filter(r=>matchesSearch(r,q));const target=$('#ops-audit-results');if(target)target.innerHTML=rows.length?rows.map(r=>'<div class="ops-history-row"><span>'+esc(new Date(r.at).toLocaleString())+'</span><b>'+esc(r.action)+'</b><span>'+esc(r.title)+'</span></div>').join(''):'<p class="ops-muted">Совпадений в истории нет.</p>';const count=$('#ops-audit-count');if(count)count.textContent='Записей в журнале: '+rows.length;}
      if(e.target.id==='ops-global-search'&&$('#ops-search-results')){const q=e.target.value;const rows=q.trim()?data().records.filter(r=>matchesSearch(r,q)).sort((a,b)=>String(b.updatedAt||b.date||'').localeCompare(String(a.updatedAt||a.date||''))):[];const target=$('#ops-search-results');target.innerHTML=rows.length?rows.slice(0,100).map(searchCard).join(''):'<div class="ops-empty">'+(q.trim()?'Совпадений не найдено.':'Введите слово, номер или фамилию для поиска.')+'</div>';}
    });
    document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='ops-global-search'){e.preventDefault();globalSearch(e.target.value);}});
    document.addEventListener('change',e=>{if(e.target.id==='ops-status'){filterStatus=e.target.value;list(currentModule);}});
  }
  const style=document.createElement('style');
  style.textContent='.ops-control-banner{display:grid;gap:5px;padding:14px 16px;margin:12px 0;border:1px solid #b9a26a;border-left:4px solid #b78a24;border-radius:10px;background:var(--card);}.ops-control-section{border:1px solid var(--bd);border-radius:9px;margin:8px 0;padding:10px 12px;background:var(--card)}.ops-control-section summary{cursor:pointer;font-weight:650}.ops-control-section pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;font:12px/1.5 ui-monospace,monospace;color:var(--tx);background:var(--bg);padding:12px;border-radius:8px}.ops-shell{max-width:1100px;margin:0 auto;padding:8px 0 36px;color:var(--tx,#172536)}.ops-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:18px}.ops-top h1{margin:4px 0;font-size:clamp(22px,3vw,30px)}.ops-top p,.ops-muted{color:var(--mu,#718096);font-size:13px}.ops-eyebrow{font-size:10px;letter-spacing:1.4px;color:var(--mu)}.ops-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.ops-panel-head h2{margin:0}.ops-task-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--bd)}.ops-task-row:last-child{border-bottom:0}.ops-task-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.ops-deadline-tag{display:inline-flex;align-items:center;border:1px solid var(--bd);border-radius:999px;padding:5px 9px;font-size:11px;white-space:nowrap;background:var(--card)}.ops-deadline-tag.is-late{border-color:#d97757;color:#b5472b;background:#fff2ed}.ops-deadline-tag.is-today{border-color:#d49b35;color:#8a5a08;background:#fff8e8}.ops-search-result{margin:10px 0}.ops-task-done{border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:8px;padding:6px 9px;font:inherit;font-size:12px;cursor:pointer}.ops-task-row>div{display:grid;gap:4px}.ops-task-row>div span{font-size:12px;color:var(--mu)}.ops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:12px}.ops-card,.ops-panel,.ops-record{background:var(--card,#fff);border:1px solid var(--bd,#dbe3ec);border-radius:13px;padding:15px;color:var(--tx,#172536)}.ops-card{display:grid;gap:8px;text-align:left;cursor:pointer;min-height:130px}.ops-card b{font-size:15px}.ops-card span,.ops-card small{color:var(--mu,#718096);font-size:12px}.ops-card-icon{font-size:20px}.ops-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;margin:14px 0}.ops-stats>div{padding:14px;border:1px solid var(--bd,#dbe3ec);border-radius:12px;background:var(--card,#fff);display:grid;gap:4px}.ops-stats b{font-size:24px}.ops-stats span{font-size:12px;color:var(--mu)}.ops-alert,.ops-good{padding:13px;border-radius:10px;margin:12px 0;display:grid;gap:4px;background:var(--warn-bg,#fff7e6);border:1px solid var(--bd)}.ops-good{background:var(--card)}.ops-toolbar,.ops-search,.ops-form-actions,.ops-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}.ops-toolbar input{flex:1;min-width:150px}.ops-primary,.ops-secondary,.ops-actions button{border:1px solid var(--bd,#ccd5e0);border-radius:9px;padding:10px 13px;cursor:pointer;background:var(--card,#fff);color:var(--tx,#172536);font:inherit}.ops-primary{background:#176b65;color:white;border-color:#176b65}.ops-record{margin:10px 0}.ops-record h3{margin:5px 0 10px;font-size:16px}.ops-record small,.ops-record div{font-size:12px;color:var(--mu)}.ops-record div{margin:4px 0}.ops-record div span{font-weight:600}.ops-record-head{display:flex;justify-content:space-between;gap:10px}.ops-status{font-size:11px;padding:5px 8px;border-radius:20px;background:var(--bg,#eef2f7);white-space:nowrap;height:max-content}.ops-empty{padding:28px;text-align:center;color:var(--mu);border:1px dashed var(--bd);border-radius:12px}.ops-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.ops-field label{display:grid;gap:6px;font-size:13px;font-weight:600}.ops-field input,.ops-field textarea,.ops-field select,.ops-toolbar input,.ops-toolbar select,.ops-search input,.ops-panel>input,.ops-template{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--bd,#ccd5e0);border-radius:8px;background:var(--card,#fff);color:var(--tx,#172536);font:inherit}.ops-field small{font-weight:400;color:var(--mu)}.ops-photo{display:block;max-width:220px;max-height:180px;object-fit:contain;margin-top:8px;border-radius:8px}.ops-table{width:100%;border-collapse:collapse;margin:14px 0}.ops-table th,.ops-table td{text-align:left;padding:9px;border-bottom:1px solid var(--bd);font-size:13px}.ops-history-row{display:grid;grid-template-columns:minmax(145px,1fr) minmax(110px,.7fr) 2fr;gap:8px;padding:9px 0;border-bottom:1px solid var(--bd);font-size:12px}.ops-history-row span:first-child{color:var(--mu)}@media(max-width:560px){.ops-shell{padding:4px 0 24px}.ops-top{display:grid;gap:10px}.ops-top>button{width:100%;min-height:42px}.ops-history-row{grid-template-columns:1fr 1fr}.ops-history-row span:last-child{grid-column:1/-1}.ops-toolbar>*{max-width:100%;width:100%;min-height:42px;box-sizing:border-box}.ops-search{display:grid;grid-template-columns:1fr}.ops-search>*{width:100%;min-height:42px;box-sizing:border-box}.ops-record-head{display:block}.ops-record-head>.ops-status,.ops-record-head>.ops-deadline-tag{display:inline-flex;margin:4px 0}.ops-task-row{align-items:flex-start;flex-direction:column}.ops-task-actions{width:100%;justify-content:space-between}.ops-actions button{min-height:40px;flex:1}.ops-form-actions>*{flex:1;min-height:42px}.ops-table{display:block;max-width:100%;overflow-x:auto}.ops-panel{min-width:0}.ops-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:360px){.ops-stats>div{padding:10px}.ops-stats b{font-size:20px}.ops-card,.ops-panel,.ops-record{padding:12px}}@media print{#nv,#bn,#hd,#patrul-cloud-status,#ops-hub-btn,.ops-top button,.ops-toolbar,.ops-actions,.ops-form-actions{display:none!important}.ops-shell{max-width:none}.ops-record,.ops-panel{break-inside:avoid;border:0}}';
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