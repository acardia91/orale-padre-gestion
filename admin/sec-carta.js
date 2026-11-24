/* ÓRALE PADRE · admin · Carta y productos */
(function () {
  'use strict';
  const { api, euros, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const aCent = v => { const n = Math.round(parseFloat(String(v).replace(',', '.')) * 100); return isNaN(n) ? null : n; };
  const aEur = c => (c / 100).toFixed(2).replace('.', ',');
  const ALERGENOS = ['Gluten', 'Crustáceos', 'Huevos', 'Pescado', 'Cacahuetes', 'Soja', 'Leche', 'Frutos de cáscara', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Altramuces', 'Moluscos'];
  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  let LOCAL, carta, original = '';
  const sucio = () => carta && JSON.stringify(carta) !== original;
  function marca() {
    const s = sucio(); $('#c-sucio').hidden = !s; $('#c-publicar').disabled = !s; $('#c-descartar').disabled = !s;
  }
  const prod = id => carta.productos.find(p => p.id === id);
  const grupo = id => carta.grupos.find(g => g.id === id);
  const catDe = id => carta.categorias.find(c => c.productos.includes(id));

  async function cargar() {
    carta = await api.carta(LOCAL);
    carta.grupos = carta.grupos || []; carta.categorias = carta.categorias || []; carta.productos = carta.productos || [];
    original = JSON.stringify(carta);
    $('#c-error').hidden = true; pintaTodo(); marca();
  }
  function pintaTodo() { pintaFiltroCat(); pintaProductos(); pintaGrupos(); pintaCategorias(); }

  /* ── Pestañas ── */
  document.querySelectorAll('[data-ctab]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-ctab]').forEach(x => x.classList.toggle('activa', x === b));
    document.querySelectorAll('[data-cpanel]').forEach(p => { p.hidden = p.dataset.cpanel !== b.dataset.ctab; });
  });

  /* ══ Productos ══ */
  function pintaFiltroCat() {
    const v = $('#c-filtro-cat').value;
    $('#c-filtro-cat').innerHTML = '<option value="">Todas las categorías</option>' + carta.categorias.map(c => `<option value="${c.clave}">${esc(c.nombre)}</option>`).join('') + '<option value="__sin">Sin categoría</option>';
    $('#c-filtro-cat').value = v;
  }
  function pintaProductos() {
    const q = $('#c-buscar').value.trim().toLowerCase(); const fc = $('#c-filtro-cat').value;
    // Orden: el de las categorías, y dentro el de cada categoría.
    const orden = carta.categorias.flatMap(c => c.productos);
    const lista = carta.productos.slice().sort((a, b) => (orden.indexOf(a.id) + 1 || 1e6) - (orden.indexOf(b.id) + 1 || 1e6))
      .filter(p => !q || p.nombre.toLowerCase().includes(q))
      .filter(p => !fc || (fc === '__sin' ? !catDe(p.id) : (catDe(p.id) || {}).clave === fc));
    $('#c-lista').innerHTML = `<thead><tr><th></th><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th>Extras</th><th>Estado</th></tr></thead><tbody>` +
      (lista.map(p => {
        const c = catDe(p.id);
        const est = [p.oculto ? '<span class="tag gris">Oculto</span>' : '', p.agotado ? '<span class="tag rojo">Agotado</span>' : '', p.alcohol ? '<span class="tag">Alcohol</span>' : ''].join('');
        return `<tr data-p="${esc(p.id)}" class="${p.oculto ? 'apagado' : ''}">
          <td class="mini">${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : '<span class="sinfoto"></span>'}</td>
          <td><b>${esc(p.nombre)}</b>${p.desc ? `<small>${esc(p.desc.slice(0, 80))}${p.desc.length > 80 ? '…' : ''}</small>` : ''}</td>
          <td>${c ? esc(c.nombre) : '<span class="tag rojo">Sin categoría</span>'}</td>
          <td class="num"><b>${euros(p.precio)}</b></td>
          <td>${p.grupos.length ? p.grupos.map(g => esc((grupo(g) || {}).nombre || '?')).join('<br>') : '—'}</td>
          <td>${est || 'Visible'}</td></tr>`;
      }).join('') || '<tr><td colspan="6" class="nota">Ningún producto coincide.</td></tr>') + '</tbody>';
  }
  $('#c-buscar').oninput = pintaProductos; $('#c-filtro-cat').onchange = pintaProductos;
  $('#c-lista').addEventListener('click', e => { const tr = e.target.closest('[data-p]'); if (tr) abreProducto(tr.dataset.p); });
  $('#c-nuevo').onclick = () => abreProducto(null);

  /* ── Ficha de producto ── */
  const dp = $('#dlg-prod'); let editando = null, fotoTmp = null;
  function abreProducto(id) {
    const p = id ? prod(id) : { id: null, nombre: '', desc: '', alergenos: [], foto: null, precio: 0, agotado: false, alcohol: false, oculto: false, grupos: [] };
    editando = id; fotoTmp = p.foto;
    $('#fp-titulo').textContent = id ? 'Editar producto' : 'Nuevo producto';
    $('#fp-nombre').value = p.nombre; $('#fp-precio').value = id ? aEur(p.precio) : ''; $('#fp-desc').value = p.desc || '';
    $('#fp-cat').innerHTML = carta.categorias.map(c => `<option value="${c.clave}">${esc(c.nombre)}</option>`).join('');
    const c = id ? catDe(id) : carta.categorias.find(x => x.clave === $('#c-filtro-cat').value) || carta.categorias[0];
    if (c) $('#fp-cat').value = c.clave;
    $('#fp-alerg').innerHTML = ALERGENOS.map(a => `<label><input type="checkbox" value="${a}" ${p.alergenos.includes(a) ? 'checked' : ''}> ${a}</label>`).join('');
    $('#fp-grupos').innerHTML = carta.grupos.length ? carta.grupos.map(g => `<label><input type="checkbox" value="${g.id}" ${p.grupos.includes(g.id) ? 'checked' : ''}> ${esc(g.nombre)} <small>(${g.min ? 'obligatorio' : 'opcional'}, ${g.opciones.length} opciones)</small></label>`).join('')
      : '<p class="nota">Aún no hay grupos de extras. Créalos en la pestaña "Extras y combos".</p>';
    $('#fp-alcohol').checked = !!p.alcohol; $('#fp-agotado').checked = !!p.agotado; $('#fp-oculto').checked = !!p.oculto;
    $('#fp-borrar').hidden = !id; $('#fp-error').hidden = true;
    pintaFoto(); dp.showModal();
  }
  function pintaFoto() { $('#fp-img').hidden = !fotoTmp; $('#fp-sin').hidden = !!fotoTmp; if (fotoTmp) $('#fp-img').src = fotoTmp; $('#fp-quitar-foto').hidden = !fotoTmp; }
  $('#fp-quitar-foto').onclick = () => { fotoTmp = null; pintaFoto(); };
  $('#fp-archivo').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 3 * 1024 * 1024) { err('La foto pesa más de 3 MB. Usa una más pequeña.'); return; }
    $('#fp-sin').textContent = 'Subiendo…'; $('#fp-sin').hidden = false; $('#fp-img').hidden = true;
    try { fotoTmp = await api.subirFoto(LOCAL, await reducir(f)); }
    catch (ex) { err('No se ha podido subir la foto: ' + mensajeError(ex)); }
    $('#fp-sin').textContent = 'Sin foto'; pintaFoto();
  };
  // Reduce la foto a 900 px de lado como mucho: carga rápido en el móvil del cliente.
  async function reducir(f) {
    try {
      const img = await createImageBitmap(f); const k = Math.min(1, 900 / Math.max(img.width, img.height));
      if (k === 1 && f.size < 400000) return f;
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
      return new File([b], 'foto.jpg', { type: 'image/jpeg' });
    } catch (e) { return f; }
  }
  const err = t => { $('#fp-error').textContent = t; $('#fp-error').hidden = false; };
  $('#fp-ok').onclick = () => {
    const nombre = $('#fp-nombre').value.trim(); const precio = aCent($('#fp-precio').value);
    if (!nombre) return err('Falta el nombre.');
    if (precio == null || precio < 0) return err('El precio no es válido. Escríbelo así: 9,95');
    if (!carta.categorias.length) return err('Primero crea una categoría.');
    const datos = { nombre, precio, desc: $('#fp-desc').value.trim(), foto: fotoTmp || null,
      alergenos: [...dp.querySelectorAll('#fp-alerg input:checked')].map(i => i.value),
      grupos: [...dp.querySelectorAll('#fp-grupos input:checked')].map(i => i.value),
      alcohol: $('#fp-alcohol').checked, agotado: $('#fp-agotado').checked, oculto: $('#fp-oculto').checked };
    let id = editando;
    if (id) Object.assign(prod(id), datos);
    else { id = uid(); carta.productos.push({ id, ...datos }); }
    const destino = $('#fp-cat').value; const actual = catDe(id);
    if (!actual || actual.clave !== destino) {
      if (actual) actual.productos = actual.productos.filter(x => x !== id);
      carta.categorias.find(c => c.clave === destino).productos.push(id);
    }
    dp.close(); pintaTodo(); marca();
  };
  $('#fp-borrar').onclick = () => {
    const p = prod(editando); if (!confirm(`¿Eliminar "${p.nombre}" de la carta?`)) return;
    carta.productos = carta.productos.filter(x => x.id !== editando);
    carta.categorias.forEach(c => { c.productos = c.productos.filter(x => x !== editando); });
    dp.close(); pintaTodo(); marca();
  };

  /* ══ Extras y combos ══ */
  function pintaGrupos() {
    $('#g-lista').innerHTML = carta.grupos.map(g => {
      const uso = carta.productos.filter(p => p.grupos.includes(g.id));
      return `<button class="grupo-card" type="button" data-g="${esc(g.id)}">
        <b>${esc(g.nombre)}</b>
        <span class="tag ${g.min ? 'rojo' : ''}">${g.min ? `Obligatorio · elige ${g.min === g.max ? g.min : g.min + ' a ' + g.max}` : `Opcional · hasta ${g.max}`}</span>
        <small>${g.opciones.map(o => esc(o.nombre) + (o.precio ? ` (+${euros(o.precio)})` : '')).join(' · ')}</small>
        <small class="uso">${uso.length ? 'En: ' + uso.map(p => esc(p.nombre)).join(', ') : 'Sin usar'}</small></button>`;
    }).join('') || '<p class="nota">No hay grupos de extras.</p>';
  }
  const dg = $('#dlg-grupo'); let gEdit = null, gOps = [];
  function abreGrupo(id) {
    const g = id ? grupo(id) : { nombre: '', min: 0, max: 1, opciones: [] };
    gEdit = id; gOps = g.opciones.map(o => ({ ...o }));
    if (!gOps.length) gOps.push({ id: uid(), nombre: '', precio: 0 });
    $('#fg-nombre').value = g.nombre; $('#fg-min').value = g.min; $('#fg-max').value = g.max;
    const uso = id ? carta.productos.filter(p => p.grupos.includes(id)) : [];
    $('#fg-uso').textContent = uso.length ? 'Lo usan: ' + uso.map(p => p.nombre).join(', ') + '.' : 'Para usarlo, márcalo en la ficha de cada producto.';
    $('#fg-borrar').hidden = !id; $('#fg-error').hidden = true; pintaOps(); dg.showModal();
  }
  function pintaOps() {
    $('#fg-opciones').innerHTML = `<thead><tr><th>Opción</th><th class="num">Suplemento (€)</th><th></th></tr></thead><tbody>` +
      gOps.map((o, i) => `<tr><td><input data-on="${i}" value="${esc(o.nombre)}" maxlength="60" placeholder="Salsa verde"></td>
        <td class="num"><input data-op="${i}" value="${aEur(o.precio)}" inputmode="decimal" class="corto"></td>
        <td><button class="b b-mini b-mal" type="button" data-ox="${i}" aria-label="Quitar opción">×</button></td></tr>`).join('') + '</tbody>';
  }
  $('#fg-opciones').addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.on) gOps[t.dataset.on].nombre = t.value;
    if (t.dataset.op) { const c = aCent(t.value); gOps[t.dataset.op].precio = c == null ? 0 : c; }
  });
  $('#fg-opciones').addEventListener('click', e => { const b = e.target.closest('[data-ox]'); if (b) { gOps.splice(+b.dataset.ox, 1); pintaOps(); } });
  $('#fg-mas').onclick = () => { gOps.push({ id: uid(), nombre: '', precio: 0 }); pintaOps(); dg.querySelector(`[data-on="${gOps.length - 1}"]`).focus(); };
  $('#g-nuevo').onclick = () => abreGrupo(null);
  $('#g-lista').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) abreGrupo(b.dataset.g); });
  $('#fg-ok').onclick = () => {
    const e = t => { $('#fg-error').textContent = t; $('#fg-error').hidden = false; };
    const nombre = $('#fg-nombre').value.trim(); const min = +$('#fg-min').value || 0; const max = +$('#fg-max').value || 1;
    const ops = gOps.filter(o => o.nombre.trim()).map(o => ({ ...o, nombre: o.nombre.trim() }));
    if (!nombre) return e('Falta la pregunta.');
    if (!ops.length) return e('Añade al menos una opción.');
    if (max < Math.max(1, min)) return e('El máximo no puede ser menor que el mínimo.');
    if (min > ops.length) return e('El mínimo es mayor que el número de opciones.');
    const datos = { nombre, min, max: Math.min(max, ops.length), opciones: ops };
    if (gEdit) Object.assign(grupo(gEdit), datos); else carta.grupos.push({ id: uid(), ...datos });
    dg.close(); pintaTodo(); marca();
  };
  $('#fg-borrar').onclick = () => {
    const g = grupo(gEdit); const uso = carta.productos.filter(p => p.grupos.includes(gEdit));
    if (!confirm(`¿Eliminar "${g.nombre}"?${uso.length ? ` Se quitará de ${uso.length} producto(s).` : ''}`)) return;
    carta.grupos = carta.grupos.filter(x => x.id !== gEdit);
    carta.productos.forEach(p => { p.grupos = p.grupos.filter(x => x !== gEdit); });
    dg.close(); pintaTodo(); marca();
  };

  /* ══ Categorías ══ */
  function pintaCategorias() {
    $('#k-lista').innerHTML = carta.categorias.map((c, i) => `<div class="cat-fila ${c.oculta ? 'apagado' : ''}" data-k="${i}">
      <div class="orden"><button type="button" class="b b-mini" data-sube="${i}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" class="b b-mini" data-baja="${i}" ${i < carta.categorias.length - 1 ? '' : 'disabled'} aria-label="Bajar">↓</button></div>
      <input data-kn="${i}" value="${esc(c.nombre)}" maxlength="40" aria-label="Nombre de la categoría">
      <span class="cuenta">${c.productos.length} productos</span>
      <div class="dias" title="Días en que se puede pedir (ninguno marcado = todos)">${DIAS.map((d, j) => `<label><input type="checkbox" data-kd="${i}" value="${j + 1}" ${c.dias && c.dias.includes(j + 1) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>
      <label class="chk"><input type="checkbox" data-ko="${i}" ${c.oculta ? 'checked' : ''}> Oculta</label>
      <button type="button" class="b b-mini b-mal" data-kx="${i}">Eliminar</button></div>`).join('');
  }
  $('#k-lista').addEventListener('input', e => { const t = e.target; if (t.dataset.kn) { carta.categorias[t.dataset.kn].nombre = t.value; marca(); } });
  $('#k-lista').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.kn) { pintaTodo(); }
    if (t.dataset.kd) {
      const c = carta.categorias[t.dataset.kd];
      const dias = [...document.querySelectorAll(`[data-kd="${t.dataset.kd}"]:checked`)].map(x => +x.value);
      c.dias = dias.length && dias.length < 7 ? dias : null; marca();
    }
    if (t.dataset.ko) { carta.categorias[t.dataset.ko].oculta = t.checked || undefined; pintaCategorias(); marca(); }
  });
  $('#k-lista').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const cs = carta.categorias;
    if (b.dataset.sube) { const i = +b.dataset.sube; [cs[i - 1], cs[i]] = [cs[i], cs[i - 1]]; }
    else if (b.dataset.baja) { const i = +b.dataset.baja; [cs[i + 1], cs[i]] = [cs[i], cs[i + 1]]; }
    else if (b.dataset.kx) {
      const c = cs[+b.dataset.kx];
      if (c.productos.length) { alert(`"${c.nombre}" tiene ${c.productos.length} productos. Muévelos a otra categoría o elimínalos antes.`); return; }
      if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return; cs.splice(+b.dataset.kx, 1);
    } else return;
    pintaTodo(); marca();
  });
  $('#k-nueva').onclick = () => {
    const n = prompt('Nombre de la categoría nueva:', ''); if (!n || !n.trim()) return;
    carta.categorias.push({ clave: 'c-' + Date.now().toString(36), nombre: n.trim().slice(0, 40), dias: null, productos: [] });
    pintaTodo(); marca();
  };

  /* ── Publicar ── */
  $('#c-descartar').onclick = () => { if (confirm('¿Descartar todos los cambios de la carta?')) cargar(); };
  $('#c-publicar').onclick = async () => {
    const e = $('#c-error'); e.hidden = true;
    const sinCat = carta.productos.filter(p => !catDe(p.id));
    if (sinCat.length && !confirm(`${sinCat.length} producto(s) no tienen categoría y no saldrán en la carta. ¿Publicar igualmente?`)) return;
    const btn = $('#c-publicar'); btn.disabled = true; btn.textContent = 'Publicando…';
    try { await api.guardarCarta(LOCAL, carta); original = JSON.stringify(carta); marca(); btn.textContent = '✓ Publicada'; setTimeout(() => { btn.textContent = 'Publicar carta'; marca(); }, 1800); }
    catch (ex) { e.textContent = mensajeError(ex); e.hidden = false; btn.textContent = 'Publicar carta'; btn.disabled = false; }
  };

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.carta = { async init(local) { LOCAL = local; await cargar(); }, sucio };
})();
