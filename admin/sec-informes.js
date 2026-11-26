/* ÓRALE PADRE · admin · Informes
   Comparativa con el periodo anterior, ventas por categoría y por producto
   (con coste y margen según escandallo), mapa de calor día × hora, por canal
   (sala, web, delivery), por persona que cobra y extras más pedidos.
   Un local o todo el negocio (LOCAL = '*'). Sólo tickets propios del TPV y
   la web; lo de Last App se ve en "Ventas y facturas".
   Margen por canal: sala y web con los tickets; Uber y Glovo con lo que vuelca
   el agente (detalle.productos). Ajustes compartidos con Delivery. */
(function () {
  'use strict';
  const { api, euros, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  const pct = (a, b) => b ? Math.round(a * 1000 / b) / 10 : 0;
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const quien = e => e ? esc(e.replace(/@.*/, '').replace(/^orale\.padre\.food\+/, '')) : '—';
  let LOCAL, LOCALES = [], rango = '30', desde, hasta, datos = null, orden = 'imp';
  const nombreLocal = id => ((LOCALES.find(l => l.id === id) || {}).nombre || id).replace(/^Órale Padre\s*/, '');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  function calcRango(r) {
    const d = new Date(); d.setHours(0, 0, 0, 0); const h = new Date(d); h.setDate(h.getDate() + 1);
    if (r === '7') d.setDate(d.getDate() - 6);
    if (r === '30') d.setDate(d.getDate() - 29);
    if (r === 'mes') d.setDate(1);
    if (r === 'mesant') { d.setMonth(d.getMonth() - 1, 1); h.setTime(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()); }
    if (r === 'trim') d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
    return [d, h];
  }

  async function traer(ids, d, h) {
    const di = d.toISOString(), hi = h.toISOString();
    const porLocal = await Promise.all(ids.map(async id => {
      const [ts, costes, carta] = await Promise.all([api.ticketsEntre(id, di, hi), api.costes(id).catch(() => ({})), api.carta(id).catch(() => null)]);
      return { id, ts: ts.map(t => ({ ...t, local: id })), costes, carta };
    }));
    return porLocal;
  }

  async function cargar() {
    document.querySelectorAll('[data-irango]').forEach(b => b.classList.toggle('b-ok', b.dataset.irango === rango));
    if (rango) [desde, hasta] = calcRango(rango);
    $('#in-desde').value = iso(desde); const ult = new Date(hasta); ult.setDate(ult.getDate() - 1); $('#in-hasta').value = iso(ult);
    // Periodo anterior de la misma duración, justo antes.
    const largo = hasta - desde; const pd = new Date(desde.getTime() - largo), ph = new Date(desde);
    const ids = LOCAL === '*' ? LOCALES.map(l => l.id) : [LOCAL];
    $('#in-kpis').innerHTML = '<p class="nota">Cargando…</p>';
    try {
      const [act, ant, emp, deliv, delivAnt, aj] = await Promise.all([
        traer(ids, desde, hasta), traer(ids, pd, ph),
        api.informeEmpleados(LOCAL === '*' ? null : LOCAL, desde.toISOString(), hasta.toISOString()).catch(() => []),
        api.deliveryEntre(iso(desde), iso(ult)).catch(() => []),
        api.deliveryEntre(iso(pd), iso(new Date(ph.getTime() - 86400000))).catch(() => []),
        api.ajustesDelivery ? api.ajustesDelivery().catch(() => ({})) : {},
      ]);
      const filtra = rs => LOCAL === '*' ? rs : rs.filter(r => r.local === LOCAL);
      datos = { act, ant, emp, deliv: filtra(deliv), delivAnt: filtra(delivAnt), pd, ph, aj: aj || {} };
    } catch (ex) { $('#in-kpis').innerHTML = `<p class="aviso">${esc(mensajeError(ex))}</p>`; return; }
    pinta();
  }

  // Junta los tickets en productos, categorías, extras, horas…
  function agrega(porLocal) {
    const prods = new Map(), cats = new Map(), extras = new Map();
    const calor = Array.from({ length: 7 }, () => Array(24).fill(0)); const diasVistos = Array.from({ length: 7 }, () => new Set());
    let ventas = 0, tickets = 0, uds = 0, desc = 0, gasto = 0, baseConCoste = 0, baseTotal = 0, sala = 0, web = 0;
    porLocal.forEach(({ ts, costes, carta }) => {
      const catDe = new Map(); const nombreCat = new Map();
      if (carta && carta.categorias) carta.categorias.forEach(c => { nombreCat.set(c.clave, c.nombre); (c.productos || []).forEach(pid => catDe.set(pid, c.nombre)); });
      const costeDe = new Map(Object.entries(costes || {}).map(([k, v]) => [norm(k), v.coste]));
      ts.forEach(t => {
        ventas += t.total; tickets++; desc += t.descuento || 0;
        if (t.cuenta_id) sala += t.total; else web += t.total;
        const f = new Date(t.fecha);
        const dow = (new Date(f.toLocaleString('en-US', { timeZone: 'Europe/Madrid' })).getDay() + 6) % 7;
        const hora = +f.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' });
        calor[dow][hora] += t.total; diasVistos[dow].add(iso(f));
        // Reparto del descuento del ticket entre sus líneas (para no inflar el importe por producto).
        const bruto = (t.lineas || []).reduce((s, l) => s + l.unitario * l.cantidad, 0) || 1;
        const factor = t.total / bruto;
        (t.lineas || []).forEach(l => {
          const imp = Math.round(l.unitario * l.cantidad * factor); uds += l.cantidad;
          const k = norm(l.nombre); const cat = catDe.get(l.producto) || 'Otros';
          const p = prods.get(k) || { nombre: l.nombre, cat, u: 0, imp: 0, coste: 0, conCoste: false };
          p.u += l.cantidad; p.imp += imp;
          const c = costes && costes[l.producto] && costes[l.producto].coste != null ? costes[l.producto].coste : costeDe.get(k);
          if (c != null) { p.coste += c * l.cantidad; p.conCoste = true; gasto += c * l.cantidad; baseConCoste += imp / 1.1; }
          baseTotal += imp / 1.1;
          prods.set(k, p);
          const cc = cats.get(cat) || { nombre: cat, u: 0, imp: 0 }; cc.u += l.cantidad; cc.imp += imp; cats.set(cat, cc);
          (l.opciones || []).forEach(o => { const e = extras.get(norm(o.nombre)) || { nombre: o.nombre, u: 0, imp: 0 }; e.u += l.cantidad; e.imp += (o.precio || 0) * l.cantidad; extras.set(norm(o.nombre), e); });
        });
      });
    });
    return { prods: [...prods.values()], cats: [...cats.values()], extras: [...extras.values()], calor, diasVistos, ventas, tickets, uds, desc, gasto, baseConCoste, baseTotal, sala, web };
  }

  function delta(a, b, inverso) {
    if (!b) return a ? '<span class="dl sube">nuevo</span>' : '';
    const v = Math.round((a - b) * 1000 / b) / 10; const bien = inverso ? v <= 0 : v >= 0;
    return `<span class="dl ${bien ? 'sube' : 'baja'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toLocaleString('es-ES')}%</span>`;
  }

  function pinta() {
    const A = agrega(datos.act), B = agrega(datos.ant);
    const dv = rs => rs.reduce((s, r) => s + (r.ventas || 0), 0), dn = rs => rs.reduce((s, r) => s + (r.pedidos || 0), 0);
    const delA = dv(datos.deliv), delB = dv(datos.delivAnt);
    const tmA = A.tickets ? Math.round(A.ventas / A.tickets) : 0, tmB = B.tickets ? Math.round(B.ventas / B.tickets) : 0;
    const margen = A.baseConCoste ? pct(A.baseConCoste - A.gasto, A.baseConCoste) : null;
    const fmt = d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const k = (t, v, s, d) => `<div class="kpi"><small>${t}</small><b>${v}</b><span>${d || ''} ${s || ''}</span></div>`;
    $('#in-comp').textContent = `Comparado con ${fmt(datos.pd)} – ${fmt(new Date(datos.ph.getTime() - 86400000))}`;
    $('#in-kpis').innerHTML =
      k('Ventas TPV + web', euros(A.ventas), `antes ${euros(B.ventas)}`, delta(A.ventas, B.ventas)) +
      k('Tickets', A.tickets, `antes ${B.tickets}`, delta(A.tickets, B.tickets)) +
      k('Ticket medio', A.tickets ? euros(tmA) : '—', B.tickets ? `antes ${euros(tmB)}` : '', delta(tmA, tmB)) +
      k('Productos vendidos', A.uds, `antes ${B.uds}`, delta(A.uds, B.uds)) +
      k('Descuentos', euros(A.desc), `${pct(A.desc, A.ventas + A.desc)}% de lo vendido`, delta(A.desc, B.desc, true)) +
      k('Margen bruto (escandallo)', margen == null ? '—' : margen.toLocaleString('es-ES') + '%', margen == null ? 'faltan costes en la carta' : `coste ${euros(Math.round(A.gasto))} · ${pct(A.baseConCoste, A.baseTotal)}% de lo vendido con coste`) +
      k('Delivery (Uber + Glovo)', euros(delA), `${dn(datos.deliv)} pedidos · antes ${euros(delB)}`, delta(delA, delB));

    // Canales
    const canales = [['Sala (TPV)', A.sala, B.sala], ['Web para recoger', A.web, B.web], ['Uber Eats', dv(datos.deliv.filter(r => r.plataforma === 'uber')), dv(datos.delivAnt.filter(r => r.plataforma === 'uber'))],
      ['Glovo', dv(datos.deliv.filter(r => r.plataforma === 'glovo')), dv(datos.delivAnt.filter(r => r.plataforma === 'glovo'))]];
    const totC = canales.reduce((s, c) => s + c[1], 0) || 1;
    $('#in-canales').innerHTML = `<thead><tr><th>Canal</th><th class="num">Ventas</th><th class="num">%</th><th class="num">vs antes</th><th style="width:35%"></th></tr></thead><tbody>` +
      canales.map(c => `<tr><td><b>${c[0]}</b></td><td class="num">${euros(c[1])}</td><td class="num">${pct(c[1], totC)}%</td><td class="num">${delta(c[1], c[2])}</td>
        <td><div class="barra-h"><span style="width:${pct(c[1], totC)}%"></span></div></td></tr>`).join('') + '</tbody>';

    // Categorías
    const cats = A.cats.sort((a, b) => b.imp - a.imp); const totCat = cats.reduce((s, c) => s + c.imp, 0) || 1;
    $('#in-cats').innerHTML = cats.length ? `<thead><tr><th>Categoría</th><th class="num">Uds.</th><th class="num">Importe</th><th class="num">%</th><th style="width:30%"></th></tr></thead><tbody>` +
      cats.map(c => `<tr><td><b>${esc(c.nombre)}</b></td><td class="num">${c.u}</td><td class="num">${euros(c.imp)}</td><td class="num">${pct(c.imp, totCat)}%</td>
        <td><div class="barra-h"><span style="width:${pct(c.imp, cats[0].imp)}%"></span></div></td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin ventas en este periodo.</td></tr></tbody>';

    pintaProductos(A, B);
    pintaCanales();
    pintaCalor(A);

    // Por persona
    const emp = datos.emp;
    $('#in-emp').innerHTML = emp.length ? `<thead><tr><th>Quién cobra</th>${LOCAL === '*' ? '<th>Local</th>' : ''}<th class="num">Tickets</th><th class="num">Ventas</th><th class="num">Ticket medio</th><th class="num">Efectivo</th><th class="num">Tarjeta</th><th class="num">Descuentos</th></tr></thead><tbody>` +
      emp.map(e => `<tr><td><b>${quien(e.email)}</b></td>${LOCAL === '*' ? `<td>${esc(nombreLocal(e.local))}</td>` : ''}<td class="num">${e.tickets}</td><td class="num"><b>${euros(+e.total)}</b></td>
        <td class="num">${euros(Math.round(e.total / e.tickets))}</td><td class="num">${euros(+e.efectivo)}</td><td class="num">${euros(+e.tarjeta)}</td><td class="num">${+e.descuentos ? euros(+e.descuentos) : '—'}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin cobros en este periodo.</td></tr></tbody>';

    // Extras
    const ex = A.extras.sort((a, b) => b.u - a.u).slice(0, 12);
    $('#in-extras').innerHTML = ex.length ? `<thead><tr><th>Extra / opción</th><th class="num">Veces</th><th class="num">Ingresos</th></tr></thead><tbody>` +
      ex.map(e => `<tr><td>${esc(e.nombre)}</td><td class="num">${e.u}</td><td class="num">${e.imp ? euros(e.imp) : '—'}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Nadie ha pedido extras en este periodo.</td></tr></tbody>';
  }

  function pintaProductos(A, B) {
    const antes = new Map(B.prods.map(p => [norm(p.nombre), p]));
    const filtro = norm($('#in-buscar').value);
    const lista = A.prods.filter(p => !filtro || norm(p.nombre).includes(filtro) || norm(p.cat).includes(filtro)).map(p => {
      const base = p.imp / 1.1; return { ...p, margen: p.conCoste ? base - p.coste : null, mpct: p.conCoste ? pct(base - p.coste, base) : null, antes: (antes.get(norm(p.nombre)) || {}).u || 0 };
    });
    const clave = { imp: p => p.imp, u: p => p.u, margen: p => p.margen ?? -1e12, mpct: p => p.mpct ?? -1e12, nombre: null }[orden];
    lista.sort(clave ? (a, b) => clave(b) - clave(a) : (a, b) => a.nombre.localeCompare(b.nombre));
    const tot = A.prods.reduce((s, p) => s + p.imp, 0) || 1;
    const th = (k, t, num) => `<th class="${num ? 'num' : ''}"><button type="button" class="ord ${orden === k ? 'activo' : ''}" data-orden="${k}">${t}${orden === k ? ' ▾' : ''}</button></th>`;
    $('#in-prods').innerHTML = lista.length ? `<thead><tr>${th('nombre', 'Producto')}<th>Categoría</th>${th('u', 'Uds.', 1)}<th class="num">vs antes</th>${th('imp', 'Importe', 1)}<th class="num">%</th><th class="num">Coste</th>${th('margen', 'Margen €', 1)}${th('mpct', 'Margen %', 1)}</tr></thead><tbody>` +
      lista.map(p => `<tr><td><b>${esc(p.nombre)}</b></td><td>${esc(p.cat)}</td><td class="num">${p.u}</td><td class="num">${delta(p.u, p.antes)}</td><td class="num">${euros(p.imp)}</td>
        <td class="num">${pct(p.imp, tot)}%</td><td class="num">${p.conCoste ? euros(Math.round(p.coste)) : '<small>sin coste</small>'}</td>
        <td class="num">${p.margen == null ? '—' : euros(Math.round(p.margen))}</td>
        <td class="num">${p.mpct == null ? '—' : `<span class="tag ${p.mpct >= 65 ? 'verde' : p.mpct < 50 ? 'rojo' : ''}">${p.mpct.toLocaleString('es-ES')}%</span>`}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin ventas en este periodo.</td></tr></tbody>';
    $('#in-prods-nota').textContent = 'Importe con IVA y con los descuentos repartidos. Margen = base sin IVA (10%) menos el coste del escandallo; los costes se ponen en Carta y productos.';
    datos.listaProd = lista;
  }

  /* ══ Margen por canal ══
     Sala = tickets con cuenta (TPV); web = tickets sin cuenta (pedidos de la web).
     Por línea: base sin IVA − coste escandallo − su parte de la comisión de tarjeta
     (si se pagó con tarjeta u online) − su parte de los envases (web: por pedido).
     Uber/Glovo: ventas por producto del agente; comisión del día (o la de ajustes),
     anuncios + promos y envases repartidos por euro vendido.
     Lo que no tiene coste (o es "Parte N de P") se estima con el % de ajustes. */
  const CANALES = [['sala', 'Sala (TPV)', 'ticket'], ['web', 'Web para recoger', 'pedido'], ['uber', 'Uber Eats', 'pedido'], ['glovo', 'Glovo', 'pedido']];
  function ajustes() {
    const a = datos.aj || {}; const pl = k => ({ comision_pct: 30, envase_eur: 0.5, ...(a[k] || {}) });
    return { uber: pl('uber'), glovo: pl('glovo'), web: { envase_eur: 0.5, ...(a.web || {}) }, tarjeta_pct: a.tarjeta_pct ?? 0,
      coste_pct_sin_detalle: a.coste_pct_sin_detalle ?? 30, margen_objetivo_pct: a.margen_objetivo_pct ?? 25, propios: !!Object.keys(a).length };
  }
  function margenCanales() {
    const aj = ajustes(); const pctSin = aj.coste_pct_sin_detalle / 100, tarj = aj.tarjeta_pct / 100;
    const C = {}; CANALES.forEach(([k]) => { C[k] = { ventas: 0, coste: 0, com: 0, mkt: 0, env: 0, n: 0, estimado: 0, comEst: false }; });
    const prods = new Map();
    const celda = (nombre, cat, k) => { const kk = norm(nombre); let o = prods.get(kk); if (!o) { o = { nombre, cat, c: {} }; prods.set(kk, o); }
      return o.c[k] = o.c[k] || { u: 0, imp: 0, coste: 0, uCoste: 0, cuota: 0 }; };
    // Coste por nombre (para lo que llega de Uber/Glovo, que no trae el id de la carta)
    const porNombre = new Map();
    datos.act.forEach(({ costes, carta }) => (carta && carta.productos || []).forEach(p => { const c = costes && costes[p.id]; if (c && c.coste != null && !porNombre.has(norm(p.nombre))) porNombre.set(norm(p.nombre), c.coste); }));
    const costeNombre = n => { const k = norm(n); if (porNombre.has(k)) return porNombre.get(k); for (const [m, c] of porNombre) if (m.length > 5 && (k.includes(m) || m.includes(k))) return c; return null; };

    datos.act.forEach(({ ts, costes, carta }) => {
      const catDe = new Map(); if (carta && carta.categorias) carta.categorias.forEach(c => (c.productos || []).forEach(pid => catDe.set(pid, c.nombre)));
      ts.forEach(t => {
        if (!t.total) return;
        const k = t.cuenta_id ? 'sala' : 'web'; const c = C[k]; c.n++; c.ventas += t.total;
        const com = (t.metodo === 'tarjeta' || t.metodo === 'stripe') ? t.total * tarj : 0;
        const env = k === 'web' ? aj.web.envase_eur * 100 : 0;
        c.com += com; c.env += env;
        const bruto = (t.lineas || []).reduce((s, l) => s + l.unitario * l.cantidad, 0) || 1; const factor = t.total / bruto;
        (t.lineas || []).forEach(l => {
          const imp = l.unitario * l.cantidad * factor; const peso = imp / t.total;
          const cu = l.parte ? null : (costes && costes[l.producto] && costes[l.producto].coste != null ? costes[l.producto].coste : costeNombre(l.nombre));
          if (cu != null) c.coste += cu * l.cantidad; else { c.coste += imp / 1.1 * pctSin; c.estimado += imp; }
          if (l.parte) return;
          const x = celda(l.nombre, catDe.get(l.producto) || 'Otros', k);
          x.u += l.cantidad; x.imp += imp; x.cuota += (com + env) * peso;
          if (cu != null) { x.coste += cu * l.cantidad; x.uCoste += l.cantidad; }
        });
      });
    });
    datos.deliv.forEach(r => {
      const c = C[r.plataforma]; if (!c || !r.ventas) return; const ap = aj[r.plataforma];
      const com = r.comision != null ? r.comision : r.ventas * ap.comision_pct / 100; if (r.comision == null) c.comEst = true;
      const mkt = (r.anuncios || 0) + (r.promociones || 0), env = (r.pedidos || 0) * ap.envase_eur * 100;
      c.n += r.pedidos || 0; c.ventas += r.ventas; c.com += com; c.mkt += mkt; c.env += env;
      let cubierto = 0;
      const items = r.detalle && (r.detalle.productos || r.detalle.top);
      (Array.isArray(items) ? items : []).forEach(it => {
        const nombre = it && (it.nombre || it.producto); const u = +(it && (it.uds || it.unidades || it.cantidad)) || 0;
        const v = it && (it.ventas_eur ?? it.importe_eur); if (!nombre || !u || v == null) return;
        const imp = Math.round(+v * 100); const cu = costeNombre(nombre); const peso = imp / r.ventas;
        const x = celda(nombre, '', r.plataforma); x.u += u; x.imp += imp; x.cuota += (com + mkt + env) * peso;
        if (cu != null) { x.coste += cu * u; x.uCoste += u; c.coste += cu * u; cubierto += imp; }
      });
      const resto = Math.max(0, r.ventas - cubierto); c.coste += resto / 1.1 * pctSin; c.estimado += resto;
    });
    return { C, prods: [...prods.values()], aj };
  }

  function pintaCanales() {
    const { C, prods, aj } = margenCanales(); const obj = aj.margen_objetivo_pct;
    const activos = CANALES.filter(([k]) => C[k].ventas);
    if (!activos.length) { $('#in-mc').innerHTML = '<tbody><tr><td class="nota">Sin ventas en este periodo.</td></tr></tbody>'; $('#in-mcp').innerHTML = ''; $('#in-mc-nota').textContent = ''; return; }
    const e = v => euros(Math.round(v)); const p1 = v => (Math.round(v * 10) / 10).toLocaleString('es-ES');
    const tagPct = (q, base) => { const v = base ? q * 100 / base : 0; return `<span class="tag ${v < obj ? (v < 10 ? 'rojo' : '') : 'verde'}">${p1(v)} %</span>`; };
    const res = activos.map(([k, nom, ud]) => { const c = C[k]; const base = c.ventas / 1.1; const q = base - c.coste - c.com - c.mkt - c.env; return { k, nom, ud, c, base, q }; });
    const mejor = res.reduce((a, b) => (b.c.n && b.q / b.c.n > a.q / a.c.n ? b : a), res[0]);
    $('#in-mc').innerHTML = `<thead><tr><th>Canal</th><th class="num">Ventas sin IVA</th><th class="num">Producto</th><th class="num">Comisiones</th><th class="num">Anuncios y promos</th><th class="num">Envases</th><th class="num">Os queda</th><th class="num">%</th><th class="num">Por ticket / pedido</th></tr></thead><tbody>` +
      res.map(r => `<tr><td><b>${r.nom}</b><br><small>${r.c.n} ${r.ud}${r.c.n === 1 ? '' : 's'}</small></td><td class="num">${e(r.base)}</td>
        <td class="num">−${e(r.c.coste)}${r.c.estimado > r.c.ventas * 0.2 ? ' <small>(parte estimada)</small>' : ''}</td>
        <td class="num">${r.c.com ? '−' + e(r.c.com) : '—'}${r.c.comEst ? ' <small>(ajustes)</small>' : ''}</td><td class="num">${r.c.mkt ? '−' + e(r.c.mkt) : '—'}</td><td class="num">${r.c.env ? '−' + e(r.c.env) : '—'}</td>
        <td class="num"><b>${e(r.q)}</b></td><td class="num">${tagPct(r.q, r.base)}</td><td class="num">${r.c.n ? `<b>${e(r.q / r.c.n)}</b>` : '—'}${r === mejor && res.length > 1 ? ' <span class="tag verde">el que más deja</span>' : ''}</td></tr>`).join('') + '</tbody>';

    // Por producto: lo que deja cada unidad en cada canal.
    const filtro = norm($('#in-buscar').value);
    const lista = prods.filter(o => !filtro || norm(o.nombre).includes(filtro) || norm(o.cat).includes(filtro)).map(o => {
      const cel = {}; let mejorK = null, mejorV = -Infinity, uds = 0;
      activos.forEach(([k]) => { const x = o.c[k]; if (!x || !x.u) return; uds += x.u;
        if (!x.uCoste) { cel[k] = { u: x.u, precio: x.imp / x.u }; return; }
        const coste = x.coste / x.uCoste * x.u; const q = (x.imp / 1.1 - coste - x.cuota) / x.u;
        cel[k] = { u: x.u, precio: x.imp / x.u, q, pq: q * 100 / (x.imp / 1.1 / x.u) };
        if (q > mejorV) { mejorV = q; mejorK = k; } });
      const peor = Object.entries(cel).filter(([, v]) => v.q != null).sort((a, b) => a[1].q - b[1].q)[0];
      const conQ = Object.values(cel).filter(v => v.q != null).length;
      return { ...o, cel, uds, mejorK: conQ > 1 ? mejorK : null, dif: conQ > 1 && peor && peor[0] !== mejorK ? mejorV - peor[1].q : 0 };
    }).filter(o => o.uds).sort((a, b) => b.uds - a.uds);
    const nomC = Object.fromEntries(CANALES.map(([k, n]) => [k, n.replace(/ \(.*| para recoger/, '')]));
    $('#in-mcp').innerHTML = lista.length ? `<thead><tr><th>Producto</th>${activos.map(([k]) => `<th class="num">${nomC[k]}</th>`).join('')}<th>Dónde deja más</th></tr></thead><tbody>` +
      lista.map(o => `<tr><td><b>${esc(o.nombre)}</b>${o.cat ? `<br><small>${esc(o.cat)}</small>` : ''}</td>` + activos.map(([k]) => { const v = o.cel[k];
        if (!v) return '<td class="num"><small>—</small></td>';
        if (v.q == null) return `<td class="num"><span class="tag gris">sin escandallo</span><br><small>${v.u} uds · ${euros(Math.round(v.precio))}</small></td>`;
        return `<td class="num"><span class="tag ${v.pq < obj ? (v.pq < 10 ? 'rojo' : '') : 'verde'}">${euros(Math.round(v.q))}</span><br><small>${v.u} uds · ${Math.round(v.pq)} %</small></td>`; }).join('') +
        `<td>${o.mejorK ? `<b>${nomC[o.mejorK]}</b>${o.dif >= 5 ? `<br><small>${euros(Math.round(o.dif))} más por unidad que en el peor</small>` : ''}` : '<small>—</small>'}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin ventas por producto en este periodo.</td></tr></tbody>';
    const sinDel = ['uber', 'glovo'].some(k => C[k].ventas) && !prods.some(o => o.c.uber || o.c.glovo);
    $('#in-mc-nota').innerHTML = `Cada casilla: lo que os queda por unidad después de producto, comisiones, anuncios y envases (verde si llega a vuestro ${obj} %). ` +
      `Comisión del datáfono y pago online: ${p1(aj.tarjeta_pct)} %; envases web ${euros(Math.round(aj.web.envase_eur * 100))} por pedido; lo que no tiene escandallo se estima con el ${aj.coste_pct_sin_detalle} %.` +
      (sinDel ? ' Uber y Glovo salen sólo en el total hasta que el agente traiga las ventas por producto.' : '') +
      (aj.propios ? '' : ' <b>Son valores provisionales: pon los vuestros en Ajustes.</b>');
  }

  function pintaCalor(A) {
    const horas = []; for (let h = 0; h < 24; h++) if (A.calor.some(f => f[h])) horas.push(h);
    if (!horas.length) { $('#in-calor').innerHTML = '<p class="nota">Sin ventas en este periodo.</p>'; return; }
    const ini = Math.min(horas[0], 12), fin = Math.max(horas[horas.length - 1], 23);
    // Media por día (no suma), para que un día de la semana que sale más veces no parezca mejor.
    const media = (d, h) => A.diasVistos[d].size ? A.calor[d][h] / A.diasVistos[d].size : 0;
    let max = 0; for (let d = 0; d < 7; d++) for (let h = ini; h <= fin; h++) max = Math.max(max, media(d, h));
    let html = '<table class="calor"><thead><tr><th></th>'; for (let h = ini; h <= fin; h++) html += `<th>${h}</th>`; html += '<th class="num">Media/día</th></tr></thead><tbody>';
    for (let d = 0; d < 7; d++) {
      const totDia = A.diasVistos[d].size ? A.calor[d].reduce((s, v) => s + v, 0) / A.diasVistos[d].size : 0;
      html += `<tr><th>${DIAS[d]}</th>`;
      for (let h = ini; h <= fin; h++) { const v = media(d, h); const a = max ? v / max : 0;
        html += `<td title="${DIAS[d]} ${h}:00 · media ${euros(Math.round(v))}" style="background:rgba(124,36,48,${a ? (0.08 + a * 0.85).toFixed(2) : 0})">${a > 0.55 ? '●' : ''}</td>`; }
      html += `<td class="num"><b>${totDia ? euros(Math.round(totDia)) : '—'}</b></td></tr>`;
    }
    $('#in-calor').innerHTML = html + '</tbody></table>';
  }

  function csv() {
    const lista = (datos && datos.listaProd) || []; if (!lista.length) { alert('No hay ventas en este periodo.'); return; }
    const n = c => c == null ? '' : (c / 100).toFixed(2).replace('.', ',');
    const filas = [['Producto', 'Categoría', 'Unidades', 'Importe', 'Coste', 'Margen', 'Margen %'],
      ...lista.map(p => [p.nombre, p.cat, p.u, n(p.imp), p.conCoste ? n(Math.round(p.coste)) : '', p.margen == null ? '' : n(Math.round(p.margen)), p.mpct == null ? '' : String(p.mpct).replace('.', ',')])];
    const txt = '﻿' + filas.map(r => r.map(v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `productos-${LOCAL === '*' ? 'todos' : LOCAL}-${$('#in-desde').value}_a_${$('#in-hasta').value}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function enganchar() {
    document.querySelectorAll('[data-irango]').forEach(b => b.onclick = () => { rango = b.dataset.irango; cargar(); });
    const manual = () => {
      if (!$('#in-desde').value || !$('#in-hasta').value) return;
      const d = new Date($('#in-desde').value + 'T00:00'), h = new Date($('#in-hasta').value + 'T00:00'); h.setDate(h.getDate() + 1);
      if (h <= d) return; rango = null; desde = d; hasta = h; cargar();
    };
    $('#in-desde').onchange = manual; $('#in-hasta').onchange = manual;
    $('#in-csv').onclick = csv;
    $('#in-buscar').oninput = () => { if (datos) { pintaProductos(agrega(datos.act), agrega(datos.ant)); pintaCanales(); } };
    $('#in-mc-ajustes').onclick = () => { const d = window.ADMIN.delivery; if (d && d.abrirAjustes) d.abrirAjustes(() => cargar()); };
    $('#in-prods').addEventListener('click', e => { const b = e.target.closest('[data-orden]'); if (!b || !datos) return; orden = b.dataset.orden; pintaProductos(agrega(datos.act), agrega(datos.ant)); });
  }

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.informes = {
    todos: true,
    async init(local, locales) { LOCAL = local; LOCALES = locales || []; enganchar(); await cargar(); },
    async mostrar() { await cargar(); },
  };
})();
