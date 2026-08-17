// Tipos del identificador de cimas (/cimas).

export interface Peak {
  id: number;
  name: string;
  lat: number;
  lon: number;
  /** Altitud en metros (tag `ele` de OSM), null si no consta. */
  ele: number | null;
}

export interface Observer {
  lat: number;
  lon: number;
  /** Altitud del observador en metros sobre el nivel del mar. */
  ele: number;
}

/** Cima con la geometría calculada respecto al observador. */
export interface CandidatePeak extends Peak {
  distanceM: number;
  /** Rumbo geográfico desde el observador, 0-360° (0 = norte). */
  bearingDeg: number;
  /** Ángulo de elevación aparente sobre el horizonte del observador, en grados. */
  elevationAngleDeg: number;
  /** false si otra cima más cercana la tapa (heurística, sin modelo del terreno). */
  visible: boolean;
}

export interface PeaksApiResponse {
  peaks: Peak[];
  /** Altitud del terreno en la posición consultada (open-meteo), null si falló. */
  observerElevation: number | null;
}

/** Candidata enviada al análisis con IA. */
export interface AnalyzeCandidate {
  name: string;
  /** Posición horizontal prevista en la foto, 0 (izquierda) a 1 (derecha). */
  x: number;
  /** Posición vertical prevista en la foto, 0 (arriba) a 1 (abajo). */
  y: number;
  distanceKm: number;
  ele: number | null;
}

export interface AnalyzeResult {
  name: string;
  visible: boolean;
  /** Confianza 0-1 de que la cima es identificable en la foto. */
  confidence: number;
  /** Posición corregida del pico en la imagen (fracciones 0-1), null si no aplica. */
  x: number | null;
  y: number | null;
}

export interface AnalyzeApiResponse {
  results: AnalyzeResult[];
  notes: string;
}
