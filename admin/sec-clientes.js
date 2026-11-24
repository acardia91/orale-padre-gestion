/* ÓRALE PADRE · admin · Clientes (de toda la casa) */
(function () {
  'use strict';
  const { api, euros, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = d => d ? new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  let LOCALES = [], lista = [], actual = null, tBuscar = null;
  const nombreLocal = id => ((LOCALES.find(l => l.id === id) || {}).nombre || id).replace(/^Órale Padre\s*/, '');

  async function cargar() {
    try { lista = await api.listarClientes($('#cl-buscar').value.trim()); }
    catch (ex) { $('#cl-lista').innerHTML = `<tbody><tr><td class="nota">${esc(mensajeError(ex))}</td></tr></tbody>`; return; }
    const k = (t, v, s) => `<div class="kpi"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
    const conPedido = lista.filter(c => c.pedidos > 0);
    $('#cl-kpis').innerHTML = k('Clientes', lista.length) + k('Han pedido', conPedido.length, `${lista.filter(c => c.pedidos > 1).length} repiten`) +
      k('Gasto medio', conPedido.length ? euros(Math.round(conPedido.reduce((s, c) => s + +c.gastado, 0) / conPedido.length)) : '—') +
      k('Con reservas', lista.filter(c => c.reservas > 0).length, `${lista.reduce((s, c) => s + +c.no_shows, 0)} no vinieron`);
    $('#cl-lista').innerHTML = `<thead><tr><th>Cliente</th><th>Teléfono</th><th class="num">Pedidos</th><th class="num">Gastado</th><th class="num">Reservas</th><th>Último</th><th>Locales</th></tr></thead><tbody>` +
      (lista.map(c => `<tr data-pm="${esc(c.telefono)}">
        <td><b>${esc(c.nombre || 'Sin nombre')}</b>${c.email ? `<small>${esc(c.email)}</small>` : ''}${c.notas ? `<small>📝 ${esc(c.notas.slice(0, 60))}</small>` : ''}</td>
        <td>${esc(c.telefono)}</td><td class="num">${c.pedidos}</td><td class="num">${euros(+c.gastado)}</td>
        <td class="num">${c.reservas}${+c.no_shows ? ` <span class="tag rojo">${c.no_shows} no vino</span>` : ''}</td>
        <td>${fecha(c.ultimo)}</td><td>${(c.locales || []).map(l => `<span class="tag">${esc(nombreLocal(l))}</span>`).join('')}</td></tr>`).join('')
       || '<tr><td colspan="7" class="nota">Todavía no hay clientes. Aparecen solos cuando alguien pide por la web o reserva.</td></tr>') + '</tbody>';
  }
  $('#cl-buscar').oninput = () => { clearTimeout(tBuscar); tBuscar = setTimeout(cargar, 300); };
  $('#cl-lista').addEventListener('click', e => { const tr = e.target.closest('[data-pm]'); if (tr) abrir(tr.dataset.pm); });

  const dc = $('#dlg-cliente');
  async function abrir(tel) {
    actual = lista.find(c => c.telefono === tel); if (!actual) return;
    $('#fc-titulo').textContent = actual.nombre || tel;
    $('#fc-notas').value = actual.notas || ''; $('#fc-mkt').checked = !!actual.acepta_marketing;
    const k = (t, v) => `<div class="kpi"><small>${t}</small><b>${v}</b></div>`;
    $('#fc-kpis').innerHTML = k('Teléfono', `<a href="tel:${esc(tel)}" style="font-size:18px">${esc(tel)}</a>`) + k('Pedidos', actual.pedidos) + k('Gastado', euros(+actual.gastado)) + k('Reservas', actual.reservas);
    $('#fc-pedidos').innerHTML = $('#fc-reservas').innerHTML = '<tbody><tr><td class="nota">Cargando…</td></tr></tbody>';
    dc.showModal();
    let h = { pedidos: [], reservas: [] }; try { h = await api.historialCliente(tel) || h; } catch (e) {}
    $('#fc-pedidos').innerHTML = (h.pedidos || []).length ? `<thead><tr><th>Fecha</th><th>Local</th><th>Qué</th><th class="num">Total</th></tr></thead><tbody>` +
      h.pedidos.map(p => `<tr class="${p.estado === 'cancelado' ? 'apagado' : ''}"><td>${fecha(p.creado)}<small>#${p.numero} · ${esc(p.estado)}</small></td><td>${esc(nombreLocal(p.local))}</td>
        <td>${(p.lineas || []).map(l => `${l.cantidad}× ${esc(l.nombre)}`).join('<br>')}</td><td class="num">${euros(p.total)}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin pedidos.</td></tr></tbody>';
    $('#fc-reservas').innerHTML = (h.reservas || []).length ? `<thead><tr><th>Fecha</th><th>Local</th><th class="num">Pers.</th><th>Estado</th></tr></thead><tbody>` +
      h.reservas.map(r => `<tr><td>${fecha(r.fecha)}${r.notas ? `<small>${esc(r.notas)}</small>` : ''}</td><td>${esc(nombreLocal(r.local))}</td><td class="num">${r.personas}</td><td>${esc(r.estado)}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin reservas.</td></tr></tbody>';
  }
  $('#fc-ok').onclick = async () => {
    try { await api.actualizarCliente(actual.telefono, { notas: $('#fc-notas').value.trim() || null, acepta_marketing: $('#fc-mkt').checked }); dc.close(); cargar(); }
    catch (ex) { alert(mensajeError(ex)); }
  };

  $('#cl-csv').onclick = () => {
    if (!lista.length) return;
    const cab = ['Nombre', 'Teléfono', 'Email', 'Acepta comunicaciones', 'Pedidos', 'Gastado', 'Reservas', 'No vino', 'Último', 'Notas'];
    const filas = lista.map(c => [c.nombre || '', c.telefono, c.email || '', c.acepta_marketing ? 'Sí' : 'No', c.pedidos, (+c.gastado / 100).toFixed(2).replace('.', ','),
      c.reservas, c.no_shows, c.ultimo ? new Date(c.ultimo).toLocaleDateString('es-ES') : '', c.notas || '']);
    const txt = '﻿' + [cab, ...filas].map(r => r.map(v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = 'clientes-orale-padre.csv'; document.body.appendChild(a); a.click(); a.remove();
  };

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.clientes = { todos: true, async init(l, locales) { LOCALES = locales || []; await cargar(); }, mostrar: cargar };
})();
