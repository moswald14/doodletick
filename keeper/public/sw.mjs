const CACHE = 'doodletick-shell-v0.1b-r2';
const ASSETS = ['/clock-wheel.mjs', '/', '/index.html', '/app.mjs', '/core.mjs', '/style.css', '/logo.svg', '/files.css', '/files-ui.mjs', '/licenses.mjs', '/archive.mjs', '/file-store.mjs', '/peers.mjs', '/manifest.webmanifest', '/theme.mjs', '/theme.css'];
ASSETS.push('/spirograph.mjs', '/spirograph-auth.mjs', '/vpn-description.mjs', '/vpn-transport.mjs', '/vpn-ui.mjs', '/arcade.css', '/arcade-ui.mjs', '/arcade-canvas.mjs', '/arcade-room.mjs', '/arcade-store.mjs', '/arcade-link.mjs', '/game-engine.mjs', '/workshop.mjs');
ASSETS.push('/mushroom-core.mjs', '/mushroom-ui.mjs', '/mushroom-art.mjs', '/mushroom.css', '/dot-effects-dsp.mjs', '/dot-amp-tone.mjs', '/dot-studio-dsp.mjs', '/dot-collision-audio.mjs', '/dot-wave-export.mjs', '/dot-mushroom-dsp.mjs', '/dot-mushroom-motion.mjs');
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('doodletick-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); } return response; }).catch(() => caches.open(CACHE).then(cache => cache.match(event.request))));
});
