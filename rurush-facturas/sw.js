/* RURUSH Facturas — guarda la app en el celular para que abra sin internet.
   index.html: primero la red (para recibir cambios), si no hay, la copia guardada.
   Librerías del CDN (versión fija): la copia guardada. A Microsoft/OneDrive no se toca. */
const CACHE = 'rurush-facturas-v2';
const CDN = [
  'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./'].concat(CDN.map((u) => new Request(u, { mode: 'no-cors' }))))).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (CDN.includes(req.url)) {
    e.respondWith(caches.match(req.url).then((r) => r || fetch(req).then((res) => {
      const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req.url, copia)); return res;
    })));
    return;
  }
  if (req.mode === 'navigate' && new URL(req.url).origin === location.origin) {
    // Sin la parte ?…/#… (el login de Microsoft vuelve con parámetros).
    // no-store: siempre la última versión publicada (GitHub Pages deja la página 10 min en caché).
    e.respondWith(fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put('./', copia)); }
      return res;
    }).catch(() => caches.match('./')));
  }
});
