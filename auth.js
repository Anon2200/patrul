'use strict';
const crypto = require('node:crypto');
const { encryptData, readRoleData } = require('./data-crypto');
const { promisify } = require('node:util');
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
    if(!p.startsWith('/api/auth/')&&!p.startsWith('/api/admin/')&&!p.startsWith('/api/session-data/')&&!p.startsWith('/api/mail/')) return false;
    try {
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
        const ok=!!(u&&u.is_active&&passwordMatches);
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
          const id=reset[1],q=await pool.query('SELECT id FROM patrul_users WHERE id=$1',[id]);if(!q.rowCount){send(res,404,{error:'Сотрудник не найден'});return true;}
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
          if(!ROLES.has(role)||typeof active!=='boolean'||typeof name!=='string'||!name.trim()||name.trim().length>200){send(res,400,{error:'Некорректные изменения'});return true;}
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
        const threadMatch=mailPath.match(/^\/threads\/([0-9a-f-]{36})$/i);
        if(threadMatch&&req.method==='GET'){
          const id=threadMatch[1];
          const participant=await pool.query('SELECT 1 FROM patrul_mail_participants WHERE thread_id=$1 AND user_id=$2',[id,s.id]);
          if(!participant.rowCount){send(res,404,{error:'Письмо не найдено'});return true;}
          await pool.query('UPDATE patrul_mail_participants SET last_read_at=NOW() WHERE thread_id=$1 AND user_id=$2',[id,s.id]);
          const thread=await pool.query('SELECT t.id,t.subject,t.created_at AS "createdAt",t.created_by=$2 AS "isSent",u.display_name AS "otherName",u.role AS "otherRole" FROM patrul_mail_threads t JOIN LATERAL (SELECT pu.display_name,pu.role FROM patrul_mail_participants op JOIN patrul_users pu ON pu.id=op.user_id WHERE op.thread_id=t.id AND op.user_id<>$2 LIMIT 1) u ON TRUE WHERE t.id=$1',[id,s.id]);
          const messages=await pool.query('SELECT m.id,m.body,m.created_at AS "createdAt",m.sender_id=$2 AS "fromMe",u.display_name AS "senderName",u.role AS "senderRole" FROM patrul_mail_messages m JOIN patrul_users u ON u.id=m.sender_id WHERE m.thread_id=$1 ORDER BY m.created_at,m.id',[id,s.id]);
          send(res,200,{thread:thread.rows[0],messages:messages.rows});return true;
        }
        if(mailPath==='/threads'&&req.method==='POST'){
          if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const b=await readJson(req),to=String(b.toUserId||''),subject=typeof b.subject==='string'?b.subject.trim():'',body=typeof b.body==='string'?b.body.trim():'';
          if(!/^[0-9a-f-]{36}$/i.test(to)||to===s.id||!subject||subject.length>200||!body||body.length>20000){send(res,400,{error:'Укажите получателя, тему (до 200 символов) и текст (до 20 000 символов)'});return true;}
          const c=await pool.connect();
          try{
            await c.query('BEGIN');
            const recipient=await c.query('SELECT id FROM patrul_users WHERE id=$1 AND is_active=TRUE',[to]);
            if(!recipient.rowCount){await c.query('ROLLBACK');send(res,404,{error:'Получатель не найден или заблокирован'});return true;}
            const t=await c.query('INSERT INTO patrul_mail_threads(subject,created_by) VALUES($1,$2) RETURNING id',[subject,s.id]);
            await c.query('INSERT INTO patrul_mail_participants(thread_id,user_id) VALUES($1,$2),($1,$3)',[t.rows[0].id,s.id,to]);
            await c.query('INSERT INTO patrul_mail_messages(thread_id,sender_id,body) VALUES($1,$2,$3)',[t.rows[0].id,s.id,body]);
            await c.query('UPDATE patrul_mail_threads SET updated_at=NOW() WHERE id=$1',[t.rows[0].id]);
            await c.query('COMMIT');send(res,201,{threadId:t.rows[0].id});
          }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
          return true;
        }
        const replyMatch=mailPath.match(/^\/threads\/([0-9a-f-]{36})\/messages$/i);
        if(replyMatch&&req.method==='POST'){
          if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const b=await readJson(req),body=typeof b.body==='string'?b.body.trim():'';
          if(!body||body.length>20000){send(res,400,{error:'Текст ответа обязателен (до 20 000 символов)'});return true;}
          const c=await pool.connect();
          try{
            await c.query('BEGIN');
            const t=await c.query('SELECT t.id FROM patrul_mail_threads t JOIN patrul_mail_participants p ON p.thread_id=t.id WHERE t.id=$1 AND p.user_id=$2 FOR UPDATE OF t',[replyMatch[1],s.id]);
            if(!t.rowCount){await c.query('ROLLBACK');send(res,404,{error:'Переписка не найдена'});return true;}
            await c.query('INSERT INTO patrul_mail_messages(thread_id,sender_id,body) VALUES($1,$2,$3)',[replyMatch[1],s.id,body]);
            await c.query('UPDATE patrul_mail_threads SET updated_at=NOW() WHERE id=$1',[replyMatch[1]]);
            await c.query('UPDATE patrul_mail_participants SET last_read_at=NOW() WHERE thread_id=$1 AND user_id=$2',[replyMatch[1],s.id]);
            await c.query('COMMIT');send(res,201,{ok:true});
          }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
          return true;
        }
        send(res,404,{error:'Маршрут почты не найден'});return true;
      }
      if(p.startsWith('/api/session-data/')){
        const s=await sessionFor(req);if(!s){send(res,401,{error:'Требуется персональный вход'});return true;}
        if(s.must_change_password){send(res,403,{error:'Сначала смените временный пароль'});return true;}
        const role=p.slice('/api/session-data/'.length);if(!ROLES.has(role)){send(res,400,{error:'Неизвестная роль'});return true;}
        if(s.role!==role){send(res,403,{error:'Нет доступа к данным этой роли'});return true;}
        if(req.method==='GET'){
          const q=await pool.query('SELECT data,version,updated_at FROM patrul_role_data WHERE role=$1',[role]);
          if(!q.rowCount){send(res,200,{role,data:null,version:0,updatedAt:null});return true;}
          send(res,200,{role,data:await readRoleData(pool,role,q.rows[0]),version:Number(q.rows[0].version),updatedAt:q.rows[0].updated_at});return true;
        }
        if(req.method==='PUT'){
          if(!(await csrfOk(req,s))){send(res,403,{error:'Проверка CSRF не пройдена'});return true;}
          const b=await readJson(req);if(!b||typeof b!=='object'||Array.isArray(b)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0||!Object.prototype.hasOwnProperty.call(b,'data')){send(res,400,{error:'Некорректные данные'});return true;}
          const q=await pool.query('INSERT INTO patrul_role_data(role,data,version,updated_at) VALUES($1,$2::jsonb,1,NOW()) ON CONFLICT(role) DO UPDATE SET data=EXCLUDED.data,version=patrul_role_data.version+1,updated_at=NOW() WHERE patrul_role_data.version=$3 RETURNING data,version,updated_at',[role,JSON.stringify(encryptData(b.data,role)),b.expectedVersion]);
          if(!q.rowCount){const v=await pool.query('SELECT version FROM patrul_role_data WHERE role=$1',[role]);send(res,409,{error:'Данные уже изменились',currentVersion:v.rowCount?Number(v.rows[0].version):0});return true;}
          await audit(s.id,'role_data_updated',s.id,{role,version:Number(q.rows[0].version)});
          send(res,200,{role,data:b.data,version:Number(q.rows[0].version),updatedAt:q.rows[0].updated_at});return true;
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
