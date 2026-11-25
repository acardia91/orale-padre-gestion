/* TPV Órale Padre · app instalable.
   Red primero: siempre se usa la versión publicada; si no hay internet, se abre la última
   copia guardada para que el TPV arranque y avise "sin conexión". Nunca guarda datos de
   Supabase (cuentas, cobros…): sólo las pantallas y los scripts. */
const CACHE = 'tpv-app-v1';
const PROPIO = self.location.origin;
const CDN = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tpv-app-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== PROPIO && !CDN.test(u.hostname)) return;   // Supabase y demás: directo a la red
  e.respondWith(fetch(r).then(res => {
    if (res.ok && (res.type === 'basic' || res.type === 'cors')) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(r, c)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('/tpv/', { ignoreSearch: true }) : undefined))
    .then(m => m || Response.error())));
});
