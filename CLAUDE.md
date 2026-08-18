# CLAUDE.md — Rutakon

Contexto para asistentes que trabajen en este repo.

## Qué es

**Rutakon** (rutakon.com; repo GitHub: jaumeinsa/cimas): sube una foto de montaña y la app etiqueta los picos que aparecen
(nombre, altitud, distancia) proyectándolos sobre la imagen. App independiente,
sin base de datos. Se autohospeda en un VPS con Docker + Nginx.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind. Sin base de datos.
- `exifr` (EXIF), API de Anthropic (verificación con IA, opcional).

## Mapa del código

- `src/app/page.tsx` — página única con `PeakIdentifier`.
- `src/components/PeakIdentifier.tsx` — todo el flujo cliente: EXIF,
  geolocalización/brújula, canvas con etiquetas, calibración por arrastre,
  llamada a la IA y descarga.
- `src/lib/peaks/geo.ts` — geodesia: haversine, rumbo, ángulo de elevación con
  curvatura+refracción (k=0,13), FOV desde focal 35 mm.
- `src/lib/peaks/visibility.ts` — selección: oclusión heurística por sectores
  de azimut, deduplicado, cimas en encuadre.
- `src/app/api/peaks/route.ts` — Overpass (espejos con fallback, User-Agent
  obligatorio, caché 6 h) + altitud del observador (Open-Meteo).
- `src/app/api/peaks/analyze/route.ts` — Claude con visión + salida
  estructurada JSON. Requiere `ANTHROPIC_API_KEY`; sin ella devuelve 503.
- `scripts/deploy-vps.sh` — despliegue idempotente (Docker, Nginx, Certbot).

## Principios

- Overpass exige User-Agent identificativo (sin él devuelve 406) y sus espejos
  fallan a menudo: mantener la lista de fallback.
- La app debe funcionar entera sin `ANTHROPIC_API_KEY` (la IA es opcional).
- La foto no sale del dispositivo salvo para la verificación con IA.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # next build (standalone)
npm run typecheck  # tsc --noEmit
```
