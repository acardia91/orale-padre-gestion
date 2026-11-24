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
  const esEncargado = () => !!(SESION && SESION.roles && SESION.roles[LOCAL] === 'encargado');

  /* Aviso flotante: verde si ha ido bien, rojo si no. */
  let tAviso = null;
  function aviso(texto, mal) {
    const el = $('#t-aviso'); el.textContent = texto; el.className = 'aviso-flota' + (mal ? ' mal' : ''); el.hidden = false;
    clearTimeout(tAviso); tAviso = setTimeout(() => { el.hidden = true; }, mal ? 6000 : 3000);
  }

  if (DEMO) $('#t-demo').hidden = false;

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
    [carta, mesas] = await Promise.all([api.carta(LOCAL), api.mesas(LOCAL)]);
    idx = indexar(carta);
    zona = mesas[0] ? mesas[0].zona : null;
    await recarga();
    // Los avisos en vivo llegan a ráfagas: se agrupan para no repintar diez veces seguidas.
    let tRec = null; api.escuchar(LOCAL, () => { clearTimeout(tRec); tRec = setTimeout(recarga, 250); });
    setInterval(recarga, 30000);
    setInterval(reloj, 15000); reloj();
  }
  function reloj() { $('#t-reloj').textContent = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', hour: '2-digit', minute: '2-digit' }); }

  async function recarga() {
    try {
      let hoy;
      [local, cuentas, agotados, mesas, hoy] = await Promise.all([api.local(LOCAL), api.cuentasAbiertas(LOCAL), api.agotados(LOCAL), api.mesas(LOCAL), api.pedidosDelDia(LOCAL)]);
      web = hoy.filter(p => p.canal === 'web' && ['nuevo', 'preparando', 'listo'].includes(p.estado)).sort((a, b) => new Date(a.recogida) - new Date(b.recogida));
    }
    catch (e) { console.warn(e); return; }
    if ($('#t-local')) $('#t-local').textContent = local.nombre.replace(/^Órale Padre\s*/, '');
    if (cuenta) {
      const c = cuentas.find(x => x.id === cuenta.id);
      if (!c) { cuenta = null; verSala(); return; }      // la cobraron o anularon desde otro TPV
      cuenta = c; pedidosCuenta = await api.pedidosDeCuenta(cuenta.id); pintaCuenta(); pintaProductos();
    } else pintaSala();
  }

  /* ══ Sala ══ */
  const minutos = d => Math.round((Date.now() - new Date(d)) / 60000);
  const totales = {};                     // total enviado de cada cuenta abierta
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
    pintaRecoger();
    const zonas = [...new Set(mesas.map(m => m.zona))];
    if (!zonas.includes(zona)) zona = zonas[0] || null;
    $('#zonas').innerHTML = zonas.length > 1 ? zonas.map(z => `<button type="button" data-zona="${esc(z)}" class="${z === zona ? 'activa' : ''}">${esc(z)}</button>`).join('') : '';
    const deZona = mesas.filter(m => m.zona === zona);
    const cont = $('#mesas');
    if (deZona.some(m => m.x != null)) {
      // Plano tal y como está colocado el local (se edita en /admin).
      cont.className = 'plano-tpv';
      OP.plano.pintar(cont, deZona, { estado: m => {
        if (m.tipo === 'deco') return null;
        const c = cuentas.find(x => x.mesa_id === m.id);
        if (!c) return { sub: m.plazas ? m.plazas + ' pax' : '' };
        return { ocupada: true, sub: minutos(c.abierta) + ' min', imp: totales[c.id] != null ? euros(totales[c.id]) : '', pendiente: (pendientes[c.id] || []).length > 0 };
      } });
    } else {
      cont.className = 'mesas';
      cont.innerHTML = deZona.filter(m => m.tipo !== 'deco').map(m => {
        const c = cuentas.find(x => x.mesa_id === m.id);
        return c ? tileCuenta(c, m.nombre) : `<button class="mesa" type="button" data-mesa="${esc(m.id)}"><strong>${esc(m.nombre)}</strong><small>Libre</small></button>`;
      }).join('') || '<p class="vacio">No hay mesas en esta zona.</p>';
    }
    const sueltas = cuentas.filter(c => !c.mesa_id);
    $('#sueltas').innerHTML = sueltas.map(c => tileCuenta(c, c.nombre)).join('') || '<p class="vacio">Ninguna abierta. Usa “+ Barra” o “+ Para llevar”.</p>';
    sumasSala();
  }
  function tileCuenta(c, nombre) {
    const pend = (pendientes[c.id] || []).length;
    return `<button class="mesa ocupada" type="button" data-cuenta="${c.id}">
      <strong>${esc(nombre)}</strong><small>${minutos(c.abierta)} min${c.para_llevar ? ' · llevar' : ''}</small>
      ${pend ? `<span class="aviso">${pend} sin enviar</span>` : ''}
      <span class="imp" data-total="${c.id}">${totales[c.id] != null ? euros(totales[c.id]) : '…'}</span></button>`;
  }
  let sumando = false;
  async function sumasSala() {
    // El total de cada mesa sale de sus comandas enviadas.
    if (sumando) return; sumando = true;
    let cambio = false;
    try {
      await Promise.all(cuentas.map(async c => {
        const ps = await api.pedidosDeCuenta(c.id);
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
    {
      try { abrir(await api.abrirCuenta({ local: LOCAL, mesa_id: mesaId })); }
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
    cuenta = c; pedidosCuenta = await api.pedidosDeCuenta(c.id);
    $('#vista-sala').hidden = true; $('#vista-cuenta').hidden = false; $('#b-atras').hidden = false;
    $('#b-barra').hidden = $('#b-llevar').hidden = true;
    $('#c-nota').value = '';
    if (!catActiva) catActiva = visibles()[0]?.clave;
    pintaProductos(); pintaCuenta();
  }
  function verSala() {
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

  function visibles() {
    const hoy = partesMadrid(new Date()).dow;
    return carta.categorias.filter(c => !c.oculta && c.productos.some(id => idx.prod.get(id) && !idx.prod.get(id).oculto) && (!c.dias || c.dias.includes(hoy)));
  }
  function pintaProductos() {
    const cats = visibles();
    if (!cats.some(c => c.clave === catActiva)) catActiva = cats[0]?.clave;
    $('#cats').innerHTML = cats.map(c => `<button type="button" data-cat="${c.clave}" class="${c.clave === catActiva ? 'activa' : ''}">${esc(c.nombre)}</button>`).join('');
    const cat = cats.find(c => c.clave === catActiva);
    $('#prods').innerHTML = (cat ? cat.productos : []).map(id => idx.prod.get(id)).filter(p => p && !p.oculto).map(p => {
       const ag = p.agotado || agotados.has(p.id);
      return `<button class="prod ${p.grupos.length ? 'extras' : ''} ${p.foto ? 'con-foto' : ''}" type="button" data-prod="${p.id}" ${ag ? 'disabled' : ''}>
        ${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : `<i class="ini">${esc(p.nombre.replace(/^(Burro|Nude|Taco|Quesadilla|Combo)\s+/i, '').slice(0, 2))}</i>`}
        <b>${esc(p.nombre)}</b><span>${ag ? 'Agotado' : euros(p.precio)}</span></button>`;
    }).join('');
  }
  $('#cats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { catActiva = b.dataset.cat; pintaProductos(); } });
  $('#prods').addEventListener('click', e => {
    const b = e.target.closest('[data-prod]'); if (!b || b.disabled) return;
    const p = idx.prod.get(b.dataset.prod);
    if (p.grupos.length) abreExtras(p); else anade({ producto: p.id, cantidad: 1, opciones: [], nota: '' });
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
    $('#c-info').textContent = `Abierta hace ${minutos(cuenta.abierta)} min${cuenta.para_llevar ? ' · para llevar' : ''}`;
    const ESTADO = { nuevo: 'En cocina', preparando: 'Preparando', listo: 'Listo', entregado: 'Servido', cancelado: 'Cancelado' };
    const enviados = pedidosCuenta.slice().sort((a, b) => a.numero - b.numero).map(p => `
      <div class="grupo-env"><span>Comanda #${p.numero} · ${new Date(p.creado).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}</span><span class="estado ${p.estado}">${ESTADO[p.estado]}</span></div>
      ${p.lineas.map((l, i) => `<div class="ln enviada ${p.estado === 'cancelado' ? 'cancelada' : ''} ${porCobrar(l) < 1 ? 'cobrada' : ''}" ${p.estado !== 'cancelado' && porCobrar(l) > 0 ? `data-pid="${p.id}" data-idx="${i}" title="Tocar para quitar"` : ''}>
        <span class="cant-fija">${l.cantidad}×</span>
        <div>${esc(l.nombre)}${l.opciones.map(o => `<small>+ ${esc(o.nombre)}</small>`).join('')}${l.nota ? `<small>“${esc(l.nota)}”</small>` : ''}${l.pagadas ? `<small class="pagado">✓ ${l.pagadas === l.cantidad ? 'Cobrado' : l.pagadas + ' cobrado' + (l.pagadas > 1 ? 's' : '')}</small>` : ''}</div>
        <span class="imp">${euros(l.unitario * l.cantidad)}</span></div>`).join('')}
      ${(p.anuladas || []).map(l => `<div class="ln quitada"><span class="cant-fija">${l.cantidad}×</span><div>${esc(l.nombre)}<small>Quitado: ${esc(l.motivo || '')}</small></div><span class="imp">−${euros(l.unitario * l.cantidad)}</span></div>`).join('')}`).join('');
    const pend = pendientes[cuenta.id] || [];
    const pendHTML = pend.length ? `<div class="grupo-env"><span>Sin enviar</span></div>` + pend.map((l, i) => {
      const p = idx.prod.get(l.producto); const ops = nombreOps(l);
      return `<div class="ln pendiente">
        <div class="ctl"><button type="button" data-menos="${i}" aria-label="Uno menos">−</button><output>${l.cantidad}</output><button type="button" data-mas="${i}" aria-label="Uno más">+</button></div>
        <div>${esc(p ? p.nombre : '¿?')}${ops.map(o => `<small>+ ${esc(o)}</small>`).join('')}${l.nota ? `<small>“${esc(l.nota)}”</small>` : ''}</div>
        <span class="imp">${p ? euros(precioLinea(idx, l) * l.cantidad) : ''}</span></div>`;
    }).join('') : '';
    $('#c-lineas').innerHTML = (enviados + pendHTML) || '<p class="vacio">Toca los productos de la izquierda para añadirlos.</p>';
    const tEnv = lineasPendientes().reduce((s, l) => s + l.unitario * l.cantidad, 0);
    const tCob = pedidosCuenta.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + p.lineas.reduce((a, l) => a + l.unitario * (l.pagadas || 0), 0), 0);
    if (tCob) $('#c-info').textContent += ` · cobrado ${euros(tCob)}`;
    const tPend = pend.reduce((s, l) => s + (idx.prod.has(l.producto) ? precioLinea(idx, l) * l.cantidad : 0), 0);
    $('#c-total').textContent = euros(tEnv + tPend);
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
    } catch (ex) { aviso('✗ No se ha enviado: ' + mensajeError(ex) + '. Vuelve a intentarlo.', true); return false; }
    finally { delete enviando[c.id]; if (cuenta && cuenta.id === c.id) pintaCuenta(); }
  }
  $('#c-enviar').onclick = enviar;

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
    $('#dp-precio').textContent = euros(precioLinea(idx, enCurso) * enCurso.cantidad);
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
  });
  $('#mv-mesas').addEventListener('click', async e => {
    const b = e.target.closest('button.mesa'); if (!b) return;
    try { await api.moverCuenta(cuenta.id, b.value); $('#dlg-mover').close(); await recarga(); }
    catch (ex) { alert(mensajeError(ex)); }
  });

  /* ── Cobrar ── */
  const dc = $('#dlg-cobrar'); let aCobrar = 0, lineasCobro = [], promos = [], todasPend = [], modo = 'todo', elegidos = {};
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
    $('#cb-partes').value = ''; pintaModo();
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
    $('#cb-total').textContent = euros(aCobrar); $('#cb-tarjeta-imp').textContent = euros(aCobrar);
    const gratis = aCobrar === 0;
    $('#cb-invita').hidden = !gratis; $('#cb-metodos').hidden = gratis;
    const v = [aCobrar, ...[500, 1000, 2000, 5000].filter(x => x > aCobrar)].slice(0, 4);
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
    $('#cb-cambio').textContent = isNaN(e) ? '—' : e < aCobrar ? 'falta ' + euros(aCobrar - e) : euros(e - aCobrar);
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
      entregado = $('#cb-entregado').value ? centimos($('#cb-entregado').value) : aCobrar;
      if (isNaN(entregado) || entregado < aCobrar) return fallo('El efectivo entregado no llega al total.');
    }
    const btn = $('#cb-ok'); btn.disabled = true;
    try {
      const items = modo === 'productos' ? lineasCobro.map(l => ({ pedido: l._pedido, indice: l._indice, cantidad: l.cantidad })) : undefined;
      const parcial = modo === 'productos' && lineasCobro.reduce((a, l) => a + l.cantidad, 0) < todasPend.reduce((a, l) => a + l.cantidad, 0);
      const t = await api.cobrar({ cuenta: cuenta.id, metodo: met, entregado, promocion: promo ? promo.id : null, nota: $('#cb-nota').value.trim(), items });
      dc.close();
      if ($('#cb-imprimir').checked) OP.imprimir(OP.ticketFactura(t));
      if (t.cambio) aviso('Cambio: ' + euros(t.cambio));
      if (parcial) {
        pedidosCuenta = await api.pedidosDeCuenta(cuenta.id); pintaCuenta();
        aviso(`✓ Cobrado ${euros(t.total)} (${t.serie}-${t.numero}). Quedan ${euros(lineasPendientes().reduce((a, l) => a + l.unitario * l.cantidad, 0))} en la mesa.`);
      } else {
        delete pendientes[cuenta.id]; guardaPend();
        await recarga(); verSala();
      }
    } catch (ex) { fallo(mensajeError(ex)); }
    finally { btn.disabled = false; }
  };

  /* ══ Control: quitar productos enviados y anular cuentas (con clave de encargado) ══ */
  const dq = $('#dlg-quitar'); let qAcc = null;
  function prepQuitar(titulo, detalle, conCantidad, max) {
    $('#dq-titulo').textContent = titulo; $('#dq-detalle').innerHTML = detalle;
    $('#dq-cant-l').hidden = !conCantidad; $('#dq-cant').max = max || 1; $('#dq-cant').value = 1;
    $('#dq-motivo').value = ''; $('#dq-pin').value = ''; $('#dq-error').hidden = true;
    $('#dq-pin-l').hidden = esEncargado();
    $('#dq-pin-nota').textContent = esEncargado() ? 'Eres encargado: queda registrado a tu nombre.' : 'Hace falta la clave de un encargado. Queda registrado quién lo pide y quién lo autoriza.';
    dq.showModal();
  }
  function abreQuitar(pid, i) {
    const p = pedidosCuenta.find(x => x.id === pid); const l = p && p.lineas[i]; if (!l) return;
    qAcc = { tipo: 'linea', pid, i };
    prepQuitar('Quitar producto', `<b>${l.cantidad}× ${esc(l.nombre)}</b> · comanda #${p.numero} · ${euros(l.unitario * l.cantidad)}<br><small>Ya se mandó a cocina: avisa en cocina si hay que pararlo.</small>`, l.cantidad > 1, l.cantidad);
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
    if (!esEncargado() && !/^[0-9]{4,8}$/.test(pin)) return fallo('Falta la clave del encargado.');
    const btn = $('#dq-ok'); btn.disabled = true;
    try {
      if (qAcc.tipo === 'linea') {
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
      if (/clave de encargado incorrecta/i.test(m)) { api.apuntarPinFallido(LOCAL, qAcc.tipo === 'linea' ? 'quitar producto' : 'anular cuenta'); $('#dq-pin').value = ''; $('#dq-pin').focus(); }
    } finally { btn.disabled = false; }
  };

  /* ══ Caja: resumen desde el último cierre y cierre de caja ══ */
  let resumen = null;
  const cent = v => { const n = Math.round(parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')) * 100); return isNaN(n) ? null : n; };
  function pintaCierre() {
    if (!resumen) return;
    const esperado = resumen.fondo_inicial + resumen.efectivo;
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


  let tickets = [];
  $('#b-caja').onclick = async () => {
    try { [tickets, resumen] = await Promise.all([api.ticketsDelDia(LOCAL), api.resumenCaja(LOCAL)]); }
    catch (ex) { aviso('No se ha podido cargar la caja: ' + mensajeError(ex), true); return; }
    const desde = new Date(resumen.desde).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('#cz-desde').textContent = desde;
    $('#cz-fondo').textContent = euros(resumen.fondo_inicial); $('#cz-efectivo').textContent = euros(resumen.efectivo);
    $('#cz-tarjeta').textContent = euros(resumen.tarjeta); $('#cz-online').textContent = euros(resumen.online);
    $('#cz-anul').textContent = resumen.anulaciones ? `${resumen.anulaciones} (${euros(resumen.importe_anulado)})` : '0';
    $('#cz-abiertas').hidden = !resumen.cuentas_abiertas;
    $('#cz-abiertas').textContent = `Ojo: hay ${resumen.cuentas_abiertas} ${resumen.cuentas_abiertas === 1 ? 'cuenta abierta' : 'cuentas abiertas'} sin cobrar.`;
    $('#cz-contado').value = ''; $('#cz-retirado').value = ''; $('#cz-retirado').dataset.tocado = ''; $('#cz-notas').value = ''; $('#cz-error').hidden = true;
    $('#cz-pin').hidden = !esEncargado();
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
    const d = contado - (resumen.fondo_inicial + resumen.efectivo);
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
        <div class="l"><span>Fondo inicial</span><span>${euros(z.fondo_inicial)}</span></div>
        <div class="l"><span>Esperado en cajón</span><span>${euros(z.fondo_inicial + z.efectivo)}</span></div>
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
