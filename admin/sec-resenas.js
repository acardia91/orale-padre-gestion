/* ÓRALE PADRE · admin · Reseñas
   Dos pestañas:
   · Google: nota y reseñas públicas de Google Maps de cada local (las vuelca
     cada día un agente con OP.volcarGoogle) + nota de Uber y Glovo.
   · Valoraciones de pedidos (como Last App): el cliente valora SU pedido web
     o SU ticket de sala (QR del ticket, email, seguimiento del pedido o QR de
     mesa). Las malas se gestionan aquí. */
(function () {
  'use strict';
  const { api, euros, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  const fecha = d => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const dia = d => new Date(d).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric', year: 'numeric' });
  const TODOS = { tomares: 'Tomares', 'san-luis': 'San Luis', remedios: 'Los Remedios', 'sevilla-este': 'Sevilla Este' };
  const ORIGEN = { web: 'Seguimiento del pedido', email: 'Email del pedido', ticket: 'QR del ticket', qr: 'QR en mesa' };
  const WEB = 'https://www.oralepadre.com';
  let LOCAL, rango = '30', pestana = 'google', lista = [], deliv = [], enlaces = {}, fichas = {}, gres = [], filtro = 'todas', gfiltro = 'todas';
  const locales = () => LOCAL === '*' ? Object.keys(TODOS) : [LOCAL];
  const estrellas = n => '★'.repeat(n) + '<span class="apagada">' + '★'.repeat(5 - n) + '</span>';
  const media = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  const n1 = (v, d = 1) => v == null ? '—' : (+v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const enlaceOpinion = l => `${WEB}/opinion/?local=${l}&o=qr`;

  function calcRango(r) {
    const d = new Date(); d.setHours(0, 0, 0, 0); const h = new Date(d); h.setDate(h.getDate() + 1);
    if (r === '7') d.setDate(d.getDate() - 6); if (r === '30') d.setDate(d.getDate() - 29); if (r === '90') d.setDate(d.getDate() - 89);
    if (r === 'todo') d.setFullYear(2025, 0, 1);
    return [d, h];
  }

  async function cargar() {
    document.querySelectorAll('[data-rsrango]').forEach(b => b.classList.toggle('b-ok', b.dataset.rsrango === rango));
    document.querySelectorAll('[data-rspest]').forEach(b => { b.classList.toggle('activa', b.dataset.rspest === pestana); b.setAttribute('aria-selected', b.dataset.rspest === pestana); });
    document.querySelectorAll('[data-rsvista]').forEach(v => { v.hidden = v.dataset.rsvista !== pestana; });
    const [d, h] = calcRango(rango); const ult = new Date(h.getTime() - 86400000);
    try {
      [lista, deliv, enlaces, fichas, gres] = await Promise.all([
        api.resenas(LOCAL === '*' ? null : LOCAL, d.toISOString(), h.toISOString()),
        api.deliveryEntre(iso(d), iso(ult)).catch(() => []),
        api.enlacesResenas().catch(() => ({})),
        api.googleFichas().catch(() => ({})),
        api.googleResenas(LOCAL === '*' ? null : LOCAL).catch(() => []),
      ]);
      deliv = deliv.filter(r => locales().includes(r.local));
    } catch (ex) { $('#rs-kpis').innerHTML = `<p class="aviso">${esc(mensajeError(ex))}</p>`; return; }
    pintaGoogle(); pintaPedidos();
  }

  /* ══ GOOGLE ══ */
  function pintaGoogle() {
    const [d] = calcRango(rango);
    const plat = (l, p, t) => media(deliv.filter(r => r.local === l && r.plataforma === p && r.valoracion != null && (r.valoracion_tipo || t) === t).map(r => +r.valoracion));
    const fs = locales().map(l => fichas[l]).filter(Boolean);
    const totG = fs.reduce((s, f) => s + (f.total || 0), 0);
    const mediaG = totG ? fs.reduce((s, f) => s + (f.nota || 0) * (f.total || 0), 0) / totG : null;
    const nuevas = gres.filter(r => locales().includes(r.local) && r.fecha && r.fecha >= iso(d));
    const sinResp = gres.filter(r => locales().includes(r.local) && !r.respondida);
    const malasSin = sinResp.filter(r => r.nota <= 3);
    const ult = fs.map(f => f.actualizado).sort().pop();
    const k = (t, v, s, cl) => `<div class="kpi ${cl || ''}"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
    $('#gg-kpis').innerHTML =
      k('Google (media ponderada)', mediaG == null ? '—' : n1(mediaG) + ' ★', `${totG} reseñas en total`) +
      k('Reseñas nuevas', nuevas.length, 'en el periodo') +
      k('Sin responder', sinResp.length, malasSin.length ? `${malasSin.length} malas (1-3 ★): responde hoy` : 'ninguna mala pendiente', malasSin.length ? 'alerta' : '') +
      k('Uber Eats', n1(media(locales().map(l => plat(l, 'uber', 'estrellas')).filter(v => v != null)), 2) + (deliv.some(r => r.plataforma === 'uber' && r.valoracion != null) ? ' ★' : ''), 'media del periodo') +
      k('Glovo', (() => { const v = media(locales().map(l => plat(l, 'glovo', 'porcentaje')).filter(v => v != null)); return v == null ? '—' : Math.round(v) + '%'; })(), 'satisfacción media');
    $('#gg-actualizado').textContent = ult ? 'Google actualizado el ' + fecha(ult) : 'Aún no hay datos de Google: los carga el agente cada mañana.';

    $('#gg-locales').innerHTML = locales().map(l => {
      const f = fichas[l] || {}; const hist = f.historial || [];
      const antes = hist.length > 1 ? hist[Math.max(0, hist.length - 8)] : null;
      const dif = antes && f.total != null ? f.total - antes.total : null;
      const sr = gres.filter(r => r.local === l && !r.respondida).length;
      const u = plat(l, 'uber', 'estrellas'), g = plat(l, 'glovo', 'porcentaje');
      return `<article class="gg-card">
        <header><b>${TODOS[l]}</b>${f.url ? `<a class="b b-mini" href="${esc(f.url)}" target="_blank" rel="noopener">Abrir en Google</a>` : ''}</header>
        <div class="gg-nota"><b>${f.nota != null ? n1(f.nota) : '—'}</b><span class="rs-estrellas">${f.nota != null ? estrellas(Math.round(f.nota)) : ''}</span></div>
        <p>${f.total != null ? `${f.total} reseñas${dif ? ` · <span class="dl sube">+${dif} esta semana</span>` : ''}` : 'Sin datos aún'}</p>
        <p class="gg-plat"><span>Uber <b>${u == null ? '—' : n1(u, 2) + ' ★'}</b></span><span>Glovo <b>${g == null ? '—' : Math.round(g) + '%'}</b></span>
          <span>Sin responder <b class="${sr ? 'rojo' : ''}">${sr}</b></span></p></article>`;
    }).join('');

    const fl = { todas: () => true, sinresp: r => !r.respondida, malas: r => r.nota <= 3 }[gfiltro];
    document.querySelectorAll('[data-ggfiltro]').forEach(b => b.classList.toggle('b-ok', b.dataset.ggfiltro === gfiltro));
    const rs = gres.filter(r => locales().includes(r.local)).filter(fl);
    $('#gg-lista').innerHTML = rs.length ? rs.slice(0, 200).map(r => `<article class="rs-card ${r.nota <= 3 ? 'mala' : ''}">
        <header><span class="rs-estrellas" aria-label="${r.nota} de 5">${estrellas(r.nota || 0)}</span>
          <span class="tag">${esc(TODOS[r.local])}</span>${r.respondida ? '<span class="tag verde">Respondida</span>' : '<span class="tag rojo">Sin responder</span>'}
          <small>${esc(r.fecha_txt || (r.fecha ? dia(r.fecha) : ''))}</small></header>
        ${r.texto ? `<p class="rs-texto">“${esc(r.texto)}”</p>` : '<p class="rs-texto nota">Sólo estrellas, sin texto.</p>'}
        ${r.respuesta ? `<p class="rs-interna">↳ Respuesta: ${esc(r.respuesta)}</p>` : ''}
        <footer><span><b>${esc(r.autor || 'Anónimo')}</b></span>
          ${!r.respondida && (fichas[r.local] || {}).url ? `<span class="rs-acc"><a class="b b-mini" href="${esc(fichas[r.local].url)}" target="_blank" rel="noopener">Responder en Google</a></span>` : ''}</footer></article>`).join('')
      : '<p class="nota">No hay reseñas de Google con este filtro.</p>';
  }

  /* ══ VALORACIONES DE PEDIDOS ══ */
  function pintaPedidos() {
    const n = lista.length, m = media(lista.map(r => r.nota));
    const buenas = lista.filter(r => r.nota >= 4).length, malas = lista.filter(r => r.nota <= 3);
    const pendientes = malas.filter(r => r.estado !== 'resuelta').length;
    const conPedido = lista.filter(r => r.pedido_id || r.ticket_id).length;
    const k = (t, v, s, cl) => `<div class="kpi ${cl || ''}"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
    $('#rs-kpis').innerHTML =
      k('Nota media', m == null ? '—' : n1(m) + ' ★', `${n} valoraciones`) +
      k('Contentos (4-5 ★)', n ? Math.round(buenas * 100 / n) + '%' : '—', `${buenas} de ${n}`) +
      k('Malas sin resolver', pendientes, pendientes ? 'llama o escribe al cliente' : 'ninguna pendiente', pendientes ? 'alerta' : '') +
      k('De un pedido o ticket', conPedido, 'el resto, del QR de mesa');

    $('#rs-reparto').innerHTML = [5, 4, 3, 2, 1].map(e => { const c = lista.filter(r => r.nota === e).length;
      return `<div class="rs-fila"><span>${e} ★</span><div class="barra-h"><span style="width:${n ? c * 100 / n : 0}%"></span></div><b>${c}</b></div>`; }).join('');

    $('#rs-locales').innerHTML = `<thead><tr><th>Local</th><th class="num">Valoraciones</th><th class="num">Media</th><th class="num">Malas</th></tr></thead><tbody>` +
      locales().map(l => { const rs = lista.filter(r => r.local === l); const ml = media(rs.map(r => r.nota));
        return `<tr><td><b>${TODOS[l]}</b></td><td class="num">${rs.length}</td><td class="num">${ml == null ? '—' : n1(ml) + ' ★'}</td><td class="num">${rs.filter(r => r.nota <= 3).length}</td></tr>`; }).join('') + '</tbody>';
    pintaLista(); pintaEnlaces();
  }

  function pintaLista() {
    const f = { todas: () => true, malas: r => r.nota <= 3, pendientes: r => r.nota <= 3 && r.estado !== 'resuelta', comentario: r => r.comentario }[filtro];
    const rs = lista.filter(f);
    document.querySelectorAll('[data-rsfiltro]').forEach(b => b.classList.toggle('b-ok', b.dataset.rsfiltro === filtro));
    $('#rs-lista').innerHTML = rs.length ? rs.map(r => {
      const c = r.contacto || ''; const esMail = c.includes('@'); const t = r.ticket;
      const contacto = c ? `<a href="${esMail ? 'mailto:' + encodeURIComponent(c) + '?subject=' + encodeURIComponent('Tu opinión sobre Órale Padre') : 'tel:' + c.replace(/[^\d+]/g, '')}">${esc(c)}</a>` : '<small>sin contacto</small>';
      // Como Last App: "Local - fecha de la visita - ticket - importe"
      const ref = [`Órale Padre ${TODOS[r.local] || r.local}`, t ? dia(t.fecha) : null,
        t ? `${t.serie}-${String(t.numero).padStart(6, '0')}` : r.pedido_numero ? `Pedido web #${r.pedido_numero}` : null,
        r.importe != null ? euros(r.importe) : t ? euros(t.total) : null].filter(Boolean).join(' · ');
      return `<article class="rs-card ${r.nota <= 3 ? 'mala' : ''} ${r.estado === 'resuelta' ? 'resuelta' : ''}">
        <header><b class="rs-nombre">${esc(r.nombre || 'Anónimo')}</b><small>${fecha(r.creada)}</small></header>
        <p class="rs-ref">${esc(ref)} <span class="tag gris">${ORIGEN[r.origen] || r.origen}</span></p>
        <p><span class="rs-estrellas" aria-label="${r.nota} de 5">${estrellas(r.nota)}</span> <b>${n1(r.nota)}</b></p>
        ${r.comentario ? `<p class="rs-texto">“${esc(r.comentario)}”</p>` : ''}
        <footer><span>${contacto}</span>
          ${r.nota_interna ? `<span class="rs-interna">📝 ${esc(r.nota_interna)}${r.gestionada_email ? ' · ' + esc(r.gestionada_email.replace(/@.*/, '')) : ''}</span>` : ''}
          <span class="rs-acc">${t ? `<button class="b b-mini" type="button" data-cuenta="${r.id}">Ver cuenta</button>` : ''}
            ${r.estado === 'resuelta' ? '<span class="tag verde">Resuelta</span>' : r.nota <= 3 ? `<button class="b b-mini" type="button" data-resolver="${r.id}">Marcar resuelta</button>` : ''}
            <button class="b b-mini" type="button" data-nota="${r.id}">Nota interna</button></span></footer></article>`;
    }).join('') : '<p class="nota">No hay valoraciones con este filtro.</p>';
  }

  function pintaEnlaces() {
    $('#rs-enlaces').innerHTML = locales().map(l => `<div class="rs-enlace">
      <b>${TODOS[l]}</b>
      <label class="campo">Enlace de Google para dejar reseña<input data-google="${l}" value="${esc(enlaces[l] || '')}" placeholder="https://g.page/r/…/review" inputmode="url" autocomplete="off"></label>
      <div class="botones"><button class="b b-mini" type="button" data-guardar-g="${l}">Guardar enlace</button>
        <button class="b b-mini" type="button" data-copiar="${enlaceOpinion(l)}">Copiar enlace de valorar</button>
        <button class="b b-mini" type="button" data-cartel="${l}">Imprimir cartel con QR</button></div></div>`).join('');
  }

  async function cargaQR() {
    if (window.qrcode) return;
    await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  async function cartel(l) {
    await cargaQR();
    const q = window.qrcode(0, 'M'); q.addData(enlaceOpinion(l)); q.make();
    const w = window.open('', '_blank'); if (!w) { alert('Permite las ventanas emergentes para imprimir el cartel.'); return; }
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cartel valoraciones · ${TODOS[l]}</title>
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
    document.querySelectorAll('[data-rspest]').forEach(b => b.onclick = () => { pestana = b.dataset.rspest; cargar(); });
    document.querySelectorAll('[data-rsfiltro]').forEach(b => b.onclick = () => { filtro = b.dataset.rsfiltro; pintaLista(); });
    document.querySelectorAll('[data-ggfiltro]').forEach(b => b.onclick = () => { gfiltro = b.dataset.ggfiltro; pintaGoogle(); });
    $('#rs-lista').addEventListener('click', async e => {
      const cu = e.target.closest('[data-cuenta]');
      if (cu) { const r = lista.find(x => x.id === cu.dataset.cuenta); if (r && r.ticket) { await cargaQR().catch(() => {}); OP.imprimir(OP.ticketFactura(r.ticket)); } return; }
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

  // Para el agente diario: OP.volcarGoogle({fichas:[{local,nota,total,url}], resenas:[{id,local,autor,nota,texto,fecha,fecha_txt,respondida,respuesta}]})
  window.OP.volcarGoogle = async datos => { const r = await api.guardarGoogle(datos.fichas || [], datos.resenas || []); if (LOCAL) await cargar(); return r; };

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.resenas = {
    todos: true,
    async init(local) { LOCAL = local; enganchar(); await cargar(); },
    async mostrar() { await cargar(); },
  };
})();
