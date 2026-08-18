#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Rutakon — despliegue en VPS (Docker + Nginx + HTTPS)
#
# Uso (desde la raíz del repo, en el VPS):
#   sudo bash scripts/deploy-vps.sh rutakon.com tu-email@ejemplo.com
#
# Hace:
#   1. Genera .env si no existe.
#   2. Levanta la web con Docker Compose (127.0.0.1:3010).
#   3. Configura Nginx como proxy inverso del dominio.
#   4. Si el dominio ya resuelve a este VPS, emite el certificado HTTPS.
#
# Es idempotente y convive con otras apps del mismo VPS (usa su propio
# puerto, 3010, y su propio virtual host).
#
# Si exportas ANTHROPIC_API_KEY antes de ejecutarlo, la escribe en el
# .env generado:
#   ANTHROPIC_API_KEY="sk-ant-..." sudo -E bash scripts/deploy-vps.sh dominio email
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:?Uso: deploy-vps.sh <dominio> [email]}"
EMAIL="${2:-}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

log() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
warn() { printf "\n\033[1;33m⚠ %s\033[0m\n" "$*"; }

# ── 1. .env ──────────────────────────────────────────────────
if [ ! -f .env ]; then
  log "Generando .env"
  cat > .env <<EOF
NEXT_PUBLIC_APP_URL="https://${DOMAIN}"
NODE_ENV="production"

# Clave de la API de Anthropic para «Verificar con IA» (opcional).
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
EOF
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo "  .env creado con ANTHROPIC_API_KEY."
  else
    echo "  .env creado. Edítalo para añadir ANTHROPIC_API_KEY si quieres la IA."
  fi
else
  echo "  .env ya existe, se reutiliza."
fi

# ── 2. Docker Compose ────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Instalando Docker"
  curl -fsSL https://get.docker.com | sh
fi

log "Construyendo y levantando el contenedor"
docker compose up -d --build

log "Esperando a que la web responda en 127.0.0.1:3010"
for i in $(seq 1 60); do
  if curl -fsS --max-time 3 http://127.0.0.1:3010/api/health >/dev/null 2>&1; then
    echo "  Web arriba."
    break
  fi
  sleep 2
  [ "$i" = "60" ] && warn "La web tarda en arrancar; revisa 'docker compose logs web'."
done

# ── 3. Nginx ─────────────────────────────────────────────────
if ! command -v nginx >/dev/null 2>&1; then
  log "Instalando Nginx"
  apt-get update -y && apt-get install -y nginx
fi

log "Configurando el virtual host de Nginx"
cat > /etc/nginx/sites-available/rutakon <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Las fotos que se mandan a la verificación con IA pueden pesar varios MB.
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 180s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/rutakon /etc/nginx/sites-enabled/rutakon
nginx -t && systemctl reload nginx
echo "  Nginx sirviendo en HTTP."

# ── 4. HTTPS (Certbot) ───────────────────────────────────────
SERVER_IP="$(curl -fsS --max-time 5 https://api.ipify.org || echo "")"
DOMAIN_IP="$(getent ahostsv4 "${DOMAIN}" | awk '{print $1; exit}' || echo "")"

log "Comprobando DNS: ${DOMAIN} -> ${DOMAIN_IP:-(sin resolver)} | este VPS -> ${SERVER_IP:-?}"

if [ -n "$SERVER_IP" ] && [ "$DOMAIN_IP" = "$SERVER_IP" ]; then
  if ! command -v certbot >/dev/null 2>&1; then
    log "Instalando Certbot"
    apt-get install -y certbot python3-certbot-nginx
  fi
  log "Emitiendo certificado HTTPS"
  CERTBOT_EMAIL_ARG="--register-unsafely-without-email"
  [ -n "$EMAIL" ] && CERTBOT_EMAIL_ARG="-m ${EMAIL}"
  # Incluye www solo si tambien apunta a este VPS.
  WWW_IP="$(getent ahostsv4 "www.${DOMAIN}" | awk '{print $1; exit}' || echo "")"
  CERT_DOMAINS="-d ${DOMAIN}"
  [ "$WWW_IP" = "$SERVER_IP" ] && CERT_DOMAINS="${CERT_DOMAINS} -d www.${DOMAIN}"
  certbot --nginx ${CERT_DOMAINS} \
    --non-interactive --agree-tos --redirect ${CERTBOT_EMAIL_ARG}
  echo "  HTTPS activo: https://${DOMAIN}"
else
  warn "El dominio aún NO resuelve a este VPS (${SERVER_IP:-?})."
  echo "  1) En tu gestor DNS, crea registros A:  @ y www  ->  ${SERVER_IP:-IP-del-VPS}"
  echo "  2) Espera a la propagación (minutos a horas)."
  echo "  3) Vuelve a ejecutar este script, o solo el certbot:"
  echo "       sudo certbot --nginx -d ${DOMAIN} --agree-tos --redirect -m ${EMAIL:-tu-email@ejemplo.com}"
  echo "  (Sin HTTPS, iOS bloquea brújula y geolocalización; la subida de fotos sí funciona.)"
fi

log "Despliegue terminado."
echo "App: http://127.0.0.1:3010  ·  Público: http(s)://${DOMAIN}"
echo "Logs:   docker compose logs -f web"
echo "Estado: docker compose ps"
