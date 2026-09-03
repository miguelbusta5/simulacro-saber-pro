const aviso = document.getElementById('aviso');
const contenido = document.getElementById('contenido');
const detalle = document.getElementById('detalle');

document.getElementById('btn-inicio').addEventListener('click', () => {
  location.href = '/inicio.html';
});
document.getElementById('btn-salir').addEventListener('click', cerrarSesion);

const NOMBRE_PRIORIDAD = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  consolidado: 'Consolidado',
};

let filtroUsuario = 'todos';
let usuarios = [];

function celda(texto) {
  const td = document.createElement('td');
  td.textContent = texto;
  return td;
}

function boton(texto, alHacerClic, clase = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  if (clase) b.className = clase;
  b.addEventListener('click', alHacerClic);
  return b;
}

// ---------- resumen ----------

function pintarResumen(r) {
  const ficha = document.getElementById('ficha-resumen');
  ficha.replaceChildren();
  for (const [etiqueta, valor] of [
    ['Usuarios registrados', String(r.usuarios)],
    ['Pruebas finalizadas', String(r.finalizados)],
    ['Pruebas en curso', String(r.en_curso)],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = etiqueta;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    ficha.append(dt, dd);
  }

  const cont = document.getElementById('resumen-versiones');
  cont.replaceChildren();
  for (const v of r.versiones) {
    if (!v.modulos.length) continue;

    const h = document.createElement('h3');
    h.textContent = `${v.nombre}${v.activa ? ' (versión activa)' : ''}`;
    cont.appendChild(h);

    const tabla = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML =
      '<tr><th>Módulo</th><th>Pruebas</th><th>% acierto promedio</th><th>Puntaje promedio</th></tr>';
    const tbody = document.createElement('tbody');
    for (const m of v.modulos) {
      const tr = document.createElement('tr');
      tr.append(
        celda(m.modulo_nombre),
        celda(String(m.intentos)),
        celda(`${m.porcentaje_promedio} %`),
        celda(String(m.puntaje_promedio))
      );
      tbody.appendChild(tr);
    }
    tabla.append(thead, tbody);

    const envoltorio = document.createElement('div');
    envoltorio.className = 'tabla-scroll';
    envoltorio.appendChild(tabla);
    cont.appendChild(envoltorio);
  }

  if (!cont.children.length) {
    const p = document.createElement('p');
    p.className = 'silencio';
    p.textContent = 'Todavía no hay pruebas finalizadas.';
    cont.appendChild(p);
  }
}

// ---------- usuarios ----------

function pintarUsuarios() {
  const tbody = document.getElementById('tabla-usuarios');
  tbody.replaceChildren();

  if (!usuarios.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7" class="silencio">No hay usuarios registrados.</td>';
    tbody.appendChild(tr);
    return;
  }

  for (const u of usuarios) {
    const tr = document.createElement('tr');
    const pruebas = u.intentos_en_curso
      ? `${u.intentos_finalizados} (${u.intentos_en_curso} en curso)`
      : String(u.intentos_finalizados);

    tr.append(
      celda(u.usuario),
      celda(u.nombre || '—'),
      celda(u.rol === 'admin' ? 'Administrador' : 'Estudiante'),
      celda(pruebas),
      celda(
        (u.mejores_puntajes || [])
          .map((m) => `${m.prueba_nombre}: ${m.puntaje}${m.escala === 'porcentaje' ? ' %' : ''}`)
          .join(' · ') || '—'
      ),
      celda(u.ultimo_intento ? formatearFecha(u.ultimo_intento) : '—')
    );

    const td = document.createElement('td');
    if (u.intentos_finalizados > 0) {
      td.appendChild(
        boton('Ver pruebas', () => {
          filtroUsuario = u.usuario;
          cargarIntentos();
          document.getElementById('tabla-intentos').scrollIntoView({ behavior: 'smooth' });
        })
      );
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

// ---------- intentos ----------

function pintarFiltros() {
  const cont = document.getElementById('filtros-usuario');
  cont.replaceChildren();

  const opciones = [['todos', 'Todos los estudiantes'], ...usuarios.map((u) => [u.usuario, u.usuario])];
  for (const [clave, texto] of opciones) {
    cont.appendChild(
      boton(
        texto,
        () => {
          filtroUsuario = clave;
          cargarIntentos();
        },
        filtroUsuario === clave ? 'activo' : ''
      )
    );
  }
}

function pintarIntentos(intentos) {
  const tbody = document.getElementById('tabla-intentos');
  tbody.replaceChildren();

  if (!intentos.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="9" class="silencio">No hay pruebas para este filtro.</td>';
    tbody.appendChild(tr);
    return;
  }

  for (const i of intentos) {
    const enCurso = i.estado === 'en_curso';
    const tr = document.createElement('tr');
    tr.append(
      celda(i.nombre ? `${i.usuario} (${i.nombre})` : i.usuario),
      celda(i.prueba_nombre || ''),
      celda(i.version_nombre),
      celda(formatearFecha(i.iniciado_en)),
      celda(
        enCurso
          ? 'En curso'
          : i.motivo_cierre === 'tiempo_agotado'
            ? `${formatearFecha(i.finalizado_en)} (tiempo agotado)`
            : formatearFecha(i.finalizado_en)
      ),
      celda(i.duracion_segundos != null ? formatearDuracion(i.duracion_segundos) : '—'),
      celda(enCurso ? '—' : `${i.aciertos ?? 0} / ${i.total ?? 0}`),
      celda(enCurso ? '—' : String(i.puntaje_global ?? 0))
    );

    const td = document.createElement('td');
    if (!enCurso) td.appendChild(boton('Ver detalle', () => verDetalle(i.id)));
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

// ---------- detalle de un intento ----------

async function verDetalle(id) {
  detalle.replaceChildren();
  try {
    const d = await api(`/api/admin/intentos/${id}`);

    const seccion = document.createElement('div');
    seccion.className = 'tarjeta';

    const cabeza = document.createElement('div');
    cabeza.className = 'rev-cabeza';
    const h = document.createElement('h2');
    h.textContent =
      `${d.estudiante.nombre || d.estudiante.usuario} — ${d.resultados.prueba_nombre}`;
    cabeza.append(h, boton('Cerrar', () => detalle.replaceChildren()));
    seccion.appendChild(cabeza);

    const ficha = document.createElement('dl');
    ficha.className = 'ficha';
    const duracion =
      d.resultados.duracion_segundos != null
        ? formatearDuracion(d.resultados.duracion_segundos)
        : '—';
    for (const [etiqueta, valor] of [
      ['Usuario', d.estudiante.usuario],
      ['Prueba', d.resultados.prueba_nombre],
      ['Versión', d.resultados.version_nombre],
      ['Inicio', formatearFecha(d.resultados.iniciado_en)],
      ['Finalización', formatearFecha(d.resultados.finalizado_en)],
      ['Tiempo empleado', duracion],
      [
        'Puntaje global',
        d.resultados.escala === 'porcentaje'
          ? `${d.resultados.puntaje_global} %`
          : String(d.resultados.puntaje_global),
      ],
      ['Aciertos', `${d.resultados.aciertos} de ${d.resultados.total}`],
      ['Sin responder', String(d.analisis.sin_responder)],
    ]) {
      const dt = document.createElement('dt');
      dt.textContent = etiqueta;
      const dd = document.createElement('dd');
      dd.textContent = valor;
      ficha.append(dt, dd);
    }
    seccion.appendChild(ficha);

    seccion.appendChild(
      tabla(
        'Resultados por módulo',
        ['Módulo', 'Aciertos', '%', 'Puntaje', 'Nivel'],
        d.resultados.modulos.map((m) => [
          m.modulo_nombre,
          `${m.aciertos} / ${m.total}`,
          `${m.porcentaje} %`,
          String(m.puntaje),
          m.nivel,
        ])
      )
    );

    seccion.appendChild(
      tabla(
        'Desempeño por competencia',
        ['Módulo', 'Competencia', 'Aciertos', '%', 'Prioridad'],
        d.analisis.por_competencia.map((c) => [
          c.modulo_nombre,
          c.competencia,
          `${c.aciertos} / ${c.total}`,
          `${c.porcentaje} %`,
          NOMBRE_PRIORIDAD[c.prioridad] || c.prioridad,
        ])
      )
    );

    seccion.appendChild(
      tabla(
        'Desempeño por tema',
        ['Módulo', 'Tema', 'Aciertos', '%', 'Prioridad'],
        d.analisis.por_tema.map((t) => [
          t.modulo_nombre,
          t.tema.replace(/_/g, ' '),
          `${t.aciertos} / ${t.total}`,
          `${t.porcentaje} %`,
          NOMBRE_PRIORIDAD[t.prioridad] || t.prioridad,
        ])
      )
    );

    const tiempo = document.createElement('p');
    tiempo.className = 'rev-nota';
    tiempo.textContent = d.analisis.gestion_tiempo;
    seccion.appendChild(tiempo);

    detalle.appendChild(seccion);
    seccion.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    mostrarAviso(aviso, e.message);
  }
}

function tabla(titulo, encabezados, filas) {
  const cont = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = titulo;
  h.style.marginTop = '1.2rem';
  cont.appendChild(h);

  const t = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const e of encabezados) {
    const th = document.createElement('th');
    th.textContent = e;
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  const tbody = document.createElement('tbody');
  for (const fila of filas) {
    const tr = document.createElement('tr');
    for (const valor of fila) tr.appendChild(celda(valor));
    tbody.appendChild(tr);
  }
  t.append(thead, tbody);

  const envoltorio = document.createElement('div');
  envoltorio.className = 'tabla-scroll';
  envoltorio.appendChild(t);
  cont.appendChild(envoltorio);
  return cont;
}

// ---------- carga ----------

async function cargarIntentos() {
  const ruta =
    filtroUsuario === 'todos'
      ? '/api/admin/intentos'
      : `/api/admin/intentos?usuario=${encodeURIComponent(filtroUsuario)}`;
  const datos = await api(ruta);
  pintarFiltros();
  pintarIntentos(datos.intentos);
}

async function cargar() {
  const me = await exigirSesion();
  document.getElementById('saludo').textContent = me.usuario.nombre || me.usuario.usuario;

  try {
    const [resumen, listaUsuarios] = await Promise.all([
      api('/api/admin/resumen'),
      api('/api/admin/usuarios'),
    ]);
    usuarios = listaUsuarios.usuarios;

    pintarResumen(resumen);
    pintarUsuarios();
    await cargarIntentos();
    contenido.classList.remove('oculto');
  } catch (e) {
    if (e.codigo === 'NO_AUTORIZADO') {
      mostrarAviso(aviso, 'Esta sección es solo para administradores.', 'alerta');
      return;
    }
    if (e.codigo === 'REVISION_BLOQUEADA') {
      mostrarAviso(
        aviso,
        `${e.message} El panel muestra respuestas correctas, por eso se bloquea igual que tu propia revisión.`,
        'alerta'
      );
      return;
    }
    mostrarAviso(aviso, e.message);
  }
}

cargar();
