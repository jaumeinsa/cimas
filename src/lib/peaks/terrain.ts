// Oclusión por el relieve real: comprueba la línea de visión de cada cima
// muestreando la altitud del terreno intermedio (Open-Meteo, DEM ~90 m).
// Es lo que detecta que una loma cercana tapa una montaña lejana aunque la
// loma no sea ninguna cima con nombre.

import { elevationAngleDeg } from "./geo";
import type { CandidatePeak, Observer } from "./types";

// Solo comprobamos las candidatas con más papeletas de acabar etiquetadas.
const MAX_CHECKED = 40;
// Muestras de terreno por línea de visión, entre el 12% y el 82% del trayecto
// (los extremos se evitan: la posición del observador y la ladera del pico).
const SAMPLES = 6;
const F_MIN = 0.12;
const F_MAX = 0.82;
// Tolerancia para no descartar por ruido del DEM o el hombro del propio macizo.
const MARGIN_DEG = 0.15;

/**
 * Marca `visible = false` en las candidatas cuya cumbre queda por debajo del
 * terreno intermedio. Muta las candidatas recibidas. Lanza si la API falla.
 */
export async function markTerrainOccluded(
  observer: Observer,
  candidates: CandidatePeak[],
): Promise<void> {
  const checked = candidates
    .filter((c) => c.visible)
    .sort(
      (a, b) => b.elevationAngleDeg - a.elevationAngleDeg || (b.ele ?? 0) - (a.ele ?? 0),
    )
    .slice(0, MAX_CHECKED);
  if (checked.length === 0) return;

  // A menos de 60 km la interpolación lineal de lat/lon es suficiente.
  const points: { lat: number; lon: number }[] = [];
  for (const c of checked) {
    for (let s = 0; s < SAMPLES; s++) {
      const f = F_MIN + ((F_MAX - F_MIN) * s) / (SAMPLES - 1);
      points.push({
        lat: observer.lat + (c.lat - observer.lat) * f,
        lon: observer.lon + (c.lon - observer.lon) * f,
      });
    }
  }

  const elevations = await fetchElevations(points);

  checked.forEach((c, i) => {
    for (let s = 0; s < SAMPLES; s++) {
      const ele = elevations[i * SAMPLES + s];
      if (ele == null) continue;
      const f = F_MIN + ((F_MAX - F_MIN) * s) / (SAMPLES - 1);
      const d = c.distanceM * f;
      // Muy cerca del observador el ruido del DEM (~90 m de celda) se traduce
      // en grados enteros de error angular: no se usa para ocluir.
      if (d < 250) continue;
      if (elevationAngleDeg(d, observer.ele, ele) > c.elevationAngleDeg + MARGIN_DEG) {
        c.visible = false;
        break;
      }
    }
  });
}

async function fetchElevations(
  points: { lat: number; lon: number }[],
): Promise<(number | null)[]> {
  const out: (number | null)[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const res = await fetch(
      "https://api.open-meteo.com/v1/elevation" +
        `?latitude=${chunk.map((p) => p.lat.toFixed(5)).join(",")}` +
        `&longitude=${chunk.map((p) => p.lon.toFixed(5)).join(",")}`,
    );
    if (!res.ok) throw new Error(`open-meteo elevation ${res.status}`);
    const data = (await res.json()) as { elevation?: (number | null)[] };
    if (!Array.isArray(data.elevation)) throw new Error("open-meteo elevation: sin datos");
    out.push(...data.elevation.slice(0, chunk.length));
    while (out.length < Math.min(i + 100, points.length)) out.push(null);
  }
  return out;
}
