/* ÓRALE PADRE · admin · Reservas del día */
(function () {
  'use strict';
  const { api, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  const ESTADOS = { pendiente: 'Pendiente', confirmada: 'Confirmada', sentada: 'Sentada', no_show: 'No vino', cancelada: 'Cancelada' };
  const COLOR = { pendiente: '', confirmada: 'verde', sentada: 'verde', no_show: 'rojo', cancelada: 'gris' };
  let LOCAL, lista = [], mesas = [], dia = iso(new Date());

  async function cargar() {
    $('#rv-dia').value = dia;
    const d = new Date(dia + 'T00:00'), h = new Date(d); h.setDate(h.getDate() + 1);
    [lista, mesas] = await Promise.all([api.reservasEntre(LOCAL, d.toISOString(), h.toISOString()), mesas.length ? mesas : api.mesas(LOCAL)]);
    lista.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    pinta();
  }
  function pinta() {
    const vivas = lista.filter(r => r.estado !== 'cancelada');
    const k = (t, v, s) => `<div class="kpi"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
    $('#rv-kpis').innerHTML = k('Reservas', vivas.length, new Date(dia + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })) +
      k('Comensales', vivas.reduce((s, r) => s + r.personas, 0)) +
      k('Sentadas', lista.filter(r => r.estado === 'sentada').length) +
      k('No vinieron', lista.filter(r => r.estado === 'no_show').length);
    const opMesas = m => '<option value="">Sin mesa</option>' + mesas.filter(x => x.tipo !== 'deco').map(x => `<option value="${esc(x.id)}" ${x.id === m ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
    $('#rv-lista').innerHTML = `<thead><tr><th>Hora</th><th>Nombre</th><th class="num">Pers.</th><th>Teléfono</th><th>Notas</th><th>Mesa</th><th>Estado</th><th></th></tr></thead><tbody>` +
      (lista.map(r => `<tr class="${r.estado === 'cancelada' ? 'apagado' : ''}">
        <td><b>${new Date(r.fecha).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}</b></td>
        <td><b>${esc(r.nombre)}</b><small>${r.origen === 'web' ? 'Web' : r.origen === 'telefono' ? 'Teléfono' : 'En el local'}${r.email ? ' · ' + esc(r.email) : ''}</small></td>
        <td class="num"><b>${r.personas}</b></td>
        <td><a href="tel:${esc(r.telefono)}">${esc(r.telefono)}</a></td>
        <td>${esc(r.notas || '')}</td>
        <td><select data-mesa="${r.id}" aria-label="Mesa">${opMesas(r.mesa_id)}</select></td>
        <td><span class="tag ${COLOR[r.estado]}">${ESTADOS[r.estado]}</span></td>
        <td style="white-space:nowrap">${r.estado === 'confirmada' || r.estado === 'pendiente'
          ? `<button class="b b-mini" type="button" data-est="sentada" data-id="${r.id}">Sentar</button> <button class="b b-mini" type="button" data-est="no_show" data-id="${r.id}">No vino</button> <button class="b b-mini b-mal" type="button" data-est="cancelada" data-id="${r.id}">Cancelar</button>`
          : `<button class="b b-mini" type="button" data-est="confirmada" data-id="${r.id}">Deshacer</button>`}</td></tr>`).join('')
       || '<tr><td colspan="8" class="nota">No hay reservas este día.</td></tr>') + '</tbody>';
  }
  $('#rv-lista').addEventListener('click', async e => {
    const b = e.target.closest('[data-est]'); if (!b) return;
    if (b.dataset.est === 'cancelada' && !confirm('¿Cancelar esta reserva?')) return;
    try { await api.actualizarReserva(b.dataset.id, { estado: b.dataset.est }); await cargar(); } catch (ex) { alert(mensajeError(ex)); }
  });
  $('#rv-lista').addEventListener('change', async e => {
    const s = e.target.closest('[data-mesa]'); if (!s) return;
    try { await api.actualizarReserva(s.dataset.mesa, { mesa_id: s.value || null }); } catch (ex) { alert(mensajeError(ex)); cargar(); }
  });
  const mueve = n => { const d = new Date(dia + 'T12:00'); d.setDate(d.getDate() + n); dia = iso(d); cargar(); };
  $('#rv-ant').onclick = () => mueve(-1); $('#rv-sig').onclick = () => mueve(1);
  $('#rv-hoy').onclick = () => { dia = iso(new Date()); cargar(); };
  $('#rv-dia').onchange = e => { if (e.target.value) { dia = e.target.value; cargar(); } };

  const dr = $('#dlg-reserva');
  $('#rv-nueva').onclick = () => {
    $('#f-reserva').reset(); $('#fr-dia').value = dia; $('#fr-hora').value = '21:00'; $('#fr-personas').value = 2; $('#fr-error').hidden = true; dr.showModal();
  };
  $('#fr-ok').onclick = async () => {
    const err = t => { $('#fr-error').textContent = t; $('#fr-error').hidden = false; };
    const nombre = $('#fr-nombre').value.trim(), tel = $('#fr-tel').value.trim();
    if (!$('#fr-dia').value || !$('#fr-hora').value) return err('Falta el día o la hora.');
    if (nombre.length < 2) return err('Falta el nombre.');
    if (tel.replace(/[^0-9]/g, '').length < 9) return err('Revisa el teléfono.');
    try {
      await api.crearReserva({ local: LOCAL, fecha: new Date(`${$('#fr-dia').value}T${$('#fr-hora').value}:00`), personas: +$('#fr-personas').value || 2,
        nombre, tel, email: $('#fr-email').value.trim(), notas: $('#fr-notas').value.trim(), origen: $('#fr-origen').value });
      dr.close(); dia = $('#fr-dia').value; cargar();
    } catch (ex) { err(mensajeError(ex)); }
  };

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.reservas = { async init(l) { LOCAL = l; await cargar(); }, mostrar: cargar };
})();
