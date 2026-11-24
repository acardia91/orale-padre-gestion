/* ÓRALE PADRE · TPV de sala */
(function () {
  'use strict';
  const { api, DEMO, indexar, precioLinea, mensajeError, euros, partesMadrid, calculaTicket } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };

  let LOCAL = new URLSearchParams(location.search).get('local') || ls('op-tpv-local') || 'tomares';
  let local, carta, idx, mesas = [], cuentas = [], agotados = new Set();
  let zona = null, cuenta = null, pedidosCuenta = [], catActiva = null;
  // Lo que el camarero ha marcado y aún no ha enviado a cocina, por cuenta (sobrevive a recargar).
  const pendientes = ls('op-tpv-pendientes') || {};
  const guardaPend = () => ls('op-tpv-pendientes', pendientes);

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
    if (!s.locales.length) { $('#e-error').textContent = 'Tu usuario no tiene ningún local asignado.'; $('#e-error').hidden = false; $('#vista-entrar').hidden = false; return; }
    if (!s.locales.includes(LOCAL)) LOCAL = s.locales[0];
    ls('op-tpv-local', LOCAL);
    $('#vista-entrar').hidden = true; $('#vista-app').hidden = false;
    [carta, mesas] = await Promise.all([api.carta(LOCAL), api.mesas(LOCAL)]);
    idx = indexar(carta);
    zona = mesas[0] ? mesas[0].zona : null;
    await recarga();
    api.escuchar(LOCAL, () => recarga());
    setInterval(recarga, 30000);
    setInterval(reloj, 15000); reloj();
  }
  function reloj() { $('#t-reloj').textContent = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', hour: '2-digit', minute: '2-digit' }); }

  async function recarga() {
    try { [local, cuentas, agotados, mesas] = await Promise.all([api.local(LOCAL), api.cuentasAbiertas(LOCAL), api.agotados(LOCAL), api.mesas(LOCAL)]); }
    catch (e) { console.warn(e); return; }
    $('#t-local').textContent = local.nombre.replace(/^Órale Padre\s*/, '');
    if (cuenta) {
      const c = cuentas.find(x => x.id === cuenta.id);
      if (!c) { cuenta = null; verSala(); return; }      // la cobraron o anularon desde otro TPV
      cuenta = c; pedidosCuenta = await api.pedidosDeCuenta(cuenta.id); pintaCuenta(); pintaProductos();
    } else pintaSala();
  }

  /* ══ Sala ══ */
  const minutos = d => Math.round((Date.now() - new Date(d)) / 60000);
  const totales = {};                     // total enviado de cada cuenta abierta
  function pintaSala() {
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
  $('#b-atras').onclick = verSala;

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
      return `<button class="prod ${p.grupos.length ? 'extras' : ''}" type="button" data-prod="${p.id}" ${ag ? 'disabled' : ''}>
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

  const nombreOps = l => l.opciones.map(oid => { for (const g of idx.grupos.values()) { const o = g.opciones.find(x => x.id === oid); if (o) return o.nombre; } return ''; });
  function pintaCuenta() {
    $('#c-nombre').textContent = cuenta.nombre;
    $('#c-info').textContent = `Abierta hace ${minutos(cuenta.abierta)} min${cuenta.para_llevar ? ' · para llevar' : ''}`;
    const ESTADO = { nuevo: 'En cocina', preparando: 'Preparando', listo: 'Listo', entregado: 'Servido', cancelado: 'Cancelado' };
    const enviados = pedidosCuenta.slice().sort((a, b) => a.numero - b.numero).map(p => `
      <div class="grupo-env"><span>Comanda #${p.numero} · ${new Date(p.creado).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}</span><span class="estado ${p.estado}">${ESTADO[p.estado]}</span></div>
      ${p.lineas.map(l => `<div class="ln enviada ${p.estado === 'cancelado' ? 'cancelada' : ''}">
        <span class="cant-fija">${l.cantidad}×</span>
        <div>${esc(l.nombre)}${l.opciones.map(o => `<small>+ ${esc(o.nombre)}</small>`).join('')}${l.nota ? `<small>“${esc(l.nota)}”</small>` : ''}</div>
        <span class="imp">${euros(l.unitario * l.cantidad)}</span></div>`).join('')}`).join('');
    const pend = pendientes[cuenta.id] || [];
    const pendHTML = pend.length ? `<div class="grupo-env"><span>Sin enviar</span></div>` + pend.map((l, i) => {
      const p = idx.prod.get(l.producto); const ops = nombreOps(l);
      return `<div class="ln pendiente">
        <div class="ctl"><button type="button" data-menos="${i}" aria-label="Uno menos">−</button><output>${l.cantidad}</output><button type="button" data-mas="${i}" aria-label="Uno más">+</button></div>
        <div>${esc(p ? p.nombre : '¿?')}${ops.map(o => `<small>+ ${esc(o)}</small>`).join('')}${l.nota ? `<small>“${esc(l.nota)}”</small>` : ''}</div>
        <span class="imp">${p ? euros(precioLinea(idx, l) * l.cantidad) : ''}</span></div>`;
    }).join('') : '';
    $('#c-lineas').innerHTML = (enviados + pendHTML) || '<p class="vacio">Toca los productos de la izquierda para añadirlos.</p>';
    const tEnv = pedidosCuenta.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + p.total, 0);
    const tPend = pend.reduce((s, l) => s + (idx.prod.has(l.producto) ? precioLinea(idx, l) * l.cantidad : 0), 0);
    $('#c-total').textContent = euros(tEnv + tPend);
    $('#c-enviar').textContent = pend.length ? `Enviar a cocina (${pend.reduce((s, l) => s + l.cantidad, 0)})` : 'Enviar a cocina';
    $('#c-enviar').disabled = !pend.length;
    $('#c-cobrar').disabled = !(tEnv + tPend);
    const el = $('#c-lineas'); el.scrollTop = el.scrollHeight;
  }
  $('#c-lineas').addEventListener('click', e => {
    const t = e.target; const pend = pendientes[cuenta.id]; if (!pend) return;
    if (t.dataset.mas) pend[t.dataset.mas].cantidad = Math.min(20, pend[t.dataset.mas].cantidad + 1);
    else if (t.dataset.menos) { pend[t.dataset.menos].cantidad--; if (pend[t.dataset.menos].cantidad < 1) pend.splice(t.dataset.menos, 1); }
    else return;
    guardaPend(); pintaCuenta();
  });

  async function enviar() {
    const pend = pendientes[cuenta.id] || []; if (!pend.length) return true;
    const btn = $('#c-enviar'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await api.enviarComanda(cuenta.id, pend.map(({ producto, cantidad, opciones, nota }) => ({ producto, cantidad, opciones, nota })), $('#c-nota').value.trim());
      delete pendientes[cuenta.id]; guardaPend(); $('#c-nota').value = '';
      pedidosCuenta = await api.pedidosDeCuenta(cuenta.id); pintaCuenta();
      return true;
    } catch (ex) { alert(mensajeError(ex)); pintaCuenta(); return false; }
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
      const lineas = pedidosCuenta.filter(p => p.estado !== 'cancelado').flatMap(p => p.lineas);
      if ((pendientes[cuenta.id] || []).length) alert('Ojo: hay productos sin enviar a cocina; no salen en la pre-cuenta.');
      OP.imprimir(OP.ticketPrecuenta(cuenta.nombre, lineas, calculaTicket(lineas).total));
    }
    if (m === 'mover') {
      const libres = mesas.filter(x => x.tipo !== 'deco' && !cuentas.some(c => c.mesa_id === x.id));
      $('#mv-mesas').innerHTML = libres.map(x => `<button class="mesa" type="button" value="${esc(x.id)}"><strong>${esc(x.nombre)}</strong><small>${esc(x.zona)}</small></button>`).join('') || '<p class="vacio">No hay mesas libres.</p>';
      $('#dlg-mover').showModal();
    }
    if (m === 'anular') {
      const motivo = prompt('Motivo para anular la cuenta (queda registrado):', '');
      if (!motivo || motivo.trim().length < 3) return;
      try { await api.anularCuenta(cuenta.id, motivo.trim()); delete pendientes[cuenta.id]; guardaPend(); await recarga(); verSala(); }
      catch (ex) { alert(mensajeError(ex)); }
    }
  });
  $('#mv-mesas').addEventListener('click', async e => {
    const b = e.target.closest('button.mesa'); if (!b) return;
    try { await api.moverCuenta(cuenta.id, b.value); $('#dlg-mover').close(); await recarga(); }
    catch (ex) { alert(mensajeError(ex)); }
  });

  /* ── Cobrar ── */
  const dc = $('#dlg-cobrar'); let aCobrar = 0, lineasCobro = [], promos = [];
  const promoSel = () => promos.find(p => p.id === $('#cb-promo').value) || null;
  $('#c-cobrar').onclick = async () => {
    if ((pendientes[cuenta.id] || []).length) {
      if (!confirm('Hay productos sin enviar a cocina. ¿Enviarlos ahora y cobrar?')) return;
      if (!(await enviar())) return;
    }
    lineasCobro = pedidosCuenta.filter(p => p.estado !== 'cancelado').flatMap(p => p.lineas);
    if (!calculaTicket(lineasCobro).total) return;
    try { promos = (await api.promociones(LOCAL)).filter(p => p.activa); } catch (e) { promos = []; }
    $('#cb-promo').innerHTML = '<option value="">Sin promoción</option>' + promos.map(p => {
      const d = OP.descuentoPromo(p, lineasCobro);
      return `<option value="${p.id}" ${d ? '' : 'disabled'}>${esc(p.codigo)} · ${esc(p.nombre)}${d ? ` (−${euros(d)})` : ' (no aplica)'}</option>`;
    }).join('');
    $('#cb-nombre').textContent = cuenta.nombre; $('#cb-nota').value = '';
    $('#cb-entregado').value = ''; $('#cb-error').hidden = true;
    dc.querySelector('[value=efectivo]').checked = true;
    recalcula(); dc.showModal();
  };
  function recalcula() {
    const promo = promoSel(); const r = calculaTicket(lineasCobro, promo); aCobrar = r.total;
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
      const t = await api.cobrar({ cuenta: cuenta.id, metodo: met, entregado, promocion: promo ? promo.id : null, nota: $('#cb-nota').value.trim() });
      dc.close();
      if ($('#cb-imprimir').checked) OP.imprimir(OP.ticketFactura(t));
      delete pendientes[cuenta.id]; guardaPend();
      await recarga(); verSala();
    } catch (ex) { fallo(mensajeError(ex)); }
    finally { btn.disabled = false; }
  };

  /* ── Caja del día ── */
  let tickets = [];
  $('#b-caja').onclick = async () => {
    tickets = await api.ticketsDelDia(LOCAL);
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
  $('#cj-imprimir').onclick = () => {
    const suma = f => tickets.filter(f).reduce((s, t) => s + t.total, 0);
    OP.imprimir(`<div class="c g">CIERRE DE CAJA</div><div class="c">${esc(local.nombre)}</div>
      <div class="c">${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</div><hr>
      <div class="l"><span>Tickets</span><span>${tickets.length}${tickets.length ? ` (${tickets[0].serie}-${tickets[0].numero} a ${tickets.at(-1).numero})` : ''}</span></div>
      <div class="l"><span>Efectivo</span><span>${euros(suma(t => t.metodo === 'efectivo'))}</span></div>
      <div class="l"><span>Tarjeta</span><span>${euros(suma(t => t.metodo === 'tarjeta'))}</span></div><hr>
      <div class="l tot"><span>TOTAL</span><span>${euros(suma(() => true))}</span></div>`);
  };
})();
