// Cache semplice: l'app funziona anche senza rete. Cambia VERSION quando aggiorni i file.
const VERSION = 'stagedeck-20';
const FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './viewer3d.js', './models3d.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Rete prima, cache solo se si e' offline: cosi' dopo ogni aggiornamento si vede subito la versione nuova.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, {cache:'no-cache'}).then(r => {
    if (r.ok && new URL(e.request.url).origin === location.origin) { const c = r.clone(); caches.open(VERSION).then(ch => ch.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
