'use strict';
const crypto = require('node:crypto');
const { encryptData, decryptData, readRoleData } = require('./data-crypto');
const { promisify } = require('node:util');
const { dutyDateAt,purgeExpiredDutyData } = require('./duty-store');
const scrypt = promisify(crypto.scrypt);
const ROLES = new Set(['nachalnik','zam','uchet','dokumentoved']);
const COOKIE = '__Host-patrul_session';
const loginFailures = new Map();
const sha = v => crypto.createHash('sha256').update(v).digest();
const token = () => crypto.randomBytes(32).toString('base64url');
const equal = (a,b) => { const x=Buffer.from(a||''), y=Buffer.from(b||''); return x.length>0 && x.length===y.length && crypto.timingSafeEqual(x,y); };
function readCookie(req) {
  const out={}; for (const p of (req.headers.cookie||'').split(';')) { const i=p.indexOf('='); if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim()); } return out;
}
function sameOrigin(req) {
  if (!req.headers.origin) return false;
  const expected = process.env.PATRUL_PUBLIC_ORIGIN || '';
  if (!expected) return false;
  try { return new URL(req.headers.origin).origin===new URL(expected).origin; } catch { return false; }
}
async function hashPassword(password) {
  const salt=crypto.randomBytes(16);
  const hash=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return 'scrypt$32768$8$1$'+salt.toString('hex')+'$'+hash.toString('hex');
}
const dummyPasswordHash = hashPassword(crypto.randomBytes(32).toString('hex'));
async function verifyPassword(password, encoded) {
  const p=String(encoded||'').split('$');
  if(p.length!==6||p[0]!=='scrypt'||p[1]!=='32768'||p[2]!=='8'||p[3]!=='1'||!/^[a-f0-9]{32}$/.test(p[4])||!/^[a-f0-9]{128}$/.test(p[5])) return false;
  const h=await scrypt(password,Buffer.from(p[4],'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return crypto.timingSafeEqual(h,Buffer.from(p[5],'hex'));
}
const validPassword = p => typeof p==='string' && p.length>=12 && Buffer.byteLength(p,'utf8')<=256;
function publicUser(u) {
  return {id:u.id,username:u.username,displayName:u.display_name,role:u.role,active:u.is_active,
    systemAdmin:u.is_system_admin,mustChangePassword:u.must_change_password,createdAt:u.created_at};
}
function loginKey(req,name) { return (req.socket.remoteAddress||'unknown')+':'+String(name).toLowerCase().slice(0,100); }
function loginIpKey(req) { return 'ip:' + (req.socket.remoteAddress || 'unknown'); }
function failedIp(req) {
  const now=Date.now(), key=loginIpKey(req); let x=loginFailures.get(key);
  if(!x||x.until<=now) x={count:0,until:now+900000};
  x.count++; if(loginFailures.size>10000) loginFailures.delete(loginFailures.keys().next().value); loginFailures.set(key,x);
  return x.count;
}
function failed(req,name) {
  const now=Date.now(), key=loginKey(req,name); let x=loginFailures.get(key);
  if(!x||x.until<=now) x={count:0,until:now+900000};
  x.count++; if(loginFailures.size>10000) loginFailures.delete(loginFailures.keys().next().value); loginFailures.set(key,x);
  return x.count;
}
const MAIL_FILE_EXTENSIONS = new Set(['pdf','doc','docx','xls','xlsx','csv','txt','rtf','png','jpg','jpeg','webp','html','json']);
function safeMailFilename(value) { const name=String(value||'').normalize('NFKC').split('/').join('_').split(String.fromCharCode(92)).join('_').replace(/[\u0000-\u001f\u007f]/g,'_').replace(/^\.+/,'').trim().slice(0,180); return name||'attachment'; }
function mailFileHeaders(file, disposition) {
  const data=Buffer.isBuffer(file.file_data)?file.file_data:Buffer.from(file.file_data||[]);
  const name=safeMailFilename(file.file_name);
  const fallback=name.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,120)||'attachment';
  const encoded=encodeURIComponent(name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  return {
    'content-type':file.mime_type||'application/octet-stream',
    'content-length':String(data.length),
    'content-disposition':disposition+'; filename="'+fallback+'"; filename*=UTF-8\'\''+encoded,
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'accept-ranges':'none'
  };
}
async function insertMailAttachments(client,threadId,messageId,items) {
  if(items===undefined)return [];
  if(!Array.isArray(items)||items.length>5)throw Object.assign(new Error('Можно прикрепить не более 5 файлов к одному сообщению'),{status:400});
  let total=0;const saved=[];
  for(const item of items){
    if(!item||typeof item!=='object'||typeof item.name!=='string'||typeof item.data!=='string')throw Object.assign(new Error('Некорректное вложение'),{status:400});
    const name=safeMailFilename(item.name),ext=name.includes('.')?name.split('.').pop().toLowerCase():'';
    if(!MAIL_FILE_EXTENSIONS.has(ext))throw Object.assign(new Error('Недопустимый тип файла: '+name),{status:400});
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.data))throw Object.assign(new Error('Повреждены данные файла: '+name),{status:400});
    const data=Buffer.from(item.data,'base64');total+=data.length;
    if(!data.length||data.length>8*1024*1024||total>8*1024*1024||data.toString('base64')!==item.data)throw Object.assign(new Error('Общий размер вложений не должен превышать 8 МБ'),{status:400});
    const mime=({pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv',txt:'text/plain',rtf:'application/rtf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',html:'text/html',json:'application/json'})[ext];
    const q=await client.query('INSERT INTO patrul_mail_attachments(thread_id,message_id,file_name,mime_type,file_size,file_data,sha256) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[threadId,messageId,name,mime,data.length,data,sha(data)]);
    saved.push({id:q.rows[0].id,name,size:data.length,mime});
  }
  return saved;
}


const SHARED_STAFF_ROLES = ['nachalnik','zam','uchet','dokumentoved'];
function sharedNameKey(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function cloneSharedValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function defaultSharedDepartments() {
  return Array.from({length:9}, (_, index) => ({
    id:'legacy-' + (index + 1), name:'Отделение ' + (index + 1), order:index + 1
  }));
}
function buildLegacySharedStaff(roleData) {
  const data = { staff:[], departments:[], aliases:{}, departmentAliases:{} };
  const staffByName = new Map(), departmentById = new Map(), departmentByName = new Map();
  for (const role of SHARED_STAFF_ROLES) {
    data.aliases[role] = {};
    data.departmentAliases[role] = {};
    const departments = Array.isArray(roleData[role] && roleData[role].departments)
      ? roleData[role].departments : [];
    departments.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const id = String(item.id || ('legacy-' + (Number(item.order) || index + 1))).slice(0,120);
      const name = String(item.name || ('Отделение ' + (index + 1))).trim().slice(0,120);
      const key = sharedNameKey(name);
      const existing = departmentById.get(id) || (key && departmentByName.get(key));
      if (existing) {
        if (id !== existing.id) data.departmentAliases[role][id] = existing.id;
        for (const [field, value] of Object.entries(item)) {
          if ((existing[field] == null || existing[field] === '') && value != null && value !== '') existing[field] = cloneSharedValue(value);
        }
      } else {
        const department = {...cloneSharedValue(item), id, name};
        departmentById.set(id, department);
        if (key) departmentByName.set(key, department);
        data.departments.push(department);
      }
    });
  }
  if (!data.departments.length) data.departments = defaultSharedDepartments();
  data.departments.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name), 'ru'));
  data.departments.forEach(department => departmentById.set(String(department.id), department));
  for (const role of SHARED_STAFF_ROLES) {
    const list = Array.isArray(roleData[role] && roleData[role].staff) ? roleData[role].staff : [];
    for (const source of list) {
      if (!source || typeof source !== 'object') continue;
      const name = String(source.name || '').trim().slice(0,160);
      const nameKey = sharedNameKey(name);
      if (!nameKey) continue;
      const incomingKey = String(source.k || ('staff-' + crypto.randomUUID())).slice(0,120);
      const existing = staffByName.get(nameKey);
      if (existing) {
        if (incomingKey !== existing.k) data.aliases[role][incomingKey] = existing.k;
        for (const [field, value] of Object.entries(source)) {
          if ((existing[field] == null || existing[field] === '') && value != null && value !== '') existing[field] = cloneSharedValue(value);
        }
      } else {
        const staff = {...cloneSharedValue(source), k:incomingKey, name};
        if (staff.departmentId != null) {
          const oldDepartmentId = String(staff.departmentId);
          const mapped = data.departmentAliases[role][oldDepartmentId];
          if (mapped) staff.departmentId = mapped;
        } else {
          const legacyOrder = Number(staff.sq);
          if (Number.isInteger(legacyOrder) && legacyOrder > 0) {
            const orderedDepartment = data.departments.find(department => Number(department.order) === legacyOrder);
            staff.departmentId = orderedDepartment ? String(orderedDepartment.id) :
              (data.departmentAliases[role]['legacy-' + legacyOrder] || 'legacy-' + legacyOrder);
          }
        }
        data.staff.push(staff);
        staffByName.set(nameKey, staff);
      }
    }
  }
  return data;
}
function normalizeSharedStaffWrite(source, current, role) {
  const prior = current && typeof current === 'object' ? current : {staff:[],departments:[],aliases:{},departmentAliases:{}};
  const aliases = cloneSharedValue(prior.aliases || {});
  const departmentAliases = cloneSharedValue(prior.departmentAliases || {});
  for (const name of SHARED_STAFF_ROLES) {
    if (!aliases[name]) aliases[name] = {};
    if (!departmentAliases[name]) departmentAliases[name] = {};
  }
  const currentDepartments = Array.isArray(prior.departments) ? prior.departments : [];
  const departmentById = new Map(currentDepartments.map(item => [String(item.id), item]));
  const departmentByName = new Map(currentDepartments.map(item => [sharedNameKey(item.name), item]).filter(entry => entry[0]));
  const departments = [], nextDepartmentByName = new Map(), nextDepartmentById = new Map();
  for (const item of source.departments) {
    const incoming = cloneSharedValue(item);
    const incomingId = String(incoming.id || ('department-' + crypto.randomUUID())).slice(0,120);
    const name = String(incoming.name || '').trim().slice(0,120);
    if (!name) continue;
    const nameKey = sharedNameKey(name);
    const match = departmentById.get(incomingId) || departmentByName.get(nameKey) ||
      nextDepartmentById.get(incomingId) || nextDepartmentByName.get(nameKey);
    const id = match ? String(match.id) : incomingId;
    if (incomingId !== id) departmentAliases[role][incomingId] = id;
    const department = {...(match || {}), ...incoming, id, name};
    const duplicate = nextDepartmentById.get(id);
    if (duplicate) {
      Object.assign(duplicate, department);
      continue;
    }
    departments.push(department);
    nextDepartmentById.set(id, department);
    nextDepartmentByName.set(nameKey, department);
  }
  const currentStaff = Array.isArray(prior.staff) ? prior.staff : [];
  const staffById = new Map(currentStaff.map(item => [String(item.k), item]));
  const staffByName = new Map(currentStaff.map(item => [sharedNameKey(item.name), item]).filter(entry => entry[0]));
  const nextStaff = [], nextStaffById = new Map(), nextStaffByName = new Map();
  for (const item of source.staff) {
    const incoming = cloneSharedValue(item);
    const name = String(incoming.name || '').trim().slice(0,160);
    const nameKey = sharedNameKey(name);
    if (!nameKey) continue;
    const incomingId = String(incoming.k || ('staff-' + crypto.randomUUID())).slice(0,120);
    const match = staffById.get(incomingId) || staffByName.get(nameKey) ||
      nextStaffById.get(incomingId) || nextStaffByName.get(nameKey);
    const id = match ? String(match.k) : incomingId;
    if (incomingId !== id) aliases[role][incomingId] = id;
    const staff = {...(match || {}), ...incoming, k:id, name};
    if (staff.departmentId != null) {
      const oldDepartmentId = String(staff.departmentId);
      if (departmentAliases[role][oldDepartmentId]) staff.departmentId = departmentAliases[role][oldDepartmentId];
      else if (nextDepartmentById.has(oldDepartmentId)) staff.departmentId = oldDepartmentId;
    } else {
      const legacyOrder = Number(staff.sq);
      if (Number.isInteger(legacyOrder) && legacyOrder > 0) {
        const orderedDepartment = departments.find(department => Number(department.order) === legacyOrder);
        if (orderedDepartment) staff.departmentId = String(orderedDepartment.id);
      }
    }
    const duplicate = nextStaffById.get(id);
    if (duplicate) {
      Object.assign(duplicate, staff);
      continue;
    }
    nextStaff.push(staff);
    nextStaffById.set(id, staff);
    nextStaffByName.set(nameKey, staff);
  }
  const postEquipment = role === 'uchet' && Array.isArray(source.postEquipment)
    ? source.postEquipment.slice(0,100).map((post,index)=>({
        id:String(post && post.id || ('post-' + (index + 1))).slice(0,120),
        name:String(post && post.name || '').trim().slice(0,120),
        items:(Array.isArray(post && post.items) ? post.items : []).slice(0,200).map(item=>({
          id:String(item && item.id || '').slice(0,120),
          name:String(item && item.name || '').trim().slice(0,160),
          qty:Math.max(1,Math.min(1000,Math.floor(Number(item && item.qty) || 1))),
          unit:String(item && item.unit || 'шт.').slice(0,40)
        })).filter(item=>item.id && item.name)
      })).filter(post=>post.name)
    : cloneSharedValue(prior.postEquipment || []);
  return {staff:nextStaff, departments, aliases, departmentAliases, postEquipment};
}

function createAuth(pool,send,readJson) {
  async function audit(actor,event,target,details={}) {
    await pool.query('INSERT INTO patrul_audit_log(actor_user_id,event_type,target_user_id,details) VALUES($1,$2,$3,$4::jsonb)',
      [actor,event,target,JSON.stringify(details)]);
  }
  async function sessionFor(req) {
    const t=readCookie(req)[COOKIE]; if(!t||t.length<40||t.length>100) return null;
    const r=await pool.query('SELECT s.id AS session_id,s.csrf_token_hash,u.* FROM patrul_sessions s JOIN patrul_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.is_active=TRUE',[sha(t)]);
    return r.rowCount?r.rows[0]:null;
  }
  async function newSession(user,res) {
    const t=token(), csrf=token();
    await pool.query('INSERT INTO patrul_sessions(user_id,token_hash,csrf_token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL \'12 days\')',[user.id,sha(t),sha(csrf)]);
    res.setHeader('set-cookie',COOKIE+'='+encodeURIComponent(t)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1036800');
    return csrf;
  }
  async function csrfOk(req,s) {
    return sameOrigin(req)&&typeof req.headers['x-patrul-csrf']==='string'&&equal(sha(req.headers['x-patrul-csrf']),s.csrf_token_hash);
  }
  async function readSharedStaffForSenior() {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO patrul_shared_staff(id,data,version) VALUES(1,NULL,0) ON CONFLICT(id) DO NOTHING');
      let q=await client.query('SELECT data,version FROM patrul_shared_staff WHERE id=1 FOR UPDATE');
      let row=q.rows[0];
      if(!row.data) {
        const legacyRows=await client.query("SELECT role,data FROM patrul_role_data WHERE role = ANY($1::text[]) ORDER BY CASE role WHEN 'nachalnik' THEN 1 WHEN 'zam' THEN 2 WHEN 'uchet' THEN 3 ELSE 4 END",[SHARED_STAFF_ROLES]);
        const roleData={};
        for(const legacy of legacyRows.rows) roleData[legacy.role]=decryptData(legacy.data,legacy.role);
        const initial=buildLegacySharedStaff(roleData);
        q=await client.query('UPDATE patrul_shared_staff SET data=$1::jsonb,version=1,updated_at=NOW() WHERE id=1 RETURNING data,version',[JSON.stringify(encryptData(initial,'shared_staff'))]);
        row=q.rows[0];
      }
      const data=decryptData(row.data,'shared_staff');
      await client.query('COMMIT');
      return data;
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>{});
      throw error;
    } finally { client.release(); }
  }
  function seniorSurnameKey(value) {
    return sharedNameKey(String(value||'').trim().split(/\s+/)[0]||'');
  }
  function isSeniorRosterEntry(person) {
    return !!person && /старший\s+патруля/i.test(String(person.pos||'')) &&
      !['не в составе','отстранён','отстранен'].includes(String(person.st||'').trim().toLocaleLowerCase('ru-RU')) &&
      !!String(person.departmentId||'');
  }
  async function currentSeniorProfile(session) {
    if(!session||session.role!=='starshiy_patrulya') return null;
    const q=await pool.query('SELECT staff_key,department_id,display_name FROM patrul_patrol_senior_credentials WHERE user_id=$1',[session.id]);
    if(!q.rowCount) return null;
    const data=await readSharedStaffForSenior();
    const person=(Array.isArray(data.staff)?data.staff:[]).find(item=>String(item.k)===String(q.rows[0].staff_key));
    if(!isSeniorRosterEntry(person)||String(person.departmentId)!==String(q.rows[0].department_id)) return null;
    const department=(Array.isArray(data.departments)?data.departments:[]).find(item=>String(item.id)===String(person.departmentId));
    if(!department) return null;
    return {person,department,data};
  }
  async function admin(req,res,needsCsrf) {
    const s=await sessionFor(req);
    if(!s){send(res,401,{error:'Требуется персональный вход'});return null;}
    if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return null;}
    if(!s.is_system_admin){send(res,403,{error:'Недостаточно прав'});return null;}
    if(needsCsrf&&!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return null;}
    return s;
  }
  return async function handle(req,res,url) {
    const p=url.pathname;
    if(!p.startsWith('/api/auth/')&&!p.startsWith('/api/admin/')&&!p.startsWith('/api/session-data/')&&p!=='/api/shared-staff'&&!p.startsWith('/api/mail/')&&!p.startsWith('/api/patrol-senior/')&&p!=='/api/tasks'&&!p.startsWith('/api/tasks/')&&!p.startsWith('/api/control/')&&!p.startsWith('/api/documents/')&&p!=='/api/duty-schedule'&&p!=='/api/duty-roster') return false;
    try {
      if(p==='/api/duty-schedule') {
        const session=await sessionFor(req);
        if(!session){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(session.must_change_password){send(res,403,{error:'Сначала завершите настройку учётной записи'});return true;}
        if(!SHARED_STAFF_ROLES.includes(session.role)&&session.role!=='starshiy_patrulya'){
          send(res,403,{error:'Просмотр графика недоступен для этой роли'});return true;
        }
        await purgeExpiredDutyData(pool);
        if(req.method==='GET') {
          const month=String(url.searchParams.get('month')||dutyDateAt().slice(0,7));
          if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){send(res,400,{error:'Укажите корректный месяц'});return true;}
          const monthStart=month+'-01';
          const nextMonthDate=new Date(monthStart+'T00:00:00.000Z');
          nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth()+1);
          const monthEnd=nextMonthDate.toISOString().slice(0,10);
          const shared=await readSharedStaffForSenior();
          let ownDepartment=null,ownSeniorKey='';
          if(session.role==='starshiy_patrulya'){
            const profile=await currentSeniorProfile(session);
            if(!profile){send(res,403,{error:'Доступ к графику отделения отсутствует'});return true;}
            ownDepartment={id:String(profile.department.id),name:String(profile.department.name||profile.department.id)};
            ownSeniorKey=String(profile.person.k);
          }
          const q=await pool.query(
            "SELECT to_char(duty_date,'YYYY-MM-DD') AS date,assignments,substitutions,version,updated_at FROM patrul_duty_schedule WHERE duty_date>=$1::date AND duty_date<$2::date ORDER BY duty_date",
            [monthStart,monthEnd]
          );
          const deptList=(shared.departments||[]).map(item=>({id:String(item.id),name:String(item.name||item.id)}));
          const departmentById=new Map(deptList.map(item=>[item.id,item]));
          const departmentByName=new Map(deptList.map(item=>[sharedNameKey(item.name),item]));
          const canonicalDepartment=item=>departmentById.get(String(item.departmentId||''))||departmentByName.get(sharedNameKey(item.departmentName||''))||null;
          const ownName=ownDepartment?sharedNameKey(ownDepartment.name):'';
          const days=q.rows.map(day=>{
            const substitutions=Array.isArray(day.substitutions)?day.substitutions:[];
            const assignments=(Array.isArray(day.assignments)?day.assignments:[]).map(item=>{
              const department=canonicalDepartment(item);
              const substitution=substitutions.find(entry=>{
                const subDepartment=canonicalDepartment(entry);
                return subDepartment&&department&&subDepartment.id===department.id;
              });
              return {
                departmentId:department?department.id:String(item.departmentId||''),
                departmentName:department?department.name:String(item.departmentName||'Отделение'),
                post:String(item.post||''),
                seniorId:String(item.seniorId||''),
                seniorName:String(item.seniorName||''),
                effectiveSenior:String(substitution&&substitution.substituteSenior||item.seniorName||''),
                isSubstitute:!!substitution,
                substituteSeniorId:String(substitution&&substitution.substituteSeniorId||''),
                substituteSenior:String(substitution&&substitution.substituteSenior||''),
                substituteReason:String(substitution&&substitution.reason||'')
              };
            }).filter(item=>!ownDepartment||item.departmentId===ownDepartment.id||sharedNameKey(item.departmentName)===ownName||item.substituteSeniorId===ownSeniorKey);
            const visibleSubstitutions=substitutions.filter(item=>{
              const department=canonicalDepartment(item);
              return !ownDepartment||(department&&department.id===ownDepartment.id)||String(item.substituteSeniorId||'')===ownSeniorKey;
            }).map(item=>({...item,departmentId:String((canonicalDepartment(item)||{}).id||item.departmentId||'')}));
            return {date:day.date,assignments,substitutions:visibleSubstitutions,version:Number(day.version)||0};
          });
          const headQ=await pool.query("SELECT data,version FROM patrul_role_data WHERE role='nachalnik'");
          const head=headQ.rowCount?await readRoleData(pool,'nachalnik',headQ.rows[0]):null;
          const posts=String(head&&head.set&&head.set.posts||'').split(',').map(item=>item.trim()).filter(Boolean);
          send(res,200,{
            month,days,departments:ownDepartment?[ownDepartment]:deptList,posts,
            version:q.rows.reduce((max,row)=>Math.max(max,Number(row.version)||0),0),
            updatedAt:q.rows.length?q.rows[q.rows.length-1].updated_at:null,
            readOnly:true,actorRole:session.role,
            scope:ownDepartment?'own_department_and_substitutions':'all_departments'
          });
          return true;
        }
        if(req.method==='PUT') {
          if(session.role!=='nachalnik'){send(res,403,{error:'Изменять график может только начальник патруля'});return true;}
          if(!(await csrfOk(req,session))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const body=await readJson(req);
          const date=typeof body.date==='string'?body.date.trim():'';
          const expectedVersion=Number(body.expectedVersion);
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||
            new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<dutyDateAt()||
            !Number.isSafeInteger(expectedVersion)||expectedVersion<0||
            !Array.isArray(body.assignments)||body.assignments.length>100||
            (body.substitutions!==undefined&&(!Array.isArray(body.substitutions)||body.substitutions.length>100))){
            send(res,400,{error:'Проверьте дату, версию и список назначений'});return true;
          }
          const shared=await readSharedStaffForSenior();
          const departments=new Map((shared.departments||[]).map(item=>[String(item.id),item]));
          const assignmentIds=new Set();
          const seniorBookingKeys=new Set();
          const assignments=[];
          for(const item of body.assignments){
            if(!item||typeof item!=='object'){send(res,400,{error:'Некорректное назначение отделения'});return true;}
            const departmentId=String(item.departmentId||'').trim(),department=departments.get(departmentId);
            const post=typeof item.post==='string'?item.post.trim():'';
            if(!department||!post||post.length>180||assignmentIds.has(departmentId)){
              send(res,400,{error:'Отделение должно существовать, пост — быть заполнен, повторные назначения запрещены'});return true;
            }
            assignmentIds.add(departmentId);
            const seniorId=String(item.seniorId||'').trim(),seniorName=String(item.seniorName||'').trim();
            const seniorKey=seniorId?'id:'+seniorId:(seniorName?'name:'+sharedNameKey(seniorName):'');
            if(seniorKey&&seniorBookingKeys.has(seniorKey)){
              send(res,400,{error:'Этот Старший патруля уже назначен на другое отделение в этот день.'});return true;
            }
            if(seniorKey)seniorBookingKeys.add(seniorKey);
            assignments.push({
              departmentId,departmentName:String(department.name||'').slice(0,160),post,
              seniorId:seniorId.slice(0,160),
              seniorName:seniorName.slice(0,160),
              updatedAt:new Date().toISOString(),
              updatedBy:String(session.display_name||session.username||'Начальник патруля').slice(0,160)
            });
          }
          const substitutions=[];
          const substitutionIds=new Set();
          for(const item of body.substitutions||[]){
            if(!item||typeof item!=='object'){send(res,400,{error:'Некорректная подмена старшего патруля'});return true;}
            const departmentId=String(item.departmentId||'').trim();
            const department=departments.get(departmentId);
            const targetAssignment=assignments.find(entry=>entry.departmentId===departmentId);
            const primarySenior=String(item.primarySenior||'').trim();
            const substituteSenior=String(item.substituteSenior||'').trim();
            const reason=String(item.reason||'').trim();
            if(!department||!targetAssignment||substitutionIds.has(departmentId)||
              !primarySenior||!substituteSenior||sharedNameKey(primarySenior)===sharedNameKey(substituteSenior)||
              sharedNameKey(targetAssignment.seniorName)!==sharedNameKey(primarySenior)||!reason||
              primarySenior.length>160||substituteSenior.length>160||reason.length>500){
              send(res,400,{error:'Подмена должна относиться к назначенному отделению и содержать разных старшего и заменяющего с основанием'});return true;
            }
            substitutionIds.add(departmentId);
            const replacementId=String(item.substituteSeniorId||'').trim();
            const replacementKey=replacementId?'id:'+replacementId:'name:'+sharedNameKey(substituteSenior);
            if(seniorBookingKeys.has(replacementKey)){
              send(res,400,{error:'Этот Старший патруля уже назначен на другое отделение в этот день.'});return true;
            }
            seniorBookingKeys.add(replacementKey);
            substitutions.push({
              departmentId,departmentName:String(department.name||'').slice(0,160),
              primarySenior,primarySeniorId:String(item.primarySeniorId||'').slice(0,160),
              substituteSenior,substituteSeniorId:replacementId.slice(0,160),
              reason,date,createdAt:new Date().toISOString(),
              createdBy:String(session.display_name||session.username||'Начальник патруля').slice(0,160)
            });
          }
          const saved=await pool.query(
            'INSERT INTO patrul_duty_schedule(duty_date,assignments,substitutions,version,updated_by,updated_at) VALUES($1,$2::jsonb,$3::jsonb,1,$4,NOW()) '+
            'ON CONFLICT(duty_date) DO UPDATE SET assignments=EXCLUDED.assignments,substitutions=EXCLUDED.substitutions,version=patrul_duty_schedule.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW() '+
            'WHERE patrul_duty_schedule.version=$5 RETURNING version,updated_at',
            [date,JSON.stringify(assignments),JSON.stringify(substitutions),session.id,expectedVersion]
          );
          if(!saved.rowCount){
            const current=await pool.query('SELECT version FROM patrul_duty_schedule WHERE duty_date=$1::date',[date]);
            send(res,409,{error:'Назначения на эту дату уже изменились. Обновите график.',currentVersion:current.rowCount?Number(current.rows[0].version):0});return true;
          }
          await audit(session.id,'duty_schedule_updated',session.id,{date,assignments:assignments.length,substitutions:substitutions.length});
          send(res,200,{date,assignments,substitutions,version:Number(saved.rows[0].version),updatedAt:saved.rows[0].updated_at});
          return true;
        }
        send(res,405,{error:'Метод не поддерживается'});return true;
      }

      if(p==='/api/duty-roster') {
        const session=await sessionFor(req);
        if(!session){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(session.must_change_password){send(res,403,{error:'Сначала завершите настройку учётной записи'});return true;}
        if(!SHARED_STAFF_ROLES.includes(session.role)){
          send(res,403,{error:'Просмотр дневного наряда недоступен для этой роли'});return true;
        }
        await purgeExpiredDutyData(pool);
        if(req.method==='GET') {
          const all=url.searchParams.get('all')==='1';
          if(all&&session.role==='starshiy_patrulya'){send(res,403,{error:'Просмотр всех нарядов недоступен для этой роли'});return true;}
          const date=String(url.searchParams.get('date')||dutyDateAt());
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||
            new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date){send(res,400,{error:'Укажите корректную дату'});return true;}
          if(all){
            const q=await pool.query(
              "SELECT to_char(r.duty_date,'YYYY-MM-DD') AS date,r.data,r.version,r.updated_at,s.assignments,s.substitutions " +
              "FROM patrul_duty_rosters r LEFT JOIN patrul_duty_schedule s ON s.duty_date=r.duty_date " +
              "WHERE r.duty_date>=$1::date ORDER BY r.duty_date",[dutyDateAt()]);
            send(res,200,{items:q.rows.map(row=>({
              date:row.date,data:row.data,version:Number(row.version),updatedAt:row.updated_at,
              schedule:{assignments:Array.isArray(row.assignments)?row.assignments:[],substitutions:Array.isArray(row.substitutions)?row.substitutions:[]}
            }))});
            return true;
          }
          const q=await pool.query(
            "SELECT r.data,r.version,r.updated_at,s.assignments,s.substitutions " +
            "FROM (SELECT $1::date AS duty_date) selected " +
            "LEFT JOIN patrul_duty_rosters r ON r.duty_date=selected.duty_date " +
            "LEFT JOIN patrul_duty_schedule s ON s.duty_date=selected.duty_date",
            [date]);
          const row=q.rows[0];
          send(res,200,{
            date,data:row.data&&typeof row.data==='object'?row.data:{},
            version:row.version?Number(row.version):0,updatedAt:row.updated_at||null,
            schedule:{assignments:Array.isArray(row.assignments)?row.assignments:[],substitutions:Array.isArray(row.substitutions)?row.substitutions:[]}
          });
          return true;
        }
        if(req.method==='PUT') {
          if(session.role!=='nachalnik'){send(res,403,{error:'Изменять наряд может только начальник патруля'});return true;}
          if(!(await csrfOk(req,session))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const body=await readJson(req);
          const date=typeof body.date==='string'?body.date.trim():'';
          const expectedVersion=Number(body.expectedVersion);
          const data=body.data;
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||
            new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<dutyDateAt()||
            !Number.isSafeInteger(expectedVersion)||expectedVersion<0||
            !data||typeof data!=='object'||Array.isArray(data)||
            (data.rows!==undefined&&(!data.rows||typeof data.rows!=='object'||Array.isArray(data.rows)))||
            (data.defects!==undefined&&(!Array.isArray(data.defects)||data.defects.length>1000))||
            (data.incs!==undefined&&(!Array.isArray(data.incs)||data.incs.length>1000))||
            (data.rows&&Object.entries(data.rows).some(([post,rows])=>!post||post.length>180||!Array.isArray(rows)||rows.length>300))){
            send(res,400,{error:'Проверьте дату и содержание наряда'});return true;
          }
          const rosterData={...data};
          // Назначения календаря живут отдельно и никогда не копируются в ежедневный наряд.
          delete rosterData.departmentAssignments;
          delete rosterData.seniorSubstitutions;
          const saved=await pool.query(
            'INSERT INTO patrul_duty_rosters(duty_date,data,version,updated_by,updated_at) VALUES($1,$2::jsonb,1,$3,NOW()) '+
            'ON CONFLICT(duty_date) DO UPDATE SET data=EXCLUDED.data,version=patrul_duty_rosters.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW() '+
            'WHERE patrul_duty_rosters.version=$4 RETURNING version,updated_at',
            [date,JSON.stringify(rosterData),session.id,expectedVersion]
          );
          if(!saved.rowCount){
            const current=await pool.query('SELECT version FROM patrul_duty_rosters WHERE duty_date=$1::date',[date]);
            send(res,409,{error:'Наряд на эту дату уже изменился. Обновите данные.',currentVersion:current.rowCount?Number(current.rows[0].version):0});return true;
          }
          await audit(session.id,'duty_roster_updated',session.id,{date,staffRows:Object.values(rosterData.rows||{}).reduce((sum,rows)=>sum+rows.filter(row=>row&&String(row.fio||'').trim()).length,0)});
          send(res,200,{date,data:rosterData,version:Number(saved.rows[0].version),updatedAt:saved.rows[0].updated_at});
          return true;
        }
        send(res,405,{error:'Метод не поддерживается'});return true;
      }
      if(p==='/api/patrol-senior/eligible'&&req.method==='GET') {
        const session=await sessionFor(req);
        if(!session){send(res,401,{error:'Требуется вход'});return true;}
        if(session.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(!SHARED_STAFF_ROLES.includes(session.role)){send(res,403,{error:'Выдавать коды активации могут только вышестоящие должностные лица'});return true;}
        const data=await readSharedStaffForSenior();
        const seniors=(Array.isArray(data.staff)?data.staff:[]).filter(isSeniorRosterEntry);
        const keys=seniors.map(person=>String(person.k));
        const [registered,invites]=await Promise.all([
          keys.length?pool.query('SELECT staff_key FROM patrul_patrol_senior_credentials WHERE staff_key=ANY($1::text[])',[keys]):{rows:[]},
          keys.length?pool.query('SELECT staff_key FROM patrul_patrol_senior_invites WHERE staff_key=ANY($1::text[]) AND consumed_at IS NULL AND expires_at>NOW()',[keys]):{rows:[]}
        ]);
        const registeredKeys=new Set(registered.rows.map(row=>String(row.staff_key)));
        const invitedKeys=new Set(invites.rows.map(row=>String(row.staff_key)));
        const departments=new Map((data.departments||[]).map(item=>[String(item.id),item.name]));
        send(res,200,{seniors:seniors.map(person=>({
          staffKey:String(person.k),name:String(person.name||''),
          departmentName:departments.get(String(person.departmentId))||'Отделение не найдено',
          registered:registeredKeys.has(String(person.k)),
          codeIssued:invitedKeys.has(String(person.k))
        }))});
        return true;
      }
      if(p==='/api/patrol-senior/activation-code'&&req.method==='POST') {
        const session=await sessionFor(req);
        if(!session){send(res,401,{error:'Требуется вход'});return true;}
        if(session.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(!SHARED_STAFF_ROLES.includes(session.role)){send(res,403,{error:'Выдавать коды активации могут только вышестоящие должностные лица'});return true;}
        if(!(await csrfOk(req,session))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
        const b=await readJson(req),staffKey=typeof b.staffKey==='string'?b.staffKey.trim().slice(0,120):'';
        if(!staffKey){send(res,400,{error:'Не указан сотрудник'});return true;}
        const data=await readSharedStaffForSenior();
        const person=(data.staff||[]).find(item=>String(item.k)===staffKey);
        if(!isSeniorRosterEntry(person)){send(res,404,{error:'Действующий старший патруля не найден в личном составе'});return true;}
        const registered=await pool.query('SELECT 1 FROM patrul_patrol_senior_credentials WHERE staff_key=$1',[staffKey]);
        if(registered.rowCount){send(res,409,{error:'Для этого сотрудника уже создана учётная запись'});return true;}
        const code=String(crypto.randomInt(10000000,100000000)),codeHash=await hashPassword(code);
        const saved=await pool.query(
          'INSERT INTO patrul_patrol_senior_invites(staff_key,activation_code_hash,expires_at,created_by,created_at,consumed_at) VALUES($1,$2,NOW()+INTERVAL \'30 minutes\',$3,NOW(),NULL) '+
          'ON CONFLICT(staff_key) DO UPDATE SET activation_code_hash=EXCLUDED.activation_code_hash,expires_at=EXCLUDED.expires_at,created_by=EXCLUDED.created_by,created_at=NOW(),consumed_at=NULL RETURNING expires_at',
          [staffKey,codeHash,session.id]);
        await audit(session.id,'patrol_senior_activation_code_issued',null,{staffKey,expiresAt:saved.rows[0].expires_at});
        send(res,201,{code,expiresAt:saved.rows[0].expires_at,staffName:person.name});
        return true;
      }
      if(p==='/api/patrol-senior/enroll'&&req.method==='POST') {
        if(!sameOrigin(req)){send(res,403,{error:'Недопустимый источник'});return true;}
        const b=await readJson(req);
        const surname=typeof b.surname==='string'?b.surname.trim().slice(0,80):'';
        const surnameKey=seniorSurnameKey(surname);
        const activationCode=typeof b.activationCode==='string'?b.activationCode.trim():'';
        const pin=typeof b.pin==='string'?b.pin:'';
        const key=loginKey(req,surnameKey),old=loginFailures.get(key),ipState=loginFailures.get(loginIpKey(req));
        if(ipState&&ipState.until>Date.now()&&ipState.count>=60){send(res,429,{error:'Слишком много попыток с этого адреса. Повторите позже.'},{'retry-after':String(Math.ceil((ipState.until-Date.now())/1000))});return true;}
        if(old&&old.until>Date.now()&&old.count>=8){send(res,429,{error:'Слишком много попыток. Повторите позже.'},{'retry-after':String(Math.ceil((old.until-Date.now())/1000))});return true;}
        if(!/^[\p{L}-]{2,80}$/u.test(surname)||!surnameKey||!/^\d{8}$/.test(activationCode)||!/^\d{6}$/.test(pin)){
          failed(req,surnameKey||'invalid');failedIp(req);send(res,400,{error:'Введите фамилию, одноразовый код из 8 цифр и PIN из 6 цифр'});return true;
        }
        const data=await readSharedStaffForSenior();
        let candidates=(Array.isArray(data.staff)?data.staff:[]).filter(person=>isSeniorRosterEntry(person)&&seniorSurnameKey(person.name)===surnameKey);
        if(!candidates.length){failed(req,surnameKey);failedIp(req);send(res,404,{error:'Старший патруля с такой фамилией не найден в личном составе'});return true;}
        const staffKeys=candidates.map(person=>String(person.k));
        const registered=await pool.query('SELECT staff_key FROM patrul_patrol_senior_credentials WHERE staff_key=ANY($1::text[])',[staffKeys]);
        const registeredKeys=new Set(registered.rows.map(row=>String(row.staff_key)));
        candidates=candidates.filter(person=>!registeredKeys.has(String(person.k)));
        if(!candidates.length){send(res,409,{error:'Первоначальная регистрация уже выполнена. Используйте вход по фамилии и PIN.'});return true;}
        const invites=await pool.query(
          'SELECT staff_key,activation_code_hash FROM patrul_patrol_senior_invites WHERE staff_key=ANY($1::text[]) AND consumed_at IS NULL AND expires_at>NOW()',
          [candidates.map(person=>String(person.k))]);
        const validInvites=[];
        for(const invite of invites.rows)if(await verifyPassword(activationCode,invite.activation_code_hash))validInvites.push(invite);
        if(validInvites.length!==1){failed(req,surnameKey);failedIp(req);send(res,401,{error:'Фамилия или одноразовый код неверны, просрочены либо уже использованы'});return true;}
        const person=candidates.find(item=>String(item.k)===String(validInvites[0].staff_key));
        const department=(Array.isArray(data.departments)?data.departments:[]).find(item=>String(item.id)===String(person.departmentId));
        if(!department){failed(req,surnameKey);failedIp(req);send(res,409,{error:'За сотрудником не закреплено отделение'});return true;}
        const pinHash=await hashPassword(pin),randomPassword=await hashPassword(token());
        const username='patrol-senior-'+sha(String(person.k)).toString('hex').slice(0,32),client=await pool.connect();
        let user;
        try {
          await client.query('BEGIN');
          const lockedInvite=await client.query(
            'SELECT activation_code_hash FROM patrul_patrol_senior_invites WHERE staff_key=$1 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE',
            [String(person.k)]);
          if(!lockedInvite.rowCount||!(await verifyPassword(activationCode,lockedInvite.rows[0].activation_code_hash))){
            await client.query('ROLLBACK');failed(req,surnameKey);failedIp(req);
            send(res,401,{error:'Одноразовый код уже использован или просрочен'});return true;
          }
          const already=await client.query('SELECT 1 FROM patrul_patrol_senior_credentials WHERE staff_key=$1',[String(person.k)]);
          if(already.rowCount){await client.query('ROLLBACK');send(res,409,{error:'Первоначальная регистрация уже выполнена. Используйте вход по фамилии и PIN.'});return true;}
          const inserted=await client.query(
            "INSERT INTO patrul_users(username,display_name,role,password_hash,is_active,is_system_admin,must_change_password) VALUES($1,$2,'starshiy_patrulya',$3,TRUE,FALSE,FALSE) RETURNING *",
            [username,String(person.name).trim(),randomPassword]);
          user=inserted.rows[0];
          await client.query('INSERT INTO patrul_patrol_senior_credentials(user_id,staff_key,department_id,display_name,surname_key,pin_hash) VALUES($1,$2,$3,$4,$5,$6)',
            [user.id,String(person.k),String(person.departmentId),String(person.name).trim(),surnameKey,pinHash]);
          await client.query('UPDATE patrul_patrol_senior_invites SET consumed_at=NOW(),activation_code_hash=$2 WHERE staff_key=$1',
            [String(person.k),await hashPassword(token())]);
          await client.query("INSERT INTO patrul_audit_log(actor_user_id,event_type,target_user_id,details) VALUES($1,'patrol_senior_enrolled',$1,$2::jsonb)",
            [user.id,JSON.stringify({departmentId:String(person.departmentId)})]);
          await client.query('COMMIT');
        } catch(error) {
          await client.query('ROLLBACK').catch(()=>{});
          if(error.code==='23505'){send(res,409,{error:'Первоначальная регистрация уже выполнена. Используйте вход по фамилии и PIN.'});return true;}
          throw error;
        } finally { client.release(); }
        loginFailures.delete(key);
        const csrf=await newSession(user,res);send(res,201,{user:publicUser(user),csrfToken:csrf,department:department.name});return true;
      }
      if(p==='/api/patrol-senior/login'&&req.method==='POST') {
        if(!sameOrigin(req)){send(res,403,{error:'Недопустимый источник'});return true;}
        const b=await readJson(req),surname=typeof b.surname==='string'?b.surname.trim().slice(0,80):'',surnameKey=seniorSurnameKey(surname),pin=typeof b.pin==='string'?b.pin:'';
        const key=loginKey(req,surnameKey),old=loginFailures.get(key),ipState=loginFailures.get(loginIpKey(req));
        if(ipState&&ipState.until>Date.now()&&ipState.count>=60){send(res,429,{error:'Слишком много попыток с этого адреса. Повторите позже.'},{'retry-after':String(Math.ceil((ipState.until-Date.now())/1000))});return true;}
        if(old&&old.until>Date.now()&&old.count>=8){send(res,429,{error:'Слишком много попыток. Повторите позже.'},{'retry-after':String(Math.ceil((old.until-Date.now())/1000))});return true;}
        if(!/^[\p{L}-]{2,80}$/u.test(surname)||!surnameKey||!/^\d{6}$/.test(pin)){failed(req,surnameKey||'invalid');failedIp(req);send(res,401,{error:'Неверная фамилия или PIN'});return true;}
        const q=await pool.query('SELECT c.pin_hash,u.* FROM patrul_patrol_senior_credentials c JOIN patrul_users u ON u.id=c.user_id WHERE c.surname_key=$1 AND u.is_active=TRUE',[surnameKey]);
        const matches=[];
        for(const candidate of q.rows)if(await verifyPassword(pin,candidate.pin_hash))matches.push(candidate);
        if(matches.length!==1){await verifyPassword(pin,await dummyPasswordHash);failed(req,surnameKey);failedIp(req);send(res,401,{error:'Неверная фамилия или PIN'});return true;}
        const match=matches[0];
        const profile=await currentSeniorProfile(match);
        if(!profile){send(res,403,{error:'Доступ приостановлен: проверьте закрепление старшего в личном составе'});return true;}
        loginFailures.delete(key);await audit(match.id,'patrol_senior_login',match.id,{departmentId:profile.department.id});
        const csrf=await newSession(match,res);send(res,200,{user:publicUser(match),csrfToken:csrf,department:profile.department.name});return true;
      }
      if(p==='/api/patrol-senior/change-pin'&&req.method==='POST') {
        const session=await sessionFor(req);
        if(!session){send(res,401,{error:'Требуется вход'});return true;}
        if(session.role!=='starshiy_patrulya'){send(res,403,{error:'Недостаточно прав'});return true;}
        if(!(await csrfOk(req,session))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
        const b=await readJson(req),q=await pool.query('SELECT pin_hash FROM patrul_patrol_senior_credentials WHERE user_id=$1',[session.id]);
        if(!q.rowCount){send(res,404,{error:'PIN-код не найден'});return true;}
        if(!/^\d{6}$/.test(String(b.newPin||''))){send(res,400,{error:'Новый PIN должен состоять из 6 цифр'});return true;}
        if(!(await verifyPassword(String(b.currentPin||''),q.rows[0].pin_hash))){send(res,401,{error:'Текущий PIN неверен'});return true;}
        const next=await hashPassword(String(b.newPin));
        await pool.query('UPDATE patrul_patrol_senior_credentials SET pin_hash=$1,updated_at=NOW() WHERE user_id=$2',[next,session.id]);
        await audit(session.id,'patrol_senior_pin_changed',session.id,{});
        send(res,200,{ok:true});return true;
      }
      if(p==='/api/patrol-senior/reports'&&req.method==='GET') {
        const session=await sessionFor(req);
        if(!session){send(res,401,{error:'Требуется вход'});return true;}
        if(session.must_change_password){send(res,403,{error:'Сначала завершите настройку учётной записи'});return true;}
        if(!SHARED_STAFF_ROLES.includes(session.role)){send(res,403,{error:'Доклады доступны только вышестоящим должностным лицам'});return true;}
        const limit=Math.max(1,Math.min(200,Number(url.searchParams.get('limit')||100)));
        const [q,attendanceQuery]=await Promise.all([
          pool.query(
            'SELECT e.id,e.department_id AS "departmentId",e.staff_key AS "staffKey",e.entry_date AS date,e.entry_type AS type,e.status,e.title,e.body,e.created_at AS "createdAt",u.display_name AS "seniorName" '+
            'FROM patrul_patrol_senior_entries e JOIN patrul_users u ON u.id=e.senior_user_id '+
            'WHERE e.entry_date >= CURRENT_DATE - 30 ORDER BY e.created_at DESC,e.id DESC LIMIT $1',[limit]
          ),
          pool.query(
            'SELECT DISTINCT ON (e.department_id,e.staff_key) e.department_id AS "departmentId",e.staff_key AS "staffKey",e.entry_date AS date,e.status,e.created_at AS "createdAt",u.display_name AS "seniorName" '+
            'FROM patrul_patrol_senior_entries e JOIN patrul_users u ON u.id=e.senior_user_id '+
            "WHERE e.entry_type='attendance' AND e.staff_key IS NOT NULL AND e.entry_date >= CURRENT_DATE - 30 "+
            'ORDER BY e.department_id,e.staff_key,e.entry_date DESC,e.created_at DESC,e.id DESC'
          )
        ]);
        const shared=await readSharedStaffForSenior();
        const departmentNames=new Map((shared.departments||[]).map(department=>[String(department.id),String(department.name||department.id)]));
        const entries=q.rows.map(entry=>({...entry,departmentName:departmentNames.get(String(entry.departmentId))||entry.departmentId}));
        const latestAttendance=attendanceQuery.rows.map(entry=>({...entry,departmentName:departmentNames.get(String(entry.departmentId))||entry.departmentId}));
        send(res,200,{entries,latestAttendance});return true;
      }
      if(p==='/api/patrol-senior/workspace'&&req.method==='GET') {
        const session=await sessionFor(req);
        if(!session){send(res,401,{error:'Требуется вход'});return true;}
        if(session.must_change_password){send(res,403,{error:'Завершите настройку учётной записи'});return true;}
        const profile=await currentSeniorProfile(session);
        if(!profile){send(res,403,{error:'Доступ к кабинету старшего патруля отсутствует'});return true;}
        const today=String(url.searchParams.get('date')||dutyDateAt());
        const parsedDutyDate=new Date(today+'T00:00:00.000Z');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||Number.isNaN(parsedDutyDate.getTime())||parsedDutyDate.toISOString().slice(0,10)!==today){send(res,400,{error:'Некорректная дата'});return true;}
        await purgeExpiredDutyData(pool);
        const [scheduleResult,rosterResult]=await Promise.all([
          pool.query('SELECT assignments,substitutions FROM patrul_duty_schedule WHERE duty_date=$1::date',[today]),
          pool.query('SELECT data FROM patrul_duty_rosters WHERE duty_date=$1::date',[today])
        ]);
        let assignedPost='',postConflict=false,schedule=null;
        const duty=rosterResult.rowCount?rosterResult.rows[0].data:null;
        const rows=duty&&duty.rows&&typeof duty.rows==='object'?duty.rows:{};
        const departmentNames=new Set(profile.data.staff.filter(person=>String(person.departmentId)===String(profile.department.id)).map(person=>sharedNameKey(person.name)).filter(Boolean));
        const assignedPosts=Object.entries(rows).filter(([post,list])=>Array.isArray(list)&&list.some(row=>departmentNames.has(sharedNameKey(row&&row.fio)))).map(([post])=>String(post));
        postConflict=assignedPosts.length>1;
        if(assignedPosts.length===1)assignedPost=assignedPosts[0];
        const assignments=scheduleResult.rowCount&&Array.isArray(scheduleResult.rows[0].assignments)?scheduleResult.rows[0].assignments:[];
        const substitutions=scheduleResult.rowCount&&Array.isArray(scheduleResult.rows[0].substitutions)?scheduleResult.rows[0].substitutions:[];
        const assignment=assignments.find(item=>String(item.departmentId)===String(profile.department.id));
        const substitution=substitutions.find(item=>String(item.departmentId)===String(profile.department.id));
        if(assignment){
          assignedPost=String(assignment.post||assignedPost||'');
          schedule={departmentName:String(assignment.departmentName||profile.department.name),post:assignedPost||null,assignedSenior:String(assignment.seniorName||''),effectiveSenior:String(substitution&&substitution.substituteSenior||assignment.seniorName||''),isSubstitute:!!substitution,substituteReason:String(substitution&&substitution.reason||'')};
        }
        const equipment=(profile.data.postEquipment||[]).find(item=>sharedNameKey(item.name)===sharedNameKey(assignedPost));
        const entries=await pool.query('SELECT id,staff_key,entry_date,entry_type,status,title,body,created_at FROM patrul_patrol_senior_entries WHERE department_id=$1 AND entry_date=$2 ORDER BY created_at DESC,id DESC',[String(profile.department.id),today]);
        const roster=profile.data.staff.filter(person=>String(person.departmentId)===String(profile.department.id)).map(person=>({key:String(person.k),name:String(person.name||''),position:String(person.pos||''),phone:String(person.tel||''),status:String(person.st||'')}));
        send(res,200,{date:today,user:publicUser(session),department:{id:profile.department.id,name:profile.department.name},senior:{key:String(profile.person.k),name:profile.person.name},roster,post:assignedPost||null,postConflict,schedule,equipment:equipment&&Array.isArray(equipment.items)?equipment.items:[],entries:entries.rows});return true;
      }
      if(p==='/api/patrol-senior/entries'&&req.method==='POST') {
        const session=await sessionFor(req);
        if(!session){send(res,401,{error:'Требуется вход'});return true;}
        if(session.role!=='starshiy_patrulya'){send(res,403,{error:'Недостаточно прав'});return true;}
        if(!(await csrfOk(req,session))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
        const profile=await currentSeniorProfile(session);
        if(!profile){send(res,403,{error:'Старший больше не закреплён за отделением'});return true;}
        const b=await readJson(req),date=String(b.date||dutyDateAt()),type=String(b.type||''),staffKey=b.staffKey==null?'':String(b.staffKey),status=String(b.status||''),title=String(b.title||'').trim().slice(0,160),body=String(b.body||'').trim().slice(0,4000),clientEntryId=b.clientEntryId==null?null:String(b.clientEntryId);
        if(clientEntryId!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientEntryId)){send(res,400,{error:'Некорректный идентификатор офлайн-записи'});return true;}
        const parsedEntryDate=new Date(date+'T00:00:00.000Z');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsedEntryDate.getTime())||parsedEntryDate.toISOString().slice(0,10)!==date||Math.abs(parsedEntryDate.getTime()-Date.now())>31*86400000){send(res,400,{error:'Дата должна быть корректной и находиться в пределах 31 дня от текущей'});return true;}
        const allowedTypes=new Set(['attendance','report','equipment','shift_start','shift_end','task_update']);
        if(!allowedTypes.has(type)){send(res,400,{error:'Неизвестный тип записи'});return true;}
        if(staffKey&&!profile.data.staff.some(person=>String(person.k)===staffKey&&String(person.departmentId)===String(profile.department.id))){send(res,403,{error:'Можно отмечать только сотрудников своего отделения'});return true;}
        if(type==='attendance'&&!['present','late','absent','excused'].includes(status)){send(res,400,{error:'Укажите статус явки'});return true;}
        if(type==='equipment'&&!['received','missing','faulty','returned'].includes(status)){send(res,400,{error:'Укажите состояние комплекта'});return true;}
        if(['report','task_update'].includes(type)&&!body){send(res,400,{error:'Текст доклада обязателен'});return true;}
        if(type==='report'&&!title) {send(res,400,{error:'Укажите тему доклада'});return true;}
        const saved=await pool.query('INSERT INTO patrul_patrol_senior_entries(senior_user_id,department_id,staff_key,entry_date,entry_type,status,title,body,client_entry_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid) ON CONFLICT (senior_user_id,client_entry_id) WHERE client_entry_id IS NOT NULL DO NOTHING RETURNING id,created_at',[session.id,String(profile.department.id),staffKey||null,date,type,status||null,title||null,body||null,clientEntryId]);
        if(!saved.rowCount){
          const existing=await pool.query("SELECT id,created_at,department_id,staff_key,to_char(entry_date,'YYYY-MM-DD') AS entry_date,entry_type,status,title,body FROM patrul_patrol_senior_entries WHERE senior_user_id=$1 AND client_entry_id=$2",[session.id,clientEntryId]);
          if(!existing.rowCount){send(res,409,{error:'Не удалось подтвердить сохранение офлайн-записи'});return true;}
          const row=existing.rows[0];
          const samePayload=String(row.department_id)===String(profile.department.id)&&
            String(row.staff_key||'')===String(staffKey)&&
            String(row.entry_date)===date&&
            row.entry_type===type&&String(row.status||'')===String(status||'')&&
            String(row.title||'')===String(title||'')&&String(row.body||'')===String(body||'');
          if(!samePayload){send(res,409,{error:'Идентификатор офлайн-записи уже использован для другого содержимого'});return true;}
          send(res,200,{id:row.id,createdAt:row.created_at,duplicate:true});return true;
        }
        await audit(session.id,'patrol_senior_entry_created',session.id,{departmentId:profile.department.id,type,staffKey:staffKey||null,offlineReplay:!!clientEntryId});
        send(res,201,{id:saved.rows[0].id,createdAt:saved.rows[0].created_at,duplicate:false});return true;
      }
      if(p.startsWith('/api/patrol-senior/')) {send(res,404,{error:'Маршрут не найден'});return true;}
      if(p==='/api/auth/bootstrap'&&req.method==='POST') {
        if(!sameOrigin(req)) {send(res,403,{error:'Недопустимый источник'});return true;}
        const b=await readJson(req), secret=process.env.PATRUL_BOOTSTRAP_SECRET||'';
        if(Buffer.byteLength(secret,'utf8')<32||!equal(b.bootstrapSecret,secret)){send(res,403,{error:'Первичная настройка недоступна или секрет неверен'});return true;}
        const c=await pool.query('SELECT COUNT(*)::int AS n FROM patrul_users');
        if(c.rows[0].n){send(res,409,{error:'Первичная учётная запись уже создана'});return true;}
        if(typeof b.username!=='string'||!/^[a-zA-Z0-9._-]{3,100}$/.test(b.username)||typeof b.displayName!=='string'||!b.displayName.trim()||b.displayName.trim().length>200||!validPassword(b.password)){send(res,400,{error:'Проверьте логин, имя и пароль (минимум 12 символов)'});return true;}
        const h=await hashPassword(b.password), client=await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('LOCK TABLE patrul_users IN EXCLUSIVE MODE');
          const again=await client.query('SELECT COUNT(*)::int AS n FROM patrul_users');
          if(again.rows[0].n) throw Object.assign(new Error('Первичная учётная запись уже создана'),{status:409});
          const ins=await client.query("INSERT INTO patrul_users(username,display_name,role,password_hash,is_system_admin,must_change_password) VALUES($1,$2,'uchet',$3,TRUE,FALSE) RETURNING *",[b.username.trim(),b.displayName.trim(),h]);
          await client.query("INSERT INTO patrul_audit_log(actor_user_id,event_type,target_user_id,details) VALUES($1,'bootstrap_admin_created',$1,'{}'::jsonb)",[ins.rows[0].id]);
          await client.query('COMMIT');
          const csrf=await newSession(ins.rows[0],res);
          send(res,201,{user:publicUser(ins.rows[0]),csrfToken:csrf});
        } catch(e){await client.query('ROLLBACK');if(e.code==='23505'||e.status===409)send(res,e.status||409,{error:e.message||'Логин уже существует'});else throw e;}
        finally{client.release();}
        return true;
      }
      if(p==='/api/auth/login'&&req.method==='POST') {
        if(!sameOrigin(req)){send(res,403,{error:'Недопустимый источник'});return true;}
        const b=await readJson(req), name=typeof b.username==='string'?b.username.trim().slice(0,100):'', key=loginKey(req,name), old=loginFailures.get(key), ipState=loginFailures.get(loginIpKey(req));
        if(ipState&&ipState.until>Date.now()&&ipState.count>=60){send(res,429,{error:'Слишком много попыток с этого адреса. Повторите позже.'},{'retry-after':String(Math.ceil((ipState.until-Date.now())/1000))});return true;}
        if(old&&old.until>Date.now()&&old.count>=8){send(res,429,{error:'Слишком много попыток. Повторите позже.'},{'retry-after':String(Math.ceil((old.until-Date.now())/1000))});return true;}
        const q=await pool.query('SELECT * FROM patrul_users WHERE lower(username)=lower($1) LIMIT 1',[name]), u=q.rows[0];
        const hashToCheck=u?u.password_hash:await dummyPasswordHash;
        const suppliedPassword=typeof b.password==='string'&&Buffer.byteLength(b.password,'utf8')<=256?b.password:'';
        const passwordMatches=await verifyPassword(suppliedPassword,hashToCheck);
        const ok=!!(u&&u.role!=='starshiy_patrulya'&&u.is_active&&passwordMatches);
        if(!ok){failed(req,name);failedIp(req);send(res,401,{error:'Неверный логин или пароль'});return true;}
        loginFailures.delete(key); await audit(u.id,'login_success',u.id);
        const csrf=await newSession(u,res); send(res,200,{user:publicUser(u),csrfToken:csrf}); return true;
      }
      if(p==='/api/auth/me'&&req.method==='GET') {
        const s=await sessionFor(req); if(!s){res.setHeader('set-cookie',COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');send(res,401,{error:'Требуется персональный вход'});return true;}
        const csrf=token(); await pool.query('UPDATE patrul_sessions SET csrf_token_hash=$1,last_seen_at=NOW() WHERE id=$2',[sha(csrf),s.session_id]);
        send(res,200,{user:publicUser(s),csrfToken:csrf});return true;
      }
      if(p==='/api/auth/logout'&&req.method==='POST') {
        const s=await sessionFor(req); if(s){if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          await pool.query('UPDATE patrul_sessions SET revoked_at=NOW() WHERE id=$1',[s.session_id]);await audit(s.id,'logout',s.id);}
        res.setHeader('set-cookie',COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');send(res,200,{ok:true});return true;
      }
      if(p==='/api/auth/change-password'&&req.method==='POST') {
        const s=await sessionFor(req);if(!s){send(res,401,{error:'Требуется вход'});return true;}
        if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
        const b=await readJson(req), q=await pool.query('SELECT password_hash FROM patrul_users WHERE id=$1',[s.id]);
        if(!validPassword(b.newPassword)){send(res,400,{error:'Новый пароль должен содержать минимум 12 символов'});return true;}
        if(!q.rowCount||!(await verifyPassword(b.currentPassword,q.rows[0].password_hash))){send(res,401,{error:'Текущий пароль неверен'});return true;}
        const h=await hashPassword(b.newPassword),c=await pool.connect();
        try{await c.query('BEGIN');await c.query('UPDATE patrul_users SET password_hash=$1,must_change_password=FALSE,updated_at=NOW() WHERE id=$2',[h,s.id]);
          await c.query('UPDATE patrul_sessions SET revoked_at=NOW() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL',[s.id,s.session_id]);
          await c.query("INSERT INTO patrul_audit_log(actor_user_id,event_type,target_user_id,details) VALUES($1,'password_changed',$1,'{}'::jsonb)",[s.id]);await c.query('COMMIT');}
        catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
        send(res,200,{ok:true});return true;
      }
      if(p.startsWith('/api/admin/')) {
        const s=await admin(req,res,req.method!=='GET');if(!s)return true;
        if(p==='/api/admin/users'&&req.method==='GET'){
          const q=await pool.query('SELECT id,username,display_name,role,is_active,is_system_admin,must_change_password,created_at FROM patrul_users ORDER BY lower(username)');
          send(res,200,{users:q.rows.map(publicUser)});return true;
        }
        if(p==='/api/admin/users'&&req.method==='POST'){
          const b=await readJson(req);
          if(typeof b.username!=='string'||!/^[a-zA-Z0-9._-]{3,100}$/.test(b.username)||typeof b.displayName!=='string'||!b.displayName.trim()||b.displayName.trim().length>200||!ROLES.has(b.role)){send(res,400,{error:'Проверьте логин, имя и роль'});return true;}
          const temp=token().slice(0,24),h=await hashPassword(temp),c=await pool.connect();
          try{await c.query('BEGIN');const q=await c.query('INSERT INTO patrul_users(username,display_name,role,password_hash,must_change_password,created_by) VALUES($1,$2,$3,$4,TRUE,$5) RETURNING *',[b.username.trim(),b.displayName.trim(),b.role,h,s.id]);
            await c.query("INSERT INTO patrul_audit_log(actor_user_id,event_type,target_user_id,details) VALUES($1,'user_created',$2,$3::jsonb)",[s.id,q.rows[0].id,JSON.stringify({role:b.role})]);await c.query('COMMIT');send(res,201,{user:publicUser(q.rows[0]),temporaryPassword:temp});}
          catch(e){await c.query('ROLLBACK');if(e.code==='23505')send(res,409,{error:'Такой логин уже существует'});else throw e;}finally{c.release();}
          return true;
        }
        const reset=p.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/reset-password$/i);
        if(reset&&req.method==='POST'){
          const id=reset[1],q=await pool.query('SELECT id,role FROM patrul_users WHERE id=$1',[id]);if(!q.rowCount){send(res,404,{error:'Сотрудник не найден'});return true;}if(q.rows[0].role==='starshiy_patrulya'){send(res,400,{error:'Для этой роли используется PIN-код, его можно изменить в кабинете старшего патруля'});return true;}
          const temp=token().slice(0,24),h=await hashPassword(temp),c=await pool.connect();
          try{await c.query('BEGIN');await c.query('UPDATE patrul_users SET password_hash=$1,must_change_password=TRUE,updated_at=NOW() WHERE id=$2',[h,id]);
            await c.query('UPDATE patrul_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[id]);
            await c.query("INSERT INTO patrul_audit_log(actor_user_id,event_type,target_user_id,details) VALUES($1,'user_password_reset',$2,'{}'::jsonb)",[s.id,id]);await c.query('COMMIT');send(res,200,{temporaryPassword:temp});}
          catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return true;
        }
        if(p==='/api/admin/audit'&&req.method==='GET'){
          const limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit')||50)));
          const q=await pool.query(
            'SELECT a.id,a.event_type,a.details,a.created_at,actor.username AS actor_username,actor.display_name AS actor_name,target.username AS target_username,target.display_name AS target_name '+
            'FROM patrul_audit_log a LEFT JOIN patrul_users actor ON actor.id=a.actor_user_id LEFT JOIN patrul_users target ON target.id=a.target_user_id '+
            'ORDER BY a.created_at DESC,a.id DESC LIMIT $1',[limit]);
          send(res,200,{events:q.rows});return true;
        }
        const edit=p.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/i);
        if(edit&&req.method==='PATCH'){
          const id=edit[1],b=await readJson(req),q=await pool.query('SELECT * FROM patrul_users WHERE id=$1',[id]);if(!q.rowCount){send(res,404,{error:'Сотрудник не найден'});return true;}
          const u=q.rows[0],role=b.role===undefined?u.role:b.role,active=b.active===undefined?u.is_active:b.active,name=b.displayName===undefined?u.display_name:b.displayName;
          if(!(ROLES.has(role)||(u.role==='starshiy_patrulya'&&role===u.role))||typeof active!=='boolean'||typeof name!=='string'||!name.trim()||name.trim().length>200){send(res,400,{error:'Некорректные изменения'});return true;}
          if(id===s.id&&(!active||role!==u.role)){send(res,400,{error:'Нельзя блокировать себя или менять свою роль'});return true;}
          if(u.is_system_admin&&(!active||b.isSystemAdmin===false)){const n=await pool.query('SELECT COUNT(*)::int AS n FROM patrul_users WHERE is_system_admin=TRUE AND is_active=TRUE');if(n.rows[0].n<=1){send(res,409,{error:'Нельзя отключить последнего администратора'});return true;}}
          if(b.isSystemAdmin!==undefined&&b.isSystemAdmin!==u.is_system_admin){send(res,400,{error:'Передача прав системного администратора требует отдельной процедуры'});return true;}
          const c=await pool.connect();try{await c.query('BEGIN');const up=await c.query('UPDATE patrul_users SET role=$1,is_active=$2,display_name=$3,updated_at=NOW() WHERE id=$4 RETURNING *',[role,active,name.trim(),id]);
            if(!active||role!==u.role)await c.query('UPDATE patrul_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[id]);
            await c.query("INSERT INTO patrul_audit_log(actor_user_id,event_type,target_user_id,details) VALUES($1,'user_updated',$2,$3::jsonb)",[s.id,id,JSON.stringify({roleChanged:role!==u.role,activeChanged:active!==u.is_active})]);await c.query('COMMIT');send(res,200,{user:publicUser(up.rows[0])});}
          catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return true;
        }
        send(res,404,{error:'Маршрут не найден'});return true;
      }

      if(p.startsWith('/api/mail/')){
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        const mailPath=p.slice('/api/mail'.length);
        if(mailPath==='/recipients'&&req.method==='GET'){
          const q=await pool.query('SELECT id,display_name AS "displayName",role FROM patrul_users WHERE is_active=TRUE AND id<>$1 ORDER BY lower(display_name)',[s.id]);
          send(res,200,{users:q.rows});return true;
        }
        if(mailPath==='/unread'&&req.method==='GET'){
          const q=await pool.query("SELECT COUNT(*)::int AS count FROM patrul_mail_participants p WHERE p.user_id=$1 AND EXISTS (SELECT 1 FROM patrul_mail_messages m WHERE m.thread_id=p.thread_id AND m.sender_id<>$1 AND m.created_at>COALESCE(p.last_read_at,'epoch'::timestamptz))",[s.id]);
          send(res,200,{count:q.rows[0].count});return true;
        }
        if(mailPath==='/threads'&&req.method==='GET'){
          const box=['inbox','sent','all'].includes(url.searchParams.get('box'))?url.searchParams.get('box'):'inbox';
          const search=String(url.searchParams.get('q')||'').trim().slice(0,120);
          const q=await pool.query(
            'SELECT t.id,t.subject,t.created_at AS "createdAt",t.updated_at AS "updatedAt",t.created_by=$1 AS "isSent", '+
            'u.display_name AS "otherName",u.role AS "otherRole",lm.body AS "lastBody",lm.created_at AS "lastAt", '+
            '(lm.sender_id=$1) AS "lastFromMe", '+
            '(SELECT COUNT(*)::int FROM patrul_mail_messages um WHERE um.thread_id=t.id AND um.sender_id<>$1 AND um.created_at>COALESCE(p.last_read_at,\'epoch\'::timestamptz)) AS "unreadCount" '+
            'FROM patrul_mail_threads t JOIN patrul_mail_participants p ON p.thread_id=t.id AND p.user_id=$1 '+
            'JOIN LATERAL (SELECT m.body,m.sender_id,m.created_at FROM patrul_mail_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) lm ON TRUE '+
            'JOIN LATERAL (SELECT pu.display_name,pu.role FROM patrul_mail_participants op JOIN patrul_users pu ON pu.id=op.user_id WHERE op.thread_id=t.id AND op.user_id<>$1 LIMIT 1) u ON TRUE '+
            'WHERE ($2=\'all\' OR ($2=\'sent\' AND t.created_by=$1) OR ($2=\'inbox\' AND t.created_by<>$1)) '+
            'AND ($3=\'\' OR t.subject ILIKE $4 OR EXISTS(SELECT 1 FROM patrul_mail_messages sm WHERE sm.thread_id=t.id AND sm.body ILIKE $4)) '+
            'ORDER BY lm.created_at DESC,t.id DESC LIMIT 100',
            [s.id,box,search,'%'+search+'%']);
          send(res,200,{threads:q.rows});return true;
        }
        if(mailPath==='/archive'&&req.method==='GET'){
          const q=await pool.query('SELECT id,file_name AS "name",file_size AS "size",mime_type AS "mime",created_at AS "savedAt" FROM patrul_mail_archive WHERE owner_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 500',[s.id]);
          send(res,200,{items:q.rows});return true;
        }
        if(mailPath==='/archive'&&req.method==='POST'){
          if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const b=await readJson(req,16000),attachmentId=String(b.attachmentId||'');
          if(!/^[0-9a-f-]{36}$/i.test(attachmentId)){send(res,400,{error:'Некорректное вложение'});return true;}
          const source=await pool.query('SELECT a.file_name,a.mime_type,a.file_size,a.file_data,a.sha256 FROM patrul_mail_attachments a JOIN patrul_mail_participants p ON p.thread_id=a.thread_id AND p.user_id=$2 WHERE a.id=$1',[attachmentId,s.id]);
          if(!source.rowCount){send(res,404,{error:'Вложение не найдено или у вас нет доступа'});return true;}
          const file=source.rows[0];
          const saved=await pool.query('INSERT INTO patrul_mail_archive(owner_user_id,source_attachment_id,file_name,mime_type,file_size,file_data,sha256) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_user_id,source_attachment_id) DO NOTHING RETURNING id',[s.id,attachmentId,file.file_name,file.mime_type,file.file_size,file.file_data,file.sha256]);
          const id=saved.rowCount?saved.rows[0].id:(await pool.query('SELECT id FROM patrul_mail_archive WHERE owner_user_id=$1 AND source_attachment_id=$2',[s.id,attachmentId])).rows[0].id;
          send(res,201,{id,alreadySaved:!saved.rowCount});return true;
        }
        const archiveMatch=mailPath.match(/^\/archive\/([0-9a-f-]{36})$/i);
        if(archiveMatch&&req.method==='GET'){
          const q=await pool.query('SELECT file_name,mime_type,file_size,file_data FROM patrul_mail_archive WHERE id=$1 AND owner_user_id=$2',[archiveMatch[1],s.id]);
          if(!q.rowCount){send(res,404,{error:'Документ в архиве не найден'});return true;}
          const file=q.rows[0];
          const disposition=url.searchParams.get('download')==='1'?'attachment':'inline';
          res.writeHead(200,mailFileHeaders(file,disposition));
          res.end(file.file_data);return true;
        }
        if(archiveMatch&&req.method==='DELETE'){
          if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const q=await pool.query('DELETE FROM patrul_mail_archive WHERE id=$1 AND owner_user_id=$2 RETURNING id',[archiveMatch[1],s.id]);
          if(!q.rowCount){send(res,404,{error:'Документ в архиве не найден'});return true;}
          send(res,200,{ok:true});return true;
        }
        const attachmentMatch=mailPath.match(/^\/attachments\/([0-9a-f-]{36})$/i);
        if(attachmentMatch&&req.method==='GET'){
          const q=await pool.query('SELECT a.file_name,a.mime_type,a.file_size,a.file_data FROM patrul_mail_attachments a JOIN patrul_mail_participants p ON p.thread_id=a.thread_id AND p.user_id=$2 WHERE a.id=$1',[attachmentMatch[1],s.id]);
          if(!q.rowCount){send(res,404,{error:'Вложение не найдено'});return true;}
          const file=q.rows[0];
          const disposition=url.searchParams.get('download')==='1'?'attachment':'inline';
          res.writeHead(200,mailFileHeaders(file,disposition));
          res.end(file.file_data);return true;
        }
        const threadMatch=mailPath.match(/^\/threads\/([0-9a-f-]{36})$/i);
        if(threadMatch&&req.method==='GET'){
          const id=threadMatch[1];
          const participant=await pool.query('SELECT 1 FROM patrul_mail_participants WHERE thread_id=$1 AND user_id=$2',[id,s.id]);
          if(!participant.rowCount){send(res,404,{error:'Письмо не найдено'});return true;}
          await pool.query('UPDATE patrul_mail_participants SET last_read_at=NOW() WHERE thread_id=$1 AND user_id=$2',[id,s.id]);
          const thread=await pool.query('SELECT t.id,t.subject,t.created_at AS "createdAt",t.created_by=$2 AS "isSent",u.display_name AS "otherName",u.role AS "otherRole" FROM patrul_mail_threads t JOIN LATERAL (SELECT pu.display_name,pu.role FROM patrul_mail_participants op JOIN patrul_users pu ON pu.id=op.user_id WHERE op.thread_id=t.id AND op.user_id<>$2 LIMIT 1) u ON TRUE WHERE t.id=$1',[id,s.id]);
          const messages=await pool.query('SELECT m.id,m.body,m.created_at AS "createdAt",m.sender_id=$2 AS "fromMe",u.display_name AS "senderName",u.role AS "senderRole",COALESCE((SELECT json_agg(json_build_object(\'id\',a.id,\'name\',a.file_name,\'size\',a.file_size,\'mime\',a.mime_type) ORDER BY a.id) FROM patrul_mail_attachments a WHERE a.message_id=m.id),\'[]\'::json) AS attachments FROM patrul_mail_messages m JOIN patrul_users u ON u.id=m.sender_id WHERE m.thread_id=$1 ORDER BY m.created_at,m.id',[id,s.id]);
          send(res,200,{thread:thread.rows[0],messages:messages.rows});return true;
        }
        if(mailPath==='/threads'&&req.method==='POST'){
          if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const b=await readJson(req,12*1024*1024),to=String(b.toUserId||''),subject=typeof b.subject==='string'?b.subject.trim():'',body=typeof b.body==='string'?b.body.trim():'';
          if(!/^[0-9a-f-]{36}$/i.test(to)||to===s.id||!subject||subject.length>200||!body||body.length>20000){send(res,400,{error:'Укажите получателя, тему (до 200 символов) и текст (до 20 000 символов)'});return true;}
          const c=await pool.connect();
          try{
            await c.query('BEGIN');
            const recipient=await c.query('SELECT id FROM patrul_users WHERE id=$1 AND is_active=TRUE',[to]);
            if(!recipient.rowCount){await c.query('ROLLBACK');send(res,404,{error:'Получатель не найден или заблокирован'});return true;}
            const t=await c.query('INSERT INTO patrul_mail_threads(subject,created_by) VALUES($1,$2) RETURNING id',[subject,s.id]);
            await c.query('INSERT INTO patrul_mail_participants(thread_id,user_id) VALUES($1,$2),($1,$3)',[t.rows[0].id,s.id,to]);
            const m=await c.query('INSERT INTO patrul_mail_messages(thread_id,sender_id,body) VALUES($1,$2,$3) RETURNING id',[t.rows[0].id,s.id,body]);
            await insertMailAttachments(c,t.rows[0].id,m.rows[0].id,b.attachments);
            await c.query('UPDATE patrul_mail_threads SET updated_at=NOW() WHERE id=$1',[t.rows[0].id]);
            await c.query('COMMIT');send(res,201,{threadId:t.rows[0].id});
          }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
          return true;
        }
        const replyMatch=mailPath.match(/^\/threads\/([0-9a-f-]{36})\/messages$/i);
        if(replyMatch&&req.method==='POST'){
          if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const b=await readJson(req,12*1024*1024),body=typeof b.body==='string'?b.body.trim():'';
          if(!body||body.length>20000){send(res,400,{error:'Текст ответа обязателен (до 20 000 символов)'});return true;}
          const c=await pool.connect();
          try{
            await c.query('BEGIN');
            const t=await c.query('SELECT t.id FROM patrul_mail_threads t JOIN patrul_mail_participants p ON p.thread_id=t.id WHERE t.id=$1 AND p.user_id=$2 FOR UPDATE OF t',[replyMatch[1],s.id]);
            if(!t.rowCount){await c.query('ROLLBACK');send(res,404,{error:'Переписка не найдена'});return true;}
            const m=await c.query('INSERT INTO patrul_mail_messages(thread_id,sender_id,body) VALUES($1,$2,$3) RETURNING id',[replyMatch[1],s.id,body]);
            await insertMailAttachments(c,replyMatch[1],m.rows[0].id,b.attachments);
            await c.query('UPDATE patrul_mail_threads SET updated_at=NOW() WHERE id=$1',[replyMatch[1]]);
            await c.query('UPDATE patrul_mail_participants SET last_read_at=NOW() WHERE thread_id=$1 AND user_id=$2',[replyMatch[1],s.id]);
            await c.query('COMMIT');send(res,201,{ok:true});
          }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
          return true;
        }
        send(res,404,{error:'Маршрут почты не найден'});return true;
      }

      if(p==='/api/control/roles' || p.startsWith('/api/control/role-data/')) {
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(s.role!=='uchet'){send(res,403,{error:'Контрольный просмотр доступен только старшему мастеру'});return true;}
        if(p==='/api/control/roles'&&req.method==='GET'){
          send(res,200,{roles:[
            {id:'nachalnik',name:'Начальник'},
            {id:'zam',name:'Заместитель'},
            {id:'uchet',name:'Старший мастер'},
            {id:'dokumentoved',name:'Документовед'},
            {id:'starshiy_patrulya',name:'Старший патруля'}
          ]});
          return true;
        }
        const match=p.match(/^\/api\/control\/role-data\/([a-z_]+)$/);
        if(!match){send(res,404,{error:'Маршрут контроля не найден'});return true;}
        const targetRole=match[1];
        if(!ROLES.has(targetRole)&&targetRole!=='starshiy_patrulya'){send(res,400,{error:'Неизвестная роль'});return true;}
        if(req.method!=='GET'){send(res,405,{error:'Контрольный режим доступен только для чтения'});return true;}
        if(targetRole==='starshiy_patrulya'){
          const shared=await readSharedStaffForSenior();
          const [accounts,entries]=await Promise.all([
            pool.query(
              'SELECT u.id AS "userId",u.display_name AS "displayName",u.is_active AS active,c.staff_key AS "staffKey",c.department_id AS "departmentId",'+
              '(COUNT(e.id) FILTER (WHERE e.entry_date>=CURRENT_DATE-7))::int AS "entriesLast7Days",MAX(e.created_at) AS "lastActivityAt" '+
              'FROM patrul_users u JOIN patrul_patrol_senior_credentials c ON c.user_id=u.id '+
              'LEFT JOIN patrul_patrol_senior_entries e ON e.senior_user_id=u.id '+
              "WHERE u.role='starshiy_patrulya' GROUP BY u.id,c.staff_key,c.department_id ORDER BY lower(u.display_name)"
            ),
            pool.query(
              'SELECT e.id,e.department_id AS "departmentId",e.entry_date AS date,e.entry_type AS type,e.status,e.title,e.body,e.created_at AS "createdAt",'+
              'u.display_name AS "seniorName" FROM patrul_patrol_senior_entries e '+
              'JOIN patrul_users u ON u.id=e.senior_user_id ORDER BY e.created_at DESC,e.id DESC LIMIT 200'
            )
          ]);
          const departmentNames=new Map((shared.departments||[]).map(item=>[String(item.id),String(item.name||item.id)]));
          const data={
            accounts:accounts.rows.map(item=>({...item,departmentName:departmentNames.get(String(item.departmentId))||String(item.departmentId)})),
            entries:entries.rows.map(item=>({...item,departmentName:departmentNames.get(String(item.departmentId))||String(item.departmentId)}))
          };
          const updatedAt=entries.rows[0]?.createdAt||null;
          await audit(s.id,'role_control_viewed',null,{targetRole,mode:'read_only',accountCount:data.accounts.length,entryCount:data.entries.length});
          send(res,200,{role:targetRole,data,version:0,updatedAt,readOnly:true,actorRole:s.role});
          return true;
        }
        const q=await pool.query('SELECT data,version,updated_at FROM patrul_role_data WHERE role=$1',[targetRole]);
        const version=q.rowCount?Number(q.rows[0].version):0;
        const updatedAt=q.rowCount?q.rows[0].updated_at:null;
        const data=q.rowCount?await readRoleData(pool,targetRole,q.rows[0]):null;
        await audit(s.id,'role_control_viewed',null,{targetRole,mode:'read_only',version});
        send(res,200,{role:targetRole,data,version,updatedAt,readOnly:true,actorRole:s.role});
        return true;
      }

      if(p==='/api/tasks/recipients'&&req.method==='GET'){
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(!SHARED_STAFF_ROLES.includes(s.role)){send(res,403,{error:'Создавать поручения могут только вышестоящие роли'});return true;}
        const q=await pool.query(
          "SELECT id,\"display_name\" AS \"displayName\",role FROM patrul_users WHERE is_active=TRUE AND role=ANY($1::text[]) ORDER BY CASE role WHEN 'nachalnik' THEN 1 WHEN 'zam' THEN 2 WHEN 'uchet' THEN 3 WHEN 'dokumentoved' THEN 4 ELSE 5 END,display_name",
          [[...SHARED_STAFF_ROLES,'starshiy_patrulya']]
        );
        send(res,200,{recipients:q.rows});
        return true;
      }

      if(p==='/api/tasks'&&req.method==='GET'){
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(![...SHARED_STAFF_ROLES,'starshiy_patrulya'].includes(s.role)){send(res,403,{error:'Нет доступа к поручениям'});return true;}
        const canViewAll=['nachalnik','uchet'].includes(s.role);
        await pool.query(
          'INSERT INTO patrul_task_notifications(user_id,task_id,notification_type,title,body,dedupe_key) '+
          'SELECT recipient.user_id,t.id,'+
          "CASE WHEN t.due_date<CURRENT_DATE THEN 'overdue' WHEN t.due_date=CURRENT_DATE THEN 'due_today' ELSE 'due_soon' END,"+
          "CASE WHEN t.due_date<CURRENT_DATE THEN 'Просрочено поручение' WHEN t.due_date=CURRENT_DATE THEN 'Срок поручения сегодня' ELSE 'Срок поручения завтра' END,"+
          "CASE WHEN t.due_date<CURRENT_DATE THEN 'Поручение «'||t.title||'» просрочено с '||to_char(t.due_date,'DD.MM.YYYY') "+
          "WHEN t.due_date=CURRENT_DATE THEN 'Срок исполнения поручения «'||t.title||'» наступает сегодня' "+
          "ELSE 'Срок исполнения поручения «'||t.title||'» наступает завтра' END,"+
          "CASE WHEN t.due_date<CURRENT_DATE THEN 'overdue:'||t.due_date::text "+
          "WHEN t.due_date=CURRENT_DATE THEN 'due_today:'||t.due_date::text ELSE 'due_soon:'||t.due_date::text END "+
          'FROM patrul_tasks t CROSS JOIN LATERAL (SELECT t.assignee_user_id AS user_id UNION SELECT t.creator_user_id AS user_id) recipient '+
          "WHERE t.status NOT IN ('Выполнено','Отменено') AND t.due_date IS NOT NULL AND t.due_date<=CURRENT_DATE+1 "+
          'ON CONFLICT(user_id,task_id,notification_type,dedupe_key) DO NOTHING'
        );
        const [tasks,unread,notifications]=await Promise.all([
          pool.query(
            'SELECT t.id,t.title,t.description,t.priority,t.status,t.due_date AS "dueDate",t.created_at AS "createdAt",t.updated_at AS "updatedAt",'+
            't.creator_user_id AS "creatorId",c.display_name AS "creatorName",c.role AS "creatorRole",'+
            't.assignee_user_id AS "assigneeId",a.display_name AS "assigneeName",a.role AS "assigneeRole",'+
            '(t.assignee_user_id=$1) AS "isAssignee",(t.creator_user_id=$1) AS "isCreator" '+
            'FROM patrul_tasks t JOIN patrul_users c ON c.id=t.creator_user_id JOIN patrul_users a ON a.id=t.assignee_user_id '+
            'WHERE ($2::boolean OR t.creator_user_id=$1 OR t.assignee_user_id=$1) '+
            "ORDER BY CASE WHEN t.status IN ('Выполнено','Отменено') THEN 1 ELSE 0 END,t.due_date NULLS LAST,t.created_at DESC LIMIT 300",
            [s.id,canViewAll]
          ),
          pool.query('SELECT COUNT(*)::int AS count FROM patrul_task_notifications WHERE user_id=$1 AND is_read=FALSE',[s.id]),
          pool.query('SELECT id,task_id AS "taskId",notification_type AS type,title,body,is_read AS "isRead",created_at AS "createdAt" FROM patrul_task_notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',[s.id])
        ]);
        send(res,200,{tasks:tasks.rows,unreadNotifications:Number(unread.rows[0].count)||0,notifications:notifications.rows,actorId:s.id,canViewAll});
        return true;
      }

      if(p==='/api/tasks'&&req.method==='POST'){
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(!SHARED_STAFF_ROLES.includes(s.role)){send(res,403,{error:'Создавать поручения могут только вышестоящие роли'});return true;}
        if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
        const b=await readJson(req);
        const assigneeId=String(b.assigneeId||'').trim();
        const title=typeof b.title==='string'?b.title.trim():'';
        const description=typeof b.description==='string'?b.description.trim():'';
        const priority=String(b.priority||'Обычный');
        const dueDate=b.dueDate==null||b.dueDate===''?null:String(b.dueDate);
        const validDate=dueDate===null||(/^\d{4}-\d{2}-\d{2}$/.test(dueDate)&&!Number.isNaN(Date.parse(dueDate+'T00:00:00Z'))&&new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)===dueDate);
        if(!/^[0-9a-f-]{36}$/i.test(assigneeId)||!title||title.length>180||description.length>4000||
          !['Обычный','Важный','Срочный'].includes(priority)||!validDate){
          send(res,400,{error:'Проверьте получателя, тему, описание, приоритет и срок поручения'});return true;
        }
        const recipient=await pool.query('SELECT id,display_name,role FROM patrul_users WHERE id=$1 AND is_active=TRUE AND role=ANY($2::text[])',[assigneeId,[...SHARED_STAFF_ROLES,'starshiy_patrulya']]);
        if(!recipient.rowCount){send(res,404,{error:'Получатель не найден или его учётная запись отключена'});return true;}
        const client=await pool.connect();
        let task;
        try{
          await client.query('BEGIN');
          const created=await client.query(
            'INSERT INTO patrul_tasks(creator_user_id,assignee_user_id,title,description,priority,due_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,title,description,priority,status,due_date AS "dueDate",created_at AS "createdAt",updated_at AS "updatedAt"',
            [s.id,assigneeId,title,description,priority,dueDate]
          );
          task=created.rows[0];
          await client.query('INSERT INTO patrul_task_events(task_id,actor_user_id,event_type,details) VALUES($1,$2,$3,$4::jsonb)',[task.id,s.id,'created',JSON.stringify({assigneeId,priority,dueDate})]);
          await client.query('INSERT INTO patrul_task_notifications(user_id,task_id,notification_type,title,body,dedupe_key) VALUES($1,$2,$3,$4,$5,$6)',[assigneeId,task.id,'assigned','Новое поручение',String(s.display_name||s.username)+' назначил(а) вам поручение: '+title,'assigned:'+task.id]);
          await client.query('COMMIT');
        }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
        finally{client.release();}
        await audit(s.id,'task_created',assigneeId,{taskId:task.id,priority,dueDate});
        send(res,201,{task:{...task,creatorId:s.id,creatorName:s.display_name,assigneeId,assigneeName:recipient.rows[0].display_name,assigneeRole:recipient.rows[0].role,isCreator:true,isAssignee:s.id===assigneeId}});
        return true;
      }

      if(p==='/api/tasks/notifications/read'&&req.method==='POST'){
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
        const q=await pool.query('UPDATE patrul_task_notifications SET is_read=TRUE,read_at=NOW() WHERE user_id=$1 AND is_read=FALSE RETURNING id',[s.id]);
        await audit(s.id,'task_notifications_read',s.id,{count:q.rowCount});
        send(res,200,{ok:true,count:q.rowCount});
        return true;
      }

      const taskEventsMatch=p.match(/^\/api\/tasks\/([0-9a-f-]{36})\/events$/i);
      if(taskEventsMatch&&req.method==='GET'){
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(![...SHARED_STAFF_ROLES,'starshiy_patrulya'].includes(s.role)){send(res,403,{error:'Нет доступа к истории поручений'});return true;}
        const q=await pool.query('SELECT creator_user_id,assignee_user_id FROM patrul_tasks WHERE id=$1',[taskEventsMatch[1]]);
        if(!q.rowCount){send(res,404,{error:'Поручение не найдено'});return true;}
        const task=q.rows[0];
        const canInspectAll=['nachalnik','uchet'].includes(s.role);
        if(!canInspectAll&&task.creator_user_id!==s.id&&task.assignee_user_id!==s.id){
          send(res,403,{error:'История доступна только постановщику и исполнителю'});return true;
        }
        const events=await pool.query(
          'SELECT e.id,e.event_type AS type,e.details,e.created_at AS "createdAt",u.display_name AS "actorName",u.role AS "actorRole" '+
          'FROM patrul_task_events e LEFT JOIN patrul_users u ON u.id=e.actor_user_id '+
          'WHERE e.task_id=$1 ORDER BY e.created_at ASC,e.id ASC',[taskEventsMatch[1]]
        );
        send(res,200,{events:events.rows});
        return true;
      }

      const taskMatch=p.match(/^\/api\/tasks\/([0-9a-f-]{36})$/i);
      if(taskMatch&&req.method==='PATCH'){
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(![...SHARED_STAFF_ROLES,'starshiy_patrulya'].includes(s.role)){send(res,403,{error:'Нет доступа к поручениям'});return true;}
        if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
        const b=await readJson(req),status=String(b.status||''),comment=typeof b.comment==='string'?b.comment.trim():'';
        if(!['Новая','В работе','На проверке','На доработку','Выполнено','Отменено'].includes(status)){send(res,400,{error:'Недопустимый статус поручения'});return true;}
        const client=await pool.connect();
        let updated,notifyUser;
        try{
          await client.query('BEGIN');
          const current=await client.query('SELECT id,creator_user_id,assignee_user_id,status,title FROM patrul_tasks WHERE id=$1 FOR UPDATE',[taskMatch[1]]);
          if(!current.rowCount){await client.query('ROLLBACK');send(res,404,{error:'Поручение не найдено'});return true;}
          const row=current.rows[0],isCreator=row.creator_user_id===s.id,isAssignee=row.assignee_user_id===s.id;
          if(!isCreator&&!isAssignee){await client.query('ROLLBACK');send(res,403,{error:'Это поручение назначено другому сотруднику'});return true;}
          const assigneeAllowed=row.status==='Новая'||row.status==='На доработку'?['В работе']:row.status==='В работе'?['На проверке']:[];
          const creatorAllowed=row.status==='На проверке'?['Новая','На доработку','Выполнено','Отменено']:['Новая','Отменено'];
          const allowed=new Set([...(isAssignee?assigneeAllowed:[]),...(isCreator?creatorAllowed:[])]);
          if(!allowed.has(status)){await client.query('ROLLBACK');send(res,403,{error:isAssignee?'Исполнитель может начать работу или отправить результат на проверку; итоговую приёмку подтверждает постановщик':'Постановщик может вернуть поручение на доработку только после отправки на проверку, перевести в новые или отменить его'});return true;}
          if(comment.length>1000||(status==='На доработку'&&!comment)){await client.query('ROLLBACK');send(res,400,{error:'Для возврата на доработку укажите причину (до 1000 символов)'});return true;}
          const q=await client.query("UPDATE patrul_tasks SET status=$2,updated_at=NOW(),completed_at=CASE WHEN $2='Выполнено' THEN NOW() ELSE NULL END WHERE id=$1 RETURNING id,title,description,priority,status,due_date AS \"dueDate\",created_at AS \"createdAt\",updated_at AS \"updatedAt\"",[taskMatch[1],status]);
          updated=q.rows[0];
          const event=await client.query('INSERT INTO patrul_task_events(task_id,actor_user_id,event_type,details) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[updated.id,s.id,'status_changed',JSON.stringify({from:row.status,to:status,...(comment?{comment}:{})})]);
          notifyUser=isAssignee?row.creator_user_id:row.assignee_user_id;
          if(notifyUser!==s.id){const notice=(String(s.display_name||s.username)+' изменил(а) статус «'+updated.title+'» на «'+status+'»'+(comment?'. Причина: '+comment:'')).slice(0,1000);await client.query('INSERT INTO patrul_task_notifications(user_id,task_id,notification_type,title,body,dedupe_key) VALUES($1,$2,$3,$4,$5,$6)',[notifyUser,updated.id,'status_changed','Изменён статус поручения',notice,'status:'+event.rows[0].id]);}
          await client.query('COMMIT');
        }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
        finally{client.release();}
        await audit(s.id,'task_status_updated',notifyUser||null,{taskId:updated.id,status});
        send(res,200,{task:updated});
        return true;
      }

      if(p==='/api/documents/next-number'&&req.method==='POST'){
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(s.role!=='dokumentoved'){send(res,403,{error:'Нумерация документов доступна только документоведу'});return true;}
        if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
        const body=await readJson(req);
        const date=typeof body.date==='string'?body.date.trim():'';
        const year=Number(date.slice(0,4));
        const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isInteger(year)&&year>=2000&&year<=9999&&
          !Number.isNaN(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
        const minimumSequence=body.minimumSequence===undefined?0:Number(body.minimumSequence);
        if(!validDate||!Number.isInteger(minimumSequence)||minimumSequence<0||minimumSequence>9999999){
          send(res,400,{error:'Укажите корректную дату документа и допустимый последний локальный номер'});return true;
        }
        const client=await pool.connect();
        let sequence;
        try{
          await client.query('BEGIN');
          const q=await client.query(
            'INSERT INTO patrul_document_counters(year,last_number) VALUES($1,$2+1) '+
            'ON CONFLICT(year) DO UPDATE SET last_number=GREATEST(patrul_document_counters.last_number,EXCLUDED.last_number-1)+1,updated_at=NOW() '+
            'RETURNING last_number',[year,minimumSequence]
          );
          sequence=Number(q.rows[0].last_number);
          await client.query('COMMIT');
        }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
        finally{client.release();}
        await audit(s.id,'document_number_issued',null,{year,sequence});
        send(res,201,{year,sequence,number:String(sequence).padStart(3,'0')+'/'+year});
        return true;
      }

      if(p==='/api/shared-staff') {
        const s=await sessionFor(req);
        if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        if(!SHARED_STAFF_ROLES.includes(s.role)){send(res,403,{error:'Нет доступа к общему личному составу'});return true;}
        if(req.method==='GET') {
          const client=await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query('INSERT INTO patrul_shared_staff(id,data,version) VALUES(1,NULL,0) ON CONFLICT(id) DO NOTHING');
            let q=await client.query('SELECT data,version,updated_at FROM patrul_shared_staff WHERE id=1 FOR UPDATE');
            let row=q.rows[0];
            if(!row.data) {
              const legacyRows=await client.query("SELECT role,data FROM patrul_role_data WHERE role = ANY($1::text[]) ORDER BY CASE role WHEN 'nachalnik' THEN 1 WHEN 'zam' THEN 2 WHEN 'uchet' THEN 3 ELSE 4 END",[SHARED_STAFF_ROLES]);
              const roleData={};
              for(const legacy of legacyRows.rows) roleData[legacy.role]=decryptData(legacy.data,legacy.role);
              const initial=buildLegacySharedStaff(roleData);
              q=await client.query('UPDATE patrul_shared_staff SET data=$1::jsonb,version=1,updated_at=NOW() WHERE id=1 RETURNING data,version,updated_at',[JSON.stringify(encryptData(initial,'shared_staff'))]);
              row=q.rows[0];
            }
            const data=decryptData(row.data,'shared_staff');
            await client.query('COMMIT');
            send(res,200,{data,version:Number(row.version),updatedAt:row.updated_at});
          } catch(e) {
            await client.query('ROLLBACK').catch(()=>{});
            throw e;
          } finally { client.release(); }
          return true;
        }
        if(req.method==='PUT') {
          if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const b=await readJson(req);
          if(!b||typeof b!=='object'||Array.isArray(b)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1||
            !b.data||typeof b.data!=='object'||!Array.isArray(b.data.staff)||!Array.isArray(b.data.departments)||
            b.data.staff.length>2000||b.data.departments.length>100) {
            send(res,400,{error:'Некорректный общий список личного состава'});return true;
          }
          const client=await pool.connect();
          let result;
          try {
            await client.query('BEGIN');
            await client.query('INSERT INTO patrul_shared_staff(id,data,version) VALUES(1,NULL,0) ON CONFLICT(id) DO NOTHING');
            const q=await client.query('SELECT data,version,updated_at FROM patrul_shared_staff WHERE id=1 FOR UPDATE');
            const row=q.rows[0], current=row.data?decryptData(row.data,'shared_staff'):buildLegacySharedStaff({});
            if(Number(row.version)!==b.expectedVersion) {
              await client.query('ROLLBACK');
              send(res,409,{error:'Общий список уже изменился',data:current,version:Number(row.version),updatedAt:row.updated_at});
              return true;
            }
            if(s.role!=='uchet' && Object.prototype.hasOwnProperty.call(b.data,'postEquipment') && JSON.stringify(b.data.postEquipment || []) !== JSON.stringify(current.postEquipment || [])) {
              await client.query('ROLLBACK');
              send(res,403,{error:'Изменять комплекты постов может только старший мастер патруля'});
              return true;
            }
            const next=normalizeSharedStaffWrite(b.data,current,s.role);
            const updated=await client.query(
              'UPDATE patrul_shared_staff SET data=$1::jsonb,version=version+1,updated_at=NOW() WHERE id=1 RETURNING data,version,updated_at',
              [JSON.stringify(encryptData(next,'shared_staff'))]
            );
            result={data:next,version:Number(updated.rows[0].version),updatedAt:updated.rows[0].updated_at};
            await client.query('COMMIT');
          } catch(e) {
            await client.query('ROLLBACK').catch(()=>{});
            throw e;
          } finally { client.release(); }
          await audit(s.id,'shared_staff_updated',s.id,{role:s.role,staffCount:result.data.staff.length,departmentCount:result.data.departments.length});
          send(res,200,result);
          return true;
        }
        send(res,405,{error:'Метод не поддерживается'});return true;
      }

      if(p.startsWith('/api/session-data/')){
        const s=await sessionFor(req);if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        const role=p.slice('/api/session-data/'.length);if(!ROLES.has(role)){send(res,400,{error:'Неизвестная роль'});return true;}
        if(s.role!==role){send(res,403,{error:'Нет доступа к данным этой роли'});return true;}
        if(req.method==='GET'){
          const q=await pool.query('SELECT data,version,updated_at FROM patrul_role_data WHERE role=$1',[role]);
          if(!q.rowCount){send(res,200,{role,data:null,version:0,updatedAt:null});return true;}
          const row=q.rows[0],data=await readRoleData(pool,role,row);
          let version=Number(row.version),updatedAt=row.updated_at;
          if(role==='nachalnik'&&data&&typeof data==='object'&&!Array.isArray(data)&&Object.prototype.hasOwnProperty.call(data,'duty')){
            delete data.duty;
            const cleaned=await pool.query(
              "UPDATE patrul_role_data SET data=$1::jsonb,version=version+1,updated_at=NOW() WHERE role=$2 AND version=$3 RETURNING version,updated_at",
              [JSON.stringify(encryptData(data,role)),role,row.version]
            );
            if(cleaned.rowCount){version=Number(cleaned.rows[0].version);updatedAt=cleaned.rows[0].updated_at;}
            else {send(res,409,{error:'Старые данные наряда одновременно изменились. Обновите страницу.'});return true;}
          }
          send(res,200,{role,data,version,updatedAt});return true;
        }
        if(req.method==='PUT'){
          if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const b=await readJson(req);if(!b||typeof b!=='object'||Array.isArray(b)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0||!Object.prototype.hasOwnProperty.call(b,'data')||!b.data||typeof b.data!=='object'||Array.isArray(b.data)){send(res,400,{error:'Некорректные данные'});return true;}
          const roleData={...b.data};
          if(role==='nachalnik')delete roleData.duty;
          const q=await pool.query('INSERT INTO patrul_role_data(role,data,version,updated_at) VALUES($1,$2::jsonb,1,NOW()) ON CONFLICT(role) DO UPDATE SET data=EXCLUDED.data,version=patrul_role_data.version+1,updated_at=NOW() WHERE patrul_role_data.version=$3 RETURNING data,version,updated_at',[role,JSON.stringify(encryptData(roleData,role)),b.expectedVersion]);
          if(!q.rowCount){const v=await pool.query('SELECT version FROM patrul_role_data WHERE role=$1',[role]);send(res,409,{error:'Данные уже изменились',currentVersion:v.rowCount?Number(v.rows[0].version):0});return true;}
          await audit(s.id,'role_data_updated',s.id,{role,version:Number(q.rows[0].version)});
          send(res,200,{role,data:roleData,version:Number(q.rows[0].version),updatedAt:q.rows[0].updated_at});return true;
        }
        send(res,404,{error:'Маршрут не найден'});return true;
      }
      send(res,404,{error:'Маршрут не найден'});return true;
    } catch(e) {
      if(e.code==='23505'){send(res,409,{error:'Такой логин уже существует'});return true;}
      if(e.status){send(res,e.status,{error:e.message});return true;}
      console.error('Auth API failure:',e.message);send(res,500,{error:'Внутренняя ошибка сервера'});return true;
    }
  };
}
module.exports={createAuth,hashPassword,verifyPassword};
