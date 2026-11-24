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
  // Tabla de permisos: una fila por persona, una columna por local (los locales de los que eres encargado).
  let LOCALES_U = [], usuarios = [];
  const corto = n => String(n || '').replace(/^Órale Padre\s*/, '');
  const aviso = (t, ok) => { const e = $('#u-error'); e.textContent = t; e.hidden = false; e.style.background = ok ? '#E4EEDD' : ''; e.style.color = ok ? '#4F7A3A' : ''; };
  async function cargarUsuarios() {
    $('#u-error').hidden = true;
    const ids = LOCALES_U.map(l => l.id);
    let listas = [];
    try { listas = await Promise.all(ids.map(id => api.staffDelLocal(id).then(us => us.map(u => ({ ...u, local: id }))))); }
    catch (ex) { aviso(mensajeError(ex)); }
    const m = new Map();
    listas.flat().forEach(u => { const x = m.get(u.email) || { email: u.email, roles: {}, ultimo: null }; x.roles[u.local] = u.rol;
      if (u.ultimo_acceso && (!x.ultimo || u.ultimo_acceso > x.ultimo)) x.ultimo = u.ultimo_acceso; m.set(u.email, x); });
    usuarios = [...m.values()].sort((a, b) => a.email.localeCompare(b.email));
    const f = d => d ? new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca';
    const opciones = r => `<option value="">Sin acceso</option>` + Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${r === k ? 'selected' : ''}>${v}</option>`).join('');
    $('#u-lista').innerHTML = `<thead><tr><th>Persona</th>${LOCALES_U.map(l => `<th>${esc(corto(l.nombre))}</th>`).join('')}<th>Último acceso</th></tr></thead><tbody>` +
      (usuarios.map(u => `<tr><td><b>${esc(u.email)}</b></td>${LOCALES_U.map(l => `<td><select data-email="${esc(u.email)}" data-local="${esc(l.id)}" class="${u.roles[l.id] ? '' : 'sin'}">${opciones(u.roles[l.id])}</select></td>`).join('')}
        <td>${f(u.ultimo)}</td></tr>`).join('') || `<tr><td colspan="${LOCALES_U.length + 2}" class="nota">Aún no hay nadie.</td></tr>`) + '</tbody>';
    $('#u-locales').innerHTML = LOCALES_U.map(l => `<label class="chk-local"><input type="checkbox" value="${esc(l.id)}" ${l.id === LOCAL ? 'checked' : ''}> ${esc(corto(l.nombre))}</label>`).join('');
  }
  $('#u-lista').addEventListener('change', async e => {
    const s = e.target.closest('select[data-email]'); if (!s) return;
    const email = s.dataset.email, local = s.dataset.local, rol = s.value;
    const antes = (usuarios.find(u => u.email === email) || { roles: {} }).roles[local];
    const nombre = corto((LOCALES_U.find(l => l.id === local) || {}).nombre);
    try {
      if (!rol) { if (!confirm(`¿Quitar a ${email} el acceso a ${nombre}?`)) { s.value = antes || ''; return; } await api.quitarStaff(local, email); }
      else if (!antes) await api.anadirStaff(local, email, rol, '');
      else await api.cambiarRol(local, email, rol);
      aviso(`Hecho: ${email} · ${nombre}: ${rol ? ROLES[rol] : 'sin acceso'}.`, true);
    } catch (ex) { aviso(mensajeError(ex)); }
    cargarUsuarios();
  });
  $('#u-anadir').onclick = async () => {
    const email = $('#u-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return aviso('Escribe un email válido.');
    const pw = $('#u-pass').value;
    if (pw && pw.length < 8) return aviso('La contraseña inicial tiene que tener al menos 8 caracteres.');
    const locs = [...document.querySelectorAll('#u-locales input:checked')].map(i => i.value);
    if (!locs.length) return aviso('Marca al menos un local.');
    const rol = $('#u-rol').value; const btn = $('#u-anadir'); btn.disabled = true;
    try {
      let creado = false;
      for (const [i, l] of locs.entries()) { const r = await api.anadirStaff(l, email, rol, i === 0 ? pw : ''); creado = creado || (r && r.creado); }
      $('#u-email').value = ''; $('#u-pass').value = '';
      const donde = locs.map(l => corto((LOCALES_U.find(x => x.id === l) || {}).nombre)).join(', ');
      aviso(creado ? `Listo: ${email} ya puede entrar en ${donde} como ${ROLES[rol]} con la contraseña que has puesto (que la cambie al entrar).`
                   : `Listo: ${email} ya tiene acceso a ${donde} como ${ROLES[rol]} (entra con su contraseña de siempre).`, true);
    } catch (ex) { aviso(mensajeError(ex)); }
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
  window.ADMIN.usuarios = { todos: true, async init(l, locales) { LOCAL = l; LOCALES_U = locales || []; await cargarUsuarios(); }, mostrar: cargarUsuarios };
})();
