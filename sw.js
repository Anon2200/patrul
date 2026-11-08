const C='patrul-202611082151';const F=["index.html", "icon-180.png", "icon-192.png", "icon-512.png", "zam.html", "zam.webmanifest", "dokumentoved.html", "dokumentoved.webmanifest", "nachalnik.html", "nachalnik.webmanifest", "uchet.html", "uchet.webmanifest"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!=C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!='GET')return;const u=new URL(e.request.url);if(u.origin!=location.origin)return;
e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))))});
