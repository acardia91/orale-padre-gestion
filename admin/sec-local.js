/* ÓRALE PADRE · admin · Local y horario, Usuarios */
(function () {
  'use strict';
  const { api, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  let LOCAL, local, original = '';

  /* ══ Local y horario ══ */
  function estado() {
    return JSON.stringify({ n: $('#l-nombre').value, t: $('#l-telefono').value, d: $('#l-direccion').value, f: $('#l-fiscal').value,
      p: $('#l-prep').value, a: $('#l-acepta').checked, h: leeHorario(), pl: $('#l-pago-local').checked, po: $('#l-pago-online').checked,
      r: $('#l-reservas').checked, rm: $('#l-res-max').value, ra: $('#l-res-aforo').value });
  }
  async function cargarLocal() {
    local = await api.local(LOCAL);
    $('#l-nombre').value = local.nombre || ''; $('#l-telefono').value = local.telefono || '';
    $('#l-direccion').value = local.direccion || ''; $('#l-fiscal').value = local.direccion_fiscal || '';
    $('#l-prep').value = local.minutos_prep; $('#l-acepta').checked = !!local.acepta_pedidos;
    $('#l-pago-local').checked = local.pago_local !== false; $('#l-pago-online').checked = !!local.pago_online;
    $('#l-reservas').checked = !!local.acepta_reservas; $('#l-res-max').value = local.reservas_max_personas || 10; $('#l-res-aforo').value = local.reservas_aforo || 40;
    $('#l-fiscales').innerHTML = `Facturas a nombre de <b>${esc(local.razon_social || '—')}</b>, NIF <b>${esc(local.cif || '—')}</b>, serie <b>${esc(local.serie || '—')}</b>. Para cambiar la razón social, el NIF o la serie, pídemelo: afecta a la numeración legal de los tickets.`;
    $('#l-horario').innerHTML = `<thead><tr><th>Día</th><th>Turno 1</th><th>Turno 2</th><th></th></tr></thead><tbody>` +
      NOMBRES.map((n, i) => {
        const f = (local.horario || {})[String(i + 1)] || [];
        const t = j => `<input type="time" data-h="${i + 1}-${j}-0" value="${f[j] ? f[j][0] : ''}" aria-label="${n} turno ${j + 1} desde"> – <input type="time" data-h="${i + 1}-${j}-1" value="${f[j] ? f[j][1] : ''}" aria-label="${n} turno ${j + 1} hasta">`;
        return `<tr><th>${n}</th><td>${t(0)}</td><td>${t(1)}</td><td>${i ? `<button class="b b-mini" type="button" data-copia="${i + 1}" title="Copiar el horario del día anterior">= ayer</button>` : ''}</td></tr>`;
      }).join('') + '</tbody>';
    original = estado();
  }
  function leeHorario() {
    const h = {};
    for (let d = 1; d <= 7; d++) {
      const turnos = [];
      for (let j = 0; j < 2; j++) {
        const a = (document.querySelector(`[data-h="${d}-${j}-0"]`) || {}).value, b = (document.querySelector(`[data-h="${d}-${j}-1"]`) || {}).value;
        if (a && b) turnos.push([a, b]);
      }
      h[String(d)] = turnos;
    }
    return h;
  }
  $('#l-horario').addEventListener('click', e => {
    const b = e.target.closest('[data-copia]'); if (!b) return; const d = +b.dataset.copia;
    for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) document.querySelector(`[data-h="${d}-${j}-${k}"]`).value = document.querySelector(`[data-h="${d - 1}-${j}-${k}"]`).value;
  });
  $('#l-guardar').onclick = async () => {
    const err = $('#l-error'); err.hidden = true;
    const h = leeHorario();
    const mal = Object.entries(h).find(([, ts]) => ts.some(([a, b]) => a >= b));
    if (mal) { err.textContent = `Revisa el ${NOMBRES[+mal[0] - 1].toLowerCase()}: la hora de cierre tiene que ser posterior a la de apertura.`; err.hidden = false; return; }
    const btn = $('#l-guardar'); btn.disabled = true;
    try {
      await api.guardarLocal(LOCAL, { nombre: $('#l-nombre').value.trim(), telefono: $('#l-telefono').value.trim(), direccion: $('#l-direccion').value.trim(),
        direccion_fiscal: $('#l-fiscal').value.trim(), minutos_prep: Math.max(5, Math.min(120, +$('#l-prep').value || 20)),
        acepta_pedidos: $('#l-acepta').checked, horario: h, pago_local: $('#l-pago-local').checked, pago_online: $('#l-pago-online').checked,
        acepta_reservas: $('#l-reservas').checked, reservas_max_personas: +$('#l-res-max').value || 10, reservas_aforo: +$('#l-res-aforo').value || 40 });
      await cargarLocal(); btn.textContent = '✓ Guardado'; setTimeout(() => { btn.textContent = 'Guardar'; }, 1500);
    } catch (ex) { err.textContent = mensajeError(ex); err.hidden = false; }
    finally { btn.disabled = false; }
  };

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.local = { async init(l) { LOCAL = l; await cargarLocal(); }, sucio: () => !!original && estado() !== original };

  /* ══ Usuarios ══ */
  const ROLES = { sala: 'Sala (TPV)', cocina: 'Cocina (comandas)', encargado: 'Encargado (todo)' };
  async function cargarUsuarios() {
    const err = $('#u-error'); err.hidden = true;
    let lista = [];
    try { lista = await api.staffDelLocal(LOCAL); } catch (ex) { err.textContent = mensajeError(ex); err.hidden = false; }
    const f = d => d ? new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca';
    $('#u-lista').innerHTML = `<thead><tr><th>Email</th><th>Rol</th><th>Último acceso</th><th></th></tr></thead><tbody>` +
      lista.map(u => `<tr><td><b>${esc(u.email)}</b></td>
        <td><select data-rol="${esc(u.email)}">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.rol === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td>${f(u.ultimo_acceso)}</td>
        <td><button class="b b-mini b-mal" type="button" data-quitar="${esc(u.email)}">Quitar</button></td></tr>`).join('') + '</tbody>';
  }
  $('#u-lista').addEventListener('change', async e => {
    const s = e.target.closest('[data-rol]'); if (!s) return;
    try { await api.cambiarRol(LOCAL, s.dataset.rol, s.value); } catch (ex) { alert(mensajeError(ex)); }
    cargarUsuarios();
  });
  $('#u-lista').addEventListener('click', async e => {
    const b = e.target.closest('[data-quitar]'); if (!b) return;
    if (!confirm(`¿Quitar el acceso de ${b.dataset.quitar} a este local? Su usuario seguirá existiendo en Supabase.`)) return;
    try { await api.quitarStaff(LOCAL, b.dataset.quitar); } catch (ex) { alert(mensajeError(ex)); }
    cargarUsuarios();
  });
  $('#u-anadir').onclick = async () => {
    const err = $('#u-error'); err.hidden = true; const email = $('#u-email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Escribe un email válido.'; err.hidden = false; return; }
    const pw = $('#u-pass').value;
    if (pw && pw.length < 8) { err.textContent = 'La contraseña inicial tiene que tener al menos 8 caracteres.'; err.hidden = false; return; }
    const btn = $('#u-anadir'); btn.disabled = true;
    try {
      const r = await api.anadirStaff(LOCAL, email, $('#u-rol').value, pw);
      $('#u-email').value = ''; $('#u-pass').value = '';
      err.textContent = r && r.creado ? `Listo: ${email} ya puede entrar con la contraseña que has puesto (que la cambie en Usuarios → Cambiar mi contraseña).`
                                      : `Listo: ${email} ya tiene acceso a este local (entra con su contraseña de siempre).`;
      err.style.background = '#E4EEDD'; err.style.color = '#4F7A3A'; err.hidden = false;
    } catch (ex) { err.textContent = mensajeError(ex); err.style.background = ''; err.style.color = ''; err.hidden = false; }
    finally { btn.disabled = false; }
    cargarUsuarios();
  };
  $('#pw-ok').onclick = async () => {
    const m = $('#pw-msg'); const a = $('#pw-1').value, b = $('#pw-2').value;
    const di = (t, ok) => { m.textContent = t; m.hidden = false; m.style.background = ok ? '#E4EEDD' : ''; m.style.color = ok ? '#4F7A3A' : ''; };
    if (a.length < 8) return di('Mínimo 8 caracteres.');
    if (a !== b) return di('Las dos contraseñas no coinciden.');
    try { await api.cambiarPassword(a); $('#pw-1').value = $('#pw-2').value = ''; di('Contraseña guardada. La próxima vez entra con ella.', true); }
    catch (ex) { di('No se ha podido guardar: ' + mensajeError(ex)); }
  };
  window.ADMIN.usuarios = { async init(l) { LOCAL = l; await cargarUsuarios(); }, mostrar: cargarUsuarios };
})();
