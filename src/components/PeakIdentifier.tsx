"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  angleDiffDeg,
  horizontalFovDeg,
  toRad,
  verticalFovDeg,
} from "@/lib/peaks/geo";
import { computeCandidates, peaksInView } from "@/lib/peaks/visibility";
import type {
  AnalyzeApiResponse,
  AnalyzeResult,
  CandidatePeak,
  Peak,
  PeaksApiResponse,
} from "@/lib/peaks/types";

const SEARCH_RADIUS_M = 60000;
const MAX_LABELS = 14;
const DEFAULT_FOCAL_35 = 26; // cámara principal del iPhone: ~26 mm equivalentes
const MAX_CANVAS_EDGE = 1600;

interface Position {
  lat: number;
  lon: number;
  source: "exif" | "gps" | "manual";
}

interface ExifData {
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  direction: number | null;
  focal35: number | null;
}

export default function PeakIdentifier() {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [exifAltitude, setExifAltitude] = useState<number | null>(null);
  const [heading, setHeading] = useState(0);
  const [headingKnown, setHeadingKnown] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [hFov, setHFov] = useState(65);
  const [peaks, setPeaks] = useState<Peak[] | null>(null);
  const [observerEle, setObserverEle] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPeaks, setLoadingPeaks] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNotes, setAiNotes] = useState<string | null>(null);
  const [aiOverrides, setAiOverrides] = useState<Map<string, AnalyzeResult>>(new Map());
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const observer = useMemo(() => {
    if (!position) return null;
    const ele = exifAltitude ?? observerEle ?? 0;
    return { lat: position.lat, lon: position.lon, ele };
  }, [position, exifAltitude, observerEle]);

  const candidates = useMemo<CandidatePeak[]>(() => {
    if (!peaks || !observer) return [];
    return computeCandidates(peaks, observer, SEARCH_RADIUS_M);
  }, [peaks, observer]);

  const labeled = useMemo(() => {
    if (!img || candidates.length === 0) return [];
    return peaksInView(candidates, heading, hFov, MAX_LABELS);
  }, [img, candidates, heading, hFov]);

  // ---- Carga de la foto -------------------------------------------------

  const onFile = useCallback(async (file: File) => {
    setError(null);
    setStatus(null);
    setAiNotes(null);
    setAiOverrides(new Map());
    setPeaks(null);
    setPitch(0);

    const url = URL.createObjectURL(file);
    setImgUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });

    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => {
      setImg(null);
      setError(
        "No se pudo abrir la imagen. En iPhone: Ajustes → Cámara → Formatos → Más compatible, y repite la foto.",
      );
    };
    image.src = url;

    const exif = await readExif(file);
    setExifAltitude(exif.altitude);

    if (exif.focal35 != null && exif.focal35 > 8 && exif.focal35 < 400) {
      const portrait = await isPortrait(file, image);
      setHFov(clamp(horizontalFovDeg(exif.focal35, portrait), 15, 110));
    }

    if (exif.direction != null) {
      setHeading(((exif.direction % 360) + 360) % 360);
      setHeadingKnown(true);
    } else {
      setHeadingKnown(false);
    }

    if (exif.lat != null && exif.lon != null) {
      setPosition({ lat: exif.lat, lon: exif.lon, source: "exif" });
      setStatus(
        exif.direction != null
          ? "Foto con GPS y rumbo ✓"
          : "Foto con GPS ✓ — si los nombres no cuadran, arrastra la foto",
      );
    } else {
      setPosition(null);
      setStatus(
        "Esta foto no dice dónde se hizo",
      );
    }
  }, []);

  // ---- Posición y cimas -------------------------------------------------

  const useCurrentLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Este navegador no da acceso a la ubicación");
      return;
    }
    setStatus("Buscando tu posición…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: "gps" });
        if (pos.coords.altitude != null) setExifAltitude(pos.coords.altitude);
        setStatus("Posición lista ✓");
      },
      () => setError("Sin permiso de ubicación"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  const useManualPosition = useCallback(() => {
    const lat = parseFloat(manualLat.replace(",", "."));
    const lon = parseFloat(manualLon.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setError("Coordenadas no válidas (ej.: 42.63, 0.65)");
      return;
    }
    setError(null);
    setPosition({ lat, lon, source: "manual" });
  }, [manualLat, manualLon]);

  const useCompass = useCallback(async () => {
    setError(null);
    type OrientationEventCtor = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const ctor = DeviceOrientationEvent as OrientationEventCtor;
    if (typeof ctor.requestPermission === "function") {
      try {
        const perm = await ctor.requestPermission();
        if (perm !== "granted") {
          setError("Sin permiso de brújula");
          return;
        }
      } catch {
        setError("La brújula no está disponible");
        return;
      }
    }
    setStatus("Apunta el móvil hacia las montañas…");
    const eventName = "ondeviceorientationabsolute" in window
      ? "deviceorientationabsolute"
      : "deviceorientation";
    let readings = 0;
    const listener = (e: Event) => {
      const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let value: number | null = null;
      if (typeof ev.webkitCompassHeading === "number") {
        value = ev.webkitCompassHeading;
      } else if (ev.alpha != null) {
        value = (360 - ev.alpha) % 360;
      }
      if (value == null) return;
      readings++;
      if (readings >= 5) {
        setHeading(Math.round(value * 10) / 10);
        setHeadingKnown(true);
        setStatus("Rumbo fijado ✓");
        window.removeEventListener(eventName, listener);
      }
    };
    window.addEventListener(eventName, listener);
    window.setTimeout(() => window.removeEventListener(eventName, listener), 8000);
  }, []);

  useEffect(() => {
    if (!position) return;
    let cancelled = false;
    setLoadingPeaks(true);
    setError(null);

    // El catálogo público de OpenStreetMap falla a ratos: reintenta solo.
    const load = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(
            `/api/peaks?lat=${position.lat}&lon=${position.lon}&radius=${SEARCH_RADIUS_M}`,
          );
          if (!res.ok) throw new Error((await res.json()).error ?? "Error");
          const data = (await res.json()) as PeaksApiResponse;
          if (cancelled) return;
          setPeaks(data.peaks);
          setObserverEle(data.observerElevation);
          setStatus(data.peaks.length === 0 ? "No hay montañas catalogadas cerca" : null);
          setLoadingPeaks(false);
          return;
        } catch (err) {
          if (cancelled) return;
          if (attempt < 2) {
            setStatus("El mapa de montañas tarda… reintentando ⏳");
            await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
          } else {
            setError(err instanceof Error ? err.message : "Error cargando las montañas");
            setStatus(null);
            setLoadingPeaks(false);
          }
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [position]);

  // ---- Render del canvas ------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const scale = Math.min(1, MAX_CANVAS_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);

    const vFov = verticalFovDeg(hFov, w, h);
    const tanHalfH = Math.tan(toRad(hFov / 2));
    const tanHalfV = Math.tan(toRad(vFov / 2));
    const fontPx = clamp(Math.round(w / 55), 13, 26);

    const points = labeled
      .map((peak) => {
        const override = aiOverrides.get(peak.name);
        if (override && !override.visible) return null;
        let x: number;
        let y: number;
        if (override && override.x != null && override.y != null) {
          x = override.x * w;
          y = override.y * h;
        } else {
          const daz = angleDiffDeg(peak.bearingDeg, heading);
          x = (w / 2) * (1 + Math.tan(toRad(daz)) / tanHalfH);
          y = (h / 2) * (1 - Math.tan(toRad(peak.elevationAngleDeg - pitch)) / tanHalfV);
        }
        if (x < -w * 0.02 || x > w * 1.02) return null;
        y = clamp(y, h * 0.04, h * 0.96);
        return { peak, x, y, ai: Boolean(override) };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.x - b.x);

    ctx.textBaseline = "middle";
    ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`;
    ctx.lineJoin = "round";

    let prevLabelX = -Infinity;
    let lift = 0;
    for (const { peak, x, y, ai } of points) {
      // Escalona las etiquetas cuando dos cimas caen casi en la misma vertical.
      lift = x - prevLabelX < fontPx * 4 ? (lift + 1) % 3 : 0;
      prevLabelX = x;
      const labelY = Math.max(y - fontPx * (3.2 + lift * 2.2), fontPx * 1.2);

      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = Math.max(1, fontPx / 12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, labelY + fontPx * 0.7);
      ctx.stroke();

      ctx.fillStyle = ai ? "#f08c00" : "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.5, fontPx / 5), 0, Math.PI * 2);
      ctx.fill();

      const text =
        peak.ele != null ? `${peak.name} · ${Math.round(peak.ele)} m` : peak.name;
      ctx.save();
      ctx.translate(x, labelY);
      ctx.rotate(-Math.PI / 5);
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = Math.max(3, fontPx / 4);
      ctx.strokeText(text, fontPx * 0.3, 0);
      ctx.fillStyle = ai ? "#ffd8a8" : "#ffffff";
      ctx.fillText(text, fontPx * 0.3, 0);
      ctx.restore();
    }

    // Brújula: rumbo del centro del encuadre.
    const compass = `${Math.round(((heading % 360) + 360) % 360)}° ${cardinal(heading)} · FOV ${Math.round(hFov)}°`;
    ctx.font = `${Math.round(fontPx * 0.85)}px system-ui, sans-serif`;
    ctx.textBaseline = "bottom";
    const pad = fontPx * 0.5;
    const tw = ctx.measureText(compass).width;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(w - tw - pad * 3, h - fontPx * 1.9, tw + pad * 2, fontPx * 1.6);
    ctx.fillStyle = "#fff";
    ctx.fillText(compass, w - tw - pad * 2, h - pad * 0.8);
  }, [img, labeled, heading, pitch, hFov, aiOverrides]);

  // ---- Calibración arrastrando ------------------------------------------

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current = { x: e.clientX, y: e.clientY };
      const vFov = verticalFovDeg(hFov, rect.width, rect.height);
      setHeading((prev) => (((prev - (dx / rect.width) * hFov) % 360) + 360) % 360);
      setPitch((prev) => clamp(prev + (dy / rect.height) * vFov, -45, 45));
    },
    [hFov],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
  }, []);

  // ---- IA y descarga -----------------------------------------------------

  const analyze = useCallback(async () => {
    if (!img || labeled.length === 0) return;
    setAnalyzing(true);
    setError(null);
    setAiNotes(null);
    try {
      const { dataUrl, w, h } = downscaleToJpeg(img, 1280);
      const vFov = verticalFovDeg(hFov, w, h);
      const tanHalfH = Math.tan(toRad(hFov / 2));
      const tanHalfV = Math.tan(toRad(vFov / 2));
      const candidatesPayload = labeled.map((peak) => {
        const daz = angleDiffDeg(peak.bearingDeg, heading);
        return {
          name: peak.name,
          x: clamp(0.5 * (1 + Math.tan(toRad(daz)) / tanHalfH), 0, 1),
          y: clamp(0.5 * (1 - Math.tan(toRad(peak.elevationAngleDeg - pitch)) / tanHalfV), -0.5, 1.5),
          distanceKm: peak.distanceM / 1000,
          ele: peak.ele,
        };
      });
      const res = await fetch("/api/peaks/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl.split(",")[1],
          mediaType: "image/jpeg",
          candidates: candidatesPayload,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error en el análisis");
      const data = json as AnalyzeApiResponse;
      setAiOverrides(new Map(data.results.map((r) => [r.name, r])));
      setAiNotes(data.notes);
      const hidden = data.results.filter((r) => !r.visible).length;
      setStatus(
        hidden > 0
          ? `✨ Quitadas ${hidden} que no se ven en la foto`
          : "✨ Todo cuadra",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en el análisis con IA");
    } finally {
      setAnalyzing(false);
    }
  }, [img, labeled, heading, pitch, hFov]);

  const download = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "cimas.jpg";
        a.click();
        URL.revokeObjectURL(a.href);
      },
      "image/jpeg",
      0.92,
    );
  }, []);

  // ---- UI ----------------------------------------------------------------

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-paper/70 px-6 py-8 text-center transition hover:border-pine hover:bg-pine-tint/70">
        <span className="text-4xl">📷</span>
        <span className="text-lg font-semibold text-ink">
          {imgUrl ? "Cambiar de foto" : "Haz o elige una foto"}
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = "";
          }}
        />
      </label>

      {status && (
        <p className="rounded-lg bg-pine-tint px-4 py-2 text-sm text-pine">{status}</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>
      )}

      {imgUrl && !position && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
          <p className="font-semibold text-ink">¿Dónde estabas al hacer la foto?</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={useCurrentLocation}
              className="w-full rounded-xl bg-pine px-4 py-3 text-base font-semibold text-white hover:bg-pine-soft"
            >
              📍 Aquí, donde estoy ahora
            </button>
            <span className="w-full text-center text-sm text-ink-muted">o escribe dónde fue:</span>
            <input
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              placeholder="Latitud (42.6329)"
              inputMode="decimal"
              className="w-36 rounded-lg border border-line px-3 py-2 text-sm"
            />
            <input
              value={manualLon}
              onChange={(e) => setManualLon(e.target.value)}
              placeholder="Longitud (0.6572)"
              inputMode="decimal"
              className="w-36 rounded-lg border border-line px-3 py-2 text-sm"
            />
            <button
              onClick={useManualPosition}
              className="rounded-xl border border-line px-5 py-2.5 text-base font-semibold text-ink hover:bg-cream"
            >
              Vale
            </button>
          </div>
        </div>
      )}

      {img && position && (
        <>
          <div className="overflow-hidden rounded-2xl border border-line bg-black shadow-sm">
            <canvas
              ref={canvasRef}
              className="w-full touch-none select-none"
              style={{ cursor: "grab" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>
          <p className="text-center text-xs text-ink-muted">
            👆 Arrastra la foto hasta que los nombres cuadren con los picos
          </p>

          <div className="grid gap-4 rounded-xl border border-line bg-paper p-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-ink">
              <span>
                Girar: <b>{Math.round(heading)}° {cardinal(heading)}</b>
              </span>
              <input
                type="range"
                min={0}
                max={359.5}
                step={0.5}
                value={heading}
                onChange={(e) => setHeading(parseFloat(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              <span>
                Zoom: <b>{Math.round(hFov)}°</b>
              </span>
              <input
                type="range"
                min={20}
                max={110}
                step={1}
                value={hFov}
                onChange={(e) => setHFov(parseFloat(e.target.value))}
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                onClick={useCompass}
                className="flex-1 rounded-xl border border-line px-3 py-3 text-base font-semibold text-ink hover:bg-cream"
              >
                🧭 Brújula
              </button>
              <button
                onClick={analyze}
                disabled={analyzing || labeled.length === 0}
                className="flex-1 rounded-xl bg-accent px-3 py-3 text-base font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
              >
                {analyzing ? "Mirando… ⏳" : "✨ Comprobar"}
              </button>
              <button
                onClick={download}
                className="flex-1 rounded-xl bg-pine px-3 py-3 text-base font-semibold text-white hover:bg-pine-soft"
              >
                ⬇️ Guardar
              </button>
            </div>
          </div>

          {aiNotes && (
            <p className="rounded-lg bg-accent-tint px-4 py-2 text-sm text-accent-dark">
              ✨ {aiNotes}
            </p>
          )}

          {loadingPeaks && <p className="text-sm text-ink-muted">Buscando montañas cerca… ⏳</p>}

          {labeled.length > 0 && (
            <div className="rounded-xl border border-line bg-paper p-4">
              <p className="mb-2 text-sm font-semibold text-ink">
                En tu foto ({labeled.length})
              </p>
              <ul className="grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
                {labeled.map((p) => {
                  const o = aiOverrides.get(p.name);
                  return (
                    <li key={p.id} className={o && !o.visible ? "line-through opacity-50" : ""}>
                      <b>{p.name}</b>
                      {p.ele != null && ` · ${Math.round(p.ele)} m`} ·{" "}
                      {(p.distanceM / 1000).toFixed(1)} km · {Math.round(p.bearingDeg)}°
                      {o && !o.visible && " · tapada"}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!loadingPeaks && peaks && peaks.length > 0 && labeled.length === 0 && (
            <p className="rounded-lg bg-accent-tint px-4 py-2 text-sm text-accent-dark">
              Gira la foto (o el control «Girar») hasta encontrar las montañas
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---- Utilidades ----------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function cardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

async function readExif(file: File): Promise<ExifData> {
  try {
    const exifr = (await import("exifr")).default;
    const data = (await exifr.parse(file, {
      gps: true,
      tiff: true,
      exif: true,
      pick: [
        "latitude",
        "longitude",
        "GPSAltitude",
        "GPSImgDirection",
        "FocalLengthIn35mmFormat",
        "FocalLengthIn35mmFilm",
      ],
    })) as Record<string, unknown> | undefined;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      lat: num(data?.latitude),
      lon: num(data?.longitude),
      altitude: num(data?.GPSAltitude),
      direction: num(data?.GPSImgDirection),
      focal35: num(data?.FocalLengthIn35mmFormat) ?? num(data?.FocalLengthIn35mmFilm),
    };
  } catch {
    return { lat: null, lon: null, altitude: null, direction: null, focal35: null };
  }
}

async function isPortrait(file: File, image: HTMLImageElement): Promise<boolean> {
  if (image.naturalWidth > 0) return image.naturalHeight > image.naturalWidth;
  try {
    const bmp = await createImageBitmap(file);
    const portrait = bmp.height > bmp.width;
    bmp.close();
    return portrait;
  } catch {
    return false;
  }
}

function downscaleToJpeg(
  img: HTMLImageElement,
  maxEdge: number,
): { dataUrl: string; w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), w, h };
}
