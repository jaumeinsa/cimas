// Selección de cimas visibles: geometría + heurística de oclusión.
//
// Sin un modelo digital del terreno no podemos trazar líneas de visión
// exactas; aproximamos la oclusión comparando ángulos de elevación por
// sectores de azimut: una cima queda tapada si otra más cercana, en un rumbo
// casi idéntico, se ve más alta.

import { angleDiffDeg, bearingDeg, elevationAngleDeg, haversineM } from "./geo";
import type { CandidatePeak, Observer, Peak } from "./types";

const MIN_DISTANCE_M = 250;
const OCCLUSION_AZIMUTH_DEG = 1.5;
const OCCLUSION_MARGIN_DEG = 0.25;

export function computeCandidates(
  peaks: Peak[],
  observer: Observer,
  maxDistanceM: number,
): CandidatePeak[] {
  const candidates: CandidatePeak[] = [];
  for (const peak of peaks) {
    if (peak.ele == null || !peak.name) continue;
    const distanceM = haversineM(observer.lat, observer.lon, peak.lat, peak.lon);
    if (distanceM < MIN_DISTANCE_M || distanceM > maxDistanceM) continue;
    candidates.push({
      ...peak,
      distanceM,
      bearingDeg: bearingDeg(observer.lat, observer.lon, peak.lat, peak.lon),
      elevationAngleDeg: elevationAngleDeg(distanceM, observer.ele, peak.ele),
      visible: true,
    });
  }
  markOccluded(candidates);
  return dedupeByName(candidates).sort((a, b) => a.bearingDeg - b.bearingDeg);
}

function markOccluded(candidates: CandidatePeak[]): void {
  const byDistance = [...candidates].sort((a, b) => a.distanceM - b.distanceM);
  for (let i = 0; i < byDistance.length; i++) {
    const peak = byDistance[i];
    for (let j = 0; j < i; j++) {
      const nearer = byDistance[j];
      if (!nearer.visible) continue;
      if (Math.abs(angleDiffDeg(nearer.bearingDeg, peak.bearingDeg)) > OCCLUSION_AZIMUTH_DEG) {
        continue;
      }
      if (nearer.elevationAngleDeg >= peak.elevationAngleDeg + OCCLUSION_MARGIN_DEG) {
        peak.visible = false;
        break;
      }
    }
  }
}

function dedupeByName(candidates: CandidatePeak[]): CandidatePeak[] {
  const byName = new Map<string, CandidatePeak>();
  for (const peak of candidates) {
    const key = peak.name.toLocaleLowerCase("es");
    const existing = byName.get(key);
    if (!existing || peak.distanceM < existing.distanceM) byName.set(key, peak);
  }
  return [...byName.values()];
}

/**
 * Cimas a etiquetar para un encuadre dado: dentro del FOV, no ocluidas, y con
 * un mínimo de separación horizontal para que las etiquetas no se amontonen.
 */
export function peaksInView(
  candidates: CandidatePeak[],
  headingDeg: number,
  fovDeg: number,
  maxLabels: number,
): CandidatePeak[] {
  const half = fovDeg / 2;
  const inView = candidates.filter(
    (p) => p.visible && Math.abs(angleDiffDeg(p.bearingDeg, headingDeg)) <= half,
  );

  // Prioriza cimas prominentes: más ángulo de elevación y más altitud.
  const ranked = [...inView].sort(
    (a, b) =>
      b.elevationAngleDeg - a.elevationAngleDeg || (b.ele ?? 0) - (a.ele ?? 0),
  );

  // Separación generosa: mejor pocas etiquetas legibles que muchas amontonadas.
  const minSeparationDeg = Math.max(fovDeg / 14, 2.5);
  const chosen: CandidatePeak[] = [];
  for (const peak of ranked) {
    if (chosen.length >= maxLabels) break;
    const crowded = chosen.some(
      (c) => Math.abs(angleDiffDeg(c.bearingDeg, peak.bearingDeg)) < minSeparationDeg,
    );
    if (!crowded) chosen.push(peak);
  }
  return chosen.sort(
    (a, b) => angleDiffDeg(a.bearingDeg, headingDeg) - angleDiffDeg(b.bearingDeg, headingDeg),
  );
}
