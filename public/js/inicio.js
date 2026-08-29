const aviso = document.getElementById('aviso');
const avisoHistorial = document.getElementById('aviso-historial');
const tarjetaActivo = document.getElementById('tarjeta-activo');
const tarjetaNuevo = document.getElementById('tarjeta-nuevo');
const btnIniciar = document.getElementById('btn-iniciar');
const btnContinuar = document.getElementById('btn-continuar');
const elRestante = document.getElementById('restante');
const tbody = document.getElementById('historial');

let intervaloReloj = null;

document.getElementById('btn-salir').addEventListener('click', cerrarSesion);

btnContinuar.addEventListener('click', () => {
  location.href = '/examen.html';
});

btnIniciar.addEventListener('click', async () => {
  ocultarAviso(aviso);
  btnIniciar.disabled = true;
  try {
    await api('/api/intentos', { method: 'POST' });
    location.href = '/examen.html';
  } catch (e) {
    mostrarAviso(aviso, e.message);
    btnIniciar.disabled = false;
    if (e.codigo === 'INTENTO_EN_CURSO') cargar();
  }
});

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
    formatearFecha(i.iniciado_en),
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

  const horas = Math.floor(blueprint.duracion_minutos / 60);
  const minutos = blueprint.duracion_minutos % 60;
  const detalle = blueprint.modulos.map((m) => `${m.nombre} (${m.preguntas})`).join(', ');
  document.getElementById('descripcion-prueba').textContent =
    `${blueprint.total_preguntas} preguntas en ${horas} h ${minutos} min: ${detalle}.`;

  if (blueprint.banco_incompleto.length) {
    mostrarAviso(
      aviso,
      'El banco de preguntas está incompleto. Ejecuta "npm run seed" antes de iniciar un simulacro.',
      'alerta'
    );
    btnIniciar.disabled = true;
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
      'No puedes ver resultados ni respuestas mientras tengas un simulacro en curso.',
      'alerta'
    );
  } else {
    ocultarAviso(avisoHistorial);
  }

  tbody.replaceChildren();
  if (!historial.intentos.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="silencio">Todavía no has presentado ningún simulacro.</td>';
    tbody.appendChild(tr);
  } else {
    for (const i of historial.intentos) {
      tbody.appendChild(filaHistorial(i, historial.revision_bloqueada));
    }
  }
}

cargar().catch((e) => mostrarAviso(aviso, e.message));
