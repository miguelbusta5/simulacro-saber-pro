'use strict';

// Genera los trazados que acompañan a las preguntas de la prueba de enfermería:
// electrocardiogramas y curvas de presión arterial invasiva.
//
// Son SVG dibujados por código, no fotografías de pacientes: así el repositorio
// no depende de imágenes con derechos de terceros, el trazado se puede corregir
// cambiando un parámetro y el archivo pesa unos pocos kilobytes. La salida se
// versiona en public/img/, de modo que el despliegue no necesita ejecutar este
// script; se vuelve a correr solo cuando haya que cambiar un trazado.
//
//   node scripts/generar-imagenes.js

const fs = require('node:fs');
const path = require('node:path');

const SALIDA = path.join(__dirname, '..', 'public', 'img');

// ---------- papel milimetrado ----------

const PX_MM = 4; // 1 mm de papel = 4 px
const SEG_MM = 25; // velocidad estándar: 25 mm/s
const MV_MM = 10; // calibración estándar: 10 mm/mV
const SEGUNDOS = 6;
const ALTO_MM = 34;

const ANCHO = SEGUNDOS * SEG_MM * PX_MM;
const ALTO = ALTO_MM * PX_MM;
const LINEA_BASE = ALTO / 2;

// La cuadrícula se dibuja con dos patrones repetidos —el milímetro y el cuadro
// grande de 5 mm— en lugar de con cientos de líneas: el archivo pasa de decenas
// de kilobytes a poco más de uno.
function rejilla() {
  const chico = PX_MM;
  const grande = PX_MM * 5;
  return `<defs>
  <pattern id="mm" width="${chico}" height="${chico}" patternUnits="userSpaceOnUse">
    <path d="M ${chico} 0 L 0 0 0 ${chico}" fill="none" class="fina"/>
  </pattern>
  <pattern id="cm" width="${grande}" height="${grande}" patternUnits="userSpaceOnUse">
    <rect width="${grande}" height="${grande}" fill="url(#mm)"/>
    <path d="M ${grande} 0 L 0 0 0 ${grande}" fill="none" class="gruesa"/>
  </pattern>
</defs>
<rect x="0" y="0" width="${ANCHO}" height="${ALTO}" fill="url(#cm)"/>`;
}

// mV -> coordenada y
function y(mv) {
  return LINEA_BASE - mv * MV_MM * PX_MM;
}

// segundos -> coordenada x
function x(t) {
  return t * SEG_MM * PX_MM;
}

// ---------- formas de onda ----------

// Semionda de seno: sirve para P y T, que son deflexiones redondeadas.
function joroba(t, inicio, duracion, amplitud) {
  if (t < inicio || t > inicio + duracion) return 0;
  return amplitud * Math.sin(((t - inicio) / duracion) * Math.PI);
}

// Tramo lineal entre dos puntos, usado para armar el QRS.
function rampa(t, t0, t1, v0, v1) {
  if (t < t0 || t > t1) return 0;
  return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
}

// Complejo QRS estrecho (0,08 s) o ancho (0,14 s), con q, R y S en milivoltios.
function qrs(t, inicio, { ancho = 0.08, q = -0.05, r = 1.1, s = -0.15, muescaR = 0 } = {}) {
  const fin = inicio + ancho;
  if (t < inicio || t > fin) return 0;
  const p = (t - inicio) / ancho; // 0..1 dentro del complejo
  if (p < 0.2) return rampa(p, 0, 0.2, 0, q);
  if (p < 0.45) return rampa(p, 0.2, 0.45, q, r);
  if (muescaR && p < 0.6) return rampa(p, 0.45, 0.6, r, r - muescaR);
  if (muescaR && p < 0.72) return rampa(p, 0.6, 0.72, r - muescaR, r);
  if (p < 0.75) return rampa(p, muescaR ? 0.72 : 0.45, 0.75, r, s);
  return rampa(p, 0.75, 1, s, 0);
}

// Segmento ST: se eleva o se deprime desde el final del QRS hasta la T. `concavo`
// dibuja la elevación de concavidad superior típica de la pericarditis.
function segmentoST(t, finQrs, inicioT, nivel, concavo = false) {
  if (!nivel || t < finQrs || t > inicioT) return 0;
  const p = (t - finQrs) / (inicioT - finQrs);
  return concavo ? nivel * (1 - Math.pow(1 - p, 2)) : nivel;
}

// Un latido completo, devuelto como función del tiempo absoluto.
function latido(inicio, opciones = {}) {
  const {
    p = 0.15, // amplitud de la onda P (0 = ausente)
    pr = 0.16, // intervalo PR en segundos
    anchoQrs = 0.08,
    r = 1.1,
    q = -0.05,
    s = -0.15,
    muescaR = 0,
    st = 0, // desnivel del segmento ST en mV
    stConcavo = false,
    tAmp = 0.3, // amplitud de la onda T
    tAncho = 0.16,
    prDeprimido = 0,
  } = opciones;

  const inicioP = inicio;
  const inicioQrs = inicio + pr;
  const finQrs = inicioQrs + anchoQrs;
  const inicioT = finQrs + 0.1;

  const finT = inicioT + tAncho;

  return (t) => {
    let v = 0;
    if (p) v += joroba(t, inicioP, 0.09, p);
    if (prDeprimido && t > inicioP + 0.09 && t < inicioQrs) v += prDeprimido;
    v += qrs(t, inicioQrs, { ancho: anchoQrs, q, r, s, muescaR });
    // El desnivel del ST no aparece de golpe: sube desde el final del QRS
    // (punto J), se mantiene durante el segmento y se funde con la onda T,
    // que es como se ve en el papel.
    if (st) {
      const subida = 0.02;
      if (t >= finQrs - subida && t < finQrs) v += (st * (t - (finQrs - subida))) / subida;
      else if (t >= finQrs && t <= inicioT) v += segmentoST(t, finQrs, inicioT, st, stConcavo);
      else if (t > inicioT && t <= finT) v += st * (1 - (t - inicioT) / tAncho);
    }
    v += joroba(t, inicioT, tAncho, tAmp);
    return v;
  };
}

// Generador pseudoaleatorio con semilla: el trazado debe ser el mismo en cada
// ejecución, o cada `npm run seed` cambiaría la imagen de una pregunta ya vista.
function azar(semilla) {
  let s = semilla;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function muestrear(fn) {
  const puntos = [];
  const paso = 0.004; // 4 ms
  for (let t = 0; t <= SEGUNDOS; t += paso) {
    puntos.push(`${x(t).toFixed(1)},${y(fn(t)).toFixed(2)}`);
  }
  return puntos.join(' ');
}

// Suma de latidos: cada latido aporta su forma y el resto del tiempo vale 0.
function tira(latidos) {
  return (t) => latidos.reduce((v, f) => v + f(t), 0);
}

// Latidos regulares a `fc` por minuto con las mismas opciones.
function ritmo(fc, opciones = {}, desfase = 0) {
  const intervalo = 60 / fc;
  const latidos = [];
  for (let t = desfase; t < SEGUNDOS; t += intervalo) latidos.push(latido(t, opciones));
  return latidos;
}

// ---------- trazados ----------

const ECG = {
  'ritmo-sinusal-normal': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Tira de ritmo regular a unos 75 complejos por minuto, con una onda P antes de cada QRS estrecho y segmento ST a la altura de la línea de base.',
    onda: () => tira(ritmo(75)),
  },

  'iam-st-elevado-inferior': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Trazado regular a unos 78 por minuto con onda inicial negativa, segmento ST que asciende unos 4 mm desde el punto J y onda T ancha.',
    onda: () => tira(ritmo(78, { st: 0.4, q: -0.25, tAmp: 0.35, tAncho: 0.2 })),
  },

  'iam-anterior-extenso': {
    titulo: 'V3 — 25 mm/s, 10 mm/mV',
    alt: 'Trazado precordial con segmento ST muy elevado que se funde con la onda T en una sola deflexión, sobre complejos de onda R pequeña.',
    onda: () => tira(ritmo(96, { st: 0.6, r: 0.6, q: -0.3, tAmp: 0.5, tAncho: 0.22 })),
  },

  'infradesnivel-st': {
    titulo: 'V5 — 25 mm/s, 10 mm/mV',
    alt: 'Trazado a unos 105 por minuto con el segmento ST descendido unos 2 mm de forma horizontal respecto de la línea de base.',
    onda: () => tira(ritmo(105, { st: -0.2, tAmp: 0.15 })),
  },

  'isquemia-t-invertida': {
    titulo: 'V4 — 25 mm/s, 10 mm/mV',
    alt: 'Trazado con ondas T negativas, simétricas y profundas, con el segmento ST sin desnivel.',
    onda: () => tira(ritmo(80, { tAmp: -0.45, tAncho: 0.2 })),
  },

  'fibrilacion-auricular': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Trazado sin ondas P, con línea de base ondulante y complejos QRS estrechos separados por intervalos irregulares.',
    onda: () => {
      const r = azar(7);
      const latidos = [];
      let t = 0.2;
      while (t < SEGUNDOS) {
        latidos.push(latido(t, { p: 0, pr: 0.02, tAmp: 0.25 }));
        t += 0.42 + r() * 0.52; // intervalos R-R irregulares
      }
      const base = tira(latidos);
      return (x0) => base(x0) + 0.05 * Math.sin(x0 * 58) * Math.sin(x0 * 23);
    },
  },

  'flutter-auricular': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Trazado con ondas auriculares regulares en diente de sierra a unos 300 por minuto y un complejo QRS estrecho por cada dos de esas ondas.',
    onda: () => {
      const base = tira(ritmo(150, { p: 0, pr: 0.02, tAmp: 0.05 }, 0.15));
      // Diente de sierra continuo a 300/min.
      const sierra = (t) => {
        const fase = (t * 5) % 1;
        return -0.18 + 0.28 * fase;
      };
      return (t) => base(t) + sierra(t);
    },
  },

  'taquicardia-supraventricular': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Trazado regular de complejo estrecho a unos 180 por minuto, sin ondas P visibles.',
    onda: () => tira(ritmo(180, { p: 0, pr: 0.04, tAmp: 0.18 })),
  },

  'taquicardia-ventricular': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Trazado regular de complejo ancho a unos 170 por minuto, con complejos de igual morfología y ondas T opuestas al QRS.',
    onda: () =>
      tira(ritmo(170, { p: 0, pr: 0.02, anchoQrs: 0.16, r: 1.3, s: -0.6, tAmp: -0.35, tAncho: 0.12 })),
  },

  'fibrilacion-ventricular': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Trazado caótico, sin complejos identificables, con ondulaciones de amplitud y frecuencia variables.',
    onda: () => {
      const r = azar(23);
      const semillas = Array.from({ length: 60 }, () => [
        0.25 + r() * 0.75,
        6 + r() * 14,
        r() * Math.PI * 2,
      ]);
      return (t) =>
        semillas.reduce((v, [a, f, d]) => v + (a / 12) * Math.sin(t * f + d), 0) *
        (0.9 + 0.3 * Math.sin(t * 1.7));
    },
  },

  'bloqueo-av-completo': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Ondas P regulares a unos 90 por minuto sin relación con complejos QRS anchos, regulares, a unos 38 por minuto.',
    onda: () => {
      const ventricular = tira(ritmo(38, { p: 0, pr: 0.02, anchoQrs: 0.15, r: 0.9, tAmp: -0.2 }, 0.3));
      const auricular = (t) => {
        const intervalo = 60 / 90;
        let v = 0;
        for (let t0 = 0.05; t0 < SEGUNDOS; t0 += intervalo) v += joroba(t, t0, 0.09, 0.16);
        return v;
      };
      return (t) => ventricular(t) + auricular(t);
    },
  },

  'bloqueo-av-mobitz-i': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Ondas P regulares con intervalo PR que se alarga latido a latido hasta que una onda P no conduce y falta un complejo QRS.',
    onda: () => {
      const latidos = [];
      const intervaloP = 0.8;
      const prs = [0.16, 0.24, 0.34, null]; // el cuarto ciclo no conduce
      let i = 0;
      for (let t0 = 0.1; t0 < SEGUNDOS; t0 += intervaloP, i++) {
        const pr = prs[i % prs.length];
        if (pr === null) {
          latidos.push((t) => joroba(t, t0, 0.09, 0.16)); // P aislada
        } else {
          latidos.push(latido(t0, { pr }));
        }
      }
      return tira(latidos);
    },
  },

  'bradicardia-sinusal': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Trazado regular a unos 42 por minuto, con una onda P antes de cada complejo QRS estrecho.',
    onda: () => tira(ritmo(42)),
  },

  'hiperpotasemia': {
    titulo: 'V4 — 25 mm/s, 10 mm/mV',
    alt: 'Ondas T altas, estrechas y picudas, con onda P de muy baja amplitud y complejo QRS algo ensanchado.',
    onda: () => tira(ritmo(72, { p: 0.03, anchoQrs: 0.12, tAmp: 0.95, tAncho: 0.11 })),
  },

  'bloqueo-rama-izquierda': {
    titulo: 'V6 — 25 mm/s, 10 mm/mV',
    alt: 'Complejos QRS de más de 0,12 s con onda R mellada y onda T opuesta a la deflexión principal.',
    onda: () =>
      tira(ritmo(74, { anchoQrs: 0.16, r: 1.15, muescaR: 0.45, q: 0, s: -0.05, tAmp: -0.3 })),
  },

  'pericarditis-aguda': {
    titulo: 'DII — 25 mm/s, 10 mm/mV',
    alt: 'Elevación pequeña del segmento ST con la concavidad hacia arriba, acompañada de descenso del segmento PR.',
    onda: () => tira(ritmo(92, { st: 0.15, stConcavo: true, prDeprimido: -0.06, tAmp: 0.28 })),
  },
};

// ---------- curvas de presión arterial invasiva ----------

const SEG_ART = 6;

function curvaArterial({ sistolica = 120, diastolica = 70, fc = 75, muescaDicrota = true, amortiguacion = 'normal' } = {}) {
  const intervalo = 60 / fc;
  return (t) => {
    const fase = (t % intervalo) / intervalo;
    let p;
    if (fase < 0.12) {
      // Ascenso sistólico rápido.
      p = diastolica + (sistolica - diastolica) * Math.pow(fase / 0.12, 0.7);
    } else if (fase < 0.3) {
      p = sistolica - (sistolica - diastolica) * 0.55 * ((fase - 0.12) / 0.18);
    } else if (fase < 0.36 && muescaDicrota) {
      // Muesca dicrota: cierre de la válvula aórtica.
      const q = (fase - 0.3) / 0.06;
      p = sistolica - (sistolica - diastolica) * (0.55 + 0.1 * Math.sin(q * Math.PI));
    } else {
      const q = (fase - (muescaDicrota ? 0.36 : 0.3)) / (1 - (muescaDicrota ? 0.36 : 0.3));
      p = diastolica + (sistolica - diastolica) * 0.45 * Math.exp(-2.6 * q);
    }
    if (amortiguacion === 'sub') {
      // Subamortiguada: oscilaciones de alta frecuencia sobre la curva real.
      p += 9 * Math.exp(-((fase % 1) * 6)) * Math.sin(fase * 62);
    }
    if (amortiguacion === 'sobre') {
      // Sobreamortiguada: se pierde el pico y la muesca, la curva se redondea.
      p = diastolica + (p - diastolica) * 0.72;
    }
    return p;
  };
}

function svgArterial({ titulo, fn, max = 160, prueba = null }) {
  const ancho = 640;
  const alto = 260;
  const margenIzq = 46;
  const margenInf = 26;
  // El área del trazado empieza bajo el título, para que la escala no lo pise.
  const py = (mmhg) => alto - margenInf - (mmhg / max) * (alto - margenInf - 34);
  const px = (t) => margenIzq + (t / SEG_ART) * (ancho - margenIzq - 10);

  const puntos = [];
  for (let t = 0; t <= SEG_ART; t += 0.004) puntos.push(`${px(t).toFixed(1)},${py(fn(t)).toFixed(1)}`);

  const ejes = [];
  for (let v = 0; v <= max; v += 40) {
    ejes.push(
      `<line x1="${margenIzq}" y1="${py(v)}" x2="${ancho - 10}" y2="${py(v)}" class="rejilla"/>` +
        `<text x="${margenIzq - 8}" y="${py(v) + 4}" class="eje" text-anchor="end">${v}</text>`
    );
  }

  const anotacion = prueba
    ? `<text x="${ancho - 10}" y="16" class="nota" text-anchor="end">${prueba}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" role="img">
<style>
  .fondo { fill: #fff; }
  .rejilla { stroke: #d8dee6; stroke-width: 1; }
  .curva { fill: none; stroke: #b3261e; stroke-width: 2; stroke-linejoin: round; }
  .eje, .titulo, .nota { font: 12px system-ui, sans-serif; fill: #40484f; }
  .titulo { font-weight: 600; }
</style>
<rect class="fondo" x="0" y="0" width="${ancho}" height="${alto}"/>
${ejes.join('\n')}
<line x1="${margenIzq}" y1="30" x2="${margenIzq}" y2="${alto - margenInf}" class="rejilla"/>
<polyline class="curva" points="${puntos.join(' ')}"/>
<text x="${ancho - 10}" y="${alto - 8}" class="eje" text-anchor="end">6 segundos</text>
<text x="8" y="16" class="titulo">${titulo}</text>
${anotacion}
</svg>
`;
}

// Prueba de la onda cuadrada (square wave test): se abre la válvula del sistema
// de lavado y se observa cómo vuelve la curva a la línea de base.
function ondaCuadrada(tipo) {
  const base = curvaArterial({ amortiguacion: tipo === 'normal' ? 'normal' : tipo });
  return (t) => {
    if (t >= 2 && t < 2.6) return 300; // lavado a presión
    if (t >= 2.6 && t < 3.6) {
      const q = (t - 2.6) / 1;
      // Subamortiguado: varias oscilaciones amplias. Sobreamortiguado: regreso
      // lento y sin oscilación. Adecuado: una o dos oscilaciones que se apagan.
      if (tipo === 'sub') return base(t) + 75 * Math.exp(-3.2 * q) * Math.sin(q * 47);
      if (tipo === 'sobre') return base(t) + (300 - base(t)) * Math.exp(-4.5 * q);
      return base(t) + 55 * Math.exp(-9 * q) * Math.sin(q * 30);
    }
    return base(t);
  };
}

const ARTERIALES = {
  'linea-arterial-normal': {
    titulo: 'Presión arterial invasiva (mmHg)',
    alt: 'Curva de presión arterial invasiva con ascenso rápido, pico definido, muesca en la rama descendente y descenso progresivo.',
    fn: curvaArterial({ sistolica: 122, diastolica: 68 }),
  },
  'linea-arterial-sobreamortiguada': {
    titulo: 'Presión arterial invasiva (mmHg)',
    alt: 'Curva de presión arterial invasiva redondeada, sin pico definido ni muesca en la rama descendente.',
    fn: curvaArterial({ sistolica: 122, diastolica: 68, muescaDicrota: false, amortiguacion: 'sobre' }),
  },
  'linea-arterial-subamortiguada': {
    titulo: 'Presión arterial invasiva (mmHg)',
    alt: 'Curva de presión arterial invasiva con oscilaciones rápidas sobre el pico.',
    fn: curvaArterial({ sistolica: 122, diastolica: 68, amortiguacion: 'sub' }),
  },
  'onda-cuadrada-normal': {
    titulo: 'Prueba de la onda cuadrada (mmHg)',
    alt: 'Tras el lavado, la señal vuelve rápido a la curva con una o dos oscilaciones.',
    fn: ondaCuadrada('normal'),
    max: 320,
    prueba: 'lavado rápido',
  },
  'onda-cuadrada-sobreamortiguada': {
    titulo: 'Prueba de la onda cuadrada (mmHg)',
    alt: 'Tras el lavado, la señal vuelve despacio a la curva, sin oscilaciones.',
    fn: ondaCuadrada('sobre'),
    max: 320,
    prueba: 'lavado rápido',
  },
  'onda-cuadrada-subamortiguada': {
    titulo: 'Prueba de la onda cuadrada (mmHg)',
    alt: 'Tras el lavado, la señal oscila varias veces con amplitud marcada antes de recuperar la curva.',
    fn: ondaCuadrada('sub'),
    max: 320,
    prueba: 'lavado rápido',
  },
};

// ---------- salida ----------

function svgEcg(nombre, { titulo, onda }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO + 22}" role="img">
<style>
  .papel { fill: #fff5f5; }
  .fina { stroke: #f3c6c6; stroke-width: 0.5; }
  .gruesa { stroke: #e08c8c; stroke-width: 1; }
  .trazo { fill: none; stroke: #1d1d1f; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
  .pie { font: 12px system-ui, sans-serif; fill: #40484f; }
</style>
<rect class="papel" x="0" y="0" width="${ANCHO}" height="${ALTO}"/>
${rejilla()}
<polyline class="trazo" points="${muestrear(onda())}"/>
<text x="2" y="${ALTO + 16}" class="pie">${titulo}</text>
</svg>
`;
}

function main() {
  const dirEcg = path.join(SALIDA, 'ecg');
  const dirArt = path.join(SALIDA, 'presion');
  fs.mkdirSync(dirEcg, { recursive: true });
  fs.mkdirSync(dirArt, { recursive: true });

  let n = 0;
  for (const [nombre, def] of Object.entries(ECG)) {
    fs.writeFileSync(path.join(dirEcg, `${nombre}.svg`), svgEcg(nombre, def));
    n++;
  }
  for (const [nombre, def] of Object.entries(ARTERIALES)) {
    fs.writeFileSync(path.join(dirArt, `${nombre}.svg`), svgArterial(def));
    n++;
  }
  console.log(`Generadas ${n} imágenes en public/img/.`);

  // El texto alternativo vive junto al dibujo para que el banco de preguntas y
  // la imagen no se desincronicen: quien cambie un trazado cambia aquí su
  // descripción, y este listado sirve para copiarla al JSON del banco.
  const alt = Object.fromEntries([
    ...Object.entries(ECG).map(([k, v]) => [`/img/ecg/${k}.svg`, v.alt]),
    ...Object.entries(ARTERIALES).map(([k, v]) => [`/img/presion/${k}.svg`, v.alt]),
  ]);
  fs.writeFileSync(path.join(SALIDA, 'descripciones.json'), JSON.stringify(alt, null, 2) + '\n');
}

if (require.main === module) main();

module.exports = { main, ECG, ARTERIALES };
