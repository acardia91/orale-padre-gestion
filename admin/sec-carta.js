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

  let LOCAL, carta, original = '', costes = {};
  // Coste de cada producto según escandallo: privado (tabla aparte), la carta es pública.
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^(burro|burrito)\s+/, '').replace(/\s+x\s*\d+$/, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const ALIAS = { 'don hampi': 'don hampi butter', 'nude lady cochinita': 'nude cochinita', 'nude black chancho': 'nude chancho',
                  'tacos don pastor': 'tacos pollo pastor', 'tacos baby cochinita': 'tacos cochinita' };
  const sucio = () => carta && JSON.stringify(carta) !== original;
  function marca() {
    const s = sucio(); $('#c-sucio').hidden = !s; $('#c-publicar').disabled = !s; $('#c-descartar').disabled = !s;
  }
  const prod = id => carta.productos.find(p => p.id === id);
  const grupo = id => carta.grupos.find(g => g.id === id);
  const catDe = id => carta.categorias.find(c => c.productos.includes(id));

  async function cargar() {
    [carta, costes] = await Promise.all([api.carta(LOCAL), api.costes(LOCAL).catch(() => ({}))]);
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
    $('#c-lista').innerHTML = `<thead><tr><th></th><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Coste</th><th>Extras</th><th>Etiquetas</th><th>Activo</th></tr></thead><tbody>` +
      (lista.map(p => {
        const c = catDe(p.id);
        const est = [p.solo === 'local' ? '<span class="tag gris">Sólo local</span>' : p.solo === 'recoger' ? '<span class="tag gris">Sólo recoger</span>' : '', p.agotado ? '<span class="tag rojo">Agotado</span>' : '', p.alcohol ? '<span class="tag">Alcohol</span>' : '', p.grupos.some(g => (grupo(g) || {}).min) ? '<span class="tag verde">Combo</span>' : ''].join('');
        return `<tr data-p="${esc(p.id)}" class="${p.oculto ? 'apagado' : ''}">
          <td class="mini">${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : '<span class="sinfoto"></span>'}</td>
          <td><b>${esc(p.nombre)}</b>${p.desc ? `<small>${esc(p.desc.slice(0, 80))}${p.desc.length > 80 ? '…' : ''}</small>` : ''}</td>
          <td>${c ? esc(c.nombre) : '<span class="tag rojo">Sin categoría</span>'}</td>
          <td class="num"><b>${euros(p.precio)}</b>${Number.isInteger(p.precio_local) ? `<small>Local ${euros(p.precio_local)}</small>` : ''}</td>
          <td class="num">${costes[p.id] ? `${euros(costes[p.id].coste)}<small class="${costes[p.id].coste * 110 / Math.max(1, p.precio) > 33 ? 'fc-mal' : 'fc-bien'}">${Math.round(costes[p.id].coste * 1100 / Math.max(1, p.precio)) / 10} %</small>` : '<span class="tag gris">—</span>'}</td>
          <td>${p.grupos.length ? p.grupos.map(g => esc((grupo(g) || {}).nombre || '?')).join('<br>') : '—'}</td>
          <td>${est || '—'}</td>
          <td><label class="switch" title="${p.oculto ? 'Oculto: no sale en la web ni en el TPV' : 'Visible en la web y en el TPV'}"><input type="checkbox" data-activo="${esc(p.id)}" ${p.oculto ? '' : 'checked'} aria-label="Activo"><span></span></label></td></tr>`;
      }).join('') || '<tr><td colspan="8" class="nota">Ningún producto coincide.</td></tr>') + '</tbody>';
  }
  $('#c-buscar').oninput = pintaProductos; $('#c-filtro-cat').onchange = pintaProductos;
  $('#c-lista').addEventListener('click', e => { if (e.target.closest('.switch')) return; const tr = e.target.closest('[data-p]'); if (tr) abreProducto(tr.dataset.p); });
  $('#c-lista').addEventListener('change', e => {
    const id = e.target.dataset.activo; if (!id) return;
    prod(id).oculto = !e.target.checked || undefined; pintaProductos(); marca();
  });
  $('#c-nuevo').onclick = () => abreProducto(null);

  /* ── Ficha de producto ── */
  const dp = $('#dlg-prod'); let editando = null, fotoTmp = null;
  function abreProducto(id) {
    const p = id ? prod(id) : { id: null, nombre: '', desc: '', alergenos: [], foto: null, precio: 0, agotado: false, alcohol: false, oculto: false, grupos: [] };
    editando = id; fotoTmp = p.foto;
    $('#fp-titulo').textContent = id ? 'Editar producto' : 'Nuevo producto';
    $('#fp-nombre').value = p.nombre; $('#fp-precio').value = id ? aEur(p.precio) : ''; $('#fp-precio-local').value = id && Number.isInteger(p.precio_local) ? aEur(p.precio_local) : ''; $('#fp-desc').value = p.desc || '';
    $('#fp-coste').value = id && costes[id] ? aEur(costes[id].coste) : '';
    $('#fp-coste-fuente').textContent = id && costes[id] ? (costes[id].fuente || '') : 'Si lo dejas vacío, no cuenta en el gasto en producto.';
    $('#fp-cat').innerHTML = carta.categorias.map(c => `<option value="${c.clave}">${esc(c.nombre)}</option>`).join('');
    const c = id ? catDe(id) : carta.categorias.find(x => x.clave === $('#c-filtro-cat').value) || carta.categorias[0];
    if (c) $('#fp-cat').value = c.clave;
    $('#fp-quitar').value = (p.quitar || []).join(', '); pintaSugQuitar();
    $('#fp-alerg').innerHTML = ALERGENOS.map(a => `<label><input type="checkbox" value="${a}" ${p.alergenos.includes(a) ? 'checked' : ''}> ${a}</label>`).join('');
    $('#fp-grupos').innerHTML = carta.grupos.length ? carta.grupos.map(g => `<label><input type="checkbox" value="${g.id}" ${p.grupos.includes(g.id) ? 'checked' : ''}> ${esc(g.nombre)} <small>(${g.min ? 'obligatorio' : 'opcional'}, ${g.opciones.length} opciones)</small></label>`).join('')
      : '<p class="nota">Aún no hay grupos de extras. Créalos en la pestaña "Extras y combos".</p>';
    $('#fp-alcohol').checked = !!p.alcohol; $('#fp-agotado').checked = !!p.agotado; $('#fp-oculto').checked = !!p.oculto; $('#fp-solo').value = p.solo || ''; $('#fp-puesto').value = p.puesto || '';
    $('#fp-borrar').hidden = !id; $('#fp-error').hidden = true;
    pintaFoto(); dp.showModal();
  }
  // "Se puede quitar": sugerencias de un toque (las de toda la carta + las típicas) para no escribir.
  const TIPICOS = ['Cebolla', 'Cilantro', 'Pico de gallo', 'Guacamole', 'Queso', 'Frijoles', 'Arroz', 'Lechuga', 'Jalapeño', 'Salsa', 'Mayo', 'Picante'];
  const partesQ = () => $('#fp-quitar').value.split(',').map(x => x.trim()).filter(Boolean);
  function pintaSugQuitar() {
    const usados = new Map(); carta.productos.forEach(x => (x.quitar || []).forEach(q => usados.set(q.toLowerCase(), q)));
    TIPICOS.forEach(q => { if (!usados.has(q.toLowerCase())) usados.set(q.toLowerCase(), q); });
    const ya = new Set(partesQ().map(x => x.toLowerCase()));
    $('#fp-quitar-sug').innerHTML = [...usados.values()].map(q => `<button type="button" class="${ya.has(q.toLowerCase()) ? 'on' : ''}" data-q="${esc(q)}">${ya.has(q.toLowerCase()) ? '✓ ' : '+ '}${esc(q)}</button>`).join('');
  }
  $('#fp-quitar-sug').onclick = e => { const b = e.target.closest('[data-q]'); if (!b) return; const t = partesQ(); const i = t.findIndex(x => x.toLowerCase() === b.dataset.q.toLowerCase());
    if (i >= 0) t.splice(i, 1); else t.push(b.dataset.q); $('#fp-quitar').value = t.join(', '); pintaSugQuitar(); };
  $('#fp-quitar').addEventListener('input', pintaSugQuitar);
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
    const pl = $('#fp-precio-local').value.trim() ? aCent($('#fp-precio-local').value) : undefined;
    if (pl === null || pl < 0) return err('El precio en el local no es válido. Escríbelo así: 10,50 (o déjalo vacío)');
    if (!carta.categorias.length) return err('Primero crea una categoría.');
    const datos = { nombre, precio, precio_local: pl === precio ? undefined : pl, desc: $('#fp-desc').value.trim(), foto: fotoTmp || null,
      alergenos: [...dp.querySelectorAll('#fp-alerg input:checked')].map(i => i.value),
      quitar: (() => { const q = [...new Set(partesQ().map(x => x.slice(0, 30)))].slice(0, 12); return q.length ? q : undefined; })(),
      grupos: [...dp.querySelectorAll('#fp-grupos input:checked')].map(i => i.value),
      alcohol: $('#fp-alcohol').checked, agotado: $('#fp-agotado').checked, oculto: $('#fp-oculto').checked, solo: $('#fp-solo').value || undefined, puesto: $('#fp-puesto').value || undefined };
    let id = editando;
    if (id) Object.assign(prod(id), datos);
    else { id = uid(); carta.productos.push({ id, ...datos }); }
    const destino = $('#fp-cat').value; const actual = catDe(id);
    if (!actual || actual.clave !== destino) {
      if (actual) actual.productos = actual.productos.filter(x => x !== id);
      carta.categorias.find(c => c.clave === destino).productos.push(id);
    }
    // El coste se guarda aparte y al momento (no es parte de la carta pública).
    const cTxt = $('#fp-coste').value.trim(); const coste = cTxt ? aCent(cTxt) : null;
    const antes = costes[id] ? costes[id].coste : null;
    if (cTxt && (coste == null || coste < 0)) return err('El coste no es válido. Escríbelo así: 2,45');
    if (coste !== antes) {
      api.guardarCostes(LOCAL, [{ producto: id, coste, fuente: 'manual' }])
        .then(() => { if (coste == null) delete costes[id]; else costes[id] = { producto: id, coste, fuente: 'manual' }; pintaProductos(); })
        .catch(ex => alert('No se ha podido guardar el coste: ' + mensajeError(ex)));
    }
    dp.close(); pintaTodo(); marca();
  };
  $('#c-escandallo').onclick = async () => {
    let lista; try { lista = await api.costesEscandallo(); } catch (ex) { alert(mensajeError(ex)); return; }
    const porNombre = new Map(lista.filter(x => x.coste > 0).map(x => [norm(x.nombre), x]));
    const nuevos = []; const sin = [];
    carta.productos.forEach(p => { const n = norm(p.nombre); const e = porNombre.get(ALIAS[n] || n);
      if (e) { if (!costes[p.id] || costes[p.id].coste !== e.coste) nuevos.push({ producto: p.id, coste: e.coste, fuente: 'escandallo: ' + e.nombre }); }
      else if (!costes[p.id]) sin.push(p.nombre); });
    if (!nuevos.length) { alert(`No hay costes nuevos que traer.${sin.length ? `\n\nSin escandallo (ponlos a mano en su ficha): ${sin.slice(0, 25).join(', ')}${sin.length > 25 ? '…' : ''}` : ''}`); return; }
    if (!confirm(`Se van a poner o actualizar ${nuevos.length} costes desde el escandallo.${sin.length ? `\n\n${sin.length} productos no tienen escandallo (bebidas, postres…): ponles el coste a mano en su ficha.` : ''}\n\n¿Seguir?`)) return;
    try { await api.guardarCostes(LOCAL, nuevos); nuevos.forEach(n => { costes[n.producto] = n; }); pintaProductos(); }
    catch (ex) { alert(mensajeError(ex)); }
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
      <select data-ks="${i}" aria-label="Dónde se vende" title="Dónde se vende esta categoría"><option value="">Todos los canales</option><option value="recoger" ${c.solo === 'recoger' ? 'selected' : ''}>Sólo recoger</option><option value="local" ${c.solo === 'local' ? 'selected' : ''}>Sólo en el local</option></select>
      <select data-kp="${i}" aria-label="Quién lo prepara" title="Quién prepara esta categoría (pantalla de Comandas)"><option value="">${/bebida/i.test(c.nombre + ' ' + c.clave) ? 'Barra (por defecto)' : 'Cocina (por defecto)'}</option><option value="cocina" ${c.puesto === 'cocina' ? 'selected' : ''}>Cocina</option><option value="barra" ${c.puesto === 'barra' ? 'selected' : ''}>Barra</option></select>
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
    if (t.dataset.ks) { carta.categorias[t.dataset.ks].solo = t.value || undefined; marca(); }
    if (t.dataset.kp) { carta.categorias[t.dataset.kp].puesto = t.value || undefined; marca(); }
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
  // Carta digital (QR de mesa): www.oralepadre.com/carta/?local=…
  const urlDigital = () => `https://www.oralepadre.com/carta/?local=${encodeURIComponent(LOCAL)}`;
  async function qrMesa() {
    if (!window.qrcode) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    const q = window.qrcode(0, 'M'); q.addData(urlDigital()); q.make();
    const w = window.open('', '_blank'); if (!w) { alert('Permite las ventanas emergentes para imprimir el QR.'); return; }
    const nom = esc(($('#a-locales') && $('#a-locales').selectedOptions[0] ? $('#a-locales').selectedOptions[0].textContent : '').replace(/^Órale Padre\s*/, ''));
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR carta · ${nom}</title>
      <style>body{font-family:Archivo,Arial,sans-serif;text-align:center;margin:0;padding:36px;color:#241a1c}h1{font-size:46px;margin:0 0 6px;color:#7C2430;letter-spacing:.02em}
      p{font-size:21px;margin:0 0 22px}.qr svg{width:300px;height:300px}small{display:block;margin-top:16px;font-size:15px;color:#6b5b5e}@page{size:A6;margin:8mm}</style></head><body>
      <h1>LA CARTA</h1><p>Escanea y mira la carta en tu móvil</p><div class="qr">${q.createSvgTag({ cellSize: 8, margin: 0, scalable: true })}</div>
      <small>oralepadre.com/carta · Órale Padre ${nom}</small><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }
  $('#c-qr').onclick = () => qrMesa().catch(() => alert('No se ha podido crear el QR. Revisa la conexión.'));
  window.ADMIN.carta = { async init(local) { LOCAL = local; $('#c-ver-digital').href = urlDigital(); await cargar(); }, sucio };
})();
