import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Peak, PeaksApiResponse } from "@/lib/peaks/types";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(1000).max(100000).default(60000),
});

// Espejos públicos de Overpass; se prueban en orden.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

// La política de OSM exige un User-Agent identificativo; sin él, 406.
const USER_AGENT = "rutakon/1.0 (https://rutakon.com)";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: PeaksApiResponse }>();

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  const { lat, lon, radius } = parsed.data;

  // Redondeo a ~1 km para que peticiones cercanas compartan caché.
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${radius}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.data);
  }

  try {
    const [peaks, observerElevation] = await Promise.all([
      fetchPeaks(lat, lon, radius),
      fetchElevation(lat, lon),
    ]);
    const data: PeaksApiResponse = { peaks, observerElevation };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[peaks] error consultando Overpass:", err);
    return NextResponse.json(
      { error: "No se pudo consultar el catálogo de cimas. Inténtalo de nuevo en unos segundos." },
      { status: 502 },
    );
  }
}

async function fetchPeaks(lat: number, lon: number, radius: number): Promise<Peak[]> {
  const query = `
[out:json][timeout:25];
(
  node["natural"="peak"]["name"](around:${radius},${lat},${lon});
  node["natural"="volcano"]["name"](around:${radius},${lat},${lon});
);
out body qt;`;

  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Overpass ${endpoint} → HTTP ${res.status}`);
      // Overpass devuelve errores como HTML incluso con estado 200.
      const json = (await res.json()) as {
        elements?: Array<{
          id: number;
          lat: number;
          lon: number;
          tags?: Record<string, string>;
        }>;
      };
      return (json.elements ?? [])
        .map((el) => ({
          id: el.id,
          name: el.tags?.name ?? "",
          lat: el.lat,
          lon: el.lon,
          ele: parseEle(el.tags?.ele),
        }))
        .filter((p) => p.name !== "");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// El tag `ele` de OSM es texto libre: "3404", "3404.6", "3.404", "2650 m"...
function parseEle(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = parseFloat(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(value) || value < -500 || value > 9000) return null;
  return value;
}

async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { elevation?: number[] };
    const value = json.elevation?.[0];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
