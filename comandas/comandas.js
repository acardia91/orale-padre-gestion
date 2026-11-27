/* ÓRALE PADRE · pantalla de comandas (cocina / barra) */
(function () {
  'use strict';
  const { api, DEMO, hhmm, euros, puestoDe } = window.OP;

  // Al salir: si estaba en modo prueba (?demo), se quita de la dirección; si no, volvería a entrar en la demo.
  function fueraDeSesion() { if (DEMO) location.replace(location.pathname); else location.reload(); }
  { const d = document.getElementById('p-demo'); if (d && DEMO) { d.textContent = 'DEMO · salir'; d.title = 'Salir del modo prueba'; d.style.cursor = 'pointer';
    d.onclick = () => { if (confirm('¿Salir del modo prueba? Después podrás entrar con tu usuario.')) location.replace(location.pathname); }; } }
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Repintar sólo si cambia, y nunca mientras se desliza el dedo (en la tablet cortaba el scroll).
  const ponHTML = (el, h) => { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } };
  let tocando = false, tSuelta = null, pintaPendiente = false;
  const suelta = ms => { clearTimeout(tSuelta); tSuelta = setTimeout(() => { tocando = false; if (pintaPendiente) { pintaPendiente = false; pinta(); } }, ms); };
  document.addEventListener('touchstart', () => { tocando = true; clearTimeout(tSuelta); }, { passive: true, capture: true });
  document.addEventListener('touchend', () => suelta(700), { passive: true, capture: true });
  document.addEventListener('touchcancel', () => suelta(700), { passive: true, capture: true });
  document.addEventListener('scroll', () => { if (tocando) suelta(700); }, { passive: true, capture: true });
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('op-cocina-' + k); localStorage.setItem('op-cocina-' + k, v); } catch (e) { return null; } };

  let LOCAL = new URLSearchParams(location.search).get('local') || pref('local') || 'tomares';
  let local, carta, pedidos = [], agotados = new Set(), vistos = new Set(), primeraCarga = true;

  if (DEMO) $('#p-demo').hidden = false;

  /* ── Puesto de esta pantalla: Todo, Cocina o Barra (se recuerda en este dispositivo) ──
     · Cocina: sólo ve lo que prepara cocina; lleva el estado del pedido (aceptar, listo, servido).
     · Barra: sólo ve las bebidas; las marca "listas" sin tocar lo de cocina. Si el pedido es
       sólo de barra, la barra lo lleva entero (listo y servido).
     · Todo: como siempre, con las bebidas marcadas 🍹. */
  let vista = ['cocina', 'barra'].includes(pref('puesto')) ? pref('puesto') : '';
  const puesto = l => puestoDe(carta, l.producto);
  const lineasDe = (p, v = vista) => v ? p.lineas.filter(l => puesto(l) === v) : p.lineas;
  const tiene = (p, v) => p.lineas.some(l => puesto(l) === v);
  const barraLista = p => !!(p.puestos && p.puestos.barra);
  // Columna en la que sale cada pedido en esta pantalla (null = no sale).
  function columna(p) {
    if (!['nuevo', 'preparando', 'listo'].includes(p.estado)) return null;
    if (vista === 'cocina') return tiene(p, 'cocina') ? p.estado : null;
    if (vista === 'barra') return tiene(p, 'barra') ? (barraLista(p) || (!tiene(p, 'cocina') && p.estado === 'listo') ? 'listo' : 'nuevo') : null;
    return p.estado;
  }
  const visibles = () => pedidos.filter(p => columna(p));
  const porAceptar = () => pedidos.filter(p => columna(p) === 'nuevo' && !p.en_espera);   // lo que está "en espera" no suena
  const desde = p => p.marchado || p.creado;   // una comanda marchada cuenta desde que se marchó
  function pintaVista() {
    $('#p-puesto').value = vista;
    document.body.dataset.vista = vista || 'todo';
    $('#col-preparando').hidden = vista === 'barra';
    const h = { '': 'Comandas', cocina: 'Cocina', barra: 'Barra' }[vista];
    $('#p-vista-txt').textContent = h;
  }
  $('#p-puesto').onchange = e => { vista = e.target.value; pref('puesto', vista); vistos = new Set(visibles().filter(p => columna(p) === 'nuevo').map(p => p.id)); pintaVista(); pinta(); };
  pintaVista();

  /* ── App instalable: service worker, botón "Instalar app" y pantalla siempre encendida ── */
  const enApp = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/comandas/sw.js', { scope: '/comandas/' }).catch(() => {});
  let pideInstalar = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pideInstalar = e; if (!enApp) $('#p-instalar').hidden = false; });
  window.addEventListener('appinstalled', () => { $('#p-instalar').hidden = true; pideInstalar = null; });
  $('#p-instalar').onclick = async () => { if (!pideInstalar) return; pideInstalar.prompt(); await pideInstalar.userChoice.catch(() => {}); pideInstalar = null; $('#p-instalar').hidden = true; };
  // La pantalla de cocina no se apaga nunca mientras está abierta (en app o en el navegador).
  let candado = null;
  const pantallaEncendida = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !candado) { candado = await navigator.wakeLock.request('screen'); candado.addEventListener('release', () => { candado = null; }); } } catch (e) { candado = null; } };
  pantallaEncendida(); document.addEventListener('visibilitychange', pantallaEncendida);

  /* ── Sesión ── */
  (async function arranque() {
    let s = null; try { s = await api.sesion(); } catch (e) { s = null; }
    if (!s) { $('#vista-entrar').hidden = false; return; }
    entrar(s);
  })();
  $('#form-entrar').addEventListener('submit', async e => {
    e.preventDefault(); $('#e-error').hidden = true;
    try { entrar(await api.entrar($('#e-email').value.trim(), $('#e-pass').value)); }
    catch (ex) { $('#e-error').textContent = 'Email o contraseña incorrectos.'; $('#e-error').hidden = false; }
  });
  $('#p-salir').onclick = async () => { await api.salir(); fueraDeSesion(); };

  async function entrar(s) {
    if (!s.locales.length) { $('#e-error').textContent = 'Tu usuario no tiene ningún local asignado.'; $('#e-error').hidden = false; $('#vista-entrar').hidden = false; return; }
    if (!s.locales.includes(LOCAL)) LOCAL = s.locales[0];
    pref('local', LOCAL);
    $('#p-ir-tpv').href = '/tpv/?local=' + encodeURIComponent(LOCAL);
    OP.selectorLocal($('#p-local'), s.locales, LOCAL, id => { pref('local', id); location.search = '?local=' + encodeURIComponent(id); });
    $('#vista-entrar').hidden = true; $('#vista-panel').hidden = false;
    carta = await api.carta(LOCAL);
    await recarga();
    // Los avisos en vivo llegan a ráfagas (un cobro cambia varias comandas a la vez): se agrupan en una sola recarga.
    let tRec = null; api.escuchar(LOCAL, () => { clearTimeout(tRec); tRec = setTimeout(recarga, 300); });
    setInterval(recarga, 30000);          // red de seguridad si se cae el tiempo real
    setInterval(() => { reloj(); pinta(); }, 20000);
    reloj();
  }

  // Nunca dos recargas a la vez: si llega otra mientras tanto, se hace una más al terminar.
  let recargando = null, otraVez = false;
  function recarga() {
    if (recargando) { otraVez = true; return recargando; }
    recargando = recargaYa().finally(() => { recargando = null; if (otraVez) { otraVez = false; recarga(); } });
    return recargando;
  }
  async function recargaYa() {
    try {
      [local, pedidos, agotados] = await Promise.all([api.local(LOCAL), api.pedidosDelDia(LOCAL), api.agotados(LOCAL)]);
    } catch (e) { console.warn('recarga', e); return; }
    const nuevos = porAceptar().filter(p => !vistos.has(p.id));
    nuevos.forEach(p => vistos.add(p.id));
    if (nuevos.length && !primeraCarga) { timbre(); if ('vibrate' in navigator) navigator.vibrate(300); }
    primeraCarga = false;
    pintaBarra(); pinta();
  }

  function reloj() { $('#p-reloj').textContent = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', hour: '2-digit', minute: '2-digit' }); }

  /* ── Barra de control ── */
  function pintaBarra() {
    if ($('#p-local')) $('#p-local').textContent = local.nombre.replace(/^Órale Padre\s*/, '');
    $('#p-prep').textContent = local.minutos_prep;
    const on = $('#p-online'); on.querySelector('span').textContent = local.acepta_pedidos ? 'Online ON' : 'PAUSADOS';
    on.className = 'b b-ico ' + (local.acepta_pedidos ? 'on' : 'off');
    $('#n-agotados').textContent = agotados.size || ''; $('#n-agotados').hidden = !agotados.size;
  }
  $('#p-online').onclick = async () => {
    const pausar = local.acepta_pedidos;
    if (pausar && !confirm('¿Pausar los pedidos online? La web dejará de aceptar pedidos hasta que lo vuelvas a activar.')) return;
    await api.actualizarLocal(LOCAL, { acepta_pedidos: !pausar }); recarga();
  };
  const cambiaPrep = d => async () => {
    const m = Math.min(90, Math.max(5, local.minutos_prep + d)); await api.actualizarLocal(LOCAL, { minutos_prep: m }); recarga();
  };
  $('#p-prep-menos').onclick = cambiaPrep(-5); $('#p-prep-mas').onclick = cambiaPrep(5);
  $('#p-autoprint').checked = pref('autoprint') === '1';
  $('#p-autoprint').onchange = e => pref('autoprint', e.target.checked ? '1' : '0');

  /* ── Sonido: el navegador exige un toque antes de poder sonar ── */
  // Se puede silenciar: la elección se guarda en esta tablet. Silenciado, el botón parpadea si entra algo.
  let audio = null;
  let silencio = (() => { try { return localStorage.getItem('op-comandas-silencio') === '1'; } catch (e) { return false; } })();
  function pintaSonido() {
    const b = $('#p-sonido');
    b.querySelector('span').textContent = silencio ? 'Silenciado' : audio ? 'Sonido' : 'Activar sonido';
    b.classList.toggle('on', !!audio && !silencio);
    b.title = silencio ? 'Tocar para volver a activar el sonido' : audio ? 'Tocar para silenciar' : 'Tocar para que suenen las comandas nuevas';
  }
  $('#p-impresora').onclick = () => OP.ajustesImpresora();
  $('#p-sonido').onclick = () => {
    if (!audio || audio.state === 'suspended') {          // primer toque (o tras bloquear la tablet): activa
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume(); silencio = false;
    } else silencio = !silencio;
    try { localStorage.setItem('op-comandas-silencio', silencio ? '1' : '0'); } catch (e) {}
    pintaSonido(); if (!silencio) timbre();
    $('#p-sonido').classList.toggle('parpadea', silencio && porAceptar().length > 0);
  };
  pintaSonido();
  function timbre() {
    if (!audio || silencio) { $('#p-sonido').classList.add('parpadea'); return; }
    const t = audio.currentTime;
    [0, .18, .36].forEach((d, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = i === 2 ? 1320 : 990;
      g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.25, t + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d + .16);
      o.connect(g).connect(audio.destination); o.start(t + d); o.stop(t + d + .17);
    });
  }
  // Mientras haya pedidos sin aceptar, recuerda cada 20 s.
  setInterval(() => { if (porAceptar().length) timbre(); }, 20000);

  /* ── Columnas ── */
  const PAGO = { local: 'Paga al recoger', efectivo: 'Pagado · efectivo', tarjeta: 'Pagado · tarjeta', stripe: 'Pagado online' };
  function pinta() {
    if (!local) return;
    if (tocando) { pintaPendiente = true; return; }
    const ord = (a, b) => (a.en_espera ? 1 : 0) - (b.en_espera ? 1 : 0) || new Date(a.canal === 'sala' ? desde(a) : a.recogida) - new Date(b.canal === 'sala' ? desde(b) : b.recogida) || a.numero - b.numero;
    ['nuevo', 'preparando', 'listo'].forEach(est => {
      const l = pedidos.filter(p => columna(p) === est).sort(ord);
      $('#n-' + est).textContent = l.length;
      ponHTML($('#l-' + est), l.length ? l.map(tarjeta).join('') : `<p class="vacio">${est === 'nuevo' ? (vista === 'barra' ? 'Sin bebidas pendientes' : 'Sin pedidos nuevos') : 'Nada por aquí'}</p>`);
    });
    const hechos = pedidos.filter(p => p.estado === 'entregado' || p.estado === 'cancelado').sort((a, b) => b.numero - a.numero);
    const ent = hechos.filter(p => p.estado === 'entregado' && p.canal !== 'sala');   // la sala se cuadra en el TPV
    const suma = m => ent.filter(p => p.pago_metodo === m).reduce((s, p) => s + p.total, 0);
    $('#h-n').textContent = ent.length;
    $('#h-total').textContent = euros(ent.reduce((s, p) => s + p.total, 0));
    $('#h-desglose').textContent = `efectivo ${euros(suma('efectivo'))} · tarjeta ${euros(suma('tarjeta'))}`;
    $('#l-hechos').innerHTML = hechos.map(p => `<div class="hecho ${p.estado}">
      <b>#${p.numero}</b><span>${esc(p.cliente_nombre)}</span><span>${euros(p.total)}</span>
      <span>${p.estado === 'cancelado' ? 'Cancelado' : esc(PAGO[p.pago_metodo] || '')}</span>
      ${p.estado === 'entregado' ? `<button class="b b-mini x" data-acc="recuperar" data-id="${p.id}" title="Devolver a «Listos» (si se marcó servido por error)">↩ Volver</button>` : ''}
      <button class="b b-mini ${p.estado === 'entregado' ? '' : 'x'}" data-acc="reimprimir" data-id="${p.id}">Ticket</button></div>`).join('') || '<p class="vacio">Aún nada</p>';
    const parpadea = porAceptar().length > 0 && (!audio || silencio);
    $('#p-sonido').classList.toggle('parpadea', parpadea);
    const nN = porAceptar().length;
    document.title = (nN ? `(${nN}) ` : '') + ({ '': 'Comandas', cocina: 'Cocina', barra: 'Barra' }[vista]) + ' · Órale Padre';
  }

  /* Color por tiempo: cuánto lleva en cada paso, frente al tiempo de preparación del local.
     Nuevo sin aceptar: ámbar a los 3 min, rojo a los 6. Preparando: ámbar 5 min antes del tiempo
     de preparación, rojo al pasarlo. Listo sin entregar: ámbar a los 5 min, rojo a los 10.
     Un pedido web programado para más tarde no se colorea hasta que le toca empezar. */
  function tiempoCocina(p) {
    if (vista === 'barra') {          // en barra: esperando bebidas (ámbar 3, rojo 6) o bebidas listas sin servir
      const mm = d => Math.max(0, Math.floor((Date.now() - new Date(d)) / 60000));
      if (p.en_espera) return { clase: '', txt: 'en espera: sala avisará cuando marche' };
      if (columna(p) === 'nuevo') { const n = mm(desde(p)); return { clase: n >= 6 ? 't-rojo' : n >= 3 ? 't-ambar' : '', txt: `esperando · ${n} min` }; }
      const n = mm((p.puestos && p.puestos.barra) || p.listo_at || p.creado); return { clase: n >= 10 ? 't-rojo' : n >= 5 ? 't-ambar' : '', txt: `listas hace ${n} min` };
    }
    if (p.en_espera) return { clase: '', txt: 'en espera: sala avisará cuando marche' };
    const prep = (local && local.minutos_prep) || 20, ya = Date.now(), m = d => Math.max(0, Math.floor((ya - new Date(d)) / 60000));
    if (p.canal !== 'sala' && p.estado !== 'listo' && new Date(p.recogida) - ya > prep * 60000) return { clase: '', txt: '' };
    let n, amb, roj, txt;
    if (p.estado === 'nuevo') { n = m(desde(p)); amb = 3; roj = 6; txt = `sin aceptar · ${n} min`; }
    else if (p.estado === 'preparando') { n = m(p.aceptado || p.creado); amb = Math.max(1, prep - 5); roj = prep; txt = `preparando · ${n} min`; }
    else if (p.estado === 'listo') { n = m(p.listo_at || p.aceptado || p.creado); amb = 5; roj = 10; txt = `listo hace ${n} min`; }
    else return { clase: '', txt: '' };
    return { clase: n >= roj ? 't-rojo' : n >= amb ? 't-ambar' : '', txt };
  }

  function tarjeta(p) {
    const rec = new Date(p.canal === 'sala' ? desde(p) : p.recogida); const min = Math.round((rec - Date.now()) / 60000);
    const cuando = p.canal === 'sala' ? `<small class="${-min >= 20 ? 'tarde' : ''}">hace ${-min} min</small>`
      : min < 0 ? `<small class="tarde">hace ${-min} min</small>` : `<small>en ${min} min</small>`;
    const t = tiempoCocina(p);
    const col = columna(p), soloBarra = !tiene(p, 'cocina');
    let boton = { nuevo: ['preparar', 'Aceptar y preparar'], preparando: ['listo', '¡Listo!'], listo: ['entregar', p.canal === 'sala' ? 'Servido' : 'Entregar'] }[p.estado];
    let atras = p.estado !== 'nuevo' ? 'atras' : '';
    if (vista === 'barra') {
      boton = col === 'nuevo' ? ['barra-lista', '🍹 Bebidas listas'] : soloBarra ? ['entregar', p.canal === 'sala' ? 'Servido' : 'Entregar'] : null;
      atras = col === 'listo' && (barraLista(p) || soloBarra) ? 'barra-atras' : '';
    }
    if (p.en_espera) { boton = null; atras = ''; }
    const otro = vista ? p.lineas.filter(l => puesto(l) !== vista).reduce((s2, l) => s2 + l.cantidad, 0) : 0;
    // Plato a plato: cada línea se toca para marcarla hecha (se guarda en el pedido; la ven todas las pantallas).
    const hechas = new Set(p.hechas || []);
    const lineas = p.lineas.map((l, i) => ({ ...l, _i: i })).filter(l => !vista || puesto(l) === vista);
    const todoHecho = lineas.length > 0 && lineas.every(l => hechas.has(l._i));
    const marcha = p.marchado && Date.now() - new Date(p.marchado) < 15 * 60000;
    return `<article class="ped ${p.estado} ${t.clase}${p.en_espera ? ' espera' : ''}" data-id="${p.id}">
      ${p.en_espera ? '<p class="ped-espera">⏸ EN ESPERA · no preparar todavía</p>' : marcha ? '<p class="ped-marcha">▶ ¡MARCHA!</p>' : ''}
      <div class="ped-cab">
        <div class="ped-num">${p.numero}</div>
        <div class="ped-quien">${p.canal === 'sala'
          ? `<strong>🍽 ${esc(p.mesa)}</strong><span class="canal">Sala</span>`
          : `<strong>${esc(p.cliente_nombre)}</strong>${p.cliente_tel ? `<a href="tel:${esc(p.cliente_tel)}">${esc(p.cliente_tel)}</a>` : ''} · Web, para recoger`}</div>
        <div class="ped-hora"><b>${hhmm(rec)}</b>${cuando}</div>
      </div>
      <ul class="ped-lineas">${lineas.map(l => `<li class="${!vista && puesto(l) === 'barra' ? 'de-barra' : ''}${hechas.has(l._i) ? ' hecha' : ''}" ${p.en_espera ? '' : `data-linea="${l._i}" data-id="${p.id}" role="button" title="Tocar para marcarlo hecho"`}><b>${l.cantidad}×</b>${!vista && puesto(l) === 'barra' ? '🍹 ' : ''}${esc(l.nombre)}
        ${l.opciones.map(o => `<small>+ ${esc(o.nombre)}</small>`).join('')}
        ${l.nota ? `<small class="nota">⚠ ${esc(l.nota)}</small>` : ''}</li>`).join('')}
        ${(p.anuladas || []).filter(l => !vista || puesto(l) === vista).map(l => `<li class="quitada"><b>${l.cantidad}×</b>${esc(l.nombre)}<small class="nota">✕ QUITADO · ${esc(l.motivo || '')}</small></li>`).join('')}</ul>
      ${otro ? `<p class="ped-otro">+ ${otro} ${vista === 'barra' ? 'en cocina' : 'en barra'}${vista === 'cocina' && tiene(p, 'barra') ? (barraLista(p) ? ' · ✓ listas' : ' · pendientes') : ''}</p>` : ''}
      ${!vista && tiene(p, 'barra') && barraLista(p) && tiene(p, 'cocina') ? '<p class="ped-otro">🍹 Bebidas listas ✓</p>' : ''}
      ${t.txt ? `<p class="ped-tiempo">⏱ ${t.txt}</p>` : ''}
      ${p.notas ? `<p class="ped-notas">📝 ${esc(p.notas)}</p>` : ''}
      <div class="ped-pie">
        <span class="imp">${euros(p.total)}<small>${p.canal === 'sala' ? 'Se cobra en el TPV' : p.pagado ? esc(PAGO[p.pago_metodo]) : 'Paga al recoger'}</small></span>
        ${p.canal === 'sala' || vista === 'barra' ? '' : `<button class="lnk" data-acc="cancelar" data-id="${p.id}">Cancelar</button>`}
        <button class="b" data-acc="imprimir" data-id="${p.id}" title="Ticket de cocina (sin precios)">Ticket cocina</button>
        ${p.canal !== 'sala' && !p.pagado ? `<button class="b b-pagar" data-acc="ticket-pago" data-id="${p.id}" title="Ticket con precios para que el cliente pague">🧾 Para pagar</button>` : ''}
        ${atras ? `<button class="b" data-acc="${atras}" data-id="${p.id}" title="Volver al paso anterior">↩</button>` : ''}
        ${boton ? `<button class="b b-ok${todoHecho && boton[0] === 'listo' ? ' parpadea' : ''}" data-acc="${boton[0]}" data-id="${p.id}">${boton[1]}</button>` : p.en_espera ? '<span class="ped-sirve">Esperando a sala</span>' : '<span class="ped-sirve">Lo sirve cocina</span>'}
      </div>
    </article>`;
  }

  /* ── Acciones ── */
  const ahora = () => new Date().toISOString();
  document.addEventListener('click', async e => {
    const li = e.target.closest('li[data-linea]'); if (!li) return;
    const p = pedidos.find(x => x.id === li.dataset.id); if (!p) return;
    const i = +li.dataset.linea; const set = new Set(p.hechas || []);
    if (set.has(i)) set.delete(i); else set.add(i);
    const antes = p.hechas; p.hechas = [...set].sort((a, b) => a - b);
    const cambios = { hechas: p.hechas };
    // Empezar a marcar platos de una comanda nueva es aceptarla.
    if (p.estado === 'nuevo' && set.size && vista !== 'barra') Object.assign(cambios, { estado: 'preparando', aceptado: p.aceptado || ahora() });
    pinta();
    try { await api.actualizarPedido(p.id, cambios); if (cambios.estado) await recarga(); }
    catch (ex) { p.hechas = antes; pinta(); alert('No se ha podido guardar. ¿Hay conexión?\n' + (ex.message || ex)); }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const p = pedidos.find(x => x.id === b.dataset.id); if (!p) return;
    b.disabled = true;
    try {
      switch (b.dataset.acc) {
        case 'preparar':
          await api.actualizarPedido(p.id, { estado: 'preparando', aceptado: ahora() });
          if ($('#p-autoprint').checked) imprime(p);
          break;
        case 'listo': await api.actualizarPedido(p.id, { estado: 'listo', listo_at: ahora() }); break;
        case 'entregar': await entregar(p); break;
        case 'atras': await api.actualizarPedido(p.id, { estado: { preparando: 'nuevo', listo: 'preparando' }[p.estado] }); break;
        case 'recuperar':
          if (!confirm(`¿Devolver el #${p.numero} (${p.canal === 'sala' ? p.mesa : p.cliente_nombre}) a «Listos para recoger»?`)) break;
          await api.actualizarPedido(p.id, { estado: 'listo', entregado_at: null }); break;
        case 'barra-lista': {
          const cambios = { puestos: { ...(p.puestos || {}), barra: ahora() } };
          if (!tiene(p, 'cocina') && p.estado !== 'listo') Object.assign(cambios, { estado: 'listo', aceptado: p.aceptado || ahora(), listo_at: ahora() });
          await api.actualizarPedido(p.id, cambios); break;
        }
        case 'barra-atras': {
          const pu = { ...(p.puestos || {}) }; delete pu.barra; const cambios = { puestos: pu };
          if (!tiene(p, 'cocina')) Object.assign(cambios, { estado: 'nuevo', listo_at: null });
          await api.actualizarPedido(p.id, cambios); break;
        }
        case 'cancelar': await cancelar(p); break;
        case 'imprimir': case 'reimprimir': imprime(p); break;
        case 'ticket-pago': OP.imprimir(OP.ticketPrecuenta(`#${p.numero} · ${p.cliente_nombre || 'Para recoger'}`, p.lineas, p.total)); break;
      }
      await recarga();
    } catch (ex) { alert('No se ha podido guardar. ¿Hay conexión?\n' + (ex.message || ex)); }
    finally { b.disabled = false; }
  });

  function pregunta(dlg) {
    return new Promise(res => { dlg.returnValue = ''; dlg.showModal(); dlg.addEventListener('close', () => res(dlg.returnValue), { once: true }); });
  }
  async function entregar(p) {
    if (p.pagado || p.canal === 'sala') {
      await api.actualizarPedido(p.id, { estado: 'entregado', entregado_at: ahora() });
      deshacer(`✓ #${p.numero} ${p.canal === 'sala' ? esc(p.mesa || '') : esc(p.cliente_nombre || '')} servido`, async () => { await api.actualizarPedido(p.id, { estado: 'listo', entregado_at: null }); await recarga(); });
      return;
    }
    $('#cb-titulo').textContent = `Entregar #${p.numero} · ${p.cliente_nombre}`;
    $('#cb-total').textContent = euros(p.total);
    const r = await pregunta($('#dlg-cobrar'));
    if (r === 'efectivo' || r === 'tarjeta') {
      const t = await api.cobrar({ pedido: p.id, metodo: r });
      await api.actualizarPedido(p.id, { estado: 'entregado', entregado_at: ahora() });
      if (confirm('Cobrado. ¿Imprimir la factura simplificada para el cliente?')) OP.imprimir(OP.ticketFactura(t));
    }
  }
  // Aviso abajo con "Deshacer" (por si se tocó Servido sin querer): 10 segundos.
  function deshacer(txt, fn) {
    let t = document.getElementById('deshacer');
    if (!t) { t = document.createElement('div'); t.id = 'deshacer'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = `<span>${txt}</span><button type="button" class="b">↩ Deshacer</button>`; t.hidden = false;
    clearTimeout(deshacer.t); deshacer.t = setTimeout(() => { t.hidden = true; }, 10000);
    t.querySelector('button').onclick = async () => { t.hidden = true; clearTimeout(deshacer.t); try { await fn(); } catch (ex) { alert('No se ha podido deshacer: ' + (ex.message || ex)); } };
  }
  async function cancelar(p) {
    $('#cn-titulo').textContent = `Cancelar #${p.numero} · ${p.cliente_nombre || ''}`;
    $('#cn-detalle').innerHTML = `${p.lineas.map(l => `${l.cantidad}× ${esc(l.nombre)}`).join(' · ')} · <b>${euros(p.total)}</b>${p.pagado ? '<br><b>⚠ Está pagado online: habrá que devolver el dinero.</b>' : ''}`;
    if (await pregunta($('#dlg-cancelar')) === 'si') {
      await api.actualizarPedido(p.id, { estado: 'cancelado', motivo_cancel: $('#cn-motivo').value });
    }
  }

  /* ── Ticket de cocina (no es factura) ── */
  function imprime(p) {
    const ls = lineasDe(p);
    OP.imprimir(OP.ticketComanda(vista ? { ...p, lineas: ls.length ? ls : p.lineas, notas: [vista === 'barra' ? 'BARRA' : 'COCINA', p.notas].filter(Boolean).join(' · ') } : p, local.nombre));
  }

  /* ── Agotados ── */
  $('#p-agotados').onclick = () => { pintaAgotados(); $('#ag-buscar').value = ''; $('#dlg-agotados').showModal(); };
  function pintaAgotados() {
    const q = $('#ag-buscar').value.trim().toLowerCase();
    const prods = new Map(carta.productos.map(p => [p.id, p]));
    $('#ag-lista').innerHTML = carta.categorias.map(c => {
      const ps = c.productos.map(id => prods.get(id)).filter(p => p && p.nombre.toLowerCase().includes(q));
      return ps.length ? `<h3>${esc(c.nombre)}</h3>` + ps.map(p => `<label><input type="checkbox" data-ag="${p.id}" ${agotados.has(p.id) ? 'checked' : ''}> ${esc(p.nombre)}</label>`).join('') : '';
    }).join('');
  }
  $('#ag-buscar').oninput = pintaAgotados;
  $('#ag-lista').addEventListener('change', async e => {
    const id = e.target.dataset.ag; if (!id) return;
    try { await api.marcarAgotado(LOCAL, id, e.target.checked); await recarga(); }
    catch (ex) { e.target.checked = !e.target.checked; alert('No se ha podido guardar.'); }
  });
})();
