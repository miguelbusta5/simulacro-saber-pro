# Formato del banco de preguntas

Los bancos viven en `data/banco/<version>/`, un subdirectorio por versión (`v1`, `v2`,
`v2.1`, `enf_v1`, …). El `seed` deduce la versión del nombre del directorio, así que un archivo
no declara a qué versión pertenece: lo dice dónde está guardado. Cada versión pertenece a una
prueba —el simulacro Saber Pro o la prueba de enfermería—, y eso lo declara
`server/exam/blueprint.js`.

Cada archivo corresponde a un módulo de esa versión y tiene esta forma:

```json
{
  "modulo": "lectura_critica",
  "contextos": [
    {
      "id": "lc_ctx_01",
      "titulo": "El sueño no es tiempo perdido",
      "contenido": "Texto completo. Los saltos de línea se escriben con \n.",
      "fuente": "Texto elaborado para el simulacro.",
      "imagen": "/img/ecg/fibrilacion-auricular.svg",
      "imagen_alt": "Qué se ve en la imagen, para quien use lector de pantalla."
    }
  ],
  "preguntas": [
    {
      "id": "lc_001",
      "competencia": "literal",
      "tema": "texto_continuo",
      "dificultad": 2,
      "contexto_id": "lc_ctx_01",
      "enunciado": "De acuerdo con el texto, ...",
      "opciones": [
        { "clave": "A", "texto": "..." },
        { "clave": "B", "texto": "..." },
        { "clave": "C", "texto": "..." },
        { "clave": "D", "texto": "..." }
      ],
      "correcta": "B",
      "justificacion": "Por qué B es la respuesta correcta.",
      "justificaciones_incorrectas": {
        "A": "Por qué falla A.",
        "C": "Por qué falla C.",
        "D": "Por qué falla D."
      }
    }
  ]
}
```

## Reglas

- `id` es único en todo el banco. `npm run seed` hace *upsert* por `id`, así que
  reimportar el mismo archivo actualiza la pregunta en lugar de duplicarla.
- `contexto_id` es opcional (`null` para preguntas sueltas). Las preguntas que
  comparten contexto aparecen siempre juntas en el cuadernillo.
- `imagen` e `imagen_alt` son opcionales y van juntos: si declaras una imagen,
  el `seed` exige que el archivo exista dentro de `public/` y que traiga su
  descripción. La ruta es absoluta desde la raíz del sitio (`/img/…`). Los
  trazados de electrocardiograma y las curvas de presión los genera
  `scripts/generar-imagenes.js`, que además escribe
  `public/img/descripciones.json` con el texto alternativo de cada uno, para
  copiarlo aquí sin reescribirlo.
- Ni el rótulo dibujado en la imagen ni `imagen_alt` deben nombrar el
  diagnóstico cuando la pregunta consiste en reconocerlo: describen lo que se ve
  (ondas, intervalos, desniveles), no la conclusión.
- `modulo` se toma del archivo; no se repite en cada pregunta.
- `competencia` debe ser una de las claves declaradas para ese módulo en
  `server/exam/blueprint.js`. El blueprint define cuántas preguntas de cada
  competencia entran en un simulacro, así que el banco necesita **al menos** esa
  cantidad de cada una.
- `tema` es libre pero conviene usar las claves de `data/estudio.json` →
  `temas`, porque de ahí sale la descripción que ve el estudiante en el análisis.
- `dificultad`: 1 fácil, 2 media, 3 difícil. Hoy es informativa.
- `opciones` son siempre cuatro, con claves `A`–`D`, igual que en la prueba real.
- `justificaciones_incorrectas` debe explicar cada distractor. Es lo que se
  muestra en la pantalla de revisión cuando el estudiante marcó esa opción.

## Competencias válidas por módulo

| Módulo | Competencias |
|---|---|
| `lectura_critica` | `literal`, `articulacion`, `reflexion` |
| `razonamiento_cuantitativo` | `interpretacion`, `formulacion`, `argumentacion` |
| `competencias_ciudadanas` | `conocimientos`, `argumentacion`, `multiperspectivismo`, `pensamiento_sistemico` |
| `comunicacion_escrita` | `planteamiento`, `organizacion`, `uso_lenguaje` |
| `ingles` | `part1` … `part7` |
| `cardiologia` | `valoracion`, `intervencion`, `fundamentacion` |
| `electrocardiografia` | `reconocimiento`, `interpretacion_clinica`, `conducta` |
| `hemodinamia` | `monitoria_invasiva`, `procedimientos`, `cuidado_post` |
| `neurologia` | `clasificacion`, `valoracion_neuro`, `manejo_neuro` |
| `urgencias_metabolicas` | `diagnostico_metabolico`, `manejo_hidroelectrolitico`, `complicaciones` |
| `pediatria` | `convulsion_febril`, `epilepsia`, `educacion_familiar` |

Cada versión declara en `blueprint.js` qué módulos incluye: la V1 no tiene Comunicación escrita,
así que un archivo de ese módulo dentro de `data/banco/v1/` sería rechazado por el validador. Lo
mismo vale entre pruebas: un archivo de `cardiologia` dentro de `data/banco/v2.1/` no pasa.

## Ampliar el banco

1. Agrega preguntas nuevas al archivo del módulo, dentro del directorio de su versión,
   respetando el formato. Los `id` deben ser únicos **entre todas las versiones**: por eso los de
   la V2 llevan el prefijo `lc2_`, `rc2_`, `cc2_`, `ce2_` y `en2_`; los de la V2.1, `lc21_`,
   `rc21_`, `cc21_`, `ce21_` y `en21_`; y los de enfermería, `card_`, `ecg_`, `hemo_`,
   `neuro_`, `meta_` y `ped_`.
2. Ejecuta `npm run seed`. El script valida claves, competencias, que la
   respuesta correcta exista entre las opciones y que los `id` no choquen entre
   archivos; si algo falla, no escribe nada.
3. `npm run seed` imprime al final el conteo por módulo y competencia frente a lo que exige el
   blueprint **de cada versión**, y señala cuáles son las activas (una por prueba). Solo las
   versiones activas necesitan cobertura completa: las anteriores quedan como historial.
