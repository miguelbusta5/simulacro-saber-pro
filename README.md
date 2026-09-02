# Simulacro Saber Pro

Aplicación web para presentar simulacros de las **competencias genéricas de selección
múltiple** del Saber Pro (ICFES), con cronómetro controlado por el servidor, resultado por
módulo, revisión de respuestas y análisis de qué estudiar.

Node + Express + Postgres. El frontend es HTML, CSS y JavaScript sin paso de build.

## Puesta en marcha

**1. Crea la base de datos.** Sirve cualquier Postgres; la app no depende de ningún proveedor.

- **[Neon](https://neon.tech)** — recomendado: el proyecto despierta solo tras la inactividad.
  Copia la *Connection string* del panel, o deja que el CLI escriba el `.env` por ti:
  `npx neon@latest auth` y luego `npx neon@latest env pull`.
- **[Supabase](https://supabase.com)** — *Project Settings → Database → Connection string → URI*.
  Usa la del **Session pooler**, no la *Direct connection*: esa última solo responde por IPv6 y
  falla desde Render.

En ambos casos reemplaza el marcador por la contraseña real de la base de datos.

**2. Configura el proyecto.** Copia `.env.example` como `.env` y pega ahí tu URI en
`DATABASE_URL`. Ese archivo está en `.gitignore` y nunca se sube al repositorio.

```bash
npm install
```

**3. Comprueba la conexión.**

```bash
npm run conexion
```

Si algo está mal, este comando dice exactamente qué: contraseña sin reemplazar, host incorrecto,
proyecto pausado o la cadena de Supabase equivocada.

**4. Crea las tablas y carga el banco de preguntas.**

```bash
npm run seed
```

**5. Levanta la aplicación.**

```bash
npm start
```

Abre <http://localhost:3000>, crea una cuenta y empieza.

Para verificar que todo funciona de extremo a extremo:

```bash
npm run smoke
```

La prueba crea un esquema temporal en la misma base, corre el flujo completo y lo borra al
terminar. Nunca toca tus datos reales.

Fijar ese esquema es una operación de sesión, y las conexiones agrupadas no las admiten (en
Neon, el host con sufijo `-pooler`; en Supabase, el *transaction pooler*). Si tu `.env` define
`DATABASE_URL_UNPOOLED`, la prueba la usa automáticamente. La aplicación en producción sí debe
usar la agrupada.

## Despliegue en Render

GitHub guarda el código y dispara el despliegue, pero no ejecuta la app: GitHub Pages solo sirve
archivos estáticos y aquí hace falta un proceso Node y una base de datos.

En Render: *New → Blueprint*, conecta este repositorio (lee `render.yaml`) y en *Environment*
agrega la variable `DATABASE_URL` con la misma URI del paso 1 (la agrupada, la del host con
`-pooler`).

Un detalle fácil de pasar por alto: `neon env pull` escribe los valores **entre comillas** en el
`.env`. Node las quita al leer el archivo, pero el panel de Render guarda lo que pegues tal cual,
así que copia el valor **sin las comillas** o la conexión fallará.

`render.yaml` fija la región en **ohio**, que es la más cercana a la región `us-east-2` de la
base. Si creas tu base en otra región, cambia esa línea: cada consulta cruza esa distancia y con
160 preguntas por simulacro la diferencia se nota. El plan gratuito basta, porque los
datos viven en el Postgres administrado y no en el disco del servidor.

Cada despliegue ejecuta `npm run seed`, así que los cambios que hagas al banco de preguntas
llegan solos a producción. Como la carga es un *upsert* por `id`, no se duplica nada.

Ten en cuenta que el servicio gratuito de Render se duerme tras un rato sin tráfico y la
primera petición después tarda unos segundos.

## Cómo está armada la prueba

Una sesión de **4 h 30 min** con **195 preguntas**, con navegación libre entre módulos:

| Módulo | Preguntas |
|---|---|
| Lectura crítica | 35 |
| Razonamiento cuantitativo | 35 |
| Competencias ciudadanas | 35 |
| Comunicación escrita | 35 |
| Inglés | 55 |

Cada simulacro se arma respetando la cobertura por competencia definida en
[blueprint.js](server/exam/blueprint.js), y prioriza preguntas que ese usuario no ha visto antes.
El banco de la versión activa tiene 245 preguntas, así que dos simulacros seguidos no son iguales.

No se incluyen los módulos específicos por programa académico.

### Dos advertencias sobre Comunicación escrita

En el Saber Pro real, Comunicación escrita es **una única pregunta abierta**: un texto que el
estudiante redacta y que califican lectores humanos con rúbrica. Aquí se evalúa en **selección
múltiple**, con preguntas sobre las mismas competencias que el módulo mide —planteamiento,
organización y uso del lenguaje—. Sirve para practicarlas, pero no reproduce el formato oficial,
y la app lo advierte en la pantalla de resultados.

Su número de preguntas (35) y los puntos de corte de sus niveles son una calibración propia,
porque no existe una versión oficial de selección múltiple de ese módulo. Los otros cuatro
módulos conservan sus cifras oficiales exactas.

## Versiones de la prueba

Cada versión declara su propia estructura, porque los intentos ya presentados deben poder
consultarse tal como se presentaron:

| Versión | Módulos | Preguntas | Duración |
|---|---|---|---|
| Versión 1 | 4 (sin Comunicación escrita) | 160 | 4 h 30 min |
| **Versión 2** (activa) | 5 | 195 | 4 h 30 min |

Los simulacros nuevos usan **siempre la versión más reciente**. Las preguntas de la V1 permanecen
en la base porque los intentos antiguos las referencian y su revisión debe seguir funcionando.
La versión se muestra durante todo el examen y queda registrada en el intento y en los resultados.

Para añadir una V3: agrega una entrada a `VERSIONES` en
[blueprint.js](server/exam/blueprint.js) y un directorio `data/banco/v3/`.

## Administración

El rol de administrador se otorga **solo desde el servidor**; ninguna ruta web lo concede:

```bash
npm run admin -- <usuario>
```

Sin argumentos lista los administradores actuales, y con `--quitar` devuelve la cuenta a
estudiante. La cuenta debe estar registrada previamente en la aplicación.

El panel (`/admin.html`) muestra los usuarios con sus pruebas y su mejor puntaje, todas las
pruebas presentadas con versión, fechas y duración, el detalle de cada intento con su diagnóstico
por competencia y tema, y promedios por módulo y versión.

El panel se bloquea si el propio administrador tiene un simulacro en curso: el diagnóstico
incluye respuestas correctas y todos los estudiantes comparten banco, así que podría leer ahí
preguntas que tiene delante. Es la misma regla que gobierna la revisión propia.

## Las dos reglas de bloqueo

1. **Un solo simulacro a la vez por usuario.** Lo garantiza un índice único parcial en la base
   de datos, no solo una validación de la aplicación.
2. **No se pueden ver respuestas, resultados ni análisis mientras haya un simulacro en curso.**
   El servidor responde `409 REVISION_BLOQUEADA` en `/revision`, `/resultados` y `/analisis`.

## El cronómetro

El plazo (`vence_en`) se fija en el servidor al crear el intento. En cada petición autenticada
se cierran los intentos vencidos, de modo que:

- cerrar el navegador o recargar no regala tiempo;
- al agotarse el plazo la prueba se entrega y se califica sola;
- el contador del navegador es solo visual y se resincroniza con el servidor cada 30 segundos.

## Calificación

Los aciertos se convierten a la escala ICFES 0–300 mediante una interpolación lineal por tramos
anclada en las fronteras de los niveles de desempeño, y se asigna el nivel con los puntos de
corte oficiales de cada módulo (ver [scoring.js](server/exam/scoring.js)).

**Es una aproximación.** El examen oficial califica con Teoría de Respuesta al Ítem, cuyos
parámetros no son públicos. El puntaje sirve para medir progreso entre simulacros, no para
predecir el puntaje real. La app lo advierte en la pantalla de resultados.

## Análisis de qué estudiar

Al terminar, las respuestas se agrupan por competencia y por tema. Cada grupo con al menos tres
preguntas recibe una prioridad (alta &lt;50 %, media 50–69 %, consolidado ≥70 %) y las
competencias débiles se acompañan de qué mide esa competencia, qué temas estudiar y cómo
practicarlos; ese contenido está curado en [data/estudio.json](data/estudio.json). También se
reporta cuántas preguntas quedaron en blanco, como señal de gestión del tiempo.

## Ampliar el banco de preguntas

El formato está documentado en [data/schema-pregunta.md](data/schema-pregunta.md). Agrega
preguntas al archivo del módulo dentro de `data/banco/<version>/` y vuelve a ejecutar
`npm run seed`: el script deduce la versión del directorio, valida que los `id` no se repitan
entre versiones y que las competencias existan en el blueprint de esa versión, y al final imprime
la cobertura por versión señalando cuál es la activa.

## Estructura

```
server/
  index.js            servidor Express
  db.js               pool de Postgres, esquema y helpers de consulta
  auth.js             scrypt + sesiones en cookie
  routes/             auth.js, intentos.js, admin.js, middleware.js
  exam/               blueprint, selección, calificación, análisis, lógica de intentos
data/banco/<version>/ banco de preguntas por versión y módulo
data/estudio.json     recomendaciones de estudio por competencia y tema
public/               interfaz (HTML + CSS + JS sin build)
scripts/              verificar-conexion.js, seed.js, admin.js, smoke.js
render.yaml           configuración de despliegue
```

## Seguridad

- Las contraseñas se guardan con `scrypt` y sal por usuario; nunca en texto plano.
- Las sesiones son cookies `HttpOnly` con `SameSite=Lax`, y `Secure` en producción.
- El navegador **nunca** recibe la respuesta correcta de una pregunta que esté en curso: el
  cuadernillo se arma en el servidor sin esos campos. Por eso la app habla con Postgres
  únicamente a través del Express, y no expone la base directamente al cliente.
- `.env` está en `.gitignore`. La `DATABASE_URL` se configura como variable de entorno en el
  proveedor de hosting, nunca dentro del repositorio.
- La conexión a Postgres **valida el certificado del servidor**. Por ahí viajan hashes de
  contraseñas, tokens de sesión y las respuestas correctas del examen, así que no se acepta un
  certificado cualquiera. Neon y Supabase usan una CA pública y funciona sin configuración. Solo
  si conectas a un Postgres propio con certificado autofirmado, agrega `PG_SSL_SIN_VERIFICAR=1`
  al `.env`.
