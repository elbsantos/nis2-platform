#!/usr/bin/env bash
# scripts/setup-server.sh
#
# Bootstrap a fresh Hetzner Ubuntu 24.04 VPS for NIS2 Plataforma PT.
# Run once as root (or sudo) after provisioning the server.
#
# Usage:
#   ssh root@<IP> "bash -s" < scripts/setup-server.sh
#
# What this script does:
#   1. System updates
#   2. Firewall (UFW): 22 + 80 + 443
#   3. Node.js 22 via NodeSource
#   4. PM2 + pm2-logrotate
#   5. MySQL 8
#   6. Redis 7
#   7. Nginx
#   8. Certbot (Let's Encrypt)
#   9. App user + directory /opt/nis2-platform
#  10. Log directory /var/log/nis2

set -euo pipefail

DOMAIN="${DOMAIN:-nis2pt.pt}"
APP_DIR="/opt/nis2-platform"
APP_USER="nis2"
LOG_DIR="/var/log/nis2"
MYSQL_DB="nis2db"
MYSQL_USER="nis2user"
MYSQL_PASS="$(openssl rand -base64 24)"

echo "============================================"
echo " NIS2 Plataforma PT — Server Setup"
echo " Domain : $DOMAIN"
echo " Dir    : $APP_DIR"
echo "============================================"

# ── 1. System updates ─────────────────────────────────────────────────────
echo "[Setup] A actualizar pacotes..."
apt-get update -y
apt-get upgrade -y
apt-get install -y curl wget git unzip ufw fail2ban

# ── 2. Firewall ───────────────────────────────────────────────────────────
echo "[Setup] A configurar UFW..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"
ufw --force enable
echo "[Setup] UFW activado."

# ── 3. Node.js 22 ─────────────────────────────────────────────────────────
echo "[Setup] A instalar Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node --version
npm --version

# ── 4. PM2 ────────────────────────────────────────────────────────────────
echo "[Setup] A instalar PM2..."
npm install -g pm2 pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

# ── 5. MySQL 8 ────────────────────────────────────────────────────────────
echo "[Setup] A instalar MySQL 8..."
apt-get install -y mysql-server
systemctl enable mysql
systemctl start mysql

# Create DB + user
mysql -u root <<SQL
  CREATE DATABASE IF NOT EXISTS \`${MYSQL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASS}';
  GRANT ALL PRIVILEGES ON \`${MYSQL_DB}\`.* TO '${MYSQL_USER}'@'localhost';
  FLUSH PRIVILEGES;
SQL
echo "[Setup] MySQL configurado. Guarda estas credenciais:"
echo "  DB_USER : ${MYSQL_USER}"
echo "  DB_PASS : ${MYSQL_PASS}  ← copiar para .env"

# ── 6. Redis 7 ────────────────────────────────────────────────────────────
echo "[Setup] A instalar Redis..."
apt-get install -y redis-server
# Bind to localhost only
sed -i 's/^# bind 127.0.0.1/bind 127.0.0.1/' /etc/redis/redis.conf
sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf
systemctl enable redis-server
systemctl restart redis-server
redis-cli ping

# ── 7. Nginx ──────────────────────────────────────────────────────────────
echo "[Setup] A instalar Nginx..."
apt-get install -y nginx
systemctl enable nginx

# Copy site config
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/nis2pt.conf 2>/dev/null || \
  echo "[Setup] AVISO: nginx.conf não encontrado em $APP_DIR/deploy/ — copia manualmente."

ln -sf /etc/nginx/sites-available/nis2pt.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 8. Certbot ────────────────────────────────────────────────────────────
echo "[Setup] A instalar Certbot (Let's Encrypt)..."
apt-get install -y certbot python3-certbot-nginx
echo "[Setup] Para obter o certificado SSL, executa:"
echo "  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN}"

# ── 9. App user + directory ───────────────────────────────────────────────
echo "[Setup] A criar utilizador e directório da app..."
id -u "$APP_USER" &>/dev/null || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$LOG_DIR"

# ── 10. Summary ───────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo " Setup concluído!"
echo "============================================"
echo ""
echo "Próximos passos:"
echo ""
echo "  1. Clonar o repositório:"
echo "     cd /opt && git clone git@github.com:<user>/nis2-platform.git nis2-platform"
echo "     chown -R $APP_USER:$APP_USER $APP_DIR"
echo ""
echo "  2. Criar o ficheiro .env:"
echo "     cp $APP_DIR/.env.example $APP_DIR/.env"
echo "     nano $APP_DIR/.env"
echo "     # Preencher DATABASE_URL com: mysql://${MYSQL_USER}:${MYSQL_PASS}@localhost:3306/${MYSQL_DB}"
echo ""
echo "  3. Fazer o primeiro deploy:"
echo "     bash $APP_DIR/scripts/deploy.sh"
echo ""
echo "  4. Obter certificado SSL:"
echo "     certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN}"
echo ""
echo "  5. Adicionar ao GitHub Secrets:"
echo "     HETZNER_HOST, HETZNER_USER (root ou $APP_USER), HETZNER_SSH_KEY"
echo ""
