const CACHE = 'wordpool-v1';
const ASSETS = ['./', './index.html', './css/style.css', './levels.json', './manifest.webmanifest',
  './js/main.js', './js/game.js', './js/engine.js', './js/geom.js', './js/glyphs.js', './js/generator.js',
  './js/words.js', './js/render.js', './js/audio.js', './js/levels.js', './icons/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); });
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); return res;
  }).catch(() => r)));
});
