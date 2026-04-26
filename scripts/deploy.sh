#!/usr/bin/env bash
# scripts/deploy.sh
#
# Zero-downtime production deploy.
# Executed on the Hetzner server — manually or via GitHub Actions SSH.
#
# Prerequisites on the VPS:
#   - Node 22, PM2, npm installed (run scripts/setup-server.sh first)
#   - /opt/nis2-platform is a git clone of the repo
#   - .env is present in /opt/nis2-platform
#   - PM2 app "nis2-platform" is running (or will start on first deploy)

set -euo pipefail

APP_DIR="/opt/nis2-platform"
APP_NAME="nis2-platform"
LOG_DIR="/var/log/nis2"

echo "[Deploy] =============================="
echo "[Deploy] $(date '+%Y-%m-%d %H:%M:%S') — a iniciar deploy"
echo "[Deploy] =============================="

cd "$APP_DIR"

# ── 1. Pull latest code ────────────────────────────────────────────────────
echo "[Deploy] git pull origin main..."
git pull origin main

# ── 2. Install prod dependencies ───────────────────────────────────────────
echo "[Deploy] npm ci --omit=dev..."
npm ci --omit=dev

# ── 3. Build ──────────────────────────────────────────────────────────────
echo "[Deploy] npm run build..."
npm run build

# ── 4. Database migrations (idempotent) ───────────────────────────────────
echo "[Deploy] npm run db:push..."
npm run db:push

# ── 5. Ensure log directory exists ────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── 6. Reload or start PM2 ────────────────────────────────────────────────
echo "[Deploy] PM2 reload (zero-downtime)..."
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production --update-env
else
  echo "[Deploy] Primeira execução — a iniciar PM2..."
  pm2 start ecosystem.config.cjs --env production
  pm2 save
fi

# ── 7. Smoke test ─────────────────────────────────────────────────────────
echo "[Deploy] Smoke test..."
bash "$APP_DIR/scripts/smoke-test.sh"

echo "[Deploy] =============================="
echo "[Deploy] Sucesso! $(date '+%Y-%m-%d %H:%M:%S')"
echo "[Deploy] =============================="
pm2 status "$APP_NAME"
