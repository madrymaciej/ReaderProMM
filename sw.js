// Offline: cache aplikacji. Dwa kanały na tej samej domenie:
//   TEST  /SzybkieCzytanie/       — wersja web, każda zmiana trafia tu od razu (sieć najpierw).
//   PROD  /SzybkieCzytanie/prod/  — aplikacja na iPhonie: działa zainstalowana wersja z pamięci,
//         nowa czeka, aż użytkownik ją zatwierdzi (albo zainstaluje się sama w nocy).
// BUILD podmienia GitHub Actions przy publikacji (zmiana treści pliku = przeglądarka widzi nową wersję).
// Aktualizacja usuwa tylko pliki aplikacji z pamięci podręcznej — NIGDY dane (localStorage, IndexedDB).
const BUILD = '__BUILD__';
const CHANNEL = self.location.pathname.includes('/prod/') ? 'prod' : 'test';
const PREFIX = `rpmm-${CHANNEL}-`;
const VERSION = PREFIX + BUILD;
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/version.js', './js/article.js', './js/infopigula.js', './js/demos.js', './js/tutorials.js', './js/lib.js', './js/texts.js', './js/reader.js', './js/db.js', './js/importers.js', './js/textmodel.js',
  './vendor/pdfjs/pdf.min.js', './vendor/pdfjs/pdf.worker.min.js',
  './icons/icon.svg', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    // TEST: nowa wersja od razu. PROD: czeka na zgodę (wiadomość 'skipWaiting' ze strony).
    .then(() => (CHANNEL === 'test' ? self.skipWaiting() : undefined)));
});

self.addEventListener('activate', (e) => {
  // Kasujemy tylko stare pliki WŁASNEGO kanału (+ dawne cache 'rpmm-v…' w kanale TEST).
  const mine = (k) => k.startsWith(PREFIX) || (CHANNEL === 'test' && /^rpmm-v/.test(k));
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => mine(k) && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (CHANNEL === 'prod') {
    // PROD: zainstalowana wersja z pamięci; sieć tylko dla plików spoza listy.
    e.respondWith(caches.open(VERSION).then((c) => c.match(e.request, { ignoreSearch: true })
      .then((r) => r || fetch(e.request).catch(() => (e.request.mode === 'navigate' ? c.match('./index.html') : Response.error())))));
    return;
  }
  // TEST: sieć najpierw (świeża wersja), cache jako zapas offline.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
