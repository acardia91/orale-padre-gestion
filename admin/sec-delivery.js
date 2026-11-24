/* ÓRALE PADRE · admin · Delivery (Uber Eats y Glovo)
   Cifras diarias por local y plataforma que vuelca cada día el agente (o
   una persona), con su resumen escrito por local y general.
   Formato del volcado (lo que pega el agente en "Volcar datos"):
   {
     "filas": [{ "local": "san-luis", "fecha": "2026-11-24", "plataforma": "uber",
                 "pedidos": 31, "ventas_eur": 512.40, "comision_eur": 112.7, "anuncios_eur": 20,
                 "promociones_eur": 15.5, "neto_eur": 364.2, "cancelados": 1, "errores": 2,
                 "valoracion": 4.6, "valoracion_tipo": "estrellas", "resenas": 3,
                 "tiempo_prep": 14, "minutos_cerrado": 0, "detalle": { … } }],
     "resumenes": [{ "fecha": "2026-11-24", "local": "general", "texto": "…",
                     "alertas": [{ "nivel": "alta", "texto": "…" }] }]
   }
   Locales: san-luis · remedios · sevilla-este · tomares. Plataforma: uber · glovo. */
(function () {
  'use strict';
  const { api, euros, mensajeError } = window.OP;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  const LOCS = { 'san-luis': 'San Luis', remedios: 'Los Remedios', 'sevilla-este': 'Sevilla Este', tomares: 'Tomares' };
  const PLAT = { uber: ['Uber Eats', '#06C167'], glovo: ['Glovo', '#FFC244'] };
  let rango = '7', filtroLocal = '', filas = [], resumenes = [];
  const dia = f => new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const val = r => r.valoracion == null ? '—' : r.valoracion_tipo === 'porcentaje' ? Math.round(r.valoracion) + ' %' : String(r.valoracion).replace('.', ',') + ' ★';

  function calcRango(r) {
    const h = new Date(); h.setDate(h.getDate() - 1);          // el agente vuelca el día anterior
    const d = new Date(h);
    if (r === '7') d.setDate(d.getDate() - 6);
    if (r === '30') d.setDate(d.getDate() - 29);
    if (r === 'mes') { d.setTime(new Date().getTime()); d.setDate(1); h.setTime(new Date().getTime()); }
    return [iso(d), iso(h)];
  }
  async function cargar() {
    document.querySelectorAll('[data-drng]').forEach(b => b.classList.toggle('b-ok', b.dataset.drng === rango));
    document.querySelectorAll('[data-dloc]').forEach(b => b.classList.toggle('b-ok', b.dataset.dloc === filtroLocal));
    const [d, h] = calcRango(rango);
    try { [filas, resumenes] = await Promise.all([api.deliveryEntre(d, h), api.resumenesDelivery(d, h)]); }
    catch (ex) { $('#dl-kpis').innerHTML = `<p class="aviso">${esc(mensajeError(ex))}</p>`; return; }
    pinta(d, h);
  }
  function pinta(d, h) {
    const fs = filas.filter(r => !filtroLocal || r.local === filtroLocal);
    const s = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
    const ventas = s(fs, 'ventas'), pedidos = s(fs, 'pedidos'), neto = s(fs, 'neto'), comision = s(fs, 'comision'), anuncios = s(fs, 'anuncios'), promos = s(fs, 'promociones');
    const conVal = fs.filter(r => r.valoracion != null && r.valoracion_tipo !== 'porcentaje');
    const k = (cls, t, v, sub) => `<div class="pk ${cls}"><small>${t}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    $('#dl-kpis').innerHTML =
      k('pk-hero', 'Ventas delivery', euros(ventas), `${pedidos} pedidos · ticket medio ${pedidos ? euros(Math.round(ventas / pedidos)) : '—'}`) +
      k('', 'Lo que cobráis (neto)', neto ? euros(neto) : '—', ventas && neto ? `${Math.round(neto * 100 / ventas)} % de las ventas` : '') +
      k('', 'Comisión + anuncios + promos', euros(comision + anuncios + promos), ventas ? `${Math.round((comision + anuncios + promos) * 100 / ventas)} % de las ventas` : '') +
      k('', 'Cancelados / errores', `${s(fs, 'cancelados')} / ${s(fs, 'errores')}`, pedidos ? `${(((s(fs, 'cancelados') + s(fs, 'errores')) * 100) / pedidos).toFixed(1).replace('.', ',')} % de los pedidos` : '') +
      k('', 'Valoración media', conVal.length ? (conVal.reduce((a, r) => a + +r.valoracion, 0) / conVal.length).toFixed(2).replace('.', ',') + ' ★' : '—', 'Uber (estrellas)');

    // Por local y plataforma
    const grupos = {};
    fs.forEach(r => { const g = grupos[r.local + '|' + r.plataforma] = grupos[r.local + '|' + r.plataforma] || { local: r.local, plataforma: r.plataforma, pedidos: 0, ventas: 0, neto: 0, coste: 0, cancel: 0, err: 0, vals: [] };
      g.pedidos += r.pedidos; g.ventas += r.ventas; g.neto += r.neto || 0; g.coste += (r.comision || 0) + (r.anuncios || 0) + (r.promociones || 0);
      g.cancel += r.cancelados || 0; g.err += r.errores || 0; if (r.valoracion != null) g.vals.push(r); });
    const gs = Object.values(grupos).sort((a, b) => b.ventas - a.ventas); const maxV = Math.max(1, ...gs.map(g => g.ventas));
    $('#dl-locales').innerHTML = gs.length ? `<thead><tr><th>Local</th><th>Plataforma</th><th class="num">Pedidos</th><th class="num">Ventas</th><th class="num">Neto</th><th class="num">Comisión y gastos</th><th class="num">Cancel. / errores</th><th class="num">Valoración</th><th style="width:18%"></th></tr></thead><tbody>` +
      gs.map(g => `<tr><td><b>${LOCS[g.local] || esc(g.local)}</b></td><td><span class="plat" style="--c:${PLAT[g.plataforma][1]}">${PLAT[g.plataforma][0]}</span></td>
        <td class="num">${g.pedidos}</td><td class="num"><b>${euros(g.ventas)}</b></td><td class="num">${g.neto ? euros(g.neto) : '—'}</td>
        <td class="num">${g.coste ? euros(g.coste) + ` <small>(${Math.round(g.coste * 100 / Math.max(1, g.ventas))} %)</small>` : '—'}</td>
        <td class="num">${g.cancel} / ${g.err}</td><td class="num">${g.vals.length ? val(g.vals[g.vals.length - 1]) : '—'}</td>
        <td><div class="mini-barra"><i style="width:${g.ventas * 100 / maxV}%;background:${PLAT[g.plataforma][1]}"></i></div></td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Todavía no hay datos de delivery en este periodo. Los vuelca el agente cada día, o puedes hacerlo con "Volcar datos".</td></tr></tbody>';

    // Días
    $('#dl-dias').innerHTML = fs.length ? `<thead><tr><th>Día</th><th>Local</th><th>Plataforma</th><th class="num">Pedidos</th><th class="num">Ventas</th><th class="num">Neto</th><th class="num">Valoración</th><th class="num">Prep.</th><th class="num">Cerrado</th></tr></thead><tbody>` +
      fs.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || a.local.localeCompare(b.local)).map(r => `<tr><td>${dia(r.fecha)}</td><td>${LOCS[r.local] || esc(r.local)}</td>
        <td><span class="plat" style="--c:${PLAT[r.plataforma][1]}">${PLAT[r.plataforma][0]}</span></td><td class="num">${r.pedidos}</td><td class="num">${euros(r.ventas)}</td>
        <td class="num">${r.neto != null ? euros(r.neto) : '—'}</td><td class="num">${val(r)}</td><td class="num">${r.tiempo_prep != null ? r.tiempo_prep + ' min' : '—'}</td>
        <td class="num">${r.minutos_cerrado ? `<span class="tag rojo">${r.minutos_cerrado} min</span>` : '—'}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="nota">Sin días cargados.</td></tr></tbody>';

    // Resúmenes del agente
    const rs = resumenes.filter(r => !filtroLocal || r.local === filtroLocal || r.local === 'general');
    $('#dl-resumenes').innerHTML = rs.length ? rs.map(r => `<div class="ag"><b>${dia(r.fecha)} · ${r.local === 'general' ? 'General' : LOCS[r.local] || esc(r.local)}</b><p>${esc(r.texto)}</p>
      ${(r.alertas || []).map(a => `<span class="tag ${a.nivel === 'alta' ? 'rojo' : a.nivel === 'media' ? '' : 'gris'}">${esc(a.texto)}</span>`).join('')}</div>`).join('')
      : '<p class="nota">Aquí aparece cada día el resumen del agente: qué ha ido bien, qué ha ido mal y qué revisar, por local y en general.</p>';
  }
  document.querySelectorAll('[data-drng]').forEach(b => b.onclick = () => { rango = b.dataset.drng; cargar(); });
  document.querySelectorAll('[data-dloc]').forEach(b => b.onclick = () => { filtroLocal = b.dataset.dloc; pinta(); document.querySelectorAll('[data-dloc]').forEach(x => x.classList.toggle('b-ok', x.dataset.dloc === filtroLocal)); });

  // ── Volcar datos (el agente pega el JSON; una persona puede usar el mini formulario) ──
  const dv = $('#dlg-volcar');
  $('#dl-volcar').onclick = () => { $('#dv-json').value = ''; $('#dv-error').hidden = true; $('#dv-fecha').value = iso(new Date(Date.now() - 86400000)); dv.showModal(); };
  $('#dv-ok').onclick = async () => {
    const err = t => { $('#dv-error').textContent = t; $('#dv-error').hidden = false; };
    let datos;
    const txt = $('#dv-json').value.trim();
    if (txt) { try { datos = JSON.parse(txt); } catch (e) { return err('El texto no es un JSON válido.'); } }
    else {
      const n = id => $(id).value.trim() === '' ? null : +$(id).value.replace(',', '.');
      if (!$('#dv-fecha').value || n('#dv-pedidos') == null || n('#dv-ventas') == null) return err('Rellena al menos día, pedidos y ventas, o pega el JSON del agente.');
      datos = { filas: [{ local: $('#dv-local').value, fecha: $('#dv-fecha').value, plataforma: $('#dv-plat').value, pedidos: n('#dv-pedidos'), ventas_eur: n('#dv-ventas'),
        neto_eur: n('#dv-neto'), valoracion: n('#dv-val'), valoracion_tipo: $('#dv-plat').value === 'glovo' ? 'porcentaje' : 'estrellas' }],
        resumenes: $('#dv-texto').value.trim() ? [{ fecha: $('#dv-fecha').value, local: $('#dv-local').value, texto: $('#dv-texto').value.trim() }] : [] };
    }
    try {
      const r = await api.guardarDelivery(datos.filas || [], datos.resumenes || [], txt ? (datos.fuente || 'agente') : 'manual');
      dv.close(); await cargar();
      $('#dl-ok').textContent = `Guardado: ${r.filas} ${r.filas === 1 ? 'fila' : 'filas'} y ${r.resumenes} ${r.resumenes === 1 ? 'resumen' : 'resúmenes'}.`; $('#dl-ok').hidden = false;
      setTimeout(() => { $('#dl-ok').hidden = true; }, 5000);
    } catch (ex) { err(mensajeError(ex)); }
  };

  // Para el agente: OP.volcarDelivery({filas, resumenes}) desde la consola de esta página.
  window.OP.volcarDelivery = async datos => { const r = await api.guardarDelivery(datos.filas || [], datos.resumenes || [], datos.fuente || 'agente'); await cargar(); return r; };

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.delivery = { todos: true, async init() { await cargar(); }, mostrar: cargar };
})();
