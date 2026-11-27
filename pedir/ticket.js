/* ÓRALE PADRE · impresión en térmica de 80 mm (TPV y comandas).
   OP.imprimir(html) pinta en #ticket y:
   · "Navegador": lanza la impresión del navegador (con Chrome --kiosk-printing sale directo).
   · "RawBT" (tablet Android con la app RawBT y la impresora por Bluetooth/USB/red):
     convierte el ticket a ESC/POS y se lo pasa a RawBT, sin diálogo.
   · "Epson por red" (TM-m30III y otras Epson con ePOS): el mismo ESC/POS va directo
     del navegador a la impresora (https://IP/cgi-bin/epos/service.cgi). Sirve en
     iPad, ordenador o cualquier tablet de la misma red. La primera vez hay que abrir
     https://IP y aceptar el aviso del certificado de la impresora.
   Se elige en cada tablet con el botón 🖨 (OP.ajustesImpresora). */
(function () {
  'use strict';
  const { euros } = window.OP;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = d => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const css = document.createElement('style');
  const cssTicket = () => `
    #ticket{display:none}
    #dlg-impresora input[type=radio],#dlg-impresora input[type=checkbox]{width:20px;height:20px;min-width:20px;padding:0;margin:1px 0 0;flex:none;accent-color:#7C2430}
    #dlg-impresora{max-height:92dvh;overflow:auto}
    #dlg-impresora label{font-weight:500;color:inherit}
    @media print{
      @page{size:${papel()}mm auto;margin:0}
      html,body{background:#fff!important;color:#000!important;padding:0!important;margin:0!important}
      body > *:not(#ticket){display:none!important}
      #ticket{display:block!important;width:${papel() === '58' ? 48 : 72}mm;margin:0 auto;padding:3mm 0 6mm;font:11pt/1.3 Arial,Helvetica,sans-serif;color:#000}
      #ticket .c{text-align:center}
      #ticket .g{font-size:15pt;font-weight:800}
      #ticket .num{font-size:38pt;font-weight:800;line-height:1}
      #ticket hr{border:0;border-top:1px dashed #000;margin:2mm 0}
      #ticket .l{display:flex;justify-content:space-between;gap:2mm}
      #ticket .op{padding-left:5mm;font-size:10pt}
      #ticket .nota{padding-left:5mm;font-weight:800}
      #ticket .tot{font-size:14pt;font-weight:800}
      #ticket .k{font-size:17pt;font-weight:800;line-height:1.25;margin-top:1mm}
      #ticket .k2{font-size:13pt}
      #ticket .esp{height:4mm}
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
  const lee = (k, def) => { try { return localStorage.getItem(k) || def; } catch (e) { return def; } };
  const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const modo = () => lee(PREF, 'navegador');
  const papel = () => lee('op-imp-papel', '80');            // 80 mm (48 letras) o 58 mm (32 letras)
  const conCajon = () => lee('op-imp-cajon', '0') === '1';  // cajón portamonedas enchufado a la impresora
  const sinTildes = () => lee('op-imp-sintildes', '0') === '1';
  const ipEpson = () => lee('op-imp-ip', '').trim();
  const pintaCSS = () => { css.textContent = cssTicket(); };
  pintaCSS();
  const esAndroid = /Android/i.test(navigator.userAgent);
  // opciones.cajon: abrir el cajón con este ticket (cobro en efectivo), si está activado en esta tablet.
  function imprimir(html, opciones = {}) {
    caja().innerHTML = html;
    if (modo() === 'epson') return enviaEpson(escpos(caja(), !!opciones.cajon && conCajon()));
    if (modo() === 'rawbt') {
      if (esAndroid) return rawbt(caja(), !!opciones.cajon && conCajon());
      if (!imprimir.avisado) { imprimir.avisado = true; alert('RawBT sólo funciona en tablets Android. En este equipo se imprime con el navegador.'); }
    }
    window.print();
  }

  /* ── Ticket → ESC/POS para RawBT (80 mm: 48 caracteres por línea · 58 mm: 32) ── */
  let COLS = 48;
  const PATADA = [0x1B, 0x70, 0x00, 0x19, 0xFA];   // abrir cajón (pin 2)
  function abrirCajon(silencioso) {
    if (modo() === 'epson' && conCajon()) return enviaEpson([0x1B, 0x40, ...PATADA], silencioso);
    if (!(modo() === 'rawbt' && esAndroid && conCajon())) {
      if (!silencioso) alert('El cajón se abre a través de la impresora: elige "Epson por red" o RawBT y activa "Tengo cajón".');
      return;
    }
    enviaRawbt([0x1B, 0x40, ...PATADA]);
  }
  // Página de códigos PC858 (la de casi todas las térmicas ESC/POS): español y €.
  const CP = { 'á': 0xA0, 'é': 0x82, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ü': 0x81, 'Ü': 0x9A, '¿': 0xA8, '¡': 0xAD,
    '€': 0xD5, 'Á': 0xB5, 'É': 0x90, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9, 'º': 0xA7, 'ª': 0xA6, 'ç': 0x87, 'Ç': 0x80, '·': 0xFA, '×': 0x9E,
    'à': 0x85, 'è': 0x8A, 'ò': 0x95, '°': 0xF8 };
  const SUST = { '−': '-', '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '\u00a0': ' ', '✓': 'OK', '!!': '!!' };
  // Si la impresora saca símbolos raros en las tildes o el €: se quitan (antes de medir las líneas).
  const limpia = txt => !sinTildes() ? txt : String(txt).replace(/€/g, 'EUR').replace(/×/g, 'x').replace(/[ñÑ]/g, m => m === 'ñ' ? '\u0001' : '\u0002').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0001/g, 'n').replace(/\u0002/g, 'N').replace(/[¿¡]/g, '').replace(/·/g, '-').replace(/[ºª°]/g, '.');
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
    return limpia(c.textContent).split('\n').map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  }
  function escpos(raiz, cajon) {
    COLS = papel() === '58' ? 32 : 48;
    const B = [0x1B, 0x40, 0x1B, 0x74, 19];          // iniciar · página PC858
    if (cajon) B.push(...PATADA);
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
      if (cl.contains('esp')) { estilo(0, 0, false); B.push(10); continue; }   // línea en blanco
      const grande = cl.contains('num') ? 0x33 : cl.contains('g') || cl.contains('puesto') || cl.contains('k') ? 0x11 : cl.contains('tot') || cl.contains('k2') ? 0x01 : 0;
      const ancho = cl.contains('num') ? Math.floor(COLS / 4) : cl.contains('g') || cl.contains('puesto') || cl.contains('k') ? COLS / 2 : COLS;
      if (cl.contains('puesto')) { estilo(1, grande, true); B.push(0x1D, 0x42, 1); linea(' ' + texto(el) + ' '); B.push(0x1D, 0x42, 0); continue; }   // en negativo
      const negrita = cl.contains('g') || cl.contains('k') || cl.contains('tot') || cl.contains('num') || cl.contains('nota') || !!el.querySelector(':scope > b:only-child');
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
  function rawbt(raiz, cajon) { enviaRawbt(escpos(raiz, cajon)); }
  /* ── Epson por red (ePOS-Print): el ESC/POS en hexadecimal dentro de <command>.
     Se envían de uno en uno (cola) para que dos tickets seguidos no se mezclen. ── */
  let colaEpson = Promise.resolve();
  function avisoImp(txt, malo) {
    let t = document.getElementById('imp-aviso');
    if (!t) { t = document.createElement('div'); t.id = 'imp-aviso'; t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;max-width:min(560px,92vw);padding:12px 16px;border-radius:12px;font:600 14px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25)';
      document.body.appendChild(t); }
    t.style.background = malo ? '#7C2430' : '#1f5130'; t.style.color = '#fff'; t.innerHTML = txt; t.hidden = false;
    clearTimeout(avisoImp.t); avisoImp.t = setTimeout(() => { t.hidden = true; }, malo ? 12000 : 2500);
  }
  function enviaEpson(b, silencioso) {
    const ip = ipEpson();
    if (!ip) { alert('Falta la IP de la impresora: pulsa 🖨 Impresora y escríbela (sale en su hoja de prueba).'); return Promise.resolve(false); }
    const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    const xml = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
      '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><command>' + hex + '</command></epos-print></s:Body></s:Envelope>';
    const url = `https://${ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;
    const EST = { EX_TIMEOUT: 'no contesta a tiempo', EPTR_COVER_OPEN: 'la tapa está abierta', EPTR_REC_EMPTY: 'no le queda papel', EX_ENPC_TIMEOUT: 'está ocupada',
      DeviceNotFound: 'no encuentra la impresora', EPTR_AUTOMATICAL: 'error de la impresora (revisa papel y cuchilla)', EPTR_UNRECOVERABLE: 'error grave: apágala y enciéndela' };
    const vez = colaEpson.then(async () => {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' }, body: xml });
        const txt = await r.text();
        const ok = /success="true"/.test(txt); const code = (txt.match(/code="([^"]*)"/) || [])[1] || '';
        if (!ok) avisoImp(`La impresora no ha impreso: ${esc(EST[code] || code || 'error desconocido')}.`, true);
        return ok;
      } catch (e) {
        avisoImp(`No llego a la impresora (${esc(ip)}). Comprueba que está encendida y en la misma red. Si Chrome pregunta por <b>dispositivos de la red local</b>, pulsa <b>Permitir</b>. Si es la primera vez en este equipo, abre <a href="https://${esc(ip)}/" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline">https://${esc(ip)}</a>, acepta el aviso de seguridad y vuelve a probar.`, true);
        return false;
      }
    });
    colaEpson = vez.catch(() => false);
    return vez;
  }
  function enviaRawbt(b) {
    let bin = ''; b.forEach(x => { bin += String.fromCharCode(x); });
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
        <label style="display:flex;gap:10px;align-items:flex-start"><input type="radio" name="imp" value="epson"> <span><b>Epson por red · recomendado</b><br><small>Directo a la Epson (TM-m30III) por cable de red o wifi, sin diálogo. iPad, ordenador o cualquier tablet.</small></span></label>
        <div id="imp-epson" style="display:flex;flex-direction:column;gap:6px;background:#f6f1eb;border-radius:10px;padding:10px 12px">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:14px"><b>IP de la impresora</b><input id="imp-ip" inputmode="decimal" placeholder="192.168.1.133" autocomplete="off" style="font:inherit;padding:8px 10px;border:1px solid #d9cbbd;border-radius:8px"></label>
          <small>Sale en su hoja de prueba (apágala y enciéndela con FEED pulsado). La <b>primera vez en cada equipo</b>: abre <a id="imp-ip-link" href="#" target="_blank" rel="noopener">la impresora</a>, pulsa "Avanzado → Acceder" (o "Visitar sitio") para aceptar su certificado, y vuelve aquí.</small>
        </div>
        <label style="display:flex;gap:10px;align-items:flex-start"><input type="radio" name="imp" value="rawbt"> <span><b>RawBT (Android)</b><br><small>Con la app RawBT: Bluetooth, USB o red, sin diálogo.</small></span></label>
        <details style="background:#f6f1eb;border-radius:10px;padding:8px 12px"><summary style="cursor:pointer;font-weight:700">Cómo dejarla funcionando (5 minutos)</summary>
          <ol style="margin:8px 0 4px;padding-left:20px;font-size:13.5px;line-height:1.45">
            <li>Enciende la impresora y conéctala: <b>Bluetooth</b> (emparéjala en Ajustes → Bluetooth de la tablet; el PIN suele ser 0000 o 1234), <b>USB</b> (cable a la tablet, con adaptador OTG) o <b>red</b> (cable a router/wifi; apunta su IP, sale al imprimir su hoja de prueba manteniendo FEED al encenderla).</li>
            <li>En la tablet instala <b>RawBT</b> desde Google Play y ábrela.</li>
            <li>En RawBT → Ajustes: <b>Conexión</b> = Bluetooth / USB / Red (IP y puerto 9100) y elige tu impresora. <b>Driver</b> = ESC/POS. <b>Papel</b> = el de tu impresora (80 o 58 mm).</li>
            <li>Aquí arriba marca <b>RawBT</b> y abajo el ancho de papel.</li>
            <li>Pulsa <b>Imprimir prueba</b>. La primera vez Android pregunta con qué abrirlo: elige RawBT y <b>"Siempre"</b>.</li>
            <li>Si las tildes o el € salen raros, activa "Quitar tildes". Si tienes cajón enchufado a la impresora, activa "Tengo cajón" y prueba.</li>
          </ol></details>
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center"><b style="font-size:14px">Papel:</b>
          <label style="display:flex;gap:6px"><input type="radio" name="imp-papel" value="80"> 80 mm</label>
          <label style="display:flex;gap:6px"><input type="radio" name="imp-papel" value="58"> 58 mm</label></div>
        <label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" id="imp-cajon"> <span><b>Tengo cajón portamonedas</b> enchufado a la impresora<br><small>Se abre solo al cobrar en efectivo (con Epson por red o RawBT).</small></span></label>
        <label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" id="imp-sintildes"> <span>Quitar tildes y € <small>(sólo si salen símbolos raros)</small></span></label>
        <div id="imp-comandas" hidden style="border-top:1px solid #e3d8cc;padding-top:10px;display:flex;flex-direction:column;gap:8px">
          <b>Comandas en papel (sin pantalla en cocina)</b>
          <label style="display:flex;gap:10px"><input type="radio" name="impc" value="no"> <span>No imprimir: hay pantalla de Comandas en cocina</span></label>
          <label style="display:flex;gap:10px"><input type="radio" name="impc" value="junta"> <span>Imprimir una comanda con todo al enviar</span></label>
          <label style="display:flex;gap:10px"><input type="radio" name="impc" value="separada"> <span>Imprimir separada: un ticket para <b>cocina</b> y otro para <b>barra</b></span></label>
          <small>Lo que va a cocina o a barra se decide en admin → Carta. Los pedidos de la web y del QR se imprimen con el botón "🖨 Por imprimir".</small>
        </div>
        <p id="imp-nota" style="margin:0;font-size:13px"></p>
        <div class="dlg-pie" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="b" type="button" id="imp-cajon-prueba">Probar cajón</button><button class="b" type="button" id="imp-prueba">Imprimir prueba</button><button class="b b-ok" value="ok">Listo</button></div>
      </form>`;
      document.body.appendChild(d);
      d.addEventListener('change', e => {
        if (e.target.name === 'imp') { try { localStorage.setItem(PREF, e.target.value); } catch (x) {} nota(); }
        if (e.target.id === 'imp-ip') { guarda('op-imp-ip', e.target.value.trim()); nota(); }
        if (e.target.name === 'imp-papel') { guarda('op-imp-papel', e.target.value); pintaCSS(); }
        if (e.target.id === 'imp-cajon') guarda('op-imp-cajon', e.target.checked ? '1' : '0');
        if (e.target.id === 'imp-sintildes') guarda('op-imp-sintildes', e.target.checked ? '1' : '0');
        if (e.target.name === 'impc') { try { localStorage.setItem('op-imprimir-comanda', e.target.value); } catch (x) {} if (typeof opcionesImp.alCambiar === 'function') opcionesImp.alCambiar(); }
      });
      d.querySelector('#imp-ip').addEventListener('input', e => { guarda('op-imp-ip', e.target.value.trim()); nota(); });
      d.querySelector('#imp-cajon-prueba').onclick = () => abrirCajon(false);
      d.querySelector('#imp-prueba').onclick = () => imprimir(`<div class="c g">ÓRALE PADRE</div><div class="c">Prueba de impresora</div><hr>
        <div class="l"><span><b>2×</b> Burrito de cochinita</span><span>19,80 €</span></div><div class="op">+ Guacamole</div><div class="nota">!! Sin cebolla</div>
        <hr><div class="l tot"><span>TOTAL</span><span>19,80 €</span></div><div class="c">Áéíóú ñ ¿¡ € · ${new Date().toLocaleString('es-ES')}</div>
        <div class="c peq">Papel ${papel()} mm · ${'1234567890'.repeat(5).slice(0, papel() === '58' ? 32 : 48)}</div>`);
    }
    const nota = () => {
      d.querySelector('#imp-nota').textContent = modo() === 'rawbt' && !esAndroid ? 'Ojo: esta pantalla no es Android; RawBT sólo funciona en tablets Android.' : '';
      d.querySelector('#imp-epson').hidden = modo() !== 'epson';
      d.querySelector('#imp-epson').style.display = modo() === 'epson' ? 'flex' : 'none';
      d.querySelector('#imp-ip-link').href = ipEpson() ? `https://${ipEpson()}/` : '#';
    };
    d.querySelector('#imp-ip').value = ipEpson();
    d.querySelectorAll('[name=imp]').forEach(r => { r.checked = r.value === modo(); }); nota();
    d.querySelectorAll('[name=imp-papel]').forEach(r => { r.checked = r.value === papel(); });
    d.querySelector('#imp-cajon').checked = conCajon(); d.querySelector('#imp-sintildes').checked = sinTildes();
    d.querySelector('#imp-comandas').hidden = !opciones.comandas;
    d.querySelectorAll('[name=impc]').forEach(r => { r.checked = r.value === prefComanda(); });
    d.showModal();
  }

  const lineasHTML = (lineas, precios = true) => lineas.map(l => `
    <div class="l"><span><b>${l.cantidad}×</b> ${esc(l.nombre)}</span>${precios ? `<span>${euros(l.unitario * l.cantidad)}</span>` : ''}</div>
    ${precios && l.dto ? `<div class="op">${l.dto === 100 ? 'Invitado' : 'Dto. ' + l.dto + ' %'} (antes ${euros(l.unitario_original * l.cantidad)})</div>` : ''}
    ${(l.opciones || []).map(o => `<div class="op">+ ${esc(o.nombre)}</div>`).join('')}
    ${l.nota ? `<div class="nota">!! ${esc(l.nota)}</div>` : ''}`).join('');

  // Platos de la comanda: letra doble, opciones y notas a doble alto y un hueco entre platos (más fácil de leer en cocina).
  const lineasCocina = lineas => lineas.map(l => `
    <div class="k">${l.cantidad}x ${esc(l.nombre)}</div>
    ${(l.opciones || []).map(o => `<div class="op k2">+ ${esc(o.nombre)}</div>`).join('')}
    ${l.nota ? `<div class="nota k2">!! ${esc(l.nota)}</div>` : ''}
    <div class="esp"></div>`).join('');

  /** Comanda para cocina: sin precios, letra grande. */
  function comanda(p, local) {
    return `
      <div class="c"><b>ÓRALE PADRE · ${esc((local || '').replace(/^Órale Padre\s*/, '').toUpperCase())}</b></div>
      <div class="c g">${p.canal === 'sala' ? esc(p.mesa || 'SALA') : 'PARA RECOGER · WEB'}</div>
      <div class="c num">#${p.numero}</div>
      ${p.canal !== 'sala' ? `<div class="c"><b>${esc(p.cliente_nombre)}</b> · ${esc(p.cliente_tel || '')}</div>` : ''}
      <div class="c">${p.canal === 'sala' ? 'Marchada' : 'Recogida'}: <b>${fecha(p.canal === 'sala' ? p.creado : p.recogida).slice(-5)}</b></div>
      <hr><div class="esp"></div>${lineasCocina(p.lineas)}
      ${p.notas ? `<hr><div class="nota k2">NOTA: ${esc(p.notas)}</div>` : ''}
      <hr><div class="c peq">Comanda interna · no es factura</div>`;
  }

  /** Comandas de un pedido separadas por puesto (cocina / barra), cada una con su corte.
      modo: 'junta' = una sola comanda; 'separada' = una por puesto (si sólo hay un puesto, una). */
  function comandasPorPuesto(p, local, carta, modo) {
    const grupos = { cocina: [], barra: [] };
    p.lineas.forEach(l => grupos[modo === 'separada' && window.OP.puestoDe ? window.OP.puestoDe(carta, l.producto) : 'cocina'].push(l));
    // Salsas y extras de lo que va a barra (p. ej. «Extra: Mayo chipotle» de un burrito) las prepara cocina:
    // salen también en el ticket de cocina, indicando para qué producto son.
    if (modo === 'separada') grupos.barra.forEach(l => {
      const ex = (l.opciones || []).filter(o => /^extra|salsa/i.test(o.nombre || '') && !/^sin /i.test(o.nombre || ''));
      if (ex.length) grupos.cocina.push({ cantidad: l.cantidad, nombre: 'Extras para ' + l.nombre + ' (barra)', opciones: ex, nota: '' });
    });
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
        return `<div class="c peq">Valóranos o pide tu factura con NIF:</div><div class="c" data-qr="${esc(url)}">${q.createSvgTag({ cellSize: 3, margin: 0 })}</div>`; } catch (e) {}
    }
    return '<div class="c peq">¿Qué tal? Cuéntanoslo en<br><b>oralepadre.com/opinion</b><br>¿Factura con NIF? Pídela en el local</div>';
  }

  // Comandas en papel al enviar a cocina: si este equipo tiene una térmica (Epson por red o RawBT) y nadie ha
  // elegido otra cosa, se imprime una comanda con todo. Con pantalla de Comandas en cocina, elegir "No imprimir".
  const prefComanda = () => { const def = modo() === 'epson' || modo() === 'rawbt' ? 'separada' : 'no';   // por defecto: un ticket para cocina y otro para barra
    try { return localStorage.getItem('op-imprimir-comanda') || def; } catch (e) { return def; } };
  Object.assign(window.OP, { imprimir, abrirCajon, ajustesImpresora, comandasPorPuesto, prefComanda, ticketComanda: comanda, ticketPrecuenta: precuenta, ticketFactura: factura, _escpos: escpos });
})();
