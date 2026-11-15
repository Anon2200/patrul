'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');

const ASSET_VERSION = '20261115-10';

const rolePages = {
  'nachalnik.html': 'nachalnik',
  'zam.html': 'zam',
  'uchet.html': 'uchet',
  'dokumentoved.html': 'dokumentoved'
};

function fail(message) {
  console.error('FAIL: ' + message);
  process.exitCode = 1;
}

const server = fs.readFileSync('server.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
const cloudSync = fs.readFileSync('cloud-sync.js', 'utf8');
const opsWorkspace = fs.readFileSync('ops-workspace.js', 'utf8');
const personalWorkspace = fs.readFileSync('personal-workspace.js', 'utf8');
const mailClient = fs.readFileSync('mail.js', 'utf8');
const patrolSeniorPage = fs.readFileSync('patrol-senior.html', 'utf8');
const mailPage = fs.readFileSync('mail.html', 'utf8');
const mailViewerPage = fs.readFileSync('mail-viewer.html', 'utf8');
const patrolSeniorAuth = fs.readFileSync('auth.js', 'utf8');
const patrolSeniorClient = fs.readFileSync('patrol-senior.js', 'utf8');
const commanderDutyPage = fs.readFileSync('nachalnik.html', 'utf8');
const dutyScriptIndex = commanderDutyPage.indexOf('src="duty-schedule.js');
const staffScriptIndex = commanderDutyPage.indexOf('src="staff-workspace.js');
if (dutyScriptIndex < 0 || staffScriptIndex < 0 || dutyScriptIndex > staffScriptIndex) fail('commander duty schedule must load before staff workspace so the roster assignment block can bind to nr');
const calendarGlobalIndex = commanderDutyPage.indexOf('src="duty-calendar-global.js');
const newDutyRosterIndex = commanderDutyPage.indexOf('src="duty-roster-section.js');
if (calendarGlobalIndex < 0 || newDutyRosterIndex < 0 || newDutyRosterIndex < calendarGlobalIndex || newDutyRosterIndex < staffScriptIndex) fail('new duty roster workspace must load after shared duty calendar and staff modules');
const newDutyRoster = fs.readFileSync('duty-roster-section.js', 'utf8');
try { new vm.Script(newDutyRoster, { filename: 'duty-roster-section.js' }); } catch (error) { fail('new duty roster workspace: ' + error.message); }
for (const required of ['Параметры смены','Назначения отделений на дату','Состав наряда по постам','Пересобрать все дни','function rebuildDate','function makePlan','function applyPlan','Сбросить состав наряда','/api/duty-roster']) {
  if (!newDutyRoster.includes(required)) fail('new duty roster workspace is missing: ' + required);
}
const bulkLoadStart = newDutyRoster.indexOf('async function loadAll()');
const bulkLoadEnd = newDutyRoster.indexOf('function queuePersist', bulkLoadStart);
const bulkLoadCode = bulkLoadStart >= 0 && bulkLoadEnd > bulkLoadStart
  ? newDutyRoster.slice(bulkLoadStart, bulkLoadEnd) : '';
if (!bulkLoadCode.includes('if(busyAll)return false') ||
    !bulkLoadCode.includes('if(saveTimers.size||saving.size||pendingConflicts.size)') ||
    !bulkLoadCode.includes('if(!result.result||!Array.isArray(result.result.items))') ||
    !bulkLoadCode.includes('rosters.clear();versions.clear();schedules.clear();') ||
    !bulkLoadCode.includes('return true;') || !bulkLoadCode.includes('return false;') ||
    newDutyRoster.includes('if(date<today())continue;')) {
  fail('bulk roster load must abort safely on pending edits or load errors and replace stale cached dates');
}
const bulkRebuildStart = newDutyRoster.indexOf('A.nrRebuildAll=async()=>');
const bulkRebuildEnd = newDutyRoster.indexOf('function printDocument', bulkRebuildStart);
const bulkRebuildCode = bulkRebuildStart >= 0 && bulkRebuildEnd > bulkRebuildStart
  ? newDutyRoster.slice(bulkRebuildStart, bulkRebuildEnd) : '';
const bulkSaveIndex = bulkRebuildCode.indexOf("const saved=await api('/api/duty-roster','PUT'");
const bulkSaveCheckIndex = bulkRebuildCode.indexOf('if(!saved.response.ok)', bulkSaveIndex);
const bulkCacheWriteIndex = bulkRebuildCode.indexOf('rosters.set(date,{...defaultRecord()', bulkSaveCheckIndex);
if (!bulkRebuildCode.includes('if(!(await loadAll()))return;') ||
    bulkSaveIndex < 0 || bulkSaveCheckIndex <= bulkSaveIndex || bulkCacheWriteIndex <= bulkSaveCheckIndex) {
  fail('bulk roster rebuild must stop on failed load and update local data only after the server confirms each date');
}
if (newDutyRoster.includes('save();') || !newDutyRoster.includes("api('/api/duty-roster'") || !cloudSync.includes("if(role==='nachalnik')delete copy.duty")) fail('daily duty roster must persist only through its independent API, while commander role snapshots omit duty');
if (!patrolSeniorAuth.includes("if(p==='/api/duty-roster')") || !patrolSeniorAuth.includes('patrul_duty_rosters') || !patrolSeniorAuth.includes('patrul_duty_schedule') || !patrolSeniorAuth.includes('UNION SELECT duty_date FROM patrul_duty_schedule WHERE duty_date>=$1::date')) fail('duty APIs must use independent PostgreSQL tables and include scheduled-only dates in bulk reads');
if (!server.includes("010_independent_duty_storage.sql") || !server.includes('purgeLegacyCommanderDuty') || !server.includes('startDutyCleanup')) fail('server must create independent duty storage, remove old embedded duty data and schedule daily cleanup');
if (!server.includes('PATRUL_TIME_ZONE') && !fs.readFileSync('duty-store.js','utf8').includes("process.env.PATRUL_TIME_ZONE || 'Europe/Moscow'")) fail('daily duty cleanup must use the configured local timezone');
if (!server.includes("['/duty-roster-section.js', 'duty-roster-section.js']") || !serviceWorker.includes("'/duty-roster-section.js'")) fail('server and service worker must serve/cache the new duty roster workspace');
const dutyStore = fs.readFileSync('duty-store.js','utf8');
if (!dutyStore.includes("process.env.PATRUL_TIME_ZONE || 'Europe/Moscow'") || !dutyStore.includes('startDutyCleanup') || !dutyStore.includes("DELETE FROM patrul_duty_rosters") || !dutyStore.includes("DELETE FROM patrul_patrol_senior_entries")) fail('daily duty cleanup must expire independent rosters and daily logs in the configured timezone');
if (!fs.readFileSync('cloud-sync.js','utf8').includes("if(role==='nachalnik')delete copy.duty")) fail('commander cloud sync must never restore the retired embedded duty payload');

try {
  const testSource = newDutyRoster.slice(0,newDutyRoster.lastIndexOf('})();')) + 'window.__rosterTest={rebuildDate,membersMatch};\n})();';
  if (testSource === newDutyRoster) throw new Error('test hook could not be attached');
  const sandbox = {
    D:{
      departments:[{id:'dep-1',name:'Отделение 1'}],
      staff:[
        {name:'Шабанов Сергей Александрович',pos:'Патрульный',departmentId:'dep-1'},
        {name:'Осипова Ксения Евгеньевна',pos:'Патрульный',departmentId:'dep-1'},
        {name:'Фурсов Сергей Сергеевич',pos:'Патрульный',departmentId:'dep-1'},
        {name:'Широков Даниил Владимирович',pos:'Патрульный',departmentId:'dep-1'}
      ],
      duty:{}
    },
    TABS:[],EXV:{},A:{},window:{addEventListener(){},setInterval(){return 0;},PATRUL_READY:false},document:{addEventListener(){}},
    posts:()=>['Пост 1','Пост 2','Пост 3'],postKitText:()=>'',isSeniorPatrolRow:()=>false,
    today:()=>'2026-11-15',e:value=>String(value),fl:value=>value,draw(){},tab:'ov',dsel:'2026-11-15',
    toast(){},modal(){}
  };
  vm.runInNewContext(testSource,sandbox);
  const engine=sandbox.window.__rosterTest;
  const first={
    t1:'08:00',t2:'20:00',
    rows:{
      'Пост 1':[
        {fio:'Шабанов С.А.',tin:'08:15',tout:'15:30',eq:'радиостанция',signature:'подписано'},
        {fio:'Осипова К.Е.',tin:'08:20',tout:'15:40',eq:'комплект 2'}
      ],
      'Пост 2':[
        {fio:'Шабанов Сергей Александрович',tin:'08:15',tout:'15:30',eq:'радиостанция',signature:'подписано'},
        {fio:'Фурсов Сергей Сергеевич',tin:'08:10',tout:'15:50',eq:'комплект 3'}
      ]
    },defects:[],incs:[]
  };
  const schedule1={assignments:[{departmentId:'dep-1',departmentName:'Отделение 1',post:'Пост 2'}],substitutions:[]};
  if(engine.membersMatch({fio:'Шабанов С.А.'},sandbox.D.staff).length!==1)throw new Error('abbreviated FIO matching failed');
  const one=engine.rebuildDate('2026-11-13',first,schedule1);
  if(one.skipped||one.moved!==2||one.added!==1||one.already!==2||one.duplicatesRemoved!==1)throw new Error('date-specific rebuild totals are incorrect: '+JSON.stringify(one));
  const moved=one.data.rows['Пост 2'].find(row=>row.fio==='Шабанов Сергей Александрович');
  if(one.data.rows['Пост 1'].some(row=>row.fio)||one.data.rows['Пост 2'].filter(row=>row.fio).length!==4)throw new Error('personnel were not moved and deduplicated');
  if(!moved||moved.tin!=='08:15'||moved.tout!=='15:30'||moved.eq!=='радиостанция'||moved.signature!=='подписано')throw new Error('times, equipment or extra signature fields were not preserved');
  const two=engine.rebuildDate('2026-11-14',{t1:'09:00',t2:'21:00',rows:{'Пост 3':[{fio:'Шабанов Сергей Александрович',tin:'09:15'}]},defects:[],incs:[]},{assignments:[{departmentId:'dep-1',post:'Пост 3'}],substitutions:[]});
  if(two.skipped||two.data.rows['Пост 3'].filter(row=>row.fio).length!==4||two.data.rows['Пост 3'][0].tin!=='09:15')throw new Error('second date did not use its own post or preserve data');
  const unchanged={rows:{'Старый пост':[{fio:'Иванов И.И.'}]},defects:[],incs:[]};
  const noSchedule=engine.rebuildDate('2026-11-15',unchanged,{assignments:[]});
  if(!noSchedule.skipped||unchanged.rows['Старый пост'].length!==1)throw new Error('date without assignment was changed');
  const invalid=engine.rebuildDate('2026-11-16',{rows:{},defects:[],incs:[]},{assignments:[{departmentId:'dep-1',post:'Удалённый пост'}]});
  if(!invalid.skipped||invalid.errors.length!==1)throw new Error('invalid scheduled post should be skipped safely');
  const repeat=engine.rebuildDate('2026-11-13',one.data,schedule1);
  if(repeat.skipped||repeat.added||repeat.moved||repeat.duplicatesRemoved)throw new Error('repeated rebuild is not idempotent');
} catch (error) {
  fail('independent duty roster regression: ' + error.message);
}
const dutySchedule = fs.readFileSync('duty-schedule.js', 'utf8');
const dutyCalendarGlobal = fs.readFileSync('duty-calendar-global.js', 'utf8');
try { new vm.Script(dutyCalendarGlobal, { filename: 'duty-calendar-global.js' }); } catch (error) { fail('shared duty calendar script: ' + error.message); }
try { new vm.Script(dutySchedule, { filename: 'duty-schedule.js' }); } catch (error) { fail('duty schedule script: ' + error.message); }
const staffWorkspaceLoader = fs.readFileSync('staff-workspace.js', 'utf8');
const staffPayload = staffWorkspaceLoader.match(/const encoded = '([A-Za-z0-9+/=]+)'/);
let staffWorkspace = '';
if (!staffPayload) {
  fail('staff workspace bundle payload is missing');
} else {
  try {
    staffWorkspace = zlib.inflateSync(Buffer.from(staffPayload[1], 'base64')).toString('utf8');
    new vm.Script(staffWorkspace, { filename: 'staff-workspace.bundle.js' });
  } catch (error) {
    fail('staff workspace bundle: ' + error.message);
  }
}

const dutyRebuildPayload = staffWorkspaceLoader.match(/const dutyRebuildCode = ("(?:\\.|[^"\\])*");/);
if (!dutyRebuildPayload) {
  fail('staff workspace must inject the rebuilt duty assignment block');
} else {
  try {
    const dutyRebuildCode = JSON.parse(dutyRebuildPayload[1]);
    new vm.Script(dutyRebuildCode, { filename: 'duty-roster-rebuild.injected.js' });
    for (const required of ['Распределение отделения по постам','id="sq_rebuild_department"','id="sq_duty_post"','data-act="sqput"','data-act="sqrebuild"','data-act="sqput2"','data-act="sqrebuild2"']) {
      if (!dutyRebuildCode.includes(required)) throw new Error('duty assignment UI is missing: '+required);
    }
    const helperNames = ['sqRosterTokens','sqRosterNameMatches','sqRosterValuePresent','sqRosterRowScore','sqRosterPlanDay','sqRosterApplyPlan','sqRosterSchedule','sqRosterHasMember','sqRebuildPlanForDays','sqRosterCountPlans','sqRosterPlanStats','sqRosterIssueText'];
    const helpers = helperNames.map(name => {
      const start = dutyRebuildCode.indexOf('function '+name+'(');
      const end = dutyRebuildCode.indexOf('\n}',start);
      if (start<0||end<0) throw new Error('missing helper '+name);
      return dutyRebuildCode.slice(start,end+2);
    }).join('\n');
    const exercise = [
      '(function(){',
      "const members=[{name:'Шабанов Сергей Александрович',pos:'Патрульный'},{name:'Осипова Ксения Евгеньевна',pos:'Патрульный'},{name:'Фурсов Сергей Сергеевич',pos:'Патрульный'},{name:'Широков Даниил Владимирович',pos:'Патрульный'}];",
      "const day={t1:'08:00',t2:'20:00',rows:{'Въездное-КПП':[{fio:'Шабанов С.А.',pos:'Патрульный',tin:'08:15',tout:'15:30',eq:'радиостанция',signature:'подписано'},{fio:'Осипова К.Е.',tin:'08:20',tout:'15:40',eq:'комплект 2'}],'КПП ВЪЕЗДНОЕ':[{fio:'Шабанов Сергей Александрович',pos:'Патрульный'},{fio:'Фурсов Сергей Сергеевич',tin:'08:10',tout:'15:50',eq:'комплект 3'}]}};",
      "const plan=sqRosterPlanDay(day,'КПП ВЪЕЗДНОЕ',members);",
      "if(plan.issues.length)throw new Error('valid full-name/initial matches were rejected');",
      "const totals=sqRosterApplyPlan(day,plan,{tin:day.t1,tout:day.t2});",
      "if(totals.moved!==2||totals.already!==1||totals.added!==1||totals.duplicatesRemoved!==1)throw new Error('current-day transfer totals are incorrect: '+JSON.stringify(totals));",
      "const target=day.rows['КПП ВЪЕЗДНОЕ'].filter(row=>row&&row.fio);",
      "if(target.length!==4||day.rows['Въездное-КПП'].some(row=>row&&row.fio))throw new Error('old post still contains duplicate department members');",
      "const shabanov=target.find(row=>row.fio==='Шабанов Сергей Александрович');",
      "if(!shabanov||shabanov.tin!=='08:15'||shabanov.tout!=='15:30'||shabanov.eq!=='радиостанция'||shabanov.signature!=='подписано')throw new Error('existing row fields were not preserved and merged');",
      "if(!target.some(row=>row.fio==='Широков Даниил Владимирович'&&row.tin==='08:00'&&row.tout==='20:00'))throw new Error('new member did not inherit shift defaults');",
      "const repeat=sqRosterApplyPlan(day,sqRosterPlanDay(day,'КПП ВЪЕЗДНОЕ',members),{tin:'08:00',tout:'20:00'});",
      "if(repeat.already!==4||repeat.added||repeat.moved||repeat.duplicatesRemoved)throw new Error('repeated assignment is not idempotent');",
      "const ambiguousMembers=[{name:'Шабанов Сергей Александрович'},{name:'Шабанов Софья Александровна'}];",
      "const ambiguousDay={rows:{'Пост 1':[{fio:'Шабанов С.А.',tin:'08:00'}]}};",
      "const beforeAmbiguous=JSON.stringify(ambiguousDay);",
      "const ambiguousPlan=sqRosterPlanDay(ambiguousDay,'Пост 2',ambiguousMembers);",
      "if(!ambiguousPlan.issues.length||JSON.stringify(ambiguousDay)!==beforeAmbiguous)throw new Error('ambiguous initials must be blocked without mutation');",
      "const conflictDay={rows:{'Пост 1':[{fio:'Иванов И.И.',tin:'08:00'}],'Пост 2':[{fio:'Иванов Иван Иванович',tin:'09:00'}]}};",
      "if(!sqRosterPlanDay(conflictDay,'Пост 3',[{name:'Иванов Иван Иванович'}]).issues.some(issue=>issue.kind==='field-conflict'))throw new Error('conflicting duplicate row fields were not detected');",
      "const allDays={'2026-11-13':{departmentAssignments:[{departmentId:'dep-1',post:'КПП ВЪЕЗДНОЕ'}],rows:{'Въездное-КПП':[{fio:'Иванов И.И.',tin:'08:00',eq:'радиостанция'}]}},'2026-11-14':{departmentAssignments:[{departmentId:'dep-1',post:'ПАРК'}],rows:{ПАРК:[{fio:'Иванов Иван Иванович',tin:'09:00'}]}},'2026-11-15':{rows:{'Старый пост':[{fio:'Иванов И.И.'}]}},'2026-11-16':{departmentAssignments:[{departmentId:'dep-1',post:'УДАЛЁННЫЙ ПОСТ'}],rows:{}}};",
      "const days=sqRebuildPlanForDays('dep-1',allDays,[{name:'Иванов Иван Иванович',pos:'Патрульный'},{name:'Петров П.П.',pos:'Патрульный'}],['КПП ВЪЕЗДНОЕ','ПАРК']);",
      "if(days.days.length!==2||days.days[0].post!=='КПП ВЪЕЗДНОЕ'||days.days[1].post!=='ПАРК'||days.missing.length!==1||days.invalid.length!==1)throw new Error('all-days planning did not respect per-date posts and skips');",
      "days.days.forEach(entry=>sqRosterApplyPlan(entry.day,sqRosterPlanDay(entry.day,entry.post,[{name:'Иванов Иван Иванович',pos:'Патрульный'},{name:'Петров П.П.',pos:'Патрульный'}]),{}));",
      "if(!allDays['2026-11-13'].rows['КПП ВЪЕЗДНОЕ'].some(row=>row.fio==='Петров П.П.')||!allDays['2026-11-14'].rows.ПАРК.some(row=>row.fio==='Петров П.П.'))throw new Error('department personnel were not rebuilt at each date-specific post');",
      "if(allDays['2026-11-15'].rows['Старый пост'].length!==1||Object.keys(allDays['2026-11-16'].rows).length!==0)throw new Error('unassigned/invalid schedule days were changed');",
      '})()'
    ].join('\n');
    vm.runInNewContext(helpers+'\n'+exercise);
  } catch (error) {
    fail('rebuilt duty assignment block: ' + error.message);
  }
}

const cacheManifest = serviceWorker.match(/const ASSETS = \[([\s\S]*?)\];/);

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

if (countMatches(index, /name="theme-color"/g) !== 1 ||
    countMatches(index, /rel="apple-touch-icon"/g) !== 1) {
  fail('index.html must contain one theme-color and one apple-touch-icon declaration');
}


if (!server.includes("['/', 'index.html']")) fail('server does not serve / as index.html');
if (!server.includes("['/patrol-senior.html', 'patrol-senior.html']") || !server.includes("['/patrol-senior.js', 'patrol-senior.js']")) fail('server must serve the dedicated patrol senior page and client');
if (!server.includes("006_patrol_senior_role.sql")) fail('server must apply the patrol senior identity migration');
if (!index.includes('href="patrol-senior.html"') || !index.includes("starshiy_patrulya:'/patrol-senior.html'")) fail('index must expose and route only the dedicated patrol senior role');
if (!patrolSeniorPage.includes('src="patrol-senior.js?v=' + ASSET_VERSION + '"') || !patrolSeniorPage.includes('data-enroll') || !patrolSeniorPage.includes('data-login')) fail('patrol senior page must load the cache-busted client and provide first-entry PIN setup and surname/PIN login');
if (!patrolSeniorPage.includes("navigator.serviceWorker.register('/sw.js?v=20261115-14',{updateViaCache:'none'})") || !patrolSeniorPage.includes('.then(reg=>reg.update())')) fail('Patrol Senior page must register and immediately update the versioned offline worker');
if (!patrolSeniorPage.includes('name="activationCode"') || !patrolSeniorClient.includes('activationCode:b.activationCode') || !patrolSeniorAuth.includes('/api/patrol-senior/activation-code') || !patrolSeniorAuth.includes('activation_code_hash') || !patrolSeniorAuth.includes('consumed_at')) fail('Patrol Senior enrollment must require a hashed, expiring, single-use supervisor activation code');
if (!mailClient.includes("starshiy_patrulya:'Старший патруля'") || !mailClient.includes("starshiy_patrulya:{path:'/patrol-senior.html'")) fail('internal mail must recognize the Patrol Senior role and return to its workspace');
if (!patrolSeniorClient.includes('href="/mail.html"')) fail('Patrol Senior workspace must link to internal mail');
for (const feature of ['/api/patrol-senior/eligible','/api/patrol-senior/activation-code','/api/patrol-senior/enroll','/api/patrol-senior/login','/api/patrol-senior/workspace','/api/patrol-senior/entries','/api/patrol-senior/change-pin','/api/patrol-senior/reports']) {
  if (!patrolSeniorAuth.includes(feature)) fail('patrol senior API missing ' + feature);
}
if (!patrolSeniorAuth.includes("session.role!=='starshiy_patrulya'") || !patrolSeniorAuth.includes("SHARED_STAFF_ROLES.includes(s.role)")) fail('patrol senior access must remain department-scoped and block shared personnel administration');
if (!opsWorkspace.includes('seniorActivation') || !opsWorkspace.includes('/api/patrol-senior/activation-code') || !cloudSync.includes('window.PATRUL_CSRF=csrfToken')) fail('higher roles must issue one-time activation codes from the workspace with the authenticated CSRF token');
if (!opsWorkspace.includes('function showAssetQr') || !opsWorkspace.includes('data-ops="qr"') || !opsWorkspace.includes('window.QRM(payload,1)')) fail('equipment records must provide printable QR labels using inventory identifiers only');
if (!fs.readFileSync('uchet.html','utf8').includes('window.QRM=function')) fail('the senior master page must load the local QR encoder before the equipment workspace');
const seniorMasterPage = fs.readFileSync('uchet.html','utf8');

const dutyRulesStart = commanderDutyPage.indexOf('const dutyStaffPerson=');
const dutyRulesEnd = commanderDutyPage.indexOf('const dv=', dutyRulesStart);
if (dutyRulesStart < 0 || dutyRulesEnd < 0) {
  fail('duty roster must resolve staff positions before deciding equipment eligibility');
} else {
  const dutyRules = commanderDutyPage.slice(dutyRulesStart, dutyRulesEnd);
  try {
    vm.runInNewContext(dutyRules + `
      if (!isSeniorPatrolRow({fio:'Петров Пётр',pos:'Старший патруля'})) throw new Error('explicit senior position was not recognized');
      if (!isSeniorPatrolRow({fio:'Сидоров Иван',pos:''})) throw new Error('senior position from shared staff list was not recognized');
      if (isSeniorPatrolRow({fio:'Иванов Иван',pos:'Патрульный'})) throw new Error('ordinary patrolman was incorrectly treated as senior');
    `, {
      D:{staff:[{name:'Сидоров Иван',pos:'Старший патруля'}]},
      pc:value=>String(value||'').replace(/ё/g,'е').toLowerCase()
    });
  } catch (error) {
    fail('duty roster senior role classification: ' + error.message);
  }
}
const rosterModule = fs.readFileSync('duty-roster-section.js', 'utf8');
if (commanderDutyPage.includes('Снаряжение (только Старшему патруля)') ||
    commanderDutyPage.includes('Подпись за получение снаряжения') ||
    /Снаряжение/.test(rosterModule) ||
    !commanderDutyPage.includes('СДАЧА ДЕЖУРСТВА') ||
    !commanderDutyPage.includes('e(dutyRowPosition(r))')) {
  fail('duty roster must not contain an equipment column: equipment is signed for in the senior master statement; personnel only sign for taking duty');
}

if (!seniorMasterPage.includes('data-act="itqr"') || !seniorMasterPage.includes('EXA.itqr=t=>') || !seniorMasterPage.includes('EXA.itqrp=()=>')) fail('main equipment inventory must support QR label preview and printing');
if (!patrolSeniorClient.includes('data-date') || !patrolSeniorClient.includes('data-attendance') || !patrolSeniorClient.includes('data-equipment-status') || !patrolSeniorClient.includes('data-report')) fail('patrol senior dashboard must provide date selection, attendance, equipment and reports');
if (!patrolSeniorClient.includes("title:'Передача смены'") || !patrolSeniorClient.includes('Незакрытые вопросы') || !patrolSeniorClient.includes('Состояние имущества:')) fail('patrol senior must record structured shift handover details');

const patrolSeniorOfflineMigration=fs.readFileSync('migrations/009_patrol_senior_offline_queue.sql','utf8');
if (!server.includes('009_patrol_senior_offline_queue.sql') || !patrolSeniorOfflineMigration.includes('client_entry_id UUID') || !patrolSeniorOfflineMigration.includes('patrol_senior_entries_client_id_idx')) fail('Patrol Senior offline queue migration must provide idempotent client entry identifiers');
if (!patrolSeniorAuth.includes('clientEntryId') || !patrolSeniorAuth.includes('ON CONFLICT (senior_user_id,client_entry_id)')) fail('Patrol Senior API must accept idempotent queued entries');
if (!patrolSeniorAuth.includes('Идентификатор офлайн-записи уже использован для другого содержимого')) fail('Patrol Senior API must reject conflicting reuse of offline entry identifiers');
if (!patrolSeniorClient.includes('function flushOfflineQueue') || !patrolSeniorClient.includes('indexedDB.open') || !patrolSeniorClient.includes('AES-GCM') || !patrolSeniorClient.includes('patrul-senior-offline-auth') || !patrolSeniorClient.includes('clientEntryId') || !patrolSeniorClient.includes('OFFLINE_SESSION_MS=8*60*60*1000')) fail('Patrol Senior offline queue must be encrypted, session-bound and replayed after reconnection');
if (!patrolSeniorClient.includes('Войдите снова, чтобы продолжить синхронизацию.') || !patrolSeniorClient.includes('sessionStorage.removeItem(OFFLINE_MARKER)')) fail('Patrol Senior must preserve its queue and require online reauthentication after session expiry');



if (!server.includes("require('./auth')") || !server.includes('handleAuth(req, res, url)')) {
  fail('server must route requests through the individual authentication module');
}
if (!server.includes("require('./data-crypto')") || !server.includes('validateDataEncryptionKey()')) {
  fail('server must require the application data-encryption key before starting');
}
if (!server.includes("PATRUL_LEGACY_ROLE_TOKENS_ENABLED !== 'true'")) {
  fail('legacy shared role-token API must be disabled by default');
}
for (const route of ['/api/auth/login', '/api/auth/me', '/api/auth/change-password', '/api/admin/users', '/api/session-data/']) {
  if (!cloudSync.includes(route)) fail('browser client missing individual-auth route ' + route);
}
if (cloudSync.includes('Authorization') || cloudSync.includes('Bearer ')) {
  fail('browser client must not send shared bearer tokens');
}

if (!cloudSync.includes("const localDataKey = role + '_v1'") ||
    !cloudSync.includes('localStorage.removeItem(localDataKey)')) {
  fail('cloud sync must remove the plaintext role-data cache after server confirmation');
}

if (!cloudSync.includes('adminButton.parentElement!==document.body') || cloudSync.includes('target.appendChild(adminButton)')) {
  fail('administrator account controls must stay outside the role sidebar');
}
if (!cloudSync.includes("adminButton.className='patrul-admin-control'") || !cloudSync.includes('<span>Администрирование</span>')) {
  fail('administrator access must remain available through the separate top-level control');
}
if (!cloudSync.includes('window.PATRUL_SAVE_NOW=async function()') || !cloudSync.includes('while(busy)await new Promise')) fail('personnel save confirmation must wait for an acknowledged server write');
if (!cloudSync.includes("request('/api/shared-staff')") || !cloudSync.includes("request('/api/shared-staff','PUT'") || !cloudSync.includes('const sharedSaved=await uploadSharedRoster()') || !cloudSync.includes('startSharedPolling') || !cloudSync.includes('postEquipment')) fail('all role pages must load, save, and poll the shared personnel roster');
if (cloudSync.includes('originalSave()')) {
  fail('cloud sync must not persist full application data through the legacy localStorage save function');
}
if (!cloudSync.includes("window.addEventListener('beforeunload'")) {
  fail('cloud sync must warn before closing with unsaved in-memory changes');
}
if (!cloudSync.includes('function forcePasswordChange() {\n    return new Promise(resolve=>') || !cloudSync.includes('await forcePasswordChange()')) {
  fail('the workspace must wait for a required temporary-password change before loading data');
}
if (!cloudSync.includes('const material=JSON.stringify(copy)') || !cloudSync.includes('delete copy.sx.pw')) {
  fail('sync fingerprints and local conflict backups must not expose the exchange password');
}


for (const [file, role] of Object.entries(rolePages)) {
  if (!server.includes("['/" + file + "', '" + file + "']")) {
    fail('server route missing for ' + file);
  }
  if (!index.includes('href="' + file + '"')) fail('index.html link missing for ' + file);

  const html = fs.readFileSync(file, 'utf8');
  if (countMatches(html, /name="theme-color"/g) !== 1 ||
      countMatches(html, /rel="apple-touch-icon"/g) !== 1 ||
      countMatches(html, /name="apple-mobile-web-app-capable"/g) !== 1) {
    fail(file + ' must not contain duplicate PWA metadata declarations');
  }
  if (!html.includes("window.PATRUL_ROLE='" + role + "'")) {
    fail(file + ' has an incorrect or missing role identifier');
  }
  for (const asset of ['cloud-sync.js','ops-workspace.js','personal-workspace.js','staff-workspace.js']) {
    const version = asset === 'cloud-sync.js' ? '20261115-11' : ASSET_VERSION;
    if (!html.includes('src="' + asset + '?v=' + version + '"')) fail(file + ' must load a cache-busted ' + asset);
  }
  if (!html.includes("navigator.serviceWorker.register('/sw.js?v=20261115-14',{updateViaCache:'none'})") || !html.includes('.then(reg=>reg.update())')) fail(file + ' must register and immediately update the versioned service worker');
  if (!html.includes('src="duty-calendar-global.js?v=' + ASSET_VERSION + '"')) fail(file + ' must load the shared duty calendar');
  if (file === 'uchet.html' && (!html.includes('Комплекты постов') || !html.includes('function postKits'))) fail(file + ' must provide master post-equipment templates');
  if (file === 'nachalnik.html' && (!html.includes('postKitText'))) fail(file + ' must show shared post equipment in the duty roster');
  if (html.indexOf('src="staff-workspace.js?v=' + ASSET_VERSION + '"') < html.indexOf('src="personal-workspace.js?v=' + ASSET_VERSION + '"')) fail(file + ' must load staff-workspace.js after the existing role workspaces');
  if (!html.includes('id="patrul-auth-gate"')) fail(file + ' must hide its workspace until authentication succeeds');
  const authGate = html.match(/<style id="patrul-auth-gate">([\s\S]*?)<\/style>/);
  const homeStyles = html.match(/<style id="patrul-home-styles">([\s\S]*?)<\/style>/);
  if (!authGate || authGate[1].trim() !== 'body{visibility:hidden}') {
    fail(file + ' auth gate must contain only the temporary page-visibility rule');
  }
  if (!homeStyles || !homeStyles[1].includes('.home-screen') || !homeStyles[1].includes('.home-panel') || !homeStyles[1].includes('.home-metrics')) {
    fail(file + ' dashboard styles must live outside the removable authentication gate');
  }
  if (html.includes('localStorage.setItem(KEY,JSON.stringify(D))')) fail(file + ' must not persist plaintext application data in localStorage');
  if (!html.includes('function load(){return norm(seed())')) fail(file + ' must not load legacy local data before authentication');
  if (!html.includes("window.addEventListener('patrul:ready',cmFirst)") || !html.includes('cmfirst:async()=>') || !html.includes('await window.PATRUL_SAVE_NOW()') || !html.includes('Первоначальные настройки сохранены на сервере')) fail(file + ' first-run setup must wait for authenticated server data and confirmed save');
  if (!html.includes("if(!c||!c.startsWith('s_'))return;const k=c.slice(2),v=t.type=='checkbox'?t.checked:t.value;D.set[k]=['interval','coef'].includes(k)?(+v||1):v;save()") || !html.includes("toast('Настройка сохранена')")) fail(file + ' initial role settings must persist as they are edited');
  if (!html.includes('delete copy.sx.pw')) fail(file + ' manual backup must not export the shared exchange password');
  if (!html.includes("if(!pw)throw new Error('needpw')") || !html.includes("throw new Error('unencrypted')") || html.includes("return useZ?'ПАТРУЛЬ1Z'")) fail(file + ' inter-role exchange must reject unencrypted packets');

  const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());

  if (!inlineScripts.length) fail(file + ' has no inline application script');

  inlineScripts.forEach((source, index) => {
    try {
      new vm.Script(source, { filename: file + ':inline-' + (index + 1) });
    } catch (error) {
      fail(file + ' inline script ' + (index + 1) + ': ' + error.message);
    }
  });

  console.log(file + ': ' + inlineScripts.length + ' inline script(s) checked');
}

for (const asset of ['cloud-sync.js', 'sw.js', 'staff-workspace.js', 'icon-180.png', 'icon-192.png', 'icon-512.png']) {
  if (!server.includes("['/" + asset + "', '" + asset + "']")) {
    fail('server public-file allowlist missing ' + asset);
  }
}

if (!server.includes("['/ops-workspace.js', 'ops-workspace.js']")) fail('server public-file allowlist missing ops-workspace.js');
if (!server.includes("['/personal-workspace.js', 'personal-workspace.js']")) fail('server public-file allowlist missing personal-workspace.js');
if (!server.includes("['/staff-workspace.js', 'staff-workspace.js']")) fail('server public-file allowlist missing staff-workspace.js');
if (!cacheManifest || !cacheManifest[1].includes("'/staff-workspace.js'")) fail('service worker static cache must include staff-workspace.js');
if (!staffWorkspace.includes('SQ_DEFAULT_COUNT=9') || !staffWorkspace.includes('function sqDepartments()') || !staffWorkspace.includes('sqdepnew') || !staffWorkspace.includes('sqdepdel') || !staffWorkspace.includes('sqdepsave') || !staffWorkspace.includes('Нач. состав') || !staffWorkspace.includes('Отделения') || !staffWorkspace.includes('Поставить отделение')) fail('staff workspace must provide nine initial departments, dynamic department management and duty-post assignment');
if (!staffWorkspace.includes('id="q_birth" type="date"') || !staffWorkspace.includes('birthDate') || !staffWorkspace.includes('Дата рождения') || !staffWorkspace.includes('Укажите корректную дату рождения') || !staffWorkspace.includes('sqInfo(s)')) fail('each patrol officer and patrol senior must have an editable, validated birth date displayed in the roster and department cards');
if (!staffWorkspaceLoader.includes("button.dataset.act = 'sqedit'") || !staffWorkspaceLoader.includes("button.dataset.act = 'sqleadedit'") || !staffWorkspaceLoader.includes('A.sqleadedit = function')) fail('department editor must provide direct edit controls for each patrol officer and the selected senior patrol member');
if (!staffWorkspace.includes("SXC.inn.st=sxISt") || !staffWorkspace.includes("SXC.out=()=>")) fail('personnel records must remain available through the encrypted role-exchange workflow');
if (!staffWorkspace.includes('SXC.inn.dpt=') || !staffWorkspace.includes("k:'staff-departments'") || !staffWorkspace.includes('D.departmentUpdatedAt')) fail('department names and changes must use the encrypted cross-role exchange');
if (!staffWorkspace.includes('await sqPersist()') || !staffWorkspace.includes('Сохранено на сервере')) fail('personnel and department forms must wait for confirmed cloud saving');
if (!staffWorkspace.includes("st!='не в составе'") || !staffWorkspace.includes("x.st='не в составе'")) fail('staff removal must preserve roster history instead of deleting records');
if (staffWorkspace.includes('localStorage.setItem') || staffWorkspace.includes('ntfy')) fail('staff workspace must use existing server-backed role data, not the uploaded standalone storage or ntfy workflow');
if (!staffWorkspace.includes('data-act="sqput"') || !staffWorkspace.includes('gdw()') || !staffWorkspace.includes("s.st=='отстранён'")) fail('duty assignment must write into the current duty record and exclude suspended personnel');
if (!cacheManifest || !cacheManifest[1].includes("'/personal-workspace.js'")) fail('service worker static cache must include personal-workspace.js');
if (!personalWorkspace.includes('patrul:ready') || !personalWorkspace.includes('Уведомления') || !personalWorkspace.includes('Телефон')) fail('personal workspace must expose its ready event, notifications and device mode');
if (!personalWorkspace.includes("uchet:'Старший мастер'") || personalWorkspace.includes('Старший механик')) fail('personal workspace must use the agreed Senior Master role title');
if (!personalWorkspace.includes('localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,\'0\'),String(d.getDate()).padStart(2,\'0\')].join(\'-\')') || !personalWorkspace.includes("r.fields.deadline||r.fields.due") || !personalWorkspace.includes("/^\\d{4}-\\d{2}-\\d{2}$/")) fail('personal notifications must use local calendar dates, accept due aliases and ignore malformed dates');
if (!personalWorkspace.includes('parsed.getFullYear()===y&&parsed.getMonth()===m-1&&parsed.getDate()===d')) fail('personal notifications must reject impossible calendar dates');
if (!personalWorkspace.includes("Number(b.late)-Number(a.late)||(a.date?0:1)-(b.date?0:1)||a.date.localeCompare(b.date)")) fail('personal notifications must prioritize overdue and dated tasks before undated attention items');
if (!opsWorkspace.includes('nachalnik:') || !opsWorkspace.includes('zam:') || !opsWorkspace.includes('uchet:') || !opsWorkspace.includes('dokumentoved:')) fail('role workspaces must define all four roles');
if (!opsWorkspace.includes("modules.unshift({id:'sharedTasks'") || !opsWorkspace.includes("configs.uchet.modules.unshift({id:'roleControl'") || !opsWorkspace.includes("m.kind==='sharedTasks'") || !opsWorkspace.includes("m.kind==='roleControl'") || !opsWorkspace.includes('async function sharedTasks(') || !opsWorkspace.includes('async function roleControl(')) fail('Senior Master dashboard must visibly expose shared tasks and audited read-only control of every role');
if (!opsWorkspace.includes('const dueToday=data().records.filter(r=>{const due=calendarDay(r.fields&&(r.fields.deadline||r.fields.due))') || !opsWorkspace.includes('due===now')) fail('home deadline indicator must validate date values consistently');
if (!opsWorkspace.includes('const fields=r.fields||{},raw=calendarDay(fields.deadline||fields.due);return !r.archived&&raw&&raw<t') || !opsWorkspace.includes('const calendarDay=value=>') || !opsWorkspace.includes("String(value||'').slice(0,10)") || !opsWorkspace.includes('date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?day')) fail('overdue home indicator must validate real calendar dates and tolerate missing fields');
if (!opsWorkspace.includes('const dueToday=rows.filter') || !opsWorkspace.includes('fields.deadline||fields.due') || !opsWorkspace.includes('Укажите корректный период') || !opsWorkspace.includes('срок сегодня')) fail('reports must count due aliases, show due-today items and validate date range');
if (!opsWorkspace.includes('function reports()') || !opsWorkspace.includes('По разделам') || !opsWorkspace.includes('просрочено сейчас') || !opsWorkspace.includes('не завершено') || !opsWorkspace.includes('завершено')) fail('period reports must include summary metrics and module breakdown');
if (!opsWorkspace.includes("id:'equipmentSummary'") || !opsWorkspace.includes('function equipmentSummary()') || !opsWorkspace.includes('Имущество, требующее внимания') || !opsWorkspace.includes('Инвентаризационные расхождения') || !opsWorkspace.includes('ТО в ближайшие 30 дней') || !opsWorkspace.includes('Проверки и ТО в ближайшие 30 дней')) fail('senior master workspace must provide a derived equipment overview with upcoming maintenance');
if (!opsWorkspace.includes("const closedStatuses=['Выполнено','Закрыто','Исполнено','В архиве']") || !opsWorkspace.includes("!closedStatuses.includes(r.status)")) fail('deadline control must exclude completed and archived records');
if (!opsWorkspace.includes('const calendarDay=value=>') || !opsWorkspace.includes('date.getMonth()===m-1&&date.getDate()===d?day:\'\'') || !opsWorkspace.includes('const maintenanceDay=r=>calendarDay((r.fields||{}).deadline)') || !opsWorkspace.includes("!['Выполнено','Закрыто','Исполнено','В архиве'].includes(r.status)")) fail('workspace deadlines must validate real calendar dates and exclude archived maintenance');
if (!opsWorkspace.includes('const taskDeadline=r=>calendarDay((r.fields||{}).deadline||(r.fields||{}).due)') || !opsWorkspace.includes('taskDeadline(r)<now') || !opsWorkspace.includes('taskDeadline(r)===now') || !opsWorkspace.includes('taskDeadline(r)>now')) fail('personal task summaries must validate calendar dates and tolerate missing fields');
if (!opsWorkspace.includes("deadline?dateText(deadline):'Без срока'") || !opsWorkspace.includes("const fields=r.fields||{},priority=fields.priority||'Обычный',deadline=taskDeadline(r)")) fail('home page must display normalized personal task dates and tolerate missing fields');
if (!opsWorkspace.includes('function searchableText(value)') || !opsWorkspace.includes("Object.entries(value).map(([key,item])=>key+' '+searchableText(item)).join(' ')") || !opsWorkspace.includes("text.startsWith('data:image/')?'':text")) fail('workspace search must index nested field values while skipping embedded image data');
if (!opsWorkspace.includes("r.module==='approvals'")) fail('document archive search must include approval and resolution records');
if (!opsWorkspace.includes('function matchesSearch(value,query)') || !opsWorkspace.includes(".split(/\\s+/).filter(Boolean)") || !opsWorkspace.includes('terms.every(term=>haystack.includes(term))') || !opsWorkspace.includes('matchesSearch(r,q)')) fail('workspace searches must match all query words across nested record fields');
if (!opsWorkspace.includes("const todayTasks=openTasks.filter(r=>taskDeadline(r)===now).slice(0,5)") || !opsWorkspace.includes("const nextTasks=openTasks.filter(r=>taskDeadline(r)>now).slice(0,5)") || !opsWorkspace.includes("const undatedTasks=openTasks.filter(r=>!taskDeadline(r)).slice(0,5)") || !opsWorkspace.includes("'<h3>Срок сегодня</h3>'+taskRows(todayTasks,'today')") || !opsWorkspace.includes("kind==='today'?'Срок сегодня · '")) fail('home page must show today, upcoming and undated personal tasks separately');
if (!opsWorkspace.includes("const taskPriority=r=>({Срочный:0,Важный:1,Обычный:2}[r.fields&&r.fields.priority]??2)") || !opsWorkspace.includes('taskPriority(a)-taskPriority(b)') || !opsWorkspace.includes("priority==='Срочный'") || !opsWorkspace.includes("priority==='Важный'")) fail('home page must sort personal tasks by priority and visibly distinguish urgent and important tasks');
if (!opsWorkspace.includes("id:'personalTasks'") || !opsWorkspace.includes('Просроченные задачи') || !opsWorkspace.includes('lateTasks') || !opsWorkspace.includes('Ближайшие личные задачи') || !opsWorkspace.includes('Личный список текущей учётной записи') || !opsWorkspace.includes("action==='complete'") || !opsWorkspace.includes('Отметить выполненной') || !opsWorkspace.includes('function globalSearch(query)') || !opsWorkspace.includes('function deadlineState(record)') || !opsWorkspace.includes('Результаты общего поиска') || !opsWorkspace.includes('Просроченные') || !opsWorkspace.includes("id:'audit'") || !opsWorkspace.includes('История действий') || !opsWorkspace.includes('ops-audit-search') || !opsWorkspace.includes('@media(max-width:360px)') || !opsWorkspace.includes('ops-task-row{align-items:flex-start;flex-direction:column}') || !opsWorkspace.includes("id:'deadlines'") || !opsWorkspace.includes('Открыть контроль сроков')) fail('all role workspaces must provide a personal task list and upcoming task summary');
if (opsWorkspace.includes('localStorage.setItem') || opsWorkspace.includes('localStorage.removeItem')) fail('role workspace must persist only through the encrypted session-data sync');
if (!serviceWorker.includes("url.pathname.startsWith('/api/')")) {
  fail('service worker must bypass all API requests');
}
if (!serviceWorker.includes('ASSET_PATHS.has(url.pathname)')) {
  fail('service worker must cache only explicitly allowlisted static assets');
}
if (!cacheManifest || !cacheManifest[1].includes("'/cloud-sync.js'") || !cacheManifest[1].includes("'/ops-workspace.js'")) {
  fail('service worker static cache must include cloud-sync.js');
}

if (!serviceWorker.includes("const CACHE_NAME = 'patrul-static-20261115-14'") || !serviceWorker.includes("'/patrol-senior.js'")) fail('service worker must publish the current offline Patrol Senior client in a versioned precache');
if (!server.includes("['/duty-schedule.js', 'duty-schedule.js']") || !serviceWorker.includes("'/duty-schedule.js'")) fail('server and service worker must serve/cache the duty schedule client');
if (!fs.readFileSync('nachalnik.html', 'utf8').includes('duty-schedule.js?v=20261115-12')) fail('commander cabinet must load the versioned duty schedule client');
if (!patrolSeniorAuth.includes('schedule,isSubstitute') && !patrolSeniorAuth.includes('postConflict,schedule,equipment:')) fail('senior patrol API must expose the department duty schedule and temporary substitution');
if (!patrolSeniorClient.includes('График дежурств и подмена') || !patrolSeniorClient.includes('workspace.schedule.isSubstitute')) fail('senior patrol cabinet must display its assigned duty and temporary substitution');
if (!dutySchedule.includes("TABS.push(['ds','График дежурств'])") || !dutySchedule.includes('departmentAssignments') || !dutySchedule.includes('seniorSubstitutions') || !dutySchedule.includes('Подмена сохранена')) fail('duty calendar must support department assignments and temporary senior-patrol substitutions');
if (!dutySchedule.includes('уже назначен на другое отделение') || !dutySchedule.includes('Постоянное закрепление не меняется')) fail('duty schedule must prevent same-day double booking and keep permanent assignments unchanged');
if (!server.includes("['/duty-calendar-global.js', 'duty-calendar-global.js']") || !serviceWorker.includes("'/duty-calendar-global.js'")) fail('server and service worker must serve/cache the common role calendar');
if (!patrolSeniorPage.includes('window.PATRUL_ROLE="starshiy_patrulya"') || !patrolSeniorPage.includes('src="duty-calendar-global.js?v=' + ASSET_VERSION + '"')) fail('Senior Patrol page must load the shared calendar after setting its role');
if (!patrolSeniorAuth.includes("if(p==='/api/duty-schedule')") || !patrolSeniorAuth.includes("if(p==='/api/duty-roster')") || !patrolSeniorAuth.includes("SHARED_STAFF_ROLES.includes(session.role)") || !patrolSeniorAuth.includes("session.role==='starshiy_patrulya'")) fail('independent schedule and roster endpoints must authenticate role views and scope Senior Patrol');
const uchetPage = fs.readFileSync('uchet.html', 'utf8');
if (!uchetPage.includes('<aside id="nv"></aside>') || !uchetPage.includes('class="sp"')) fail('Senior Master sidebar must provide the calendar insertion point before its flex spacer');
if (!dutyCalendarGlobal.includes("if(spacer)menu.insertBefore(b,spacer)")) fail('shared calendar navigation must be inserted before the sidebar footer spacer so it remains visible');
if (!dutyCalendarGlobal.includes("fetch('/api/duty-schedule?month='") || !dutyCalendarGlobal.includes('Общий график дежурств') || !dutyCalendarGlobal.includes('Календарь дежурств')) fail('all non-commander roles must use the common server-backed duty calendar');
if (!dutyCalendarGlobal.includes("setInterval(()=>{if(overlay)load(false);},30000)") || !patrolSeniorAuth.includes("scope:ownDepartment?'own_department_and_substitutions':'all_departments'")) fail('duty calendar viewers must refresh from the shared server source and Senior Patrol must have scoped visibility');
if (!serviceWorker.includes('const cacheKey = new Request(url.origin + url.pathname)') || !serviceWorker.includes('cache.match(cacheKey)')) fail('service worker must reload versioned assets while retaining path-keyed offline fallbacks');
if (!mailPage.includes('src="/mail.js?v=' + ASSET_VERSION + '"')) fail('mail page must load its cache-busted client');
if (!mailViewerPage.includes('src="/mail-viewer.js?v=' + ASSET_VERSION + '"')) fail('mail viewer must load its cache-busted client');

if (!serviceWorker.includes('cloud-sync.js')) {
  // The sync script is loaded by the HTML and cached through normal network fetches.
  console.log('sw.js: cloud-sync.js is fetched dynamically and cached by the fetch handler');
}

if (!mailClient.includes("const filtered=items.filter(f=>!query||[f.name,f.mime].join(' ').toLocaleLowerCase('ru-RU').includes(query))")) fail('mail archive must support searching saved attachments by file name and format');
if (!mailClient.includes("Поиск по названию или формату файла")) fail('mail archive search must explain which file fields are searchable');
if (!mailClient.includes("copy.textContent='Копировать текст'") || !mailClient.includes('navigator.clipboard.writeText') || !mailClient.includes("document.execCommand('copy')") || !mailClient.includes("copy.textContent='✓ Скопировано'")) fail('mail messages must provide clipboard and fallback copy actions with confirmation');
if (!mailClient.includes("По вашему запросу писем не найдено. Попробуйте изменить запрос.") || !mailClient.includes("В этом разделе пока нет писем.")) fail('mail search and empty folders must show distinct empty states');

if (!process.exitCode) console.log('Patrul static checks passed.');
