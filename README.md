# Simulacros y pruebas

Aplicación web para presentar pruebas de selección múltiple con cronómetro controlado por el
servidor, resultado por módulo, revisión de respuestas y análisis de qué estudiar. Al entrar, el
estudiante elige en un menú cuál presentar:

| Prueba | De qué es | Preguntas | Duración |
|---|---|---|---|
| **Simulacro Saber Pro** | Competencias genéricas de selección múltiple del ICFES | 195 | 4 h 30 min |
| **Prueba de enfermería** | Cardiología, electrocardiografía con imágenes, hemodinamia, ACV y edema cerebral, cetoacidosis y pediatría | 64 | 1 h 40 min |

Las dos comparten el motor: cronómetro en el servidor, una sola prueba en curso por usuario,
revisión bloqueada mientras haya una corriendo y diagnóstico por competencia al terminar. Lo que
cambia entre ellas es el banco de preguntas, la estructura de módulos y la escala de
calificación.

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

## Cómo está armado el simulacro Saber Pro

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
El banco de la versión activa tiene 269 preguntas, así que dos simulacros seguidos no son iguales.

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

## Cómo está armada la prueba de enfermería

No es una prueba del ICFES ni tiene equivalente oficial: es un banco propio de enfermería en
cuidado cardiovascular y crítico. Una sesión de **1 h 40 min** con **64 preguntas**:

| Módulo | Preguntas | Qué cubre |
|---|---|---|
| Cardiología clínica | 12 | Síndrome coronario agudo, falla cardiaca, edema agudo de pulmón, arritmias, farmacología |
| Electrocardiografía | 12 | Trazados de patologías, con imagen: infarto con y sin elevación del ST, fibrilación y flúter auricular, taquicardia y fibrilación ventricular, bloqueos AV y de rama, hiperpotasemia, pericarditis |
| Hemodinamia y monitoría invasiva | 12 | Funciones y cuidados de la línea arterial, curvas de presión, cateterismo, angioplastia y stent |
| Neurología: ACV y edema cerebral | 12 | Tipos de ACV, tipos de edema cerebral, valoración neurológica, manejo neurocrítico |
| Urgencias metabólicas | 8 | Cetoacidosis diabética: criterios, anión gap, secuencia de tratamiento y complicaciones |
| Pediatría | 8 | Convulsión febril simple y compleja, epilepsia y estado epiléptico, educación a la familia |

Se califica en **porcentaje de acierto**, con cuatro niveles propios (insuficiente, aceptable,
bueno y sobresaliente), porque no existe una escala publicada que replicar. La app lo advierte en
la pantalla de resultados.

### Los trazados

Las preguntas de electrocardiografía y de línea arterial vienen con imagen. Los trazados no son
fotografías de pacientes ni imágenes de terceros: los **dibuja por código**
[scripts/generar-imagenes.js](scripts/generar-imagenes.js) a partir de una descripción de la onda
—amplitud de la P, ancho del QRS, desnivel del ST, frecuencia— y los escribe como SVG en
`public/img/`. Corregir un trazado es cambiar un parámetro y volver a ejecutar:

```bash
node scripts/generar-imagenes.js
```

La salida está versionada en el repositorio, así que el despliegue no necesita ejecutarlo. El
rótulo de la imagen y su texto alternativo no nombran el diagnóstico: la pregunta suele ser
justamente reconocerlo. Durante el examen la descripción viaja solo como `alt`, para lectores de
pantalla; en la revisión, cuando ya se muestra la respuesta, se imprime también como pie.

## Versiones de cada prueba

Cada versión declara su propia estructura, porque los intentos ya presentados deben poder
consultarse tal como se presentaron:

| Prueba | Versión | Módulos | Preguntas | Duración |
|---|---|---|---|---|
| Saber Pro | Versión 1 | 4 (sin Comunicación escrita) | 160 | 4 h 30 min |
| Saber Pro | Versión 2 | 5 | 195 | 4 h 30 min |
| Saber Pro | **Versión 2.1** (activa) | 5 | 195 | 4 h 30 min |
| Enfermería | **Versión 1** (activa) | 6 | 64 | 1 h 40 min |

La **Versión 2.1** conserva la estructura de la 2 y cambia los textos: lectura crítica,
competencias ciudadanas, comunicación escrita e inglés traen lecturas mucho más extensas —hasta
6.500 caracteres en lectura crítica— y preguntas nuevas sobre ese material añadido, para que la
lectura larga se practique como en la prueba real.

Las pruebas nuevas usan **siempre la versión más reciente de su prueba**. Las preguntas de las
versiones anteriores permanecen en la base porque los intentos antiguos las referencian y su
revisión debe seguir funcionando. La versión se muestra durante todo el examen y queda registrada
en el intento y en los resultados.

Para añadir una versión: agrega una entrada a `VERSIONES` en
[blueprint.js](server/exam/blueprint.js), con el `id` de su prueba, y un directorio
`data/banco/<version>/`. Para añadir una prueba nueva: agrega también una entrada a `PRUEBAS`,
con la escala en que se califica, y sus módulos.

## Administración

El rol de administrador se otorga **solo desde el servidor**; ninguna ruta web lo concede:

```bash
npm run admin -- <usuario>
```

Sin argumentos lista los administradores actuales, y con `--quitar` devuelve la cuenta a
estudiante. La cuenta debe estar registrada previamente en la aplicación.

El panel (`/admin.html`) muestra los usuarios con su mejor puntaje en cada prueba —las escalas
no son comparables entre sí, así que no se mezclan en una sola cifra—, todas las pruebas
presentadas con su prueba, versión, fechas y duración, el detalle de cada intento con su
diagnóstico por competencia y tema, y promedios por módulo y versión.

El panel se bloquea si el propio administrador tiene un simulacro en curso: el diagnóstico
incluye respuestas correctas y todos los estudiantes comparten banco, así que podría leer ahí
preguntas que tiene delante. Es la misma regla que gobierna la revisión propia.

## Las dos reglas de bloqueo

Valen para cualquiera de las dos pruebas: no se pueden tener a la vez un simulacro del Saber Pro y
una prueba de enfermería.

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

Cada prueba declara su escala en [blueprint.js](server/exam/blueprint.js) y
[scoring.js](server/exam/scoring.js) la aplica.

En el **simulacro Saber Pro** los aciertos se convierten a la escala ICFES 0–300 mediante una
interpolación lineal por tramos anclada en las fronteras de los niveles de desempeño, y se asigna
el nivel con los puntos de corte oficiales de cada módulo.

En la **prueba de enfermería** el puntaje es el porcentaje de acierto de cada módulo, con cuatro
niveles propios: insuficiente (menos de 60 %), aceptable (60–74 %), bueno (75–89 %) y
sobresaliente (90 % o más).

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
entre versiones, que las competencias existan en el blueprint de esa versión y que las imágenes
que declares existan en `public/` y traigan su descripción, y al final imprime la cobertura por
versión señalando cuáles son las activas (una por prueba).

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
public/img/           trazados de ECG y curvas de presión, en SVG
scripts/              verificar-conexion.js, seed.js, admin.js, smoke.js,
                      generar-imagenes.js
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
