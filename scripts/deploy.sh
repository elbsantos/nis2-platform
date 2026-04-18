#!/usr/bin/env bash
# scripts/deploy.sh
# Manual deploy — run on the Hetzner server.
# The CI/CD (GitHub Actions) runs this automatically on push to main.

set -e

APP_DIR="/opt/nis2-platform"
APP_NAME="nis2-platform"

echo "[Deploy] $(date) — starting"

cd "$APP_DIR"

echo "[Deploy] Pulling latest code..."
git pull origin main

echo "[Deploy] Installing dependencies..."
pnpm install --frozen-lockfile --prod

echo "[Deploy] Building..."
pnpm build

echo "[Deploy] Running migrations..."
pnpm db:push

echo "[Deploy] Reloading PM2 (zero-downtime)..."
pm2 reload "$APP_NAME" --update-env

echo "[Deploy] Done — $(date)"
pm2 status "$APP_NAME"
