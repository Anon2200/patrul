(() => {
'use strict';
const role=window.PATRUL_ROLE||'';
if(!role||role==='nachalnik')return;
const labels={zam:'Заместитель начальника патруля',uchet:'Старший мастер',dokumentoved:'Документовед',starshiy_patrulya:'Старший патруля'};
const pad=n=>String(n).padStart(2,'0');
const key=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=s=>{const p=String(s||'').split('-').map(Number);return new Date(p[0],p[1]-1,p[2]||1);};
let month=key(new Date()).slice(0,7), selected=key(new Date()), snapshot=null, overlay=null, busy=false;
const css = [
'#patrul-duty-calendar-button{display:flex;align-items:center;gap:8px}',
'#patrul-duty-calendar-overlay{position:fixed;inset:0;z-index:11000;background:rgba(5,14,26,.66);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}',
'.pdc-window{width:min(1100px,100%);max-height:92vh;overflow:auto;background:var(--card,#fff);color:var(--tx,#172536);border:1px solid var(--bd,#dce3eb);border-radius:16px;padding:18px;box-shadow:0 22px 70px #0005}',
'.pdc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}',
'.pdc-head h2{font-size:21px;margin:0 0 4px}.pdc-muted{font-size:13px;color:var(--mu,#64748b)}',
'.pdc-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}',
'.pdc-btn{border:1px solid var(--bd,#dce3eb);background:var(--hv,#edf2f7);color:var(--tx,#172536);padding:8px 12px;border-radius:9px;font:600 13px system-ui;cursor:pointer}',
'.pdc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--bd,#dce3eb);border:1px solid var(--bd,#dce3eb);border-radius:11px;overflow:hidden}',
'.pdc-week{background:var(--card,#fff);padding:7px 3px;text-align:center;color:var(--mu,#64748b);font-size:11px;font-weight:800}',
'.pdc-day{border:0;background:var(--card,#fff);color:var(--tx,#172536);text-align:left;min-height:94px;padding:6px;display:flex;flex-direction:column;gap:4px;cursor:pointer;min-width:0}',
'.pdc-day:hover{background:var(--hv,#edf2f7)}.pdc-day.other{opacity:.42}.pdc-day.selected{outline:2px solid var(--ac,#176b70);outline-offset:-2px}.pdc-day.today .pdc-num{background:var(--ac,#176b70);color:#fff;border-radius:99px;padding:2px 7px}',
'.pdc-num{font-weight:750;font-size:12px;align-self:flex-start}.pdc-chip{display:block;border-left:3px solid var(--ac,#176b70);background:var(--hv,#edf2f7);padding:3px 5px;border-radius:4px;font-size:10px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.pdc-chip.sub{border-left-color:#d97706}.pdc-more{font-size:10px;color:var(--mu,#64748b)}',
'.pdc-detail{border:1px solid var(--bd,#dce3eb);border-radius:12px;padding:13px;margin-top:13px}',
'.pdc-detail h3{margin:0 0 9px;font-size:15px}.pdc-row{display:grid;grid-template-columns:1.1fr .8fr 1.2fr;gap:9px;padding:9px 0;border-top:1px solid var(--bd,#dce3eb);font-size:13px}',
'.pdc-row strong{display:block}.pdc-warning{padding:10px;border-radius:9px;background:var(--hv,#edf2f7);margin-top:10px;font-size:12px;color:var(--mu,#64748b)}',
'@media(max-width:650px){#patrul-duty-calendar-overlay{padding:0;align-items:flex-end}.pdc-window{border-radius:16px 16px 0 0;max-height:94vh;padding:14px}.pdc-day{min-height:62px;padding:4px}.pdc-chip{display:none}.pdc-row{grid-template-columns:1fr;gap:4px}.pdc-head h2{font-size:18px}}',
'@media print{#patrul-duty-calendar-overlay{display:none!important}}'
].join('\n');
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function close(){if(overlay)overlay.remove();overlay=null;}
function buildOverlay(){
 close();overlay=el('div');overlay.id='patrul-duty-calendar-overlay';overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 const box=el('section','pdc-window'),head=el('div','pdc-head'),titles=el('div');
 titles.append(el('h2','','Общий график дежурств'),el('div','pdc-muted',labels[role]+' · единый календарь для всех кабинетов'));
 head.append(titles);
 const closeBtn=el('button','pdc-btn','Закрыть');closeBtn.type='button';closeBtn.addEventListener('click',close);head.append(closeBtn);box.append(head);
 const actions=el('div','pdc-actions'),prev=el('button','pdc-btn','‹ Предыдущий'),next=el('button','pdc-btn','Следующий'),today=el('button','pdc-btn','Сегодня'),caption=el('strong','',parse(month+'-01').toLocaleDateString('ru-RU',{month:'long',year:'numeric'})),refresh=el('button','pdc-btn','Обновить');
 prev.type=next.type=today.type=refresh.type='button';
 prev.addEventListener('click',()=>shift(-1));next.addEventListener('click',()=>shift(1));today.addEventListener('click',()=>{selected=key(new Date());month=selected.slice(0,7);load(true);});refresh.addEventListener('click',()=>load(true));
 actions.append(prev,caption,next,today,refresh);box.append(actions);
 const grid=el('div','pdc-grid');['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(day=>grid.append(el('div','pdc-week',day)));
 for(let i=0;i<42;i++){const btn=el('button','pdc-day');btn.type='button';btn.dataset.pdcDay='';grid.append(btn);}
 box.append(grid);
 const detail=el('section','pdc-detail');detail.dataset.pdcDetail='';box.append(detail);
 box.append(el('p','pdc-warning','Изменения в графике вносятся уполномоченными руководителями. Остальные роли видят общую синхронизированную версию. Данные загружаются с сервера, а не из локальной копии кабинета.'));
 overlay.append(box);document.body.append(overlay);render();
}
async function getData(){
 const r=await fetch('/api/duty-schedule?month='+encodeURIComponent(month),{credentials:'same-origin',cache:'no-store'});
 let j={};try{j=await r.json();}catch(_){}
 if(!r.ok)throw new Error(j.error||'Не удалось загрузить график');
 return j;
}
function dayMap(){const map=new Map();(snapshot&&snapshot.days||[]).forEach(d=>map.set(d.date,d.assignments||[]));return map;}
function render(){
 if(!overlay||!snapshot)return;
 const monthDate=parse(month+'-01'),first=new Date(monthDate),start=new Date(first);start.setDate(first.getDate()-((first.getDay()+6)%7));
 const map=dayMap(),buttons=overlay.querySelectorAll('[data-pdc-day]'),caption=overlay.querySelector('.pdc-actions strong');
 if(caption)caption.textContent=monthDate.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
 buttons.forEach((button,i)=>{
  const d=new Date(start);d.setDate(start.getDate()+i);const date=key(d),items=map.get(date)||[];
  button.dataset.pdcDay=date;button.className='pdc-day'+(d.getMonth()!==monthDate.getMonth()?' other':'')+(date===selected?' selected':'')+(date===key(new Date())?' today':'');
  button.replaceChildren();button.append(el('span','pdc-num',String(d.getDate())));
  items.slice(0,2).forEach(item=>button.append(el('span','pdc-chip'+(item.isSubstitute?' sub':''),item.departmentName+': '+(item.effectiveSenior||item.seniorName||'не назначен'))));
  if(items.length>2)button.append(el('span','pdc-more','ещё '+(items.length-2)));
  button.onclick=()=>{selected=date;render();};
 });
 const detail=overlay.querySelector('[data-pdc-detail]');detail.replaceChildren();
 detail.append(el('h3','','Дежурства на '+parse(selected).toLocaleDateString('ru-RU')));
 const items=map.get(selected)||[];
 if(!items.length){detail.append(el('p','pdc-muted','На выбранную дату назначения отделений в графике пока отсутствуют.'));return;}
 items.forEach(item=>{
  const row=el('div','pdc-row'),dep=el('div'),post=el('div'),senior=el('div');
  dep.append(el('strong','',item.departmentName||'Отделение'),el('span','pdc-muted',item.isSubstitute?'Временная подмена':'Основное назначение'));
  post.append(el('strong','','Пост'),el('span','',item.post||'Не указан'));
  senior.append(el('strong','',item.isSubstitute?'Дежурит вместо основного':'Старший патруля'),el('span','',item.effectiveSenior||item.seniorName||'Не назначен'));
  if(item.isSubstitute&&item.seniorName)senior.append(el('div','pdc-muted','Основной: '+item.seniorName+' · Основание: '+(item.substituteReason||'не указано')));
  row.append(dep,post,senior);detail.append(row);
 });
}
async function load(showError=false){
 if(busy)return;busy=true;
 try{snapshot=await getData();render();}
 catch(error){if(showError&&overlay){const detail=overlay.querySelector('[data-pdc-detail]');if(detail)detail.textContent=error.message;}}
 finally{busy=false;}
}
function shift(step){const d=parse(month+'-01');d.setMonth(d.getMonth()+step);month=key(d).slice(0,7);selected=month+'-01';load(true);}
function viewerButton(){
 if(role==='starshiy_patrulya'){
  const tabs=document.querySelector('.tabs');if(!tabs)return false;
  let b=tabs.querySelector('[data-pdc-open]');if(!b){b=el('button','','График дежурств');b.type='button';b.dataset.pdcOpen='1';b.addEventListener('click',()=>{month=selected.slice(0,7);buildOverlay();load(true);});tabs.append(b);}
  return true;
 }
 const menu=document.querySelector(role==='zam'?'#bn':'#nv');if(!menu)return false;
 let b=menu.querySelector('#patrul-duty-calendar-button');
 if(!b){b=el('button','n','Календарь дежурств');b.id='patrul-duty-calendar-button';b.type='button';b.addEventListener('click',()=>{month=selected.slice(0,7);buildOverlay();load(true);});menu.append(b);}
 return true;
}
function start(){
 const style=el('style');style.textContent=css;document.head.append(style);
 if(role==='starshiy_patrulya'){
  const mountSenior=new MutationObserver(()=>viewerButton());mountSenior.observe(document.body,{childList:true,subtree:true});
  const poll=setInterval(async()=>{if(!viewerButton())return;try{snapshot=await getData();viewerButton();if(retryPoll){clearInterval(poll);retryPoll=null;}}catch(_){}},5000);
  let retryPoll=true;
  setInterval(()=>{if(overlay)load(false);},30000);
 }else{
  const mount=()=>viewerButton();window.addEventListener('patrul:ready',()=>{mount();load(false);});if(window.PATRUL_READY){mount();load(false);}
  const menu=document.querySelector(role==='zam'?'#bn':'#nv');if(menu)new MutationObserver(mount).observe(menu,{childList:true});
  setInterval(()=>{if(overlay)load(false);},30000);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();