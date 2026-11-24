/* ÓRALE PADRE · panel de administración: entrada, sesión y secciones */
(function () {
  'use strict';
  const { api, DEMO } = window.OP;
  const $ = s => document.querySelector(s);
  let LOCAL = new URLSearchParams(location.search).get('local') || 'tomares';
  const iniciadas = new Set();

  if (DEMO) $('#a-demo').hidden = false;

  (async () => {
    let s = null; try { s = await api.sesion(); } catch (e) { s = null; }
    if (!s) { $('#vista-entrar').hidden = false; return; }
    entrar(s);
  })();
  $('#form-entrar').addEventListener('submit', async e => {
    e.preventDefault(); $('#e-error').hidden = true;
    try { entrar(await api.entrar($('#e-email').value.trim(), $('#e-pass').value)); }
    catch (ex) { $('#e-error').textContent = 'Email o contraseña incorrectos.'; $('#e-error').hidden = false; }
  });
  $('#a-salir').onclick = async () => { await api.salir(); location.reload(); };

  let LOCALES = [];
  async function entrar(s) {
    const enc = s.locales.filter(l => (s.roles || {})[l] === 'encargado');
    if (!enc.length) {
      $('#e-error').textContent = 'Sólo los encargados pueden entrar en el panel.'; $('#e-error').hidden = false;
      $('#vista-entrar').hidden = false; return;
    }
    // Vista: un local o todo el negocio ('*'), como en Last App. Se recuerda en este navegador.
    let guardado = null; try { guardado = localStorage.getItem('op-admin-local'); } catch (e) {}
    const pedido = new URLSearchParams(location.search).get('local') || guardado;
    LOCAL = pedido === '*' && enc.length > 1 ? '*' : enc.includes(pedido) ? pedido : (enc.length > 1 ? '*' : enc[0]);
    $('#vista-entrar').hidden = true; $('#vista-app').hidden = false;
    $('#a-usuario').textContent = s.email || '';
    LOCALES = await Promise.all(enc.map(async id => { try { const l = await api.local(id); return { id, nombre: l.nombre }; } catch (e) { return { id, nombre: id }; } }));
    const corto = n => n.replace(/^Órale Padre\s*/, '');
    $('#a-locales').innerHTML = (LOCALES.length > 1 ? '<option value="*">Todos los locales</option>' : '') +
      LOCALES.map(l => `<option value="${l.id}">${corto(l.nombre)}</option>`).join('');
    $('#a-locales').value = LOCAL;
    $('#a-locales').onchange = e => {
      if (Object.values(window.ADMIN).some(m => m.sucio && m.sucio()) && !confirm('Tienes cambios sin guardar. ¿Cambiar de local igualmente?')) { e.target.value = LOCAL; return; }
      try { localStorage.setItem('op-admin-local', e.target.value); } catch (ex) {}
      location.search = '?local=' + encodeURIComponent(e.target.value);
    };
    $('#el-locales').innerHTML = LOCALES.map(l => `<button type="button" data-l="${l.id}"><b>${corto(l.nombre)}</b><small>Ver esta sección de ${corto(l.nombre)}</small></button>`).join('');
    $('#el-locales').onclick = e => { const b = e.target.closest('[data-l]'); if (!b) return; try { localStorage.setItem('op-admin-local', b.dataset.l); } catch (ex) {} location.search = '?local=' + b.dataset.l; };
    window.addEventListener('hashchange', ir);
    ir();
  }

  const SECCIONES = ['resumen', 'pedidos', 'carta', 'clientes', 'promos', 'plano', 'reservas', 'local', 'usuarios'];
  const TITULOS = { reservas: 'Reservas', carta: 'Carta y productos', plano: 'Plano del local', promos: 'Promociones', local: 'Local y horario', usuarios: 'Usuarios' };
  async function ir() {
    const sec = SECCIONES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'resumen';
    const mod = window.ADMIN[sec];
    const elegir = LOCAL === '*' && !(mod && mod.todos);
    document.querySelectorAll('.sec').forEach(el => { el.hidden = el.dataset.sec !== (elegir ? 'elige' : sec); });
    document.querySelectorAll('#a-nav a[href]').forEach(a => a.classList.toggle('activa', a.getAttribute('href') === '#' + sec));
    if (elegir) { $('#el-titulo').textContent = TITULOS[sec] + ': elige un local'; window.scrollTo(0, 0); return; }
    if (!mod) return;
    try {
      if (!iniciadas.has(sec)) { iniciadas.add(sec); await mod.init(LOCAL, LOCALES); }
      else if (mod.mostrar) await mod.mostrar();
    } catch (e) { console.error(e); }
    window.scrollTo(0, 0);
  }

  // Avisar antes de salir con cambios sin guardar en cualquier sección.
  window.addEventListener('beforeunload', e => {
    if (Object.values(window.ADMIN).some(m => m.sucio && m.sucio())) { e.preventDefault(); e.returnValue = ''; }
  });
})();
