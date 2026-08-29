// Utilidades compartidas por todas las páginas.

class ErrorApi extends Error {
  constructor(status, codigo, mensaje, datos) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.datos = datos;
  }
}

async function api(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });

  let datos = null;
  try {
    datos = await res.json();
  } catch {
    datos = null;
  }

  if (!res.ok) {
    throw new ErrorApi(
      res.status,
      datos?.error || 'ERROR',
      datos?.mensaje || 'Ocurrió un error inesperado.',
      datos
    );
  }
  return datos;
}

// Redirige al login si no hay sesión. Devuelve el estado de /api/auth/me.
async function exigirSesion() {
  try {
    return await api('/api/auth/me');
  } catch (e) {
    if (e.status === 401) {
      location.href = '/index.html';
      return new Promise(() => {}); // detiene la ejecución mientras navega
    }
    throw e;
  }
}

function mostrarAviso(el, mensaje, tipo = 'error') {
  el.textContent = mensaje;
  el.className = `aviso aviso-${tipo}`;
  el.classList.remove('oculto');
}

function ocultarAviso(el) {
  el.classList.add('oculto');
}

function formatearDuracion(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const seg = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${seg}`;
}

function formatearFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function cerrarSesion() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    location.href = '/index.html';
  }
}
