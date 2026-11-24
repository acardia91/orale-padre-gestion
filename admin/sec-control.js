/* ÓRALE PADRE · admin · Control (antifraude) y cierres de caja */
(function () {
  'use strict';
  const { api, euros, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = d => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const quien = e => e ? esc(e.split('@')[0].replace(/^orale\.padre\.food\+/, '')) : '—';
  const ACC = {
    linea_anulada: ['Producto quitado', 'rojo'], cuenta_anulada: ['Cuenta anulada', 'rojo'], pedido_cancelado: ['Pedido web cancelado', ''],
    precuenta: ['Pre-cuenta impresa', 'gris'], pin_fallido: ['Clave fallida', 'rojo'], cierre_caja: ['Cierre de caja', 'verde'], pin_cambiado: ['Clave cambiada', 'gris'],
  };
  let LOCAL, LOCALES = [], rango = '7', lista = [], cierres = [];
  const nombreLocal = id => ((LOCALES.find(l => l.id === id) || {}).nombre || id).replace(/^Órale Padre\s*/, '');

  function calcRango(r) {
    const h = new Date(); h.setHours(24, 0, 0, 0); const d = new Date(); d.setHours(0, 0, 0, 0);
    if (r === '7') d.setDate(d.getDate() - 6); if (r === '30') d.setDate(d.getDate() - 29); if (r === 'mes') d.setDate(1);
    return [d.toISOString(), h.toISOString()];
  }
  async function cargar() {
    document.querySelectorAll('[data-crango]').forEach(b => b.classList.toggle('b-ok', b.dataset.crango === rango));
    const [d, h] = calcRango(rango); const loc = LOCAL === '*' ? null : LOCAL;
    try { [lista, cierres] = await Promise.all([api.auditoria(loc, d, h), api.cierres(loc, d, h)]); }
    catch (ex) { $('#ct-lista').innerHTML = `<tbody><tr><td class="nota">${esc(mensajeError(ex))}</td></tr></tbody>`; return; }
    pinta();
  }
  function pinta() {
    const n = a => lista.filter(x => x.accion === a);
    const imp = a => n(a).reduce((s, x) => s + (x.importe || 0), 0);
    // Señal de alarma típica: anular o quitar después de imprimir la pre-cuenta.
    const trasPre = lista.filter(x => ['linea_anulada', 'cuenta_anulada'].includes(x.accion) && x.detalle && x.detalle.precuenta_impresa).length;
    const desc = cierres.reduce((s, c) => s + c.descuadre, 0);
    const k = (t, v, s, cl) => `<div class="kpi ${cl || ''}"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
    $('#ct-kpis').innerHTML =
      k('Productos quitados', n('linea_anulada').length, euros(imp('linea_anulada'))) +
      k('Cuentas anuladas', n('cuenta_anulada').length, euros(imp('cuenta_anulada'))) +
      k('Quitado tras pre-cuenta', trasPre, trasPre ? 'revisar: patrón de fraude típico' : 'ninguno') +
      k('Claves fallidas', n('pin_fallido').length) +
      k('Cierres de caja', cierres.length, cierres.length ? 'descuadre total ' + euros(desc) : '');
    const tipo = $('#ct-tipo').value; const varios = LOCAL === '*';
    const filas = lista.filter(x => !tipo || x.accion === tipo);
    $('#ct-lista').innerHTML = `<thead><tr><th>Cuándo</th>${varios ? '<th>Local</th>' : ''}<th>Qué</th><th>Detalle</th><th class="num">Importe</th><th>Quién</th><th>Autoriza</th><th>Motivo</th></tr></thead><tbody>` +
      (filas.map(x => {
        const [t, c] = ACC[x.accion] || [x.accion, '']; const d = x.detalle || {};
        const det = x.accion === 'linea_anulada' ? `${d.cantidad}× ${esc(d.producto)} · ${esc(d.mesa)} · comanda #${d.comanda}`
          : x.accion === 'cuenta_anulada' ? esc(d.mesa) : x.accion === 'precuenta' ? esc(d.mesa)
          : x.accion === 'pedido_cancelado' ? `#${d.numero} · ${esc(d.cliente || '')}${d.pagado ? ' · pagado online' : ''}`
          : x.accion === 'cierre_caja' ? `Contado ${euros(d.contado || 0)} · esperado ${euros(d.esperado || 0)}` : x.accion === 'pin_fallido' ? esc(x.motivo || '') : '';
        const alarma = d.precuenta_impresa ? ' <span class="tag rojo">tras pre-cuenta</span>' : '';
        return `<tr><td>${fecha(x.cuando)}</td>${varios ? `<td>${esc(nombreLocal(x.local))}</td>` : ''}<td><span class="tag ${c}">${t}</span>${alarma}</td>
          <td>${det}</td><td class="num">${x.importe != null ? (x.accion === 'cierre_caja' ? 'descuadre ' : '') + euros(x.importe) : ''}</td>
          <td>${quien(x.usuario)}</td><td>${x.autorizado && x.autorizado !== x.usuario ? quien(x.autorizado) : x.autorizado ? 'él mismo' : '—'}</td><td>${x.accion === 'pin_fallido' ? '' : esc(x.motivo || '')}</td></tr>`;
      }).join('') || `<tr><td colspan="8" class="nota">Nada que registrar en este periodo.</td></tr>`) + '</tbody>';
    $('#ct-cierres').innerHTML = `<thead><tr><th>Cierre</th>${varios ? '<th>Local</th>' : ''}<th>Quién</th><th class="num">Tickets</th><th class="num">Efectivo</th><th class="num">Tarjeta</th><th class="num">Online</th><th class="num">Contado</th><th class="num">Descuadre</th><th class="num">Retirado</th><th>Notas</th></tr></thead><tbody>` +
      (cierres.map(c => `<tr><td>${fecha(c.hasta)}<small>desde ${fecha(c.desde)}</small></td>${varios ? `<td>${esc(nombreLocal(c.local))}</td>` : ''}<td>${quien(c.usuario_email)}</td>
        <td class="num">${c.tickets}</td><td class="num">${euros(c.efectivo)}</td><td class="num">${euros(c.tarjeta)}</td><td class="num">${euros(c.online)}</td>
        <td class="num">${euros(c.efectivo_contado)}</td><td class="num"><span class="tag ${c.descuadre ? 'rojo' : 'verde'}">${euros(c.descuadre)}</span></td>
        <td class="num">${euros(c.retirado)}</td><td>${esc(c.notas || '')}</td></tr>`).join('')
       || `<tr><td colspan="11" class="nota">Aún no hay cierres en este periodo. Se hacen desde el TPV, botón "Caja".</td></tr>`) + '</tbody>';
  }
  $('#ct-tipo').onchange = pinta;
  document.querySelectorAll('[data-crango]').forEach(b => b.onclick = () => { rango = b.dataset.crango; cargar(); });

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.control = { todos: true, async init(l, locales) { LOCAL = l; LOCALES = locales || []; await cargar(); }, mostrar: cargar };
})();
