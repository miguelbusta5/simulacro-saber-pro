const aviso = document.getElementById('aviso');
const avisoHistorial = document.getElementById('aviso-historial');
const tarjetaActivo = document.getElementById('tarjeta-activo');
const tarjetaNuevo = document.getElementById('tarjeta-nuevo');
const menuPruebas = document.getElementById('menu-pruebas');
const btnContinuar = document.getElementById('btn-continuar');
const elRestante = document.getElementById('restante');
const tbody = document.getElementById('historial');

let intervaloReloj = null;

document.getElementById('btn-salir').addEventListener('click', cerrarSesion);
document.getElementById('btn-admin').addEventListener('click', () => {
  location.href = '/admin.html';
});

btnContinuar.addEventListener('click', () => {
  location.href = '/examen.html';
});

async function iniciar(pruebaId, boton) {
  ocultarAviso(aviso);
  for (const b of menuPruebas.querySelectorAll('button')) b.disabled = true;
  try {
    await api('/api/intentos', { method: 'POST', body: { prueba: pruebaId } });
    location.href = '/examen.html';
  } catch (e) {
    mostrarAviso(aviso, e.message);
    for (const b of menuPruebas.querySelectorAll('button')) b.disabled = false;
    boton.focus();
    if (e.codigo === 'INTENTO_EN_CURSO') cargar();
  }
}

function duracionLegible(minutos) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${resto} min`;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

// Una tarjeta por prueba: es el menú desde el que se elige qué presentar.
function tarjetaPrueba(p) {
  const art = document.createElement('article');
  art.className = 'tarjeta prueba';

  const h = document.createElement('h3');
  h.textContent = p.nombre;
  art.appendChild(h);

  const desc = document.createElement('p');
  desc.textContent = p.descripcion;
  art.appendChild(desc);

  const ficha = document.createElement('p');
  ficha.className = 'silencio';
  ficha.textContent =
    `${p.version_nombre} · ${p.total_preguntas} preguntas · ${duracionLegible(p.duracion_minutos)}`;
  art.appendChild(ficha);

  const ul = document.createElement('ul');
  ul.className = 'lista-limpia modulos-prueba';
  for (const m of p.modulos) {
    const li = document.createElement('li');
    li.textContent = `${m.nombre} (${m.preguntas})`;
    ul.appendChild(li);
  }
  art.appendChild(ul);

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-primario';
  boton.textContent = 'Iniciar';

  if (p.banco_incompleto.length) {
    boton.disabled = true;
    const nota = document.createElement('p');
    nota.className = 'aviso aviso-alerta';
    nota.textContent =
      'El banco de preguntas de esta prueba está incompleto. Ejecuta "npm run seed" antes de presentarla.';
    art.appendChild(nota);
  } else {
    boton.addEventListener('click', () => iniciar(p.id, boton));
  }
  art.appendChild(boton);

  return art;
}

function pintarReloj(segundos) {
  clearInterval(intervaloReloj);
  let restante = segundos;
  const tick = () => {
    elRestante.textContent = formatearDuracion(restante);
    if (restante <= 0) {
      clearInterval(intervaloReloj);
      location.reload();
    }
    restante -= 1;
  };
  tick();
  intervaloReloj = setInterval(tick, 1000);
}

function filaHistorial(i, bloqueada) {
  const tr = document.createElement('tr');

  const enCurso = i.estado === 'en_curso';
  const estado = enCurso
    ? 'En curso'
    : i.motivo_cierre === 'tiempo_agotado'
      ? 'Finalizado (tiempo agotado)'
      : 'Finalizado';

  const celdas = [
    enCurso ? formatearFecha(i.iniciado_en) : formatearFecha(i.finalizado_en),
    i.prueba_nombre || i.prueba || '',
    i.version_nombre || i.version,
    estado,
    enCurso ? '—' : `${i.aciertos ?? 0} / ${i.total ?? 0}`,
    enCurso ? '—' : String(i.puntaje_global ?? 0),
  ];
  for (const texto of celdas) {
    const td = document.createElement('td');
    td.textContent = texto;
    tr.appendChild(td);
  }

  const td = document.createElement('td');
  if (enCurso) {
    const b = document.createElement('button');
    b.textContent = 'Continuar';
    b.className = 'btn-primario';
    b.addEventListener('click', () => { location.href = '/examen.html'; });
    td.appendChild(b);
  } else if (bloqueada) {
    td.innerHTML = '<span class="silencio">Bloqueado</span>';
  } else {
    const b = document.createElement('button');
    b.textContent = 'Ver resultados';
    b.addEventListener('click', () => {
      location.href = `/resultados.html?intento=${i.id}`;
    });
    td.appendChild(b);
  }
  tr.appendChild(td);

  return tr;
}

async function cargar() {
  const [me, blueprint, historial] = await Promise.all([
    exigirSesion(),
    api('/api/blueprint'),
    api('/api/intentos'),
  ]);

  document.getElementById('saludo').textContent = me.usuario.nombre || me.usuario.usuario;
  // El servidor verifica el rol en cada petición; esto solo muestra el enlace.
  document.getElementById('btn-admin').classList.toggle('oculto', me.usuario.rol !== 'admin');

  menuPruebas.replaceChildren();
  for (const p of blueprint.pruebas) menuPruebas.appendChild(tarjetaPrueba(p));

  if (blueprint.pruebas.every((p) => p.banco_incompleto.length)) {
    mostrarAviso(
      aviso,
      'El banco de preguntas está incompleto. Ejecuta "npm run seed" antes de iniciar una prueba.',
      'alerta'
    );
  }

  const activo = me.intento_activo;
  tarjetaActivo.hidden = !activo;
  tarjetaNuevo.hidden = !!activo;
  if (activo) {
    pintarReloj(activo.segundos_restantes);
  } else {
    clearInterval(intervaloReloj);
  }

  if (historial.revision_bloqueada) {
    mostrarAviso(
      avisoHistorial,
      'No puedes ver resultados ni respuestas mientras tengas una prueba en curso.',
      'alerta'
    );
  } else {
    ocultarAviso(avisoHistorial);
  }

  tbody.replaceChildren();
  if (!historial.intentos.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7" class="silencio">Todavía no has presentado ninguna prueba.</td>';
    tbody.appendChild(tr);
  } else {
    for (const i of historial.intentos) {
      tbody.appendChild(filaHistorial(i, historial.revision_bloqueada));
    }
  }
}

cargar().catch((e) => mostrarAviso(aviso, e.message));
