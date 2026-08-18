# Rutakon 🏔️

**¿Qué montañas tienes delante?** Abre rutakon.com en el móvil, pulsa
«Hacer foto», apunta y dispara: la app etiqueta sobre la imagen las cimas que
aparecen, con su nombre y altitud, y puedes guardarla. Un botón, cero opciones.

## Cómo funciona

1. **Visor en vivo** (`CameraPeaks`): `getUserMedia` muestra la cámara en un
   canvas mientras se leen en directo el GPS (`watchPosition`), la brújula
   (`webkitCompassHeading` en iOS, `alpha` absoluto en Android, con media
   circular anti-baile) y la inclinación (`beta`). Las fotos capturadas por el
   navegador no llevan EXIF de GPS/rumbo, así que los sensores se muestrean en
   el momento exacto del disparo.
2. **`GET /api/peaks`**: cimas con nombre de OpenStreetMap vía Overpass
   (4 espejos con fallback y caché de 6 h) + altitud del terreno del
   observador (Open-Meteo).
3. **Geometría** (`src/lib/peaks/`): rumbo, distancia y ángulo de elevación de
   cada pico descontando la curvatura terrestre con refracción; heurística de
   oclusión por sectores de azimut; proyección rectilínea sobre el canvas.
4. **Disparo**: se congela el frame anotado con las etiquetas y se puede
   guardar/compartir (`navigator.share` en el móvil).
5. **`POST /api/peaks/analyze`** (opcional, requiere `ANTHROPIC_API_KEY`):
   tras el disparo, Claude mira la foto con visión en segundo plano y descarta
   las cimas que no se ven (nubes, obstáculos), afinando las posiciones.

## Desarrollo

```bash
npm install
cp .env.example .env   # opcional: ANTHROPIC_API_KEY para la IA
npm run dev            # http://localhost:3000
npm run typecheck
npm run build
```

## Despliegue en un VPS (Docker + Nginx + HTTPS)

Con el repo clonado en el VPS (p. ej. en `/opt/rutakon`):

```bash
sudo bash scripts/deploy-vps.sh rutakon.com tu-email@ejemplo.com
```

El script levanta la web con Docker Compose en `127.0.0.1:3987`, configura el
virtual host de Nginx y, si el dominio ya apunta al VPS, emite el certificado
HTTPS con Certbot. Es idempotente y convive con otras apps en el mismo VPS.

Actualizaciones:

```bash
cd /opt/rutakon && git pull && docker compose up -d --build
```

> **HTTPS es obligatorio**: sin él, iOS bloquea la cámara, la brújula y la
> geolocalización del navegador, y la app no puede funcionar.

## Créditos de datos

- Cimas: © colaboradores de [OpenStreetMap](https://www.openstreetmap.org)
  (consultas vía Overpass API).
- Altitud del terreno: [Open-Meteo](https://open-meteo.com).
