const aviso = document.getElementById('aviso');
const elReloj = document.getElementById('reloj');
const elGuardado = document.getElementById('estado-guardado');
const elModuloActual = document.getElementById('modulo-actual');
const elUbicacion = document.getElementById('ubicacion');
const elContexto = document.getElementById('contexto');
const elEnunciado = document.getElementById('enunciado');
const elOpciones = document.getElementById('opciones');
const elGrilla = document.getElementById('grilla');
const elModulosNav = document.getElementById('modulos-nav');
const elConteo = document.getElementById('conteo');

const btnAnterior = document.getElementById('btn-anterior');
const btnSiguiente = document.getElementById('btn-siguiente');
const btnMarcar = document.getElementById('btn-marcar');
const btnLimpiar = document.getElementById('btn-limpiar');
const btnFinalizar = document.getElementById('btn-finalizar');

let examen = null;
let indice = 0;
let moduloVisible = null;
let restante = 0;
let entregando = false;

// ---------- reloj ----------

function pintarReloj() {
  elReloj.textContent = formatearDuracion(restante);
  elReloj.classList.toggle('alerta', restante <= 30 * 60 && restante > 5 * 60);
  elReloj.classList.toggle('critico', restante <= 5 * 60);
}

function arrancarReloj() {
  pintarReloj();
  setInterval(() => {
    restante = Math.max(0, restante - 1);
    pintarReloj();
    if (restante === 0 && !entregando) {
      // El servidor ya cerró el intento; solo hay que llevar al usuario al resultado.
      entregando = true;
      mostrarAviso(aviso, 'Se acabó el tiempo. El simulacro se entregó automáticamente.', 'alerta');
      setTimeout(() => { location.href = `/resultados.html?intento=${examen.intento_id}`; }, 1500);
    }
  }, 1000);

  // Resincroniza con el servidor, que es el único reloj que cuenta.
  setInterval(async () => {
    try {
      const estado = await api('/api/intentos/activo');
      if (estado.intento_id == null) {
        location.href = `/resultados.html?intento=${examen.intento_id}`;
        return;
      }
      restante = estado.segundos_restantes;
      pintarReloj();
    } catch {
      /* un fallo puntual de red no debe romper el examen */
    }
  }, 30000);
}

// ---------- guardado ----------

let guardadoPendiente = null;

async function guardar(pregunta) {
  elGuardado.textContent = 'Guardando…';
  try {
    await api(`/api/intentos/${examen.intento_id}/respuestas/${pregunta.id}`, {
      method: 'PUT',
      body: { opcion: pregunta.marcada, revisar: pregunta.revisar },
    });
    elGuardado.textContent = 'Guardado';
    ocultarAviso(aviso);
  } catch (e) {
    if (e.codigo === 'TIEMPO_AGOTADO' || e.codigo === 'INTENTO_FINALIZADO') {
      entregando = true;
      location.href = `/resultados.html?intento=${examen.intento_id}`;
      return;
    }
    elGuardado.textContent = 'Sin guardar';
    mostrarAviso(aviso, `No se pudo guardar la respuesta: ${e.message}`);
  }
}

// Agrupa cambios rápidos para no enviar una petición por clic.
function guardarConRetraso(pregunta) {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(() => guardar(pregunta), 250);
}

// ---------- render ----------

function preguntaActual() {
  return examen.preguntas[indice];
}

function pintarPregunta() {
  const p = preguntaActual();
  moduloVisible = p.modulo;

  elModuloActual.textContent = p.modulo_nombre;
  const delModulo = examen.preguntas.filter((q) => q.modulo === p.modulo);
  const posicion = delModulo.findIndex((q) => q.numero === p.numero) + 1;
  elUbicacion.textContent =
    `Pregunta ${p.numero} de ${examen.preguntas.length} · ${p.modulo_nombre} ${posicion}/${delModulo.length}`;

  elContexto.replaceChildren();
  if (p.contexto) {
    const div = document.createElement('div');
    div.className = 'contexto';
    if (p.contexto.titulo) {
      const h = document.createElement('h3');
      h.textContent = p.contexto.titulo;
      div.appendChild(h);
    }
    const cuerpo = document.createElement('div');
    cuerpo.textContent = p.contexto.contenido;
    div.appendChild(cuerpo);
    if (p.contexto.fuente) {
      const f = document.createElement('span');
      f.className = 'fuente';
      f.textContent = p.contexto.fuente;
      div.appendChild(f);
    }
    elContexto.appendChild(div);
  }

  elEnunciado.textContent = p.enunciado;

  elOpciones.replaceChildren();
  for (const o of p.opciones) {
    const label = document.createElement('label');
    label.className = 'opcion' + (p.marcada === o.clave ? ' elegida' : '');

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `pregunta-${p.id}`;
    radio.value = o.clave;
    radio.checked = p.marcada === o.clave;
    radio.addEventListener('change', () => {
      p.marcada = o.clave;
      pintarPregunta();
      pintarGrilla();
      guardarConRetraso(p);
    });

    const clave = document.createElement('span');
    clave.className = 'clave';
    clave.textContent = `${o.clave}.`;

    const texto = document.createElement('span');
    texto.textContent = o.texto;

    label.append(radio, clave, texto);
    elOpciones.appendChild(label);
  }

  btnMarcar.textContent = p.revisar ? 'Quitar marca' : 'Marcar para revisar';
  btnAnterior.disabled = indice === 0;
  btnSiguiente.disabled = indice === examen.preguntas.length - 1;
  btnLimpiar.disabled = p.marcada == null;

  pintarModulosNav();
  pintarGrilla();
}

function pintarModulosNav() {
  elModulosNav.replaceChildren();
  for (const m of examen.modulos) {
    const b = document.createElement('button');
    const respondidas = examen.preguntas.filter((q) => q.modulo === m.id && q.marcada != null).length;
    b.textContent = `${m.nombre} ${respondidas}/${m.preguntas}`;
    b.className = m.id === moduloVisible ? 'activo' : '';
    b.type = 'button';
    b.addEventListener('click', () => {
      const i = examen.preguntas.findIndex((q) => q.modulo === m.id);
      if (i >= 0) {
        indice = i;
        pintarPregunta();
        window.scrollTo({ top: 0 });
      }
    });
    elModulosNav.appendChild(b);
  }
}

function pintarGrilla() {
  elGrilla.replaceChildren();
  for (const [i, p] of examen.preguntas.entries()) {
    if (p.modulo !== moduloVisible) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(p.numero);
    if (p.marcada != null) b.classList.add('respondida');
    if (p.revisar) b.classList.add('marcada');
    if (i === indice) b.classList.add('actual');
    b.addEventListener('click', () => {
      indice = i;
      pintarPregunta();
      window.scrollTo({ top: 0 });
    });
    elGrilla.appendChild(b);
  }

  const respondidas = examen.preguntas.filter((p) => p.marcada != null).length;
  elConteo.textContent =
    `${respondidas} de ${examen.preguntas.length} respondidas · ${examen.preguntas.length - respondidas} sin responder`;
}

// ---------- acciones ----------

btnAnterior.addEventListener('click', () => {
  if (indice > 0) {
    indice--;
    pintarPregunta();
  }
});

btnSiguiente.addEventListener('click', () => {
  if (indice < examen.preguntas.length - 1) {
    indice++;
    pintarPregunta();
  }
});

btnMarcar.addEventListener('click', () => {
  const p = preguntaActual();
  p.revisar = !p.revisar;
  pintarPregunta();
  guardarConRetraso(p);
});

btnLimpiar.addEventListener('click', () => {
  const p = preguntaActual();
  p.marcada = null;
  pintarPregunta();
  guardarConRetraso(p);
});

btnFinalizar.addEventListener('click', async () => {
  const sinResponder = examen.preguntas.filter((p) => p.marcada == null).length;
  const advertencia = sinResponder
    ? `Te quedan ${sinResponder} preguntas sin responder y no hay penalización por responder mal.\n\n`
    : '';
  if (!confirm(`${advertencia}¿Entregar el simulacro? Esta acción no se puede deshacer.`)) return;

  entregando = true;
  btnFinalizar.disabled = true;
  try {
    await api(`/api/intentos/${examen.intento_id}/finalizar`, { method: 'POST' });
    location.href = `/resultados.html?intento=${examen.intento_id}`;
  } catch (e) {
    mostrarAviso(aviso, e.message);
    btnFinalizar.disabled = false;
    entregando = false;
  }
});

// Atajos de teclado: A-D para responder, flechas para navegar.
document.addEventListener('keydown', (e) => {
  if (!examen || e.target.tagName === 'INPUT') return;
  const tecla = e.key.toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(tecla)) {
    const p = preguntaActual();
    if (p.opciones.some((o) => o.clave === tecla)) {
      p.marcada = tecla;
      pintarPregunta();
      guardarConRetraso(p);
    }
  } else if (e.key === 'ArrowRight') {
    btnSiguiente.click();
  } else if (e.key === 'ArrowLeft') {
    btnAnterior.click();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (!entregando && examen) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- arranque ----------

async function cargar() {
  await exigirSesion();

  const activo = await api('/api/intentos/activo');
  if (activo.intento_id == null) {
    location.href = '/inicio.html';
    return;
  }

  examen = await api(`/api/intentos/${activo.intento_id}`);
  restante = examen.segundos_restantes;

  // Retoma la última pregunta sin responder, que es donde el estudiante se quedó.
  const pendiente = examen.preguntas.findIndex((p) => p.marcada == null);
  indice = pendiente >= 0 ? pendiente : 0;

  pintarPregunta();
  arrancarReloj();
}

cargar().catch((e) => mostrarAviso(aviso, e.message));
