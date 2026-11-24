/* ÓRALE PADRE · admin · Reservas del día */
(function () {
  'use strict';
  const { api, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  const ESTADOS = { pendiente: 'Pendiente', confirmada: 'Confirmada', sentada: 'Sentada', no_show: 'No vino', cancelada: 'Cancelada' };
  const COLOR = { pendiente: '', confirmada: 'verde', sentada: 'verde', no_show: 'rojo', cancelada: 'gris' };
  let LOCAL, lista = [], mesas = [], dia = iso(new Date()), local = null, horasDia = [];
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  async function cargar() {
    $('#rv-dia').value = dia;
    const d = new Date(dia + 'T00:00'), h = new Date(d); h.setDate(h.getDate() + 1);
    [lista, mesas, local, horasDia] = await Promise.all([api.reservasEntre(LOCAL, d.toISOString(), h.toISOString()), mesas.length ? mesas : api.mesas(LOCAL),
      api.local(LOCAL), api.horasReserva ? api.horasReserva(LOCAL, dia, 1).catch(() => []) : []]);
    lista.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    pinta(); pintaOcupacion();
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
        <td>${esc(r.notas || '')}${r.notas_internas ? `<small>📝 ${esc(r.notas_internas)}</small>` : ''}</td>
        <td><select data-mesa="${r.id}" aria-label="Mesa">${opMesas(r.mesa_id)}</select></td>
        <td><span class="tag ${COLOR[r.estado]}">${ESTADOS[r.estado]}</span></td>
        <td style="white-space:nowrap">${r.estado === 'pendiente' ? `<button class="b b-mini b-ok" type="button" data-est="confirmada" data-id="${r.id}">Confirmar</button> ` : ''}${r.estado === 'confirmada' || r.estado === 'pendiente' ? `<button class="b b-mini" type="button" data-editar="${r.id}">Editar</button> ` : ''}${r.estado === 'confirmada' || r.estado === 'pendiente'
          ? `<button class="b b-mini" type="button" data-est="sentada" data-id="${r.id}">Sentar</button> <button class="b b-mini" type="button" data-est="no_show" data-id="${r.id}">No vino</button> <button class="b b-mini b-mal" type="button" data-est="cancelada" data-id="${r.id}">Cancelar</button>`
          : `<button class="b b-mini" type="button" data-est="confirmada" data-id="${r.id}">Deshacer</button>`}</td></tr>`).join('')
       || '<tr><td colspan="8" class="nota">No hay reservas este día.</td></tr>') + '</tbody>';
  }
  $('#rv-lista').addEventListener('click', async e => {
    const ed = e.target.closest('[data-editar]');
    if (ed) {
      const r = lista.find(x => x.id === ed.dataset.editar); const hh = new Date(r.fecha).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
      const hora = prompt('Hora (HH:MM)', hh); if (hora === null) return;
      if (!/^\d{1,2}:\d{2}$/.test(hora.trim())) return alert('Escribe la hora así: 21:30');
      const pers = prompt('Personas', r.personas); if (pers === null) return;
      const nota = prompt('Nota interna (sólo la ve el equipo)', r.notas_internas || ''); if (nota === null) return;
      const [H, M] = hora.trim().split(':');
      try { await api.actualizarReserva(r.id, { fecha: new Date(`${iso(new Date(r.fecha))}T${H.padStart(2, '0')}:${M}:00`).toISOString(), personas: Math.max(1, +pers || r.personas), notas_internas: nota.trim() || null }); await cargar(); }
      catch (ex) { alert(mensajeError(ex)); }
      return;
    }
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

  /* ── Ocupación por horas ── */
  function pintaOcupacion() {
    const c = (local && local.reservas_config) || {}; const dur = (c.duracion || 90) * 60000; const aforo = (local && local.reservas_aforo) || 40;
    const vivas = lista.filter(r => ['pendiente', 'confirmada', 'sentada'].includes(r.estado));
    // Horas: las ofrecidas ese día + las de las reservas que ya hay.
    const ts = new Set(horasDia.map(x => new Date(x.fecha).getTime())); vivas.forEach(r => ts.add(new Date(r.fecha).getTime()));
    const horas = [...ts].sort((a, b) => a - b);
    if (!horas.length) { $('#rv-ocup').innerHTML = '<p class="nota">Este día no hay reservas online ni reservas apuntadas.</p>'; return; }
    $('#rv-ocup').innerHTML = horas.map(t => { const n = vivas.filter(r => Math.abs(new Date(r.fecha).getTime() - t) < dur).reduce((s, r) => s + r.personas, 0);
      return `<div class="f ${n >= aforo ? 'lleno' : ''}" title="${n} de ${aforo} comensales"><b>${n || ''}</b><span style="height:${Math.min(100, n * 100 / aforo)}%"></span><small>${new Date(t).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}</small></div>`; }).join('');
  }

  /* ── Ajustes y días especiales ── */
  const aTxt = fr => (fr || []).map(([a, b]) => `${a}-${b}`).join(', ');
  const deTxt = t => { t = (t || '').trim(); if (!t) return null; if (/^cerrad/i.test(t)) return []; const out = t.split(',').map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/); if (!m) throw new Error('DATOS: revisa las franjas "' + x + '" (así: 13:30-16:00)'); return [`${m[1].padStart(2, '0')}:${m[2]}`, `${m[3].padStart(2, '0')}:${m[4]}`]; }); return out; };
  function pintaAjustes() {
    const c = local.reservas_config || {};
    $('#rv-turnos').innerHTML = DIAS.map((d, i) => { const t = (c.turnos || {})[i + 1];
      return `<label>${d}<input data-turno="${i + 1}" value="${t ? (t.length ? aTxt(t) : 'cerrado') : ''}" placeholder="Horario del local: ${esc(aTxt((local.horario || {})[i + 1]) || 'cerrado')}"></label>`; }).join('');
    $('#rc-intervalo').value = String(c.intervalo || 15); $('#rc-duracion').value = c.duracion || 90; $('#rc-aforo').value = local.reservas_aforo || 40;
    $('#rc-maxfranja').value = c.max_reservas_franja || ''; $('#rc-maxp').value = local.reservas_max_personas || 10; $('#rc-grupos').value = c.grupos || 'llamar';
    $('#rc-antelacion').value = c.antelacion ?? 60; $('#rc-vista').value = c.dias_vista || 60; $('#rc-cancelar').value = c.cancelar_hasta ?? 60;
    $('#rc-recordatorio').checked = c.recordatorio !== false;
  }
  async function pintaEspeciales() {
    let es = []; try { es = await api.diasEspeciales(LOCAL); } catch (e) {}
    $('#rv-especiales').innerHTML = es.length ? '<thead><tr><th>Día</th><th>Qué</th><th>Nota</th><th></th></tr></thead><tbody>' + es.map(x => `<tr><td><b>${new Date(x.fecha + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</b></td>
      <td>${x.cerrado ? '<span class="tag rojo">Cerrado</span>' : (x.turnos ? 'Franjas: ' + esc(aTxt(x.turnos)) : 'Horario normal') + (x.aforo ? ` · aforo ${x.aforo}` : '')}</td><td>${esc(x.nota || '')}</td>
      <td><button class="b b-mini b-mal" type="button" data-borra-esp="${x.fecha}">Quitar</button></td></tr>`).join('') + '</tbody>' : '<tbody><tr><td class="nota">Ninguno.</td></tr></tbody>';
  }
  $('#rc-guardar').onclick = async () => {
    const err = t => { $('#rc-error').textContent = t; $('#rc-error').hidden = false; }; $('#rc-error').hidden = true;
    try {
      const turnos = {}; document.querySelectorAll('[data-turno]').forEach(i => { const t = deTxt(i.value); if (t) turnos[i.dataset.turno] = t; });
      const n = id => { const v = $(id).value.trim(); return v === '' ? null : Math.max(0, parseInt(v, 10)); };
      const cfg = { ...(local.reservas_config || {}), turnos, intervalo: +$('#rc-intervalo').value, duracion: n('#rc-duracion') || 90, antelacion: n('#rc-antelacion') ?? 60,
        dias_vista: n('#rc-vista') || 60, cancelar_hasta: n('#rc-cancelar') ?? 60, grupos: $('#rc-grupos').value, recordatorio: $('#rc-recordatorio').checked,
        max_reservas_franja: n('#rc-maxfranja') || null };
      await api.guardarConfigReservas(LOCAL, cfg, n('#rc-aforo') || 40, n('#rc-maxp') || 10);
      $('#rc-guardar').textContent = '✓ Guardado'; setTimeout(() => { $('#rc-guardar').textContent = 'Guardar ajustes'; }, 1800);
      await cargar(); pintaAjustes();
    } catch (ex) { err(mensajeError(ex)); }
  };
  $('#re-guardar').onclick = async () => {
    try {
      if (!$('#re-fecha').value) return alert('Elige el día.');
      await api.guardarDiaEspecial(LOCAL, { fecha: $('#re-fecha').value, cerrado: $('#re-cerrado').checked, turnos: deTxt($('#re-turnos').value),
        aforo: parseInt($('#re-aforo').value, 10) || null, nota: $('#re-nota').value.trim() });
      ['#re-fecha', '#re-turnos', '#re-aforo', '#re-nota'].forEach(s => { $(s).value = ''; }); $('#re-cerrado').checked = false;
      await pintaEspeciales();
    } catch (ex) { alert(mensajeError(ex)); }
  };
  $('#rv-especiales').addEventListener('click', async e => { const b = e.target.closest('[data-borra-esp]'); if (!b) return;
    try { await api.guardarDiaEspecial(LOCAL, { fecha: b.dataset.borraEsp, borrar: true }); await pintaEspeciales(); } catch (ex) { alert(mensajeError(ex)); } });

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.reservas = { async init(l) { LOCAL = l; await cargar(); pintaAjustes(); pintaEspeciales(); }, mostrar: cargar };
})();
