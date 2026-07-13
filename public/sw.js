const CACHE_NAME="freight-tracker-v1";
const ASSETS=["/","/index.html","/manifest.json"];

self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(nr=>{if(nr.status===200){const clone=nr.clone();caches.open(CACHE_NAME).then(c=>c.put(e.request,clone))}return nr}).catch(()=>caches.match("/index.html"))))});