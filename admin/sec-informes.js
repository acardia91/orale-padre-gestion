/* ÓRALE PADRE · admin · Informes
   Comparativa con el periodo anterior, ventas por categoría y por producto
   (con coste y margen según escandallo), mapa de calor día × hora, por canal
   (sala, web, delivery), por persona que cobra y extras más pedidos.
   Un local o todo el negocio (LOCAL = '*'). Sólo tickets propios del TPV y
   la web; lo de Last App se ve en "Ventas y facturas". */
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
      const [act, ant, emp, deliv, delivAnt] = await Promise.all([
        traer(ids, desde, hasta), traer(ids, pd, ph),
        api.informeEmpleados(LOCAL === '*' ? null : LOCAL, desde.toISOString(), hasta.toISOString()).catch(() => []),
        api.deliveryEntre(iso(desde), iso(ult)).catch(() => []),
        api.deliveryEntre(iso(pd), iso(new Date(ph.getTime() - 86400000))).catch(() => []),
      ]);
      const filtra = rs => LOCAL === '*' ? rs : rs.filter(r => r.local === LOCAL);
      datos = { act, ant, emp, deliv: filtra(deliv), delivAnt: filtra(delivAnt), pd, ph };
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
    $('#in-buscar').oninput = () => datos && pintaProductos(agrega(datos.act), agrega(datos.ant));
    $('#in-prods').addEventListener('click', e => { const b = e.target.closest('[data-orden]'); if (!b || !datos) return; orden = b.dataset.orden; pintaProductos(agrega(datos.act), agrega(datos.ant)); });
  }

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.informes = {
    todos: true,
    async init(local, locales) { LOCAL = local; LOCALES = locales || []; enganchar(); await cargar(); },
    async mostrar() { await cargar(); },
  };
})();
