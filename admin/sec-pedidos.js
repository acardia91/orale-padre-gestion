/* ÓRALE PADRE · admin · Pedidos (web para recoger + comandas de sala) */
(function () {
  'use strict';
  const { api, euros } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hora = d => new Date(d).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
  const dia = d => new Date(d).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit' });
  const ESTADO = { pendiente_pago: ['Esperando pago', ''], nuevo: ['Nuevo', 'rojo'], preparando: ['Preparando', ''], listo: ['Listo', 'verde'], entregado: ['Entregado', 'gris'], cancelado: ['Cancelado', 'gris'] };
  const PAGO = { local: 'Paga al recoger', efectivo: 'Efectivo', tarjeta: 'Tarjeta', stripe: 'Online' };
  let LOCAL, LOCALES = [], pedidos = [], rango = 'hoy', quitar = [], reloj = null;
  const nombreLocal = id => ((LOCALES.find(l => l.id === id) || {}).nombre || id).replace(/^Órale Padre\s*/, '');

  function calcRango(r) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const d = new Date(hoy), h = new Date(hoy); h.setDate(h.getDate() + 1);
    if (r === 'ayer') { d.setDate(d.getDate() - 1); h.setDate(h.getDate() - 1); }
    if (r === '7') d.setDate(d.getDate() - 6);
    if (r === 'mes') d.setDate(1);
    return [d, h];
  }
  async function cargar() {
    document.querySelectorAll('[data-prango]').forEach(b => b.classList.toggle('b-ok', b.dataset.prango === rango));
    const [d, h] = calcRango(rango); const ids = LOCAL === '*' ? LOCALES.map(l => l.id) : [LOCAL];
    const res = await Promise.all(ids.map(id => api.pedidosEntre(id, d.toISOString(), h.toISOString()).then(ps => ps.map(p => ({ ...p, local: id }))).catch(() => [])));
    pedidos = res.flat().sort((a, b) => new Date(b.creado) - new Date(a.creado));
    pinta();
  }
  function filtrados() {
    const c = $('#pd-canal').value, e = $('#pd-estado').value;
    return pedidos.filter(p => (!c || p.canal === c) && (!e || (e === 'activos' ? ['nuevo', 'preparando', 'listo'].includes(p.estado) : p.estado === e)));
  }
  function pinta() {
    const ps = filtrados(); const vivos = ps.filter(p => !['cancelado', 'pendiente_pago'].includes(p.estado));
    const k = (t, v, s) => `<div class="kpi"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
    const sinCobrar = vivos.filter(p => p.canal === 'web' && !p.pagado);
    $('#pd-kpis').innerHTML = k('Pedidos', vivos.length, euros(vivos.reduce((s, p) => s + p.total, 0))) +
      k('Web (recoger)', vivos.filter(p => p.canal === 'web').length, euros(vivos.filter(p => p.canal === 'web').reduce((s, p) => s + p.total, 0))) +
      k('Sala', vivos.filter(p => p.canal === 'sala').length, euros(vivos.filter(p => p.canal === 'sala').reduce((s, p) => s + p.total, 0))) +
      k('En marcha', ps.filter(p => ['nuevo', 'preparando', 'listo'].includes(p.estado)).length, 'nuevos, preparando o listos') +
      k('Web sin cobrar', sinCobrar.length, sinCobrar.length ? euros(sinCobrar.reduce((s, p) => s + p.total, 0)) + ' se cobran al recoger' : '') +
      k('Cancelados', ps.filter(p => p.estado === 'cancelado').length);
    const varios = LOCAL === '*'; const multi = rango !== 'hoy' && rango !== 'ayer';
    $('#pd-lista').innerHTML = `<thead><tr><th>#</th>${varios ? '<th>Local</th>' : ''}<th>${multi ? 'Fecha' : 'Hora'}</th><th>Canal</th><th>Cliente / mesa</th><th>Productos</th><th class="num">Total</th><th>Pago</th><th>Estado</th></tr></thead><tbody>` +
      (ps.map(p => {
        const [et, ec] = ESTADO[p.estado] || [p.estado, ''];
        const prods = (p.lineas || []).map(l => `${l.cantidad}× ${esc(l.nombre)}`).join(', ');
        return `<tr data-pm="${p.id}" class="${p.estado === 'cancelado' ? 'apagado' : ''}">
          <td><b>${p.numero}</b></td>${varios ? `<td>${esc(nombreLocal(p.local))}</td>` : ''}
          <td>${multi ? dia(p.creado) + ' ' : ''}${hora(p.creado)}${p.canal === 'web' ? `<small>Recoge ${hora(p.recogida)}</small>` : ''}</td>
          <td>${p.canal === 'web' ? '<span class="tag">Web</span>' : '<span class="tag verde">Sala</span>'}</td>
          <td><b>${esc(p.canal === 'sala' ? p.mesa : p.cliente_nombre)}</b>${p.canal === 'web' && p.cliente_tel ? `<small>${esc(p.cliente_tel)}</small>` : ''}</td>
          <td style="max-width:320px"><small style="color:var(--tinta)">${prods}</small></td>
          <td class="num"><b>${euros(p.total)}</b></td>
          <td>${p.pagado ? `<span class="tag verde">${esc(PAGO[p.pago_metodo] || p.pago_metodo)}</span>` : p.canal === 'sala' ? '<small>En la cuenta</small>' : '<span class="tag rojo">Sin cobrar</span>'}</td>
          <td><span class="tag ${ec}">${et}</span></td></tr>`;
      }).join('') || `<tr><td colspan="9" class="nota">No hay pedidos en este periodo.</td></tr>`) + '</tbody>';
    const nuevos = pedidos.filter(p => p.estado === 'nuevo').length;
    $('#a-nuevos').hidden = !nuevos; $('#a-nuevos').textContent = nuevos;
  }
  $('#pd-lista').addEventListener('click', e => {
    const tr = e.target.closest('[data-pm]'); if (!tr) return;
    const p = pedidos.find(x => x.id === tr.dataset.pm); if (!p) return;
    const [et] = ESTADO[p.estado] || [p.estado];
    $('#dpd-titulo').textContent = `Pedido #${p.numero} · ${p.canal === 'web' ? 'Web' : esc(p.mesa)}`;
    $('#dpd-cuerpo').innerHTML = `
      <div class="kpis" style="margin-top:0">
        <div class="kpi"><small>Estado</small><b style="font-size:18px">${et}</b></div>
        <div class="kpi"><small>Total</small><b style="font-size:18px">${euros(p.total)}</b><span>${p.pagado ? 'Pagado · ' + esc(PAGO[p.pago_metodo] || p.pago_metodo) : 'Sin cobrar'}</span></div>
        <div class="kpi"><small>${p.canal === 'web' ? 'Recogida' : 'Marchado'}</small><b style="font-size:18px">${hora(p.canal === 'web' ? p.recogida : p.creado)}</b><span>${dia(p.creado)} · ${esc(nombreLocal(p.local))}</span></div>
      </div>
      ${p.canal === 'web' ? `<p style="margin:14px 0 0"><b>${esc(p.cliente_nombre)}</b> · <a href="tel:${esc(p.cliente_tel)}">${esc(p.cliente_tel)}</a>${p.cliente_email ? ' · ' + esc(p.cliente_email) : ''}</p>` : ''}
      <ul class="det-lineas" style="margin-top:12px">${(p.lineas || []).map(l => `<li><span><b>${l.cantidad}×</b> ${esc(l.nombre)}
        ${(l.opciones || []).map(o => `<small>+ ${esc(o.nombre)}</small>`).join('')}${l.nota ? `<small>“${esc(l.nota)}”</small>` : ''}</span><span>${euros(l.unitario * l.cantidad)}</span></li>`).join('')}</ul>
      ${p.notas ? `<p class="aviso" style="background:var(--oro-cl);color:#6b4a07;border-color:#F1E2C2">📝 ${esc(p.notas)}</p>` : ''}
      ${p.motivo_cancel ? `<p class="aviso">Cancelado: ${esc(p.motivo_cancel)}</p>` : ''}
      <p class="nota" style="margin-top:14px">Para cobrar o entregar, usa el TPV (apartado "Para recoger") o la pantalla de comandas.</p>`;
    $('#dlg-pedido').showModal();
  });
  $('#pd-canal').onchange = pinta; $('#pd-estado').onchange = pinta;
  document.querySelectorAll('[data-prango]').forEach(b => b.onclick = () => { rango = b.dataset.prango; cargar(); });

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.pedidos = {
    todos: true,
    async init(local, locales) {
      LOCAL = local; LOCALES = locales || [];
      await cargar();
      // En vivo: cambios en pedidos de los locales visibles + repaso cada 30 s por si se cae la conexión.
      const ids = LOCAL === '*' ? LOCALES.map(l => l.id) : [LOCAL];
      quitar = ids.map(id => api.escuchar(id, () => { clearTimeout(reloj); reloj = setTimeout(cargar, 400); }));
      setInterval(cargar, 30000);
    },
    mostrar: cargar,
  };
})();
