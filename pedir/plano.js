/* ÓRALE PADRE · dibujo del plano del local (lo usan /admin y /tpv).
   Lienzo lógico de 1000 × 625 por zona; se escala al ancho disponible. */
(function () {
  'use strict';
  const W = 1000, H = 625;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const css = document.createElement('style');
  css.textContent = `
  .plano{position:relative;width:100%;aspect-ratio:${W}/${H};container-type:inline-size;
    background:#FBF7F2 radial-gradient(circle, #DDD0C2 1px, transparent 1.2px) 0 0/2% 3.2%;
    border:2px solid #DDD0C2;border-radius:14px;overflow:hidden;touch-action:none}
  .pl-el{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
    border:2px solid #574548;background:#fff;color:#241A1C;border-radius:10%;padding:0;font:inherit;line-height:1.1;
    transform-origin:center;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .pl-el b{font-family:'Anton','Arial Narrow',Impact,sans-serif;font-weight:400;font-size:max(11px,2.1cqw);text-transform:uppercase;letter-spacing:.02em}
  .pl-el small{font-size:max(10px,1.35cqw);font-weight:700;opacity:.85}
  .pl-el .pl-imp{font-size:max(11px,1.6cqw);font-weight:800}
  .pl-el.f-redonda,.pl-el.f-taburete{border-radius:50%}
  .pl-el.f-taburete b{font-size:max(10px,1.5cqw)}
  .pl-el.deco{cursor:default;border-style:solid}
  .pl-el.f-barra{background:#6B4A3A;border-color:#4A3328;color:#F5EEE6;border-radius:8px}
  .pl-el.f-pared{background:#574548;border-color:#574548;color:#F5EEE6;border-radius:2px}
  .pl-el.f-puerta{background:transparent;border:3px dashed #C98A12;color:#8a5f0c;border-radius:4px}
  .pl-el.f-planta{background:#E4EEDD;border-color:#4F7A3A;color:#4F7A3A;border-radius:50%}
  .pl-el.ocupada{background:#7C2430;border-color:#5E1A24;color:#fff}
  .pl-el.pendiente::after{content:"";position:absolute;top:8%;right:8%;width:1.6cqw;height:1.6cqw;min-width:8px;min-height:8px;border-radius:50%;background:#C98A12}
  .pl-el.sel{outline:3px solid #2F6A9E;outline-offset:2px;z-index:3}
  .pl-asa{position:absolute;right:-2px;bottom:-2px;width:max(16px,2cqw);height:max(16px,2cqw);background:#2F6A9E;border-radius:3px;cursor:nwse-resize}
  `;
  document.head.appendChild(css);

  /**
   * Pinta los elementos de una zona en el contenedor.
   * opciones.estado(el) → {ocupada, sub, imp, pendiente}  (TPV)
   * opciones.editor → true para mostrar selección y asa de tamaño
   */
  function pintar(cont, elementos, opciones = {}) {
    cont.classList.add('plano');
    cont.innerHTML = elementos.filter(e => e.x != null).map(e => {
      const st = opciones.estado ? opciones.estado(e) || {} : {};
      const deco = e.tipo === 'deco';
      const estilo = `left:${e.x / W * 100}%;top:${e.y / H * 100}%;width:${e.ancho / W * 100}%;height:${e.alto / H * 100}%;` +
        (e.rotacion ? `transform:rotate(${e.rotacion}deg);` : '');
      const txt = deco ? (e.forma === 'barra' || e.forma === 'puerta' ? `<b>${esc(e.nombre)}</b>` : '')
        : `<b>${esc(e.nombre.replace(/^(Mesa|Terraza|Taburete)\s+/i, m => opciones.editor ? m : (/taburete/i.test(m) ? 'T' : '')))}</b>` +
          (st.sub ? `<small>${esc(st.sub)}</small>` : (e.plazas && opciones.editor ? `<small>${e.plazas} pax</small>` : '')) +
          (st.imp ? `<span class="pl-imp">${esc(st.imp)}</span>` : '');
      const cls = ['pl-el', 'f-' + e.forma, deco ? 'deco' : '', st.ocupada ? 'ocupada' : '', st.pendiente ? 'pendiente' : '',
        opciones.sel === e.id ? 'sel' : ''].join(' ');
      return `<button type="button" class="${cls}" data-el="${esc(e.id)}" style="${estilo}" ${deco && !opciones.editor ? 'tabindex="-1" aria-hidden="true"' : `aria-label="${esc(e.nombre)}"`}>
        ${txt}${opciones.editor && opciones.sel === e.id ? '<span class="pl-asa" data-asa></span>' : ''}</button>`;
    }).join('');
  }

  /** Convierte un desplazamiento en píxeles de pantalla a unidades del lienzo. */
  function escala(cont) { const r = cont.getBoundingClientRect(); return { x: W / r.width, y: H / r.height, rect: r }; }

  window.OP = Object.assign(window.OP || {}, { plano: { pintar, escala, W, H } });
})();
