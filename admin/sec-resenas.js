/* ÓRALE PADRE · admin · Reseñas
   Opiniones propias (www.oralepadre.com/opinion: email tras el pedido,
   ticket y QR en mesa) + nota de Uber y Glovo que vuelca el agente.
   Las malas se gestionan aquí: contactar al cliente y marcarlas resueltas. */
(function () {
  'use strict';
  const { api, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  const fecha = d => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const TODOS = { tomares: 'Tomares', 'san-luis': 'San Luis', remedios: 'Los Remedios', 'sevilla-este': 'Sevilla Este' };
  const ORIGEN = { web: 'Web', email: 'Email del pedido', ticket: 'Ticket', qr: 'QR en mesa' };
  const WEB = 'https://www.oralepadre.com';
  let LOCAL, rango = '30', lista = [], deliv = [], enlaces = {}, filtro = 'todas';
  const locales = () => LOCAL === '*' ? Object.keys(TODOS) : [LOCAL];
  const estrellas = n => '★'.repeat(n) + '<span class="apagada">' + '★'.repeat(5 - n) + '</span>';
  const enlaceOpinion = (l, origen) => `${WEB}/opinion/?local=${l}${origen ? '&o=' + origen : ''}`;

  function calcRango(r) {
    const d = new Date(); d.setHours(0, 0, 0, 0); const h = new Date(d); h.setDate(h.getDate() + 1);
    if (r === '7') d.setDate(d.getDate() - 6); if (r === '30') d.setDate(d.getDate() - 29); if (r === '90') d.setDate(d.getDate() - 89);
    if (r === 'todo') d.setFullYear(2025, 0, 1);
    return [d, h];
  }

  async function cargar() {
    document.querySelectorAll('[data-rsrango]').forEach(b => b.classList.toggle('b-ok', b.dataset.rsrango === rango));
    const [d, h] = calcRango(rango); const ult = new Date(h.getTime() - 86400000);
    try {
      [lista, deliv, enlaces] = await Promise.all([
        api.resenas(LOCAL === '*' ? null : LOCAL, d.toISOString(), h.toISOString()),
        api.deliveryEntre(iso(d), iso(ult)).catch(() => []),
        api.enlacesResenas().catch(() => ({})),
      ]);
      deliv = deliv.filter(r => locales().includes(r.local));
    } catch (ex) { $('#rs-kpis').innerHTML = `<p class="aviso">${esc(mensajeError(ex))}</p>`; return; }
    pinta();
  }

  function pinta() {
    const n = lista.length, media = n ? lista.reduce((s, r) => s + r.nota, 0) / n : 0;
    const buenas = lista.filter(r => r.nota >= 4).length, malas = lista.filter(r => r.nota <= 3);
    const pendientes = malas.filter(r => r.estado !== 'resuelta').length;
    const valor = (plat, tipo) => { const v = deliv.filter(r => r.plataforma === plat && r.valoracion != null && (r.valoracion_tipo || tipo) === tipo).map(r => +r.valoracion); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const uber = valor('uber', 'estrellas'), glovo = valor('glovo', 'porcentaje');
    const resDel = deliv.reduce((s, r) => s + (r.resenas || 0), 0);
    const k = (t, v, s, cl) => `<div class="kpi ${cl || ''}"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
    $('#rs-kpis').innerHTML =
      k('Nota media (propias)', n ? media.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' ★' : '—', `${n} opiniones`) +
      k('Contentos (4-5 ★)', n ? Math.round(buenas * 100 / n) + '%' : '—', `${buenas} de ${n}`) +
      k('Malas sin resolver', pendientes, pendientes ? 'llama o escribe al cliente' : 'ninguna pendiente', pendientes ? 'alerta' : '') +
      k('Uber Eats', uber == null ? '—' : uber.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' ★', 'media de lo que vuelca el agente') +
      k('Glovo', glovo == null ? '—' : Math.round(glovo) + '%', 'satisfacción media') +
      k('Reseñas en delivery', resDel || '—', 'nuevas en Uber y Glovo');

    // Reparto por estrellas
    $('#rs-reparto').innerHTML = [5, 4, 3, 2, 1].map(e => { const c = lista.filter(r => r.nota === e).length;
      return `<div class="rs-fila"><span>${e} ★</span><div class="barra-h"><span style="width:${n ? c * 100 / n : 0}%"></span></div><b>${c}</b></div>`; }).join('');

    // Por local
    $('#rs-locales').innerHTML = `<thead><tr><th>Local</th><th class="num">Opiniones</th><th class="num">Media</th><th class="num">Malas</th><th class="num">Uber</th><th class="num">Glovo</th></tr></thead><tbody>` +
      locales().map(l => { const rs = lista.filter(r => r.local === l); const m = rs.length ? rs.reduce((s, r) => s + r.nota, 0) / rs.length : null;
        const dl = (p, t) => { const v = deliv.filter(r => r.local === l && r.plataforma === p && r.valoracion != null && (r.valoracion_tipo || t) === t).map(r => +r.valoracion); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
        const u = dl('uber', 'estrellas'), g = dl('glovo', 'porcentaje');
        return `<tr><td><b>${TODOS[l]}</b></td><td class="num">${rs.length}</td><td class="num">${m == null ? '—' : m.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' ★'}</td>
          <td class="num">${rs.filter(r => r.nota <= 3).length}</td><td class="num">${u == null ? '—' : u.toFixed(2).replace('.', ',') + ' ★'}</td><td class="num">${g == null ? '—' : Math.round(g) + '%'}</td></tr>`; }).join('') + '</tbody>';

    pintaLista();
    pintaEnlaces();
  }

  function pintaLista() {
    const f = { todas: () => true, malas: r => r.nota <= 3, pendientes: r => r.nota <= 3 && r.estado !== 'resuelta', comentario: r => r.comentario }[filtro];
    const rs = lista.filter(f);
    document.querySelectorAll('[data-rsfiltro]').forEach(b => b.classList.toggle('b-ok', b.dataset.rsfiltro === filtro));
    $('#rs-lista').innerHTML = rs.length ? rs.map(r => {
      const c = r.contacto || ''; const esMail = c.includes('@');
      const contacto = c ? `<a href="${esMail ? 'mailto:' + encodeURIComponent(c) + '?subject=' + encodeURIComponent('Tu opinión sobre Órale Padre') : 'tel:' + c.replace(/[^\d+]/g, '')}">${esc(c)}</a>` : '<small>sin contacto</small>';
      return `<article class="rs-card ${r.nota <= 3 ? 'mala' : ''} ${r.estado === 'resuelta' ? 'resuelta' : ''}">
        <header><span class="rs-estrellas" aria-label="${r.nota} de 5">${estrellas(r.nota)}</span>
          <span class="tag">${esc(TODOS[r.local] || r.local)}</span><span class="tag gris">${ORIGEN[r.origen] || r.origen}${r.pedido_numero ? ' · pedido #' + r.pedido_numero : ''}</span>
          <small>${fecha(r.creada)}</small></header>
        ${r.comentario ? `<p class="rs-texto">“${esc(r.comentario)}”</p>` : '<p class="rs-texto nota">Sin comentario.</p>'}
        <footer><span><b>${esc(r.nombre || 'Anónimo')}</b> · ${contacto}</span>
          ${r.nota_interna ? `<span class="rs-interna">📝 ${esc(r.nota_interna)}${r.gestionada_email ? ' · ' + esc(r.gestionada_email.replace(/@.*/, '')) : ''}</span>` : ''}
          <span class="rs-acc">${r.estado === 'resuelta' ? '<span class="tag verde">Resuelta</span>' : `<button class="b b-mini" type="button" data-resolver="${r.id}">Marcar resuelta</button>`}
            <button class="b b-mini" type="button" data-nota="${r.id}">Nota interna</button></span></footer></article>`;
    }).join('') : '<p class="nota">No hay opiniones con este filtro.</p>';
  }

  function pintaEnlaces() {
    $('#rs-enlaces').innerHTML = locales().map(l => `<div class="rs-enlace">
      <b>${TODOS[l]}</b>
      <label class="campo">Enlace de Google para dejar reseña<input data-google="${l}" value="${esc(enlaces[l] || '')}" placeholder="https://g.page/r/…/review" inputmode="url" autocomplete="off"></label>
      <div class="botones"><button class="b b-mini" type="button" data-guardar-g="${l}">Guardar enlace</button>
        <button class="b b-mini" type="button" data-copiar="${enlaceOpinion(l, 'qr')}">Copiar enlace de opinión</button>
        <button class="b b-mini" type="button" data-cartel="${l}">Imprimir cartel con QR</button></div></div>`).join('');
  }

  async function cartel(l) {
    if (!window.qrcode) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    const q = window.qrcode(0, 'M'); q.addData(enlaceOpinion(l, 'qr')); q.make();
    const w = window.open('', '_blank'); if (!w) { alert('Permite las ventanas emergentes para imprimir el cartel.'); return; }
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cartel opiniones · ${TODOS[l]}</title>
      <style>body{font-family:Archivo,Arial,sans-serif;text-align:center;margin:0;padding:40px;color:#241a1c}
      h1{font-size:44px;margin:0 0 8px;color:#7C2430}p{font-size:22px;margin:0 0 24px}.qr svg{width:320px;height:320px}small{display:block;margin-top:18px;font-size:16px;color:#6b5b5e}
      @page{size:A5;margin:12mm}</style></head><body>
      <h1>¿Qué tal, padre?</h1><p>Cuéntanos cómo ha ido. Lo leemos todo.</p>
      <div class="qr">${q.createSvgTag({ cellSize: 8, margin: 0, scalable: true })}</div>
      <small>Escanea el código · Órale Padre ${esc(TODOS[l])}</small>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }

  function enganchar() {
    document.querySelectorAll('[data-rsrango]').forEach(b => b.onclick = () => { rango = b.dataset.rsrango; cargar(); });
    document.querySelectorAll('[data-rsfiltro]').forEach(b => b.onclick = () => { filtro = b.dataset.rsfiltro; pintaLista(); });
    $('#rs-lista').addEventListener('click', async e => {
      const res = e.target.closest('[data-resolver]'), nota = e.target.closest('[data-nota]');
      if (!res && !nota) return;
      const id = (res || nota).dataset.resolver || (res || nota).dataset.nota; const r = lista.find(x => x.id === id);
      const txt = prompt(res ? '¿Qué se ha hecho? (p. ej. "Llamado, le invitamos al próximo burrito")' : 'Nota interna', r.nota_interna || '');
      if (txt === null) return;
      try { await api.gestionarResena(id, res ? 'resuelta' : (r.estado === 'nueva' ? 'vista' : r.estado), txt); await cargar(); }
      catch (ex) { alert(mensajeError(ex)); }
    });
    $('#rs-enlaces').addEventListener('click', async e => {
      const g = e.target.closest('[data-guardar-g]'), c = e.target.closest('[data-copiar]'), q = e.target.closest('[data-cartel]');
      if (g) { const l = g.dataset.guardarG; const v = $(`[data-google="${l}"]`).value.trim();
        try { await api.guardarEnlaceResenas(l, v); enlaces[l] = v; g.textContent = '✓ Guardado'; setTimeout(() => { g.textContent = 'Guardar enlace'; }, 1800); }
        catch (ex) { alert(mensajeError(ex)); } }
      if (c) { try { await navigator.clipboard.writeText(c.dataset.copiar); c.textContent = '✓ Copiado'; } catch (ex) { prompt('Copia el enlace:', c.dataset.copiar); } }
      if (q) cartel(q.dataset.cartel).catch(() => alert('No se ha podido crear el QR. Revisa la conexión.'));
    });
  }

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.resenas = {
    todos: true,
    async init(local) { LOCAL = local; enganchar(); await cargar(); },
    async mostrar() { await cargar(); },
  };
})();
