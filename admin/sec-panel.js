/* ÓRALE PADRE · admin · Panel (portada)
   Ventas del periodo (sala + web + delivery), gasto en producto según
   escandallo, margen, cómo se cobra, por local, lo más vendido y el
   resumen diario de delivery. Un local o todo el negocio (LOCAL = '*'). */
(function () {
  'use strict';
  const { api, euros } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  const pct = (a, b) => b ? Math.round(a * 1000 / b) / 10 : 0;
  const eurK = c => Math.abs(c) >= 1000000 ? (c / 100000).toFixed(1).replace('.', ',') + ' k€' : euros(c);
  const DELIV_LOCALES = { 'san-luis': 'San Luis', remedios: 'Los Remedios', 'sevilla-este': 'Sevilla Este', tomares: 'Tomares' };
  let LOCAL, LOCALES = [], rango = 'hoy';
  const nombreLocal = id => ((LOCALES.find(l => l.id === id) || {}).nombre || DELIV_LOCALES[id] || id).replace(/^Órale Padre\s*/, '');

  function calcRango(r) {
    const d = new Date(); d.setHours(0, 0, 0, 0); const h = new Date(d); h.setDate(h.getDate() + 1);
    if (r === 'ayer') { d.setDate(d.getDate() - 1); h.setDate(h.getDate() - 1); }
    if (r === '7') d.setDate(d.getDate() - 6);
    if (r === 'mes') d.setDate(1);
    return [d, h];
  }

  async function cargar() {
    document.querySelectorAll('[data-prng]').forEach(b => b.classList.toggle('b-ok', b.dataset.prng === rango));
    const [d, h] = calcRango(rango); const ult = new Date(h); ult.setDate(ult.getDate() - 1);
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    $('#pn-fecha').textContent = rango === 'hoy' || rango === 'ayer'
      ? cap(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))
      : `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${ult.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
    const ids = LOCAL === '*' ? LOCALES.map(l => l.id) : [LOCAL];
    const di = d.toISOString(), hi = h.toISOString();
    let datos, delivery = [], resumenes = [];
    try {
      [datos, delivery, resumenes] = await Promise.all([
        Promise.all(ids.map(async id => {
          const [ts, costes, imp] = await Promise.all([api.ticketsEntre(id, di, hi), api.costes(id).catch(() => ({})),
            api.ventasImportadasEntre ? api.ventasImportadasEntre(id, di, hi).catch(() => []) : []]);
          return { id, ts, costes, imp: imp.filter(v => v.estado === 'pagada') };
        })),
        api.deliveryEntre(iso(d), iso(ult)).catch(() => []),
        // El agente vuelca el día anterior: se enseña siempre su último resumen (hasta 10 días atrás).
        api.resumenesDelivery(iso(new Date(ult.getTime() - 10 * 86400000)), iso(new Date())).catch(() => []),
      ]);
    } catch (ex) { $('#pn-kpis').innerHTML = `<p class="aviso">${esc(OP.mensajeError(ex))}</p>`; return; }
    // Delivery: si se mira un local, sólo el suyo.
    if (LOCAL !== '*') { delivery = delivery.filter(r => r.local === LOCAL); resumenes = resumenes.filter(r => r.local === LOCAL || r.local === 'general'); }
    pinta(datos, delivery, resumenes, d, h);
  }

  function pinta(datos, delivery, resumenes, d, h) {
    // ── Cálculo ──
    const porLocal = {}; const prods = new Map(); const porHora = {}; const porDia = {}; const metodos = {};
    let ventas = 0, base = 0, gasto = 0, tickets = 0, sinCoste = 0, baseConCoste = 0, imp = 0;
    const unDia = (h - d) <= 86400000 + 3600000;
    const clave = f => unDia ? new Date(f).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }) : iso(new Date(f));
    datos.forEach(({ id, ts, costes, imp: importadas }) => {
      const L = porLocal[id] = porLocal[id] || { ventas: 0, base: 0, gasto: 0, tickets: 0, delivery: 0, deliveryPedidos: 0, imp: 0 };
      ts.forEach(t => {
        const b = (t.desglose_iva || []).reduce((s, x) => s + x.base, 0);
        ventas += t.total; base += b; tickets++; L.ventas += t.total; L.base += b; L.tickets++;
        metodos[t.metodo] = (metodos[t.metodo] || 0) + t.total;
        const k = clave(t.fecha); (unDia ? porHora : porDia)[k] = ((unDia ? porHora : porDia)[k] || { propio: 0, delivery: 0 }); (unDia ? porHora : porDia)[k].propio += t.total;
        let costeTicket = 0, todoConCoste = true;
        (t.lineas || []).forEach(l => {
          const c = costes[l.producto]; const g = c ? c.coste * l.cantidad : 0;
          if (!c) { todoConCoste = false; sinCoste += l.unitario * l.cantidad; }
          costeTicket += g;
          const p = prods.get(l.nombre) || { nombre: l.nombre, uds: 0, ventas: 0, gasto: 0, conCoste: !!c };
          p.uds += l.cantidad; p.ventas += l.unitario * l.cantidad; p.gasto += g; p.conCoste = p.conCoste || !!c; prods.set(l.nombre, p);
        });
        gasto += costeTicket; L.gasto += costeTicket; if (todoConCoste) baseConCoste += b;
      });
      importadas.forEach(v => { imp += v.total; L.imp += v.total; L.ventas += v.total; ventas += v.total; tickets++; L.tickets++;
        const k = clave(v.fecha); const o = (unDia ? porHora : porDia); o[k] = o[k] || { propio: 0, delivery: 0 }; o[k].propio += v.total; });
    });
    let dVentas = 0, dNeto = 0, dPedidos = 0; const dPlat = { uber: { ventas: 0, pedidos: 0 }, glovo: { ventas: 0, pedidos: 0 } };
    delivery.forEach(r => {
      dVentas += r.ventas; dNeto += r.neto ?? 0; dPedidos += r.pedidos;
      dPlat[r.plataforma].ventas += r.ventas; dPlat[r.plataforma].pedidos += r.pedidos;
      const L = porLocal[r.local] = porLocal[r.local] || { ventas: 0, base: 0, gasto: 0, tickets: 0, delivery: 0, deliveryPedidos: 0, imp: 0 };
      L.delivery += r.ventas; L.deliveryPedidos += r.pedidos;
      if (!unDia) { porDia[r.fecha] = porDia[r.fecha] || { propio: 0, delivery: 0 }; porDia[r.fecha].delivery += r.ventas; }
    });
    const total = ventas + dVentas;
    const fc = pct(gasto, base);   // % sobre ventas sin IVA de sala y web
    const margen = base - gasto;
    const cobertura = base ? Math.round((1 - sinCoste / Math.max(1, ventas - imp)) * 100) : 100;
    const nivel = fc === 0 ? '' : fc < 28 ? 'bien' : fc < 33 ? 'ojo' : 'mal';

    // ── KPIs ──
    const k = (cls, t, v, s, extra = '') => `<div class="pk ${cls}"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}${extra}</div>`;
    $('#pn-kpis').innerHTML =
      k('pk-hero', 'Ventas totales', eurK(total), `Sala y web ${euros(ventas)} · Delivery ${euros(dVentas)}`,
        total ? `<div class="pk-barra"><i style="width:${pct(ventas, total)}%"></i><i class="d" style="width:${pct(dVentas, total)}%"></i></div>` : '') +
      k('pk-coste ' + nivel, 'Gasto en producto', euros(gasto), base ? `<em>${String(fc).replace('.', ',')} %</em> de lo vendido sin IVA${cobertura < 100 ? ` · ${cobertura} % con escandallo` : ''}` : 'Sin ventas en sala ni web',
        base ? `<div class="pk-medidor"><i style="width:${Math.min(100, fc * 2)}%"></i><u style="left:60%" title="30 %"></u></div>` : '') +
      k('', 'Margen bruto', euros(margen), base ? `${String(pct(margen, base)).replace('.', ',')} % sobre ventas sin IVA` : '') +
      k('', 'Tickets', tickets, tickets ? `Ticket medio ${euros(Math.round(ventas / tickets))}` : '') +
      k('', 'Delivery', dPedidos + ' pedidos', delivery.length ? `Uber ${euros(dPlat.uber.ventas)} · Glovo ${euros(dPlat.glovo.ventas)}${dNeto ? ` · neto ${euros(dNeto)}` : ''}` : 'Aún sin datos del agente');

    // ── Gráfico ──
    const serie = unDia ? porHora : porDia;
    let claves = Object.keys(serie).sort();
    if (unDia) { const hs = claves.map(Number); const ini = Math.min(12, ...hs), fin = Math.max(23, ...hs); claves = []; for (let i = ini; i <= fin; i++) claves.push(String(i).padStart(2, '0')); }
    else { claves = []; for (let x = new Date(d); x < h; x.setDate(x.getDate() + 1)) claves.push(iso(x)); }
    const max = Math.max(1, ...claves.map(c => (serie[c] || {}).propio + ((serie[c] || {}).delivery || 0) || 0));
    $('#pn-graf-tit').textContent = unDia ? 'Ventas por hora' : 'Ventas por día';
    $('#pn-graf').innerHTML = claves.map(c => { const v = serie[c] || { propio: 0, delivery: 0 }; const t = v.propio + (v.delivery || 0);
      const et = unDia ? c + 'h' : new Date(c + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: claves.length > 10 ? undefined : 'short' });
      return `<div class="gb" title="${et}: ${euros(t)}"><div class="gb-col"><i class="d" style="height:${(v.delivery || 0) * 100 / max}%"></i><i style="height:${v.propio * 100 / max}%"></i></div><small>${et}</small>${t ? `<em>${eurK(t)}</em>` : ''}</div>`; }).join('')
      || '<p class="nota">Sin ventas en este periodo.</p>';

    // ── Cómo se cobra ──
    const M = { efectivo: ['Efectivo', '#C98A12'], tarjeta: ['Tarjeta', '#2F6A9E'], stripe: ['Online', '#3F7A3A'], invitacion: ['Invitación', '#A89A9D'], mixto: ['Last App', '#7A6A6D'] };
    const filasM = Object.entries(metodos).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
    const sumM = filasM.reduce((s, [, v]) => s + v, 0);
    let acc = 0;
    const arcos = filasM.map(([m, v]) => { const ini = acc / sumM, fin = (acc += v) / sumM; const a0 = 2 * Math.PI * ini - Math.PI / 2, a1 = 2 * Math.PI * fin - Math.PI / 2;
      const g = fin - ini > .5 ? 1 : 0; const r = 42, cx = 50, cy = 50;
      return fin - ini >= .999 ? `<circle cx="50" cy="50" r="42" fill="none" stroke="${(M[m] || ['', '#999'])[1]}" stroke-width="14"/>`
        : `<path d="M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 ${g} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}" fill="none" stroke="${(M[m] || ['', '#999'])[1]}" stroke-width="14"/>`; }).join('');
    $('#pn-cobro').innerHTML = sumM ? `<svg viewBox="0 0 100 100" class="donut">${arcos}<text x="50" y="47" text-anchor="middle">${eurK(sumM)}</text><text x="50" y="60" text-anchor="middle" class="sub">cobrado</text></svg>
      <ul class="leyenda">${filasM.map(([m, v]) => `<li><i style="background:${(M[m] || ['', '#999'])[1]}"></i>${(M[m] || [m])[0]}<b>${euros(v)}</b><span>${Math.round(v * 100 / sumM)} %</span></li>`).join('')}
      ${dVentas ? `<li><i style="background:#06C167"></i>Uber Eats<b>${euros(dPlat.uber.ventas)}</b><span>${dPlat.uber.pedidos} ped.</span></li><li><i style="background:#FFC244"></i>Glovo<b>${euros(dPlat.glovo.ventas)}</b><span>${dPlat.glovo.pedidos} ped.</span></li>` : ''}</ul>`
      : '<p class="nota">Aún no hay cobros en este periodo.</p>';

    // ── Por local ──
    const locs = Object.entries(porLocal).filter(([, L]) => L.ventas || L.delivery).sort((a, b) => (b[1].ventas + b[1].delivery) - (a[1].ventas + a[1].delivery));
    const maxL = Math.max(1, ...locs.map(([, L]) => L.ventas + L.delivery));
    $('#pn-locales').innerHTML = locs.map(([id, L]) => { const f = pct(L.gasto, L.base); const nv = !L.base ? '' : f < 28 ? 'bien' : f < 33 ? 'ojo' : 'mal';
      return `<div class="pl"><div class="pl-cab"><b>${esc(nombreLocal(id))}</b><span>${euros(L.ventas + L.delivery)}</span></div>
        <div class="pl-barra"><i style="width:${L.ventas * 100 / maxL}%"></i><i class="d" style="width:${L.delivery * 100 / maxL}%"></i></div>
        <div class="pl-datos"><span>Sala y web <b>${euros(L.ventas)}</b></span><span>Delivery <b>${euros(L.delivery)}</b></span>
        <span>Gasto producto <b class="${nv}">${L.base ? String(f).replace('.', ',') + ' %' : '—'}</b></span><span>Tickets <b>${L.tickets}</b></span></div>
        ${L.imp ? '<small class="nota">Incluye ventas importadas de Last App (sin detalle de productos).</small>' : ''}</div>`; }).join('')
      || '<p class="nota">Sin ventas en este periodo.</p>';

    // ── Lo más vendido ──
    const top = [...prods.values()].sort((a, b) => b.ventas - a.ventas).slice(0, 10);
    const maxP = Math.max(1, ...top.map(p => p.ventas));
    $('#pn-top').innerHTML = top.length ? `<thead><tr><th>Producto</th><th class="num">Uds.</th><th class="num">Ventas</th><th class="num">Coste</th><th class="num">Margen</th><th style="width:28%"></th></tr></thead><tbody>` +
      top.map(p => { const m = p.ventas - p.gasto; const mp = pct(m, p.ventas);
        return `<tr><td><b>${esc(p.nombre)}</b>${p.conCoste ? '' : ' <span class="tag gris">sin escandallo</span>'}</td><td class="num">${p.uds}</td><td class="num">${euros(p.ventas)}</td>
          <td class="num">${p.conCoste ? euros(p.gasto) : '—'}</td><td class="num">${p.conCoste ? `<span class="tag ${mp >= 70 ? 'verde' : mp >= 62 ? '' : 'rojo'}">${String(mp).replace('.', ',')} %</span>` : '—'}</td>
          <td><div class="mini-barra"><i style="width:${p.ventas * 100 / maxP}%"></i></div></td></tr>`; }).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Todavía no hay productos vendidos en este periodo.</td></tr></tbody>';
    $('#pn-sincoste').hidden = !sinCoste;
    $('#pn-sincoste').innerHTML = `Hay <b>${euros(sinCoste)}</b> vendidos en productos sin coste (bebidas, postres, combos…). Pónselo en <a href="#carta">Carta y productos</a> y el gasto saldrá completo.`;

    // ── Delivery: resumen del agente ──
    const ultimo = resumenes[0] ? resumenes[0].fecha : null;
    const delDia = resumenes.filter(r => r.fecha === ultimo).sort((a, b) => (a.local === 'general' ? -1 : 0) - (b.local === 'general' ? -1 : 0));
    $('#pn-agente').innerHTML = delDia.length ? `<p class="nota" style="margin-top:0">${new Date(ultimo + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>` +
      delDia.map(r => `<div class="ag"><b>${r.local === 'general' ? 'General' : esc(nombreLocal(r.local))}</b><p>${esc(r.texto)}</p>
        ${(r.alertas || []).map(a => `<span class="tag ${a.nivel === 'alta' ? 'rojo' : a.nivel === 'media' ? '' : 'gris'}">${esc(a.texto)}</span>`).join('')}</div>`).join('')
      : '<p class="nota">Cuando el agente de delivery vuelque el día, aquí verás su resumen: cómo ha ido en Uber y Glovo, por local y en general.</p>';
  }

  document.querySelectorAll('[data-prng]').forEach(b => b.onclick = () => { rango = b.dataset.prng; cargar(); });
  window.ADMIN = window.ADMIN || {};
  window.ADMIN.panel = { todos: true, async init(l, locales) { LOCAL = l; LOCALES = locales || []; await cargar(); }, mostrar: cargar };
})();
