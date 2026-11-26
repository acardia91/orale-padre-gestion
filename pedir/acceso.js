/* ÓRALE PADRE · "¿Has olvidado tu contraseña?" en la entrada del admin, TPV y comandas.
   1) Con el email, Supabase manda un enlace para poner otra contraseña.
   2) Al volver de ese enlace, esta pantalla pide la contraseña nueva y la guarda.
   Si el correo no llega, un encargado puede ponerla desde el admin (Usuarios). */
(function () {
  'use strict';
  const { api, mensajeError } = window.OP;
  const form = document.getElementById('form-entrar'); if (!form) return;
  const hash = location.hash || '';
  const vieneDeEnlace = /type=recovery/.test(hash);
  const enlaceMalo = /error_code=otp_expired|error=access_denied/.test(hash);

  const css = document.createElement('style');
  css.textContent = `
    .e-olvido{margin:0;text-align:center}
    .e-olvido button{background:none;border:0;padding:4px;color:inherit;opacity:.75;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer}
    .clave-nueva{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(20,14,10,.55)}
    .clave-nueva form{width:min(380px,100%);display:flex;flex-direction:column;gap:12px;background:#fff;color:#1f1712;padding:26px 24px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
    .clave-nueva h2{margin:0;font-size:20px}
    .clave-nueva p{margin:0;font-size:14px;line-height:1.4}
    .clave-nueva label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:13px}
    .clave-nueva input{font:inherit;font-size:16px;padding:11px 12px;border:1px solid #d9cfc4;border-radius:10px}
    .clave-nueva .mal{color:#b3261e;font-weight:600}
    .clave-nueva button{font:inherit;font-weight:700;font-size:15px;padding:12px;border-radius:10px;border:0;background:#2f6b3a;color:#fff;cursor:pointer}`;
  document.head.appendChild(css);

  const p = document.createElement('p'); p.className = 'e-olvido';
  p.innerHTML = '<button type="button">¿Has olvidado tu contraseña?</button>';
  form.appendChild(p);
  p.querySelector('button').onclick = async () => {
    let email = (document.getElementById('e-email').value || '').trim();
    if (!email) email = (prompt('Escribe tu email de acceso y te mandamos un enlace para poner una contraseña nueva:', '') || '').trim();
    if (!email) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('Revisa el email.'); return; }
    try {
      await api.recuperarPassword(email);
      alert(`Si ${email} tiene acceso, le llega un correo con un enlace para poner una contraseña nueva (mira también en correo no deseado).\n\nSi no llega en unos minutos, pide a un encargado que te ponga una nueva desde el admin → Usuarios.`);
    } catch (ex) { alert(mensajeError(ex)); }
  };

  if (enlaceMalo) {
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => alert('Ese enlace ya no vale (caduca en una hora y sólo sirve una vez). Pide otro con "¿Has olvidado tu contraseña?".'), 300);
    return;
  }
  if (!vieneDeEnlace) return;

  // Viene del enlace del correo: ya tiene sesión; falta la contraseña nueva.
  const caja = document.createElement('div'); caja.className = 'clave-nueva';
  caja.innerHTML = `<form novalidate>
      <h2>Pon tu contraseña nueva</h2>
      <p>Mínimo 8 caracteres. Apúntala en un sitio seguro.</p>
      <label>Contraseña nueva<input type="password" id="cn-1" autocomplete="new-password" minlength="8" required></label>
      <label>Repítela<input type="password" id="cn-2" autocomplete="new-password" minlength="8" required></label>
      <p class="mal" id="cn-error" role="alert" hidden></p>
      <button type="submit">Guardar contraseña</button>
    </form>`;
  document.body.appendChild(caja);
  const fallo = t => { const e = caja.querySelector('#cn-error'); e.textContent = t; e.hidden = false; };
  caja.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const a = caja.querySelector('#cn-1').value, b = caja.querySelector('#cn-2').value;
    if (a.length < 8) return fallo('Tiene que tener al menos 8 caracteres.');
    if (a !== b) return fallo('Las dos no coinciden.');
    const btn = caja.querySelector('button'); btn.disabled = true;
    try {
      await api.cambiarPassword(a);
      history.replaceState(null, '', location.pathname + location.search);
      caja.remove(); alert('✓ Contraseña cambiada. La próxima vez entra con la nueva.');
    } catch (ex) {
      fallo(/session|sesi/i.test(String(ex && ex.message)) ? 'El enlace ha caducado. Pide otro con "¿Has olvidado tu contraseña?".' : mensajeError(ex));
    } finally { btn.disabled = false; }
  });
  setTimeout(() => caja.querySelector('#cn-1').focus(), 200);
})();
