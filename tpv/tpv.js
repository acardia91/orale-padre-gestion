/* ÓRALE PADRE · TPV de sala */
(function () {
  'use strict';
  const { api, DEMO, indexar, precioLinea, mensajeError, euros, partesMadrid, calculaTicket } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };

  let LOCAL = new URLSearchParams(location.search).get('local') || ls('op-tpv-local') || 'tomares';
  let local, carta, idx, mesas = [], cuentas = [], agotados = new Set();
  let zona = null, cuenta = null, pedidosCuenta = [], catActiva = null, web = [];
  // Lo que el camarero ha marcado y aún no ha enviado a cocina, por cuenta (sobrevive a recargar).
  const pendientes = ls('op-tpv-pendientes') || {};
  const guardaPend = () => ls('op-tpv-pendientes', pendientes);
  let SESION = null; const enviando = {};
  // Con equipo con PIN manda la persona que ha entrado; sin él, el rol de la cuenta del TPV.
  const esEncargado = () => conEquipo ? !!(persona && persona.rol === 'encargado') : !!(SESION && SESION.roles && SESION.roles[LOCAL] === 'encargado');

  /* Aviso flotante: verde si ha ido bien, rojo si no. */
  let tAviso = null;
  function aviso(texto, mal) {
    const el = $('#t-aviso'); el.textContent = texto; el.className = 'aviso-flota' + (mal ? ' mal' : ''); el.hidden = false;
    clearTimeout(tAviso); tAviso = setTimeout(() => { el.hidden = true; }, mal ? 6000 : 3000);
  }

  if (DEMO) $('#t-demo').hidden = false;

  /* ── App instalable: service worker, botón "Instalar app" y pantalla siempre encendida ── */
  const enApp = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/tpv/sw.js', { scope: '/tpv/' }).catch(() => {});
  let pideInstalar = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pideInstalar = e; if (!enApp) $('#b-instalar').hidden = false; });
  window.addEventListener('appinstalled', () => { $('#b-instalar').hidden = true; pideInstalar = null; aviso('✓ TPV instalado: ya lo tienes como app en la pantalla de inicio.'); });
  $('#b-instalar').onclick = async () => { if (!pideInstalar) return; pideInstalar.prompt(); await pideInstalar.userChoice.catch(() => {}); pideInstalar = null; $('#b-instalar').hidden = true; };
  let candado = null;
  const pantallaEncendida = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !candado) { candado = await navigator.wakeLock.request('screen'); candado.addEventListener('release', () => { candado = null; }); } } catch (e) { candado = null; } };
  if (enApp) { pantallaEncendida(); document.addEventListener('visibilitychange', pantallaEncendida); }

  /* ── Sesión ── */
  (async () => {
    let s = null; try { s = await api.sesion(); } catch (e) { s = null; }
    if (!s) { $('#vista-entrar').hidden = false; return; }
    entrar(s);
  })();
  $('#form-entrar').addEventListener('submit', async e => {
    e.preventDefault(); $('#e-error').hidden = true;
    try { entrar(await api.entrar($('#e-email').value.trim(), $('#e-pass').value)); }
    catch (ex) { $('#e-error').textContent = 'Email o contraseña incorrectos.'; $('#e-error').hidden = false; }
  });
  $('#b-salir').onclick = async () => { if (confirm('¿Cerrar sesión en este TPV?')) { await api.salir(); location.reload(); } };

  async function entrar(s) {
    SESION = s;
    if (!s.locales.length) { $('#e-error').textContent = 'Tu usuario no tiene ningún local asignado.'; $('#e-error').hidden = false; $('#vista-entrar').hidden = false; return; }
    if (!s.locales.includes(LOCAL)) LOCAL = s.locales[0];
    ls('op-tpv-local', LOCAL);
    OP.selectorLocal($('#t-local'), s.locales, LOCAL, id => {
      if (Object.values(pendientes).some(l => l.length) && !confirm('Hay productos sin enviar a cocina en este local. ¿Cambiar de local igualmente?')) { location.reload(); return; }
      ls('op-tpv-local', id); location.search = '?local=' + encodeURIComponent(id);
    });
    $('#vista-entrar').hidden = true; $('#vista-app').hidden = false;
    // Quién está usando el TPV (todo lo que haga queda a su nombre).
    $('#t-quien').textContent = (s.email || '').split('@')[0].replace(/^orale\.padre\.food\+/, '') + (s.roles[LOCAL] === 'encargado' ? ' · encargado' : s.roles[LOCAL] === 'cocina' ? ' · cocina' : ' · sala');
    $('#t-quien').title = s.email || '';
    await compruebaTurno();
    [carta, mesas] = await Promise.all([api.carta(LOCAL), api.mesas(LOCAL)]);
    idx = indexar(carta);
    zona = mesas[0] ? mesas[0].zona : null;
    await recarga();
    // Los avisos en vivo llegan a ráfagas: se agrupan para no repintar diez veces seguidas.
    let tRec = null; api.escuchar(LOCAL, () => { clearTimeout(tRec); tRec = setTimeout(recarga, 250); });
    setInterval(recarga, 30000);
    setInterval(reloj, 15000); reloj();
  }
  /* ══ Equipo con PIN: cada persona entra con el suyo y todo queda a su nombre ══ */
  let persona = null, pin = '', conEquipo = false, tInactivo = null;
  const MIN_INACTIVO = 5;
  async function compruebaTurno() {
    let t = null; try { t = await api.turnoActual(LOCAL); } catch (e) { return; }   // si falla, el TPV sigue como antes
    if (t && t.sin_equipo) { conEquipo = false; return; }
    conEquipo = true;
    if (t) ponPersona(t); else bloquear(false);
  }
  function ponPersona(p) {
    persona = p; $('#bloqueo').hidden = true;
    $('#t-quien').textContent = p.nombre + (p.rol === 'encargado' ? ' · encargado' : '');
    $('#t-quien').title = 'Toca para cambiar de persona';
    vigilaInactividad();
  }
  async function bloquear(avisarServidor = true) {
    if (avisarServidor) { try { await api.salirTurno(LOCAL); } catch (e) {} }
    persona = null; pin = ''; pintaPin(); $('#bl-error').hidden = true;
    $('#bl-local').textContent = 'Órale Padre · ' + ((local && local.nombre) ? local.nombre.replace(/^Órale Padre\s*/, '') : $('#t-local').textContent);
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    $('#bloqueo').hidden = false;
  }
  function pintaPin() { $('#bl-puntos').innerHTML = pin ? '<i></i>'.repeat(pin.length) : '<span>Teclea tu PIN</span>'; }
  async function probarPin() {
    if (pin.length < 4) { $('#bl-error').textContent = 'El PIN tiene al menos 4 cifras.'; $('#bl-error').hidden = false; return; }
    const intento = pin; pin = ''; pintaPin();
    try {
      const p = await api.entrarPin(LOCAL, intento);
      if (!p) { $('#bl-error').textContent = 'PIN incorrecto.'; $('#bl-error').hidden = false; return; }
      ponPersona(p); aviso('Hola, ' + p.nombre);
    } catch (ex) { $('#bl-error').textContent = mensajeError(ex); $('#bl-error').hidden = false; }
  }
  $('#bl-teclado').addEventListener('click', e => {
    const b = e.target.closest('[data-d]'); if (!b) return; const d = b.dataset.d; $('#bl-error').hidden = true;
    if (d === 'borrar') pin = pin.slice(0, -1); else if (d === 'ok') return probarPin(); else if (pin.length < 8) pin += d;
    pintaPin();
  });
  document.addEventListener('keydown', e => {
    if ($('#bloqueo').hidden) return;
    if (/^[0-9]$/.test(e.key) && pin.length < 8) { pin += e.key; pintaPin(); }
    else if (e.key === 'Backspace') { pin = pin.slice(0, -1); pintaPin(); }
    else if (e.key === 'Enter') probarPin();
  });
  $('#bl-salir').onclick = async () => { if (confirm('¿Cerrar la sesión de este TPV? Para volver a abrirlo hará falta el email y la contraseña del local.')) { await api.salir(); location.reload(); } };
  $('#t-quien').onclick = () => {
    if (!conEquipo) return;
    if (Object.values(pendientes).some(l => l.length) && !confirm('Hay productos sin enviar a cocina. ¿Cambiar de persona igualmente?')) return;
    bloquear();
  };
  // Tras unos minutos sin tocar nada, se bloquea (salvo que haya algo a medio enviar).
  function vigilaInactividad() {
    const reinicia = () => { clearTimeout(tInactivo); tInactivo = setTimeout(() => {
      if (!conEquipo || !persona || !$('#bloqueo').hidden) return;
      if (Object.values(pendientes).some(l => l.length) || document.querySelector('dialog[open]')) return reinicia();
      bloquear();
    }, MIN_INACTIVO * 60000); };
    if (!vigilaInactividad.puesto) { ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, reinicia, { passive: true })); vigilaInactividad.puesto = true; }
    reinicia();
  }

  function reloj() { $('#t-reloj').textContent = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', hour: '2-digit', minute: '2-digit' }); }

  /* ══ Conexión: si no llega el servidor, franja roja y reintento cada 8 s. Lo no enviado sigue guardado en este TPV. ══ */
  let sinRed = false, tReintento = null, recargando = null;
  const conTiempo = (pr, ms) => Promise.race([pr, new Promise((_, no) => setTimeout(() => no(new TypeError('Tiempo de espera agotado')), ms))]);
  const esDeRed = ex => sinRed || !navigator.onLine || ex instanceof TypeError || /fetch|network|red|tiempo de espera|timeout|failed/i.test(String(ex && (ex.message || ex)));
  function ponConexion(ok) {
    if (ok === !sinRed) return;
    sinRed = !ok; $('#t-sinred').hidden = ok; document.body.classList.toggle('sin-red', !ok);
    clearInterval(tReintento); tReintento = ok ? null : setInterval(recarga, 8000);
    if (ok) {
      const n = Object.values(pendientes).filter(l => l.length).length;
      aviso(n ? `✓ Conexión recuperada. Hay ${n} ${n === 1 ? 'cuenta' : 'cuentas'} con productos sin enviar a cocina.` : '✓ Conexión recuperada');
    } else $('#sr-txt').textContent = navigator.onLine ? 'Sin conexión con el servidor.' : 'Este TPV no tiene internet.';
  }
  window.addEventListener('offline', () => ponConexion(false));
  window.addEventListener('online', () => recarga());
  $('#sr-reintentar').onclick = () => { $('#sr-reintentar').textContent = 'Probando…'; recarga().finally(() => { $('#sr-reintentar').textContent = 'Reintentar'; }); };

  function recarga() { return recargando || (recargando = recargaYa().finally(() => { recargando = null; })); }
  async function recargaYa() {
    try {
      let hoy;
      const d0 = new Date(); d0.setHours(0, 0, 0, 0); const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
      let rvs;
      [local, cuentas, agotados, mesas, hoy, rvs] = await conTiempo(Promise.all([api.local(LOCAL), api.cuentasAbiertas(LOCAL), api.agotados(LOCAL), api.mesas(LOCAL), api.pedidosDelDia(LOCAL),
        api.reservasEntre ? api.reservasEntre(LOCAL, d0.toISOString(), d1.toISOString()).catch(() => []) : []]), 15000);
      ponConexion(true);
      pedidosHoy = hoy;
      reservasHoy = (rvs || []).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      web = hoy.filter(p => p.canal === 'web' && ['nuevo', 'preparando', 'listo'].includes(p.estado)).sort((a, b) => new Date(a.recogida) - new Date(b.recogida));
      avisaWebNuevos(); avisaQR(hoy);
    }
    catch (e) { console.warn(e); if (esDeRed(e)) ponConexion(false); return; }
    if ($('#t-local')) $('#t-local').textContent = local.nombre.replace(/^Órale Padre\s*/, '');
    $('#b-agotados').textContent = 'Agotados' + (agotados.size ? ` (${agotados.size})` : '');
    if (cuenta) {
      const c = cuentas.find(x => x.id === cuenta.id);
      if (!c) { cuenta = null; verSala(); return; }      // la cobraron o anularon desde otro TPV
      cuenta = c; pedidosCuenta = await api.pedidosDeCuenta(cuenta.id); pintaCuenta(); pintaProductos();
    } else pintaSala();
  }

  /* ══ Aviso de pedido web nuevo: suena y sale un aviso (la primera carga no suena) ══ */
  let webVistos = null;
  function avisaWebNuevos() {
    const nuevos = web.filter(p => p.estado === 'nuevo');
    if (webVistos) {
      const recien = nuevos.filter(p => !webVistos.has(p.id));
      if (recien.length) { timbre(); aviso(`🛎 Pedido web nuevo · #${recien.map(p => p.numero).join(', #')} · ${recien[0].cliente_nombre || ''}`); }
    }
    webVistos = new Set([...(webVistos || []), ...nuevos.map(p => p.id)]);
  }
  /* ══ QR de mesa: pedidos desde el móvil y mesas que llaman al camarero o piden la cuenta ══ */
  const AVISO_TXT = { camarero: '🙋 Llama', cuenta: '🧾 Pide la cuenta', pagado: '✓ Pagó con el móvil', error_pago: '⚠ Pago con error' };
  let qrVistos = null, avisosVistos = null;
  function avisaQR(hoy) {
    const qr = hoy.filter(p => p.canal === 'sala' && p.persona === 'Cliente (QR)' && p.estado !== 'cancelado');
    const av = mesas.filter(m => m.aviso).map(m => ({ m, k: m.id + '|' + m.aviso.cuando }));
    if (qrVistos) {
      const nuevos = qr.filter(p => !qrVistos.has(p.id));
      if (nuevos.length) { timbre(); aviso(`📱 ${nuevos.map(p => p.mesa).join(', ')}: pedido desde el móvil (#${nuevos.map(p => p.numero).join(', #')})`); }
      const nuevosAv = av.filter(x => !avisosVistos.has(x.k));
      if (nuevosAv.length) {
        timbre();
        const x = nuevosAv[0].m; const t = x.aviso.tipo;
        aviso(t === 'camarero' ? `🙋 ${x.nombre} llama al camarero` : t === 'cuenta' ? `🧾 ${x.nombre} pide la cuenta`
          : t === 'pagado' ? `✓ ${x.nombre} ha pagado ${euros(x.aviso.importe || 0)} con el móvil` : `⚠ ${x.nombre}: el pago con el móvil ha fallado; mira Control en el admin`, t === 'error_pago');
      }
    }
    qrVistos = new Set(qr.map(p => p.id)); avisosVistos = new Set(av.map(x => x.k));
  }
  function atiende(mesaId) {
    const m = mesas.find(x => x.id === mesaId); if (!m || !m.aviso) return;
    m.aviso = null; api.atenderMesa(LOCAL, mesaId).catch(() => {});
  }

  let audio = null;
  // Botón 🔔/🔕: silencia el aviso sonoro de pedidos web en este TPV (se recuerda). El aviso escrito sigue saliendo.
  let silencio = ls('op-tpv-silencio') === true;
  function pintaSonido() {
    const b = $('#b-sonido'); b.textContent = silencio ? '🔕' : '🔔'; b.setAttribute('aria-pressed', String(silencio));
    b.classList.toggle('silenciado', silencio);
    b.title = silencio ? 'Sonido de pedidos web silenciado: tocar para activarlo' : 'Sonido de pedidos web: tocar para silenciar';
  }
  $('#b-sonido').onclick = () => { silencio = !silencio; ls('op-tpv-silencio', silencio); pintaSonido();
    if (!silencio) timbre(); aviso(silencio ? '🔕 Sonido silenciado en este TPV' : '🔔 Sonido activado'); };
  pintaSonido();
  $('#b-impresora').onclick = () => OP.ajustesImpresora();
  function timbre() {
    if (silencio) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((t, i) => { const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = i ? 1320 : 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.0001, audio.currentTime + t); g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.16); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.17); });
    } catch (e) { /* sin sonido */ }
  }
  // Los navegadores sólo dejan sonar tras tocar la pantalla: se "despierta" el audio con el primer toque.
  document.addEventListener('pointerdown', () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) {} }, { once: true });

  /* ══ Sala ══ */
  const minutos = d => Math.round((Date.now() - new Date(d)) / 60000);
  // Color de la mesa según el tiempo que lleva abierta: normal, ámbar a los 45 min y rojo a la hora.
  const claseTiempo = c => { const m = minutos(c.abierta); return c.para_llevar || !c.mesa_id ? '' : m >= 60 ? 't-rojo' : m >= 45 ? 't-ambar' : ''; };
  const totales = {};                     // total enviado de cada cuenta abierta
  /* ══ Reservas de hoy ══ */
  let reservasHoy = [], rvSentar = null;
  const hhmm = f => new Date(f).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
  const vivasRv = () => reservasHoy.filter(r => ['pendiente', 'confirmada'].includes(r.estado) && new Date(r.fecha) > Date.now() - 2 * 3600000);
  // Próxima reserva de una mesa en las 2 próximas horas (para marcarla en el plano).
  const reservaDeMesa = id => vivasRv().find(r => r.mesa_id === id && new Date(r.fecha) - Date.now() < 2 * 3600000);
  function pintaReservas() {
    const rs = vivasRv();
    $('#n-rv').textContent = rs.length || '';
    $('#rv-tpv').innerHTML = rs.map(r => { const min = (new Date(r.fecha) - Date.now()) / 60000; const mesa = mesas.find(m => m.id === r.mesa_id);
      return `<div class="rv-card ${r.estado} ${min < 30 ? 'pronto' : ''}">
        <b>${hhmm(r.fecha)}</b><strong>${esc(r.nombre)} · ${r.personas} pers.</strong>
        <small>${mesa ? 'Mesa: ' + esc(mesa.nombre) : 'Sin mesa asignada'}${r.estado === 'pendiente' ? ' · <b style="font-size:12px;color:var(--oro)">Pendiente</b>' : ''}</small>
        ${r.notas ? `<small>📝 ${esc(r.notas)}</small>` : ''}
        <div class="rv-acc"><button class="b b-ok" type="button" data-rv-sentar="${r.id}">Sentar</button><button class="b" type="button" data-rv-noshow="${r.id}">No vino</button>
          ${r.telefono ? `<a class="b" href="tel:${esc(r.telefono)}" aria-label="Llamar">📞</a>` : ''}</div></div>`; }).join('');
  }
  async function sentar(r, mesaId) {
    try {
      const abierta = cuentas.find(c => c.mesa_id === mesaId);
      const c = abierta || await api.abrirCuenta({ local: LOCAL, mesa_id: mesaId, nombre: null, comensales: r.personas });
      await api.actualizarReserva(r.id, { estado: 'sentada', mesa_id: mesaId });
      $('#dlg-sentar').close(); aviso(`✓ ${r.nombre} sentados en ${(mesas.find(m => m.id === mesaId) || {}).nombre || 'mesa'}`);
      abrir(c);
    } catch (ex) { alert(mensajeError(ex)); recarga(); }
  }
  $('#rv-tpv').addEventListener('click', async e => {
    const s = e.target.closest('[data-rv-sentar]'), n = e.target.closest('[data-rv-noshow]');
    if (n) { const r = reservasHoy.find(x => x.id === n.dataset.rvNoshow); if (!confirm(`¿Marcar que ${r.nombre} no ha venido?`)) return;
      try { await api.actualizarReserva(r.id, { estado: 'no_show' }); await recarga(); } catch (ex) { alert(mensajeError(ex)); } return; }
    if (!s) return;
    rvSentar = reservasHoy.find(x => x.id === s.dataset.rvSentar);
    // Con mesa asignada y libre: directo. Si no, elegir mesa.
    if (rvSentar.mesa_id && !cuentas.some(c => c.mesa_id === rvSentar.mesa_id)) return sentar(rvSentar, rvSentar.mesa_id);
    $('#st-titulo').textContent = `Sentar a ${rvSentar.nombre}`;
    $('#st-info').textContent = `${rvSentar.personas} personas · ${hhmm(rvSentar.fecha)}. Elige mesa:`;
    $('#st-mesas').innerHTML = mesas.filter(m => m.tipo !== 'deco').map(m => { const oc = cuentas.some(c => c.mesa_id === m.id);
      return `<button class="mesa ${oc ? 'ocupada' : ''}" type="button" data-st="${esc(m.id)}" ${oc ? 'disabled' : ''}><strong>${esc(m.nombre)}</strong><small>${oc ? 'Ocupada' : (m.plazas ? m.plazas + ' pax' : 'Libre')}</small></button>`; }).join('');
    $('#dlg-sentar').showModal();
  });
  $('#st-mesas').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (b && rvSentar) sentar(rvSentar, b.dataset.st); });
  $('#rv-nueva-tpv').onclick = () => {
    const z = new Date(); z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
    $('#rn-nombre').value = ''; $('#rn-tel').value = ''; $('#rn-notas').value = ''; $('#rn-pers').value = 2; $('#rn-error').hidden = true;
    $('#rn-dia').value = z.toISOString().slice(0, 10); $('#rn-hora').value = '21:00'; $('#dlg-rv-nueva').showModal();
  };
  $('#rn-ok').onclick = async () => {
    const err = t => { $('#rn-error').textContent = t; $('#rn-error').hidden = false; };
    const nombre = $('#rn-nombre').value.trim(), tel = $('#rn-tel').value.trim();
    if (nombre.length < 2) return err('Falta el nombre.');
    if (tel.replace(/[^0-9]/g, '').length < 9) return err('Revisa el teléfono.');
    if (!$('#rn-dia').value || !$('#rn-hora').value) return err('Falta el día o la hora.');
    try {
      await api.crearReserva({ local: LOCAL, fecha: new Date(`${$('#rn-dia').value}T${$('#rn-hora').value}:00`), personas: +$('#rn-pers').value || 2,
        nombre, tel, email: '', notas: $('#rn-notas').value.trim(), origen: 'telefono' });
      $('#dlg-rv-nueva').close(); aviso('✓ Reserva guardada'); await recarga();
    } catch (ex) { err(mensajeError(ex)); }
  };

  function pintaRecoger() {
    $('#recoger-sec').hidden = !web.length; $('#n-recoger').textContent = web.length || '';
    const EST = { nuevo: 'Nuevo', preparando: 'Preparando', listo: 'Listo' };
    $('#recoger').innerHTML = web.map(p => `<button class="mesa web ${p.estado}" type="button" data-web="${p.id}">
      <span class="est">${EST[p.estado]}</span>
      <strong>#${p.numero} · ${esc(p.cliente_nombre)}</strong>
      <small>Recoge a las ${new Date(p.recogida).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}</small>
      <span class="imp">${euros(p.total)}</span>
      <span class="pg ${p.pagado ? 'ok' : ''}">${p.pagado ? 'Pagado online' : 'Cobrar al recoger'}</span></button>`).join('');
  }
  function pintaSala() {
    pintaRecoger(); pintaReservas();
    const zonas = [...new Set(mesas.map(m => m.zona))];
    if (!zonas.includes(zona)) zona = zonas[0] || null;
    $('#zonas').innerHTML = zonas.length > 1 ? zonas.map(z => `<button type="button" data-zona="${esc(z)}" class="${z === zona ? 'activa' : ''}">${esc(z)}</button>`).join('') : '';
    const deZona = mesas.filter(m => m.zona === zona);
    const cont = $('#mesas');
    // En el móvil el plano queda diminuto: se enseñan las mesas como botones grandes.
    if (deZona.some(m => m.x != null) && innerWidth >= 700) {
      // Plano tal y como está colocado el local (se edita en /admin).
      cont.className = 'plano-tpv';
      OP.plano.pintar(cont, deZona, { estado: m => {
        if (m.tipo === 'deco') return null;
        const c = cuentas.find(x => x.mesa_id === m.id);
        const av = m.aviso ? ' llama' + (m.aviso.tipo === 'pagado' ? ' llama-pagado' : '') : '';
        if (!c) { const rv = reservaDeMesa(m.id); return { clase: av, sub: m.aviso ? AVISO_TXT[m.aviso.tipo] : rv ? `Reserva ${hhmm(rv.fecha)}` : (m.plazas ? m.plazas + ' pax' : '') }; }
        return { ocupada: true, clase: claseTiempo(c) + av, sub: m.aviso ? AVISO_TXT[m.aviso.tipo] : minutos(c.abierta) + ' min' + (c.comensales ? ` · ${c.comensales}p` : ''), imp: totales[c.id] != null ? euros(totales[c.id]) : '', pendiente: (pendientes[c.id] || []).length > 0 };
      } });
    } else {
      cont.className = 'mesas';
      cont.innerHTML = deZona.filter(m => m.tipo !== 'deco').map(m => {
        const c = cuentas.find(x => x.mesa_id === m.id);
        const rv = !c && reservaDeMesa(m.id);
        const av = m.aviso ? `<span class="llama">${AVISO_TXT[m.aviso.tipo] || ''}</span>` : '';
        return c ? tileCuenta(c, m.nombre, m) : `<button class="mesa ${m.aviso && m.aviso.tipo === 'pagado' ? 'llama-pagado' : ''}" type="button" data-mesa="${esc(m.id)}"><strong>${esc(m.nombre)}</strong><small>${rv ? `<span class="rv-mesa">Reserva ${hhmm(rv.fecha)} · ${rv.personas}p</span>` : 'Libre'}</small>${av}</button>`;
      }).join('') || '<p class="vacio">No hay mesas en esta zona.</p>';
    }
    const sueltas = cuentas.filter(c => !c.mesa_id);
    $('#sueltas').innerHTML = sueltas.map(c => tileCuenta(c, c.nombre)).join('') || '<p class="vacio">Ninguna abierta. Usa “+ Barra” o “+ Para llevar”.</p>';
    sumasSala();
  }
  // Al girar la tablet o cambiar de tamaño, se repinta la sala (plano ↔ botones).
  let tRes = null, anchoPlano = innerWidth >= 700;
  addEventListener('resize', () => { clearTimeout(tRes); tRes = setTimeout(() => { if ((innerWidth >= 700) !== anchoPlano) { anchoPlano = innerWidth >= 700; if (!$('#vista-sala').hidden) pintaSala(); } }, 200); });
  // Móvil: la cuenta es una hoja que se despliega desde abajo.
  $('#c-hoja').onclick = () => $('#vista-cuenta').classList.toggle('hoja-abierta');
  function tileCuenta(c, nombre, m) {
    const pend = (pendientes[c.id] || []).length;
    return `<button class="mesa ocupada ${claseTiempo(c)}" type="button" data-cuenta="${c.id}">
      <strong>${esc(nombre)}</strong><small>${minutos(c.abierta)} min${c.comensales ? ` · ${c.comensales}p` : ''}${c.para_llevar ? ' · llevar' : ''}</small>
      ${m && m.aviso ? `<span class="llama">${AVISO_TXT[m.aviso.tipo] || ''}</span>` : ''}
      ${pend ? `<span class="aviso">${pend} sin enviar</span>` : ''}
      <span class="imp" data-total="${c.id}">${totales[c.id] != null ? euros(totales[c.id]) : '…'}</span></button>`;
  }
  let sumando = false, pedidosHoy = [];
  async function sumasSala() {
    // El total de cada mesa sale de sus comandas enviadas. Las de hoy ya vienen en pedidosHoy (una sola consulta
    // para toda la sala); sólo una cuenta abierta antes de medianoche se pregunta aparte.
    if (sumando) return; sumando = true;
    let cambio = false;
    const hoyF = partesMadrid(new Date()).fecha;
    try {
      await Promise.all(cuentas.map(async c => {
        const ps = partesMadrid(new Date(c.abierta)).fecha === hoyF ? pedidosHoy.filter(p => p.cuenta_id === c.id) : await api.pedidosDeCuenta(c.id);
        const t = ps.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + p.total, 0);
        if (totales[c.id] !== t) { totales[c.id] = t; cambio = true; }
      }));
    } finally { sumando = false; }
    if (cambio && !cuenta) pintaSala();
  }
  $('#zonas').addEventListener('click', e => { const b = e.target.closest('[data-zona]'); if (b) { zona = b.dataset.zona; pintaSala(); } });
  $('#vista-sala').addEventListener('click', async e => {
    const el = e.target.closest('[data-el]');
    const m = e.target.closest('[data-mesa]'); const c = e.target.closest('[data-cuenta]');
    if (c) return abrir(cuentas.find(x => x.id === c.dataset.cuenta));
    const mesaId = m ? m.dataset.mesa : el ? el.dataset.el : null;
    if (!mesaId) return;
    const mesa = mesas.find(x => x.id === mesaId); if (!mesa || mesa.tipo === 'deco') return;
    const abierta = cuentas.find(x => x.mesa_id === mesaId);
    if (abierta) return abrir(abierta);
    if (mesa.aviso && ['pagado', 'error_pago'].includes(mesa.aviso.tipo)) {
      const t = mesa.aviso.tipo; atiende(mesaId); pintaSala();
      alert(t === 'pagado' ? `${mesa.nombre} pagó ${euros(mesa.aviso.importe || 0)} con el móvil y la mesa queda libre.` : `El pago con el móvil de ${mesa.nombre} ha fallado (la cuenta cambió mientras pagaban). Mira "Control" en el admin para devolverlo.`);
      return;
    }
    {
      try { await abrir(await api.abrirCuenta({ local: LOCAL, mesa_id: mesaId })); preguntaComensales(); }
      catch (ex) { alert(mensajeError(ex)); recarga(); }
    }
  });
  async function nuevaSuelta(paraLlevar) {
    const nombre = prompt(paraLlevar ? 'Nombre del cliente (opcional)' : 'Nombre para la cuenta de barra (opcional)', '');
    if (nombre === null) return;
    try { abrir(await api.abrirCuenta({ local: LOCAL, nombre: nombre && (paraLlevar ? 'Llevar · ' : 'Barra · ') + nombre, para_llevar: paraLlevar })); }
    catch (ex) { alert(mensajeError(ex)); }
  }
  $('#b-barra').onclick = () => nuevaSuelta(false);
  $('#b-llevar').onclick = () => nuevaSuelta(true);

  /* ══ Para recoger: cobrar y entregar pedidos web ══ */
  const drc = $('#dlg-recoger'); let pWeb = null;
  $('#recoger').addEventListener('click', e => {
    const b = e.target.closest('[data-web]'); if (!b) return;
    pWeb = web.find(p => p.id === b.dataset.web); if (!pWeb) return;
    $('#rc-titulo').textContent = `Pedido web #${pWeb.numero}`;
    $('#rc-cliente').innerHTML = `<b>${esc(pWeb.cliente_nombre)}</b> · <a href="tel:${esc(pWeb.cliente_tel || '')}">${esc(pWeb.cliente_tel || '')}</a>${pWeb.notas ? `<br><small>📝 ${esc(pWeb.notas)}</small>` : ''}`;
    $('#rc-lineas').innerHTML = pWeb.lineas.map(l => `<li><span><b>${l.cantidad}×</b> ${esc(l.nombre)}${(l.opciones || []).map(o => `<small>+ ${esc(o.nombre)}</small>`).join('')}${l.nota ? `<small>“${esc(l.nota)}”</small>` : ''}</span><span>${euros(l.unitario * l.cantidad)}</span></li>`).join('');
    $('#rc-total').textContent = euros(pWeb.total);
    $('#rc-estado-pago').textContent = pWeb.pagado ? '✓ Ya pagado online: sólo hay que entregarlo.' : 'Pendiente de cobro.';
    $('#rc-estado-pago').style.color = pWeb.pagado ? 'var(--nopal)' : 'var(--mal)';
    $('#rc-entregado').value = ''; $('#rc-error').hidden = true;
    $('#rc-entregado-l').hidden = pWeb.pagado; $('#rc-efectivo').hidden = $('#rc-tarjeta').hidden = pWeb.pagado; $('#rc-entregar').hidden = !pWeb.pagado;
    drc.showModal();
  });
  $('#rc-comanda').onclick = () => OP.imprimir(OP.ticketComanda(pWeb, local.nombre));
  async function cobrarWeb(metodo) {
    const fallo = t => { $('#rc-error').textContent = t; $('#rc-error').hidden = false; };
    let entregado = null;
    if (metodo === 'efectivo' && $('#rc-entregado').value) {
      entregado = Math.round(parseFloat($('#rc-entregado').value.replace(',', '.')) * 100);
      if (isNaN(entregado) || entregado < pWeb.total) return fallo('El efectivo entregado no llega al total.');
    }
    try {
      let t = null;
      if (metodo) t = await api.cobrar({ pedido: pWeb.id, metodo, entregado });
      await api.actualizarPedido(pWeb.id, { estado: 'entregado', entregado_at: new Date().toISOString() });
      drc.close();
      if (t && $('#rc-imprimir').checked) OP.imprimir(OP.ticketFactura(t));
      if (t && t.cambio) alert('Cambio: ' + euros(t.cambio));
      await recarga();
    } catch (ex) { fallo(mensajeError(ex)); }
  }
  $('#rc-efectivo').onclick = () => cobrarWeb('efectivo');
  $('#rc-tarjeta').onclick = () => cobrarWeb('tarjeta');
  $('#rc-entregar').onclick = () => cobrarWeb(null);

  /* ══ Cuenta ══ */
  async function abrir(c) {
    cuenta = c; if (c.mesa_id) atiende(c.mesa_id); pedidosCuenta = await api.pedidosDeCuenta(c.id);
    $('#vista-sala').hidden = true; $('#vista-cuenta').hidden = false; $('#b-atras').hidden = false;
    $('#b-barra').hidden = $('#b-llevar').hidden = true;
    $('#c-nota').value = ''; $('#buscar').value = ''; $('#buscar-x').hidden = true;
    if (!catActiva) catActiva = visibles()[0]?.clave;
    pintaProductos(); pintaCuenta();
  }
  function verSala() {
    $('#vista-cuenta').classList.remove('hoja-abierta');
    cuenta = null; $('#menu-cuenta').hidden = true;
    $('#vista-sala').hidden = false; $('#vista-cuenta').hidden = true; $('#b-atras').hidden = true;
    $('#b-barra').hidden = $('#b-llevar').hidden = false;
    pintaSala();
  }
  $('#b-atras').onclick = async () => {
    const pend = cuenta && (pendientes[cuenta.id] || []);
    if (pend && pend.length && !enviando[cuenta.id]) {
      const n = pend.reduce((s, l) => s + l.cantidad, 0);
      if (confirm(`Hay ${n} ${n === 1 ? 'producto' : 'productos'} sin enviar a cocina.\n\nAceptar: enviarlos ahora.\nCancelar: volver a la sala sin enviar (se quedan guardados en esta mesa).`)) {
        if (!(await enviar())) return;
      }
    }
    verSala();
  };

  // Carta por canal: en una cuenta "para llevar" no sale lo que es sólo de sala, y en mesa no sale lo que es sólo para recoger.
  const fuera = () => cuenta && cuenta.para_llevar ? 'local' : 'recoger';
  const vale = p => p && !p.oculto && p.solo !== fuera();
  const enSala = () => !(cuenta && cuenta.para_llevar);   // precio de sala o para llevar
  function visibles() {
    const hoy = partesMadrid(new Date()).dow;
    return carta.categorias.filter(c => !c.oculta && c.solo !== fuera() && c.productos.some(id => vale(idx.prod.get(id))) && (!c.dias || c.dias.includes(hoy)));
  }
  function pintaProductos() {
    const cats = visibles();
    if (!cats.some(c => c.clave === catActiva)) catActiva = cats[0]?.clave;
    $('#cats').innerHTML = cats.map(c => `<button type="button" data-cat="${c.clave}" class="${c.clave === catActiva ? 'activa' : ''}">${esc(c.nombre)}</button>`).join('');
    const cat = cats.find(c => c.clave === catActiva);
    // Con algo escrito en el buscador se buscan en toda la carta (sin repetir); si no, la categoría elegida.
    const q = quitaAcentos($('#buscar').value.trim());
    const ids = q ? [...new Set(cats.flatMap(c => c.productos))].filter(id => { const p = idx.prod.get(id); return p && quitaAcentos(p.nombre).includes(q); })
      : (cat ? cat.productos : []);
    $('#cats').classList.toggle('buscando', !!q);
    const lista = ids.map(id => idx.prod.get(id)).filter(vale);
    if (q && !lista.length) { $('#prods').innerHTML = `<p class="vacio">Nada con “${esc($('#buscar').value.trim())}”.</p>`; return; }
    $('#prods').innerHTML = lista.map(p => {
       const ag = p.agotado || agotados.has(p.id);
      return `<button class="prod ${p.grupos.length ? 'extras' : ''} ${p.foto ? 'con-foto' : ''}" type="button" data-prod="${p.id}" ${ag ? 'disabled' : ''}>
        ${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : `<i class="ini">${esc(p.nombre.replace(/^(Burro|Nude|Taco|Quesadilla|Combo)\s+/i, '').slice(0, 2))}</i>`}
        <b>${esc(p.nombre)}</b><span>${ag ? 'Agotado' : euros(enSala() && Number.isInteger(p.precio_local) ? p.precio_local : p.precio)}</span></button>`;
    }).join('');
  }
  const quitaAcentos = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  $('#cats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { catActiva = b.dataset.cat; $('#buscar').value = ''; $('#buscar-x').hidden = true; pintaProductos(); } });
  $('#buscar').addEventListener('input', () => { $('#buscar-x').hidden = !$('#buscar').value; pintaProductos(); });
  $('#buscar-x').onclick = () => { $('#buscar').value = ''; $('#buscar-x').hidden = true; pintaProductos(); $('#buscar').focus(); };
  $('#prods').addEventListener('click', e => {
    const b = e.target.closest('[data-prod]'); if (!b || b.disabled) return;
    const p = idx.prod.get(b.dataset.prod);
    if (p.grupos.length) abreExtras(p); else anade({ producto: p.id, cantidad: 1, opciones: [], nota: '' });
    if ($('#buscar').value) { $('#buscar').value = ''; $('#buscar-x').hidden = true; pintaProductos(); }
  });

  function anade(l) {
    const lista = pendientes[cuenta.id] = pendientes[cuenta.id] || [];
    const igual = lista.find(x => x.producto === l.producto && x.nota === l.nota && x.opciones.slice().sort().join() === l.opciones.slice().sort().join());
    if (igual) igual.cantidad = Math.min(20, igual.cantidad + l.cantidad); else lista.push(l);
    guardaPend(); pintaCuenta();
  }

  // Lo que queda por cobrar de cada línea enviada (si se dividió la cuenta, parte ya está pagada).
  const porCobrar = l => l.cantidad - (l.pagadas || 0);
  const lineasPendientes = () => pedidosCuenta.filter(p => p.estado !== 'cancelado').sort((a, b) => a.numero - b.numero)
    .flatMap(p => p.lineas.map((l, i) => ({ ...l, cantidad: porCobrar(l), _pedido: p.id, _indice: i }))).filter(l => l.cantidad > 0);
  const nombreOps = l => l.opciones.map(oid => { for (const g of idx.grupos.values()) { const o = g.opciones.find(x => x.id === oid); if (o) return o.nombre; } return ''; });
  function pintaCuenta() {
    $('#c-nombre').textContent = cuenta.nombre;
    $('#c-info').textContent = `Abierta hace ${minutos(cuenta.abierta)} min${cuenta.comensales ? ` · ${cuenta.comensales} ${cuenta.comensales === 1 ? 'persona' : 'personas'}` : ''}${cuenta.para_llevar ? ' · para llevar' : ''}`;
    const ESTADO = { nuevo: 'En cocina', preparando: 'Preparando', listo: 'Listo', entregado: 'Servido', cancelado: 'Cancelado' };
    const enviados = pedidosCuenta.filter(p => !(p.estado === 'cancelado' && !p.lineas.length && !(p.anuladas || []).length)).sort((a, b) => a.numero - b.numero).map(p => `
      <div class="grupo-env"><span>Comanda #${p.numero} · ${new Date(p.creado).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}</span><span class="estado ${p.estado}">${ESTADO[p.estado]}</span></div>
      ${p.lineas.map((l, i) => `<div class="ln enviada ${p.estado === 'cancelado' ? 'cancelada' : ''} ${porCobrar(l) < 1 ? 'cobrada' : ''}" ${p.estado !== 'cancelado' && porCobrar(l) > 0 ? `data-pid="${p.id}" data-idx="${i}" title="Tocar para quitar"` : ''}>
        <span class="cant-fija">${l.cantidad}×</span>
        <div>${esc(l.nombre)}${l.opciones.map(o => `<small>+ ${esc(o.nombre)}</small>`).join('')}${l.nota ? `<small>“${esc(l.nota)}”</small>` : ''}${l.dto ? `<small class="dto">${l.dto === 100 ? 'Invitado' : '−' + l.dto + ' %'} · antes ${euros(l.unitario_original * l.cantidad)}</small>` : ''}${l.pagadas ? `<small class="pagado">✓ ${l.pagadas === l.cantidad ? 'Cobrado' : l.pagadas + ' cobrado' + (l.pagadas > 1 ? 's' : '')}</small>` : ''}</div>
        <span class="imp">${euros(l.unitario * l.cantidad)}</span></div>`).join('')}
      ${(p.anuladas || []).map(l => `<div class="ln quitada"><span class="cant-fija">${l.cantidad}×</span><div>${esc(l.nombre)}<small>Quitado: ${esc(l.motivo || '')}</small></div><span class="imp">−${euros(l.unitario * l.cantidad)}</span></div>`).join('')}`).join('');
    const pend = pendientes[cuenta.id] || [];
    const pendHTML = pend.length ? `<div class="grupo-env"><span>Sin enviar</span></div>` + pend.map((l, i) => {
      const p = idx.prod.get(l.producto); const ops = nombreOps(l);
      return `<div class="ln pendiente">
        <div class="ctl"><button type="button" data-menos="${i}" aria-label="Uno menos">−</button><output>${l.cantidad}</output><button type="button" data-mas="${i}" aria-label="Uno más">+</button></div>
        <div class="ln-txt" data-nota="${i}" role="button" title="Tocar para añadir una nota">${esc(p ? p.nombre : '¿?')}${ops.map(o => `<small>+ ${esc(o)}</small>`).join('')}${l.nota ? `<small class="nota">📝 ${esc(l.nota)}</small>` : '<small class="add-nota">📝 Nota</small>'}</div>
        <span class="imp">${p ? euros(precioLinea(idx, l, enSala()) * l.cantidad) : ''}</span></div>`;
    }).join('') : '';
    $('#c-lineas').innerHTML = (enviados + pendHTML) || '<p class="vacio">Toca los productos de la carta para añadirlos.</p>';
    const tEnv = lineasPendientes().reduce((s, l) => s + l.unitario * l.cantidad, 0);
    const tCob = pedidosCuenta.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + p.lineas.reduce((a, l) => a + l.unitario * (l.pagadas || 0), 0), 0);
    if (tCob) $('#c-info').textContent += ` · cobrado ${euros(tCob)}`;
    const tPend = pend.reduce((s, l) => s + (idx.prod.has(l.producto) ? precioLinea(idx, l, enSala()) * l.cantidad : 0), 0);
    $('#c-total').textContent = euros(tEnv + tPend); { const nL = ((pedidosCuenta || []).flatMap(x => (x.lineas || [])).length) + (((pendientes[cuenta && cuenta.id] || [])).length); $('#c-hoja-txt').textContent = `Cuenta · ${nL} ${nL === 1 ? 'línea' : 'líneas'} · ${$('#c-total').textContent}`; }
    if (enviando[cuenta.id]) { $('#c-enviar').textContent = 'Enviando…'; $('#c-enviar').disabled = true; }
    else {
      $('#c-enviar').textContent = pend.length ? `Enviar a cocina (${pend.reduce((s, l) => s + l.cantidad, 0)})` : 'Enviar a cocina';
      $('#c-enviar').disabled = !pend.length;
    }
    $('#c-cobrar').disabled = !(tEnv + tPend);
    const el = $('#c-lineas'); el.scrollTop = el.scrollHeight;
  }
  $('#c-lineas').addEventListener('click', e => {
    const env = e.target.closest('.ln.enviada[data-pid]');
    if (env) { abreQuitar(env.dataset.pid, +env.dataset.idx); return; }
    const t = e.target; const pend = pendientes[cuenta.id]; if (!pend) return;
    const nt = t.closest('[data-nota]'); if (nt) { abreNota(+nt.dataset.nota); return; }
    if (t.dataset.mas) pend[t.dataset.mas].cantidad = Math.min(20, pend[t.dataset.mas].cantidad + 1);
    else if (t.dataset.menos) { pend[t.dataset.menos].cantidad--; if (pend[t.dataset.menos].cantidad < 1) pend.splice(t.dataset.menos, 1); }
    else return;
    guardaPend(); pintaCuenta();
  });

  async function enviar() {
    const c = cuenta; const pend = pendientes[c.id] || []; if (!pend.length) return true;
    if (enviando[c.id]) return false;                 // ya va de camino: nada de comandas dobles
    enviando[c.id] = true;
    const n = pend.reduce((s, l) => s + l.cantidad, 0);
    try {
      pintaCuenta();
      const r = await api.enviarComanda(c.id, pend.map(({ producto, cantidad, opciones, nota }) => ({ producto, cantidad, opciones, nota })), $('#c-nota').value.trim());
      delete pendientes[c.id]; guardaPend(); $('#c-nota').value = '';
      aviso(`✓ Enviado a cocina · comanda #${r.numero} · ${n} ${n === 1 ? 'producto' : 'productos'} · ${c.nombre}`);
      if (cuenta && cuenta.id === c.id) pedidosCuenta = await api.pedidosDeCuenta(c.id);
      return true;
    } catch (ex) {
      if (esDeRed(ex)) { ponConexion(false); aviso('✗ Sin conexión: no ha llegado a cocina. Queda guardado aquí; envíalo cuando vuelva la conexión.', true); }
      else aviso('✗ No se ha enviado: ' + mensajeError(ex) + '. Vuelve a intentarlo.', true);
      return false;
    }
    finally { delete enviando[c.id]; if (cuenta && cuenta.id === c.id) pintaCuenta(); }
  }
  $('#c-enviar').onclick = enviar;

  /* ── Nota en una línea sin enviar (sin cebolla, salsa aparte…) ── */
  const dn = $('#dlg-nota'); let notaIdx = -1;
  const mismaLinea = (a, b) => a.producto === b.producto && (a.nota || '') === (b.nota || '') && a.opciones.slice().sort().join() === b.opciones.slice().sort().join();
  function abreNota(i) {
    const l = (pendientes[cuenta.id] || [])[i]; if (!l) return;
    notaIdx = i; const p = idx.prod.get(l.producto);
    $('#dn-prod').textContent = `${l.cantidad}× ${p ? p.nombre : ''}`;
    $('#dn-texto').value = l.nota || ''; $('#dn-cant').textContent = l.cantidad;
    $('#dn-una-l').hidden = l.cantidad < 2; $('#dn-una').checked = false; $('#dn-quitar').hidden = !l.nota;
    dn.showModal();
  }
  $('#dn-rapidas').onclick = e => {
    const b = e.target.closest('button[data-r]'); if (!b) return;
    const inp = $('#dn-texto'); const v = inp.value.trim();
    if (quitaAcentos(v).includes(quitaAcentos(b.dataset.r))) return;
    inp.value = v ? v + ', ' + b.dataset.r.toLowerCase() : b.dataset.r;
  };
  function guardaNota(texto) {
    const lista = pendientes[cuenta.id] || []; const l = lista[notaIdx]; dn.close(); if (!l) return;
    texto = texto.trim().slice(0, 140);
    if ($('#dn-una').checked && l.cantidad > 1 && texto !== (l.nota || '')) {
      l.cantidad--; lista.splice(notaIdx + 1, 0, { ...l, opciones: l.opciones.slice(), cantidad: 1, nota: texto });
    } else l.nota = texto;
    for (let i = 0; i < lista.length; i++) for (let j = lista.length - 1; j > i; j--)   // junta líneas que han quedado iguales
      if (mismaLinea(lista[i], lista[j])) { lista[i].cantidad = Math.min(20, lista[i].cantidad + lista[j].cantidad); lista.splice(j, 1); }
    guardaPend(); pintaCuenta();
  }
  $('#dn-ok').onclick = () => guardaNota($('#dn-texto').value);
  $('#dn-quitar').onclick = () => { $('#dn-una').checked = false; guardaNota(''); };
  $('#dn-texto').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); guardaNota($('#dn-texto').value); } });

  /* ── Extras ── */
  const dp = $('#dlg-prod'); let enCurso = null;
  function abreExtras(p) {
    enCurso = { producto: p.id, cantidad: 1, opciones: [], nota: '' };
    $('#dp-nombre').textContent = p.nombre; $('#dp-nota').value = '';
    $('#dp-grupos').innerHTML = p.grupos.map(gid => {
      const g = idx.grupos.get(gid); const uno = g.max === 1;
      return `<div class="grupo" data-grupo="${gid}"><h3>${esc(g.nombre)}<span>${g.min ? 'Obligatorio' : uno ? 'Opcional' : 'Hasta ' + g.max}</span></h3>
        <div class="ops">${g.opciones.map(o => `<label><input type="${uno ? 'radio' : 'checkbox'}" name="g-${gid}" value="${o.id}"> ${esc(o.nombre)}${o.precio ? `<small>+${euros(o.precio)}</small>` : ''}</label>`).join('')}</div></div>`;
    }).join('');
    refrescaExtras(); dp.showModal();
  }
  function refrescaExtras() {
    enCurso.opciones = [...dp.querySelectorAll('#dp-grupos input:checked')].map(i => i.value);
    dp.querySelectorAll('.grupo').forEach(gEl => {
      const g = idx.grupos.get(gEl.dataset.grupo); if (g.max === 1) return;
      const n = gEl.querySelectorAll('input:checked').length;
      gEl.querySelectorAll('input:not(:checked)').forEach(i => { i.disabled = n >= g.max; });
    });
    $('#dp-cant').textContent = enCurso.cantidad;
    $('#dp-precio').textContent = euros(precioLinea(idx, enCurso, enSala()) * enCurso.cantidad);
  }
  dp.addEventListener('change', e => { if (e.target.closest('#dp-grupos')) { e.target.closest('.grupo').classList.remove('falta'); refrescaExtras(); } });
  $('#dp-menos').onclick = () => { enCurso.cantidad = Math.max(1, enCurso.cantidad - 1); refrescaExtras(); };
  $('#dp-mas').onclick = () => { enCurso.cantidad = Math.min(20, enCurso.cantidad + 1); refrescaExtras(); };
  $('#dp-ok').onclick = () => {
    refrescaExtras(); enCurso.nota = $('#dp-nota').value.trim();
    const p = idx.prod.get(enCurso.producto);
    const falta = p.grupos.map(g => idx.grupos.get(g)).find(g => enCurso.opciones.filter(o => g.opciones.some(x => x.id === o)).length < g.min);
    if (falta) { dp.querySelector(`[data-grupo="${falta.id}"]`).classList.add('falta'); return; }
    anade(enCurso); dp.close();
  };

  /* ── Menú de la cuenta ── */
  $('#c-menu').onclick = () => { $('#menu-cuenta').hidden = !$('#menu-cuenta').hidden; };
  document.addEventListener('click', e => { if (!e.target.closest('#c-menu, #menu-cuenta')) $('#menu-cuenta').hidden = true; });
  $('#menu-cuenta').addEventListener('click', async e => {
    const m = e.target.dataset.m; if (!m) return; $('#menu-cuenta').hidden = true;
    if (m === 'precuenta') {
      const lineas = lineasPendientes();
      if ((pendientes[cuenta.id] || []).length) alert('Ojo: hay productos sin enviar a cocina; no salen en la pre-cuenta.');
      const tot = calculaTicket(lineas).total;
      OP.imprimir(OP.ticketPrecuenta(cuenta.nombre, lineas, tot));
      api.registrarPrecuenta(cuenta.id, tot);
    }
    if (m === 'mover') {
      const libres = mesas.filter(x => x.tipo !== 'deco' && !cuentas.some(c => c.mesa_id === x.id));
      $('#mv-mesas').innerHTML = libres.map(x => `<button class="mesa" type="button" value="${esc(x.id)}"><strong>${esc(x.nombre)}</strong><small>${esc(x.zona)}</small></button>`).join('') || '<p class="vacio">No hay mesas libres.</p>';
      $('#dlg-mover').showModal();
    }
    if (m === 'anular') abreAnular();
    if (m === 'comensales') preguntaComensales(true);
    if (m === 'pasar' || m === 'juntar') abrePasar(m);
  });
  /* ── Comensales: se preguntan al abrir una mesa (se puede saltar) y se cambian desde el menú ── */
  function preguntaComensales(cambiar) {
    if (!cuenta || (!cambiar && (cuenta.comensales || !cuenta.mesa_id))) return;
    const mesa = mesas.find(x => x.id === cuenta.mesa_id);
    $('#pe-mesa').textContent = cuenta.nombre + (mesa && mesa.plazas ? ` · ${mesa.plazas} plazas` : '');
    $('#pe-num').innerHTML = [...Array(12)].map((_, i) => `<button type="button" data-n="${i + 1}" class="${cuenta.comensales === i + 1 ? 'sel' : ''}">${i + 1}</button>`).join('');
    $('#pe-quitar').hidden = !cuenta.comensales;
    $('#dlg-pers').showModal();
  }
  async function ponComensales(n) {
    const c = cuenta; $('#dlg-pers').close(); if (!c) return;
    try { await api.ponerComensales(c.id, n); c.comensales = n; if (cuenta && cuenta.id === c.id) pintaCuenta(); }
    catch (ex) { aviso('No se han guardado los comensales: ' + mensajeError(ex), true); }
  }
  $('#pe-num').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) ponComensales(+b.dataset.n); });
  $('#pe-quitar').onclick = () => ponComensales(null);
  $('#mv-mesas').addEventListener('click', async e => {
    const b = e.target.closest('button.mesa'); if (!b) return;
    try { await api.moverCuenta(cuenta.id, b.value); $('#dlg-mover').close(); await recarga(); }
    catch (ex) { alert(mensajeError(ex)); }
  });

  /* ── Pasar productos a otra cuenta / juntar mesas ──
     Se eligen unidades (de lo enviado sin cobrar y de lo aún sin enviar) y la cuenta de destino:
     una cuenta abierta o, al pasar, una mesa libre (se abre su cuenta). Juntar pasa todo y cierra esta. */
  let psModo = 'pasar', psSel = new Map(), psDest = null, psLineas = [];
  function abrePasar(modo) {
    psModo = modo; psSel = new Map(); psDest = null;
    const pend = pendientes[cuenta.id] || [];
    psLineas = lineasPendientes().map(l => ({ k: `e:${l._pedido}:${l._indice}`, nombre: l.nombre, extra: l.opciones.map(o => o.nombre), nota: l.nota, max: l.cantidad, unitario: l.unitario, pedido: l._pedido, indice: l._indice }))
      .concat(pend.map((l, i) => { const p = idx.prod.get(l.producto); return { k: `p:${i}`, nombre: p ? p.nombre : '¿?', extra: nombreOps(l), nota: l.nota, max: l.cantidad, unitario: p ? precioLinea(idx, l, enSala()) : 0, sinEnviar: true, i }; }));
    const juntar = modo === 'juntar';
    $('#ps-titulo').textContent = juntar ? `Juntar ${cuenta.nombre} con otra mesa` : `Pasar productos de ${cuenta.nombre}`;
    $('#ps-paso-lineas').hidden = juntar;
    $('#ps-dest-tit').textContent = juntar ? '¿Con qué cuenta la juntas?' : '2 · ¿A qué cuenta?';
    $('#ps-info').textContent = juntar ? `Todo lo que falta por cobrar (${psLineas.reduce((s, l) => s + l.max, 0)} uds.) pasa a la cuenta que elijas y ${cuenta.mesa_id ? 'esta mesa queda libre' : 'esta cuenta se cierra'}.` : '';
    $('#ps-info').hidden = !juntar;
    const otras = cuentas.filter(c => c.id !== cuenta.id && !!c.para_llevar === !!cuenta.para_llevar);
    const libres = juntar || cuenta.para_llevar ? [] : mesas.filter(x => x.tipo !== 'deco' && !cuentas.some(c => c.mesa_id === x.id));
    $('#ps-destinos').innerHTML = otras.map(c => `<button class="mesa ocupada" type="button" value="c:${esc(c.id)}"><strong>${esc(c.nombre)}</strong><small>Abierta · ${minutos(c.abierta)} min</small></button>`).join('')
      + libres.map(x => `<button class="mesa" type="button" value="m:${esc(x.id)}"><strong>${esc(x.nombre)}</strong><small>Libre · ${esc(x.zona)}</small></button>`).join('')
      || `<p class="vacio">No hay otra cuenta abierta${cuenta.para_llevar ? ' para llevar' : ''}.</p>`;
    $('#ps-error').hidden = true;
    if (!psLineas.length && !juntar) { alert('No hay productos sin cobrar en esta cuenta.'); return; }
    pintaPasar(); $('#dlg-pasar').showModal();
  }
  function pintaPasar() {
    $('#ps-lineas').innerHTML = psLineas.map(l => { const q = psSel.get(l.k) || 0;
      return `<div class="ln ps-ln ${q ? 'on' : ''}" data-k="${l.k}">
        <div class="ctl"><button type="button" data-ps="-1" aria-label="Uno menos">−</button><output>${q}</output><button type="button" data-ps="1" aria-label="Uno más">+</button></div>
        <div class="ps-txt" data-ps="todo">${esc(l.nombre)} <small>de ${l.max}</small>${l.extra.map(o => `<small>+ ${esc(o)}</small>`).join('')}${l.nota ? `<small class="nota">📝 ${esc(l.nota)}</small>` : ''}${l.sinEnviar ? '<small class="ps-sin">Sin enviar</small>' : ''}</div>
        <span class="imp">${q ? euros(l.unitario * q) : ''}</span></div>`; }).join('');
    $('#ps-destinos').querySelectorAll('button.mesa').forEach(b => b.classList.toggle('sel', b.value === psDest));
    const n = [...psSel.values()].reduce((s, q) => s + q, 0);
    const dest = psDest && $('#ps-destinos').querySelector(`button[value="${CSS.escape(psDest)}"] strong`);
    const ok = $('#ps-ok');
    if (psModo === 'juntar') { ok.textContent = dest ? `Juntar con ${dest.textContent}` : 'Juntar'; ok.disabled = !psDest; }
    else { ok.textContent = n ? `Pasar ${n} ${n === 1 ? 'producto' : 'productos'}${dest ? ' a ' + dest.textContent : ''}` : 'Pasar'; ok.disabled = !n || !psDest; }
  }
  $('#ps-lineas').addEventListener('click', e => {
    const b = e.target.closest('[data-ps]'); const row = e.target.closest('[data-k]'); if (!b || !row) return;
    const l = psLineas.find(x => x.k === row.dataset.k); const q = psSel.get(l.k) || 0;
    const nq = b.dataset.ps === 'todo' ? (q ? 0 : l.max) : Math.max(0, Math.min(l.max, q + Number(b.dataset.ps)));
    nq ? psSel.set(l.k, nq) : psSel.delete(l.k); pintaPasar();
  });
  $('#ps-todo').onclick = () => { const todo = psLineas.every(l => psSel.get(l.k) === l.max); psSel = new Map(todo ? [] : psLineas.map(l => [l.k, l.max])); pintaPasar(); };
  $('#ps-destinos').addEventListener('click', e => { const b = e.target.closest('button.mesa'); if (!b) return; psDest = b.value; $('#ps-error').hidden = true; pintaPasar(); });
  // Lo que aún no se ha enviado a cocina se pasa aquí mismo (está guardado en este TPV).
  function pasaSinEnviar(origen, destino, sel) {
    const de = pendientes[origen] || []; const a = pendientes[destino] || (pendientes[destino] = []);
    sel.sort((x, y) => y.i - x.i).forEach(({ i, q }) => { const l = de[i]; if (!l) return;
      const mov = { ...l, opciones: l.opciones.slice(), cantidad: q }; if (q >= l.cantidad) de.splice(i, 1); else l.cantidad -= q;
      const igual = a.find(x => mismaLinea(x, mov)); igual ? igual.cantidad += mov.cantidad : a.push(mov); });
    if (!de.length) delete pendientes[origen]; guardaPend();
  }
  $('#ps-ok').onclick = async () => {
    const ok = $('#ps-ok'); ok.disabled = true; $('#ps-error').hidden = true;
    const origen = cuenta.id, nombreDest = $('#ps-destinos').querySelector(`button[value="${CSS.escape(psDest)}"] strong`).textContent;
    try {
      let destId = psDest.slice(2);
      if (psModo === 'juntar') {
        const r = await api.juntarCuentas(origen, destId);
        pasaSinEnviar(origen, destId, (pendientes[origen] || []).map((l, i) => ({ i, q: l.cantidad })));
        delete pendientes[origen]; guardaPend();
        $('#dlg-pasar').close(); await recarga();
        const d = cuentas.find(c => c.id === destId); if (d) await abrir(d); else verSala();
        aviso(`✓ Juntada con ${nombreDest}${r && r.unidades ? ` · ${r.unidades} ${r.unidades === 1 ? 'producto pasado' : 'productos pasados'}` : ''}`);
        return;
      }
      if (psDest.startsWith('m:')) destId = (await api.abrirCuenta({ local: LOCAL, mesa_id: destId })).id;
      const elegidas = psLineas.filter(l => psSel.get(l.k));
      const items = elegidas.filter(l => !l.sinEnviar).map(l => ({ pedido: l.pedido, indice: l.indice, cantidad: psSel.get(l.k) }));
      if (items.length) await api.pasarLineas(origen, destId, items);
      pasaSinEnviar(origen, destId, elegidas.filter(l => l.sinEnviar).map(l => ({ i: l.i, q: psSel.get(l.k) })));
      const n = elegidas.reduce((s, l) => s + psSel.get(l.k), 0);
      $('#dlg-pasar').close(); await recarga();
      pedidosCuenta = await api.pedidosDeCuenta(origen); pintaCuenta();
      aviso(`✓ ${n} ${n === 1 ? 'producto pasado' : 'productos pasados'} a ${nombreDest}`);
    } catch (ex) { $('#ps-error').textContent = mensajeError(ex); $('#ps-error').hidden = false; ok.disabled = false; }
  };

  /* ── Agotados: se marcan desde el TPV (lo mismo que en comandas y en el admin) ──
     Pestañas por categoría para ir rápido y un botón por categoría para agotarla o activarla entera. */
  let agCat = '';
  const agCats = () => carta.categorias.filter(c => !c.oculta && c.productos.some(id => { const p = idx.prod.get(id); return p && !p.oculto; }));
  const prodsCat = c => c.productos.map(id => idx.prod.get(id)).filter(p => p && !p.oculto);
  const estaAgotado = p => p.agotado || agotados.has(p.id);
  function pintaAgotados() {
    const q = quitaAcentos($('#ag-buscar').value.trim());
    $('#b-agotados').textContent = 'Agotados' + (agotados.size ? ` (${agotados.size})` : '');
    const cats = agCats();
    if (agCat && !cats.some(c => c.clave === agCat)) agCat = '';
    $('#ag-cats').innerHTML = `<button type="button" data-agc="" class="${agCat ? '' : 'activa'}">Todas</button>` + cats.map(c => {
      const n = prodsCat(c).filter(estaAgotado).length;
      return `<button type="button" data-agc="${esc(c.clave)}" class="${c.clave === agCat ? 'activa' : ''}">${esc(c.nombre)}${n ? ` <b>${n}</b>` : ''}</button>`;
    }).join('');
    $('#ag-lista').innerHTML = cats.filter(c => !agCat || c.clave === agCat || q).map(c => {
      const todos = prodsCat(c); const ps = todos.filter(p => quitaAcentos(p.nombre).includes(q));
      if (!ps.length) return '';
      const libres = todos.filter(p => !p.agotado);                 // los agotados desde el admin no se tocan aquí
      const todosAg = libres.length && libres.every(p => agotados.has(p.id));
      return `<div class="ag-cab"><h3>${esc(c.nombre)}</h3>${libres.length ? `<button type="button" class="b b-mini ${todosAg ? 'b-ok' : 'ag-todo'}" data-agtodo="${esc(c.clave)}" data-poner="${todosAg ? '0' : '1'}">${todosAg ? 'Activar todos' : 'Agotar todos'}</button>` : ''}</div>` +
        ps.map(p => p.agotado
          ? `<label class="fijo"><input type="checkbox" checked disabled> ${esc(p.nombre)} <small>(agotado desde el admin)</small></label>`
          : `<label><input type="checkbox" data-ag="${p.id}" ${agotados.has(p.id) ? 'checked' : ''}> ${esc(p.nombre)}</label>`).join('');
    }).join('') || '<p class="vacio">Nada con ese nombre.</p>';
  }
  const trasCambio = () => { pintaAgotados(); if (cuenta) pintaProductos(); };
  $('#b-agotados').onclick = () => { if (!carta) return; $('#ag-buscar').value = ''; agCat = ''; pintaAgotados(); $('#dlg-agotados').showModal(); };
  $('#ag-buscar').oninput = pintaAgotados;
  $('#ag-cats').addEventListener('click', e => { const b = e.target.closest('[data-agc]'); if (!b) return; agCat = b.dataset.agc; $('#ag-buscar').value = ''; pintaAgotados(); $('#ag-lista').scrollTop = 0; });
  $('#ag-lista').addEventListener('change', async e => {
    const id = e.target.dataset.ag; if (!id) return; const p = idx.prod.get(id);
    try {
      await api.marcarAgotado(LOCAL, id, e.target.checked);
      e.target.checked ? agotados.add(id) : agotados.delete(id);
      aviso(e.target.checked ? `${p.nombre}: agotado` : `${p.nombre}: vuelve a haber`);
      trasCambio();
    } catch (ex) { e.target.checked = !e.target.checked; aviso('No se ha podido guardar: ' + mensajeError(ex), true); }
  });
  // Toda la categoría de golpe.
  $('#ag-lista').addEventListener('click', async e => {
    const b = e.target.closest('[data-agtodo]'); if (!b) return;
    const c = carta.categorias.find(x => x.clave === b.dataset.agtodo); const poner = b.dataset.poner === '1';
    const cambiar = prodsCat(c).filter(p => !p.agotado && agotados.has(p.id) !== poner);
    if (!cambiar.length) return;
    if (poner && !confirm(`¿Marcar como agotados los ${cambiar.length} productos de "${c.nombre}"?`)) return;
    b.disabled = true;
    const r = await Promise.allSettled(cambiar.map(p => api.marcarAgotado(LOCAL, p.id, poner).then(() => { poner ? agotados.add(p.id) : agotados.delete(p.id); })));
    const mal = r.filter(x => x.status === 'rejected').length;
    aviso(mal ? `No se han podido cambiar ${mal} de ${cambiar.length}. Vuelve a intentarlo.` : `${c.nombre}: ${poner ? 'todo agotado' : 'todo activo otra vez'}`, !!mal);
    trasCambio();
  });

  /* ── Cobrar ── */
  const dc = $('#dlg-cobrar'); let aCobrar = 0, lineasCobro = [], promos = [], todasPend = [], modo = 'todo', elegidos = {};
  // Propina: aparte del ticket (no es venta ni lleva IVA). 'p0' nada, 'red' redondear, 'p5'/'p10' %, 'otra' a mano.
  let propModo = 'p0', propina = 0;
  const calculaPropina = () => {
    if (!aCobrar) return 0;
    if (propModo === 'red') { const r = Math.ceil(aCobrar / 100) * 100 - aCobrar; return r || 100; }
    if (propModo === 'p5') return Math.round(aCobrar * 0.05 / 10) * 10;
    if (propModo === 'p10') return Math.round(aCobrar * 0.10 / 10) * 10;
    if (propModo === 'otra') { const v = centimos($('#cb-prop-otra').value); return isNaN(v) ? 0 : Math.max(0, v); }
    return 0;
  };
  function pintaPropina() {
    propina = calculaPropina();
    const red = Math.ceil(aCobrar / 100) * 100 - aCobrar || 100;
    $('#cb-prop').innerHTML = [['p0', 'Sin propina'], ['red', `Redondear (+${euros(red)})`], ['p5', '5 %'], ['p10', '10 %'], ['otra', 'Otra']]
      .map(([k, t]) => `<button type="button" data-prop="${k}" class="${k === propModo ? 'sel' : ''}">${t}</button>`).join('');
    $('#cb-prop-otra-l').hidden = propModo !== 'otra';
    $('#cb-prop-txt').hidden = !propina;
    $('#cb-prop-txt').textContent = `Propina ${euros(propina)} · total a pagar ${euros(aCobrar + propina)}`;
    $('#cb-propina').hidden = aCobrar === 0;
  }
  $('#cb-prop').addEventListener('click', e => { const b = e.target.closest('[data-prop]'); if (!b) return; propModo = b.dataset.prop; recalcula(); if (propModo === 'otra') $('#cb-prop-otra').focus(); });
  $('#cb-prop-otra').addEventListener('input', () => recalcula());
  const clave = l => l._pedido + ':' + l._indice;
  function pintaModo() {
    dc.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('activo', b.dataset.modo === modo));
    $('#cb-items').hidden = modo !== 'productos';
    $('#cb-items').innerHTML = todasPend.map(l => { const k = clave(l), n = elegidos[k] || 0;
      return `<div class="cb-item ${n ? 'sel' : ''}"><span>${esc(l.nombre)}<small>${euros(l.unitario)} · quedan ${l.cantidad}</small></span>
        <div class="ctl"><button type="button" data-k="${k}" data-d="-1" aria-label="Uno menos">−</button><output>${n}</output><button type="button" data-k="${k}" data-d="1" aria-label="Uno más">+</button></div></div>`; }).join('');
    lineasCobro = modo === 'todo' ? todasPend : todasPend.filter(l => elegidos[clave(l)]).map(l => ({ ...l, cantidad: elegidos[clave(l)] }));
  }
  dc.addEventListener('click', e => {
    const m = e.target.closest('[data-modo]'); if (m) { modo = m.dataset.modo; pintaModo(); recalcula(); return; }
    const b = e.target.closest('#cb-items [data-k]'); if (!b) return;
    const l = todasPend.find(x => clave(x) === b.dataset.k);
    elegidos[b.dataset.k] = Math.max(0, Math.min(l.cantidad, (elegidos[b.dataset.k] || 0) + +b.dataset.d));
    pintaModo(); recalcula();
  });
  $('#cb-partes').addEventListener('input', () => recalcula());
  const promoSel = () => promos.find(p => p.id === $('#cb-promo').value) || null;
  $('#c-cobrar').onclick = async () => {
    if ((pendientes[cuenta.id] || []).length) {
      if (!confirm('Hay productos sin enviar a cocina. ¿Enviarlos ahora y cobrar?')) return;
      if (!(await enviar())) return;
    }
    todasPend = lineasPendientes(); modo = 'todo'; elegidos = {};
    lineasCobro = todasPend;
    if (!todasPend.length) return;
    try { promos = (await api.promociones(LOCAL)).filter(p => p.activa); } catch (e) { promos = []; }
    $('#cb-promo').innerHTML = '<option value="">Sin promoción</option>' + promos.map(p => {
      const d = OP.descuentoPromo(p, lineasCobro);
      return `<option value="${p.id}" ${d ? '' : 'disabled'}>${esc(p.codigo)} · ${esc(p.nombre)}${d ? ` (−${euros(d)})` : ' (no aplica)'}</option>`;
    }).join('');
    $('#cb-nombre').textContent = cuenta.nombre; $('#cb-nota').value = '';
    $('#cb-entregado').value = ''; $('#cb-error').hidden = true;
    dc.querySelector('[value=efectivo]').checked = true;
    $('#cb-partes').value = ''; propModo = 'p0'; $('#cb-prop-otra').value = ''; pintaModo();
    recalcula(); dc.showModal();
  };
  function recalcula() {
    const promo = promoSel(); const r = calculaTicket(lineasCobro, promo); aCobrar = r.total;
    const np = parseInt($('#cb-partes').value, 10);
    $('#cb-cada').textContent = np > 1 && aCobrar ? `${euros(Math.ceil(aCobrar / np))} cada uno (${np} personas)` : '';
    $('#cb-ok').disabled = !lineasCobro.length;
    $('#cb-ok').textContent = modo === 'productos' ? (lineasCobro.length ? `Cobrar ${euros(aCobrar)} de ${euros(calculaTicket(todasPend).total)}` : 'Elige qué se cobra') : 'Confirmar cobro';
    $('#cb-nota-l').hidden = !(promo && promo.requiere_nota);
    $('#cb-desc').hidden = !r.descuento; $('#cb-bruto').textContent = euros(r.bruto); $('#cb-dto').textContent = '−' + euros(r.descuento);
    pintaPropina(); const aPagar = aCobrar + propina;
    $('#cb-total').textContent = euros(aCobrar); $('#cb-tarjeta-imp').textContent = euros(aPagar);
    const gratis = aCobrar === 0;
    $('#cb-invita').hidden = !gratis; $('#cb-metodos').hidden = gratis;
    const v = [aPagar, ...[500, 1000, 2000, 5000].filter(x => x > aPagar)].slice(0, 4);
    $('#cb-rapidos').innerHTML = v.map((x, i) => `<button type="button" data-v="${x}">${i === 0 ? 'Justo' : euros(x)}</button>`).join('');
    metodo();
  }
  $('#cb-promo').onchange = () => { $('#cb-error').hidden = true; recalcula(); if (!$('#cb-nota-l').hidden) $('#cb-nota').focus(); };
  const centimos = v => Math.round(parseFloat(String(v).replace(',', '.')) * 100);
  function metodo() {
    const gratis = aCobrar === 0;
    const ef = dc.querySelector('[name=metodo]:checked').value === 'efectivo';
    $('#cb-efectivo').hidden = gratis || !ef; $('#cb-tarjeta').hidden = gratis || ef; cambio();
  }
  function cambio() {
    const e = centimos($('#cb-entregado').value);
    const t = aCobrar + propina;
    $('#cb-cambio').textContent = isNaN(e) ? '—' : e < t ? 'falta ' + euros(t - e) : euros(e - t);
  }
  dc.addEventListener('change', e => { if (e.target.name === 'metodo') metodo(); });
  $('#cb-entregado').addEventListener('input', cambio);
  $('#cb-rapidos').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { $('#cb-entregado').value = (b.dataset.v / 100).toFixed(2).replace('.', ','); cambio(); } });
  $('#cb-ok').onclick = async () => {
    const met = dc.querySelector('[name=metodo]:checked').value; const promo = promoSel();
    const fallo = t => { $('#cb-error').textContent = t; $('#cb-error').hidden = false; };
    if (promo && promo.requiere_nota && $('#cb-nota').value.trim().length < 2) return fallo(`"${promo.nombre}" necesita una nota: por ejemplo, el nombre del empleado o del socio.`);
    let entregado = null;
    if (met === 'efectivo' && aCobrar > 0) {
      entregado = $('#cb-entregado').value ? centimos($('#cb-entregado').value) : aCobrar + propina;
      if (isNaN(entregado) || entregado < aCobrar + propina) return fallo('El efectivo entregado no llega al total' + (propina ? ' con la propina.' : '.'));
    }
    if (propModo === 'otra' && propina > Math.min(20000, aCobrar)) return fallo('La propina no puede pasar del total ni de 200 €.');
    const btn = $('#cb-ok'); btn.disabled = true;
    try {
      const items = modo === 'productos' ? lineasCobro.map(l => ({ pedido: l._pedido, indice: l._indice, cantidad: l.cantidad })) : undefined;
      const parcial = modo === 'productos' && lineasCobro.reduce((a, l) => a + l.cantidad, 0) < todasPend.reduce((a, l) => a + l.cantidad, 0);
      const t = await api.cobrar({ cuenta: cuenta.id, metodo: met, entregado, promocion: promo ? promo.id : null, nota: $('#cb-nota').value.trim(), items, propina: aCobrar ? propina : 0 });
      dc.close();
      if ($('#cb-imprimir').checked) OP.imprimir(OP.ticketFactura(t));
      if (t.cambio) aviso('Cambio: ' + euros(t.cambio) + (t.propina ? ` · propina ${euros(t.propina)}` : ''));
      else if (t.propina) aviso(`✓ Cobrado con ${euros(t.propina)} de propina`);
      if (parcial) {
        pedidosCuenta = await api.pedidosDeCuenta(cuenta.id); pintaCuenta();
        aviso(`✓ Cobrado ${euros(t.total)} (${t.serie}-${t.numero}). Quedan ${euros(lineasPendientes().reduce((a, l) => a + l.unitario * l.cantidad, 0))} en la mesa.`);
      } else {
        delete pendientes[cuenta.id]; guardaPend();
        await recarga(); verSala();
      }
    } catch (ex) { if (esDeRed(ex)) { ponConexion(false); fallo('Sin conexión: el cobro NO se ha guardado. Espera a que vuelva la conexión y cóbralo otra vez.'); } else fallo(mensajeError(ex)); }
    finally { btn.disabled = false; }
  };

  /* ══ Control: quitar productos enviados y anular cuentas (con clave de encargado) ══ */
  const dq = $('#dlg-quitar'); let qAcc = null, dqModo = 'quitar', dqPct = null;
  const MOTIVOS = { quitar: ['Error al marcar', 'El cliente lo cambia', 'Tarda demasiado', 'Producto con fallo'],
                    dto: ['Invitación de la casa', 'Compensación por espera', 'Producto con fallo', 'Cliente habitual'] };
  function pintaDq() {
    const l = qAcc && qAcc.tipo === 'linea' ? (pedidosCuenta.find(x => x.id === qAcc.pid) || { lineas: [] }).lineas[qAcc.i] : null;
    dq.querySelectorAll('[data-dq]').forEach(b => b.classList.toggle('activo', b.dataset.dq === dqModo));
    $('#dq-modos').hidden = !l;
    $('#dq-dto').hidden = dqModo !== 'dto';
    $('#dq-titulo').textContent = qAcc && qAcc.tipo === 'cuenta' ? 'Anular cuenta' : dqModo === 'dto' ? 'Descuento en el producto' : 'Quitar producto';
    $('#dq-cant-txt').textContent = dqModo === 'dto' ? 'Cuántos llevan el descuento' : 'Cuántos quitar';
    $('#dq-motivo').placeholder = dqModo === 'dto' ? 'Por qué se descuenta' : 'Por qué se quita';
    $('#dq-motivos').innerHTML = MOTIVOS[dqModo].map(t => `<button type="button" data-mot="${t}">${t}</button>`).join('');
    $('#dq-ok').textContent = dqModo === 'dto' ? (dqPct === 0 ? 'Quitar descuento' : dqPct === 100 ? 'Invitar' : 'Aplicar descuento') : 'Confirmar';
    $('#dq-ok').className = 'b ' + (dqModo === 'dto' ? 'b-ok' : 'b-mal');
    if (l) {
      $('#dq-sin-dto').hidden = !l.dto;
      $('#dq-pcts').querySelectorAll('[data-pct]').forEach(b => b.classList.toggle('sel', +b.dataset.pct === dqPct));
      const q = Math.max(1, Math.min(+$('#dq-cant').value || 1, porCobrar(l))); const orig = l.unitario_original ?? l.unitario;
      $('#dq-dto-txt').textContent = dqPct == null ? 'Elige el descuento.' : dqPct === 0 ? `Vuelve a ${euros(orig * q)}.`
        : `${q}× ${l.nombre}: ${euros(orig * q)} → ${euros(Math.round(orig * (100 - dqPct) / 100) * q)}`;
    }
  }
  dq.addEventListener('click', e => {
    const m = e.target.closest('[data-dq]'); if (m) { dqModo = m.dataset.dq; dqPct = null; $('#dq-pct').value = ''; pintaDq(); return; }
    const p = e.target.closest('[data-pct]'); if (p) { dqPct = +p.dataset.pct; $('#dq-pct').value = ''; pintaDq(); }
  });
  $('#dq-pct').addEventListener('input', () => { const v = parseInt($('#dq-pct').value, 10); dqPct = v >= 1 && v <= 100 ? v : null; pintaDq(); });
  $('#dq-cant').addEventListener('input', () => pintaDq());
  function prepQuitar(titulo, detalle, conCantidad, max) {
    dqModo = 'quitar'; dqPct = null; $('#dq-pct').value = '';
    $('#dq-titulo').textContent = titulo; $('#dq-detalle').innerHTML = detalle;
    $('#dq-cant-l').hidden = !conCantidad; $('#dq-cant').max = max || 1; $('#dq-cant').value = 1;
    $('#dq-motivo').value = ''; $('#dq-pin').value = ''; $('#dq-error').hidden = true;
    $('#dq-pin-l').hidden = esEncargado();
    $('#dq-pin-nota').textContent = esEncargado() ? 'Eres encargado: queda registrado a tu nombre.' : 'Hace falta la clave de un encargado. Queda registrado quién lo pide y quién lo autoriza.';
    pintaDq(); dq.showModal();
  }
  function abreQuitar(pid, i) {
    const p = pedidosCuenta.find(x => x.id === pid); const l = p && p.lineas[i]; if (!l) return;
    qAcc = { tipo: 'linea', pid, i };
    const pend = porCobrar(l);
    prepQuitar('Quitar producto', `<b>${l.cantidad}× ${esc(l.nombre)}</b> · comanda #${p.numero} · ${euros(l.unitario * l.cantidad)}${l.dto ? ` <small class="dto">(${l.dto === 100 ? 'invitado' : '−' + l.dto + ' %'})</small>` : ''}<br><small>Ya se mandó a cocina: avisa en cocina si hay que pararlo.</small>`, pend > 1, pend);
  }
  function abreAnular() {
    const tot = pedidosCuenta.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + p.total, 0);
    qAcc = { tipo: 'cuenta' };
    prepQuitar('Anular cuenta', `<b>${esc(cuenta.nombre)}</b> · ${euros(tot)} enviados a cocina<br><small>La cuenta se cierra sin cobrar y sin ticket.</small>`, false);
  }
  $('#dq-motivos').addEventListener('click', e => { const b = e.target.closest('[data-mot]'); if (b) { $('#dq-motivo').value = b.dataset.mot; $('#dq-motivo').focus(); } });
  $('#dq-ok').onclick = async () => {
    const motivo = $('#dq-motivo').value.trim(); const pin = $('#dq-pin').value.trim();
    const fallo = t => { $('#dq-error').textContent = t; $('#dq-error').hidden = false; };
    if (motivo.length < 3) return fallo('Escribe el motivo (queda registrado).');
    if (dqModo === 'dto' && dqPct == null) return fallo('Elige el descuento.');
    if (!esEncargado() && !/^[0-9]{4,8}$/.test(pin)) return fallo('Falta la clave del encargado.');
    const btn = $('#dq-ok'); btn.disabled = true;
    try {
      if (qAcc.tipo === 'linea' && dqModo === 'dto') {
        await api.descontarLinea(qAcc.pid, qAcc.i, +$('#dq-cant').value || 1, dqPct, motivo, pin);
        dq.close(); aviso(dqPct === 0 ? 'Descuento quitado.' : dqPct === 100 ? '✓ Producto invitado y registrado.' : `✓ Descuento del ${dqPct} % aplicado y registrado.`);
        pedidosCuenta = await api.pedidosDeCuenta(cuenta.id); pintaCuenta();
      } else if (qAcc.tipo === 'linea') {
        await api.anularLinea(qAcc.pid, qAcc.i, +$('#dq-cant').value || 1, motivo, pin);
        dq.close(); aviso('Producto quitado y registrado. Avisa en cocina si ya lo estaban haciendo.');
        pedidosCuenta = await api.pedidosDeCuenta(cuenta.id); pintaCuenta();
      } else {
        await api.anularCuenta(cuenta.id, motivo, pin);
        dq.close(); aviso('Cuenta anulada y registrada.');
        delete pendientes[cuenta.id]; guardaPend(); await recarga(); verSala();
      }
    } catch (ex) {
      const m = mensajeError(ex); fallo(m);
      if (/clave de encargado incorrecta/i.test(m)) { api.apuntarPinFallido(LOCAL, qAcc.tipo === 'linea' ? (dqModo === 'dto' ? 'descuento en producto' : 'quitar producto') : 'anular cuenta'); $('#dq-pin').value = ''; $('#dq-pin').focus(); }
    } finally { btn.disabled = false; }
  };

  /* ══ Caja: resumen desde el último cierre y cierre de caja ══ */
  let resumen = null;
  // "12,50", "1.234,50" o "12.50" (teclado con punto) → céntimos
  const cent = v => { let t = String(v || '').trim(); t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t); const n = Math.round(parseFloat(t) * 100); return isNaN(n) ? null : n; };
  const esperadoCaja = r => r.fondo_inicial + r.efectivo + (r.propinas_efectivo || 0) + (r.entradas || 0) - (r.salidas || 0);
  function pintaCierre() {
    if (!resumen) return;
    const esperado = esperadoCaja(resumen);
    const contado = cent($('#cz-contado').value);
    $('#cz-esperado').textContent = euros(esperado);
    if (contado == null) { $('#cz-descuadre').textContent = '—'; $('#cz-descuadre').className = ''; }
    else { const d = contado - esperado; $('#cz-descuadre').textContent = (d > 0 ? '+' : '') + euros(d) + (d === 0 ? ' · cuadra' : d > 0 ? ' · sobra' : ' · falta'); $('#cz-descuadre').className = d === 0 ? 'ok' : 'mal'; }
    if (contado != null && $('#cz-retirado').dataset.tocado !== '1') $('#cz-retirado').value = (Math.max(0, contado - resumen.fondo_inicial) / 100).toFixed(2).replace('.', ',');
    const ret = cent($('#cz-retirado').value) || 0;
    $('#cz-queda').textContent = contado == null ? '—' : euros(contado - ret);
  }
  $('#cz-contado').addEventListener('input', pintaCierre);
  $('#cz-retirado').addEventListener('input', () => { $('#cz-retirado').dataset.tocado = '1'; pintaCierre(); });


  let tickets = [], movimientos = [];
  /* ── Movimientos de caja: meter cambio, pagar a un proveedor… ── */
  function pintaMovimientos() {
    $('#cz-entradas').textContent = euros(resumen.entradas || 0); $('#cz-salidas').textContent = euros(resumen.salidas || 0);
    $('#mv-lista').innerHTML = movimientos.length ? movimientos.map(m => `<div class="mv-fila ${m.tipo}">
      <span>${new Date(m.cuando).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}</span>
      <span>${esc(m.motivo)}${m.persona ? ` <small>· ${esc(m.persona)}${m.autorizado_persona && m.autorizado_persona !== m.persona ? ', autoriza ' + esc(m.autorizado_persona) : ''}</small>` : ''}</span>
      <b>${m.tipo === 'salida' ? '−' : '+'}${euros(m.importe)}</b></div>`).join('') : '<p class="vacio">Ninguno desde el último cierre.</p>';
    pintaCierre();
  }
  const MV_RAPIDOS = { entrada: ['Cambio', 'Fondo de caja', 'Devolución de proveedor'], salida: ['Pago a proveedor', 'Compra urgente', 'Ingreso al banco', 'Propinas al equipo', 'Adelanto de sueldo'] };
  let mvTipo = 'salida';
  $('#dlg-caja').addEventListener('click', e => {
    const b = e.target.closest('[data-mv]'); if (!b) return;
    mvTipo = b.dataset.mv;
    $('#mv-titulo').textContent = mvTipo === 'salida' ? 'Sacar dinero de la caja' : 'Meter dinero en la caja';
    $('#mv-rapidas').innerHTML = MV_RAPIDOS[mvTipo].map(t => `<button type="button" data-r="${t}">${t}</button>`).join('');
    $('#mv-importe').value = ''; $('#mv-motivo').value = ''; $('#mv-pin').value = ''; $('#mv-error').hidden = true;
    $('#mv-pin-l').hidden = mvTipo !== 'salida' || esEncargado();
    $('#dlg-mov').showModal(); $('#mv-importe').focus();
  });
  $('#mv-rapidas').onclick = e => { const b = e.target.closest('[data-r]'); if (b) { $('#mv-motivo').value = b.dataset.r + ': '; $('#mv-motivo').focus(); } };
  $('#mv-ok').onclick = async () => {
    const fallo = t => { $('#mv-error').textContent = t; $('#mv-error').hidden = false; };
    const imp = cent($('#mv-importe').value); const motivo = $('#mv-motivo').value.trim().replace(/:$/, ''); const pin = $('#mv-pin').value.trim();
    if (!imp || imp <= 0) return fallo('Escribe el importe.');
    if (imp > 500000) return fallo('Importe demasiado alto.');
    if (motivo.length < 3) return fallo('Explica el motivo (por ejemplo: "Pago a proveedor: hielo").');
    if (mvTipo === 'salida' && !esEncargado() && !/^[0-9]{4,8}$/.test(pin)) return fallo('Falta la clave del encargado.');
    if (mvTipo === 'salida' && imp > esperadoCaja(resumen) && !confirm(`Vas a sacar ${euros(imp)} y en el cajón debería haber ${euros(esperadoCaja(resumen))}. ¿Seguro?`)) return;
    const btn = $('#mv-ok'); btn.disabled = true;
    try {
      await api.movimientoCaja(LOCAL, mvTipo, imp, motivo, pin);
      $('#dlg-mov').close(); aviso(`✓ ${mvTipo === 'salida' ? 'Sacados' : 'Metidos'} ${euros(imp)} · ${motivo}`);
      [resumen, movimientos] = await Promise.all([api.resumenCaja(LOCAL), api.movimientosCaja(LOCAL)]);
      pintaMovimientos();
    } catch (ex) {
      const m = mensajeError(ex); fallo(esDeRed(ex) ? 'Sin conexión: no se ha guardado. Inténtalo cuando vuelva.' : m);
      if (/clave de encargado incorrecta/i.test(m)) { api.apuntarPinFallido(LOCAL, 'sacar dinero de la caja'); $('#mv-pin').value = ''; $('#mv-pin').focus(); }
    } finally { btn.disabled = false; }
  };
  $('#b-caja').onclick = async () => {
    try { [tickets, resumen, movimientos] = await Promise.all([api.ticketsDelDia(LOCAL), api.resumenCaja(LOCAL), api.movimientosCaja ? api.movimientosCaja(LOCAL).catch(() => []) : []]); }
    catch (ex) { aviso('No se ha podido cargar la caja: ' + mensajeError(ex), true); return; }
    const desde = new Date(resumen.desde).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('#cz-desde').textContent = desde;
    $('#cz-fondo').textContent = euros(resumen.fondo_inicial); $('#cz-efectivo').textContent = euros(resumen.efectivo);
    $('#cz-tarjeta').textContent = euros(resumen.tarjeta); $('#cz-online').textContent = euros(resumen.online);
    { const pe = resumen.propinas_efectivo || 0, pt = resumen.propinas_tarjeta || 0, po = resumen.propinas_online || 0;
      $('#cz-propinas').textContent = euros(pe + pt + po);
      $('#cz-prop-det').textContent = pe + pt + po ? `efectivo ${euros(pe)} (en el cajón) · tarjeta ${euros(pt)}${po ? ' · online ' + euros(po) : ''}` : ''; }
    pintaMovimientos();
    $('#cz-anul').textContent = resumen.anulaciones ? `${resumen.anulaciones} (${euros(resumen.importe_anulado)})` : '0';
    $('#cz-abiertas').hidden = !resumen.cuentas_abiertas;
    $('#cz-abiertas').textContent = `Ojo: hay ${resumen.cuentas_abiertas} ${resumen.cuentas_abiertas === 1 ? 'cuenta abierta' : 'cuentas abiertas'} sin cobrar.`;
    $('#cz-contado').value = ''; $('#cz-retirado').value = ''; $('#cz-retirado').dataset.tocado = ''; $('#cz-notas').value = ''; $('#cz-error').hidden = true;
    $('#cz-pin').hidden = !esEncargado() || conEquipo;   // con equipo, los PIN se ponen en el admin
    pintaCierre();
    const suma = f => tickets.filter(f).reduce((s, t) => s + t.total, 0);
    const iva = {}; tickets.forEach(t => t.desglose_iva.forEach(d => { iva[d.tipo] = iva[d.tipo] || { base: 0, cuota: 0 }; iva[d.tipo].base += d.base; iva[d.tipo].cuota += d.cuota; }));
    $('#cj-res').innerHTML = `
      <div><small>Tickets</small><b>${tickets.length}</b></div>
      <div><small>Total</small><b>${euros(suma(() => true))}</b></div>
      <div><small>Efectivo</small><b>${euros(suma(t => t.metodo === 'efectivo'))}</b></div>
      <div><small>Tarjeta</small><b>${euros(suma(t => t.metodo === 'tarjeta'))}</b></div>
      <div><small>Descuentos</small><b>${euros(tickets.reduce((s, t) => s + (t.descuento || 0), 0))}</b><small>${tickets.filter(t => t.descuento).length} con promo</small></div>
      ${Object.keys(iva).map(k => `<div><small>IVA ${k}%</small><b>${euros(iva[k].cuota)}</b><small>base ${euros(iva[k].base)}</small></div>`).join('')}`;
    $('#cj-lista').innerHTML = tickets.slice().reverse().map(t => `<div class="fila">
      <b>${esc(t.serie)}-${t.numero}</b><span>${new Date(t.fecha).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}</span>
      <span>${{ efectivo: 'Efectivo', tarjeta: 'Tarjeta', invitacion: 'Invitación' }[t.metodo] || t.metodo}${t.promocion ? ' · ' + esc(t.promocion.codigo) : ''}</span><b>${euros(t.total)}</b>
      <button class="b b-mini" type="button" data-t="${t.id}">Reimprimir</button></div>`).join('') || '<p class="vacio">Aún no hay tickets hoy.</p>';
    $('#dlg-caja').showModal();
  };
  $('#cj-lista').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) OP.imprimir(OP.ticketFactura(tickets.find(t => t.id === b.dataset.t))); });
  $('#cz-ok').onclick = async () => {
    const contado = cent($('#cz-contado').value); const ret = cent($('#cz-retirado').value) || 0;
    const fallo = t => { $('#cz-error').textContent = t; $('#cz-error').hidden = false; };
    if (contado == null) return fallo('Cuenta el efectivo del cajón y escríbelo.');
    if (ret > contado) return fallo('No puedes retirar más de lo que hay.');
    const d = contado - esperadoCaja(resumen);
    if (d !== 0 && $('#cz-notas').value.trim().length < 3) return fallo('La caja no cuadra: explica el descuadre en las notas.');
    if (!confirm(`¿Cerrar la caja?\n\nEfectivo contado: ${euros(contado)}\nDescuadre: ${euros(d)}\nRetiras: ${euros(ret)}\nSe queda en el cajón: ${euros(contado - ret)}`)) return;
    const btn = $('#cz-ok'); btn.disabled = true;
    try {
      const z = await api.cerrarCaja(LOCAL, contado, ret, $('#cz-notas').value.trim());
      $('#dlg-caja').close(); aviso('✓ Caja cerrada' + (z.descuadre ? ' con descuadre de ' + euros(z.descuadre) : ', cuadra'));
      OP.imprimir(`<div class="c g">CIERRE DE CAJA (Z)</div><div class="c">${esc(local.nombre)}</div>
        <div class="c">${new Date(z.desde).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}<br>a ${new Date(z.hasta).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</div>
        <div class="c">Cierra: ${esc((SESION && SESION.email) || '')}</div><hr>
        <div class="l"><span>Tickets</span><span>${z.tickets}${z.primer_ticket ? ` (${esc(z.primer_ticket)} a ${esc(z.ultimo_ticket)})` : ''}</span></div>
        <div class="l"><span>Efectivo</span><span>${euros(z.efectivo)}</span></div>
        <div class="l"><span>Tarjeta</span><span>${euros(z.tarjeta)}</span></div>
        <div class="l"><span>Online</span><span>${euros(z.online)}</span></div>
        <div class="l"><span>Descuentos</span><span>${euros(z.descuentos)}</span></div>
        <div class="l"><span>Invitaciones</span><span>${z.invitaciones}</span></div>
        <div class="l"><span>Anulaciones</span><span>${z.anulaciones} · ${euros(z.importe_anulado)}</span></div><hr>
        <div class="l tot"><span>VENTAS</span><span>${euros(z.efectivo + z.tarjeta + z.online)}</span></div><hr>
        ${(z.propinas_efectivo || 0) + (z.propinas_tarjeta || 0) + (z.propinas_online || 0) ? `<div class="l"><span>Propinas efectivo</span><span>${euros(z.propinas_efectivo || 0)}</span></div>
        <div class="l"><span>Propinas tarjeta</span><span>${euros(z.propinas_tarjeta || 0)}</span></div>
        ${z.propinas_online ? `<div class="l"><span>Propinas online</span><span>${euros(z.propinas_online)}</span></div>` : ''}<hr>` : ''}
        <div class="l"><span>Fondo inicial</span><span>${euros(z.fondo_inicial)}</span></div>
        ${z.entradas ? `<div class="l"><span>Metido en caja</span><span>+${euros(z.entradas)}</span></div>` : ''}
        ${z.salidas ? `<div class="l"><span>Sacado de caja</span><span>−${euros(z.salidas)}</span></div>` : ''}
        <div class="l"><span>Esperado en cajón</span><span>${euros(esperadoCaja(z))}</span></div>
        <div class="l"><span>Contado</span><span>${euros(z.efectivo_contado)}</span></div>
        <div class="l g"><span>DESCUADRE</span><span>${euros(z.descuadre)}</span></div>
        <div class="l"><span>Retirado</span><span>${euros(z.retirado)}</span></div>
        <div class="l"><span>Queda de fondo</span><span>${euros(z.fondo_siguiente)}</span></div>
        ${z.notas ? `<hr><div>${esc(z.notas)}</div>` : ''}`);
    } catch (ex) { fallo(mensajeError(ex)); } finally { btn.disabled = false; }
  };
  $('#cz-pin').onclick = async () => {
    const pin = prompt('Tu nueva clave de encargado (4 a 8 cifras). Te la pedirán para quitar productos o anular cuentas cuando no estés tú:', '');
    if (pin === null) return;
    try { await api.fijarPin(pin.trim()); aviso('✓ Clave de encargado guardada'); } catch (ex) { aviso(mensajeError(ex), true); }
  };
  $('#cj-imprimir').onclick = () => {
    const suma = f => tickets.filter(f).reduce((s, t) => s + t.total, 0);
    OP.imprimir(`<div class="c g">CIERRE DE CAJA</div><div class="c">${esc(local.nombre)}</div>
      <div class="c">${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</div><hr>
      <div class="l"><span>Tickets</span><span>${tickets.length}${tickets.length ? ` (${tickets[0].serie}-${tickets[0].numero} a ${tickets.at(-1).numero})` : ''}</span></div>
      <div class="l"><span>Efectivo</span><span>${euros(suma(t => t.metodo === 'efectivo'))}</span></div>
      <div class="l"><span>Tarjeta</span><span>${euros(suma(t => t.metodo === 'tarjeta'))}</span></div><hr>
      <div class="l tot"><span>TOTAL</span><span>${euros(suma(() => true))}</span></div>`);
  };
  /* ══ Todas las ventanas se pueden cerrar: ✕ arriba, tocando fuera o con Esc ══ */
  document.querySelectorAll('dialog.dlg').forEach(d => {
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'dlg-x'; x.setAttribute('aria-label', 'Cerrar'); x.textContent = '✕';
    x.onclick = () => d.close('cancel');
    d.prepend(x);
    d.addEventListener('click', e => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close('cancel');
    });
  });
})();
