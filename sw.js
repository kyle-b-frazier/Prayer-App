// Network-first for the app's own files (so updates always arrive), falling back
// to the cache when offline. Fonts and the Firebase SDK are cached as they load.
const CACHE = 'prayers-v1';
const CORE = ['./', 'index.html', 'styles.css', 'app.js', 'schedule.js', 'firebase.js', 'icon.ico'];
const CACHED_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin && !CACHED_HOSTS.includes(url.hostname)) return;

    e.respondWith((async () => {
        const cache = await caches.open(CACHE);
        try {
            const res = await fetch(req, sameOrigin ? { cache: 'no-cache' } : undefined);
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
        } catch (err) {
            const hit = await cache.match(req, { ignoreSearch: sameOrigin });
            if (hit) return hit;
            throw err;
        }
    })());
});
