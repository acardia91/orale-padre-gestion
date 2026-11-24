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

  async function entrar(s) {
    const enc = s.locales.filter(l => (s.roles || {})[l] === 'encargado');
    if (!enc.length) {
      $('#e-error').textContent = 'Sólo los encargados pueden entrar en el panel.'; $('#e-error').hidden = false;
      $('#vista-entrar').hidden = false; return;
    }
    if (!enc.includes(LOCAL)) LOCAL = enc[0];
    $('#vista-entrar').hidden = true; $('#vista-app').hidden = false;
    try { const loc = await api.local(LOCAL); $('#a-local').textContent = loc.nombre.replace(/^Órale Padre\s*/, ''); } catch (e) {}
    window.addEventListener('hashchange', ir);
    ir();
  }

  const SECCIONES = ['resumen', 'carta', 'plano', 'promos', 'local', 'usuarios'];
  async function ir() {
    const sec = SECCIONES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'resumen';
    document.querySelectorAll('.sec').forEach(el => { el.hidden = el.dataset.sec !== sec; });
    document.querySelectorAll('#a-nav a[href]').forEach(a => a.classList.toggle('activa', a.getAttribute('href') === '#' + sec));
    const mod = window.ADMIN[sec];
    if (!mod) return;
    try {
      if (!iniciadas.has(sec)) { iniciadas.add(sec); await mod.init(LOCAL); }
      else if (mod.mostrar) await mod.mostrar();
    } catch (e) { console.error(e); }
    window.scrollTo(0, 0);
  }

  // Avisar antes de salir con cambios sin guardar en cualquier sección.
  window.addEventListener('beforeunload', e => {
    if (Object.values(window.ADMIN).some(m => m.sucio && m.sucio())) { e.preventDefault(); e.returnValue = ''; }
  });
})();
