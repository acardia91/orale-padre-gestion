/* ÓRALE PADRE · paso rápido entre TPV y Comandas.
   · Botón grande en la esquina (abajo a la izquierda) para saltar de una pantalla a la otra.
   · Con la tablet libre, deja guardada la otra pantalla (HTML, scripts y estilos) para que
     al saltar abra al instante, aunque el wifi vaya justo. */
(function () {
  'use strict';
  const enTPV = location.pathname.startsWith('/tpv');
  const otra = enTPV ? '/comandas/' : '/tpv/';
  const cacheOtra = (enTPV ? 'comandas' : 'tpv') + '-app-v3';
  const q = new URLSearchParams(location.search);
  const destino = () => {
    let local = q.get('local'); try { local = local || (enTPV ? JSON.parse(localStorage.getItem('op-tpv-local')) : localStorage.getItem('op-cocina-local')); } catch (e) {}
    const p = new URLSearchParams(); if (local) p.set('local', local); if (q.has('demo')) p.set('demo', '');
    const s = p.toString().replace(/=(&|$)/g, '$1'); return otra + (s ? '?' + s : '');
  };
  const css = document.createElement('style');
  css.textContent = `
    .salto{position:fixed;left:14px;bottom:14px;z-index:50;display:flex;align-items:center;gap:10px;padding:14px 20px 14px 16px;border-radius:18px;
      background:#00A86B;color:#fff;font:800 18px/1 system-ui,sans-serif;letter-spacing:.02em;text-decoration:none;
      box-shadow:0 6px 20px rgba(0,120,76,.45),0 0 0 3px #fff;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
    .salto svg{width:28px;height:28px;stroke:#fff;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
    .salto small{display:block;font-size:11px;font-weight:700;opacity:.85;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
    .salto:active{transform:scale(.95);background:#008F5B}
    .salto.yendo{opacity:.7}
    @media (max-width:760px){ .salto{padding:13px;border-radius:50%;left:10px;bottom:10px} .salto span{display:none} .salto svg{width:26px;height:26px} }
    body:has(#vista-entrar:not([hidden])) .salto, body:has(#bloqueo:not([hidden])) .salto{display:none}`;
  document.head.appendChild(css);
  const a = document.createElement('a'); a.className = 'salto'; a.href = destino();
  a.innerHTML = enTPV
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 13.9A4 4 0 017 6a5 5 0 0110 0 4 4 0 011 7.9V20H6zM6 17h12"/></svg><span><small>Ir a</small>COMANDAS</span>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v11H3zM8 20h8M12 16v4"/></svg><span><small>Ir al</small>TPV</span>';
  a.title = enTPV ? 'Ir a Comandas (cocina)' : 'Ir al TPV (tomar nota y cobrar)';
  a.addEventListener('click', () => { a.href = destino(); a.classList.add('yendo'); });
  if (!enTPV) a.style.bottom = '62px';   // en Comandas, por encima del resumen de abajo
  document.body.appendChild(a);
  // En Comandas el botón está siempre; en el TPV, sólo en la sala (en la cuenta molesta).
  if (enTPV) { const ver = () => { const c = document.getElementById('vista-cuenta'); a.style.display = c && !c.hidden ? 'none' : ''; };
    new MutationObserver(ver).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] }); ver(); }

  // Dejar guardada la otra pantalla (sólo con conexión y cuando la tablet está libre).
  function precarga() {
    if (!('caches' in window) || !navigator.onLine) return;
    fetch(otra, { cache: 'no-cache' }).then(r => r.ok ? r.text().then(html => ({ r, html })) : null).then(async x => {
      if (!x) return;
      const ca = await caches.open(cacheOtra);
      const base = location.origin + otra;
      const urls = [...x.html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
        .filter(u => /\?v=/.test(u) || /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\//.test(u))
        .map(u => new URL(u, base).href);
      await ca.put(otra, new Response(x.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
      for (const u of urls) {
        if (await ca.match(u)) continue;
        try { const res = await fetch(u, { mode: new URL(u).origin === location.origin ? 'same-origin' : 'cors' }); if (res.ok) await ca.put(u, res); } catch (e) {}
      }
    }).catch(() => {});
  }
  const libre = window.requestIdleCallback || (f => setTimeout(f, 1500));
  addEventListener('load', () => setTimeout(() => libre(precarga), 4000));
})();
