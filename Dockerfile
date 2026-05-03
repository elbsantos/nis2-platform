# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — Builder
# Installs all deps, type-checks, and compiles server + client bundles.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 — Runner (production image)
# Minimal image: only prod deps + compiled output.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production

# Non-root user for least-privilege execution
RUN addgroup -S nis2 && adduser -S nis2 -G nis2
WORKDIR /app

# Only install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled assets from builder
COPY --from=builder /app/dist ./dist

# drizzle-kit needs the config and schema to run push/migrate
COPY drizzle.config.ts ./
COPY database/ ./database/

# Course documents served at runtime
COPY backend/content/ ./backend/content/

# Switch to non-root user
USER nis2

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/backend/backend/_core/index.js"]
