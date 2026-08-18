# CLAUDE.md — Rutakon

Contexto para asistentes que trabajen en este repo.

## Qué es

**Rutakon** (rutakon.com; repo GitHub: jaumeinsa/cimas): cámara en vivo que
etiqueta las cimas que tienes delante (nombre, altitud) sobre la propia imagen.
Un solo botón: se abre el visor, disparas y sale la foto anotada. App
independiente, sin base de datos. Se autohospeda en un VPS con Docker + Nginx.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind. Sin base de datos.
- API de Anthropic (afinado con IA en segundo plano, opcional).

## Mapa del código

- `src/app/page.tsx` — página única con `CameraPeaks`.
- `src/components/CameraPeaks.tsx` — todo el flujo cliente: visor en vivo
  (getUserMedia) con etiquetas proyectadas usando GPS + brújula + inclinación
  leídos en directo, disparo (congela el frame anotado), afinado automático
  con IA en segundo plano y guardar/compartir. Sin subir fotos ni opciones
  manuales: los sensores se muestrean en el momento del disparo porque las
  fotos capturadas por el navegador no llevan EXIF de GPS/rumbo.
- `src/lib/peaks/geo.ts` — geodesia: haversine, rumbo, ángulo de elevación con
  curvatura+refracción (k=0,13), FOV desde focal 35 mm.
- `src/lib/peaks/visibility.ts` — selección: oclusión heurística por sectores
  de azimut, deduplicado, cimas en encuadre.
- `src/lib/peaks/terrain.ts` — oclusión por relieve real: muestrea la altitud
  del terreno a lo largo de la línea de visión (Open-Meteo, en lotes de 100)
  y descarta cimas tapadas por lomas sin nombre. Se lanza desde el cliente.
- `src/app/api/peaks/route.ts` — Overpass (espejos con fallback, User-Agent
  obligatorio, caché 6 h): peaks + volcanes + hills; rellena el tag `ele`
  ausente con el modelo del terreno (sin él, la cima se perdía) + altitud
  del observador (Open-Meteo).
- `src/app/api/peaks/analyze/route.ts` — Claude con visión + salida
  estructurada JSON. Requiere `ANTHROPIC_API_KEY`; sin ella devuelve 503.
- `scripts/deploy-vps.sh` — despliegue idempotente (Docker, Nginx, Certbot).

## Principios

- Overpass exige User-Agent identificativo (sin él devuelve 406) y sus espejos
  fallan a menudo: mantener la lista de fallback.
- La app debe funcionar entera sin `ANTHROPIC_API_KEY` (la IA es opcional).
- La foto no sale del dispositivo salvo para el afinado con IA.
- Cero opciones en la interfaz: un botón para abrir el visor, otro para
  disparar. Nada de subir fotos, coordenadas a mano ni calibraciones.
- HTTPS obligatorio en producción: sin él iOS bloquea cámara, brújula y GPS.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # next build (standalone)
npm run typecheck  # tsc --noEmit
```
