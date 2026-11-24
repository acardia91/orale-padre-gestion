/* ÓRALE PADRE · admin · sección Plano del local */
(function () {
  'use strict';
  const { api, DEMO, mensajeError, plano } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let LOCAL = 'tomares';

  let original = [], els = [], zona = null, sel = null, sucio = false;
  const PASO = 5;                                   // rejilla de encaje, en unidades del lienzo
  const encaja = v => Math.round(v / PASO) * PASO;
  const TAM = { cuadrada: [100, 100], redonda: [100, 100], rectangular: [200, 90], taburete: [60, 60],
                barra: [500, 70], pared: [400, 14], puerta: [90, 20], planta: [50, 50] };
  const DECO = new Set(['barra', 'pared', 'puerta', 'planta']);
  const NOMBRE_DECO = { barra: 'Barra', pared: 'Pared', puerta: 'Puerta', planta: 'Planta' };


  window.ADMIN = window.ADMIN || {};
  window.ADMIN.plano = { async init(local) { LOCAL = local; await cargar(); }, sucio: () => sucio };

  async function cargar() {
    original = (await api.mesas(LOCAL)).map(limpia);
    els = original.map(e => ({ ...e }));
    const zonas = zonasDe(els);
    if (!zonas.includes(zona)) zona = zonas[0] || 'Sala';
    sel = null; marcaSucio(false); pinta();
  }
  const limpia = e => ({ id: e.id, nombre: e.nombre, zona: e.zona, tipo: e.tipo || 'mesa', forma: e.forma || 'cuadrada',
    x: e.x ?? 20, y: e.y ?? 20, ancho: e.ancho || 90, alto: e.alto || 90, rotacion: e.rotacion || 0, plazas: e.plazas ?? null, orden: e.orden || 0 });
  const zonasDe = lista => [...new Set(lista.map(e => e.zona))];

  function marcaSucio(v) {
    sucio = v; $('#p-sucio').hidden = !v; $('#p-guardar').disabled = !v; $('#p-descartar').disabled = !v;
  }

  /* ── Pintar ── */
  function pinta() {
    const zonas = zonasDe(els); if (!zonas.includes(zona)) zonas.push(zona);
    $('#p-zonas').innerHTML = zonas.map(z => {
      const n = els.filter(e => e.zona === z && e.tipo === 'mesa').length;
      return `<button type="button" data-zona="${esc(z)}" class="${z === zona ? 'activa' : ''}">${esc(z)}<small>${n}</small></button>`;
    }).join('');
    plano.pintar($('#lienzo'), els.filter(e => e.zona === zona), { editor: true, sel });
    pintaProps();
    const mesas = els.filter(e => e.tipo === 'mesa');
    $('#p-resumen').innerHTML = `<b>${mesas.length}</b> mesas y taburetes · <b>${mesas.reduce((s, e) => s + (e.plazas || 0), 0)}</b> plazas en total<br>` +
      zonasDe(els).map(z => `${esc(z)}: ${els.filter(e => e.zona === z && e.tipo === 'mesa').length}`).join(' · ');
  }
  function pintaProps() {
    const e = els.find(x => x.id === sel);
    $('#props-vacio').hidden = !!e; $('#props-form').hidden = !e;
    if (!e) return;
    $('#pr-titulo').textContent = e.tipo === 'mesa' ? 'Mesa' : 'Decoración';
    if (document.activeElement !== $('#pr-nombre')) $('#pr-nombre').value = e.nombre;
    $('#pr-plazas-l').hidden = e.tipo !== 'mesa';
    if (document.activeElement !== $('#pr-plazas')) $('#pr-plazas').value = e.plazas ?? '';
    $('#pr-forma').value = e.forma;
    if (document.activeElement !== $('#pr-ancho')) $('#pr-ancho').value = e.ancho;
    if (document.activeElement !== $('#pr-alto')) $('#pr-alto').value = e.alto;
  }

  $('#p-zonas').addEventListener('click', ev => { const b = ev.target.closest('[data-zona]'); if (b) { zona = b.dataset.zona; sel = null; pinta(); } });
  $('#p-zona-nueva').onclick = () => {
    const n = prompt('Nombre de la zona nueva (p. ej. Barra, Sala, Terraza, Reservado):', '');
    if (!n || !n.trim()) return;
    zona = n.trim().slice(0, 30); sel = null; pinta();
  };
  $('#p-zona-renombrar').onclick = () => {
    const n = prompt(`Nuevo nombre para "${zona}":`, zona);
    if (!n || !n.trim() || n.trim() === zona) return;
    els.forEach(e => { if (e.zona === zona) e.zona = n.trim().slice(0, 30); });
    zona = n.trim().slice(0, 30); marcaSucio(true); pinta();
  };

  /* ── Añadir ── */
  function siguienteNombre(forma) {
    const base = forma === 'taburete' ? 'Taburete' : (zona === 'Sala' ? 'Mesa' : zona);
    const usados = els.filter(e => e.nombre.startsWith(base + ' ')).map(e => parseInt(e.nombre.slice(base.length + 1), 10)).filter(n => !isNaN(n));
    return base + ' ' + ((usados.length ? Math.max(...usados) : 0) + 1);
  }
  $('.herramientas').addEventListener('click', ev => {
    const b = ev.target.closest('[data-add]'); if (!b) return;
    const forma = b.dataset.add; const [ancho, alto] = TAM[forma]; const deco = DECO.has(forma);
    // Lo ponemos en el primer hueco libre empezando por arriba a la izquierda.
    let x = 40, y = 40;
    const choca = (x, y) => els.some(e => e.zona === zona && x < e.x + e.ancho && x + ancho > e.x && y < e.y + e.alto && y + alto > e.y);
    outer: for (y = 40; y + alto <= plano.H; y += 30) for (x = 40; x + ancho <= plano.W; x += 30) if (!choca(x, y)) break outer;
    const e = { id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre: deco ? NOMBRE_DECO[forma] : siguienteNombre(forma),
      zona, tipo: deco ? 'deco' : 'mesa', forma, x: Math.min(x, plano.W - ancho), y: Math.min(y, plano.H - alto), ancho, alto, rotacion: 0,
      plazas: deco ? null : (forma === 'taburete' ? 1 : forma === 'rectangular' ? 6 : 4), orden: els.length + 1 };
    els.push(e); sel = e.id; marcaSucio(true); pinta();
  });

  /* ── Arrastrar y redimensionar ── */
  const lienzo = $('#lienzo'); let arr = null;
  lienzo.addEventListener('pointerdown', ev => {
    const b = ev.target.closest('[data-el]');
    if (!b) { sel = null; pinta(); return; }
    const e = els.find(x => x.id === b.dataset.el); sel = e.id;
    const k = plano.escala(lienzo);
    arr = { e, modo: ev.target.closest('[data-asa]') ? 'tam' : 'mover', x0: ev.clientX, y0: ev.clientY, ex: e.x, ey: e.y, ea: e.ancho, eh: e.alto, k, movido: false };
    lienzo.setPointerCapture(ev.pointerId);
    pinta(); ev.preventDefault();
  });
  lienzo.addEventListener('pointermove', ev => {
    if (!arr) return;
    const dx = (ev.clientX - arr.x0) * arr.k.x, dy = (ev.clientY - arr.y0) * arr.k.y;
    if (!arr.movido && Math.abs(dx) + Math.abs(dy) < 3) return;
    arr.movido = true; const e = arr.e;
    if (arr.modo === 'mover') {
      e.x = Math.max(0, Math.min(plano.W - e.ancho, encaja(arr.ex + dx)));
      e.y = Math.max(0, Math.min(plano.H - e.alto, encaja(arr.ey + dy)));
    } else {
      e.ancho = Math.max(10, Math.min(plano.W - e.x, encaja(arr.ea + dx)));
      e.alto = Math.max(10, Math.min(plano.H - e.y, encaja(arr.eh + dy)));
      if (e.forma === 'redonda' || e.forma === 'taburete' || e.forma === 'planta') e.alto = e.ancho = Math.min(e.ancho, plano.H - e.y);
    }
    marcaSucio(true); pinta();
  });
  const suelta = () => { arr = null; };
  lienzo.addEventListener('pointerup', suelta); lienzo.addEventListener('pointercancel', suelta);

  document.addEventListener('keydown', ev => {
    if (!sel || ev.target.matches('input, select, textarea')) return;
    const e = els.find(x => x.id === sel); if (!e) return;
    const d = ev.shiftKey ? 25 : PASO;
    const mov = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[ev.key];
    if (mov) {
      e.x = Math.max(0, Math.min(plano.W - e.ancho, e.x + mov[0])); e.y = Math.max(0, Math.min(plano.H - e.alto, e.y + mov[1]));
      marcaSucio(true); pinta(); ev.preventDefault();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') { borrar(); ev.preventDefault(); }
    else if (ev.key === 'Escape') { sel = null; pinta(); }
  });

  /* ── Propiedades ── */
  const actual = () => els.find(x => x.id === sel);
  $('#pr-nombre').addEventListener('input', ev => { actual().nombre = ev.target.value.slice(0, 30); marcaSucio(true); pinta(); });
  $('#pr-plazas').addEventListener('input', ev => { actual().plazas = ev.target.value ? Math.max(1, Math.min(30, +ev.target.value)) : null; marcaSucio(true); pinta(); });
  $('#pr-forma').addEventListener('change', ev => {
    const e = actual(); const f = ev.target.value; const eraDeco = e.tipo === 'deco';
    e.forma = f; e.tipo = DECO.has(f) ? 'deco' : 'mesa';
    if (eraDeco !== (e.tipo === 'deco')) { [e.ancho, e.alto] = TAM[f]; e.nombre = e.tipo === 'deco' ? NOMBRE_DECO[f] : siguienteNombre(f); e.plazas = e.tipo === 'deco' ? null : 4; }
    marcaSucio(true); pinta();
  });
  const tam = (k, max) => ev => { const e = actual(); const v = Math.max(10, Math.min(max, +ev.target.value || 10)); e[k] = v; marcaSucio(true); pinta(); };
  $('#pr-ancho').addEventListener('change', tam('ancho', 1000));
  $('#pr-alto').addEventListener('change', tam('alto', 625));
  $('#pr-girar').onclick = () => {
    const e = actual(); const cx = e.x + e.ancho / 2, cy = e.y + e.alto / 2;
    [e.ancho, e.alto] = [e.alto, e.ancho];           // girar = intercambiar lados, alrededor del centro
    e.x = encaja(Math.max(0, Math.min(plano.W - e.ancho, cx - e.ancho / 2)));
    e.y = encaja(Math.max(0, Math.min(plano.H - e.alto, cy - e.alto / 2)));
    marcaSucio(true); pinta();
  };
  $('#pr-duplicar').onclick = () => {
    const e = actual();
    const c = { ...e, id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      nombre: e.tipo === 'mesa' ? siguienteNombre(e.forma) : e.nombre,
      x: Math.min(plano.W - e.ancho, e.x + 30), y: Math.min(plano.H - e.alto, e.y + 30), orden: els.length + 1 };
    els.push(c); sel = c.id; marcaSucio(true); pinta();
  };
  function borrar() {
    const e = actual(); if (!e) return;
    if (!confirm(`¿Quitar "${e.nombre}" del plano?`)) return;
    els = els.filter(x => x.id !== e.id); sel = null; marcaSucio(true); pinta();
  }
  $('#pr-borrar').onclick = borrar;

  /* ── Guardar ── */
  $('#p-descartar').onclick = () => { if (confirm('¿Descartar los cambios del plano?')) cargar(); };
  $('#p-guardar').onclick = async () => {
    const err = $('#p-error'); err.hidden = true;
    const vacios = els.filter(e => !e.nombre.trim());
    if (vacios.length) { err.textContent = 'Hay elementos sin nombre.'; err.hidden = false; return; }
    const nombres = els.filter(e => e.tipo === 'mesa').map(e => e.nombre.trim().toLowerCase());
    const rep = nombres.find((n, i) => nombres.indexOf(n) !== i);
    if (rep) { err.textContent = `Hay dos mesas que se llaman "${rep}". Cada mesa necesita un nombre distinto.`; err.hidden = false; return; }
    // Orden: zona, luego de arriba abajo y de izquierda a derecha (así salen ordenadas en listas).
    const zonas = zonasDe(els);
    const lista = els.slice().sort((a, b) => zonas.indexOf(a.zona) - zonas.indexOf(b.zona) || a.y - b.y || a.x - b.x)
      .map((e, i) => ({ ...e, nombre: e.nombre.trim(), orden: i + 1 }));
    const btn = $('#p-guardar'); btn.disabled = true; btn.textContent = 'Guardando…';
    try { await api.guardarPlano(LOCAL, lista); await cargar(); btn.textContent = '✓ Guardado'; setTimeout(() => { btn.textContent = 'Guardar plano'; }, 1500); }
    catch (ex) { err.textContent = mensajeError(ex); err.hidden = false; btn.textContent = 'Guardar plano'; btn.disabled = false; }
  };
})();
