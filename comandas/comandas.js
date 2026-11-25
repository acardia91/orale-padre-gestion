/* ÓRALE PADRE · pantalla de comandas (cocina / barra) */
(function () {
  'use strict';
  const { api, DEMO, hhmm, euros } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('op-cocina-' + k); localStorage.setItem('op-cocina-' + k, v); } catch (e) { return null; } };

  let LOCAL = new URLSearchParams(location.search).get('local') || pref('local') || 'tomares';
  let local, carta, pedidos = [], agotados = new Set(), vistos = new Set(), primeraCarga = true;

  if (DEMO) $('#p-demo').hidden = false;

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
  $('#p-salir').onclick = async () => { await api.salir(); location.reload(); };

  async function entrar(s) {
    if (!s.locales.length) { $('#e-error').textContent = 'Tu usuario no tiene ningún local asignado.'; $('#e-error').hidden = false; $('#vista-entrar').hidden = false; return; }
    if (!s.locales.includes(LOCAL)) LOCAL = s.locales[0];
    pref('local', LOCAL);
    OP.selectorLocal($('#p-local'), s.locales, LOCAL, id => { pref('local', id); location.search = '?local=' + encodeURIComponent(id); });
    $('#vista-entrar').hidden = true; $('#vista-panel').hidden = false;
    carta = await api.carta(LOCAL);
    await recarga();
    api.escuchar(LOCAL, () => recarga());
    setInterval(recarga, 30000);          // red de seguridad si se cae el tiempo real
    setInterval(() => { reloj(); pinta(); }, 20000);
    reloj();
  }

  async function recarga() {
    try {
      [local, pedidos, agotados] = await Promise.all([api.local(LOCAL), api.pedidosDelDia(LOCAL), api.agotados(LOCAL)]);
    } catch (e) { console.warn('recarga', e); return; }
    const nuevos = pedidos.filter(p => p.estado === 'nuevo' && !vistos.has(p.id));
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
    const on = $('#p-online'); on.textContent = 'Pedidos online: ' + (local.acepta_pedidos ? 'ON' : 'PAUSADOS');
    on.className = 'b ' + (local.acepta_pedidos ? 'on' : 'off');
    $('#p-agotados').textContent = 'Agotados' + (agotados.size ? ` (${agotados.size})` : '');
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
    b.textContent = silencio ? '🔕 Silenciado' : audio ? '🔔 Sonido activado' : '🔇 Activar sonido';
    b.classList.toggle('on', !!audio && !silencio);
    b.title = silencio ? 'Tocar para volver a activar el sonido' : audio ? 'Tocar para silenciar' : 'Tocar para que suenen las comandas nuevas';
  }
  $('#p-sonido').onclick = () => {
    if (!audio || audio.state === 'suspended') {          // primer toque (o tras bloquear la tablet): activa
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume(); silencio = false;
    } else silencio = !silencio;
    try { localStorage.setItem('op-comandas-silencio', silencio ? '1' : '0'); } catch (e) {}
    pintaSonido(); if (!silencio) timbre();
    $('#p-sonido').classList.toggle('parpadea', silencio && pedidos.some(p => p.estado === 'nuevo'));
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
  setInterval(() => { if (pedidos.some(p => p.estado === 'nuevo')) timbre(); }, 20000);

  /* ── Columnas ── */
  const PAGO = { local: 'Paga al recoger', efectivo: 'Pagado · efectivo', tarjeta: 'Pagado · tarjeta', stripe: 'Pagado online' };
  function pinta() {
    if (!local) return;
    const ord = (a, b) => new Date(a.recogida) - new Date(b.recogida) || a.numero - b.numero;
    ['nuevo', 'preparando', 'listo'].forEach(est => {
      const l = pedidos.filter(p => p.estado === est).sort(ord);
      $('#n-' + est).textContent = l.length;
      $('#l-' + est).innerHTML = l.length ? l.map(tarjeta).join('') : `<p class="vacio">${est === 'nuevo' ? 'Sin pedidos nuevos' : 'Nada por aquí'}</p>`;
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
      <button class="b b-mini x" data-acc="reimprimir" data-id="${p.id}">Ticket</button></div>`).join('') || '<p class="vacio">Aún nada</p>';
    const parpadea = pedidos.some(p => p.estado === 'nuevo') && (!audio || silencio);
    $('#p-sonido').classList.toggle('parpadea', parpadea);
    document.title = (pedidos.filter(p => p.estado === 'nuevo').length ? `(${pedidos.filter(p => p.estado === 'nuevo').length}) ` : '') + 'Comandas · Órale Padre';
  }

  function tarjeta(p) {
    const rec = new Date(p.canal === 'sala' ? p.creado : p.recogida); const min = Math.round((rec - Date.now()) / 60000);
    const cuando = p.canal === 'sala' ? `<small class="${-min >= 20 ? 'tarde' : ''}">hace ${-min} min</small>`
      : min < 0 ? `<small class="tarde">hace ${-min} min</small>` : `<small>en ${min} min</small>`;
    const boton = { nuevo: ['preparar', 'Aceptar y preparar'], preparando: ['listo', '¡Listo!'], listo: ['entregar', p.canal === 'sala' ? 'Servido' : 'Entregar'] }[p.estado];
    return `<article class="ped ${p.estado}" data-id="${p.id}">
      <div class="ped-cab">
        <div class="ped-num">${p.numero}</div>
        <div class="ped-quien">${p.canal === 'sala'
          ? `<strong>🍽 ${esc(p.mesa)}</strong><span class="canal">Sala</span>`
          : `<strong>${esc(p.cliente_nombre)}</strong>${p.cliente_tel ? `<a href="tel:${esc(p.cliente_tel)}">${esc(p.cliente_tel)}</a>` : ''} · Web, para recoger`}</div>
        <div class="ped-hora"><b>${hhmm(rec)}</b>${cuando}</div>
      </div>
      <ul class="ped-lineas">${p.lineas.map(l => `<li><b>${l.cantidad}×</b>${esc(l.nombre)}
        ${l.opciones.map(o => `<small>+ ${esc(o.nombre)}</small>`).join('')}
        ${l.nota ? `<small class="nota">⚠ ${esc(l.nota)}</small>` : ''}</li>`).join('')}
        ${(p.anuladas || []).map(l => `<li class="quitada"><b>${l.cantidad}×</b>${esc(l.nombre)}<small class="nota">✕ QUITADO · ${esc(l.motivo || '')}</small></li>`).join('')}</ul>
      ${p.notas ? `<p class="ped-notas">📝 ${esc(p.notas)}</p>` : ''}
      <div class="ped-pie">
        <span class="imp">${euros(p.total)}<small>${p.canal === 'sala' ? 'Se cobra en el TPV' : p.pagado ? esc(PAGO[p.pago_metodo]) : 'Paga al recoger'}</small></span>
        ${p.canal === 'sala' ? '' : `<button class="lnk" data-acc="cancelar" data-id="${p.id}">Cancelar</button>`}
        <button class="b" data-acc="imprimir" data-id="${p.id}">Ticket</button>
        ${p.estado !== 'nuevo' ? `<button class="b" data-acc="atras" data-id="${p.id}" title="Volver al paso anterior">↩</button>` : ''}
        <button class="b b-ok" data-acc="${boton[0]}" data-id="${p.id}">${boton[1]}</button>
      </div>
    </article>`;
  }

  /* ── Acciones ── */
  const ahora = () => new Date().toISOString();
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
        case 'cancelar': await cancelar(p); break;
        case 'imprimir': case 'reimprimir': imprime(p); break;
      }
      await recarga();
    } catch (ex) { alert('No se ha podido guardar. ¿Hay conexión?\n' + (ex.message || ex)); }
    finally { b.disabled = false; }
  });

  function pregunta(dlg) {
    return new Promise(res => { dlg.returnValue = ''; dlg.showModal(); dlg.addEventListener('close', () => res(dlg.returnValue), { once: true }); });
  }
  async function entregar(p) {
    if (p.pagado || p.canal === 'sala') { await api.actualizarPedido(p.id, { estado: 'entregado', entregado_at: ahora() }); return; }
    $('#cb-titulo').textContent = `Entregar #${p.numero} · ${p.cliente_nombre}`;
    $('#cb-total').textContent = euros(p.total);
    const r = await pregunta($('#dlg-cobrar'));
    if (r === 'efectivo' || r === 'tarjeta') {
      const t = await api.cobrar({ pedido: p.id, metodo: r });
      await api.actualizarPedido(p.id, { estado: 'entregado', entregado_at: ahora() });
      if (confirm('Cobrado. ¿Imprimir la factura simplificada para el cliente?')) OP.imprimir(OP.ticketFactura(t));
    }
  }
  async function cancelar(p) {
    $('#cn-titulo').textContent = `Cancelar #${p.numero}`;
    if (await pregunta($('#dlg-cancelar')) === 'si') {
      await api.actualizarPedido(p.id, { estado: 'cancelado', motivo_cancel: $('#cn-motivo').value });
    }
  }

  /* ── Ticket de cocina (no es factura) ── */
  function imprime(p) { OP.imprimir(OP.ticketComanda(p, local.nombre)); }

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
