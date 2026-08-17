// Geometría geodésica para el identificador de cimas.

const EARTH_RADIUS_M = 6371000;

// Radio efectivo con refracción atmosférica estándar (k ≈ 0.13): la luz se
// curva ligeramente hacia la Tierra, así que los picos lejanos se ven algo más
// altos de lo que la geometría pura indicaría.
const EFFECTIVE_RADIUS_M = EARTH_RADIUS_M / (1 - 0.13);

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Distancia haversine en metros entre dos puntos (lat/lon en grados). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Rumbo inicial en grados 0-360 desde el punto 1 hacia el punto 2. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Ángulo de elevación aparente (grados) de un pico visto por el observador,
 * descontando la caída por curvatura terrestre con refracción.
 */
export function elevationAngleDeg(
  distanceM: number,
  observerEleM: number,
  peakEleM: number,
): number {
  const drop = distanceM ** 2 / (2 * EFFECTIVE_RADIUS_M);
  return toDeg(Math.atan2(peakEleM - observerEleM - drop, distanceM));
}

/** Diferencia angular con signo en (-180, 180], `a - b` normalizada. */
export function angleDiffDeg(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Campo de visión horizontal en grados a partir de la focal equivalente a
 * 35 mm (fotograma de 36×24 mm). En vertical el lado largo del sensor es el
 * vertical, así que el FOV horizontal usa 24 mm.
 */
export function horizontalFovDeg(focal35: number, portrait: boolean): number {
  const sensorWidth = portrait ? 24 : 36;
  return 2 * toDeg(Math.atan(sensorWidth / (2 * focal35)));
}

/** FOV vertical derivado del horizontal y la relación de aspecto de la imagen. */
export function verticalFovDeg(hFovDeg: number, width: number, height: number): number {
  return 2 * toDeg(Math.atan(Math.tan(toRad(hFovDeg / 2)) * (height / width)));
}
