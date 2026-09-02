# Formato del banco de preguntas

Los bancos viven en `data/banco/<version>/`, un subdirectorio por versión de la prueba
(`v1`, `v2`, …). El `seed` deduce la versión del nombre del directorio, así que un archivo no
declara a qué versión pertenece: lo dice dónde está guardado.

Cada archivo corresponde a un módulo de esa versión y tiene esta forma:

```json
{
  "modulo": "lectura_critica",
  "contextos": [
    {
      "id": "lc_ctx_01",
      "titulo": "El sueño no es tiempo perdido",
      "contenido": "Texto completo. Los saltos de línea se escriben con \n.",
      "fuente": "Texto elaborado para el simulacro."
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

Cada versión declara en `blueprint.js` qué módulos incluye: la V1 no tiene Comunicación escrita,
así que un archivo de ese módulo dentro de `data/banco/v1/` sería rechazado por el validador.

## Ampliar el banco

1. Agrega preguntas nuevas al archivo del módulo, dentro del directorio de su versión,
   respetando el formato. Los `id` deben ser únicos **entre todas las versiones**: por eso los de
   la V2 llevan el prefijo `lc2_`, `rc2_`, `cc2_`, `ce2_` y `en2_`.
2. Ejecuta `npm run seed`. El script valida claves, competencias, que la
   respuesta correcta exista entre las opciones y que los `id` no choquen entre
   archivos; si algo falla, no escribe nada.
3. `npm run seed` imprime al final el conteo por módulo y competencia frente a lo que exige el
   blueprint **de cada versión**, y señala cuál es la activa. Solo la versión activa necesita
   cobertura completa: las anteriores quedan como historial.
