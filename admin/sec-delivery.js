/* ÓRALE PADRE · admin · Delivery (Uber Eats y Glovo)
   Cifras diarias por local y plataforma que vuelca cada día el agente (o
   una persona), con su resumen escrito por local y general.
   Formato del volcado (lo que pega el agente en "Volcar datos"):
   {
     "filas": [{ "local": "san-luis", "fecha": "2026-11-24", "plataforma": "uber",
                 "pedidos": 31, "ventas_eur": 512.40, "comision_eur": 112.7, "anuncios_eur": 20,
                 "promociones_eur": 15.5, "neto_eur": 364.2, "cancelados": 1, "errores": 2,
                 "valoracion": 4.6, "valoracion_tipo": "estrellas", "resenas": 3,
                 "tiempo_prep": 14, "minutos_cerrado": 0, "detalle": { … } }],
     "resumenes": [{ "fecha": "2026-11-24", "local": "general", "texto": "…",
                     "alertas": [{ "nivel": "alta", "texto": "…" }] }]
   }
   Locales: san-luis · remedios · sevilla-este · tomares. Plataforma: uber · glovo. */
(function () {
  'use strict';
  const { api, euros, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  const LOCS = { 'san-luis': 'San Luis', remedios: 'Los Remedios', 'sevilla-este': 'Sevilla Este', tomares: 'Tomares' };
  const PLAT = { uber: ['Uber Eats', '#06C167'], glovo: ['Glovo', '#FFC244'] };
  let rango = '7', filtroLocal = '', filas = [], resumenes = [], previas = [], LOCALES = [];
  /* ── Rentabilidad real: ajustes y coste de cada producto (escandallo) por nombre ── */
  const AJ_DEF = { uber: { comision_pct: 30, envase_eur: 0.5 }, glovo: { comision_pct: 30, envase_eur: 0.5 }, web: { envase_eur: 0.5 }, tarjeta_pct: 0, coste_pct_sin_detalle: 30, margen_objetivo_pct: 25 };
  const mezclaAj = a => ({ ...AJ_DEF, ...(a || {}), uber: { ...AJ_DEF.uber, ...((a || {}).uber || {}) }, glovo: { ...AJ_DEF.glovo, ...((a || {}).glovo || {}) }, web: { ...AJ_DEF.web, ...((a || {}).web || {}) } });
  let AJ = AJ_DEF, costePorNombre = null;
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  async function cargaCostes() {
    if (costePorNombre) return;
    costePorNombre = new Map();
    const ids = LOCALES.length ? LOCALES.map(l => l.id) : ['tomares'];
    await Promise.all(ids.map(async id => {
      try {
        const [carta, cs] = await Promise.all([api.carta(id), api.costes(id)]);
        (carta.productos || []).forEach(p => { const c = cs[p.id]; if (c && c.coste != null && !costePorNombre.has(norm(p.nombre))) costePorNombre.set(norm(p.nombre), c.coste); });
      } catch (e) {}
    }));
  }
  const costeDe = nombre => { const k = norm(nombre); if (costePorNombre.has(k)) return costePorNombre.get(k);
    for (const [n, c] of costePorNombre) if (n.length > 5 && (k.includes(n) || n.includes(k))) return c; return null; };
  const dia = f => new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const val = r => r.valoracion == null ? '—' : r.valoracion_tipo === 'porcentaje' ? Math.round(r.valoracion) + ' %' : String(r.valoracion).replace('.', ',') + ' ★';

  function calcRango(r) {
    const h = new Date(); h.setDate(h.getDate() - 1);          // el agente vuelca el día anterior
    const d = new Date(h);
    if (r === '7') d.setDate(d.getDate() - 6);
    if (r === '30') d.setDate(d.getDate() - 29);
    if (r === 'mes') { d.setTime(new Date().getTime()); d.setDate(1); h.setTime(new Date().getTime()); }
    return [iso(d), iso(h)];
  }
  async function cargar() {
    document.querySelectorAll('[data-drng]').forEach(b => b.classList.toggle('b-ok', b.dataset.drng === rango));
    document.querySelectorAll('[data-dloc]').forEach(b => b.classList.toggle('b-ok', b.dataset.dloc === filtroLocal));
    const [d, h] = calcRango(rango);
    // Periodo anterior de la misma duración (para comparar).
    const dias = Math.round((new Date(h) - new Date(d)) / 86400000) + 1;
    const pd = new Date(d + 'T12:00'); pd.setDate(pd.getDate() - dias); const ph = new Date(d + 'T12:00'); ph.setDate(ph.getDate() - 1);
    try { [filas, resumenes, previas] = await Promise.all([api.deliveryEntre(d, h), api.resumenesDelivery(d, h), api.deliveryEntre(iso(pd), iso(ph)).catch(() => []),
      api.ajustesDelivery ? api.ajustesDelivery().then(a => { AJ = mezclaAj(a); }).catch(() => {}) : null, cargaCostes()]); }
    catch (ex) { $('#dl-kpis').innerHTML = `<p class="aviso">${esc(mensajeError(ex))}</p>`; return; }
    pinta(d, h);
  }
  function pinta(d, h) {
    const fs = filas.filter(r => !filtroLocal || r.local === filtroLocal);
    try { analisis(fs, previas.filter(r => !filtroLocal || r.local === filtroLocal)); } catch (e) { console.warn(e); }
    try { rentabilidad(fs); } catch (e) { console.warn(e); }
    const s = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
    const ventas = s(fs, 'ventas'), pedidos = s(fs, 'pedidos'), neto = s(fs, 'neto'), comision = s(fs, 'comision'), anuncios = s(fs, 'anuncios'), promos = s(fs, 'promociones');
    const conVal = fs.filter(r => r.valoracion != null && r.valoracion_tipo !== 'porcentaje');
    const k = (cls, t, v, sub) => `<div class="pk ${cls}"><small>${t}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    $('#dl-kpis').innerHTML =
      k('pk-hero', 'Ventas delivery', euros(ventas), `${pedidos} pedidos · ticket medio ${pedidos ? euros(Math.round(ventas / pedidos)) : '—'}`) +
      k('', 'Lo que cobráis (neto)', neto ? euros(neto) : '—', ventas && neto ? `${Math.round(neto * 100 / ventas)} % de las ventas` : '') +
      k('', 'Comisión + anuncios + promos', euros(comision + anuncios + promos), ventas ? `${Math.round((comision + anuncios + promos) * 100 / ventas)} % de las ventas` : '') +
      k('', 'Cancelados / errores', `${s(fs, 'cancelados')} / ${s(fs, 'errores')}`, pedidos ? `${(((s(fs, 'cancelados') + s(fs, 'errores')) * 100) / pedidos).toFixed(1).replace('.', ',')} % de los pedidos` : '') +
      k('', 'Valoración media', conVal.length ? (conVal.reduce((a, r) => a + +r.valoracion, 0) / conVal.length).toFixed(2).replace('.', ',') + ' ★' : '—', 'Uber (estrellas)');

    // Por local y plataforma
    const grupos = {};
    fs.forEach(r => { const g = grupos[r.local + '|' + r.plataforma] = grupos[r.local + '|' + r.plataforma] || { local: r.local, plataforma: r.plataforma, pedidos: 0, ventas: 0, neto: 0, coste: 0, cancel: 0, err: 0, vals: [] };
      g.pedidos += r.pedidos; g.ventas += r.ventas; g.neto += r.neto || 0; g.coste += (r.comision || 0) + (r.anuncios || 0) + (r.promociones || 0);
      g.cancel += r.cancelados || 0; g.err += r.errores || 0; if (r.valoracion != null) g.vals.push(r); });
    const gs = Object.values(grupos).sort((a, b) => b.ventas - a.ventas); const maxV = Math.max(1, ...gs.map(g => g.ventas));
    $('#dl-locales').innerHTML = gs.length ? `<thead><tr><th>Local</th><th>Plataforma</th><th class="num">Pedidos</th><th class="num">Ventas</th><th class="num">Neto</th><th class="num">Comisión y gastos</th><th class="num">Cancel. / errores</th><th class="num">Valoración</th><th style="width:18%"></th></tr></thead><tbody>` +
      gs.map(g => `<tr><td><b>${LOCS[g.local] || esc(g.local)}</b></td><td><span class="plat" style="--c:${PLAT[g.plataforma][1]}">${PLAT[g.plataforma][0]}</span></td>
        <td class="num">${g.pedidos}</td><td class="num"><b>${euros(g.ventas)}</b></td><td class="num">${g.neto ? euros(g.neto) : '—'}</td>
        <td class="num">${g.coste ? euros(g.coste) + ` <small>(${Math.round(g.coste * 100 / Math.max(1, g.ventas))} %)</small>` : '—'}</td>
        <td class="num">${g.cancel} / ${g.err}</td><td class="num">${g.vals.length ? val(g.vals[g.vals.length - 1]) : '—'}</td>
        <td><div class="mini-barra"><i style="width:${g.ventas * 100 / maxV}%;background:${PLAT[g.plataforma][1]}"></i></div></td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Todavía no hay datos de delivery en este periodo. Los vuelca el agente cada día, o puedes hacerlo con "Volcar datos".</td></tr></tbody>';

    // Días
    $('#dl-dias').innerHTML = fs.length ? `<thead><tr><th>Día</th><th>Local</th><th>Plataforma</th><th class="num">Pedidos</th><th class="num">Ventas</th><th class="num">Neto</th><th class="num">Valoración</th><th class="num">Prep.</th><th class="num">Cerrado</th></tr></thead><tbody>` +
      fs.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || a.local.localeCompare(b.local)).map(r => `<tr><td>${dia(r.fecha)}</td><td>${LOCS[r.local] || esc(r.local)}</td>
        <td><span class="plat" style="--c:${PLAT[r.plataforma][1]}">${PLAT[r.plataforma][0]}</span></td><td class="num">${r.pedidos}</td><td class="num">${euros(r.ventas)}</td>
        <td class="num">${r.neto != null ? euros(r.neto) : '—'}</td><td class="num">${val(r)}</td><td class="num">${r.tiempo_prep != null ? r.tiempo_prep + ' min' : '—'}</td>
        <td class="num">${r.minutos_cerrado ? `<span class="tag rojo">${r.minutos_cerrado} min</span>` : '—'}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin días cargados.</td></tr></tbody>';

    // Resúmenes del agente
    const rs = resumenes.filter(r => !filtroLocal || r.local === filtroLocal || r.local === 'general');
    $('#dl-resumenes').innerHTML = rs.length ? rs.map(r => `<div class="ag"><b>${dia(r.fecha)} · ${r.local === 'general' ? 'General' : LOCS[r.local] || esc(r.local)}</b><p>${esc(r.texto)}</p>
      ${(r.alertas || []).map(a => `<span class="tag ${a.nivel === 'alta' ? 'rojo' : a.nivel === 'media' ? '' : 'gris'}">${esc(a.texto)}</span>`).join('')}</div>`).join('')
      : '<p class="nota">Aquí aparece cada día el resumen del agente: qué ha ido bien, qué ha ido mal y qué revisar, por local y en general.</p>';
  }
  /* ══ Rentabilidad real ══
     Ventas sin IVA (comida 10 %) − comisión − anuncios/promos − coste de producto − envases.
     Coste de producto: lo que trae el agente por producto × escandallo; lo que no se puede cuadrar, con el % de ajustes. */
  const itemsDe = r => { const t = r.detalle && (r.detalle.productos || r.detalle.top); return Array.isArray(t) ? t.filter(x => x && typeof x === 'object') : []; };
  const udsDe = x => +(x.uds || x.unidades || x.cantidad || 0);
  const ventasDe = x => { const v = x.ventas_eur ?? x.importe_eur ?? x.ventas; return v == null ? null : Math.round(+v * 100); };
  function rentabilidad(fs) {
    const pct = AJ.coste_pct_sin_detalle / 100, obj = AJ.margen_objetivo_pct / 100;
    const res = {}; let estimadaCom = false, cubierto = 0, total = 0;
    const prods = new Map();
    fs.forEach(r => {
      const p = res[r.plataforma] = res[r.plataforma] || { pedidos: 0, ventas: 0, com: 0, mkt: 0, coste: 0, env: 0, est: 0 };
      const aj = AJ[r.plataforma] || AJ_DEF.uber;
      p.pedidos += r.pedidos; p.ventas += r.ventas; p.mkt += (r.anuncios || 0) + (r.promociones || 0);
      if (r.comision != null) p.com += r.comision; else { p.com += Math.round(r.ventas * aj.comision_pct / 100); p.est = 1; estimadaCom = true; }
      p.env += Math.round(r.pedidos * aj.envase_eur * 100);
      let conocido = 0, cubiertas = 0;
      itemsDe(r).forEach(x => {
        const nombre = x.nombre || x.producto; if (!nombre) return;
        const u = udsDe(x), v = ventasDe(x), c = costeDe(nombre);
        const k = norm(nombre); const o = prods.get(k) || { nombre, uds: 0, ventas: 0, conVentas: 0, coste: c, plats: {} };
        o.uds += u; if (v != null) { o.ventas += v; o.conVentas += u; } o.plats[r.plataforma] = (o.plats[r.plataforma] || 0) + u; prods.set(k, o);
        if (c != null && v != null && u) { conocido += c * u; cubiertas += v; }
      });
      const resto = Math.max(0, r.ventas - cubiertas);
      p.coste += conocido + Math.round(resto / 1.1 * pct);
      cubierto += Math.min(cubiertas, r.ventas); total += r.ventas;
    });
    const fila = (t, v, sub, cls) => `<div class="${cls || ''}"><small>${t}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    const tarjeta = (titulo, color, p) => {
      const base = Math.round(p.ventas / 1.1); const queda = base - p.com - p.mkt - p.coste - p.env;
      const pq = base ? Math.round(queda * 1000 / base) / 10 : 0;
      return `<article class="dl-rcard" style="--c:${color}"><header>${titulo}</header><div class="dl-pgrid">
        ${fila('Ventas sin IVA', euros(base), `${p.pedidos} pedidos · ${euros(p.ventas)} con IVA`)}
        ${fila('Comisión', '−' + euros(p.com), base ? Math.round(p.com * 100 / base) + ' %' + (p.est ? ' (estimada con ajustes)' : '') : '')}
        ${fila('Anuncios y promos', '−' + euros(p.mkt), base ? Math.round(p.mkt * 100 / base) + ' %' : '')}
        ${fila('Producto (escandallo)', '−' + euros(p.coste), base ? Math.round(p.coste * 100 / base) + ' %' : '')}
        ${fila('Envases', '−' + euros(p.env), p.pedidos ? euros(Math.round(p.env / p.pedidos)) + ' por pedido' : '')}
        ${fila('Os queda', euros(queda), `${String(pq).replace('.', ',')} % · ${p.pedidos ? euros(Math.round(queda / p.pedidos)) + ' por pedido' : ''}`, 'dl-queda ' + (pq < AJ.margen_objetivo_pct ? 'bajo' : 'ok'))}
        </div>${p.pedidos && base ? `<p class="nota" style="margin:8px 0 0">Si esos pedidos fuesen por vuestra web (sin comisión ni anuncios) os quedarían unos <b>${euros(Math.round((p.com + p.mkt) / p.pedidos))} más por pedido</b>.</p>` : ''}</article>`;
    };
    const plats = Object.keys(res);
    if (!plats.length) { $('#dl-rent').innerHTML = '<p class="nota">Sin datos de delivery en este periodo.</p>'; $('#dl-rprod').innerHTML = ''; $('#dl-rnota').textContent = ''; return; }
    const tot = plats.reduce((a, k) => { Object.keys(res[k]).forEach(c => { a[c] = (a[c] || 0) + res[k][c]; }); return a; }, {});
    $('#dl-rent').innerHTML = plats.map(k => tarjeta(PLAT[k][0], PLAT[k][1], res[k])).join('') + (plats.length > 1 ? tarjeta('Total delivery', 'var(--burdeos)', tot) : '');

    // Por producto: precio medio, lo que se lleva la plataforma, coste y lo que queda por unidad.
    const comPct = k => { const p = res[k]; return p && p.ventas ? p.com / p.ventas : (AJ[k] || AJ_DEF.uber).comision_pct / 100; };
    const udsPorPedido = Math.max(1, [...prods.values()].reduce((a, o) => a + o.uds, 0) / Math.max(1, tot.pedidos));
    const envUd = tot.pedidos ? tot.env / tot.pedidos / udsPorPedido : 0;
    const lista = [...prods.values()].filter(o => o.conVentas).map(o => {
      const precio = o.ventas / o.conVentas; const udsT = Object.values(o.plats).reduce((a, b) => a + b, 0) || 1;
      const c = Object.entries(o.plats).reduce((a, [k, u]) => a + comPct(k) * u, 0) / udsT;
      const base = precio / 1.1; const coste = o.coste;
      const queda = coste == null ? null : base - precio * c - coste - envUd;
      const minimo = coste == null ? null : (coste + envUd) / ((1 - obj) / 1.1 - c);
      return { ...o, precio, c, queda, pq: queda == null ? null : queda * 100 / base, minimo };
    }).sort((a, b) => (a.pq ?? 999) - (b.pq ?? 999));
    $('#dl-rprod').innerHTML = lista.length ? `<thead><tr><th>Producto</th><th class="num">Uds.</th><th class="num">Precio medio</th><th class="num">Plataforma</th><th class="num">Coste</th><th class="num">Os queda / ud.</th><th class="num">Precio para tu margen</th></tr></thead><tbody>` +
      lista.map(o => `<tr><td><b>${esc(o.nombre)}</b></td><td class="num">${o.uds}</td><td class="num">${euros(Math.round(o.precio))}</td>
        <td class="num">−${euros(Math.round(o.precio * o.c))} <small>(${Math.round(o.c * 100)} %)</small></td>
        <td class="num">${o.coste == null ? '<span class="tag gris">sin escandallo</span>' : euros(o.coste)}</td>
        <td class="num">${o.queda == null ? '—' : `<span class="tag ${o.pq < AJ.margen_objetivo_pct ? (o.pq < 10 ? 'rojo' : '') : 'verde'}">${euros(Math.round(o.queda))} · ${Math.round(o.pq)} %</span>`}</td>
        <td class="num">${o.minimo == null || o.minimo <= 0 ? '—' : o.minimo > o.precio ? `<b>${euros(Math.ceil(o.minimo / 10) * 10)}</b>` : '<small>ya llega</small>'}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">El agente aún no trae las ventas por producto (unidades y euros). Cuando las traiga, aquí sale qué platos os dejan dinero y cuáles no.</td></tr></tbody>';
    $('#dl-rnota').innerHTML = total ? `Coste de producto calculado con escandallo para el <b>${Math.round(cubierto * 100 / total)} %</b> de las ventas; el resto, con el ${AJ.coste_pct_sin_detalle} % de ajustes.${estimadaCom ? ' Algún día sin comisión del agente: se estima con el % de ajustes.' : ''} Margen objetivo: ${AJ.margen_objetivo_pct} %.` : '';
  }
  // Ajustes (sólo encargados; se guardan para todos)
  const dja = $('#dlg-dajustes');
  let trasGuardar = null;
  async function abrirAjustes(cb) {
    trasGuardar = cb || null;
    try { AJ = mezclaAj(await api.ajustesDelivery()); } catch (e) {}   // siempre lo último guardado (también desde Informes)
    $('#da-web-env').value = AJ.web.envase_eur; $('#da-tarjeta').value = AJ.tarjeta_pct;
    $('#da-uber-com').value = AJ.uber.comision_pct; $('#da-glovo-com').value = AJ.glovo.comision_pct;
    $('#da-uber-env').value = AJ.uber.envase_eur; $('#da-glovo-env').value = AJ.glovo.envase_eur;
    $('#da-coste').value = AJ.coste_pct_sin_detalle; $('#da-obj').value = AJ.margen_objetivo_pct; $('#da-error').hidden = true; dja.showModal();
  }
  $('#dl-ajustes').onclick = () => abrirAjustes(() => pinta());
  $('#da-ok').onclick = async () => {
    const n = id => { const v = parseFloat(String($(id).value).replace(',', '.')); return isNaN(v) ? null : v; };
    const d = { uber: { comision_pct: n('#da-uber-com'), envase_eur: n('#da-uber-env') }, glovo: { comision_pct: n('#da-glovo-com'), envase_eur: n('#da-glovo-env') },
      web: { envase_eur: n('#da-web-env') }, tarjeta_pct: n('#da-tarjeta'),
      coste_pct_sin_detalle: n('#da-coste'), margen_objetivo_pct: n('#da-obj') };
    if ([d.uber.comision_pct, d.uber.envase_eur, d.glovo.comision_pct, d.glovo.envase_eur, d.web.envase_eur, d.tarjeta_pct, d.coste_pct_sin_detalle, d.margen_objetivo_pct].some(v => v == null || v < 0)) {
      $('#da-error').textContent = 'Rellena todos los campos con números.'; $('#da-error').hidden = false; return; }
    try { await api.guardarAjustesDelivery(d); AJ = mezclaAj(d); dja.close(); if (trasGuardar) trasGuardar(); }
    catch (ex) { $('#da-error').textContent = mensajeError(ex); $('#da-error').hidden = false; }
  };

  /* ══ Análisis ══ */
  function analisis(fs, ant) {
    const s = (arr, k) => arr.reduce((a, r) => a + (+r[k] || 0), 0);
    const pc = (a, b) => b ? Math.round(a * 1000 / b) / 10 : null;
    const dlt = (a, b) => { if (!b) return ''; const v = Math.round((a - b) * 1000 / b) / 10; return `<span class="dl ${v >= 0 ? 'sube' : 'baja'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toLocaleString('es-ES')}%</span>`; };
    const num = v => v == null ? '—' : v.toLocaleString('es-ES') + '%';
    const porPlat = p => fs.filter(r => r.plataforma === p), antPlat = p => ant.filter(r => r.plataforma === p);

    // Uber vs Glovo
    $('#dl-plats').innerHTML = Object.keys(PLAT).map(p => {
      const a = porPlat(p), b = antPlat(p); const v = s(a, 'ventas'), n = s(a, 'pedidos'), neto = s(a, 'neto'), com = s(a, 'comision'), ads = s(a, 'anuncios'), pro = s(a, 'promociones');
      const vals = a.filter(r => r.valoracion != null).map(r => +r.valoracion); const vm = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
      const fila = (t, x, sub) => `<div><small>${t}</small><b>${x}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
      return `<article class="dl-plat" style="--c:${PLAT[p][1]}"><header><span class="plat" style="--c:${PLAT[p][1]}">${PLAT[p][0]}</span></header>
        <div class="dl-pgrid">${fila('Ventas', euros(v), dlt(v, s(b, 'ventas')) + ' vs antes')}${fila('Pedidos', n, dlt(n, s(b, 'pedidos')))}
        ${fila('Ticket medio', n ? euros(Math.round(v / n)) : '—')}${fila('Os queda (neto)', neto ? euros(neto) : '—', neto ? num(pc(neto, v)) + ' de las ventas' : 'el agente no lo trae')}
        ${fila('Comisión', com ? euros(com) : '—', com ? num(pc(com, v)) : '')}${fila('Anuncios + promos', ads + pro ? euros(ads + pro) : '—', ads + pro ? num(pc(ads + pro, v)) + ' de las ventas' : '')}
        ${fila('Cancelados / errores', `${s(a, 'cancelados')} / ${s(a, 'errores')}`, n ? num(pc(s(a, 'cancelados') + s(a, 'errores'), n)) : '')}
        ${fila('Valoración', vm == null ? '—' : p === 'glovo' ? Math.round(vm) + '%' : vm.toFixed(2).replace('.', ',') + ' ★')}</div></article>`;
    }).join('');

    // Ventas por día (barras apiladas Uber + Glovo)
    const dias = [...new Set(fs.map(r => r.fecha))].sort();
    const porDia = dias.map(f => ({ f, u: s(fs.filter(r => r.fecha === f && r.plataforma === 'uber'), 'ventas'), g: s(fs.filter(r => r.fecha === f && r.plataforma === 'glovo'), 'ventas') }));
    const max = Math.max(1, ...porDia.map(x => x.u + x.g));
    $('#dl-graf').innerHTML = porDia.length ? `<div class="dl-barras">${porDia.map(x => `<div class="dl-b" title="${dia(x.f)} · Uber ${euros(x.u)} · Glovo ${euros(x.g)}">
        <b>${Math.round((x.u + x.g) / 100)}€</b><span class="g" style="height:${x.g * 100 / max}%"></span><span class="u" style="height:${x.u * 100 / max}%"></span><small>${dia(x.f).split(' ').slice(0, 2).join(' ')}</small></div>`).join('')}</div>
        <p class="ley-mini"><i style="background:${PLAT.uber[1]}"></i> Uber Eats <i style="background:${PLAT.glovo[1]}"></i> Glovo</p>` : '<p class="nota">Sin datos.</p>';

    // Día de la semana (media)
    const DS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']; const sem = DS.map(() => ({ v: 0, d: new Set() }));
    fs.forEach(r => { const i = (new Date(r.fecha + 'T12:00').getDay() + 6) % 7; sem[i].v += r.ventas; sem[i].d.add(r.fecha); });
    const med = sem.map(x => x.d.size ? x.v / x.d.size : 0); const mm = Math.max(1, ...med); const mejor = med.indexOf(Math.max(...med));
    $('#dl-semana').innerHTML = `<div class="dl-sem">${DS.map((d, i) => `<div class="${i === mejor && med[i] ? 'top' : ''}"><span>${d}</span><div class="barra-h"><span style="width:${med[i] * 100 / mm}%"></span></div><b>${med[i] ? euros(Math.round(med[i])) : '—'}</b></div>`).join('')}</div><p class="nota">Venta media de ese día de la semana en el periodo.</p>`;

    // Marketing
    const gr = {}; fs.forEach(r => { const k = r.local + '|' + r.plataforma; const g = gr[k] = gr[k] || { local: r.local, p: r.plataforma, v: 0, ads: 0, pro: 0, n: 0 }; g.v += r.ventas; g.ads += r.anuncios || 0; g.pro += r.promociones || 0; g.n += r.pedidos; });
    const gm = Object.values(gr).filter(g => g.ads || g.pro).sort((a, b) => (b.ads + b.pro) - (a.ads + a.pro));
    $('#dl-mkt').innerHTML = gm.length ? `<thead><tr><th>Local</th><th>Plataforma</th><th class="num">Anuncios</th><th class="num">Promos</th><th class="num">% ventas</th><th class="num">ROAS</th><th class="num">€ por pedido</th></tr></thead><tbody>` +
      gm.map(g => { const roas = g.ads ? g.v / g.ads : null; return `<tr><td><b>${LOCS[g.local] || esc(g.local)}</b></td><td><span class="plat" style="--c:${PLAT[g.p][1]}">${PLAT[g.p][0]}</span></td>
        <td class="num">${g.ads ? euros(g.ads) : '—'}</td><td class="num">${g.pro ? euros(g.pro) : '—'}</td><td class="num">${num(pc(g.ads + g.pro, g.v))}</td>
        <td class="num">${roas == null ? '—' : `<span class="tag ${roas >= 8 ? 'verde' : roas < 4 ? 'rojo' : ''}">${roas.toFixed(1).replace('.', ',')}</span>`}</td><td class="num">${g.n ? euros(Math.round((g.ads + g.pro) / g.n)) : '—'}</td></tr>`; }).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">El agente aún no ha traído gasto en anuncios ni promociones en este periodo.</td></tr></tbody>';

    // Productos (del detalle que trae el agente)
    const top = new Map();
    fs.forEach(r => { const t = (r.detalle && (r.detalle.top || r.detalle.productos)) || []; (Array.isArray(t) ? t : []).forEach((x, i) => {
      const nombre = typeof x === 'string' ? x : x.nombre || x.producto; if (!nombre) return; const k = nombre.toLowerCase().trim();
      const o = top.get(k) || { nombre, veces: 0, uds: 0, plats: new Set() }; o.veces++; o.uds += +(x.uds || x.unidades || x.cantidad || 0); o.plats.add(r.plataforma); top.set(k, o); }); });
    const tl = [...top.values()].sort((a, b) => (b.uds - a.uds) || (b.veces - a.veces)).slice(0, 12);
    $('#dl-top').innerHTML = tl.length ? `<thead><tr><th>Producto</th><th class="num">Unidades</th><th class="num">Días en el top</th><th>Dónde</th></tr></thead><tbody>` +
      tl.map(x => `<tr><td><b>${esc(x.nombre)}</b></td><td class="num">${x.uds || '—'}</td><td class="num">${x.veces}</td><td>${[...x.plats].map(p => `<span class="plat" style="--c:${PLAT[p][1]}">${PLAT[p][0]}</span>`).join(' ')}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">El agente aún no ha traído los productos más pedidos.</td></tr></tbody>';

    // Operación por local
    const ol = {}; fs.forEach(r => { const o = ol[r.local] = ol[r.local] || { prep: [], cerrado: 0, err: 0, can: 0, n: 0 }; if (r.tiempo_prep != null) o.prep.push(+r.tiempo_prep); o.cerrado += r.minutos_cerrado || 0; o.err += r.errores || 0; o.can += r.cancelados || 0; o.n += r.pedidos; });
    $('#dl-ops').innerHTML = Object.keys(ol).length ? `<thead><tr><th>Local</th><th class="num">Pedidos</th><th class="num">Prep. media</th><th class="num">Tiempo cerrado</th><th class="num">Errores</th><th class="num">Cancelados</th></tr></thead><tbody>` +
      Object.entries(ol).sort((a, b) => b[1].n - a[1].n).map(([l, o]) => `<tr><td><b>${LOCS[l] || esc(l)}</b></td><td class="num">${o.n}</td>
        <td class="num">${o.prep.length ? Math.round(o.prep.reduce((a, b) => a + b, 0) / o.prep.length) + ' min' : '—'}</td>
        <td class="num">${o.cerrado ? `<span class="tag rojo">${o.cerrado} min</span>` : '—'}</td><td class="num">${o.err ? `${o.err} (${num(pc(o.err, o.n))})` : '0'}</td><td class="num">${o.can || 0}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin datos.</td></tr></tbody>';

    // Lo importante (conclusiones automáticas)
    const c = [];
    const vT = s(fs, 'ventas'), vA = s(ant, 'ventas');
    if (vT && vA) c.push(`Ventas de delivery ${vT >= vA ? 'suben' : 'bajan'} un <b>${Math.abs(Math.round((vT - vA) * 100 / vA))}%</b> frente al periodo anterior (${euros(vT)} vs ${euros(vA)}).`);
    const u = porPlat('uber'), g = porPlat('glovo');
    if (s(u, 'ventas') && s(g, 'ventas')) c.push(`Uber pesa el <b>${Math.round(s(u, 'ventas') * 100 / vT)}%</b> de las ventas y Glovo el <b>${Math.round(s(g, 'ventas') * 100 / vT)}%</b>.`);
    if (s(u, 'neto') && s(g, 'neto')) c.push(`De cada 100 € os quedan <b>${Math.round(s(u, 'neto') * 100 / s(u, 'ventas'))} €</b> en Uber y <b>${Math.round(s(g, 'neto') * 100 / s(g, 'ventas'))} €</b> en Glovo.`);
    if (med[mejor]) c.push(`El mejor día es el <b>${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][mejor]}</b> (${euros(Math.round(med[mejor]))} de media).`);
    const locs = [...new Set(fs.map(r => r.local))].map(l => ({ l, v: s(fs.filter(r => r.local === l), 'ventas'), a: s(ant.filter(r => r.local === l), 'ventas') })).filter(x => x.a);
    const peor = locs.sort((a, b) => (a.v - a.a) / a.a - (b.v - b.a) / b.a)[0];
    if (peor && peor.v < peor.a * 0.9) c.push(`<b>${LOCS[peor.l]}</b> es el que más cae: ${Math.round((peor.v - peor.a) * 100 / peor.a)}% frente al periodo anterior.`);
    const cer = fs.filter(r => r.minutos_cerrado > 30); if (cer.length) c.push(`<span class="tag rojo">Ojo</span> ${cer.length} ${cer.length === 1 ? 'día' : 'días'} con la tienda cerrada más de 30 min en horario.`);
    const mal = gm.filter(x => x.ads && x.v / x.ads < 4); if (mal.length) c.push(`<span class="tag rojo">Anuncios</span> ROAS bajo en ${mal.map(x => `${LOCS[x.local]} (${PLAT[x.p][0]})`).join(', ')}: revisar campaña.`);
    $('#dl-claves').innerHTML = c.length ? c.map(x => `<li>${x}</li>`).join('') : '<li class="nota">Con unos días más de datos aquí salen las conclusiones.</li>';
  }

  document.querySelectorAll('[data-drng]').forEach(b => b.onclick = () => { rango = b.dataset.drng; cargar(); });
  document.querySelectorAll('[data-dloc]').forEach(b => b.onclick = () => { filtroLocal = b.dataset.dloc; pinta(); document.querySelectorAll('[data-dloc]').forEach(x => x.classList.toggle('b-ok', x.dataset.dloc === filtroLocal)); });

  // ── Volcar datos (el agente pega el JSON; una persona puede usar el mini formulario) ──
  const dv = $('#dlg-volcar');
  $('#dl-volcar').onclick = () => { $('#dv-json').value = ''; $('#dv-error').hidden = true; $('#dv-fecha').value = iso(new Date(Date.now() - 86400000)); dv.showModal(); };
  $('#dv-ok').onclick = async () => {
    const err = t => { $('#dv-error').textContent = t; $('#dv-error').hidden = false; };
    let datos;
    const txt = $('#dv-json').value.trim();
    if (txt) { try { datos = JSON.parse(txt); } catch (e) { return err('El texto no es un JSON válido.'); } }
    else {
      const n = id => $(id).value.trim() === '' ? null : +$(id).value.replace(',', '.');
      if (!$('#dv-fecha').value || n('#dv-pedidos') == null || n('#dv-ventas') == null) return err('Rellena al menos día, pedidos y ventas, o pega el JSON del agente.');
      datos = { filas: [{ local: $('#dv-local').value, fecha: $('#dv-fecha').value, plataforma: $('#dv-plat').value, pedidos: n('#dv-pedidos'), ventas_eur: n('#dv-ventas'),
        neto_eur: n('#dv-neto'), valoracion: n('#dv-val'), valoracion_tipo: $('#dv-plat').value === 'glovo' ? 'porcentaje' : 'estrellas' }],
        resumenes: $('#dv-texto').value.trim() ? [{ fecha: $('#dv-fecha').value, local: $('#dv-local').value, texto: $('#dv-texto').value.trim() }] : [] };
    }
    try {
      const r = await api.guardarDelivery(datos.filas || [], datos.resumenes || [], txt ? (datos.fuente || 'agente') : 'manual');
      dv.close(); await cargar();
      $('#dl-ok').textContent = `Guardado: ${r.filas} ${r.filas === 1 ? 'fila' : 'filas'} y ${r.resumenes} ${r.resumenes === 1 ? 'resumen' : 'resúmenes'}.`; $('#dl-ok').hidden = false;
      setTimeout(() => { $('#dl-ok').hidden = true; }, 5000);
    } catch (ex) { err(mensajeError(ex)); }
  };

  // Para el agente: OP.volcarDelivery({filas, resumenes}) desde la consola de esta página.
  window.OP.volcarDelivery = async datos => { const r = await api.guardarDelivery(datos.filas || [], datos.resumenes || [], datos.fuente || 'agente'); await cargar(); return r; };

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.delivery = { todos: true, async init(l, locales) { LOCALES = locales || []; await cargar(); }, mostrar: cargar, abrirAjustes };
})();
