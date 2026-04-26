#!/usr/bin/env bash
# scripts/smoke-test.sh
#
# Post-deploy smoke tests.
# Verifies that critical endpoints are responding correctly.
# Exits with 1 if any check fails, causing the deploy to abort.

set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

# ── Helpers ───────────────────────────────────────────────────────────────

green() { echo -e "\033[32m✓\033[0m $1"; }
red()   { echo -e "\033[31m✗\033[0m $1"; }

check_http() {
  local label="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local expected_body="${4:-}"

  local http_code
  local body
  body=$(curl -s -o /tmp/smoke_body -w "%{http_code}" --max-time 10 "$url" || echo "000")
  http_code="$body"
  body=$(cat /tmp/smoke_body 2>/dev/null || echo "")

  if [[ "$http_code" != "$expected_status" ]]; then
    red "$label — esperado HTTP $expected_status, recebido $http_code"
    FAIL=$((FAIL + 1))
    return
  fi

  if [[ -n "$expected_body" ]] && ! echo "$body" | grep -q "$expected_body"; then
    red "$label — resposta não contém: $expected_body"
    FAIL=$((FAIL + 1))
    return
  fi

  green "$label"
  PASS=$((PASS + 1))
}

# ── Tests ─────────────────────────────────────────────────────────────────

echo ""
echo "[Smoke] A testar: $BASE_URL"
echo "──────────────────────────────────────────"

# 1. Health endpoint
check_http "GET /health → 200 + {status:ok}" \
  "$BASE_URL/health" 200 '"status":"ok"'

# 2. tRPC batch endpoint responds (even unauthenticated = 401, not 500)
check_http "GET /api/trpc — servidor tRPC activo" \
  "$BASE_URL/api/trpc/scan.getHistory" 401

# 3. Static SPA index.html served
check_http "GET / → HTML da SPA" \
  "$BASE_URL/" 200 "<html"

# 4. 404 for completely unknown route returns HTML (SPA catch-all)
check_http "GET /nao-existe → SPA fallback 200" \
  "$BASE_URL/nao-existe" 200 "<html"

# 5. No server error on oauth init route (redirects = 302)
check_http "GET /api/oauth/login → redirect ou 400 (não 500)" \
  "$BASE_URL/api/oauth/login" 302

echo "──────────────────────────────────────────"
echo "[Smoke] Passed: $PASS  Failed: $FAIL"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "[Smoke] FALHOU — a abortar deploy."
  exit 1
fi

echo "[Smoke] Todos os testes passaram."
