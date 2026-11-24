/* ÓRALE PADRE · admin · Ventas y facturas */
(function () {
  'use strict';
  const { api, euros } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = d => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  let LOCAL, tickets = [], rango = 'hoy';
  const PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', stripe: 'Online', invitacion: 'Invitación' };

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
    const [ts, ps, cs] = await Promise.all([
      api.ticketsEntre(LOCAL, desde.toISOString(), hasta.toISOString()),
      api.pedidosEntre(LOCAL, desde.toISOString(), hasta.toISOString()),
      api.cuentasEntre(LOCAL, desde.toISOString(), hasta.toISOString()),
    ]);
    tickets = ts.slice().sort((a, b) => a.numero - b.numero);
    pintaKpis(); pintaHoras(); pintaTop(); pintaFacturas(); pintaAnul(ps, cs);
  }

  function pintaKpis() {
    const suma = f => tickets.filter(f).reduce((s, t) => s + t.total, 0);
    const total = suma(() => true); const n = tickets.length;
    const iva = {}; tickets.forEach(t => t.desglose_iva.forEach(d => { iva[d.tipo] = iva[d.tipo] || { base: 0, cuota: 0 }; iva[d.tipo].base += d.base; iva[d.tipo].cuota += d.cuota; }));
    const base = Object.values(iva).reduce((s, x) => s + x.base, 0), cuota = Object.values(iva).reduce((s, x) => s + x.cuota, 0);
    const k = (t, v, sub) => `<div class="kpi"><small>${t}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    $('#r-kpis').innerHTML =
      k('Ventas (IVA incl.)', euros(total), `${n} tickets`) +
      k('Ticket medio', n ? euros(Math.round(total / n)) : '—') +
      k('Base imponible', euros(base), Object.keys(iva).map(t => `${t}%: ${euros(iva[t].base)}`).join(' · ')) +
      k('IVA', euros(cuota), Object.keys(iva).map(t => `${t}%: ${euros(iva[t].cuota)}`).join(' · ')) +
      k('Efectivo', euros(suma(t => t.metodo === 'efectivo'))) +
      k('Tarjeta', euros(suma(t => t.metodo === 'tarjeta' || t.metodo === 'stripe'))) +
      k('Descuentos', euros(tickets.reduce((s, t) => s + (t.descuento || 0), 0)), `${tickets.filter(t => t.descuento).length} tickets con promo · ${tickets.filter(t => t.metodo === 'invitacion').length} invitaciones`) +
      k('Sala', euros(suma(t => t.cuenta_id)), 'TPV') +
      k('Web', euros(suma(t => t.pedido_id)), 'Para recoger');
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
    const m = new Map();
    tickets.forEach(t => t.lineas.forEach(l => { const x = m.get(l.nombre) || { u: 0, imp: 0 }; x.u += l.cantidad; x.imp += l.unitario * l.cantidad; m.set(l.nombre, x); }));
    const top = [...m.entries()].sort((a, b) => b[1].imp - a[1].imp).slice(0, 10);
    $('#r-top').innerHTML = top.length ? `<thead><tr><th>Producto</th><th class="num">Uds.</th><th class="num">Importe</th></tr></thead><tbody>` +
      top.map(([n, x]) => `<tr><td>${esc(n)}</td><td class="num">${x.u}</td><td class="num">${euros(x.imp)}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin ventas en este periodo.</td></tr></tbody>';
  }

  function pintaFacturas() {
    const filas = tickets.slice().reverse();
    $('#r-facturas').innerHTML = filas.length ? `<thead><tr><th>Número</th><th>Fecha</th><th>Origen</th><th>Pago</th><th>Promo</th><th class="num">Base</th><th class="num">IVA</th><th class="num">Total</th><th></th></tr></thead><tbody>` +
      filas.slice(0, 300).map(t => {
        const base = t.desglose_iva.reduce((s, d) => s + d.base, 0), cuota = t.desglose_iva.reduce((s, d) => s + d.cuota, 0);
        return `<tr><td><b>${esc(t.serie)}-${String(t.numero).padStart(6, '0')}</b></td><td>${fecha(t.fecha)}</td>
          <td>${t.cuenta_id ? 'Sala' : 'Web'}</td><td>${PAGO[t.metodo] || t.metodo}</td>
          <td>${t.promocion ? `<span class="tag">${esc(t.promocion.codigo)}</span>${t.promocion.nota ? `<small>${esc(t.promocion.nota)}</small>` : ''}` : ''}${t.descuento ? `<small>−${euros(t.descuento)}</small>` : ''}</td>
          <td class="num">${euros(base)}</td><td class="num">${euros(cuota)}</td><td class="num"><b>${euros(t.total)}</b></td>
          <td><button class="b b-mini" type="button" data-ver="${t.id}">Ticket</button></td></tr>`;
      }).join('') + '</tbody>' + (filas.length > 300 ? `<tfoot><tr><td colspan="9" class="nota">Mostrando 300 de ${filas.length}. El CSV las lleva todas.</td></tr></tfoot>` : '')
      : '<tbody><tr><td class="nota">No hay facturas en este periodo.</td></tr></tbody>';
  }

  function pintaAnul(ps, cs) {
    const filas = cs.filter(c => c.estado === 'anulada').map(c => ({ f: c.cerrada || c.abierta, que: 'Cuenta anulada · ' + c.nombre, imp: null, motivo: c.motivo_anulacion }))
      .concat(ps.filter(p => p.estado === 'cancelado').map(p => ({ f: p.creado, que: `Comanda #${p.numero} · ${p.canal === 'sala' ? p.mesa : 'Web · ' + p.cliente_nombre}`, imp: p.total, motivo: p.motivo_cancel })))
      .sort((a, b) => new Date(b.f) - new Date(a.f));
    $('#r-anul').innerHTML = filas.length ? `<thead><tr><th>Fecha</th><th>Qué</th><th class="num">Importe</th><th>Motivo</th></tr></thead><tbody>` +
      filas.map(x => `<tr><td>${fecha(x.f)}</td><td>${esc(x.que)}</td><td class="num">${x.imp != null ? euros(x.imp) : '—'}</td><td>${esc(x.motivo || '')}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Ninguna en este periodo.</td></tr></tbody>';
  }

  // CSV para la gestoría: separador ; y coma decimal para que Excel en español lo abra bien.
  function csv() {
    const n = c => (c / 100).toFixed(2).replace('.', ',');
    const tipos = [...new Set(tickets.flatMap(t => t.desglose_iva.map(d => d.tipo)))].sort((a, b) => a - b);
    const cab = ['Serie', 'Número', 'Fecha', 'Hora', ...tipos.flatMap(t => [`Base ${t}%`, `IVA ${t}%`]), 'Total', 'Descuento', 'Promoción', 'Forma de pago', 'Origen', 'NIF emisor', 'Huella'];
    const filas = tickets.map(t => {
      const d = new Date(t.fecha);
      const f = d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }), h = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
      return [t.serie, t.numero, f, h, ...tipos.flatMap(tp => { const x = t.desglose_iva.find(z => z.tipo === tp); return x ? [n(x.base), n(x.cuota)] : ['0,00', '0,00']; }),
        n(t.total), n(t.descuento || 0), t.promocion ? t.promocion.codigo + (t.promocion.nota ? ' (' + t.promocion.nota + ')' : '') : '',
        PAGO[t.metodo] || t.metodo, t.cuenta_id ? 'Sala' : 'Web', (t.emisor || {}).cif || '', t.hash];
    });
    const txt = '﻿' + [cab, ...filas].map(r => r.map(v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `facturas-${LOCAL}-${$('#r-desde').value}_a_${$('#r-hasta').value}.csv`;
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
    $('#r-csv').onclick = () => { if (!tickets.length) { alert('No hay facturas en este periodo.'); return; } csv(); };
    $('#r-facturas').addEventListener('click', e => { const b = e.target.closest('[data-ver]'); if (b) OP.imprimir(OP.ticketFactura(tickets.find(t => t.id === b.dataset.ver))); });
  }

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.resumen = {
    async init(local) { LOCAL = local; enganchar(); marca(rango); await cargar(...calcRango(rango)); },
    async mostrar() { if (rango) await cargar(...calcRango(rango)); },
  };
})();
