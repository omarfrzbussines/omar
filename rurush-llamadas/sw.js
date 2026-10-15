/* RURUSH Llamadas — necesario para que Android la instale como app (pantalla completa). No guarda nada. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
