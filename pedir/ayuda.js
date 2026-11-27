/* ÓRALE PADRE · botón "? Ayuda" en el TPV y en Comandas.
   Pone un botón en la barra de arriba (junto a Salir) que abre el protocolo de uso,
   abierto directamente en la parte de la pantalla donde estás. */
(function () {
  'use strict';
  const TPV = {
    faq: ['❓ Preguntas rápidas', `<details class="ay-faq"><summary>Me he equivocado al añadir algo (aún no enviado)</summary><p>Pulsa <b>−</b> en ese producto o «✂ Quitar». Mientras no lo envíes, cocina no lo ve.</p></details><details class="ay-faq"><summary>Ya lo envié a cocina y hay que quitarlo</summary><p>Toca ese producto en la cuenta → <b>Quitar</b>, elige el motivo y que el encargado ponga su PIN. Avisa también a cocina en persona.</p></details><details class="ay-faq"><summary>Quiero invitar o hacer descuento</summary><p>Toca el producto ya enviado → <b>Descuento / invitar</b>. Necesita PIN de encargado.</p></details><details class="ay-faq"><summary>Pagan por separado</summary><p><b>Cobrar</b> → <b>Dividir por productos</b> (cada uno lo suyo) o <b>Partes iguales</b> (entre X personas). Se cobra una parte y la cuenta sigue abierta con el resto.</p></details><details class="ay-faq"><summary>Me he equivocado de forma de pago</summary><p><b>No vuelvas a cobrar.</b> Avisa al encargado para que lo corrija y lo apunte en el cierre.</p></details><details class="ay-faq"><summary>Piden factura con su NIF</summary><p>El cliente escanea el <b>QR del ticket</b> y la pide él. Si no puede, el encargado la hace en Admin → Ventas y facturas → Nueva factura, con el nº de ticket.</p></details><details class="ay-faq"><summary>Se cambian de mesa</summary><p>En la cuenta: menú <b>⋯</b> → <b>Cambiar de mesa</b>.</p></details><details class="ay-faq"><summary>Juntan mesas o son un grupo en varios taburetes</summary><p>Menú <b>⋯</b> → <b>Unir mesas o taburetes</b>: es una sola cuenta. Si cada mesa ya tenía cuenta: <b>Juntar con otra mesa</b>.</p></details><details class="ay-faq"><summary>Un cliente tiene alergia</summary><p>Ponlo en la <b>nota</b> del producto o en «Nota para cocina» (sale en la comanda con !!) y <b>díselo a cocina en persona</b>.</p></details><details class="ay-faq"><summary>Se ha acabado un producto</summary><p>Botón <b>Agotados</b> arriba y márcalo. Desaparece de la web, del QR y del TPV. Desmárcalo cuando vuelva.</p></details><details class="ay-faq"><summary>No imprime el ticket</summary><p>Mira que la ticketera esté encendida, con papel y la tapa cerrada. Luego <b>Impresora</b> → <b>Imprimir prueba</b>. Si sigue sin imprimir, avisa al encargado.</p></details><details class="ay-faq"><summary>Sale la franja de «sin conexión»</summary><p>Revisa el wifi. Puedes seguir mirando, pero <b>no cobres</b> hasta que vuelva la conexión.</p></details><details class="ay-faq"><summary>He olvidado mi PIN</summary><p>El encargado te pone uno nuevo en Admin → Usuarios → Equipo del TPV → <b>🔑 PIN</b>.</p></details><details class="ay-faq"><summary>Llega un pedido de la web</summary><p>Suena y aparece en <b>Para recoger</b> y en Comandas. Cocina lo acepta; al venir el cliente, se entrega desde ahí.</p></details>`],
    turno: ['Empezar y terminar el turno', `
      <ol>
        <li>Abre la app <b>TPV</b>. Si sale <b>«¿Quién eres?»</b>, teclea <b>tu PIN</b> (4 a 8 números).</li>
        <li>Arriba sale tu nombre: todo lo que hagas queda a tu nombre.</li>
        <li>Si otra persona va a usar la tablet, <b>toca tu nombre</b> arriba y que ella meta su PIN.</li>
        <li>El PIN es personal: no lo digas en voz alta ni lo apuntes en la tablet.</li>
        <li>Al cerrar el local, el encargado hace el <b>cierre de caja</b> (mira «Caja»).</li>
      </ol>
      <p class="ay-nota">El PIN se teclea en la pantalla «¿Quién eres?», no donde pone email y contraseña.</p>`],
    sala: ['La sala (mesas)', `
      <ol>
        <li><b>Toca una mesa libre</b> para abrirle la cuenta. Las ocupadas se ven en color con lo que llevan.</li>
        <li>Clientes sin mesa: <b>Barra</b>, <b>Llevar</b> o <b>Terraza</b> (botones de arriba) crean una cuenta nueva.</li>
        <li><b>Reservas de hoy</b>: tócala cuando lleguen para sentarlos. «+ Reserva» para apuntar una por teléfono.</li>
        <li><b>Para recoger</b>: pedidos de la web de hoy. Tócalos para verlos o entregarlos.</li>
        <li>Si algo se acaba: <b>Agotados</b> y márcalo. Desaparece de la web y del QR.</li>
        <li>Si sale <b>«Por imprimir»</b> en naranja: hay comandas de la web o del QR sin imprimir. Tócalo.</li>
      </ol>`],
    cuenta: ['Tomar nota', `
      <ol>
        <li>Busca el producto arriba o elige la categoría, y <b>tócalo</b>. Si tiene opciones (salsa, punto…), elígelas.</li>
        <li>Ajusta con <b>−</b> y <b>+</b>. Toca el número para escribir la cantidad.</li>
        <li>Algo especial («sin cebolla», alergias): <b>Nota para cocina</b>.</li>
        <li>Pulsa <b>Enviar a cocina</b>. Sólo se envía lo nuevo; lo ya enviado no se repite.</li>
        <li>Los segundos platos: <b>⏸ En espera</b>. Cocina los ve pero no los hace hasta que pulses <b>▶ Marchar</b>.</li>
        <li>Otra ronda igual: <b>↻ Repetir ronda</b>, revisa y envía.</li>
        <li>Quitar, descontar o invitar algo ya enviado: <b>toca ese producto</b> en la cuenta. Pide <b>motivo</b> y <b>PIN de encargado</b>.</li>
        <li>Menú <b>⋯</b>: comensales, cambiar de mesa, pasar productos a otra cuenta, unir mesas, juntar cuentas, anular.</li>
        <li><b>‹ Sala</b> (arriba a la izquierda) para volver a las mesas. La cuenta queda guardada.</li>
      </ol>`],
    cobrar: ['Cobrar', `
      <ol>
        <li>Si el cliente quiere ver la cuenta antes: <b>Imprimir cuenta</b>.</li>
        <li>Pulsa <b>Cobrar</b> y elige: <b>Todo</b>, <b>Dividir por productos</b> o <b>Partes iguales</b>.</li>
        <li>Si hay promoción o propina, ponla ahí.</li>
        <li><b>💶 Efectivo</b>: escribe lo que te da el cliente y te dice el cambio.<br>
            <b>💳 Tarjeta</b>: cobra primero en el datáfono y, cuando salga aprobado, sigue aquí.</li>
        <li><b>Confirmar cobro</b>: sale el ticket y la mesa queda libre.</li>
      </ol>
      <p class="ay-nota">Si te equivocas de forma de pago, avisa al encargado: no cobres dos veces.</p>`],
    caja: ['Caja y cierre', `
      <ol>
        <li>Botón <b>Caja</b> arriba: ves el turno, los tickets de hoy (para reimprimir) y los movimientos.</li>
        <li>Si metes o sacas dinero del cajón (cambio, pagar a un proveedor): <b>+ Meter dinero</b> / <b>− Sacar dinero</b> con el motivo.</li>
        <li><b>Cierre</b> (lo hace el encargado): cuenta el efectivo del cajón, escribe lo <b>contado</b> y lo que <b>retiras</b>.</li>
        <li>Pulsa <b>Cerrar caja e imprimir Z</b>. Pide el PIN de encargado. Guarda el ticket Z.</li>
      </ol>`],
    problemas: ['Si algo falla', `
      <ul>
        <li><b>Franja roja «sin conexión»</b>: revisa el wifi. No cobres hasta que vuelva.</li>
        <li><b>No imprime</b>: botón <b>Impresora</b> → <b>Imprimir prueba</b>. Comprueba que la ticketera está encendida y con papel.</li>
        <li><b>Algo raro en pantalla</b>: cierra la app y vuelve a abrirla.</li>
        <li><b>Pone «DEMO»</b> arriba: es el modo de prueba. Tócalo para salir y entra con tu usuario.</li>
        <li>Si nada de esto funciona, llama al encargado.</li>
      </ul>`],
  };
  const COM = {
    faq: ['❓ Preguntas rápidas', `<details class="ay-faq"><summary>No suena cuando llega una comanda</summary><p>Pulsa <b>Activar sonido</b> arriba y sube el volumen de la tablet. Hay que hacerlo cada vez que se abre la app.</p></details><details class="ay-faq"><summary>Acepté o marqué Listo sin querer</summary><p>Pulsa <b>↩</b> en esa comanda para volver al paso anterior.</p></details><details class="ay-faq"><summary>Marqué Servido sin querer</summary><p>Pulsa <b>Deshacer</b> abajo (10 segundos). Si ya pasó, abajo en los hechos pulsa <b>↩ Volver</b>.</p></details><details class="ay-faq"><summary>Hay muchísimo lío</summary><p>Sube la <b>Espera web</b> con + o pulsa <b>Online ON</b> para pausar los pedidos web. Acuérdate de volver a activarlo.</p></details><details class="ay-faq"><summary>Se ha acabado un producto</summary><p>Botón <b>Agotados</b> y márcalo: desaparece de la web y del TPV.</p></details><details class="ay-faq"><summary>Una comanda pone «Esperando a sala»</summary><p>Son segundos en espera. No se empiezan hasta que sala pulse «Marchar».</p></details><details class="ay-faq"><summary>Hay que anular un pedido web</summary><p>Botón <b>Cancelar</b> en la comanda y elige el motivo. Avisa al encargado si estaba pagado.</p></details><details class="ay-faq"><summary>Necesito el papel de la comanda</summary><p>Botón <b>Ticket cocina</b> en la comanda, o marca «Imprimir al aceptar» para que salga siempre.</p></details><details class="ay-faq"><summary>Las notas con !!</summary><p>Son alergias o cambios del cliente. <b>Léelas siempre</b> antes de preparar.</p></details>`],
    pasos: ['Paso a paso', `
      <ol>
        <li>Al empezar: pulsa <b>Activar sonido</b> (si no, no suena cuando llega un pedido).</li>
        <li>Llega una comanda a <b>Nuevos</b> y suena. Pulsa <b>Aceptar y preparar</b>.</li>
        <li>Mientras cocinas, <b>toca cada plato</b> cuando esté hecho: se tacha.</li>
        <li>Cuando está todo, el botón <b>¡Listo!</b> parpadea: púlsalo. Pasa a <b>Listos</b>.</li>
        <li>Cuando sale del pase: <b>Servido</b> (sala) o <b>Entregar</b> (web). Si es de la web sin pagar, te pide cobrar.</li>
        <li>¿Te equivocaste? Sale <b>Deshacer</b> 10 segundos. También <b>↩</b> para volver un paso atrás.</li>
      </ol>`],
    tiempos: ['Colores y tiempos', `
      <ul>
        <li>Cada comanda dice cuántos minutos lleva.</li>
        <li><b>Ámbar</b>: va justa. <b>Rojo</b>: va tarde, prioridad.</li>
        <li><b>Esperando a sala</b>: son segundos en espera. No se hacen hasta que sala pulse «Marchar».</li>
        <li>Las notas <b>!!</b> son alergias o cambios: léelas siempre.</li>
      </ul>`],
    ajustes: ['Botones de arriba', `
      <ul>
        <li><b>Todo / Sólo cocina / Sólo barra</b>: qué ve esta pantalla.</li>
        <li><b>Espera web − / +</b>: minutos que ve el cliente de la web. Súbelo cuando haya mucho lío.</li>
        <li><b>Online ON</b>: tócalo para <b>pausar</b> los pedidos web si cocina no puede más. Acuérdate de volver a activarlo.</li>
        <li><b>Agotados</b>: marca lo que se acaba (desaparece de la web y del TPV).</li>
        <li><b>Imprimir al aceptar</b>: si está marcado, sale el ticket de cocina al aceptar. Si no, botón <b>Ticket cocina</b>.</li>
        <li><b>Impresora</b>: configurar o probar la ticketera.</li>
      </ul>`],
    problemas: ['Si algo falla', `
      <ul>
        <li><b>No suena</b>: pulsa <b>Activar sonido</b> y sube el volumen de la tablet.</li>
        <li><b>No llegan comandas</b>: revisa el wifi y cierra y abre la app.</li>
        <li><b>No imprime</b>: <b>Impresora</b> → <b>Imprimir prueba</b>. Ticketera encendida y con papel.</li>
        <li>Si nada funciona, avisa al encargado.</li>
      </ul>`],
  };

  const enTPV = !!document.getElementById('vista-sala');
  const GUIA = enTPV ? TPV : COM;
  const visible = id => { const e = document.getElementById(id); return e && !e.hidden && e.offsetParent !== null; };
  const actual = () => {
    if (!enTPV) return 'pasos';
    if (visible('bloqueo')) return 'turno';
    if (document.getElementById('dlg-cobrar') && document.getElementById('dlg-cobrar').open) return 'cobrar';
    if (document.getElementById('dlg-caja') && document.getElementById('dlg-caja').open) return 'caja';
    return visible('vista-cuenta') ? 'cuenta' : 'sala';
  };

  const css = document.createElement('style');
  css.textContent = `
    .b-ayuda{font-weight:800}
    .ay-flota{position:fixed;right:14px;bottom:14px;z-index:60;width:46px;height:46px;border-radius:50%;border:0;background:#7C2430;color:#fff;font:800 22px/1 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3)}
    #dlg-ayuda{width:min(720px,94vw);max-height:90dvh;padding:0;border:0;border-radius:16px;overflow:hidden;color:#1d1a17;background:#fffaf4}
    #dlg-ayuda::backdrop{background:rgba(20,10,5,.55)}
    #dlg-ayuda .ay-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;background:#7C2430;color:#fff}
    #dlg-ayuda .ay-cab h2{margin:0;font-size:19px}
    #dlg-ayuda .ay-x{border:0;background:rgba(255,255,255,.18);color:#fff;font-size:20px;width:40px;height:40px;border-radius:10px}
    #dlg-ayuda .ay-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #eadfd3;background:#fff}
    #dlg-ayuda .ay-tabs button{border:1px solid #d9cbbd;background:#fff;border-radius:999px;padding:8px 13px;font:600 14px system-ui,sans-serif;color:#1d1a17}
    #dlg-ayuda .ay-tabs button.on{background:#7C2430;border-color:#7C2430;color:#fff}
    #dlg-ayuda .ay-cuerpo{padding:6px 22px 22px;overflow:auto;max-height:calc(90dvh - 130px);font:16px/1.5 system-ui,sans-serif}
    #dlg-ayuda .ay-cuerpo h3{margin:14px 0 6px;font-size:18px}
    #dlg-ayuda .ay-cuerpo li{margin:0 0 9px}
    #dlg-ayuda .ay-faq{border:1px solid #eadfd3;border-radius:12px;background:#fff;margin:0 0 8px}
    #dlg-ayuda .ay-faq summary{padding:13px 14px;font-weight:700;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:10px}
    #dlg-ayuda .ay-faq summary::after{content:'+';color:#7C2430;font-size:20px;line-height:1}
    #dlg-ayuda .ay-faq[open] summary::after{content:'−'}
    #dlg-ayuda .ay-faq p{margin:0;padding:0 14px 13px}
    #dlg-ayuda .ay-paso{display:block;width:100%;margin:12px 0 4px;padding:14px;border:0;border-radius:12px;background:#7C2430;color:#fff;font:800 16px system-ui,sans-serif}
    #dlg-ayuda .ay-nota{background:#fff1d6;border-radius:10px;padding:10px 12px;font-size:14.5px;margin:10px 0 0}`;
  document.head.appendChild(css);

  const dlg = document.createElement('dialog'); dlg.id = 'dlg-ayuda';
  dlg.innerHTML = `<div class="ay-cab"><h2>Cómo se usa ${enTPV ? 'el TPV' : 'Comandas'}</h2><button type="button" class="ay-x" aria-label="Cerrar">✕</button></div>
    <nav class="ay-tabs">${Object.entries(GUIA).map(([k, [t]]) => `<button type="button" data-ay="${k}">${t}</button>`).join('')}</nav>
    <div class="ay-cuerpo"></div>`;
  document.body.appendChild(dlg);
  const conTour = () => !enTPV || ['sala', 'cuenta'].includes(actual());
  const ver = k => {
    dlg.querySelectorAll('[data-ay]').forEach(b => b.classList.toggle('on', b.dataset.ay === k));
    dlg.querySelector('.ay-cuerpo').innerHTML = (k === 'faq' && conTour() ? '<button type="button" class="ay-paso">▶ Explícame esta pantalla paso a paso</button>' : '') + `<h3>${GUIA[k][0]}</h3>` + GUIA[k][1]; dlg.querySelector('.ay-cuerpo').scrollTop = 0;
  };
  dlg.addEventListener('click', e => {
    const b = e.target.closest('[data-ay]'); if (b) ver(b.dataset.ay);
    if (e.target.closest('.ay-x') || e.target === dlg) dlg.close();
    if (e.target.closest('.ay-paso')) { dlg.close(); empiezaTour(enTPV ? actual() : 'comandas'); }
  });
  function abrir() {
    const k = actual();
    // Si hay otra ventana abierta (cobrar, caja), la ayuda se pone encima.
    ver(k); if (!dlg.open) dlg.showModal();
  }

  /* ── Recorrido guiado: oscurece la pantalla, enmarca cada botón y lo explica con una flecha ── */
  const PASOS = {
    sala: [
      ['#t-quien', 'Quién está en el TPV', 'Aquí sale tu nombre. Todo lo que hagas queda a tu nombre. Si otra persona va a usar la tablet, <b>tócalo</b> y que meta su PIN.'],
      ['#mesas', 'Las mesas', '<b>Toca una mesa libre</b> para abrirle la cuenta. Las ocupadas salen en color con el total y los minutos.'],
      ['#zonas', 'Zonas', 'Cambia entre Sala, Terraza y Barra para ver sus mesas.'],
      ['#b-barra', 'Clientes sin mesa', '<b>Terraza</b>, <b>Barra</b> y <b>Llevar</b> crean una cuenta nueva sin mesa (pide y paga en barra, o para llevar).'],
      ['#rv-sec', 'Reservas de hoy', 'Cuando llegue una reserva, <b>tócala</b> para sentarla. «+ Reserva» para apuntar una por teléfono.'],
      ['#recoger-sec', 'Para recoger', 'Pedidos de la web de hoy. Tócalos para verlos o entregarlos.'],
      ['#b-agotados', 'Agotados', 'Si se acaba algo, márcalo aquí: desaparece de la web, del QR y del TPV.'],
      ['#b-porimprimir', 'Por imprimir', 'Hay comandas de la web o del QR sin imprimir. Tócalo para sacarlas.'],
      ['#b-caja', 'Caja', 'Tickets de hoy (reimprimir), meter o sacar dinero del cajón y el <b>cierre de caja</b> del encargado.'],
      ['#b-impresora', 'Impresora', 'Configurar la ticketera o hacer una <b>impresión de prueba</b> si no imprime.'],
      ['#b-ir-comandas', 'Comandas', 'Abre la pantalla de cocina, para ver cómo van los pedidos.'],
      ['#b-salir', 'Salir', 'Cierra la sesión de esta tablet. Normalmente no hace falta: para cambiar de persona toca tu nombre.'],
    ],
    cuenta: [
      ['#c-nombre', 'La cuenta', 'Mesa o cliente, minutos abierta y personas.'],
      ['#buscar', 'Buscar', 'Escribe parte del nombre para encontrar un producto rápido.'],
      ['#cats', 'Categorías', 'O elige la categoría de la carta.'],
      ['#prods', 'Productos', '<b>Toca un producto</b> para añadirlo. Si tiene opciones (salsa, punto…), te las pide.'],
      ['#c-lineas', 'Lo que lleva la mesa', 'Lo nuevo se ajusta con <b>− / +</b>. Lo ya enviado: <b>tócalo</b> para quitarlo, descontarlo o invitar (pide motivo y PIN de encargado).'],
      ['#c-nota', 'Nota para cocina', 'Alergias o cambios («sin cebolla»). Sale en la comanda.'],
      ['#c-espera', 'En espera', 'Para los segundos: cocina los ve pero no los hace hasta que pulses <b>▶ Marchar</b>.'],
      ['#c-enviar', 'Enviar a cocina', 'Manda lo nuevo a cocina y barra. Lo ya enviado no se repite.'],
      ['#c-menu', 'Más opciones', 'Comensales, cambiar de mesa, pasar productos a otra cuenta, unir mesas, juntar cuentas o anular.'],
      ['#c-precuenta', 'Imprimir cuenta', 'Para que el cliente vea lo que debe antes de pagar.'],
      ['#c-cobrar', 'Cobrar', 'Todo, por productos o a partes iguales. <b>Efectivo</b> (te dice el cambio) o <b>tarjeta</b> (cobra antes en el datáfono). Al confirmar, la mesa queda libre.'],
      ['#b-atras', 'Volver a la sala', 'La cuenta se queda guardada; puedes volver cuando quieras.'],
    ],
    comandas: [
      ['#p-sonido', 'Sonido', 'Al empezar el turno, <b>actívalo</b>. Si no, no suena cuando llega una comanda.'],
      ['[data-col="nuevo"]', '1 · Nuevos', 'Aquí llegan las comandas (suena). Pulsa <b>Aceptar y preparar</b>.'],
      ['#col-preparando', '2 · Preparando', 'Mientras cocinas, <b>toca cada plato</b> cuando esté hecho y se tacha. Con todo hecho, pulsa <b>¡Listo!</b> (parpadea).'],
      ['[data-col="listo"]', '3 · Listos', 'Cuando sale del pase: <b>Servido</b> (sala) o <b>Entregar</b> (web). Si te equivocas, sale <b>Deshacer</b> 10 segundos.'],
      ['#p-puesto', 'Qué ve esta pantalla', 'Todo, sólo cocina o sólo barra.'],
      ['#p-prep', 'Espera web', 'Minutos que ve el cliente de la web. Súbelos con <b>+</b> si hay mucho lío.'],
      ['#p-online', 'Pedidos web', 'Tócalo para <b>pausar</b> la web si cocina no puede más. Acuérdate de volver a activarlo.'],
      ['#p-agotados', 'Agotados', 'Marca lo que se acaba: desaparece de la web y del TPV.'],
      ['#p-autoprint', 'Imprimir al aceptar', 'Marcado: sale el ticket de cocina al aceptar cada comanda.'],
      ['#p-impresora', 'Impresora', 'Configurar la ticketera o hacer una impresión de prueba.'],
    ],
  };
  const css2 = document.createElement('style');
  css2.textContent = `
    .b.b-ayuda{background:#7C2430!important;color:#fff!important;border-color:#7C2430!important;min-width:76px}
    .b.b-ayuda svg{width:34px!important;height:34px!important;stroke:#fff!important;fill:none}
    .b.b-ayuda span{color:#fff!important;font-weight:800}
    .tour-velo{position:fixed;inset:0;z-index:9990}
    .tour-marco{position:fixed;z-index:9991;border:4px solid #E8B04B;border-radius:14px;box-shadow:0 0 0 9999px rgba(15,8,4,.66);pointer-events:none;transition:all .25s ease}
    .tour-caja{position:fixed;z-index:9992;width:min(380px,calc(100vw - 24px));background:#fffaf4;color:#1d1a17;border-radius:16px;padding:16px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.4);font:16px/1.45 system-ui,sans-serif;transition:top .25s,left .25s}
    .tour-caja small{color:#7C2430;font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.5px}
    .tour-caja h4{margin:2px 0 6px;font-size:19px}
    .tour-caja p{margin:0 0 12px}
    .tour-caja .tour-bts{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap}
    .tour-caja button{border:1px solid #d9cbbd;background:#fff;border-radius:10px;padding:10px 14px;font:700 15px system-ui,sans-serif;color:#1d1a17}
    .tour-caja button.sig{background:#7C2430;border-color:#7C2430;color:#fff}
    .tour-caja .tour-x{border:0;background:none;color:#7a6a5c;padding:10px 4px;font-weight:600;text-decoration:underline}
    .tour-flecha{position:absolute;width:0;height:0;border:12px solid transparent}
    .tour-caja.abajo .tour-flecha{top:-24px;border-bottom-color:#fffaf4}
    .tour-caja.arriba .tour-flecha{bottom:-24px;border-top-color:#fffaf4}`;
  document.head.appendChild(css2);
  const visto = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden' && el.closest('[hidden]') === null; };
  let tour = null;
  function cierraTour() { if (!tour) return; tour.nodos.forEach(n => n.remove()); removeEventListener('resize', tour.pon); tour = null; }
  function empiezaTour(clave) {
    cierraTour();
    const pasos = PASOS[clave].map(([sel, t, txt]) => {
      const el = sel === '#p-prep' ? document.getElementById('p-prep')?.closest('div,span.prep,label') || document.getElementById('p-prep') : sel === '#p-autoprint' ? document.getElementById('p-autoprint')?.closest('label') : document.querySelector(sel);
      return { el, t, txt };
    }).filter(p => visto(p.el));
    if (!pasos.length) { ver(actual()); dlg.showModal(); return; }
    const velo = document.createElement('div'); velo.className = 'tour-velo';
    const marco = document.createElement('div'); marco.className = 'tour-marco';
    const caja = document.createElement('div'); caja.className = 'tour-caja'; caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-live', 'polite');
    document.body.append(velo, marco, caja);
    let i = 0;
    const pon = () => {
      const p = pasos[i]; const r = p.el.getBoundingClientRect(); const m = 6;
      Object.assign(marco.style, { left: r.left - m + 'px', top: r.top - m + 'px', width: r.width + 2 * m + 'px', height: r.height + 2 * m + 'px' });
      const ult = i === pasos.length - 1;
      caja.innerHTML = `<span class="tour-flecha"></span><small>Paso ${i + 1} de ${pasos.length}</small><h4>${p.t}</h4><p>${p.txt}</p>
        <div class="tour-bts"><button type="button" class="tour-x">Salir</button><span style="display:flex;gap:8px">${i ? '<button type="button" class="ant">‹ Atrás</button>' : ''}
        <button type="button" class="sig">${ult ? 'Terminar ✓' : 'Siguiente ›'}</button></span></div>
        ${ult ? '<div style="margin-top:10px;text-align:center"><button type="button" class="todo" style="border:0;background:none;color:#7C2430;text-decoration:underline;padding:4px">Ver el protocolo completo por escrito</button></div>' : ''}`;
      const W = innerWidth, H = innerHeight, cw = caja.offsetWidth, ch = caja.offsetHeight;
      const abajo = r.bottom + m + 18 + ch < H || r.top - m - 18 - ch < 0;
      let top = abajo ? r.bottom + m + 16 : r.top - m - 16 - ch;
      if (top + ch > H - 8) top = Math.max(8, H - ch - 8);   // elemento muy alto (columnas): la caja dentro de la pantalla
      const cx = r.left + r.width / 2; const left = Math.min(Math.max(12, cx - cw / 2), W - cw - 12);
      caja.className = 'tour-caja ' + (abajo ? 'abajo' : 'arriba'); Object.assign(caja.style, { top: top + 'px', left: left + 'px' });
      caja.querySelector('.tour-flecha').style.left = Math.min(Math.max(14, cx - left - 12), cw - 38) + 'px';
      caja.querySelector('.sig').focus();
    };
    const ir = n => { i = n; pasos[i].el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); requestAnimationFrame(pon); };
    caja.addEventListener('click', e => {
      if (e.target.closest('.sig')) { if (i < pasos.length - 1) ir(i + 1); else cierraTour(); }
      else if (e.target.closest('.ant')) ir(i - 1);
      else if (e.target.closest('.tour-x')) cierraTour();
      else if (e.target.closest('.todo')) { cierraTour(); ver(actual()); dlg.showModal(); }
    });
    velo.onclick = () => { if (i < pasos.length - 1) ir(i + 1); else cierraTour(); };
    tour = { nodos: [velo, marco, caja], pon }; addEventListener('resize', pon);
    ir(0);
  }
  addEventListener('keydown', e => { if (tour && e.key === 'Escape') cierraTour(); });
  // El gorro abre las preguntas rápidas, con el botón del recorrido paso a paso arriba.
  function guia() { ver(conTour() ? 'faq' : actual()); if (!dlg.open) dlg.showModal(); }

  // Botón grande burdeos con un gorro de cocina, en la barra de arriba junto a Salir.
  const SOMBRERO = '<svg viewBox="0 0 24 24" aria-hidden="true" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14.5V20h10v-5.5"/><path d="M7 17h10"/><path d="M7 14.5A4 4 0 016.4 6.6a4.6 4.6 0 018-2.3 4.3 4.3 0 013.2-.6A4 4 0 0117 14.5"/><path d="M10 14.5v-2.5M14 14.5v-2.5"/></svg>';
  const salir = document.getElementById(enTPV ? 'b-salir' : 'p-salir');
  if (salir) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'b b-ico b-ayuda'; b.title = 'Ayuda: preguntas rápidas y cómo funciona esta pantalla';
    b.innerHTML = SOMBRERO + '<span>Ayuda</span>';
    b.onclick = guia; salir.parentNode.insertBefore(b, salir);
  }
  // En Cobrar y Caja (ventanas encima), un "?" redondo abajo a la derecha.
  if (enTPV) ['dlg-cobrar', 'dlg-caja'].forEach(id => {
    const d = document.getElementById(id); if (!d) return;
    const q = document.createElement('button'); q.type = 'button'; q.className = 'ay-flota'; q.textContent = '?'; q.title = 'Cómo se usa'; q.setAttribute('aria-label', 'Ayuda');
    q.onclick = abrir; d.appendChild(q);
  });
  window.OP = window.OP || {}; window.OP.ayuda = abrir;
})();
