const aviso = document.getElementById('aviso');
const contenido = document.getElementById('contenido');
const lista = document.getElementById('lista');
const intentoId = new URLSearchParams(location.search).get('intento');

document.getElementById('btn-inicio').addEventListener('click', () => {
  location.href = '/inicio.html';
});
document.getElementById('btn-resultados').addEventListener('click', () => {
  location.href = `/resultados.html?intento=${intentoId}`;
});

let preguntas = [];
let filtroEstado = 'incorrecta';
let filtroModulo = 'todos';

const ETIQUETA_ESTADO = {
  correcta: 'Correcta',
  incorrecta: 'Incorrecta',
  sin_responder: 'Sin responder',
};

function pintarFiltros() {
  const cont = document.getElementById('filtros-estado');
  cont.replaceChildren();

  const conteo = (estado) =>
    estado === 'todos' ? preguntas.length : preguntas.filter((p) => p.estado === estado).length;

  for (const [clave, texto] of [
    ['incorrecta', 'Incorrectas'],
    ['sin_responder', 'Sin responder'],
    ['correcta', 'Correctas'],
    ['todos', 'Todas'],
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${texto} (${conteo(clave)})`;
    b.className = filtroEstado === clave ? 'activo' : '';
    b.addEventListener('click', () => {
      filtroEstado = clave;
      pintarFiltros();
      pintarLista();
    });
    cont.appendChild(b);
  }

  const contModulo = document.getElementById('filtros-modulo');
  contModulo.replaceChildren();
  const modulos = [...new Map(preguntas.map((p) => [p.modulo, p.modulo_nombre]))];
  for (const [clave, nombre] of [['todos', 'Todos los módulos'], ...modulos]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = nombre;
    b.className = filtroModulo === clave ? 'activo' : '';
    b.addEventListener('click', () => {
      filtroModulo = clave;
      pintarFiltros();
      pintarLista();
    });
    contModulo.appendChild(b);
  }
}

function tarjetaPregunta(p) {
  const art = document.createElement('article');
  art.className = `tarjeta rev-pregunta ${p.estado}`;

  const cabeza = document.createElement('div');
  cabeza.className = 'rev-cabeza';
  const titulo = document.createElement('strong');
  titulo.textContent = `Pregunta ${p.numero} · ${p.modulo_nombre}`;
  const estado = document.createElement('span');
  const clase =
    p.estado === 'correcta' ? 'consolidado' : p.estado === 'incorrecta' ? 'alta' : 'media';
  estado.className = `etiqueta etiqueta-${clase}`;
  estado.textContent = ETIQUETA_ESTADO[p.estado];
  cabeza.append(titulo, estado);
  art.appendChild(cabeza);

  const comp = document.createElement('p');
  comp.className = 'silencio';
  comp.textContent = `${p.competencia_nombre} · tema: ${p.tema.replace(/_/g, ' ')}`;
  art.appendChild(comp);

  if (p.contexto) {
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = p.contexto.titulo || 'Ver el texto de la pregunta';
    det.appendChild(sum);
    const div = document.createElement('div');
    div.className = 'contexto';
    div.textContent = p.contexto.contenido;
    det.appendChild(div);
    art.appendChild(det);
  }

  const enunciado = document.createElement('p');
  enunciado.className = 'enunciado';
  enunciado.textContent = p.enunciado;
  art.appendChild(enunciado);

  for (const o of p.opciones) {
    const div = document.createElement('div');
    div.className = 'rev-opcion';
    if (o.clave === p.correcta) div.classList.add('es-correcta');
    if (o.clave === p.marcada && p.marcada !== p.correcta) div.classList.add('es-marcada-mal');

    const marcas = [];
    if (o.clave === p.correcta) marcas.push('respuesta correcta');
    if (o.clave === p.marcada) marcas.push('tu respuesta');

    div.textContent = `${o.clave}. ${o.texto}${marcas.length ? `  — ${marcas.join(' · ')}` : ''}`;
    art.appendChild(div);
  }

  const nota = document.createElement('div');
  nota.className = 'rev-nota';
  let html = `<strong>Por qué la respuesta es ${p.correcta}:</strong> ${p.justificacion}`;
  if (p.justificacion_error) {
    html += `<br><br><strong>Por qué falla la opción ${p.marcada}:</strong> ${p.justificacion_error}`;
  }
  if (p.estado === 'sin_responder') {
    html += '<br><br><strong>Dejaste esta pregunta en blanco.</strong> No hay penalización por responder mal: siempre conviene marcar una opción.';
  }
  nota.innerHTML = html;
  art.appendChild(nota);

  return art;
}

function pintarLista() {
  lista.replaceChildren();
  const filtradas = preguntas.filter(
    (p) =>
      (filtroEstado === 'todos' || p.estado === filtroEstado) &&
      (filtroModulo === 'todos' || p.modulo === filtroModulo)
  );

  if (!filtradas.length) {
    const p = document.createElement('p');
    p.className = 'tarjeta silencio';
    p.textContent = 'No hay preguntas que cumplan este filtro.';
    lista.appendChild(p);
    return;
  }

  for (const p of filtradas) lista.appendChild(tarjetaPregunta(p));
}

async function cargar() {
  await exigirSesion();
  if (!intentoId) {
    mostrarAviso(aviso, 'No se indicó qué simulacro revisar.');
    return;
  }
  try {
    const datos = await api(`/api/intentos/${intentoId}/revision`);
    preguntas = datos.preguntas;
    const correctas = preguntas.filter((p) => p.estado === 'correcta').length;
    document.getElementById('resumen').textContent =
      `${correctas} correctas de ${preguntas.length}`;
    pintarFiltros();
    pintarLista();
    contenido.classList.remove('oculto');
  } catch (e) {
    if (e.codigo === 'REVISION_BLOQUEADA') {
      mostrarAviso(aviso, `${e.message} Vuelve al inicio para continuar tu simulacro.`, 'alerta');
      return;
    }
    mostrarAviso(aviso, e.message);
  }
}

cargar();
