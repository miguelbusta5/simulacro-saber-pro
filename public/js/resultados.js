const aviso = document.getElementById('aviso');
const contenido = document.getElementById('contenido');
const intentoId = new URLSearchParams(location.search).get('intento');

document.getElementById('btn-inicio').addEventListener('click', () => {
  location.href = '/inicio.html';
});
document.getElementById('btn-revision').addEventListener('click', () => {
  location.href = `/revision.html?intento=${intentoId}`;
});

const NOMBRE_PRIORIDAD = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  consolidado: 'Consolidado',
};

function celda(texto) {
  const td = document.createElement('td');
  td.textContent = texto;
  return td;
}

function celdaPrioridad(prioridad) {
  const td = document.createElement('td');
  const span = document.createElement('span');
  span.className = `etiqueta etiqueta-${prioridad}`;
  span.textContent = NOMBRE_PRIORIDAD[prioridad] || prioridad;
  td.appendChild(span);
  return td;
}

function celdaPorcentaje(porcentaje) {
  const td = document.createElement('td');
  const barra = document.createElement('div');
  barra.className = 'barra-progreso';
  const relleno = document.createElement('div');
  relleno.style.width = `${porcentaje}%`;
  barra.appendChild(relleno);
  const texto = document.createElement('div');
  texto.className = 'silencio';
  texto.textContent = `${porcentaje} %`;
  td.append(texto, barra);
  return td;
}

function pintarResultados(r) {
  document.getElementById('fecha').textContent =
    `${r.prueba_nombre} · ${r.version_nombre} · ${formatearFecha(r.finalizado_en)}`;
  document.getElementById('puntaje-global').textContent =
    r.escala === 'porcentaje' ? `${r.puntaje_global} %` : r.puntaje_global;

  // Cada prueba se reporta en su propia escala: la del ICFES va de 0 a 300 y la
  // de enfermería, en porcentaje de acierto.
  document.getElementById('etiqueta-global').textContent =
    r.escala === 'porcentaje'
      ? 'Puntaje global (promedio de los módulos, en porcentaje de acierto)'
      : 'Puntaje global (promedio de competencias genéricas)';
  document
    .getElementById('nota-escala-icfes')
    .classList.toggle('oculto', r.escala === 'porcentaje');
  document
    .getElementById('nota-escala-porcentaje')
    .classList.toggle('oculto', r.escala !== 'porcentaje');

  const duracion = r.duracion_segundos != null ? formatearDuracion(r.duracion_segundos) : '—';
  const cierre =
    r.motivo_cierre === 'tiempo_agotado'
      ? ' · se entregó automáticamente al agotarse el tiempo'
      : '';
  document.getElementById('resumen').textContent =
    `${r.aciertos} de ${r.total} respuestas correctas · ${r.respondidas} preguntas respondidas · tiempo empleado ${duracion}${cierre}`;

  const ficha = document.getElementById('ficha');
  ficha.replaceChildren();
  const datos = [
    ['Prueba', r.prueba_nombre],
    ['Versión', r.version_nombre],
    ['Fecha de inicio', formatearFecha(r.iniciado_en)],
    ['Fecha de finalización', formatearFecha(r.finalizado_en)],
    ['Tiempo empleado', `${duracion} de ${Math.floor(r.duracion_minutos_permitidos / 60)} h ${r.duracion_minutos_permitidos % 60} min disponibles`],
  ];
  for (const [etiqueta, valor] of datos) {
    const dt = document.createElement('dt');
    dt.textContent = etiqueta;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    ficha.append(dt, dd);
  }

  // La nota sobre Comunicación escrita solo aplica si el intento la incluyó.
  document
    .getElementById('nota-escrita')
    .classList.toggle('oculto', !r.modulos.some((m) => m.modulo === 'comunicacion_escrita'));

  const tbody = document.getElementById('tabla-modulos');
  const descripciones = document.getElementById('descripciones-nivel');
  tbody.replaceChildren();
  descripciones.replaceChildren();

  for (const m of r.modulos) {
    const tr = document.createElement('tr');
    tr.append(
      celda(m.modulo_nombre),
      celda(`${m.aciertos} / ${m.total}`),
      celdaPorcentaje(m.porcentaje),
      celda(String(m.puntaje)),
      celda(m.nivel)
    );
    tbody.appendChild(tr);

    const p = document.createElement('p');
    p.className = 'silencio';
    p.innerHTML = `<strong>${m.modulo_nombre} — ${m.nivel}:</strong> ${m.descripcion_nivel}`;
    descripciones.appendChild(p);
  }
}

function pintarAnalisis(a) {
  document.getElementById('gestion-tiempo').textContent = a.gestion_tiempo;

  const plan = document.getElementById('plan');
  plan.replaceChildren();

  if (!a.plan_de_estudio.length) {
    const p = document.createElement('p');
    p.textContent =
      'No hay competencias por debajo del 70 % de acierto: todas las áreas evaluadas están consolidadas. Repite la prueba para confirmar el resultado con preguntas distintas.';
    plan.appendChild(p);
  }

  for (const item of a.plan_de_estudio) {
    const div = document.createElement('div');
    div.className = 'tarjeta';

    const cabeza = document.createElement('div');
    cabeza.className = 'rev-cabeza';
    const h = document.createElement('h3');
    h.textContent = `${item.orden}. ${item.titulo}`;
    const etiqueta = document.createElement('span');
    etiqueta.className = `etiqueta etiqueta-${item.prioridad}`;
    etiqueta.textContent = `${item.porcentaje} % de acierto · ${NOMBRE_PRIORIDAD[item.prioridad]}`;
    cabeza.append(h, etiqueta);
    div.appendChild(cabeza);

    const titulo = document.createElement('p');
    titulo.innerHTML = '<strong>Temas para estudiar:</strong>';
    div.appendChild(titulo);

    const ul = document.createElement('ul');
    ul.className = 'lista-limpia';
    for (const t of item.que_estudiar) {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    }
    div.appendChild(ul);

    const practica = document.createElement('p');
    practica.className = 'rev-nota';
    practica.innerHTML = `<strong>Cómo practicarlo:</strong> ${item.como_practicar}`;
    div.appendChild(practica);

    plan.appendChild(div);
  }

  const tc = document.getElementById('tabla-competencias');
  tc.replaceChildren();
  for (const c of a.por_competencia) {
    const tr = document.createElement('tr');
    tr.append(
      celda(c.modulo_nombre),
      celda(c.competencia),
      celda(`${c.aciertos} / ${c.total}`),
      celdaPorcentaje(c.porcentaje),
      celdaPrioridad(c.prioridad)
    );
    tc.appendChild(tr);
  }

  const tt = document.getElementById('tabla-temas');
  tt.replaceChildren();
  for (const t of a.por_tema) {
    const tr = document.createElement('tr');
    const tdTema = document.createElement('td');
    tdTema.textContent = t.tema.replace(/_/g, ' ');
    if (t.descripcion) tdTema.title = t.descripcion;
    tr.append(
      celda(t.modulo_nombre),
      tdTema,
      celda(`${t.aciertos} / ${t.total}`),
      celdaPorcentaje(t.porcentaje),
      celdaPrioridad(t.prioridad)
    );
    tt.appendChild(tr);
  }
}

async function cargar() {
  await exigirSesion();
  if (!intentoId) {
    mostrarAviso(aviso, 'No se indicó qué prueba consultar.');
    return;
  }
  try {
    const [resultados, analisis] = await Promise.all([
      api(`/api/intentos/${intentoId}/resultados`),
      api(`/api/intentos/${intentoId}/analisis`),
    ]);
    pintarResultados(resultados);
    pintarAnalisis(analisis);
    contenido.classList.remove('oculto');
  } catch (e) {
    if (e.codigo === 'REVISION_BLOQUEADA') {
      mostrarAviso(aviso, `${e.message} Vuelve al inicio para continuar tu prueba.`, 'alerta');
      return;
    }
    mostrarAviso(aviso, e.message);
  }
}

cargar();
