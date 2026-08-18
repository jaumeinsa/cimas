"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { angleDiffDeg, toRad, verticalFovDeg } from "@/lib/peaks/geo";
import { computeCandidates, peaksInView } from "@/lib/peaks/visibility";
import type {
  AnalyzeApiResponse,
  AnalyzeResult,
  CandidatePeak,
  PeaksApiResponse,
} from "@/lib/peaks/types";

const SEARCH_RADIUS_M = 60000;
const MAX_LABELS = 8;

// FOV horizontal aproximado de la cámara trasera 1x (26 mm equiv., sensor 4:3):
// en vertical el lado corto es el horizontal (~52°); en horizontal, ~66°.
function hFovFor(w: number, h: number): number {
  return w >= h ? 66 : 52;
}

type Fase = "inicio" | "pidiendo" | "visor" | "resultado" | "sin-camara";

export default function CameraPeaks() {
  const [fase, setFase] = useState<Fase>("inicio");
  const [error, setError] = useState<string | null>(null);
  const [chip, setChip] = useState<string | null>(null);
  const [ia, setIa] = useState<"off" | "run" | "done">("off");
  const [nombres, setNombres] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const watchRef = useRef<number | null>(null);

  const readingsRef = useRef<number[]>([]);
  const headingRef = useRef<number | null>(null);
  const pitchRef = useRef(0);
  const posRef = useRef<{ lat: number; lon: number; ele: number } | null>(null);
  const candidatesRef = useRef<CandidatePeak[]>([]);
  const frozenRef = useRef<{ frame: ImageBitmap; heading: number; pitch: number } | null>(null);
  const overridesRef = useRef<Map<string, AnalyzeResult>>(new Map());
  const sensoresOkRef = useRef(false);
  const nombresRef = useRef(true);

  // ---- Sensores -----------------------------------------------------------

  const onOrientation = useCallback((e: Event) => {
    const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    let h: number | null = null;
    if (typeof ev.webkitCompassHeading === "number") h = ev.webkitCompassHeading;
    else if (ev.alpha != null) h = (360 - ev.alpha) % 360;
    if (h != null) {
      const r = readingsRef.current;
      r.push(h);
      if (r.length > 10) r.shift();
      // Media circular para que la brújula no baile.
      let sx = 0;
      let sy = 0;
      for (const a of r) {
        sx += Math.cos(toRad(a));
        sy += Math.sin(toRad(a));
      }
      headingRef.current = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
    }
    if (ev.beta != null) {
      // Móvil en vertical: beta 90° = cámara mirando al horizonte.
      const p = Math.max(-45, Math.min(45, ev.beta - 90));
      pitchRef.current = pitchRef.current * 0.8 + p * 0.2;
    }
  }, []);

  const cargarCimas = useCallback(async (lat: number, lon: number, ele: number) => {
    for (let intento = 0; intento < 3; intento++) {
      try {
        const res = await fetch(`/api/peaks?lat=${lat}&lon=${lon}&radius=${SEARCH_RADIUS_M}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as PeaksApiResponse;
        candidatesRef.current = computeCandidates(
          data.peaks,
          { lat, lon, ele: data.observerElevation ?? ele },
          SEARCH_RADIUS_M,
        );
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 4000 * (intento + 1)));
      }
    }
    setError("No se pudo cargar el mapa de montañas. Prueba otra vez.");
  }, []);

  // ---- Arranque (un solo gesto del usuario) -------------------------------

  const empezar = useCallback(async () => {
    setError(null);
    setFase("pidiendo");
    try {
      // 1. Brújula (iOS exige pedir permiso dentro del gesto).
      if (!sensoresOkRef.current) {
        type Ctor = typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
        const ctor = DeviceOrientationEvent as Ctor;
        if (typeof ctor.requestPermission === "function") {
          const p = await ctor.requestPermission();
          if (p !== "granted") throw new Error("Necesito la brújula para saber hacia dónde miras.");
        }
        const evName = "ondeviceorientationabsolute" in window
          ? "deviceorientationabsolute"
          : "deviceorientation";
        window.addEventListener(evName, onOrientation);
        sensoresOkRef.current = true;
      }

      // 2. GPS en segundo plano (y carga de cimas en cuanto hay posición).
      if (watchRef.current == null && "geolocation" in navigator) {
        watchRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const primera = posRef.current == null;
            posRef.current = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              ele: pos.coords.altitude ?? 0,
            };
            if (primera) void cargarCimas(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude ?? 0);
          },
          () => setError("Necesito tu ubicación para saber qué montañas tienes delante."),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
        );
      }

      // 3. Cámara.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      overridesRef.current = new Map();
      frozenRef.current = null;
      setIa("off");
      setFase("visor");
    } catch (err) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFase("sin-camara");
      } else {
        setFase("inicio");
        setError(err instanceof Error && err.message.includes("brújula")
          ? err.message
          : "Necesito permiso de cámara. Vuelve a intentarlo y acepta.");
      }
    }
  }, [onOrientation, cargarCimas]);

  // ---- Dibujo -------------------------------------------------------------

  const dibujar = useCallback((frame: CanvasImageSource, w: number, h: number, heading: number, pitch: number, congelado: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(frame, 0, 0, w, h);

    const cands = candidatesRef.current;
    const fontPx = Math.max(13, Math.round(w / 34));

    if (cands.length === 0) {
      pintarChip(ctx, w, h, fontPx, posRef.current ? "Cargando montañas… ⏳" : "Buscando GPS… 📡");
      return;
    }

    const hFov = hFovFor(w, h);
    const vFov = verticalFovDeg(hFov, w, h);
    const tanH = Math.tan(toRad(hFov / 2));
    const tanV = Math.tan(toRad(vFov / 2));
    const visibles = peaksInView(cands, heading, hFov, MAX_LABELS);

    const puntos = visibles
      .map((p) => {
        const o = overridesRef.current.get(p.name);
        if (o && !o.visible) return null;
        let x: number;
        let y: number;
        if (o && o.x != null && o.y != null) {
          x = o.x * w;
          y = o.y * h;
        } else {
          x = (w / 2) * (1 + Math.tan(toRad(angleDiffDeg(p.bearingDeg, heading))) / tanH);
          y = (h / 2) * (1 - Math.tan(toRad(p.elevationAngleDeg - pitch)) / tanV);
        }
        if (x < 0 || x > w) return null;
        y = Math.max(h * 0.05, Math.min(h * 0.9, y));
        return { p, x, y, ai: Boolean(o) };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => a.x - b.x);

    ctx.textBaseline = "middle";
    ctx.font = `600 ${fontPx}px Barlow, system-ui, sans-serif`;
    ctx.lineJoin = "round";
    // Los textos van rotados −45°: dos etiquetas se solapan si sus bases caen
    // en diagonales (x+y = cte) demasiado próximas. Recorremos de izquierda a
    // derecha y saltamos la que caería encima de la anterior.
    let prevDiag = -Infinity;
    for (const { p, x, y, ai } of puntos) {
      const labelY = Math.max(y - fontPx * 2.4, fontPx * 1.2);
      const diag = x + labelY;
      if (diag - prevDiag < fontPx * 1.6) continue;
      prevDiag = diag;

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

      const texto = p.ele != null ? `${p.name} · ${Math.round(p.ele)} m` : p.name;
      ctx.save();
      ctx.translate(x, labelY);
      ctx.rotate(-Math.PI / 4);
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = Math.max(3, fontPx / 4);
      ctx.strokeText(texto, fontPx * 0.3, 0);
      ctx.fillStyle = ai ? "#ffd8a8" : "#ffffff";
      ctx.fillText(texto, fontPx * 0.3, 0);
      ctx.restore();
    }

    if (congelado) {
      pintarChip(ctx, w, h, fontPx, "RUTAKON · rutakon.com");
    }
  }, []);

  // Bucle del visor.
  useEffect(() => {
    if (fase !== "visor") return;
    const video = videoRef.current;
    if (!video) return;
    const loop = () => {
      if (video.videoWidth > 0 && !nombresRef.current) {
        // Nombres ocultos: visor limpio, solo la imagen.
        const canvas = canvasRef.current;
        if (canvas) {
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          canvas.getContext("2d")?.drawImage(video, 0, 0);
        }
      } else if (video.videoWidth > 0 && headingRef.current != null) {
        dibujar(video, video.videoWidth, video.videoHeight, headingRef.current, pitchRef.current, false);
      } else if (video.videoWidth > 0) {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            pintarChip(ctx, canvas.width, canvas.height, Math.round(canvas.width / 34), "Calibrando brújula… 🧭");
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fase, dibujar]);

  // ---- Disparo ------------------------------------------------------------

  const disparar = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const heading = headingRef.current ?? 0;
    const pitch = pitchRef.current;
    const frame = await createImageBitmap(video);
    frozenRef.current = { frame, heading, pitch };

    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    dibujar(frame, frame.width, frame.height, heading, pitch, true);
    setFase("resultado");

    // La IA afina sola, en segundo plano.
    void afinarConIA(frame, heading, pitch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dibujar]);

  const afinarConIA = useCallback(async (frame: ImageBitmap, heading: number, pitch: number) => {
    const cands = candidatesRef.current;
    if (cands.length === 0) return;
    setIa("run");
    try {
      const escala = Math.min(1, 1280 / Math.max(frame.width, frame.height));
      const w = Math.round(frame.width * escala);
      const h = Math.round(frame.height * escala);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(frame, 0, 0, w, h);
      const dataUrl = c.toDataURL("image/jpeg", 0.85);

      const hFov = hFovFor(w, h);
      const vFov = verticalFovDeg(hFov, w, h);
      const tanH = Math.tan(toRad(hFov / 2));
      const tanV = Math.tan(toRad(vFov / 2));
      const visibles = peaksInView(cands, heading, hFov, MAX_LABELS);
      const candidates = visibles.map((p) => ({
        name: p.name,
        x: Math.max(0, Math.min(1, 0.5 * (1 + Math.tan(toRad(angleDiffDeg(p.bearingDeg, heading))) / tanH))),
        y: Math.max(-0.5, Math.min(1.5, 0.5 * (1 - Math.tan(toRad(p.elevationAngleDeg - pitch)) / tanV))),
        distanceKm: p.distanceM / 1000,
        ele: p.ele,
      }));
      if (candidates.length === 0) {
        setIa("off");
        return;
      }

      const res = await fetch("/api/peaks/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl.split(",")[1], mediaType: "image/jpeg", candidates }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as AnalyzeApiResponse;
      overridesRef.current = new Map(data.results.map((r) => [r.name, r]));
      const fz = frozenRef.current;
      if (fz) dibujar(fz.frame, fz.frame.width, fz.frame.height, fz.heading, fz.pitch, true);
      setIa("done");
    } catch {
      setIa("off"); // sin drama: se queda el resultado por sensores
    }
  }, [dibujar]);

  // ---- Guardar / repetir --------------------------------------------------

  const guardar = useCallback(() => {
    canvasRef.current?.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], "rutakon.jpg", { type: "image/jpeg" });
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
        if (nav.share && nav.canShare?.({ files: [file] })) {
          try {
            await nav.share({ files: [file] });
            return;
          } catch {
            /* cancelado: cae al enlace */
          }
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "rutakon.jpg";
        a.click();
        URL.revokeObjectURL(a.href);
      },
      "image/jpeg",
      0.92,
    );
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    cancelAnimationFrame(rafRef.current);
  }, []);

  // ---- UI -----------------------------------------------------------------

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4">
      <video ref={videoRef} playsInline muted className="hidden" />

      {fase === "inicio" && (
        <>
          <button
            onClick={empezar}
            className="w-full rounded-2xl bg-pine px-6 py-8 text-center text-white shadow-card active:scale-[0.99]"
          >
            <span className="block text-5xl">📷</span>
            <span className="mt-2 block font-display text-2xl tracking-wide">HACER FOTO</span>
          </button>
          <p className="text-center text-sm text-ink-muted">
            Apunta a las montañas y dispara. La app usa la cámara, tu ubicación y la brújula.
          </p>
        </>
      )}

      {fase === "pidiendo" && (
        <p className="py-10 text-center text-ink-muted">Un segundo… acepta los permisos 🙏</p>
      )}

      {fase === "sin-camara" && (
        <p className="rounded-xl bg-accent-tint px-4 py-3 text-center text-accent-dark">
          Aquí no hay cámara. Abre <b>rutakon.com</b> en el móvil 📱
        </p>
      )}

      {(fase === "visor" || fase === "resultado") && (
        <div className="relative w-full overflow-hidden rounded-2xl border border-line bg-black shadow-card">
          <canvas ref={canvasRef} className="w-full" />
          {fase === "visor" && (
            <button
              onClick={() => {
                nombresRef.current = !nombresRef.current;
                setNombres(nombresRef.current);
              }}
              aria-label={nombres ? "Ocultar nombres" : "Mostrar nombres"}
              className={`absolute right-3 top-3 rounded-full px-3 py-1.5 text-sm font-semibold text-white ${
                nombres ? "bg-black/60" : "bg-black/35 opacity-60"
              }`}
            >
              {nombres ? "🏔 Nombres" : "🏔 Nombres ✕"}
            </button>
          )}
        </div>
      )}

      {fase === "visor" && (
        <button
          onClick={disparar}
          aria-label="Disparar"
          className="h-20 w-20 rounded-full border-4 border-paper bg-accent shadow-card active:scale-95"
        />
      )}

      {fase === "resultado" && (
        <>
          {ia === "run" && <p className="text-sm text-ink-muted">✨ Afinando con IA…</p>}
          {ia === "done" && <p className="text-sm text-ink-muted">✨ Afinado ✓</p>}
          <div className="flex w-full gap-3">
            <button
              onClick={empezar}
              className="flex-1 rounded-xl border border-line bg-paper px-3 py-3 text-base font-semibold text-ink"
            >
              ↻ Otra
            </button>
            <button
              onClick={guardar}
              className="flex-1 rounded-xl bg-pine px-3 py-3 text-base font-semibold text-white"
            >
              ⬇️ Guardar
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="w-full rounded-xl bg-red-50 px-4 py-2 text-center text-sm text-red-800">{error}</p>
      )}
    </div>
  );
}

function pintarChip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fontPx: number,
  texto: string,
) {
  ctx.font = `${Math.round(fontPx * 0.8)}px Barlow, system-ui, sans-serif`;
  ctx.textBaseline = "bottom";
  const pad = fontPx * 0.5;
  const tw = ctx.measureText(texto).width;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(w - tw - pad * 3, h - fontPx * 1.9, tw + pad * 2, fontPx * 1.6);
  ctx.fillStyle = "#fff";
  ctx.fillText(texto, w - tw - pad * 2, h - pad * 0.8);
}
