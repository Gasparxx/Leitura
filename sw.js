/* LerAqui: service worker (uso offline) */
const VERSION = 'leraqui-v1';
const SHELL = ['index.html', 'manifest.webmanifest', 'icon.svg'];
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;1,7..72,400&family=Lora:ital,wght@0,400;0,500;1,400&display=swap';
const EXTERNAL_HOSTS = ['cdnjs.cloudflare.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

async function precacheFonts(cache) {
  const res = await fetch(FONTS_CSS);
  if (!res.ok) return;
  const css = await res.clone().text();
  await cache.put(FONTS_CSS, res);
  for (const block of css.split('/* ').slice(1)) {
    if (!/^latin \*\//.test(block)) continue;
    const m = block.match(/url\((https:[^)]+)\)/);
    if (m) await cache.add(m[1]).catch(() => {});
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.add('index.html');
    await Promise.all(SHELL.slice(1).map((u) => cache.add(u).catch(() => {})));
    await Promise.all(LIBS.map((u) => cache.add(u).catch(() => {})));
    await precacheFonts(cache).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function handleNavigate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match('index.html');
  const refresh = fetch(request).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put('index.html', res.clone());
    return res;
  }).catch(() => null);
  if (cached) return cached;
  const res = await refresh;
  return res || new Response('Sem conexão. Abra o LerAqui uma vez com internet para usá-lo offline.',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function handleSameOrigin(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}

async function handleExternal(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && url.pathname.includes('/__/')) return;
  if (!same && !EXTERNAL_HOSTS.includes(url.hostname)) return;
  if (req.mode === 'navigate') { event.respondWith(handleNavigate(req)); return; }
  event.respondWith(same ? handleSameOrigin(req) : handleExternal(req));
});
