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
        {id:'routes',name:'Маршруты обхода',desc:'План постов и отметки прохождения',fields:[['date','Дата обхода','date'],['route','Маршрут и порядок постов','area'],['start','Начало','time'],['finish','Окончание','time'],['notes','Результат обхода','area']]},
        {id:'remarks',name:'Фотофиксация замечаний',desc:'Фотография, место и описание недостатка',fields:[['post','Пост / место'],['time','Время','time'],['details','Описание замечания','area'],['photo','Фотография','file'],['responsible','Кому передано']]},
        {id:'corrections',name:'Контроль устранения',desc:'Повторные проверки и закрытие замечаний',fields:[['post','Пост / место'],['responsible','Ответственный'],['deadline','Срок устранения','date'],['result','Результат повторной проверки','area'],['checkedAt','Дата проверки','date']]},
        {id:'briefings',name:'Шаблоны докладов',desc:'Заготовки и готовые тексты докладов',kind:'templates'},
        {id:'handover',name:'Передача смены',desc:'Что сделано и что осталось следующей смене',fields:[['shift','Смена / дата'],['completed','Выполнено','area'],['open','Незакрытые вопросы','area'],['incidents','Происшествия и замечания','area'],['next','Что необходимо сделать','area']]}
      ]
    },
    uchet: {
      title: 'Рабочий центр старшего мастера',
      modules: [
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
  const config=configs[role];
  const $=s=>document.querySelector(s);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>new Date().toISOString().slice(0,10);
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
    root.innerHTML='<section class="ops-shell"><div class="ops-top"><div><div class="ops-eyebrow">ПАТРУЛЬНАЯ СЛУЖБА · ИНСТРУМЕНТЫ</div><h1>'+esc(config.title)+'</h1><p>Новые записи хранятся вместе с данными вашей учётной записи и синхронизируются с сервером.</p></div><button type="button" class="ops-secondary" data-ops="home">К обзору кабинета</button></div>'+content+'</section>';
    mountNav();
  }
  function countOpen(){return data().records.filter(r=>!r.archived&&r.status!=='Выполнено'&&r.status!=='Закрыто'&&r.status!=='Исполнено'&&r.status!=='В архиве').length;}
  function dueRecords(){const t=today();return data().records.filter(r=>!r.archived&&(r.fields.deadline||r.fields.due)&&String(r.fields.deadline||r.fields.due)<t&&r.status!=='Выполнено'&&r.status!=='Закрыто'&&r.status!=='Исполнено'&&r.status!=='В архиве');}
  function home(){
    const due=dueRecords(),aud=data().audit.slice(0,8);
    const cards=config.modules.map(m=>'<button type="button" class="ops-card" data-ops="module" data-id="'+m.id+'"><span class="ops-card-icon">✧</span><b>'+esc(m.name)+'</b><span>'+esc(m.desc)+'</span><small>'+records(m.id).length+' активных записей</small></button>').join('');
    const alerts=due.length?'<div class="ops-alert"><b>Требуют внимания: '+due.length+'</b><span>Есть записи с просроченными сроками. Откройте соответствующий раздел и обновите статус.</span></div>':'<div class="ops-good">Просроченных записей в новом рабочем центре нет.</div>';
    const recent=aud.length?aud.map(a=>'<div class="ops-history-row"><span>'+esc(new Date(a.at).toLocaleString())+'</span><b>'+esc(a.action)+'</b><span>'+esc(a.title)+'</span></div>').join(''):'<p class="ops-muted">История новых операций появится после добавления записей.</p>';
    shell('<div class="ops-stats"><div><b>'+config.modules.length+'</b><span>рабочих разделов</span></div><div><b>'+data().records.filter(r=>!r.archived).length+'</b><span>активных записей</span></div><div><b>'+countOpen()+'</b><span>незакрытых записей</span></div><div><b>'+due.length+'</b><span>просроченных сроков</span></div></div>'+alerts+'<div class="ops-grid">'+cards+'</div><div class="ops-panel"><h2>Последние действия</h2>'+recent+'</div><div class="ops-panel"><h2>Общий поиск</h2><div class="ops-search"><input id="ops-global-search" placeholder="Номер, ФИО, название, содержание…"><button type="button" class="ops-primary" data-ops="search">Найти</button></div><p class="ops-muted">Поиск охватывает записи рабочего центра этой роли, включая архивные.</p></div>');
  }
  function statusOptions(selected){return ['Новая','В работе','На проверке','Выполнено','Закрыто'].map(x=>'<option'+(selected===x?' selected':'')+'>'+x+'</option>').join('');}
  function recordText(r){return [r.title,r.status,r.date,...Object.values(r.fields||{})].join(' ').toLowerCase();}
  function card(r,m){
    const details=(m.fields||[]).filter(f=>f[3]!=='file').map(f=>{const v=r.fields[f[0]];return v?'<div><span>'+esc(f[1])+':</span> '+esc(v)+'</div>':'';}).join('');
    const photo=r.fields.photo?'<img class="ops-photo" src="'+r.fields.photo+'" alt="Прикреплённая фотография">':'';
    return '<article class="ops-record"><div class="ops-record-head"><div><small>'+dateText(r.date)+(r.number?' · № '+esc(r.number):'')+'</small><h3>'+esc(r.title)+'</h3></div><span class="ops-status">'+esc(r.status)+'</span></div>'+details+photo+(r.fields.note?'<p>'+esc(r.fields.note)+'</p>':'')+'<div class="ops-actions"><button type="button" data-ops="edit" data-id="'+r.id+'">Изменить</button><button type="button" data-ops="status" data-id="'+r.id+'">Изменить статус</button><button type="button" data-ops="archive" data-id="'+r.id+'">В архив</button></div></article>';
  }
  function list(id){
    currentModule=id;const m=moduleById(id);if(!m){home();return;}
    if(m.kind==='analytics'){analytics();return;}if(m.kind==='summary'){summary();return;}if(m.kind==='reports'){reports();return;}if(m.kind==='templates'){templates();return;}if(m.kind==='numbering'){numbering();return;}if(m.kind==='archive'){archive();return;}if(m.kind==='deadlines'){deadlines();return;}
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
      if(f[2]==='file')return '<div class="ops-field">'+label+'<input type="file" name="'+f[0]+'" accept="image/*"><small>Изображение будет уменьшено перед сохранением (до 250 КБ).</small>'+(value?'<img class="ops-photo" src="'+value+'" alt="Текущая фотография">':'')+'</label></div>';
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
      e.preventDefault();const fd=new FormData(f),values={};for(const [k,v] of fd.entries())if(typeof v==='string')values[k]=v;
      for(const field of m.fields||[]){if(field[2]==='file'){const file=f.elements[field[0]].files[0];if(file)values[field[0]]=await compressImage(file);else if(record&&record.fields[field[0]])values[field[0]]=record.fields[field[0]];}}
      const now=new Date().toISOString();let target=record&&data().records.find(r=>r.id===record.id);
      if(target){target.title=values.title.trim();target.date=values.date;target.status=values.status;target.fields=values;target.updatedAt=now;log('Изменена запись',target);}
      else{target={id:uid(),module:id,title:values.title.trim(),date:values.date,status:values.status,fields:values,createdAt:now,updatedAt:now,archived:false};if(id==='numbering'){const y=(values.date||today()).slice(0,4);const n=data().records.filter(r=>r.module==='numbering'&&!r.archived&&String(r.date).startsWith(y)).length+1;target.number=String(n).padStart(3,'0')+'/'+y;}data().records.unshift(target);log('Создана запись',target);}
      delete data().drafts[id];persist();editingId='';list(id);
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
      while(out.length>340000&&quality>.35){quality-=.08;out=canvas.toDataURL('image/jpeg',quality);}
      if(out.length>340000)throw new Error('Не удалось уменьшить фотографию до допустимого размера.');
      return out;
    }finally{URL.revokeObjectURL(url);}
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
    const samples=role==='zam'?[['Обычный доклад','Докладываю: пост ____. Время ____. Обстановка ____. Замечания ____. Принятые меры ____.'],['Срочный доклад','СРОЧНО. Время ____. Место ____. Событие ____. Участники ____. Принятые меры ____. Требуется помощь: ____.'],['Передача смены','За смену выполнено: ____. Остаётся: ____. Замечания: ____. Следующей смене: ____.']]:[['Служебная записка','Кому: ____\\nОт кого: ____\\nТема: ____\\nСодержание: ____\\nДата: ____'],['Акт проверки','АКТ ПРОВЕРКИ\\nДата и место: ____\\nКомиссия: ____\\nПроверено: ____\\nВыявлено: ____\\nРешение: ____'],['Сопроводительное письмо','Направляется для рассмотрения: ____\\nПриложение: ____\\nОтветственный: ____']];
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
    const rows=data().records.filter(r=>!r.archived&&(r.fields.deadline||r.fields.due)).sort((a,b)=>String(a.fields.deadline||a.fields.due).localeCompare(String(b.fields.deadline||b.fields.due)));
    shell('<div class="ops-panel"><h2>Календарь сроков</h2>'+rows.map(r=>'<article class="ops-record"><small>'+dateText(r.fields.deadline||r.fields.due)+'</small><h3>'+esc(r.title)+'</h3><p>'+esc(r.status)+' · '+esc(r.fields.responsible||r.fields.recipient||'Ответственный не указан')+'</p></article>').join('')+'</div>');
  }
  function audit(){
    const rows=data().audit;
    shell('<div class="ops-panel"><h2>История операций рабочего центра</h2>'+(rows.map(r=>'<div class="ops-history-row"><span>'+esc(new Date(r.at).toLocaleString())+'</span><b>'+esc(r.action)+'</b><span>'+esc(r.title)+'</span></div>').join('')||'<p>Операций пока нет.</p>')+'</div>');
  }
  function render(){if(!active)return;home();}
  function goHome(){active=false;currentModule='';drawOriginal();mountNav();}
  function bindGlobal(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-ops]');if(!b)return;
      const action=b.dataset.ops,id=b.dataset.id;
      if(action==='home'){home();return;}
      if(action==='module'){filterText='';filterStatus='Все записи';list(id);return;}
      if(action==='new'){form(currentModule||'numbering',null);return;}
      if(action==='edit'){const r=data().records.find(x=>x.id===id);if(r)form(r.module,r);return;}
      if(action==='cancel'){delete data().drafts[currentModule];list(currentModule);return;}
      if(action==='archive'){const r=data().records.find(x=>x.id===id);if(r){r.archived=true;r.updatedAt=new Date().toISOString();log('Перемещена в архив',r);persist();list(r.module);}return;}
      if(action==='status'){const r=data().records.find(x=>x.id===id);if(r){const next=prompt('Новый статус: Новая, В работе, На проверке, Выполнено или Закрыто',r.status);if(next&&['Новая','В работе','На проверке','Выполнено','Закрыто','Исполнено','В архиве'].includes(next)){r.status=next;r.updatedAt=new Date().toISOString();log('Изменён статус',r);persist();list(r.module);}}return;}
      if(action==='search'){const q=$('#ops-global-search')?.value||'';filterText=q;const found=data().records.filter(r=>recordText(r).includes(q.toLowerCase())||String(r.number||'').toLowerCase().includes(q.toLowerCase()));shell('<div class="ops-panel"><h2>Результаты поиска</h2><p>Найдено: '+found.length+'</p>'+found.map(r=>card(r,moduleById(r.module)||{fields:[]})).join('')+'</div>');return;}
      if(action==='report-refresh'){reportFrom=$('#ops-from').value;reportTo=$('#ops-to').value;reports();return;}
      if(action==='print'||action==='print-summary'){window.print();return;}
      if(action==='copy-template'){const v=$('#ops-tpl-'+id)?.value||'';if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(v).then(()=>alert('Текст скопирован')).catch(()=>alert(v));else alert(v);return;}
    });
    document.addEventListener('input',e=>{
      if(e.target.id==='ops-filter'){filterText=e.target.value;const p=e.target.selectionStart;list(currentModule);const n=$('#ops-filter');if(n){n.focus();n.setSelectionRange(p,p);}}
      if(e.target.id==='ops-archive-search'){const q=e.target.value;const target=$('#ops-archive-results');if(target)target.innerHTML=archiveRows(data().records.filter(r=>r.archived||r.module==='incoming'||r.module==='numbering'||r.module==='movement'),q);}
    });
    document.addEventListener('change',e=>{if(e.target.id==='ops-status'){filterStatus=e.target.value;list(currentModule);}});
  }
  const style=document.createElement('style');
  style.textContent='.ops-shell{max-width:1100px;margin:0 auto;padding:8px 0 36px;color:var(--tx,#172536)}.ops-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:18px}.ops-top h1{margin:4px 0;font-size:clamp(22px,3vw,30px)}.ops-top p,.ops-muted{color:var(--mu,#718096);font-size:13px}.ops-eyebrow{font-size:10px;letter-spacing:1.4px;color:var(--mu)}.ops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:12px}.ops-card,.ops-panel,.ops-record{background:var(--card,#fff);border:1px solid var(--bd,#dbe3ec);border-radius:13px;padding:15px;color:var(--tx,#172536)}.ops-card{display:grid;gap:8px;text-align:left;cursor:pointer;min-height:130px}.ops-card b{font-size:15px}.ops-card span,.ops-card small{color:var(--mu,#718096);font-size:12px}.ops-card-icon{font-size:20px}.ops-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;margin:14px 0}.ops-stats>div{padding:14px;border:1px solid var(--bd,#dbe3ec);border-radius:12px;background:var(--card,#fff);display:grid;gap:4px}.ops-stats b{font-size:24px}.ops-stats span{font-size:12px;color:var(--mu)}.ops-alert,.ops-good{padding:13px;border-radius:10px;margin:12px 0;display:grid;gap:4px;background:var(--warn-bg,#fff7e6);border:1px solid var(--bd)}.ops-good{background:var(--card)}.ops-toolbar,.ops-search,.ops-form-actions,.ops-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}.ops-toolbar input{flex:1;min-width:150px}.ops-primary,.ops-secondary,.ops-actions button{border:1px solid var(--bd,#ccd5e0);border-radius:9px;padding:10px 13px;cursor:pointer;background:var(--card,#fff);color:var(--tx,#172536);font:inherit}.ops-primary{background:#176b65;color:white;border-color:#176b65}.ops-record{margin:10px 0}.ops-record h3{margin:5px 0 10px;font-size:16px}.ops-record small,.ops-record div{font-size:12px;color:var(--mu)}.ops-record div{margin:4px 0}.ops-record div span{font-weight:600}.ops-record-head{display:flex;justify-content:space-between;gap:10px}.ops-status{font-size:11px;padding:5px 8px;border-radius:20px;background:var(--bg,#eef2f7);white-space:nowrap;height:max-content}.ops-empty{padding:28px;text-align:center;color:var(--mu);border:1px dashed var(--bd);border-radius:12px}.ops-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.ops-field label{display:grid;gap:6px;font-size:13px;font-weight:600}.ops-field input,.ops-field textarea,.ops-field select,.ops-toolbar input,.ops-toolbar select,.ops-search input,.ops-panel>input,.ops-template{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--bd,#ccd5e0);border-radius:8px;background:var(--card,#fff);color:var(--tx,#172536);font:inherit}.ops-field small{font-weight:400;color:var(--mu)}.ops-photo{display:block;max-width:220px;max-height:180px;object-fit:contain;margin-top:8px;border-radius:8px}.ops-table{width:100%;border-collapse:collapse;margin:14px 0}.ops-table th,.ops-table td{text-align:left;padding:9px;border-bottom:1px solid var(--bd);font-size:13px}.ops-history-row{display:grid;grid-template-columns:minmax(145px,1fr) minmax(110px,.7fr) 2fr;gap:8px;padding:9px 0;border-bottom:1px solid var(--bd);font-size:12px}.ops-history-row span:first-child{color:var(--mu)}@media(max-width:560px){.ops-shell{padding:4px 0 24px}.ops-top{display:block}.ops-history-row{grid-template-columns:1fr 1fr}.ops-history-row span:last-child{grid-column:1/-1}.ops-toolbar>*{max-width:100%}.ops-record-head{display:block}}@media print{#nv,#bn,#hd,#patrul-cloud-status,#ops-hub-btn,.ops-top button,.ops-toolbar,.ops-actions,.ops-form-actions{display:none!important}.ops-shell{max-width:none}.ops-record,.ops-panel{break-inside:avoid;border:0}}';
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