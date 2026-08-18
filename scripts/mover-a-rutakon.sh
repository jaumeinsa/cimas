#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Rutakon — reorganización de dominios en el VPS:
#
#   rutakon.com        → la app de fotos (identificar cimas)  [este repo]
#   rutas.rutakon.com  → el planificador de rutas que ya servía rutakon.com
#
# Uso (desde la raíz del repo, en el VPS):
#   sudo bash scripts/mover-a-rutakon.sh tu-email@ejemplo.com
#
# Requiere que en el DNS exista también:  A  rutas  →  IP del VPS
# Es idempotente. Hace copia de seguridad de cada vhost antes de tocarlo.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

EMAIL="${1:-}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
warn() { printf "\n\033[1;33m⚠ %s\033[0m\n" "$*"; }

# ── 1. Localizar el vhost del planificador (sirve rutakon.com y no es fotos-*)
PLANNER=""
for f in /etc/nginx/sites-enabled/*; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in fotos-*) continue ;; esac
  if grep -qE 'server_name[^;]*rutakon\.com' "$f" 2>/dev/null; then
    PLANNER="$f"
    break
  fi
done

if [ -n "$PLANNER" ]; then
  REAL="$(readlink -f "$PLANNER")"
  if grep -qE 'server_name[^;]*rutas\.rutakon\.com' "$REAL" && ! grep -qE 'server_name[^;]*(^|[ \t])rutakon\.com' "$REAL"; then
    echo "  El planificador ya está en rutas.rutakon.com."
  else
    log "Planificador encontrado en ${REAL} → pasa a rutas.rutakon.com"
    cp "$REAL" "${REAL}.bak-fotos"
    # Sustituye TODAS las líneas server_name que mencionen rutakon.com
    sed -i -E 's/(^[[:space:]]*server_name)[^;]*rutakon\.com[^;]*;/\1 rutas.rutakon.com;/' "$REAL"
    if nginx -t; then
      systemctl reload nginx
      echo "  Hecho (copia de seguridad en ${REAL}.bak-fotos)."
    else
      warn "nginx -t falló: restauro la copia y aborto."
      cp "${REAL}.bak-fotos" "$REAL"
      nginx -t && systemctl reload nginx
      exit 1
    fi
  fi
else
  warn "No hay ningún vhost con rutakon.com aparte del de fotos."
  echo "  Si el planificador sirve como sitio 'default', dime la salida de:"
  echo "    grep -r server_name /etc/nginx/sites-enabled/"
  echo "  Sigo con el despliegue de la app de fotos igualmente."
fi

# ── 2. App de fotos en rutakon.com (usa el despliegue normal, idempotente)
log "Desplegando la app de fotos en rutakon.com"
bash "${APP_DIR}/scripts/deploy-vps.sh" rutakon.com "$EMAIL"

# ── 3. Certificado HTTPS para el planificador en su nuevo subdominio
SERVER_IP="$(curl -fsS --max-time 5 https://api.ipify.org || echo "")"
RUTAS_IP="$(getent ahostsv4 rutas.rutakon.com | awk '{print $1; exit}' || echo "")"
if [ -n "$SERVER_IP" ] && [ "$RUTAS_IP" = "$SERVER_IP" ]; then
  CERTBOT_EMAIL_ARG="--register-unsafely-without-email"
  [ -n "$EMAIL" ] && CERTBOT_EMAIL_ARG="-m ${EMAIL}"
  log "Certificado HTTPS para rutas.rutakon.com"
  certbot --nginx -d rutas.rutakon.com --non-interactive --agree-tos --redirect ${CERTBOT_EMAIL_ARG} || \
    warn "Certbot falló para rutas.rutakon.com; reintenta más tarde con: sudo certbot --nginx -d rutas.rutakon.com --redirect --agree-tos -m ${EMAIL:-tu-email}"
else
  warn "rutas.rutakon.com aún no resuelve a este VPS."
  echo "  Crea en el DNS:  A  rutas  →  ${SERVER_IP:-IP-del-VPS}  y reejecuta:"
  echo "    sudo certbot --nginx -d rutas.rutakon.com --redirect --agree-tos -m ${EMAIL:-tu-email}"
fi

log "Reorganización terminada."
echo "Fotos (cimas):  https://rutakon.com"
echo "Planificador:   https://rutas.rutakon.com"
