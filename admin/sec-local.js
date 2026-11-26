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
    cargarQR();
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

  /* ── QR de mesa: activar pedidos desde el móvil, imprimir un QR por mesa, cambiar el código de una ── */
  let mesasQR = [];
  const urlMesa = m => `https://www.oralepadre.com/mesa/?l=${encodeURIComponent(LOCAL)}&m=${encodeURIComponent(m.id)}&k=${encodeURIComponent(m.qr_token || '')}`;
  const msgQR = (t, ok) => { const e = $('#l-qr-msg'); e.textContent = t; e.hidden = false; e.style.background = ok ? '#E4EEDD' : ''; e.style.color = ok ? '#4F7A3A' : ''; };
  async function cargarQR() {
    $('#l-qr').checked = !!local.qr_pedidos; $('#l-qr-msg').hidden = true;
    try { mesasQR = (await api.mesas(LOCAL)).filter(m => m.tipo !== 'deco' && m.activa !== false); } catch (e) { mesasQR = []; }
    $('#l-qr-mesa').innerHTML = mesasQR.map(m => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join('');
  }
  $('#l-qr').onchange = async e => {
    try { await api.guardarQrLocal(LOCAL, e.target.checked); local.qr_pedidos = e.target.checked;
      msgQR(e.target.checked ? 'Activado: los clientes ya pueden pedir desde el QR de su mesa.' : 'Desactivado: con el QR sólo ven la carta y su cuenta, llaman al camarero y piden la cuenta.', true); }
    catch (ex) { e.target.checked = !e.target.checked; msgQR(mensajeError(ex)); }
  };
  $('#l-qr-nuevo').onclick = async () => {
    const m = mesasQR.find(x => x.id === $('#l-qr-mesa').value); if (!m) return;
    if (!confirm(`¿Cambiar el código de ${m.nombre}? El QR que hay ahora en esa mesa deja de valer: tendrás que imprimir y poner el nuevo.`)) return;
    try { m.qr_token = await api.nuevoQrMesa(LOCAL, m.id); msgQR(`Código de ${m.nombre} cambiado. Imprime su QR nuevo.`, true); }
    catch (ex) { msgQR(mensajeError(ex)); }
  };
  $('#l-qr-imprimir').onclick = async () => {
    if (!mesasQR.length) return msgQR('No hay mesas en el plano de este local.');
    if (mesasQR.some(m => !m.qr_token) && api.modo !== 'demo') return msgQR('Falta el código de alguna mesa: recarga la página.');
    try { if (!window.qrcode) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
    catch (e) { return msgQR('No se ha podido cargar el generador de QR. Revisa la conexión.'); }
    const w = window.open('', '_blank'); if (!w) return msgQR('Permite las ventanas emergentes para imprimir los QR.');
    const nom = esc((local.nombre || '').replace(/^Órale Padre\s*/, ''));
    const hojas = mesasQR.map(m => { const q = window.qrcode(0, 'M'); q.addData(api.modo === 'demo' ? urlMesa({ ...m, qr_token: 'demo' }) : urlMesa(m)); q.make();
      return `<section><h1>${esc(m.nombre)}</h1><p>Escanea para ver la carta, pedir y pagar</p><div class="qr">${q.createSvgTag({ cellSize: 8, margin: 0, scalable: true })}</div>
        <small>Órale Padre ${nom} · también puedes llamar al camarero desde aquí</small></section>`; }).join('');
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR de las mesas · ${nom}</title>
      <style>body{font-family:Archivo,Arial,sans-serif;text-align:center;margin:0;color:#241a1c}section{padding:28px 20px;page-break-after:always;break-after:page}
      h1{font-size:52px;margin:0 0 6px;color:#7C2430}p{font-size:20px;margin:0 0 20px}.qr svg{width:290px;height:290px}small{display:block;margin-top:16px;font-size:14px;color:#6b5b5e}
      @page{size:A6;margin:7mm}</style></head><body>${hojas}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
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
    let lista = [];
    try { lista = await api.usuariosEquipo(); } catch (ex) { aviso(mensajeError(ex)); }
    usuarios = lista.map(u => ({ email: u.email, roles: u.accesos || {}, ultimo: u.ultimo_acceso, interna: u.app_interna }))
      .sort((a, b) => (Object.keys(b.roles).length > 0) - (Object.keys(a.roles).length > 0) || a.email.localeCompare(b.email));
    const f = d => d ? new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca';
    const opciones = r => `<option value="">Sin acceso</option>` + Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${r === k ? 'selected' : ''}>${v}</option>`).join('');
    const fila = u => `<tr><td><b>${esc(u.email)}</b>${u.interna ? '<small>También en la app interna</small>' : ''}</td>${LOCALES_U.map(l => `<td><select data-email="${esc(u.email)}" data-local="${esc(l.id)}" class="${u.roles[l.id] ? '' : 'sin'}" aria-label="Acceso de ${esc(u.email)} en ${esc(corto(l.nombre))}">${opciones(u.roles[l.id])}</select></td>`).join('')}<td>${f(u.ultimo)}</td></tr>`;
    const con = usuarios.filter(u => LOCALES_U.some(l => u.roles[l.id])), sin = usuarios.filter(u => !LOCALES_U.some(l => u.roles[l.id]));
    const cab = `<thead><tr><th>Persona</th>${LOCALES_U.map(l => `<th>${esc(corto(l.nombre))}</th>`).join('')}<th>Último acceso</th></tr></thead>`;
    $('#u-lista').innerHTML = cab + '<tbody>' + (con.map(fila).join('') || `<tr><td colspan="${LOCALES_U.length + 2}" class="nota">Nadie tiene acceso todavía.</td></tr>`) + '</tbody>';
    $('#u-sin-cab').hidden = !sin.length;
    $('#u-sin').innerHTML = sin.length ? cab + '<tbody>' + sin.map(fila).join('') + '</tbody>' : '';
    const cambiables = con.filter(u => !u.interna);
    $('#rc-email').innerHTML = '<option value="">¿A quién?</option>' + cambiables.map(u => `<option value="${esc(u.email)}">${esc(u.email)}</option>`).join('');
    $('#u-locales').innerHTML = LOCALES_U.map(l => `<label class="chk-local"><input type="checkbox" value="${esc(l.id)}" ${l.id === LOCAL ? 'checked' : ''}> ${esc(corto(l.nombre))}</label>`).join('');
  }
  const alCambiar = async e => {
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
  };
  $('#u-lista').addEventListener('change', alCambiar);
  $('#u-sin').addEventListener('change', alCambiar);
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
  $('#rc-ok').onclick = async () => {
    const m = $('#rc-msg'); const email = $('#rc-email').value; const a = $('#rc-1').value, b = $('#rc-2').value;
    const di = (t, ok) => { m.textContent = t; m.hidden = false; m.style.background = ok ? '#E4EEDD' : ''; m.style.color = ok ? '#4F7A3A' : ''; };
    if (!email) return di('Elige a quién.');
    if (a.length < 8) return di('Mínimo 8 caracteres.');
    if (a !== b) return di('Las dos contraseñas no coinciden.');
    const u = usuarios.find(x => x.email === email);
    const local = LOCALES_U.map(l => l.id).find(l => u && u.roles[l]) || LOCAL;
    if (!confirm(`¿Poner esta contraseña nueva a ${email}? La de antes deja de valer.`)) return;
    const btn = $('#rc-ok'); btn.disabled = true;
    try { await api.cambiarClaveDe(local, email, a); $('#rc-1').value = $('#rc-2').value = ''; di(`Hecho: ${email} ya entra con la contraseña nueva. Díselo en persona.`, true); }
    catch (ex) { di(mensajeError(ex)); }
    finally { btn.disabled = false; }
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
