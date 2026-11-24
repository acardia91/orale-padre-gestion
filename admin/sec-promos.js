/* ÓRALE PADRE · admin · Promociones */
(function () {
  'use strict';
  const { api, euros, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const aCent = v => { const n = Math.round(parseFloat(String(v).replace(',', '.')) * 100); return isNaN(n) ? null : n; };
  let LOCAL, promos = [], carta = null, editando = null;

  const describe = p => p.tipo === 'porcentaje' ? `${p.valor}% en toda la cuenta`
    : p.tipo === 'importe' ? `${euros(p.valor)} de descuento`
    : `${p.unidades} gratis de ${p.productos.length} producto(s)`;

  async function cargar() {
    $('#pm-error').hidden = true;
    const hasta = new Date(); hasta.setDate(hasta.getDate() + 1); hasta.setHours(0, 0, 0, 0);
    const desde = new Date(hasta); desde.setDate(desde.getDate() - 30);
    let tickets = [];
    try {
      [promos, carta, tickets] = await Promise.all([api.promociones(LOCAL), api.carta(LOCAL), api.ticketsEntre(LOCAL, desde.toISOString(), hasta.toISOString())]);
    } catch (ex) { $('#pm-error').textContent = mensajeError(ex); $('#pm-error').hidden = false; return; }
    const uso = id => { const ts = tickets.filter(t => t.promocion && t.promocion.id === id); return { n: ts.length, d: ts.reduce((s, t) => s + (t.descuento || 0), 0) }; };
    $('#pm-lista').innerHTML = `<thead><tr><th>Código</th><th>Nombre</th><th>Qué hace</th><th>Nota</th><th class="num">Usos (30 días)</th><th class="num">Descontado</th><th>Estado</th></tr></thead><tbody>` +
      (promos.map(p => { const u = uso(p.id); return `<tr data-pm="${esc(p.id)}" class="${p.activa ? '' : 'apagado'}" style="cursor:pointer">
        <td><b>${esc(p.codigo)}</b></td><td>${esc(p.nombre)}</td><td>${esc(describe(p))}</td><td>${p.requiere_nota ? 'Sí' : '—'}</td>
        <td class="num">${u.n}</td><td class="num">${euros(u.d)}</td>
        <td>${p.activa ? '<span class="tag">Activa</span>' : '<span class="tag gris">Pausada</span>'}</td></tr>`; }).join('')
      || '<tr><td colspan="7" class="nota">No hay promociones.</td></tr>') + '</tbody>';
  }
  $('#pm-lista').addEventListener('click', e => { const tr = e.target.closest('[data-pm]'); if (tr) abrir(tr.dataset.pm); });
  $('#pm-nueva').onclick = () => abrir(null);

  const dm = $('#dlg-promo');
  function abrir(id) {
    const p = id ? promos.find(x => x.id === id) : { codigo: '', nombre: '', tipo: 'porcentaje', valor: 10, productos: [], unidades: 1, requiere_nota: false, activa: true };
    editando = id;
    $('#fm-titulo').textContent = id ? 'Editar promoción' : 'Nueva promoción';
    $('#fm-codigo').value = p.codigo; $('#fm-nombre').value = p.nombre; $('#fm-tipo').value = p.tipo;
    $('#fm-valor').value = p.tipo === 'importe' ? (p.valor / 100).toFixed(2).replace('.', ',') : p.valor;
    $('#fm-uds').value = p.unidades || 1; $('#fm-nota').checked = !!p.requiere_nota; $('#fm-activa').checked = p.activa !== false;
    $('#fm-prods').innerHTML = carta.categorias.map(c => c.productos.map(pid => carta.productos.find(x => x.id === pid)).filter(Boolean)
      .map(x => `<label><input type="checkbox" value="${esc(x.id)}" ${p.productos.includes(x.id) ? 'checked' : ''}> ${esc(x.nombre)} <small>${euros(x.precio)}</small></label>`).join('')).join('');
    $('#fm-borrar').hidden = !id; $('#fm-error').hidden = true; tipo(); dm.showModal();
  }
  function tipo() {
    const t = $('#fm-tipo').value;
    $('#fm-valor-l').hidden = t === 'producto'; $('#fm-uds-l').hidden = t !== 'producto'; $('#fm-prods-fs').hidden = t !== 'producto';
    $('#fm-valor-l').firstChild.textContent = t === 'importe' ? 'Descuento (€)' : 'Descuento (%)';
  }
  $('#fm-tipo').onchange = tipo;
  $('#fm-ok').onclick = async () => {
    const err = t => { $('#fm-error').textContent = t; $('#fm-error').hidden = false; };
    const t = $('#fm-tipo').value;
    const promo = { id: editando, codigo: $('#fm-codigo').value.trim().toUpperCase().replace(/\s+/g, ''), nombre: $('#fm-nombre').value.trim(), tipo: t,
      valor: t === 'importe' ? aCent($('#fm-valor').value) : t === 'porcentaje' ? Math.round(+String($('#fm-valor').value).replace(',', '.')) : 0,
      productos: t === 'producto' ? [...dm.querySelectorAll('#fm-prods input:checked')].map(i => i.value) : [],
      unidades: t === 'producto' ? Math.max(1, +$('#fm-uds').value || 1) : 1,
      requiere_nota: $('#fm-nota').checked, activa: $('#fm-activa').checked };
    if (!promo.codigo || !promo.nombre) return err('Falta el código o el nombre.');
    if (t === 'porcentaje' && !(promo.valor >= 1 && promo.valor <= 100)) return err('El porcentaje va de 1 a 100.');
    if (t === 'importe' && !(promo.valor > 0)) return err('Escribe el importe así: 5,00');
    if (t === 'producto' && !promo.productos.length) return err('Marca al menos un producto.');
    try { await api.guardarPromocion(LOCAL, promo); dm.close(); cargar(); } catch (ex) { err(mensajeError(ex)); }
  };
  $('#fm-borrar').onclick = async () => {
    const p = promos.find(x => x.id === editando);
    if (!confirm(`¿Eliminar "${p.codigo}"? Los tickets donde se usó la conservan. Si solo quieres dejar de usarla, desmarca "Activa".`)) return;
    try { await api.borrarPromocion(LOCAL, editando); dm.close(); cargar(); } catch (ex) { $('#fm-error').textContent = mensajeError(ex); $('#fm-error').hidden = false; }
  };

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.promos = { async init(l) { LOCAL = l; await cargar(); }, mostrar: cargar };
})();
