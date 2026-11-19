(() => {
  'use strict';
  const role = window.PATRUL_ROLE;
  if (!['nachalnik','dokumentoved','uchet'].includes(role)) return;

  const state = {
    items: [], settings: {violationTypes:['Форма одежды','Внешний вид','Опоздание','Пропуск занятий','Курение / никотин','Алкоголь','Пропускной режим','Нарушение порядка','Другое'],repeatThreshold:2,deviantsResetAt:null,departments:{}}, version: 0, updatedAt: null, busy: false, loaded: false, error: '',
    view: 'list', q: '', group: '', type: '', from: '', to: '', page: 1, pageSize: 50,
    sort: 'date', direction: 'desc', trash: false, auditView: false, selected: new Set(),
    audit: [], auditBusy: false, auditError: '', maintenance: null, maintenanceBusy: false, importPreview: null
  };
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  const keyText = value => String(value || '').normalize('NFKC').replace(/ё/gi,'е').trim().toLocaleLowerCase('ru-RU');
  const today = () => {
    const d = new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  };
  const dateText = value => {
    const s = String(value || '').slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4) : '—';
  };
  const formatDateTime = value => value ? new Date(value).toLocaleString('ru-RU') : '—';
  const types = () => Array.isArray(window.PATRUL_VIOLATION_TYPES) && window.PATRUL_VIOLATION_TYPES.length
    ? window.PATRUL_VIOLATION_TYPES
    : (typeof VT !== 'undefined' && Array.isArray(VT) ? VT : [
      'Форма одежды','Внешний вид','Опоздание','Пропуск занятий','Курение / никотин',
      'Алкоголь','Пропускной режим','Нарушение порядка','Другое'
    ]);
  const actorLabel = role === 'nachalnik' ? 'Начальник' : role === 'dokumentoved' ? 'Документовед' : 'Старший мастер';
  const api = async (path, method='GET', body=null) => {
    if (typeof window.PATRUL_API_REQUEST !== 'function') throw new Error('Служба авторизации ещё не готова');
    return window.PATRUL_API_REQUEST(path, method, body);
  };
  const activeItems = () => state.items.filter(item => !item.deletedAt);
  function applyChiefCache() {
    if (role !== 'nachalnik' || typeof D === 'undefined') return;
    // D.viol remains a read-only compatibility cache for the commander's
    // existing dashboards and printable reports; the shared API is canonical.
    D.viol = activeItems().map(item => ({
      k:item.k,fio:item.fio,grp:item.grp,type:item.type,d:item.d,t:item.t,
      post:item.post,by:item.by,meas:item.meas,note:item.note,rep:!!item.rep
    }));
  }
  function showNotice(message, isError=false) {
    const host = $('#vreg-notice');
    if (host) {
      host.textContent = message;
      host.className = 'vreg-notice' + (isError ? ' is-error' : '');
    }
  }
  async function loadRegistry({silent=false}={}) {
    const previousVersion=state.version;
    try {
      const result = await api('/api/violations');
      if (!result.response.ok) throw new Error(result.result.error || 'Не удалось загрузить реестр');
      state.items = Array.isArray(result.result.items) ? result.result.items : [];
      if(result.result.settings&&typeof result.result.settings==='object')state.settings=result.result.settings;
      state.version = Number(result.result.version || 0);
      state.updatedAt = result.result.updatedAt || null;
      state.loaded = true;
      state.error = '';
      applyChiefCache();
      if (!silent && tab === 'vl') renderPage();
      else if (silent && state.version!==previousVersion) {
        if (tab === 'vl') renderPage();
        else if (role==='nachalnik' && tab==='ov' && typeof draw==='function') draw(true);
      }
      return true;
    } catch (error) {
      state.error = error.message || 'Ошибка загрузки реестра';
      if (!silent && tab === 'vl') renderPage();
      return false;
    }
  }
  async function saveRegistry(nextItems, successText='Изменения сохранены') {
    if (state.busy) return false;
    const previous = state.items;
    state.busy = true;
    showNotice('Сохранение реестра…');
    try {
      const result = await api('/api/violations','PUT',{expectedVersion:state.version,items:nextItems});
      if (result.response.status === 409) {
        state.items = Array.isArray(result.result.items) ? result.result.items : state.items;
        state.version = Number(result.result.version || state.version);
        state.updatedAt = result.result.updatedAt || state.updatedAt;
        applyChiefCache();
        showNotice('Реестр одновременно изменил другой сотрудник. Загружена актуальная версия; повторите своё действие.',true);
        renderPage();
        return false;
      }
      if (!result.response.ok) throw new Error(result.result.error || 'Не удалось сохранить реестр');
      state.items = Array.isArray(result.result.items) ? result.result.items : nextItems;
      if(result.result.settings&&typeof result.result.settings==='object')state.settings=result.result.settings;
      state.version = Number(result.result.version || state.version);
      state.updatedAt = result.result.updatedAt || state.updatedAt;
      applyChiefCache();
      showNotice(successText);
      renderPage();
      return true;
    } catch (error) {
      state.items = previous;
      applyChiefCache();
      showNotice(error.message || 'Ошибка сохранения',true);
      renderPage();
      return false;
    } finally {
      state.busy = false;
    }
  }
  function repeatCounts(items) {
    const counts = new Map();
    items.forEach(item => {
      const key = keyText(item.fio);
      counts.set(key,(counts.get(key)||0)+1);
    });
    return counts;
  }
  function filteredItems() {
    const q=keyText(state.q), group=keyText(state.group);
    const list=state.items.filter(item=>{
      if (!!item.deletedAt !== state.trash) return false;
      if (state.type && item.type !== state.type) return false;
      if (group && !keyText(item.grp).includes(group)) return false;
      if (state.from && String(item.d||'') < state.from) return false;
      if (state.to && String(item.d||'') > state.to) return false;
      if (q) {
        const haystack=[item.fio,item.grp,item.type,item.post,item.by,item.meas,item.note].join(' ');
        if (!keyText(haystack).includes(q)) return false;
      }
      return true;
    });
    const sortKeys={date:item=>(item.d||'')+' '+(item.t||''),fio:item=>keyText(item.fio),group:item=>keyText(item.grp),type:item=>keyText(item.type)};
    const getter=sortKeys[state.sort]||sortKeys.date;
    return list.sort((a,b)=>{
      const av=getter(a),bv=getter(b);
      return (av<bv?-1:av>bv?1:0)*(state.direction==='asc'?1:-1);
    });
  }
  function pageRows() {
    const list=filteredItems(), pages=Math.max(1,Math.ceil(list.length/state.pageSize));
    state.page=Math.max(1,Math.min(state.page,pages));
    const start=(state.page-1)*state.pageSize;
    return {list,rows:list.slice(start,start+state.pageSize),pages,start,total:list.length};
  }
  function kpi(items) {
    const t=today(), monday=new Date(t+'T12:00:00'); monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
    const week=monday.getFullYear()+'-'+String(monday.getMonth()+1).padStart(2,'0')+'-'+String(monday.getDate()).padStart(2,'0');
    const active=items.filter(x=>!x.deletedAt), repeats=repeatCounts(active);
    return {
      total:active.length,
      today:active.filter(x=>x.d===t).length,
      week:active.filter(x=>x.d>=week).length,
      repeat:[...repeats.values()].filter(n=>n>1).length,
      unreported:active.filter(x=>!x.rep).length,
      trash:items.filter(x=>!!x.deletedAt).length
    };
  }
  function sortButton(key,label) {
    const active=state.sort===key, arrow=active?(state.direction==='asc'?' ↑':' ↓'):'';
    return '<button type="button" class="vreg-sort" data-vreg-action="sort" data-key="'+key+'">'+label+arrow+'</button>';
  }
  function rowHtml(item, counts) {
    const repeated=(counts.get(keyText(item.fio))||0)>1;
    const disabled=state.busy?'disabled':'';
    return '<tr>'+
      '<td><input type="checkbox" data-vreg-select="'+esc(item.k)+'" '+(state.selected.has(item.k)?'checked':'')+' '+disabled+'></td>'+
      '<td><b>'+dateText(item.d)+'</b><div class="vreg-muted">'+esc(item.t||'Время не указано')+'</div></td>'+
      '<td><button class="vreg-person" type="button" data-vreg-action="dossier" data-key="'+esc(item.k)+'">'+esc(item.fio)+'</button>'+(repeated?' <span class="vreg-tag warn">повторно</span>':'')+'<div class="vreg-muted">'+esc(item.grp)+'</div></td>'+
      '<td>'+esc(item.type)+'<div class="vreg-muted">'+esc(item.post||'Место не указано')+'</div></td>'+
      '<td>'+esc(item.meas||'—')+(item.note?'<div class="vreg-muted">'+esc(item.note)+'</div>':'')+'</td>'+
      '<td>'+esc(item.by||'—')+'<div class="vreg-muted">'+(item.rep?'<span class="vreg-tag good">Доведено</span>':'<span class="vreg-tag warn">Не доложено</span>')+'</div></td>'+
      '<td class="vreg-actions">'+(state.trash
        ? '<button class="vreg-button secondary" data-vreg-action="restore" data-key="'+esc(item.k)+'" '+disabled+'>Восстановить</button>'
        : '<button class="vreg-button secondary" data-vreg-action="edit" data-key="'+esc(item.k)+'" '+disabled+'>Изменить</button><button class="vreg-button danger" data-vreg-action="archive" data-key="'+esc(item.k)+'" '+disabled+'>В корзину</button>')+
      '</td></tr>';
  }
  function baseStyles() {
    return '<style id="vreg-styles">'+
      '.vreg-wrap{display:grid;gap:14px;max-width:1500px}.vreg-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.vreg-head h1{margin:0;font-size:24px}.vreg-sub,.vreg-muted{color:var(--mu);font-size:12px}.vreg-sub{margin:4px 0 0}.vreg-stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.vreg-stat{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:13px;min-width:0}.vreg-stat b{display:block;font-size:23px;line-height:1.2}.vreg-stat span{font-size:12px;color:var(--mu)}.vreg-panel{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:14px;min-width:0}.vreg-tools{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.vreg-field{display:grid;gap:4px;min-width:135px;flex:1}.vreg-field label{color:var(--mu);font-size:12px;font-weight:650}.vreg-field input,.vreg-field select{width:100%;min-width:0}.vreg-button{border:1px solid var(--ac);background:var(--ac);color:#fff;border-radius:8px;padding:9px 12px;font:600 13px system-ui;cursor:pointer;min-height:38px}.vreg-button.secondary{background:transparent;color:var(--tx);border-color:var(--bd)}.vreg-button.danger{background:transparent;color:var(--red);border-color:var(--bd)}.vreg-button:disabled{opacity:.5;cursor:not-allowed}.vreg-notice{font-size:12px;color:var(--gr);min-height:17px}.vreg-notice.is-error{color:var(--red)}.vreg-tabs{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.vreg-tab{padding:7px 12px;border-radius:20px;border:1px solid var(--bd);background:transparent;color:var(--tx);font:600 13px system-ui;cursor:pointer}.vreg-tab.active{background:var(--ac);border-color:var(--ac);color:#fff}.vreg-tag{display:inline-block;padding:2px 7px;border-radius:20px;font-size:11px;font-weight:650}.vreg-tag.warn{background:var(--yls);color:var(--yl)}.vreg-tag.good{background:var(--grs);color:var(--gr)}.vreg-person{border:0;background:none;color:var(--ac);padding:0;font:650 13px system-ui;cursor:pointer;text-align:left}.vreg-table-wrap{overflow:auto;border:1px solid var(--bd);border-radius:10px}.vreg-table{border-collapse:collapse;width:100%;min-width:1020px;font-size:13px}.vreg-table th{position:sticky;top:0;background:var(--card);color:var(--mu);text-align:left;border-bottom:1px solid var(--bd);padding:10px;white-space:nowrap}.vreg-table td{border-bottom:1px solid var(--bd);padding:9px 10px;vertical-align:top}.vreg-sort{border:0;background:none;color:inherit;font:inherit;font-weight:700;cursor:pointer;padding:0}.vreg-actions{display:flex;gap:6px;flex-wrap:wrap}.vreg-pagination{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.vreg-empty{padding:24px;text-align:center;color:var(--mu)}.vreg-modal-backdrop{position:fixed;inset:0;z-index:10020;background:#08101dcc;display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:4vh 12px}.vreg-modal{background:var(--card);color:var(--tx);width:min(720px,100%);max-height:92vh;overflow:auto;border:1px solid var(--bd);border-radius:14px;padding:18px;box-shadow:0 20px 60px #0005}.vreg-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vreg-form .wide{grid-column:1/-1}.vreg-form label{display:grid;gap:4px;font-size:12px;color:var(--mu);font-weight:650}.vreg-form input,.vreg-form select,.vreg-form textarea{width:100%;font:inherit;color:var(--tx);background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:9px}.vreg-form .check{display:flex;align-items:center;gap:8px}.vreg-form .check input{width:auto}.vreg-modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.vreg-dossier-row{padding:10px 0;border-bottom:1px solid var(--bd)}.vreg-dossier-row:last-child{border:0}@media(max-width:850px){.vreg-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:560px){.vreg-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.vreg-form{grid-template-columns:1fr}.vreg-form .wide{grid-column:auto}.vreg-head h1{font-size:21px}}'+
      '</style>';
  }
  function listPage() {
    const counts=kpi(state.items), {list,rows,pages,start,total}=pageRows();
    const repeat=repeatCounts(activeItems());
    const opts=types().map(item=>'<option value="'+esc(item)+'" '+(state.type===item?'selected':'')+'>'+esc(item)+'</option>').join('');
    const groupOptions=[...new Set(activeItems().map(item=>item.grp).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    return baseStyles()+'<section class="vreg-wrap">'+
      '<header class="vreg-head"><div><h1>НАРУШИТЕЛИ</h1><p class="vreg-sub">Единый реестр колледжа · серверное хранение · записи доступны начальнику и документоведу</p></div>'+
      '<div class="vreg-tools"><button class="vreg-button" data-vreg-action="new" '+(state.busy?'disabled':'')+'>＋ Добавить нарушение</button><button class="vreg-button secondary" data-vreg-action="view-deviants">Девианты</button><button class="vreg-button secondary" data-vreg-action="view-report">Отчёт</button><button class="vreg-button secondary" data-vreg-action="view-settings">Настройки</button><button class="vreg-button secondary" data-vreg-action="export">Экспорт CSV</button><button class="vreg-button secondary" data-vreg-action="import-open">Импорт CSV</button></div></header>'+
      '<div class="vreg-stats">'+
      '<div class="vreg-stat"><b>'+counts.total+'</b><span>Всего действующих записей</span></div>'+
      '<div class="vreg-stat"><b>'+counts.today+'</b><span>За сегодня</span></div>'+
      '<div class="vreg-stat"><b>'+counts.week+'</b><span>За эту неделю</span></div>'+
      '<div class="vreg-stat"><b>'+counts.repeat+'</b><span>С повторными записями</span></div>'+
      '<div class="vreg-stat"><b>'+counts.unreported+'</b><span>Не доведено до куратора</span></div>'+
      '<div class="vreg-stat"><b>'+counts.trash+'</b><span>В корзине</span></div></div>'+
      '<div class="vreg-panel"><div class="vreg-tabs"><button class="vreg-tab '+(!state.trash?'active':'')+'" data-vreg-action="view-active">Действующие ('+counts.total+')</button><button class="vreg-tab '+(state.trash?'active':'')+'" data-vreg-action="view-trash">Корзина ('+counts.trash+')</button><button class="vreg-tab '+(state.auditView?'active':'')+'" data-vreg-action="audit">Журнал изменений</button><span class="vreg-muted">Корзина хранится 30 дней, затем очищается старшим мастером</span></div>'+
      '<div class="vreg-tools" style="margin-top:12px">'+
      '<div class="vreg-field" style="min-width:220px"><label>Поиск по ФИО, группе, описанию</label><input id="vreg-q" value="'+esc(state.q)+'" placeholder="Введите ФИО или ключевые слова"></div>'+
      '<div class="vreg-field"><label>Группа</label><input id="vreg-group" value="'+esc(state.group)+'" list="vreg-groups" placeholder="Все группы"><datalist id="vreg-groups">'+groupOptions.map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist></div>'+
      '<div class="vreg-field"><label>Вид нарушения</label><select id="vreg-type"><option value="">Все виды</option>'+opts+'</select></div>'+
      '<div class="vreg-field"><label>Дата с</label><input id="vreg-from" type="date" value="'+esc(state.from)+'"></div>'+
      '<div class="vreg-field"><label>Дата по</label><input id="vreg-to" type="date" value="'+esc(state.to)+'"></div>'+
      '<button class="vreg-button secondary" data-vreg-action="clear-filters">Сбросить</button></div></div>'+
      '<div class="vreg-panel"><div class="vreg-tools" style="justify-content:space-between;margin-bottom:10px"><label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" data-vreg-action="select-page" '+(rows.length&&rows.every(x=>state.selected.has(x.k))?'checked':'')+'> Выбрать страницу</label>'+
      '<div class="vreg-tools"><span class="vreg-muted">Выбрано: '+state.selected.size+'</span>'+(state.selected.size?'<button class="vreg-button secondary" data-vreg-action="export-selected">Экспорт выбранных</button>'+(!state.trash?'<button class="vreg-button danger" data-vreg-action="archive-selected">В корзину выбранные</button>':''):'')+'</div></div>'+
      '<div class="vreg-table-wrap"><table class="vreg-table"><thead><tr><th></th><th>'+sortButton('date','Дата / время')+'</th><th>'+sortButton('fio','Обучающийся / группа')+'</th><th>'+sortButton('type','Нарушение / место')+'</th><th>Меры и примечание</th><th>Выявил / доклад</th><th>Действия</th></tr></thead><tbody>'+
      (rows.length?rows.map(item=>rowHtml(item,repeat)).join(''):'<tr><td colspan="7" class="vreg-empty">'+(state.trash?'Корзина пуста':'По выбранным условиям записей нет')+'</td></tr>')+
      '</tbody></table></div><div class="vreg-pagination" style="margin-top:12px"><span class="vreg-muted">Показано '+(total?start+1:0)+'–'+Math.min(start+state.pageSize,total)+' из '+total+'</span><div class="vreg-tools"><label class="vreg-muted">Строк на странице <select id="vreg-pagesize"><option '+(state.pageSize===25?'selected':'')+'>25</option><option '+(state.pageSize===50?'selected':'')+'>50</option><option '+(state.pageSize===100?'selected':'')+'>100</option></select></label><button class="vreg-button secondary" data-vreg-action="page-prev" '+(state.page<=1?'disabled':'')+'>Назад</button><span class="vreg-muted">Страница '+state.page+' / '+pages+'</span><button class="vreg-button secondary" data-vreg-action="page-next" '+(state.page>=pages?'disabled':'')+'>Далее</button></div></div></div>'+
      '<div id="vreg-notice" class="vreg-notice">'+esc(state.error||('Последнее сохранение: '+formatDateTime(state.updatedAt)))+'</div>'+
      '</section>';
  }
  function maintenancePage() {
    const m=state.maintenance;
    return baseStyles()+'<section class="vreg-wrap"><header class="vreg-head"><div><h1>НАРУШИТЕЛИ · ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ</h1><p class="vreg-sub">Режим старшего мастера. Содержимое персональных записей недоступно.</p></div><button class="vreg-button secondary" data-vreg-action="maintenance-refresh" '+(state.maintenanceBusy?'disabled':'')+'>Проверить состояние</button></header>'+
      (m?'<div class="vreg-stats">'+
        '<div class="vreg-stat"><b>'+m.total+'</b><span>Активных записей</span></div>'+
        '<div class="vreg-stat"><b>'+m.inTrash+'</b><span>В корзине</span></div>'+
        '<div class="vreg-stat"><b>'+m.missingRequired+'</b><span>Записей с неполными полями</span></div>'+
        '<div class="vreg-stat"><b>'+m.duplicateGroups+'</b><span>Групп возможных дублей</span></div>'+
        '<div class="vreg-stat"><b>'+m.version+'</b><span>Версия реестра</span></div>'+
        '<div class="vreg-stat"><b>'+m.trashRetentionDays+' дн.</b><span>Срок хранения корзины</span></div>'+
        '<div class="vreg-stat"><b>'+m.duplicateCandidates+'</b><span>Возможных повторов за 3 дня</span></div>'+
        '<div class="vreg-stat"><b>'+m.nameVariants+'</b><span>Вариантов написания ФИО</span></div>'+
        '<div class="vreg-stat"><b>'+m.missingGroup+'</b><span>Записей без группы</span></div>'+
        '<div class="vreg-stat"><b>'+m.olderThanYear+'</b><span>Записей старше года</span></div>'+
        '<div class="vreg-stat"><b>'+m.repeatNames+'</b><span>Обучающихся с повторениями</span></div></div>'+
        '<div class="vreg-panel"><h3 style="margin:0 0 8px">Состояние сервиса</h3><p><span class="vreg-tag good">База данных доступна</span> <span class="vreg-tag good">Расшифровка успешно проверена</span></p><p class="vreg-muted">Последнее изменение реестра: '+formatDateTime(m.updatedAt)+'. Сводка содержит только агрегированные технические показатели. ФИО студентов, группы и описания нарушений старшему мастеру не показываются.</p><div class="vreg-tools"><button class="vreg-button secondary" data-vreg-action="maintenance-backup" '+(state.maintenanceBusy?'disabled':'')+'>Скачать зашифрованную резервную копию</button><button class="vreg-button secondary" data-vreg-action="maintenance-restore-open" '+(state.maintenanceBusy?'disabled':'')+'>Восстановить из копии</button><button class="vreg-button danger" data-vreg-action="maintenance-purge" '+(state.maintenanceBusy||!m.inTrash?'disabled':'')+'>Удалить записи из корзины старше 30 дней</button></div><input id="vreg-backup-file" type="file" accept=".json,application/json" hidden></div>'
        :'<div class="vreg-panel"><p class="vreg-muted">'+esc(state.error||'Нажмите «Проверить состояние», чтобы получить техническую сводку.')+'</p></div>')+
      '<div id="vreg-notice" class="vreg-notice">'+esc(state.error)+'</div></section>';
  }

  async function getAudit() {
    state.auditBusy=true;state.auditError='';
    renderPage();
    try{
      const result=await api('/api/violations/audit');
      if(!result.response.ok)throw new Error(result.result.error||'Не удалось загрузить журнал действий');
      state.audit=Array.isArray(result.result.items)?result.result.items:[];
    }catch(error){state.auditError=error.message||'Ошибка загрузки журнала';}
    finally{state.auditBusy=false;if(tab==='vl'&&state.auditView)renderPage();}
  }
  function auditPage() {
    const actionLabel=type=>type==='violation_registry_updated'?'Изменение записей реестра':type==='violation_registry_trash_purged'?'Очистка корзины':type;
    return baseStyles()+'<section class="vreg-wrap"><header class="vreg-head"><div><h1>ЖУРНАЛ ДЕЙСТВИЙ РЕЕСТРА</h1><p class="vreg-sub">Последние 200 операций изменения и технического обслуживания</p></div><div class="vreg-tools"><button class="vreg-button secondary" data-vreg-action="audit-refresh" '+(state.auditBusy?'disabled':'')+'>Обновить журнал</button><button class="vreg-button secondary" data-vreg-action="view-active">К реестру</button></div></header>'+
      '<div class="vreg-panel"><div class="vreg-table-wrap"><table class="vreg-table" style="min-width:650px"><thead><tr><th>Дата и время</th><th>Сотрудник</th><th>Действие</th><th>Сведения</th></tr></thead><tbody>'+
      (state.auditBusy?'<tr><td colspan="4" class="vreg-empty">Загрузка журнала…</td></tr>':state.auditError?'<tr><td colspan="4" class="vreg-empty">'+esc(state.auditError)+'</td></tr>':state.audit.length?state.audit.map(item=>'<tr><td>'+formatDateTime(item.createdAt)+'</td><td>'+esc(item.actor)+'</td><td>'+esc(actionLabel(item.eventType))+'</td><td>'+(
        item.eventType==='violation_registry_updated'?'Записей в реестре после изменения: '+Number(item.details&&item.details.recordCount||0):
        item.eventType==='violation_registry_trash_purged'?'Удалено записей из корзины: '+Number(item.details&&item.details.purged||0):'Операция зарегистрирована'
      )+'</td></tr>').join(''):'<tr><td colspan="4" class="vreg-empty">Операций пока нет</td></tr>')+
      '</tbody></table></div><p class="vreg-muted">Содержимое записей студентов в журнале действий не дублируется.</p></div></section>';
  }

  function repeatAnalysis() {
    const reset=state.settings.deviantsResetAt||null,threshold=Number(state.settings.repeatThreshold)||2;
    const groups=new Map();
    activeItems().forEach(item=>{
      if(reset&&item.d<reset)return;
      const key=keyText(item.fio);
      if(!key)return;
      if(!groups.has(key))groups.set(key,{name:item.fio,records:[],groups:new Set(),types:new Map(),last:''});
      const entry=groups.get(key);
      entry.records.push(item);if(item.grp)entry.groups.add(item.grp);
      entry.types.set(item.type,(entry.types.get(item.type)||0)+1);
      if(item.d+' '+(item.t||'')>entry.last)entry.last=item.d+' '+(item.t||'');
    });
    return [...groups.values()].filter(entry=>entry.records.length>=threshold).map(entry=>({
      ...entry,count:entry.records.length,last:entry.last.slice(0,10),
      topType:[...entry.types.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||''
    })).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ru'));
  }
  function deviantsPage() {
    const entries=repeatAnalysis();
    return baseStyles()+'<section class="vreg-wrap"><header class="vreg-head"><div><h1>ПОВТОРНЫЕ НАРУШЕНИЯ</h1><p class="vreg-sub">Порог: '+Number(state.settings.repeatThreshold||2)+' записей · '+(state.settings.deviantsResetAt?'учёт с '+dateText(state.settings.deviantsResetAt):'весь период')+'</p></div><div class="vreg-tools"><button class="vreg-button secondary" data-vreg-action="view-active">К реестру</button><button class="vreg-button secondary" data-vreg-action="view-report">Отчёт</button></div></header>'+
      '<div class="vreg-stats"><div class="vreg-stat"><b>'+entries.length+'</b><span>Студентов с повторениями</span></div><div class="vreg-stat"><b>'+entries.reduce((n,x)=>n+x.count,0)+'</b><span>Записей у повторных нарушителей</span></div><div class="vreg-stat"><b>'+Number(state.settings.repeatThreshold||2)+'</b><span>Порог повторения</span></div><div class="vreg-stat"><b>'+(state.settings.deviantsResetAt?dateText(state.settings.deviantsResetAt):'Весь период')+'</b><span>Начало текущего учёта</span></div></div>'+
      '<div class="vreg-panel"><div class="vreg-table-wrap"><table class="vreg-table" style="min-width:750px"><thead><tr><th>Обучающийся</th><th>Группы</th><th>Нарушений</th><th>Чаще всего</th><th>Последнее</th><th></th></tr></thead><tbody>'+
      (entries.length?entries.map(entry=>'<tr><td><b>'+esc(entry.name)+'</b></td><td>'+esc([...entry.groups].join(', ')||'—')+'</td><td><span class="vreg-tag warn">'+entry.count+'</span></td><td>'+esc(entry.topType)+'</td><td>'+dateText(entry.last)+'</td><td><button class="vreg-button secondary" data-vreg-action="dossier" data-key="'+esc(entry.records[0].k)+'">Досье</button></td></tr>').join(''):'<tr><td colspan="6" class="vreg-empty">Повторных нарушений по установленному порогу нет</td></tr>')+
      '</tbody></table></div></div></section>';
  }
  function reportPage() {
    const from=state.reportFrom||today().slice(0,7)+'-01',to=state.reportTo||today(),group=keyText(state.reportGroup||'');
    const list=activeItems().filter(item=>item.d>=from&&item.d<=to&&(!group||keyText(item.grp).includes(group)));
    const byType=new Map(),byGroup=new Map(),byStudent=new Map();
    list.forEach(item=>{
      byType.set(item.type,(byType.get(item.type)||0)+1);
      if(item.grp)byGroup.set(item.grp,(byGroup.get(item.grp)||0)+1);
      byStudent.set(keyText(item.fio),(byStudent.get(keyText(item.fio))||0)+1);
    });
    const typeRows=[...byType].sort((a,b)=>b[1]-a[1]),groupRows=[...byGroup].sort((a,b)=>b[1]-a[1]).slice(0,10);
    const repeats=[...byStudent.values()].filter(count=>count>1).length;
    return baseStyles()+'<section class="vreg-wrap"><header class="vreg-head"><div><h1>АНАЛИТИЧЕСКИЙ ОТЧЁТ</h1><p class="vreg-sub">Сводка по реестру за выбранный период и группе</p></div><div class="vreg-tools"><button class="vreg-button secondary" data-vreg-action="view-active">К реестру</button><button class="vreg-button secondary" data-vreg-action="report-print">Печать отчёта</button><button class="vreg-button" data-vreg-action="report-export">Экспорт CSV</button></div></header>'+
      '<div class="vreg-panel"><div class="vreg-tools"><div class="vreg-field"><label>Начало периода</label><input type="date" id="vreg-report-from" value="'+esc(from)+'"></div><div class="vreg-field"><label>Конец периода</label><input type="date" id="vreg-report-to" value="'+esc(to)+'"></div><div class="vreg-field"><label>Группа (поиск по началу / части)</label><input id="vreg-report-group" value="'+esc(state.reportGroup||'')+'" placeholder="Все группы"></div><button class="vreg-button secondary" data-vreg-action="report-apply">Сформировать</button></div></div>'+
      '<div class="vreg-stats"><div class="vreg-stat"><b>'+list.length+'</b><span>Нарушений за период</span></div><div class="vreg-stat"><b>'+byStudent.size+'</b><span>Студентов</span></div><div class="vreg-stat"><b>'+repeats+'</b><span>Студентов с 2+ записями</span></div><div class="vreg-stat"><b>'+groupRows.length+'</b><span>Групп в сводке</span></div></div>'+
      '<div class="vreg-panel"><h3 style="margin-top:0">По видам нарушений</h3><div class="vreg-table-wrap"><table class="vreg-table" style="min-width:420px"><thead><tr><th>Вид нарушения</th><th>Количество</th></tr></thead><tbody>'+(typeRows.length?typeRows.map(row=>'<tr><td>'+esc(row[0])+'</td><td>'+row[1]+'</td></tr>').join(''):'<tr><td colspan="2" class="vreg-empty">Нет данных</td></tr>')+'</tbody></table></div></div>'+
      '<div class="vreg-panel"><h3 style="margin-top:0">Топ групп</h3><div class="vreg-table-wrap"><table class="vreg-table" style="min-width:420px"><thead><tr><th>Группа</th><th>Количество</th></tr></thead><tbody>'+(groupRows.length?groupRows.map(row=>'<tr><td>'+esc(row[0])+'</td><td>'+row[1]+'</td></tr>').join(''):'<tr><td colspan="2" class="vreg-empty">Нет данных</td></tr>')+'</tbody></table></div></div>'+
      '<p class="vreg-muted">Период: '+dateText(from)+' — '+dateText(to)+'. Сформировано: '+formatDateTime(new Date().toISOString())+'</p></section>';
  }
  function settingsPage() {
    const config=state.settings,departments=Object.entries(config.departments||{});
    return baseStyles()+'<section class="vreg-wrap"><header class="vreg-head"><div><h1>НАСТРОЙКИ РЕЕСТРА</h1><p class="vreg-sub">Параметры классификации нарушений и учёта повторных случаев</p></div><button class="vreg-button secondary" data-vreg-action="view-active">К реестру</button></header>'+
      '<div class="vreg-panel"><h3 style="margin-top:0">Типы нарушений</h3><div class="vreg-tools">'+config.violationTypes.map(type=>'<span class="vreg-tag" style="border:1px solid var(--bd);padding:7px 9px">'+esc(type)+' <button data-vreg-action="type-remove" data-value="'+esc(type)+'" style="border:0;background:none;color:var(--red);cursor:pointer" aria-label="Удалить тип">×</button></span>').join('')+'</div><div class="vreg-tools" style="margin-top:12px"><div class="vreg-field"><label>Новый вид нарушения</label><input id="vreg-type-new" maxlength="120" placeholder="Например: Нарушение формы одежды"></div><button class="vreg-button secondary" data-vreg-action="type-add">Добавить тип</button></div></div>'+
      '<div class="vreg-panel"><h3 style="margin-top:0">Повторные нарушения</h3><div class="vreg-tools"><div class="vreg-field"><label>Порог (сколько записей считать повторными)</label><input id="vreg-repeat-threshold" type="number" min="1" max="100" value="'+Number(config.repeatThreshold||2)+'"></div><div class="vreg-field"><label>Начало нового периода учёта (необязательно)</label><input id="vreg-repeat-reset" type="date" value="'+esc(config.deviantsResetAt||'')+'"></div><button class="vreg-button secondary" data-vreg-action="reset-start-today">Начать учёт с сегодня</button><button class="vreg-button secondary" data-vreg-action="reset-clear">Учитывать весь период</button></div></div>'+
      (departments.length?'<div class="vreg-panel"><h3 style="margin-top:0">Префиксы групп и отделений</h3>'+departments.map(item=>'<div class="vreg-muted">'+esc(item[0])+' — '+esc(item[1])+'</div>').join('')+'</div>':'')+
      '<div class="vreg-tools"><button class="vreg-button" data-vreg-action="settings-save">Сохранить настройки</button><span id="vreg-settings-notice" class="vreg-notice"></span></div></section>';
  }
  function renderPage() {
    if (tab !== 'vl') return;
    const main=$('#m');
    if (!main) return;
    main.innerHTML = role==='uchet' ? maintenancePage() : (state.auditView ? auditPage() : state.view==='deviants' ? deviantsPage() : state.view==='report' ? reportPage() : state.view==='settings' ? settingsPage() : listPage());
  }
  function installDrawHook() {
    if (typeof draw !== 'function' || draw.__violationsRegistryHook) return;
    const original=draw;
    const wrapped=function(keep) {
      if (tab !== 'vl') return original.apply(this,arguments);
      const current=tab;
      tab='ov';
      original.call(this,true);
      tab=current;
      document.querySelectorAll('#nv [data-v]').forEach(button=>{
        button.classList.toggle('on',button.dataset.v==='vl');
      });
      renderPage();
      if(!keep)window.scrollTo(0,0);
    };
    wrapped.__violationsRegistryHook=true;
    draw=wrapped;
  }
  function refreshFilters() {
    state.q=$('#vreg-q')?.value||'';
    state.group=$('#vreg-group')?.value||'';
    state.type=$('#vreg-type')?.value||'';
    state.from=$('#vreg-from')?.value||'';
    state.to=$('#vreg-to')?.value||'';
    state.page=1;
    state.selected.clear();
    renderPage();
  }
  function parseCsv(text) {
    const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i],next=text[i+1];
      if(quoted){if(ch==='"'&&next==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
      else if(ch==='"')quoted=true;
      else if(ch===';'||ch==='\t'||ch===','){row.push(field);field='';}
      else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&next==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}
      else field+=ch;
    }
    row.push(field);if(row.some(x=>x.trim()))rows.push(row);
    return rows;
  }
  function csvValue(value) {
    const s=String(value==null?'':value);
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function exportCsv(list) {
    const headers=['Дата','Время','ФИО','Группа','Вид нарушения','Пост / место','Кто выявил','Принятые меры','Примечание','Доведено до куратора','Статус','Создано','Изменено'];
    const rows=list.map(item=>[
      dateText(item.d),item.t,item.fio,item.grp,item.type,item.post,item.by,item.meas,item.note,
      item.rep?'Да':'Нет',item.deletedAt?'В корзине':'Действующая',formatDateTime(item.createdAt),formatDateTime(item.updatedAt)
    ]);
    const csv='\ufeff'+[headers,...rows].map(row=>row.map(csvValue).join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='reestr_narushiteley_'+today()+'.csv';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function openModal(html) {
    document.querySelector('.vreg-modal-backdrop')?.remove();
    const backdrop=document.createElement('div');
    backdrop.className='vreg-modal-backdrop';
    backdrop.innerHTML='<section class="vreg-modal">'+html+'</section>';
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)backdrop.remove();});
    document.body.appendChild(backdrop);
    return backdrop;
  }
  function closeModal() { document.querySelector('.vreg-modal-backdrop')?.remove(); }
  function recordForm(item=null) {
    const v=item||{k:'',fio:'',grp:'',type:types()[0],d:today(),t:'',post:'',by:'',meas:'Профилактическая беседа',note:'',rep:false};
    const typeOptions=types().map(type=>'<option '+(type===v.type?'selected':'')+'>'+esc(type)+'</option>').join('');
    const posts=typeof D!=='undefined'&&D.set&&D.set.posts?String(D.set.posts).split(',').map(x=>x.trim()).filter(Boolean):[];
    const staff=typeof D!=='undefined'&&Array.isArray(D.staff)?D.staff.map(x=>x.name).filter(Boolean):[];
    const modal=openModal('<h2 style="margin:0 0 14px">'+(item?'Редактирование нарушения':'Новая запись о нарушении')+'</h2>'+
      '<form id="vreg-form" class="vreg-form">'+
      '<label class="wide">ФИО обучающегося<input name="fio" maxlength="200" required value="'+esc(v.fio)+'" autocomplete="off"></label>'+
      '<label>Группа<input name="grp" maxlength="100" value="'+esc(v.grp)+'"></label>'+
      '<label>Вид нарушения<select name="type">'+typeOptions+'</select></label>'+
      '<label>Дата<input name="d" type="date" required value="'+esc(v.d||today())+'"></label>'+
      '<label>Время<input name="t" type="time" value="'+esc(v.t||'')+'"></label>'+
      '<label>Пост / место<input name="post" maxlength="180" list="vreg-posts" value="'+esc(v.post||'')+'"><datalist id="vreg-posts">'+posts.map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist></label>'+
      '<label>Кто выявил<input name="by" maxlength="200" list="vreg-staff" value="'+esc(v.by||'')+'"><datalist id="vreg-staff">'+staff.map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist></label>'+
      '<label class="wide">Принятые меры<input name="meas" maxlength="1500" value="'+esc(v.meas||'')+'"></label>'+
      '<label class="wide">Примечание / обстоятельства<textarea name="note" rows="3" maxlength="3000">'+esc(v.note||'')+'</textarea></label>'+
      '<label class="wide check"><input type="checkbox" name="rep" '+(v.rep?'checked':'')+'> Доведено до куратора группы</label>'+
      '<div class="vreg-modal-actions wide"><button class="vreg-button" type="submit">Сохранить запись</button><button class="vreg-button secondary" type="button" data-vreg-action="modal-close">Отмена</button></div>'+
      '<p id="vreg-form-error" class="vreg-notice wide"></p></form>');
    modal.querySelector('#vreg-form').addEventListener('submit',async event=>{
      event.preventDefault();
      const form=event.currentTarget,fd=new FormData(form);
      const data={
        ...v,
        k:v.k||('vreg-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2))),
        fio:String(fd.get('fio')||'').trim(),grp:String(fd.get('grp')||'').trim(),
        type:String(fd.get('type')||''),d:String(fd.get('d')||''),t:String(fd.get('t')||''),
        post:String(fd.get('post')||'').trim(),by:String(fd.get('by')||'').trim(),
        meas:String(fd.get('meas')||'').trim(),note:String(fd.get('note')||'').trim(),rep:fd.get('rep')==='on',
        deletedAt:null
      };
      if(!data.fio||!data.type||!data.d){modal.querySelector('#vreg-form-error').textContent='Заполните ФИО, группу, вид нарушения и дату.';return;}
      const duplicate=state.items.find(x=>!x.deletedAt&&x.k!==data.k&&keyText(x.fio)===keyText(data.fio)&&keyText(x.grp)===keyText(data.grp)&&x.d===data.d&&x.type===data.type);
      if(duplicate&&!window.confirm('Похоже, такая запись уже существует за эту дату. Всё равно сохранить повторную запись?'))return;
      const next=[...state.items],index=next.findIndex(x=>x.k===data.k);
      if(index>=0)next[index]=data;else next.push(data);
      if(await saveRegistry(next,item?'Запись обновлена':'Запись добавлена'))closeModal();
    });
  }
  function showDossier(key) {
    const selected=state.items.find(item=>item.k===key);
    if(!selected)return;
    const all=activeItems().filter(item=>keyText(item.fio)===keyText(selected.fio)).sort((a,b)=>(b.d+' '+(b.t||'')).localeCompare(a.d+' '+(a.t||'')));
    const repeated=all.length>1;
    openModal('<h2 style="margin:0 0 4px">История нарушений</h2><p class="vreg-muted" style="margin:0 0 12px">'+esc(selected.fio)+' · '+esc(selected.grp)+' · всего записей: '+all.length+'</p>'+
      (repeated?'<p><span class="vreg-tag warn">Повторные нарушения</span></p>':'')+
      all.map(item=>'<article class="vreg-dossier-row"><b>'+dateText(item.d)+' '+esc(item.t||'')+' · '+esc(item.type)+'</b><div class="vreg-muted">'+esc(item.post||'Место не указано')+' · выявил: '+esc(item.by||'—')+'</div><p style="margin:5px 0">'+esc(item.meas||'Меры не указаны')+'</p>'+(item.note?'<p class="vreg-muted">'+esc(item.note)+'</p>':'')+'</article>').join('')+
      '<div class="vreg-modal-actions"><button class="vreg-button secondary" data-vreg-action="modal-close">Закрыть</button></div>');
  }
  function openImport() {
    const modal=openModal('<h2 style="margin:0 0 8px">Импорт из CSV / Excel</h2><p class="vreg-muted">Выберите CSV-файл или вставьте таблицу. Распознаются столбцы ФИО, группа, дата, вид нарушения, место, меры, комментарий и кто выявил. Совпадающие записи будут пропущены.</p>'+
      '<input id="vreg-import-file" type="file" accept=".csv,text/csv" style="width:100%;margin:8px 0">'+
      '<textarea id="vreg-import-text" rows="7" style="width:100%" placeholder="Дата;ФИО;Группа;Вид нарушения;..."></textarea>'+
      '<div class="vreg-modal-actions"><button class="vreg-button" data-vreg-action="import-parse">Проверить данные</button><button class="vreg-button secondary" data-vreg-action="modal-close">Отмена</button></div><p id="vreg-import-result" class="vreg-notice"></p>');
    modal.querySelector('#vreg-import-file').addEventListener('change',async event=>{
      const file=event.target.files&&event.target.files[0];if(!file)return;
      modal.querySelector('#vreg-import-text').value=await file.text();
    });
  }
  function importRows(text) {
    const raw=parseCsv(String(text||'').replace(/^\ufeff/,''));
    if(!raw.length)return {items:[],added:0,skipped:0,error:'Файл пуст.'};
    const headers=raw[0].map(x=>keyText(x));
    const index=(patterns,defaultIndex)=> {
      const found=headers.findIndex(header=>patterns.some(re=>re.test(header)));
      return found>=0?found:defaultIndex;
    };
    const ix={
      fio:index([/фио/,/фамил/,/студент/,/обуча/,/^name$/,/student[_ ]?name/],0),
      grp:index([/груп/,/student[_ ]?group/],1),
      d:index([/дат/,/created[_ ]?at/,/^date$/],2),
      t:index([/врем/,/^time$/],-1),
      type:index([/наруш/,/вид/,/тип/,/катег/,/violation[_ ]?type/],3),
      post:index([/мест/,/пост/,/локац/,/^location$/],-1),
      by:index([/выявил/,/кто/,/патрул/,/дежур/,/patrol[_ ]?name/],-1),
      meas:index([/мер/,/результат/,/реш/],-1),
      note:index([/описан/,/суть/,/комментар/,/примеч/,/^comment$/],-1),
      rep:index([/куратор/,/довед/],-1)
    };
    const existing=new Set(state.items.filter(x=>!x.deletedAt).map(x=>[keyText(x.fio),keyText(x.grp),x.d,keyText(x.type)].join('|')));
    const additions=[];let skipped=0;
    for(const row of raw.slice(1)){
      const val=key=>ix[key]>=0?String(row[ix[key]]||'').trim():'';
      const fio=val('fio'),grp=val('grp'),dRaw=val('d'),type=val('type');
      if(!fio||!type||!dRaw){skipped++;continue;}
      let d=dRaw,t=val('t');
      const iso=dRaw.match(/^(\d{4}-\d{2}-\d{2})/);
      const ru=dRaw.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
      if(iso)d=iso[1];
      else if(ru)d=ru[3]+'-'+ru[2]+'-'+ru[1];
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)){const timeMatch=dRaw.match(/(?:T|\s)([0-2]\d:[0-5]\d)/);t=timeMatch?timeMatch[1]:'';}
      const duplicateKey=[keyText(fio),keyText(grp),d,keyText(type)].join('|');
      if(existing.has(duplicateKey)){skipped++;continue;}
      existing.add(duplicateKey);
      const repRaw=keyText(val('rep'));
      additions.push({
        k:'vreg-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)),
        fio,grp,d,type,post:val('post'),by:val('by'),meas:val('meas'),note:val('note'),
        rep:['да','yes','1','true','доведено'].includes(repRaw),t,deletedAt:null
      });
    }
    return {items:additions,added:additions.length,skipped};
  }
  async function getMaintenance() {
    state.maintenanceBusy=true;state.error='';
    if(tab==='vl')renderPage();
    try{
      const result=await api('/api/violations/maintenance');
      if(!result.response.ok)throw new Error(result.result.error||'Не удалось получить техническую сводку');
      state.maintenance=result.result;state.error='';
      return true;
    }catch(error){state.error=error.message||'Ошибка технической проверки';return false;}
    finally{state.maintenanceBusy=false;if(tab==='vl')renderPage();}
  }

  async function downloadEncryptedBackup() {
    state.maintenanceBusy=true;renderPage();
    try{
      const response=await api('/api/violations/maintenance/backup');
      if(!response.response.ok)throw new Error(response.result.error||'Не удалось сформировать резервную копию');
      const body=response.result;
      if(body.format!=='patrul-violations-encrypted-backup-v1'||!body.encryptedData)throw new Error('Сервер вернул неверный формат резервной копии');
      const blob=new Blob([JSON.stringify(body,null,2)],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='patrul_violations_encrypted_backup_'+today()+'.json';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      showNotice('Зашифрованная резервная копия скачана. Внутри файла персональные записи остаются зашифрованными.');
    }catch(error){state.error=error.message||'Ошибка резервного копирования';}
    finally{state.maintenanceBusy=false;renderPage();}
  }
  function chooseEncryptedBackup() {
    const input=$('#vreg-backup-file');
    if(!input)return;
    input.value='';
    input.onchange=async()=>{
      const file=input.files&&input.files[0];if(!file)return;
      try{
        const backup=JSON.parse(await file.text());
        if(!backup||backup.format!=='patrul-violations-encrypted-backup-v1'||!backup.encryptedData)throw new Error('Выбранный файл не является резервной копией реестра');
        if(!window.confirm('Восстановить реестр из резервной копии от '+formatDateTime(backup.updatedAt)+'? Текущие записи будут заменены содержимым копии. Перед продолжением рекомендуется скачать актуальную копию.'))return;
        state.maintenanceBusy=true;renderPage();
        const response=await api('/api/violations/maintenance/restore','POST',{expectedVersion:Number(state.maintenance&&state.maintenance.version||0),backup});
        if(response.response.status===409)throw new Error(response.result.error||'Реестр успел измениться. Обновите сводку и повторите операцию.');
        if(!response.response.ok)throw new Error(response.result.error||'Не удалось восстановить резервную копию');
        state.maintenance=response.result.summary;
        state.error='';
        showNotice('Реестр восстановлен из зашифрованной резервной копии.');
      }catch(error){state.error=error.message||'Ошибка восстановления резервной копии';}
      finally{state.maintenanceBusy=false;renderPage();}
    };
    input.click();
  }
  async function purgeOldTrash() {
    if(!state.maintenance)return;
    if(!window.confirm('Удалить записи из корзины, срок хранения которых превышает 30 дней? Это действие необратимо.'))return;
    state.maintenanceBusy=true;renderPage();
    try{
      const result=await api('/api/violations/maintenance/purge','POST',{expectedVersion:Number(state.maintenance.version||0)});
      if(!result.response.ok)throw new Error(result.result.error||'Не удалось очистить корзину');
      state.maintenance=result.result.summary;
      showNotice('Очищено старых записей: '+Number(result.result.purged||0));
    }catch(error){state.error=error.message||'Ошибка очистки корзины';}
    finally{state.maintenanceBusy=false;renderPage();}
  }

  async function saveSettings() {
    const threshold=Number($('#vreg-repeat-threshold')?.value||state.settings.repeatThreshold);
    const reset=$('#vreg-repeat-reset')?.value||null;
    if(!Number.isInteger(threshold)||threshold<1||threshold>100){window.alert('Порог должен быть от 1 до 100');return;}
    const settings={...state.settings,repeatThreshold:threshold,deviantsResetAt:reset};
    try{
      const response=await api('/api/violations/settings','PUT',{expectedVersion:state.version,settings});
      if(response.response.status===409){state.version=Number(response.result.version||state.version);await loadRegistry({silent:true});renderPage();window.alert('Настройки изменились в другом окне. Загружена актуальная версия.');return;}
      if(!response.response.ok)throw new Error(response.result.error||'Не удалось сохранить настройки');
      state.settings=response.result.settings;state.version=Number(response.result.version||state.version);state.updatedAt=response.result.updatedAt||state.updatedAt;
      const notice=$('#vreg-settings-notice');if(notice)notice.textContent='Настройки сохранены';
      renderPage();
    }catch(error){window.alert(error.message||'Ошибка сохранения настроек');}
  }
  function handleAction(action, target) {
    const key=target.dataset.key;
    if(action==='new')recordForm();
    else if(action==='edit'){const item=state.items.find(x=>x.k===key);if(item)recordForm(item);}
    else if(action==='archive'){
      const item=state.items.find(x=>x.k===key);if(!item)return;
      if(!window.confirm('Переместить запись о нарушении в корзину?'))return;
      const next=state.items.map(x=>x.k===key?{...x,deletedAt:new Date().toISOString()}:x);
      saveRegistry(next,'Запись перемещена в корзину');
    }else if(action==='restore'){
      const next=state.items.map(x=>x.k===key?{...x,deletedAt:null}:x);
      saveRegistry(next,'Запись восстановлена');
    }else if(action==='dossier')showDossier(key);
    else if(action==='modal-close')closeModal();
    else if(action==='view-active'){state.trash=false;state.auditView=false;state.page=1;state.selected.clear();renderPage();}
    else if(action==='view-trash'){state.trash=true;state.auditView=false;state.page=1;state.selected.clear();renderPage();}
    else if(action==='audit'){state.auditView=true;getAudit();}
    else if(action==='audit-refresh')getAudit();
    else if(action==='clear-filters'){state.q='';state.group='';state.type='';state.from='';state.to='';state.page=1;state.selected.clear();renderPage();}
    else if(action==='sort'){
      const sort=target.dataset.key;
      if(state.sort===sort)state.direction=state.direction==='asc'?'desc':'asc';
      else{state.sort=sort;state.direction=sort==='date'?'desc':'asc';}
      renderPage();
    }else if(action==='page-prev'){state.page=Math.max(1,state.page-1);renderPage();}
    else if(action==='page-next'){state.page++;renderPage();}
    else if(action==='select-page'){
      const {rows}=pageRows();const checked=target.checked;
      rows.forEach(x=>checked?state.selected.add(x.k):state.selected.delete(x.k));renderPage();
    }else if(action==='export')exportCsv(filteredItems());
    else if(action==='export-selected')exportCsv(state.items.filter(x=>state.selected.has(x.k)));
    else if(action==='archive-selected'){
      if(!window.confirm('Переместить выбранные записи в корзину?'))return;
      const selected=new Set(state.selected),next=state.items.map(x=>selected.has(x.k)?{...x,deletedAt:new Date().toISOString()}:x);
      state.selected.clear();saveRegistry(next,'Выбранные записи перемещены в корзину');
    }else if(action==='import-open')openImport();
    else if(action==='import-parse'){
      const text=$('#vreg-import-text')?.value||'',parsed=importRows(text),host=$('#vreg-import-result');
      if(host)host.textContent=parsed.error||('Будет добавлено: '+parsed.added+'. Пропущено пустых или повторных строк: '+parsed.skipped+'.');
      state.importPreview=parsed;
      if(parsed.added&&window.confirm('Добавить '+parsed.added+' новых записей? Пропущено строк: '+parsed.skipped+'.')){
        saveRegistry([...state.items,...parsed.items],'Импорт завершён: добавлено '+parsed.added+' записей').then(ok=>{if(ok)closeModal();});
      }
    }else if(action==='view-deviants'){state.view='deviants';state.auditView=false;renderPage();}
    else if(action==='view-report'){state.view='report';state.auditView=false;renderPage();}
    else if(action==='view-settings'){state.view='settings';state.auditView=false;renderPage();}
    else if(action==='report-apply'){
      state.reportFrom=$('#vreg-report-from')?.value||'';state.reportTo=$('#vreg-report-to')?.value||'';state.reportGroup=$('#vreg-report-group')?.value||'';
      if(state.reportFrom&&state.reportTo&&state.reportFrom>state.reportTo){window.alert('Начало периода не может быть позже конца');return;}
      renderPage();
    }else if(action==='report-print'){window.print();}
    else if(action==='report-export'){
      const from=state.reportFrom||today().slice(0,7)+'-01',to=state.reportTo||today(),group=keyText(state.reportGroup||'');
      exportCsv(activeItems().filter(item=>item.d>=from&&item.d<=to&&(!group||keyText(item.grp).includes(group))));
    }else if(action==='type-add'){
      const input=$('#vreg-type-new'),value=String(input?.value||'').trim();
      if(!value)return;
      if(state.settings.violationTypes.some(x=>keyText(x)===keyText(value))){window.alert('Такой тип уже существует');return;}
      state.settings.violationTypes.push(value.slice(0,120));renderPage();
    }else if(action==='type-remove'){
      const value=target.dataset.value;
      if(state.settings.violationTypes.length<=1){window.alert('Должен остаться хотя бы один тип');return;}
      if(!window.confirm('Удалить тип «'+value+'» из доступного списка? Старые записи сохранятся.'))return;
      state.settings.violationTypes=state.settings.violationTypes.filter(x=>x!==value);renderPage();
    }else if(action==='reset-start-today'){
      state.settings.deviantsResetAt=today();renderPage();
    }else if(action==='reset-clear'){
      state.settings.deviantsResetAt=null;renderPage();
    }else if(action==='settings-save')saveSettings();
    else if(action==='maintenance-refresh')getMaintenance();
    else if(action==='maintenance-backup')downloadEncryptedBackup();
    else if(action==='maintenance-restore-open')chooseEncryptedBackup();
    else if(action==='maintenance-purge')purgeOldTrash();
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-vreg-action]');
    if(!target)return;
    const action=target.dataset.vregAction;
    if(action==='select-page') {
      const box=target;
      const {rows}=pageRows(),checked=box.checked;
      rows.forEach(x=>checked?state.selected.add(x.k):state.selected.delete(x.k));
      renderPage();return;
    }
    event.preventDefault();
    handleAction(action,target);
  });
  document.addEventListener('change',event=>{
    const target=event.target;
    if(target.matches('[data-vreg-select]')){
      target.checked?state.selected.add(target.dataset.vregSelect):state.selected.delete(target.dataset.vregSelect);
      renderPage();return;
    }
    if(target.id==='vreg-type'||target.id==='vreg-from'||target.id==='vreg-to'||target.id==='vreg-group'||target.id==='vreg-pagesize'){
      if(target.id==='vreg-pagesize')state.pageSize=Number(target.value)||50;
      refreshFilters();
    }
  });
  document.addEventListener('input',event=>{
    const target=event.target;
    if(target.id==='vreg-q'){
      state.q=target.value;state.page=1;
      const pos=target.selectionStart;
      const main=$('#m');if(!main)return;
      const active=()=>{renderPage();const field=$('#vreg-q');if(field){field.focus();field.setSelectionRange(pos,pos);}};
      clearTimeout(state.searchTimer);state.searchTimer=setTimeout(active,180);
    }else if(target.id==='vreg-group'){
      state.group=target.value;state.page=1;
      clearTimeout(state.searchTimer);state.searchTimer=setTimeout(renderPage,220);
    }
  });
  function install() {
    if(!Array.isArray(TABS))return;
    if(typeof IC!=='undefined'&&IC&&!IC.vl)IC.vl='<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01"/>';
    if(role!=='nachalnik'&&!TABS.some(item=>item[0]==='vl'))TABS.push(['vl','Нарушители']);
    installDrawHook();
    if(tab==='vl')renderPage();
  }
  let readyPromise=null;
  async function ready() {
    if(readyPromise)return readyPromise;
    readyPromise=(async()=>{
      install();
      if(role==='uchet') await getMaintenance();
      else await loadRegistry();
      // Redraw once after adding the role-specific navigation entry and loading
      // the canonical registry, so the new menu item and summary counts appear.
      if(typeof draw==='function')draw(true);
    })();
    return readyPromise;
  }
  window.addEventListener('patrul:ready',ready);
  if(window.PATRUL_READY)ready();
  setInterval(()=>{
    if(!window.PATRUL_READY||document.visibilityState==='hidden'||state.busy)return;
    if(role==='uchet')getMaintenance();
    else loadRegistry({silent:true});
  },15000);
})();
