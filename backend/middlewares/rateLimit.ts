import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Redis client — shared singleton
// ---------------------------------------------------------------------------
let redisClient: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (redisClient && redisClient.isOpen) return redisClient;

  redisClient = createClient({
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => {
        if (retries > 3) return new Error("Redis unavailable");
        return Math.min(retries * 100, 1000);
      },
    },
  });

  redisClient.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message);
  });

  redisClient.on("reconnecting", () => {
    console.warn("[Redis] Reconnecting…");
  });

  await redisClient.connect();
  console.log("[Redis] Connected");
  return redisClient;
}

// ---------------------------------------------------------------------------
// Key generator — user ID when authenticated, IP otherwise
// ---------------------------------------------------------------------------
function keyGenerator(req: Request): string {
  const userId = (req as any).user?.id;
  if (userId) return `rl:user:${userId}`;

  // X-Forwarded-For is set by Cloudflare; fall back to req.ip
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded?.split(",")[0] ?? req.ip ?? "unknown");
  return `rl:ip:${ip}`;
}

// ---------------------------------------------------------------------------
// Build store — Redis when available, memory fallback otherwise
// ---------------------------------------------------------------------------
async function buildStore() {
  if (process.env.NODE_ENV !== "production") return undefined; // dev/test: memory store

  try {
    const client = await getRedisClient();
    return new RedisStore({
      // Wrap sendCommand so a disconnected Redis never crashes the middleware.
      // When Redis is down we return 1 (first hit in window) — effectively
      // disabling rate limiting rather than taking the API offline.
      sendCommand: async (...args: string[]) => {
        try {
          if (!client.isOpen) return 1;
          return await client.sendCommand(args);
        } catch {
          return 1; // fail-open: allow request, don't crash
        }
      },
      prefix: "rl:",
    });
  } catch {
    console.warn("[RateLimit] Redis unavailable — falling back to in-memory store");
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Shared error response shape
// ---------------------------------------------------------------------------
function tooManyRequestsHandler(
  _req: Request,
  res: Response,
  _next: NextFunction,
  message: string,
  retryAfterSeconds: number
) {
  res.status(429).json({
    success: false,
    error: message,
    retryAfterSeconds,
  });
}

// ---------------------------------------------------------------------------
// 1. General API limiter — applies to /api/*
//    100 req / min per user-or-IP
// ---------------------------------------------------------------------------
export async function createApiLimiter() {
  const store = await buildStore();

  return rateLimit({
    windowMs: 60 * 1_000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator,
    store,
    passOnStoreError: true,
    skip: (req) =>
      req.path === "/health" || req.path.startsWith("/api/trpc/system."),
    handler: (req, res, next) =>
      tooManyRequestsHandler(
        req,
        res,
        next,
        "Demasiados pedidos. Tenta novamente dentro de 1 minuto.",
        60
      ),
  });
}

// ---------------------------------------------------------------------------
// 2. Auth limiter — /api/oauth/* and login mutations
//    20 req / 15 min — brute-force protection
// ---------------------------------------------------------------------------
export async function createAuthLimiter() {
  const store = await buildStore();

  return rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator,
    store,
    passOnStoreError: true,
    handler: (req, res, next) =>
      tooManyRequestsHandler(
        req,
        res,
        next,
        "Demasiadas tentativas de autenticação. Espera 15 minutos.",
        15 * 60
      ),
  });
}

// ---------------------------------------------------------------------------
// 3. Scan limiter — heavy external API calls (Shodan + Censys)
//    Free:  5 / hour
//    Pro:   30 / hour
//    MSSP:  100 / hour
//    Applied in the scan tRPC procedure via planGuard (see plan-guard.ts)
// ---------------------------------------------------------------------------
export async function createScanLimiter(plan: "free" | "pro" | "mssp" = "free") {
  const limits: Record<typeof plan, number> = { free: 5, pro: 30, mssp: 100 };
  const store = await buildStore();

  return rateLimit({
    windowMs: 60 * 60 * 1_000, // 1 hour
    limit: limits[plan],
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator,
    store,
    passOnStoreError: true,
    handler: (req, res, next) =>
      tooManyRequestsHandler(
        req,
        res,
        next,
        `Limite de scans atingido para o teu plano (${limits[plan]}/hora). Faz upgrade ou aguarda.`,
        3600
      ),
  });
}
