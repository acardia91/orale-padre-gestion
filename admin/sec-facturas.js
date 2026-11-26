/* ÓRALE PADRE · admin · Facturas con NIF (dentro de "Ventas y facturas")
   Lista las facturas completas del periodo elegido arriba (las del QR del ticket y
   las hechas aquí), las enseña/imprime y deja hacer una nueva desde un nº de ticket.
   Se engancha al módulo "resumen": cuando éste carga, carga también las facturas. */
(function () {
  'use strict';
  const { api, euros, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dia = d => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  let LOCAL, LOCALES = [], lista = [];

  async function cargar() {
    const d = $('#r-desde').value, h = $('#r-hasta').value; if (!d || !h || !api.facturasEntre) return;
    const desde = new Date(d + 'T00:00'), hasta = new Date(h + 'T00:00'); hasta.setDate(hasta.getDate() + 1);
    const ids = LOCAL === '*' ? LOCALES.map(l => l.id) : [LOCAL];
    try { lista = (await Promise.all(ids.map(id => api.facturasEntre(id, desde.toISOString(), hasta.toISOString()).catch(() => [])))).flat()
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))); }
    catch (ex) { $('#fc-tabla').innerHTML = `<tbody><tr><td class="aviso">${esc(mensajeError(ex))}</td></tr></tbody>`; return; }
    pinta();
  }
  function pinta() {
    $('#fc-ver').hidden = true;
    $('#fc-tabla').innerHTML = lista.length ? `<thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>NIF</th><th>Ticket</th><th class="num">Total</th><th>Pedida</th><th></th></tr></thead><tbody>` +
      lista.map((f, i) => `<tr><td><b>${esc(f.numero)}</b></td><td>${dia(f.fecha)}</td><td>${esc(f.cliente && f.cliente.nombre)}</td><td>${esc(f.cliente && f.cliente.nif)}</td>
        <td>${esc(f.ticket)}</td><td class="num">${euros(f.total)}</td><td><span class="tag ${f.pedida_desde === 'qr' ? 'verde' : ''}">${f.pedida_desde === 'qr' ? 'QR' : 'En el local'}</span></td>
        <td><button class="b b-mini" type="button" data-fver="${i}">Ver / imprimir</button></td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Ninguna factura con NIF en este periodo. Los clientes la piden escaneando el QR de su ticket.</td></tr></tbody>';
  }
  $('#fc-tabla').addEventListener('click', e => {
    const b = e.target.closest('[data-fver]'); if (!b) return; const f = lista[+b.dataset.fver];
    const v = $('#fc-ver'); v.hidden = false;
    v.innerHTML = `<div class="botones" style="margin:14px 0 10px"><button class="b b-ok" type="button" id="fc-imp">Imprimir A4 / PDF</button><button class="b" type="button" id="fc-cerrar">Cerrar</button></div>` + OP.facturaHTML(f);
    $('#fc-imp').onclick = () => OP.imprimirFactura(v); $('#fc-cerrar').onclick = () => { v.hidden = true; };
    v.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#fc-csv').onclick = () => {
    if (!lista.length) { alert('No hay facturas con NIF en este periodo.'); return; }
    const n = c => ((c || 0) / 100).toFixed(2).replace('.', ',');
    const filas = [['Factura', 'Fecha', 'Cliente', 'NIF', 'Dirección', 'Ticket sustituido', 'Base 10%', 'IVA 10%', 'Base 21%', 'IVA 21%', 'Total']];
    lista.forEach(f => { const g = t => (f.desglose_iva || []).find(x => +x.tipo === t) || {}; const c = f.cliente || {};
      filas.push([f.numero, new Date(f.fecha).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }), c.nombre, c.nif, [c.direccion, c.cp, c.poblacion].filter(Boolean).join(', '),
        f.ticket, n(g(10).base), n(g(10).cuota), n(g(21).base), n(g(21).cuota), n(f.total)]); });
    const txt = '﻿' + filas.map(r => r.map(v => /[;"\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : (v ?? '')).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `facturas-nif-${LOCAL === '*' ? 'todos' : LOCAL}-${$('#r-desde').value}_a_${$('#r-hasta').value}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // Nueva desde el local
  const dlg = $('#dlg-factura');
  $('#fc-nueva').onclick = () => { dlg.querySelectorAll('input').forEach(i => { i.value = ''; }); $('#fn-error').hidden = true; dlg.showModal(); $('#fn-ticket').focus(); };
  $('#fn-ok').onclick = async () => {
    const fallo = t => { $('#fn-error').textContent = t; $('#fn-error').hidden = false; };
    const m = $('#fn-ticket').value.trim().toUpperCase().match(/^([A-Z]+\d{2})\s*-?\s*0*(\d+)$/);
    if (!m) return fallo('Escribe el nº de ticket como sale impreso, p. ej. TOM26-000123.');
    const d = { nif: $('#fn-nif').value.trim(), nombre: $('#fn-nombre').value.trim(), direccion: $('#fn-dir').value.trim(), cp: $('#fn-cp').value.trim(),
      poblacion: $('#fn-pob').value.trim(), email: $('#fn-email').value.trim() };
    if (!OP.nifValido(d.nif)) return fallo('El NIF/CIF no es válido: revisa letras y números.');
    if (d.nombre.length < 2 || d.direccion.length < 2 || d.cp.length < 4 || d.poblacion.length < 2) return fallo('Faltan datos: nombre, dirección, C. P. y población.');
    const ids = LOCAL === '*' ? LOCALES.map(l => l.id) : [LOCAL];
    try {
      let t = null; for (const id of ids) { t = await api.ticketPorRef(id, m[1], +m[2]); if (t) break; }
      if (!t) return fallo(`No encuentro el ticket ${m[1]}-${m[2].padStart(6, '0')}${LOCAL === '*' ? '' : ' en este local'}.`);
      if (!confirm(`¿Emitir factura del ticket ${m[1]}-${m[2].padStart(6, '0')} (${euros(t.total)}) a ${d.nombre} · ${d.nif.toUpperCase()}?\nUna vez emitida no se puede cambiar.`)) return;
      const f = await api.solicitarFactura(t.id, d);
      dlg.close(); await cargar();
      if (f && f.ya) alert(`Ese ticket ya tenía factura: ${f.numero}. Te la enseño.`);
      const i = lista.findIndex(x => x.numero === (f && f.numero)); if (i >= 0) $(`[data-fver="${i}"]`).click();
    } catch (ex) { fallo(mensajeError(ex)); }
  };

  // Engancharse a "Ventas y facturas": mismo periodo y local.
  const res = window.ADMIN && window.ADMIN.resumen;
  if (res) {
    const ini = res.init, mos = res.mostrar;
    res.init = async (l, ls) => { LOCAL = l; LOCALES = ls || []; await ini.call(res, l, ls); await cargar();
      ['#r-desde', '#r-hasta'].forEach(s => $(s).addEventListener('change', () => setTimeout(cargar, 400)));
      document.querySelectorAll('[data-rango]').forEach(b => b.addEventListener('click', () => setTimeout(cargar, 400))); };
    res.mostrar = async () => { if (mos) await mos.call(res); await cargar(); };
  }
})();
