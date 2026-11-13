/*
 * AskCalls app-shell service worker (spec 2 rule 5, 11.4).
 * Caches only the static shell: Next.js's hashed build assets under /_next/static/ (scripts,
 * styles, fonts) and the app icons. Every other request, including /api/**, /app pages and the
 * model and ffmpeg files, goes to the network untouched: no API response and no page that could
 * hold decrypted data is ever stored.
 */
const SHELL = 'askcalls-shell-v1';
const CACHEABLE = [/^\/_next\/static\//, /^\/icons\//];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE.some((re) => re.test(url.pathname))) return;
  event.respondWith(
    caches.open(SHELL).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') await cache.put(req, res.clone());
      return res;
    }),
  );
});
