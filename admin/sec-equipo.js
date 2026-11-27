/* ÓRALE PADRE · admin · Equipo del TPV con PIN (dentro de "Usuarios")
   Lista, alta/edición y "Importar lista" (CSV pegado: id,nombre,pin,rol,
   local_base,locales_que_ve). Los PIN viajan cifrados a la base de datos y
   nunca se pueden volver a leer. */
(function () {
  'use strict';
  const { api, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOC = { tomares: 'Tomares', 'san-luis': 'San Luis', remedios: 'Los Remedios', 'sevilla-este': 'Sevilla Este' };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^los\s+/, '').trim();
  const idLocal = n => Object.keys(LOC).find(k => norm(LOC[k]) === norm(n) || k === norm(n).replace(/\s+/g, '-')) || null;
  const fecha = d => d ? new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  let lista = [], previa = [], editando = null;

  async function cargar() {
    if (!$('#eq-lista')) return;
    try { lista = await api.equipo(); } catch (ex) { $('#eq-lista').innerHTML = `<tbody><tr><td class="nota">${esc(mensajeError(ex))}</td></tr></tbody>`; return; }
    $('#eq-lista').innerHTML = lista.length ? `<thead><tr><th>Persona</th><th>Rol</th><th>Entra en</th><th>PIN</th><th>Email</th><th>Última entrada</th><th></th></tr></thead><tbody>` +
      lista.map(e => `<tr class="${e.activo ? '' : 'apagado'}"><td><b>${esc(e.nombre)}</b><small>${esc(e.id)}${e.local_base ? ' · base ' + esc(e.local_base) : ''}</small></td>
        <td>${e.rol === 'encargado' ? '<span class="tag verde">Encargado</span>' : '<span class="tag gris">Empleado</span>'}</td>
        <td>${(e.locales || []).map(l => `<span class="tag">${esc(LOC[l] || l)}</span>`).join('') || '<small>ninguno</small>'}</td>
        <td>${e.tiene_pin ? `<button class="b b-mini b-pin" type="button" data-pin="${esc(e.id)}">✓ Cambiar PIN</button>` : `<button class="b b-mini b-ok b-pin" type="button" data-pin="${esc(e.id)}">🔑 Poner PIN</button>`}</td>
        <td>${e.email ? esc(e.email) : '—'}${e.email && e.rol === 'encargado' ? `<small>${e.con_usuario ? 'tiene acceso al panel' : 'sin acceso al panel'}</small>` : ''}
          ${e.email ? `<button class="b b-mini b-pin" type="button" data-clave="${esc(e.id)}">🔒 ${e.con_usuario ? 'Contraseña' : 'Crear acceso'}</button>` : ''}</td>
        <td>${fecha(e.ultima_entrada)}</td>
        <td><button class="b b-mini" type="button" data-eq="${esc(e.id)}">Editar</button></td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Aún no hay nadie. Pulsa "Importar lista" y pega la lista del equipo.</td></tr></tbody>';
  }

  /* ── Importar (CSV) ── */
  function parseCSV(txt) {
    const filas = []; let f = [], c = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"' && txt[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
      else if (ch === '"') q = true; else if (ch === ',' || ch === ';' || ch === '\t') { f.push(c); c = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; f.push(c); filas.push(f); f = []; c = ''; }
      else c += ch;
    }
    if (c || f.length) { f.push(c); filas.push(f); }
    return filas.filter(r => r.some(x => x.trim()));
  }
  function revisar() {
    const err = t => { $('#eq-imp-err').textContent = t; $('#eq-imp-err').hidden = false; };
    $('#eq-imp-err').hidden = true; $('#eq-guardar-imp').disabled = true; previa = [];
    const filas = parseCSV($('#eq-texto').value.trim());
    if (filas.length < 2) return err('Pega la lista con la fila de títulos y al menos una persona.');
    const cab = filas[0].map(h => norm(h));
    const col = n => cab.findIndex(h => h === n || h.startsWith(n));
    const ci = { id: col('id'), nombre: col('nombre'), pin: col('pin'), rol: col('rol'), base: col('local_base'), locs: col('locales') };
    if (ci.id < 0 || ci.nombre < 0) return err('Faltan las columnas "id" y "nombre".');
    const problemas = [];
    filas.slice(1).forEach((r, n) => {
      const g = k => ci[k] >= 0 ? (r[ci[k]] || '').trim() : '';
      const id = norm(g('id')).replace(/[^a-z0-9-]/g, '');
      const locs = g('locs').split('|').map(idLocal).filter(Boolean);
      const malos = g('locs').split('|').filter(x => x.trim() && !idLocal(x));
      const pin = g('pin');
      if (!id) problemas.push(`Fila ${n + 2}: falta el id.`);
      if (pin && !/^[0-9]{4,8}$/.test(pin)) problemas.push(`${g('nombre')}: el PIN tiene que ser de 4 a 8 cifras.`);
      if (malos.length) problemas.push(`${g('nombre')}: no reconozco el local "${malos.join(', ')}".`);
      previa.push({ id, nombre: g('nombre'), pin, rol: /encarg/i.test(g('rol')) ? 'encargado' : 'empleado', local_base: g('base'), locales: locs,
        email: $('#eq-emails').checked && id ? `${id}@oralepadre.com` : '' });
    });
    // Mismo PIN en un local compartido: el TPV no sabría quién es.
    previa.forEach((a, i) => previa.slice(i + 1).forEach(b => { if (a.pin && a.pin === b.pin && a.locales.some(l => b.locales.includes(l))) problemas.push(`${a.nombre} y ${b.nombre} tienen el mismo PIN y comparten local.`); }));
    $('#eq-previa').innerHTML = `<table><thead><tr><th>Persona</th><th>Rol</th><th>Locales</th><th>PIN</th><th>Email</th></tr></thead><tbody>` +
      previa.map(p => `<tr><td><b>${esc(p.nombre)}</b> <small>${esc(p.id)}</small></td><td>${p.rol}</td><td>${p.locales.map(l => LOC[l]).join(', ')}</td><td>${p.pin ? '••••' : '—'}</td><td>${esc(p.email || '—')}</td></tr>`).join('') + '</tbody></table>';
    if (problemas.length) return err(problemas.join(' '));
    $('#eq-guardar-imp').disabled = false;
  }
  async function guardarImport() {
    $('#eq-guardar-imp').disabled = true;
    try {
      const r = await api.guardarEquipo(previa.map(p => ({ ...p, pin: p.pin || null, email: p.email || null })));
      $('#eq-texto').value = ''; previa = []; $('#eq-previa').innerHTML = '';   // el texto con los PIN no se queda en pantalla
      $('#dlg-eq-imp').close(); await cargar(); $('#eq-ok').textContent = `✓ Guardadas ${r.guardados} personas. Los PIN quedan cifrados.`; $('#eq-ok').hidden = false; setTimeout(() => { $('#eq-ok').hidden = true; }, 8000);
    } catch (ex) { $('#eq-imp-err').textContent = mensajeError(ex); $('#eq-imp-err').hidden = false; $('#eq-guardar-imp').disabled = false; }
  }

  /* ── Alta / edición de una persona ── */
  function abrir(id) {
    const e = id ? lista.find(x => x.id === id) : { id: '', nombre: '', email: '', rol: 'empleado', local_base: '', locales: [], activo: true };
    editando = id || null;
    $('#eq-titulo').textContent = id ? 'Editar a ' + e.nombre : 'Nueva persona';
    $('#eq-nombre').value = e.nombre; $('#eq-id').value = e.id; $('#eq-id').disabled = !!id;
    $('#eq-email').value = e.email || ''; $('#eq-rol').value = e.rol; $('#eq-pin').value = ''; $('#eq-activo').checked = e.activo !== false;
    $('#eq-base').innerHTML = '<option value="">—</option>' + Object.values(LOC).map(n => `<option ${n === e.local_base ? 'selected' : ''}>${n}</option>`).join('');
    $('#eq-locales').innerHTML = Object.entries(LOC).map(([k, n]) => `<label><input type="checkbox" value="${k}" ${(e.locales || []).includes(k) ? 'checked' : ''}> ${n}</label>`).join('');
    $('#eq-err').hidden = true; $('#dlg-eq').showModal();
  }
  async function guardarUna() {
    const err = t => { $('#eq-err').textContent = t; $('#eq-err').hidden = false; };
    const id = norm($('#eq-id').value).replace(/[^a-z0-9-]/g, ''); const nombre = $('#eq-nombre').value.trim(); const pin = $('#eq-pin').value.trim();
    if (!nombre || !id) return err('Pon el nombre y un id corto (p. ej. "lale").');
    if (!editando && lista.some(x => x.id === id)) return err('Ya hay alguien con ese id.');
    if (pin && !/^[0-9]{4,8}$/.test(pin)) return err('El PIN tiene que ser de 4 a 8 cifras.');
    if (!editando && !pin) return err('Ponle un PIN para que pueda entrar en el TPV.');
    const locales = [...document.querySelectorAll('#eq-locales input:checked')].map(i => i.value);
    try {
      await api.guardarEquipo([{ id, nombre, email: $('#eq-email').value.trim() || null, rol: $('#eq-rol').value, local_base: $('#eq-base').value,
        locales, pin: pin || null, activo: $('#eq-activo').checked }]);
      $('#eq-pin').value = ''; $('#dlg-eq').close(); await cargar();
    } catch (ex) { err(mensajeError(ex)); }
  }


  /* ── PIN: a una persona o a todo el equipo de una vez ── */
  let pinIds = [];
  function abrirPines(ids) {
    const gente = (ids ? lista.filter(e => ids.includes(e.id)) : lista.filter(e => e.activo));
    if (!gente.length) { alert('Aún no hay nadie en el equipo. Pulsa "+ Persona" primero.'); return; }
    pinIds = gente.map(e => e.id);
    $('#pn-titulo').textContent = ids ? `PIN de ${gente[0].nombre}` : 'PIN de todo el equipo';
    $('#pn-filas').innerHTML = gente.map(e => `<div class="pin-fila" data-fila="${esc(e.id)}"><div><b>${esc(e.nombre)}</b>
        <small>${e.rol === 'encargado' ? 'Encargado' : 'Empleado'} · ${(e.locales || []).map(l => esc(LOC[l] || l)).join(', ') || 'sin local'} · ${e.tiene_pin ? 'ya tiene PIN' : '<b style="display:inline;color:#8E1B1B">sin PIN</b>'}</small></div>
        <input data-p1 inputmode="numeric" maxlength="8" autocomplete="off" placeholder="PIN nuevo" aria-label="PIN nuevo de ${esc(e.nombre)}">
        <input data-p2 inputmode="numeric" maxlength="8" autocomplete="off" placeholder="Repítelo" aria-label="Repite el PIN de ${esc(e.nombre)}"></div>`).join('');
    $('#pn-filas').querySelectorAll('input').forEach(i => { i.oninput = () => { i.value = i.value.replace(/\D/g, ''); i.closest('.pin-fila').classList.remove('mal', 'ok'); $('#pn-err').hidden = true; }; });
    $('#pn-err').hidden = true; $('#dlg-pines').showModal();
    const pri = $('#pn-filas input'); if (pri) pri.focus();
  }
  async function guardarPines() {
    const err = t => { $('#pn-err').textContent = t; $('#pn-err').hidden = false; };
    const cambios = [], problemas = [];
    $('#pn-filas').querySelectorAll('.pin-fila').forEach(f => {
      const e = lista.find(x => x.id === f.dataset.fila); const a = f.querySelector('[data-p1]').value, b = f.querySelector('[data-p2]').value;
      f.classList.remove('mal', 'ok'); if (!a && !b) return;
      if (!/^[0-9]{4,8}$/.test(a)) { f.classList.add('mal'); problemas.push(`${e.nombre}: el PIN tiene que tener de 4 a 8 cifras.`); return; }
      if (a !== b) { f.classList.add('mal'); problemas.push(`${e.nombre}: los dos PIN no coinciden.`); return; }
      f.classList.add('ok'); cambios.push({ e, pin: a });
    });
    cambios.forEach((x, i) => cambios.slice(i + 1).forEach(y => { if (x.pin === y.pin && (x.e.locales || []).some(l => (y.e.locales || []).includes(l))) problemas.push(`${x.e.nombre} y ${y.e.nombre} tienen el mismo PIN y comparten local: cambia uno.`); }));
    if (problemas.length) return err(problemas.join(' '));
    if (!cambios.length) return err('Escribe al menos un PIN (y repítelo).');
    $('#pn-guardar').disabled = true;
    try {
      await api.guardarEquipo(cambios.map(({ e, pin }) => ({ id: e.id, nombre: e.nombre, email: e.email || null, rol: e.rol, local_base: e.local_base || '',
        locales: e.locales || [], activo: e.activo !== false, pin })));
      $('#dlg-pines').close(); await cargar();
      $('#eq-ok').textContent = `✓ PIN guardado a ${cambios.map(c => c.e.nombre).join(', ')}. Ya pueden entrar en el TPV con él.`; $('#eq-ok').hidden = false;
      setTimeout(() => { $('#eq-ok').hidden = true; }, 10000);
    } catch (ex) { err(mensajeError(ex)); } finally { $('#pn-guardar').disabled = false; }
  }


  /* ── Contraseña (email) de una persona del equipo: crearla o cambiarla en un paso ── */
  let claveDe = null;
  function abrirClave(id) {
    const e = lista.find(x => x.id === id); if (!e || !e.email) return; claveDe = e;
    $('#cl-titulo').textContent = (e.con_usuario ? 'Contraseña de ' : 'Crear acceso para ') + e.nombre;
    $('#cl-email').textContent = e.email;
    $('#cl-nota').textContent = e.con_usuario
      ? 'Con este email y esta contraseña entra en el TPV, en Comandas' + (e.rol === 'encargado' ? ' y en el Admin' : '') + '. La de antes deja de valer. Si también usa la app interna, allí cambia igual (es la misma cuenta).'
      : 'Aún no tiene usuario: se crea ahora con este email y esta contraseña. Entra en el TPV, en Comandas' + (e.rol === 'encargado' ? ' y en el Admin' : '') + '.';
    $('#cl-1').value = $('#cl-2').value = ''; $('#cl-err').hidden = true; $('#dlg-clave').showModal(); $('#cl-1').focus();
  }
  async function guardarClave() {
    const e = claveDe; const err = (t, ok) => { const m = $('#cl-err'); m.textContent = t; m.hidden = false; m.className = ok ? 'aviso-ok' : 'aviso'; };
    const a = $('#cl-1').value, b = $('#cl-2').value;
    if (a.length < 8) return err('Mínimo 8 caracteres.');
    if (a !== b) return err('Las dos contraseñas no coinciden.');
    const locs = (e.locales || []).length ? e.locales : [];
    if (!locs.length) return err('Marca primero en qué local trabaja (botón Editar).');
    const rol = e.rol === 'encargado' ? 'encargado' : 'sala';
    $('#cl-ok').disabled = true;
    try {
      if (!e.con_usuario) {
        for (const [i, l] of locs.entries()) await api.anadirStaff(l, e.email, rol, i === 0 ? a : '');
      } else {
        try { await api.cambiarClaveDe(locs[0], e.email, a); }
        catch (ex) {
          if (!/PERMISO|tus locales/i.test(String(ex && ex.message))) throw ex;
          for (const l of locs) await api.anadirStaff(l, e.email, rol, '');   // no tenía acceso al local: se lo damos y repetimos
          await api.cambiarClaveDe(locs[0], e.email, a);
        }
      }
      $('#cl-1').value = $('#cl-2').value = '';
      $('#dlg-clave').close(); await cargar();
      $('#eq-ok').textContent = `✓ ${e.nombre} ya entra con ${e.email} y la contraseña nueva. Díselo en persona.`; $('#eq-ok').hidden = false;
      setTimeout(() => { $('#eq-ok').hidden = true; }, 12000);
    } catch (ex) { err(mensajeError(ex)); } finally { $('#cl-ok').disabled = false; }
  }

  if ($('#eq-lista')) {
    $('#eq-importar').onclick = () => { $('#eq-imp-err').hidden = true; $('#eq-previa').innerHTML = ''; $('#eq-guardar-imp').disabled = true; $('#dlg-eq-imp').showModal(); };
    $('#eq-revisar').onclick = revisar;
    $('#eq-texto').oninput = () => { $('#eq-guardar-imp').disabled = true; };
    $('#eq-guardar-imp').onclick = guardarImport;
    $('#dlg-eq-imp').addEventListener('close', () => { $('#eq-texto').value = ''; previa = []; $('#eq-previa').innerHTML = ''; });
    $('#eq-nuevo').onclick = () => abrir(null);
    $('#eq-lista').addEventListener('click', e => {
      const p = e.target.closest('[data-pin]'); if (p) return abrirPines([p.dataset.pin]);
      const c = e.target.closest('[data-clave]'); if (c) return abrirClave(c.dataset.clave);
      const b = e.target.closest('[data-eq]'); if (b) abrir(b.dataset.eq); });
    $('#eq-pines').onclick = () => abrirPines(null);
    $('#pn-guardar').onclick = guardarPines;
    $('#cl-ok').onclick = guardarClave;
    $('#dlg-clave').addEventListener('close', () => { $('#cl-1').value = $('#cl-2').value = ''; claveDe = null; });
    $('#dlg-pines').addEventListener('close', () => { $('#pn-filas').innerHTML = ''; pinIds = []; });   // que los PIN no se queden en pantalla
    $('#eq-guardar').onclick = guardarUna;
  }

  // Se carga junto con la sección Usuarios.
  window.ADMIN = window.ADMIN || {};
  const prev = window.ADMIN.usuarios;
  if (prev) {
    const init = prev.init, mostrar = prev.mostrar;
    prev.init = async (...a) => { await Promise.all([init.apply(prev, a), cargar()]); };
    prev.mostrar = async (...a) => { await Promise.all([mostrar ? mostrar.apply(prev, a) : null, cargar()]); };
  }
})();
