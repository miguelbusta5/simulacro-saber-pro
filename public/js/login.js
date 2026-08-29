const aviso = document.getElementById('aviso');
const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');
const tabLogin = document.getElementById('tab-login');
const tabRegistro = document.getElementById('tab-registro');

function mostrarPestana(cual) {
  ocultarAviso(aviso);
  const esLogin = cual === 'login';
  formLogin.classList.toggle('oculto', !esLogin);
  formRegistro.classList.toggle('oculto', esLogin);
  tabLogin.classList.toggle('activo', esLogin);
  tabRegistro.classList.toggle('activo', !esLogin);
}

tabLogin.addEventListener('click', () => mostrarPestana('login'));
tabRegistro.addEventListener('click', () => mostrarPestana('registro'));

async function enviar(form, ruta) {
  ocultarAviso(aviso);
  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    const datos = Object.fromEntries(new FormData(form).entries());
    await api(ruta, { method: 'POST', body: datos });
    location.href = '/inicio.html';
  } catch (e) {
    mostrarAviso(aviso, e.message);
    boton.disabled = false;
  }
}

formLogin.addEventListener('submit', (e) => {
  e.preventDefault();
  enviar(formLogin, '/api/auth/login');
});

formRegistro.addEventListener('submit', (e) => {
  e.preventDefault();
  enviar(formRegistro, '/api/auth/register');
});

// Si ya hay sesión activa, no tiene sentido mostrar el login.
api('/api/auth/me')
  .then(() => { location.href = '/inicio.html'; })
  .catch(() => {});
