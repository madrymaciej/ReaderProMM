// Offline: cache aplikacji. Zmień VERSION przy każdym wydaniu, aby iPhone pobrał nowe pliki.
const VERSION = 'rpmm-v2.13.0';
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/article.js', './js/infopigula.js', './js/demos.js', './js/tutorials.js', './js/lib.js', './js/texts.js', './js/reader.js', './js/db.js', './js/importers.js', './js/textmodel.js',
  './js/config.js', './js/sync.js', './js/syncmerge.js', './vendor/supabase/supabase.min.js',
  './vendor/pdfjs/pdf.min.js', './vendor/pdfjs/pdf.worker.min.js',
  './icons/icon.svg', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Sieć najpierw (świeża wersja), cache jako zapas offline.
// Tylko pliki aplikacji (ta sama domena). Zapytania do Supabase i Apps Script idą prosto do sieci —
// prywatne dane nie trafiają do pamięci podręcznej i nigdy nie są podawane z niej nieaktualne.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
