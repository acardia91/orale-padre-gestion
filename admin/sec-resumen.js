/* ÓRALE PADRE · admin · Ventas y facturas
   Vista de un local o de todo el negocio (LOCAL = '*'). Junta los tickets
   propios con las ventas importadas de Last App (sólo para informes). */
(function () {
  'use strict';
  const { api, euros } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = d => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  let LOCAL, LOCALES = [], tickets = [], prodImp = [], rango = 'mes';
  const PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', stripe: 'Online', invitacion: 'Invitación', mixto: 'Mixto' };
  const nombreLocal = id => ((LOCALES.find(l => l.id === id) || {}).nombre || id).replace(/^Órale Padre\s*/, '');
  const propio = t => t.origen !== 'lastapp';

  function calcRango(r) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const d = new Date(hoy), h = new Date(hoy); h.setDate(h.getDate() + 1);
    if (r === 'ayer') { d.setDate(d.getDate() - 1); h.setDate(h.getDate() - 1); }
    if (r === '7') d.setDate(d.getDate() - 6);
    if (r === 'mes') d.setDate(1);
    if (r === 'trim') { d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); }
    return [d, h];
  }
  function marca(r) { document.querySelectorAll('[data-rango]').forEach(b => b.classList.toggle('b-ok', b.dataset.rango === r)); }

  async function cargar(desde, hasta) {
    $('#r-desde').value = iso(desde); const ult = new Date(hasta); ult.setDate(ult.getDate() - 1); $('#r-hasta').value = iso(ult);
    const ids = LOCAL === '*' ? LOCALES.map(l => l.id) : [LOCAL];
    const d = desde.toISOString(), h = hasta.toISOString();
    const res = await Promise.all(ids.map(async id => {
      const [ts, ps, cs, imp, pimp] = await Promise.all([
        api.ticketsEntre(id, d, h), api.pedidosEntre(id, d, h), api.cuentasEntre(id, d, h),
        api.ventasImportadasEntre ? api.ventasImportadasEntre(id, d, h) : [], api.productosImportados ? api.productosImportados(id, d, h) : []]);
      const importadas = imp.filter(v => v.estado === 'pagada').map(v => ({
        id: 'imp-' + v.id, local: id, origen: 'lastapp', serie: 'Last App', numero: v.referencia, fecha: v.fecha, total: v.total,
        desglose_iva: [{ tipo: 10, base: v.base, cuota: v.cuota }], metodo: v.metodo || 'mixto', lineas: [], descuento: 0 }));
      return { ts: ts.map(t => ({ ...t, local: id })).concat(importadas), ps, cs, pimp };
    }));
    tickets = res.flatMap(r => r.ts).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    prodImp = res.flatMap(r => r.pimp);
    pintaKpis(); pintaLocales(); pintaHoras(); pintaTop(); pintaFacturas(); pintaAnul(res.flatMap(r => r.ps), res.flatMap(r => r.cs));
  }

  function pintaKpis() {
    const suma = f => tickets.filter(f).reduce((s, t) => s + t.total, 0);
    const total = suma(() => true); const n = tickets.length;
    const iva = {}; tickets.forEach(t => t.desglose_iva.forEach(d => { iva[d.tipo] = iva[d.tipo] || { base: 0, cuota: 0 }; iva[d.tipo].base += d.base; iva[d.tipo].cuota += d.cuota; }));
    const base = Object.values(iva).reduce((s, x) => s + x.base, 0), cuota = Object.values(iva).reduce((s, x) => s + x.cuota, 0);
    const hayImp = tickets.some(t => !propio(t));
    const k = (t, v, sub) => `<div class="kpi"><small>${t}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    $('#r-kpis').innerHTML =
      k('Ventas (IVA incl.)', euros(total), `${n} cuentas cobradas`) +
      k('Ticket medio', n ? euros(Math.round(total / n)) : '—') +
      k('Base imponible', euros(base), (hayImp ? 'Last App: IVA estimado al 10% · ' : '') + Object.keys(iva).map(t => `${t}%: ${euros(iva[t].base)}`).join(' · ')) +
      k('IVA', euros(cuota), Object.keys(iva).map(t => `${t}%: ${euros(iva[t].cuota)}`).join(' · ')) +
      k('Efectivo', euros(suma(t => t.metodo === 'efectivo'))) +
      k('Tarjeta', euros(suma(t => t.metodo === 'tarjeta' || t.metodo === 'stripe')), suma(t => t.metodo === 'mixto') ? `Pagos mixtos: ${euros(suma(t => t.metodo === 'mixto'))}` : '') +
      k('Descuentos', euros(tickets.reduce((s, t) => s + (t.descuento || 0), 0)), `${tickets.filter(t => t.descuento).length} con promo · ${tickets.filter(t => t.metodo === 'invitacion').length} invitaciones`) +
      k('TPV propio', euros(suma(t => propio(t))), `Sala ${euros(suma(t => propio(t) && t.cuenta_id))} · Web ${euros(suma(t => t.pedido_id))}`) +
      (hayImp ? k('Last App (importado)', euros(suma(t => !propio(t))), `${tickets.filter(t => !propio(t)).length} cuentas`) : '');
  }

  function pintaLocales() {
    const panel = $('#r-locales-panel'); panel.hidden = LOCAL !== '*';
    if (LOCAL !== '*') return;
    const filas = LOCALES.map(l => {
      const ts = tickets.filter(t => t.local === l.id); const tot = ts.reduce((s, t) => s + t.total, 0);
      return { l, n: ts.length, tot, imp: ts.filter(t => !propio(t)).reduce((s, t) => s + t.total, 0) };
    }).sort((a, b) => b.tot - a.tot);
    const max = Math.max(1, ...filas.map(f => f.tot));
    $('#r-locales').innerHTML = `<thead><tr><th>Local</th><th class="num">Cuentas</th><th class="num">Ventas</th><th class="num">Ticket medio</th><th>Origen</th><th style="width:30%"></th></tr></thead><tbody>` +
      filas.map(f => `<tr><td><b>${esc(nombreLocal(f.l.id))}</b></td><td class="num">${f.n}</td><td class="num"><b>${euros(f.tot)}</b></td>
        <td class="num">${f.n ? euros(Math.round(f.tot / f.n)) : '—'}</td>
        <td>${f.imp ? `<span class="tag">Last App ${euros(f.imp)}</span>` : ''}${f.tot - f.imp ? `<span class="tag verde">TPV ${euros(f.tot - f.imp)}</span>` : ''}${!f.tot ? '—' : ''}</td>
        <td><div class="barra-h"><span style="width:${f.tot / max * 100}%"></span></div></td></tr>`).join('') + '</tbody>';
  }

  function pintaHoras() {
    const h = Array(24).fill(0); tickets.forEach(t => { h[+new Date(t.fecha).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' })] += t.total; });
    const desde = h.findIndex(v => v > 0), hasta = 23 - [...h].reverse().findIndex(v => v > 0);
    if (desde < 0) { $('#r-horas').innerHTML = '<p class="nota">Sin ventas en este periodo.</p>'; return; }
    const max = Math.max(...h); const ini = Math.min(desde, 12), fin = Math.max(hasta, 23);
    $('#r-horas').innerHTML = h.slice(ini, fin + 1).map((v, i) => `<div class="barra" title="${ini + i}:00 · ${euros(v)}">
      <span style="height:${max ? Math.max(v ? 3 : 0, v / max * 100) : 0}%"></span><small>${ini + i}</small></div>`).join('');
  }

  function pintaTop() {
    const m = new Map(); const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^burro\s+/, '').trim();
    const suma = (nombre, u, imp) => { const k = norm(nombre); const x = m.get(k) || { nombre, u: 0, imp: 0 }; x.u += u; x.imp += imp; m.set(k, x); };
    tickets.forEach(t => t.lineas.forEach(l => suma(l.nombre, l.cantidad, l.unitario * l.cantidad)));
    prodImp.forEach(p => suma(p.producto, p.unidades, p.importe));
    const top = [...m.values()].sort((a, b) => b.imp - a.imp).slice(0, 12);
    $('#r-top').innerHTML = top.length ? `<thead><tr><th>Producto</th><th class="num">Uds.</th><th class="num">Importe</th></tr></thead><tbody>` +
      top.map(x => `<tr><td>${esc(x.nombre)}</td><td class="num">${x.u}</td><td class="num">${euros(x.imp)}</td></tr>`).join('') + '</tbody>' +
      (prodImp.length ? `<tfoot><tr><td colspan="3" class="nota">Incluye productos de Last App del periodo importado (${[...new Set(prodImp.map(p => p.desde + ' → ' + p.hasta))].join(', ')}).</td></tr></tfoot>` : '')
      : '<tbody><tr><td class="nota">Sin ventas en este periodo.</td></tr></tbody>';
  }

  function pintaFacturas() {
    const filas = tickets.slice().reverse(); const varios = LOCAL === '*';
    $('#r-facturas').innerHTML = filas.length ? `<thead><tr><th>Número</th>${varios ? '<th>Local</th>' : ''}<th>Fecha</th><th>Origen</th><th>Pago</th><th>Promo</th><th class="num">Base</th><th class="num">IVA</th><th class="num">Total</th><th></th></tr></thead><tbody>` +
      filas.slice(0, 300).map(t => {
        const base = t.desglose_iva.reduce((s, d) => s + d.base, 0), cuota = t.desglose_iva.reduce((s, d) => s + d.cuota, 0);
        const imp = !propio(t);
        return `<tr><td><b>${imp ? esc(t.numero) : esc(t.serie) + '-' + String(t.numero).padStart(6, '0')}</b>${imp ? '<small>Cuenta Last App</small>' : ''}</td>
          ${varios ? `<td>${esc(nombreLocal(t.local))}</td>` : ''}<td>${fecha(t.fecha)}</td>
          <td>${imp ? '<span class="tag">Last App</span>' : t.cuenta_id ? 'Sala' : 'Web'}</td><td>${PAGO[t.metodo] || t.metodo}</td>
          <td>${t.promocion ? `<span class="tag">${esc(t.promocion.codigo)}</span>${t.promocion.nota ? `<small>${esc(t.promocion.nota)}</small>` : ''}` : ''}${t.descuento ? `<small>−${euros(t.descuento)}</small>` : ''}</td>
          <td class="num">${euros(base)}${imp ? '<small>estimada</small>' : ''}</td><td class="num">${euros(cuota)}</td><td class="num"><b>${euros(t.total)}</b></td>
          <td>${imp ? '' : `<button class="b b-mini" type="button" data-ver="${t.id}">Ticket</button>`}</td></tr>`;
      }).join('') + '</tbody>' + (filas.length > 300 ? `<tfoot><tr><td colspan="10" class="nota">Mostrando 300 de ${filas.length}. El CSV lleva todas las propias.</td></tr></tfoot>` : '')
      : '<tbody><tr><td class="nota">No hay ventas en este periodo.</td></tr></tbody>';
  }

  function pintaAnul(ps, cs) {
    const filas = cs.filter(c => c.estado === 'anulada').map(c => ({ f: c.cerrada || c.abierta, l: c.local, que: 'Cuenta anulada · ' + c.nombre, imp: null, motivo: c.motivo_anulacion }))
      .concat(ps.filter(p => p.estado === 'cancelado').map(p => ({ f: p.creado, l: p.local, que: `Comanda #${p.numero} · ${p.canal === 'sala' ? p.mesa : 'Web · ' + p.cliente_nombre}`, imp: p.total, motivo: p.motivo_cancel })))
      .sort((a, b) => new Date(b.f) - new Date(a.f));
    $('#r-anul').innerHTML = filas.length ? `<thead><tr><th>Fecha</th>${LOCAL === '*' ? '<th>Local</th>' : ''}<th>Qué</th><th class="num">Importe</th><th>Motivo</th></tr></thead><tbody>` +
      filas.map(x => `<tr><td>${fecha(x.f)}</td>${LOCAL === '*' ? `<td>${esc(nombreLocal(x.l))}</td>` : ''}<td>${esc(x.que)}</td><td class="num">${x.imp != null ? euros(x.imp) : '—'}</td><td>${esc(x.motivo || '')}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Ninguna en este periodo.</td></tr></tbody>';
  }

  // CSV para la gestoría: sólo facturas propias (las de Last App las da Last App).
  function csv() {
    const propias = tickets.filter(propio);
    if (!propias.length) { alert('No hay facturas propias en este periodo. Las ventas de Last App se descargan desde Last App.'); return; }
    const n = c => (c / 100).toFixed(2).replace('.', ',');
    const tipos = [...new Set(propias.flatMap(t => t.desglose_iva.map(d => d.tipo)))].sort((a, b) => a - b);
    const cab = ['Local', 'Serie', 'Número', 'Fecha', 'Hora', ...tipos.flatMap(t => [`Base ${t}%`, `IVA ${t}%`]), 'Total', 'Descuento', 'Promoción', 'Forma de pago', 'Origen', 'NIF emisor', 'Huella'];
    const filas = propias.map(t => {
      const d = new Date(t.fecha);
      const f = d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }), h = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
      return [nombreLocal(t.local), t.serie, t.numero, f, h, ...tipos.flatMap(tp => { const x = t.desglose_iva.find(z => z.tipo === tp); return x ? [n(x.base), n(x.cuota)] : ['0,00', '0,00']; }),
        n(t.total), n(t.descuento || 0), t.promocion ? t.promocion.codigo + (t.promocion.nota ? ' (' + t.promocion.nota + ')' : '') : '',
        PAGO[t.metodo] || t.metodo, t.cuenta_id ? 'Sala' : 'Web', (t.emisor || {}).cif || '', t.hash];
    });
    const txt = '﻿' + [cab, ...filas].map(r => r.map(v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `facturas-${LOCAL === '*' ? 'todos' : LOCAL}-${$('#r-desde').value}_a_${$('#r-hasta').value}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function enganchar() {
    document.querySelectorAll('[data-rango]').forEach(b => b.onclick = () => { rango = b.dataset.rango; marca(rango); cargar(...calcRango(rango)); });
    const manual = () => {
      if (!$('#r-desde').value || !$('#r-hasta').value) return;
      const d = new Date($('#r-desde').value + 'T00:00'), h = new Date($('#r-hasta').value + 'T00:00'); h.setDate(h.getDate() + 1);
      if (h <= d) return; rango = null; marca(null); cargar(d, h);
    };
    $('#r-desde').onchange = manual; $('#r-hasta').onchange = manual;
    $('#r-csv').onclick = csv;
    $('#r-facturas').addEventListener('click', e => { const b = e.target.closest('[data-ver]'); if (b) OP.imprimir(OP.ticketFactura(tickets.find(t => t.id === b.dataset.ver))); });
  }

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.resumen = {
    todos: true,   // esta sección funciona también con "Todos los locales"
    async init(local, locales) { LOCAL = local; LOCALES = locales || []; enganchar(); marca(rango); await cargar(...calcRango(rango)); },
    async mostrar() { if (rango) await cargar(...calcRango(rango)); },
  };
})();
