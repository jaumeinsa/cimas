# Cimas 🏔️

**¿Qué montañas salen en mi foto?** Sube una foto de montaña (o hazla desde el
móvil) y la app etiqueta sobre la propia imagen las cimas que aparecen, con su
nombre, altitud y distancia. Puedes descargar la foto anotada.

## Cómo funciona

1. **EXIF de la foto** (`exifr`): posición GPS, rumbo de la cámara
   (`GPSImgDirection`) y focal equivalente a 35 mm → campo de visión. Si el
   navegador elimina los metadatos al subir, hay respaldos: geolocalización
   actual, brújula del móvil o coordenadas a mano.
2. **`GET /api/peaks`**: cimas con nombre de OpenStreetMap vía Overpass
   (4 espejos con fallback y caché de 6 h) + altitud del terreno del
   observador (Open-Meteo).
3. **Geometría** (`src/lib/peaks/`): rumbo, distancia y ángulo de elevación de
   cada pico descontando la curvatura terrestre con refracción; heurística de
   oclusión por sectores de azimut.
4. **Proyección sobre canvas** con etiquetas; calibración arrastrando la foto
   (horizontal = rumbo, vertical = inclinación) y controles de rumbo/zoom.
5. **`POST /api/peaks/analyze`** (opcional, requiere `ANTHROPIC_API_KEY`):
   Claude mira la foto con visión y descarta las cimas que no se ven (nubes,
   obstáculos), afinando las posiciones.

## Desarrollo

```bash
npm install
cp .env.example .env   # opcional: ANTHROPIC_API_KEY para la IA
npm run dev            # http://localhost:3000
npm run typecheck
npm run build
```

## Despliegue en un VPS (Docker + Nginx + HTTPS)

Con el repo clonado en el VPS (p. ej. en `/opt/cimas`):

```bash
sudo bash scripts/deploy-vps.sh cimas.tudominio.com tu-email@ejemplo.com
```

El script levanta la web con Docker Compose en `127.0.0.1:3010`, configura el
virtual host de Nginx y, si el dominio ya apunta al VPS, emite el certificado
HTTPS con Certbot. Es idempotente y convive con otras apps en el mismo VPS.

Actualizaciones:

```bash
cd /opt/cimas && git pull && docker compose up -d --build
```

> **HTTPS importa**: sin él, iOS bloquea la brújula y la geolocalización del
> navegador. La vía «subir foto + coordenadas» funciona igualmente.

## Créditos de datos

- Cimas: © colaboradores de [OpenStreetMap](https://www.openstreetmap.org)
  (consultas vía Overpass API).
- Altitud del terreno: [Open-Meteo](https://open-meteo.com).
