(()=>{'use strict';
const $=s=>document.querySelector(s);
let objectUrl='';
function size(n){return n<1024?n+' Б':n<1048576?(n/1024).toFixed(0)+' КБ':(n/1048576).toFixed(1)+' МБ'}
function message(text){$('#status').textContent=text;$('#status').classList.remove('hidden');$('#preview').classList.add('hidden')}
function showPreview(blob,name,type){
 const root=$('#preview');root.replaceChildren();const lower=name.toLowerCase();const mime=(type||blob.type||'').toLowerCase();
 if(mime==='application/pdf'||lower.endsWith('.pdf')){const frame=document.createElement('iframe');frame.title='Предпросмотр PDF';frame.src=objectUrl;frame.referrerPolicy='no-referrer';root.append(frame)}
 else if(mime.startsWith('image/')||/\.(png|jpe?g|webp)$/.test(lower)){const img=document.createElement('img');img.alt=name;img.src=objectUrl;root.append(img)}
 else if(mime==='text/html'||lower.endsWith('.html')){const frame=document.createElement('iframe');frame.title='Безопасный просмотр HTML';frame.src=objectUrl;frame.setAttribute('sandbox','');root.append(frame)}
 else if(mime.startsWith('text/')||mime==='application/json'||lower.endsWith('.json')){const pre=document.createElement('pre');blob.text().then(t=>{if(lower.endsWith('.json')){try{pre.textContent=JSON.stringify(JSON.parse(t),null,2)}catch(_){pre.textContent=t}}else pre.textContent=t});root.append(pre)}
 else {message('Предпросмотр этого формата в браузере не поддерживается. Скачайте файл и откройте его в подходящем приложении (например, Word или Excel).');return}
 $('#status').classList.add('hidden');root.classList.remove('hidden')
}
(async()=>{
 const params=new URLSearchParams(location.search),id=params.get('id'),archiveId=params.get('archive');
 const targetId=archiveId||id;
 if(!targetId||!/^[0-9a-f-]{36}$/i.test(targetId)){message('Некорректная ссылка на документ.');return}
 try{
  const response=await fetch((archiveId?'/api/mail/archive/':'/api/mail/attachments/')+encodeURIComponent(targetId),{credentials:'same-origin',cache:'no-store'});
  if(!response.ok){let e={};try{e=await response.json()}catch(_){}throw new Error(e.error||'Файл недоступен. Возможно, у вашей учётной записи нет доступа к этой переписке.')}
  const blob=await response.blob(),disposition=response.headers.get('content-disposition')||'',encoded=disposition.match(/filename\*=UTF-8''([^;]+)/i),plain=disposition.match(/filename="?([^";]+)"?/i);
  let name='Вложение';if(encoded){try{name=decodeURIComponent(encoded[1])}catch(_){name=encoded[1]}}else if(plain)name=plain[1];
  const type=(response.headers.get('content-type')||blob.type||'application/octet-stream').split(';')[0].trim().toLowerCase();
  if(!blob.size)throw new Error('Сервер вернул пустой файл. Повторите попытку или обратитесь к администратору.');
  $('#fileName').textContent=name;$('#fileInfo').textContent=size(blob.size)+' · '+type;
  objectUrl=URL.createObjectURL(blob);const download=$('#download');download.href=objectUrl;download.download=name;
  showPreview(blob,name,type);
 }catch(e){message(e.message||'Не удалось открыть файл.')}
})();
window.addEventListener('pagehide',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)});
})();