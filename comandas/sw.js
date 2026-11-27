/* Comandas Órale Padre · app instalable (v2: arranque rápido).
   · Pantalla (HTML): red primero para ver siempre lo último publicado; si tarda más de 3 s
     o no hay internet, se abre la copia guardada.
   · Scripts y estilos con versión (?v=…), fuentes y librerías: se guardan y se sirven
     desde la tablet sin esperar a la red (cada publicación cambia la versión).
   · Lo demás: red primero, copia guardada si no hay internet.
   Nunca guarda datos de Supabase (cuentas, cobros…): sólo pantallas y scripts. */
const CACHE = 'comandas-app-v3';
const APP = '/comandas/';
const PROPIO = self.location.origin;
const CDN = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('comandas-app-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
const guarda = (ca, clave, res) => { if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) ca.put(clave, res.clone()).catch(() => {}); return res; };
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== PROPIO && !CDN.test(u.hostname)) return;   // Supabase y demás: directo a la red
  if (r.mode === 'navigate') {
    // v3: pantalla con RED primero (así cada publicación se ve a la primera); si la red tarda más de 3 s o no hay internet, la copia guardada.
    e.respondWith(caches.open(CACHE).then(async ca => {
      const red = fetch(r).then(res => guarda(ca, APP, res));
      const copia = await ca.match(APP);
      if (!copia) return red.catch(() => Response.error());
      const lenta = new Promise(ok => setTimeout(() => ok(copia), 3000));
      e.waitUntil(red.catch(() => {}));
      return Promise.race([red.then(res => res.ok ? res : copia).catch(() => copia), lenta]);
    }));
    return;
  }
  const fija = CDN.test(u.hostname) || /[?&]v=/.test(u.search);
  e.respondWith(caches.open(CACHE).then(async ca => {
    if (fija) { const m = await ca.match(r); if (m) return m; }
    return fetch(r).then(res => guarda(ca, r, res)).catch(() => ca.match(r).then(m => m || Response.error()));
  }));
});
