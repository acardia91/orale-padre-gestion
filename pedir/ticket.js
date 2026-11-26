/* ÓRALE PADRE · impresión en térmica de 80 mm (TPV y comandas).
   OP.imprimir(html) pinta en #ticket y:
   · "Navegador": lanza la impresión del navegador (con Chrome --kiosk-printing sale directo).
   · "RawBT" (tablet Android con la app RawBT y la impresora por Bluetooth/USB/red):
     convierte el ticket a ESC/POS y se lo pasa a RawBT, sin diálogo.
   Se elige en cada tablet con el botón 🖨 (OP.ajustesImpresora). */
(function () {
  'use strict';
  const { euros } = window.OP;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = d => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const css = document.createElement('style');
  css.textContent = `
    #ticket{display:none}
    @media print{
      @page{size:80mm auto;margin:0}
      html,body{background:#fff!important;color:#000!important;padding:0!important;margin:0!important}
      body > *:not(#ticket){display:none!important}
      #ticket{display:block!important;width:72mm;margin:0 auto;padding:3mm 0 6mm;font:11pt/1.3 Arial,Helvetica,sans-serif;color:#000}
      #ticket .c{text-align:center}
      #ticket .g{font-size:15pt;font-weight:800}
      #ticket .num{font-size:38pt;font-weight:800;line-height:1}
      #ticket hr{border:0;border-top:1px dashed #000;margin:2mm 0}
      #ticket .l{display:flex;justify-content:space-between;gap:2mm}
      #ticket .op{padding-left:5mm;font-size:10pt}
      #ticket .nota{padding-left:5mm;font-weight:800}
      #ticket .tot{font-size:14pt;font-weight:800}
      #ticket .peq{font-size:8pt;word-break:break-all}
      #ticket .corte{break-after:page;page-break-after:always;height:0}
      #ticket .puesto{font-size:20pt;font-weight:800;text-align:center;border:2px solid #000;margin:0 0 2mm}
    }`;
  document.head.appendChild(css);
  function caja() {
    let el = document.getElementById('ticket');
    if (!el) { el = document.createElement('div'); el.id = 'ticket'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
    return el;
  }
  /* ── Qué impresora usa esta tablet ── */
  const PREF = 'op-impresora';
  const modo = () => { try { return localStorage.getItem(PREF) || 'navegador'; } catch (e) { return 'navegador'; } };
  const esAndroid = /Android/i.test(navigator.userAgent);
  function imprimir(html) {
    caja().innerHTML = html;
    if (modo() === 'rawbt') {
      if (esAndroid) return rawbt(caja());
      if (!imprimir.avisado) { imprimir.avisado = true; alert('RawBT sólo funciona en tablets Android. En este equipo se imprime con el navegador.'); }
    }
    window.print();
  }

  /* ── Ticket → ESC/POS para RawBT (80 mm: 48 caracteres por línea) ── */
  const COLS = 48;
  // Página de códigos PC858 (la de casi todas las térmicas ESC/POS): español y €.
  const CP = { 'á': 0xA0, 'é': 0x82, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ü': 0x81, 'Ü': 0x9A, '¿': 0xA8, '¡': 0xAD,
    '€': 0xD5, 'Á': 0xB5, 'É': 0x90, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9, 'º': 0xA7, 'ª': 0xA6, 'ç': 0x87, 'Ç': 0x80, '·': 0xFA, '×': 0x9E,
    'à': 0x85, 'è': 0x8A, 'ò': 0x95, '°': 0xF8 };
  const SUST = { '−': '-', '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '\u00a0': ' ', '✓': 'OK', '!!': '!!' };
  function bytesDe(txt) {
    const out = [];
    for (const ch of String(txt)) {
      const c = SUST[ch] ?? ch;
      for (const k of c) {
        const code = k.codePointAt(0);
        if (code === 10) out.push(10);
        else if (code >= 32 && code < 127) out.push(code);
        else if (CP[k] != null) out.push(CP[k]);
        else if (code > 0xFFFF || (code >= 0x2600 && code <= 0x27BF)) { /* emojis fuera */ }
        else out.push(63);
      }
    }
    return out;
  }
  const largo = t => [...String(t)].length;
  function partir(txt, ancho) {
    const lineas = []; let actual = '';
    String(txt).split(/\s+/).filter(Boolean).forEach(p => {
      while (largo(p) > ancho) { if (actual) { lineas.push(actual); actual = ''; } lineas.push(p.slice(0, ancho)); p = p.slice(ancho); }
      if (!actual) actual = p; else if (largo(actual) + 1 + largo(p) <= ancho) actual += ' ' + p; else { lineas.push(actual); actual = p; }
    });
    if (actual) lineas.push(actual);
    return lineas.length ? lineas : [''];
  }
  function texto(el) {
    const c = el.cloneNode(true); c.querySelectorAll('br').forEach(b => b.replaceWith('\n')); c.querySelectorAll('svg').forEach(x => x.remove());
    return c.textContent.split('\n').map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  }
  function escpos(raiz) {
    const B = [0x1B, 0x40, 0x1B, 0x74, 19];          // iniciar · página PC858
    const ESC = (...x) => B.push(...x);
    const estilo = (alinear, tam, negrita) => { ESC(0x1B, 0x61, alinear); ESC(0x1D, 0x21, tam); ESC(0x1B, 0x45, negrita ? 1 : 0); };
    const linea = t => { B.push(...bytesDe(t), 10); };
    for (const el of raiz.children) {
      const cl = el.classList;
      if (el.tagName === 'HR') { estilo(0, 0, false); linea('-'.repeat(COLS)); continue; }
      if (cl.contains('corte')) { estilo(0, 0, false); B.push(10, 10, 10, 10); ESC(0x1D, 0x56, 0x42, 0); continue; }   // cortar y seguir
      if (el.dataset && el.dataset.qr) {          // QR (valorar el ticket)
        estilo(1, 0, false); const d = bytesDe(el.dataset.qr); const n = d.length + 3;
        ESC(0x1D, 0x28, 0x6B, 4, 0, 0x31, 0x41, 0x32, 0); ESC(0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x43, 6); ESC(0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x45, 0x30);
        ESC(0x1D, 0x28, 0x6B, n & 255, n >> 8, 0x31, 0x50, 0x30, ...d); ESC(0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x51, 0x30); B.push(10);
        continue;
      }
      const grande = cl.contains('num') ? 0x33 : cl.contains('g') || cl.contains('puesto') ? 0x11 : cl.contains('tot') ? 0x01 : 0;
      const ancho = cl.contains('num') ? Math.floor(COLS / 4) : cl.contains('g') || cl.contains('puesto') ? COLS / 2 : COLS;
      if (cl.contains('puesto')) { estilo(1, grande, true); B.push(0x1D, 0x42, 1); linea(' ' + texto(el) + ' '); B.push(0x1D, 0x42, 0); continue; }   // en negativo
      const negrita = cl.contains('g') || cl.contains('tot') || cl.contains('num') || cl.contains('nota') || !!el.querySelector(':scope > b:only-child');
      if (cl.contains('l') && el.children.length >= 2) {   // izquierda ……… derecha
        estilo(0, grande, negrita);
        const izq = texto(el.children[0]), der = texto(el.children[el.children.length - 1]);
        const ls = partir(izq, Math.max(10, ancho - largo(der) - 1));
        ls.forEach((t, i) => linea(i === ls.length - 1 ? t + ' '.repeat(Math.max(1, ancho - largo(t) - largo(der))) + der : t));
        continue;
      }
      const t = texto(el); if (!t) continue;
      estilo(cl.contains('c') ? 1 : 0, grande, negrita);
      const sangria = cl.contains('op') || cl.contains('nota') ? '   ' : '';
      t.split('\n').forEach(par => partir(par, ancho - sangria.length).forEach(x => linea(sangria + x)));
    }
    estilo(0, 0, false); B.push(10, 10, 10, 10); ESC(0x1D, 0x56, 0x42, 0);   // avanzar y cortar
    return new Uint8Array(B);
  }
  function rawbt(raiz) {
    const b = escpos(raiz); let bin = ''; b.forEach(x => { bin += String.fromCharCode(x); });
    location.href = 'intent:base64,' + btoa(bin) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
  }

  /* ── Botón 🖨: elegir impresora en esta tablet y probarla ── */
  let opcionesImp = {};
  function ajustesImpresora(opciones = {}) {
    opcionesImp = opciones;
    let d = document.getElementById('dlg-impresora');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'dlg-impresora'; d.className = 'dlg';
      d.innerHTML = `<form method="dialog" style="display:flex;flex-direction:column;gap:12px;min-width:min(420px,86vw)">
        <h2 style="margin:0">Impresora de esta tablet</h2>
        <label style="display:flex;gap:10px;align-items:flex-start"><input type="radio" name="imp" value="navegador"> <span><b>Navegador</b><br><small>Sale el diálogo de imprimir (o directo si Chrome está en modo kiosco).</small></span></label>
        <label style="display:flex;gap:10px;align-items:flex-start"><input type="radio" name="imp" value="rawbt"> <span><b>RawBT (Android)</b><br><small>Directo a la térmica por Bluetooth, USB o red, sin diálogo. Instala la app <b>RawBT</b> desde Google Play, empareja la impresora en RawBT y elige "ESC/POS, 80 mm".</small></span></label>
        <div id="imp-comandas" hidden style="border-top:1px solid #e3d8cc;padding-top:10px;display:flex;flex-direction:column;gap:8px">
          <b>Comandas en papel (sin pantalla en cocina)</b>
          <label style="display:flex;gap:10px"><input type="radio" name="impc" value="no"> <span>No imprimir: hay pantalla de Comandas en cocina</span></label>
          <label style="display:flex;gap:10px"><input type="radio" name="impc" value="junta"> <span>Imprimir una comanda con todo al enviar</span></label>
          <label style="display:flex;gap:10px"><input type="radio" name="impc" value="separada"> <span>Imprimir separada: un ticket para <b>cocina</b> y otro para <b>barra</b></span></label>
          <small>Lo que va a cocina o a barra se decide en admin → Carta. Los pedidos de la web y del QR se imprimen con el botón "🖨 Por imprimir".</small>
        </div>
        <p id="imp-nota" style="margin:0;font-size:13px"></p>
        <div class="dlg-pie" style="display:flex;gap:8px;justify-content:flex-end"><button class="b" type="button" id="imp-prueba">Imprimir prueba</button><button class="b b-ok" value="ok">Listo</button></div>
      </form>`;
      document.body.appendChild(d);
      d.addEventListener('change', e => {
        if (e.target.name === 'imp') { try { localStorage.setItem(PREF, e.target.value); } catch (x) {} nota(); }
        if (e.target.name === 'impc') { try { localStorage.setItem('op-imprimir-comanda', e.target.value); } catch (x) {} if (typeof opcionesImp.alCambiar === 'function') opcionesImp.alCambiar(); }
      });
      d.querySelector('#imp-prueba').onclick = () => imprimir(`<div class="c g">ÓRALE PADRE</div><div class="c">Prueba de impresora</div><hr>
        <div class="l"><span><b>2×</b> Burrito de cochinita</span><span>19,80 €</span></div><div class="op">+ Guacamole</div><div class="nota">!! Sin cebolla</div>
        <hr><div class="l tot"><span>TOTAL</span><span>19,80 €</span></div><div class="c">Áéíóú ñ ¿¡ € · ${new Date().toLocaleString('es-ES')}</div>`);
    }
    const nota = () => { d.querySelector('#imp-nota').textContent = modo() === 'rawbt' && !esAndroid ? 'Ojo: esta pantalla no es Android; RawBT sólo funciona en tablets Android.' : ''; };
    d.querySelectorAll('[name=imp]').forEach(r => { r.checked = r.value === modo(); }); nota();
    d.querySelector('#imp-comandas').hidden = !opciones.comandas;
    d.querySelectorAll('[name=impc]').forEach(r => { r.checked = r.value === prefComanda(); });
    d.showModal();
  }

  const lineasHTML = (lineas, precios = true) => lineas.map(l => `
    <div class="l"><span><b>${l.cantidad}×</b> ${esc(l.nombre)}</span>${precios ? `<span>${euros(l.unitario * l.cantidad)}</span>` : ''}</div>
    ${precios && l.dto ? `<div class="op">${l.dto === 100 ? 'Invitado' : 'Dto. ' + l.dto + ' %'} (antes ${euros(l.unitario_original * l.cantidad)})</div>` : ''}
    ${(l.opciones || []).map(o => `<div class="op">+ ${esc(o.nombre)}</div>`).join('')}
    ${l.nota ? `<div class="nota">!! ${esc(l.nota)}</div>` : ''}`).join('');

  /** Comanda para cocina: sin precios, letra grande. */
  function comanda(p, local) {
    return `
      <div class="c"><b>ÓRALE PADRE · ${esc((local || '').replace(/^Órale Padre\s*/, '').toUpperCase())}</b></div>
      <div class="c g">${p.canal === 'sala' ? esc(p.mesa || 'SALA') : 'PARA RECOGER · WEB'}</div>
      <div class="c num">#${p.numero}</div>
      ${p.canal !== 'sala' ? `<div class="c"><b>${esc(p.cliente_nombre)}</b> · ${esc(p.cliente_tel || '')}</div>` : ''}
      <div class="c">${p.canal === 'sala' ? 'Marchada' : 'Recogida'}: <b>${fecha(p.canal === 'sala' ? p.creado : p.recogida).slice(-5)}</b></div>
      <hr>${lineasHTML(p.lineas, false)}
      ${p.notas ? `<hr><div class="nota">NOTA: ${esc(p.notas)}</div>` : ''}
      <hr><div class="c peq">Comanda interna · no es factura</div>`;
  }

  /** Comandas de un pedido separadas por puesto (cocina / barra), cada una con su corte.
      modo: 'junta' = una sola comanda; 'separada' = una por puesto (si sólo hay un puesto, una). */
  function comandasPorPuesto(p, local, carta, modo) {
    const grupos = { cocina: [], barra: [] };
    p.lineas.forEach(l => grupos[modo === 'separada' && window.OP.puestoDe ? window.OP.puestoDe(carta, l.producto) : 'cocina'].push(l));
    const usados = Object.entries(grupos).filter(([, ls]) => ls.length);
    if (modo !== 'separada' || usados.length < 2) return comanda(p, local);
    return usados.map(([k, ls]) => `<div class="puesto">${k === 'barra' ? 'BARRA' : 'COCINA'}</div>` + comanda({ ...p, lineas: ls }, local)
      + `<div class="c peq">${k === 'barra' ? 'Lo de cocina va en el otro ticket' : 'Lo de barra va en el otro ticket'}</div>`).join('<div class="corte"></div>');
  }

  /** Pre-cuenta: lo que se lleva a la mesa antes de cobrar. */
  function precuenta(nombre, lineas, total) {
    return `
      <div class="c g">ÓRALE PADRE</div>
      <div class="c">${esc(nombre)} · ${fecha(new Date())}</div>
      <hr>${lineasHTML(lineas)}
      <hr><div class="l tot"><span>TOTAL</span><span>${euros(total)}</span></div>
      <div class="c peq">IVA incluido · Pre-cuenta, no es factura</div>`;
  }

  /** Factura simplificada. */
  function factura(t) {
    const e = t.emisor || {};
    return `
      <div class="c g">ÓRALE PADRE</div>
      <div class="c">${esc(e.razon_social)} · NIF ${esc(e.cif)}</div>
      <div class="c peq">${esc(e.direccion)}</div>
      ${e.local ? `<div class="c peq">${esc(e.local)}${e.direccion_local ? ' · ' + esc(e.direccion_local) : ''}</div>` : ''}
      <hr>
      <div class="c"><b>FACTURA SIMPLIFICADA ${esc(t.serie)}-${String(t.numero).padStart(6, '0')}</b></div>
      <div class="c">${fecha(t.fecha)}</div>
      <hr>${lineasHTML(t.lineas)}
      ${t.descuento ? `<hr><div class="l"><span>Subtotal</span><span>${euros(t.bruto)}</span></div>
        <div class="l"><span>Dto. ${esc(t.promocion ? t.promocion.nombre : '')}${t.promocion && t.promocion.nota ? ' (' + esc(t.promocion.nota) + ')' : ''}</span><span>−${euros(t.descuento)}</span></div>` : ''}
      <hr><div class="l tot"><span>TOTAL</span><span>${euros(t.total)}</span></div>
      ${t.desglose_iva.map(d => `<div class="l"><span>Base ${d.tipo}%: ${euros(d.base)}</span><span>IVA ${euros(d.cuota)}</span></div>`).join('')}
      <hr>
      ${t.propina ? `<div class="l"><span>Propina (no incluida en la factura)</span><span>${euros(t.propina)}</span></div>` : ''}
      <div class="l"><span>${{ efectivo: 'Efectivo', tarjeta: 'Tarjeta', invitacion: 'Invitación', stripe: 'Tarjeta (online)' }[t.metodo] || t.metodo}</span><span>${euros(t.metodo === 'efectivo' ? t.entregado : t.total + (t.propina || 0))}</span></div>
      ${t.metodo === 'efectivo' ? `<div class="l"><span>Cambio</span><span>${euros(t.cambio)}</span></div>` : ''}
      <hr><div class="c">¡Gracias, padre! · oralepadre.com</div>
      ${valorar(t)}
      <div class="c peq">Huella: ${esc(t.hash.slice(0, 16))}</div>`;
  }

  // "¿Qué tal?" con QR que lleva a valorar ESTE ticket (si la librería de QR está cargada).
  function valorar(t) {
    const url = 'https://www.oralepadre.com/opinion/?t=' + t.id;
    if (window.qrcode && t.id) {
      try { const q = window.qrcode(0, 'L'); q.addData(url); q.make();
        return `<div class="c peq">¿Qué tal? Valóranos:</div><div class="c" data-qr="${esc(url)}">${q.createSvgTag({ cellSize: 3, margin: 0 })}</div>`; } catch (e) {}
    }
    return '<div class="c peq">¿Qué tal? Cuéntanoslo en<br><b>oralepadre.com/opinion</b></div>';
  }

  const prefComanda = () => { try { return localStorage.getItem('op-imprimir-comanda') || 'no'; } catch (e) { return 'no'; } };
  Object.assign(window.OP, { imprimir, ajustesImpresora, comandasPorPuesto, prefComanda, ticketComanda: comanda, ticketPrecuenta: precuenta, ticketFactura: factura, _escpos: escpos });
})();
