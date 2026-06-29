import { rateLimit, MemoryStore } from "express-rate-limit";
import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
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
      connectTimeout: 3000,
      // Retry up to 10 times with exponential backoff (covers Railway Redis restarts).
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error("Redis: demasiadas tentativas de reconexão");
        return Math.min(retries * 200, 5_000);
      },
    },
  });

  redisClient.on("error", (err) => {
    console.error("[Redis] Erro de ligação:", err.message);
  });

  redisClient.on("ready", () => {
    console.log("[Redis] Ligação estabelecida / restabelecida");
  });

  await redisClient.connect();
  return redisClient;
}

// ---------------------------------------------------------------------------
// ResilientStore — Redis-backed with silent MemoryStore fallback
//
// Why this exists:
//   rate-limit-redis v4 + node-redis v4 have a subtle EVALSHA/NOSCRIPT
//   interaction. On a fresh Redis (script not loaded), EVALSHA returns NOSCRIPT
//   and rate-limit-redis catches it to retry with EVAL — but ONLY if the error
//   is thrown, not swallowed.
//
//   The previous sendCommand wrapper returned 1 on any error, which:
//     • Prevented the NOSCRIPT→EVAL fallback inside rate-limit-redis
//     • Caused parseScriptResponse(1) → TypeError on every request
//     • Surfaced as "express-rate-limit: error from store" on every request
//     • Effectively disabled rate limiting permanently
//
//   Here, sendCommand is the plain node-redis v4 form (no catch wrapper), so
//   NOSCRIPT propagates correctly through rate-limit-redis's own handler.
//   Any other Redis error is caught by ResilientStore.increment/decrement/
//   resetKey and silently handled by MemoryStore — no log noise, rate limiting
//   always active.
// ---------------------------------------------------------------------------
class ResilientStore implements Store {
  private redisStore: RedisStore;
  private memStore: MemoryStore;

  constructor(client: ReturnType<typeof createClient>) {
    this.redisStore = new RedisStore({
      // Correct form for node-redis v4: no error-swallowing wrapper.
      // Errors (NOSCRIPT, network, etc.) propagate to rate-limit-redis,
      // which handles NOSCRIPT by retrying with EVAL internally.
      sendCommand: (...args: string[]) => client.sendCommand(args),
      prefix: "rl:",
    });
    this.memStore = new MemoryStore();
  }

  init(options: Options): void {
    if (typeof this.redisStore.init === "function") this.redisStore.init(options);
    this.memStore.init(options);
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      return await this.redisStore.increment(key);
    } catch {
      return this.memStore.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await this.redisStore.decrement(key);
    } catch {
      await this.memStore.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await this.redisStore.resetKey(key);
    } catch {
      await this.memStore.resetKey(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Key generator — user ID when authenticated, IP otherwise
// ---------------------------------------------------------------------------
function keyGenerator(req: Request): string {
  const userId = (req as any).user?.id;
  if (userId) return `user:${userId}`;

  // X-Forwarded-For is set by Cloudflare; fall back to req.ip
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded?.split(",")[0] ?? req.ip ?? "unknown");
  return `ip:${ip}`;
}

// ---------------------------------------------------------------------------
// Build store — Redis when available (ResilientStore), memory otherwise
// ---------------------------------------------------------------------------
async function buildStore(): Promise<Store | undefined> {
  if (process.env.NODE_ENV !== "production") return undefined;

  try {
    const client = await getRedisClient();
    return new ResilientStore(client);
  } catch {
    console.warn("[RateLimit] Redis indisponível no arranque — rate limiting por instância (memória)");
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
    windowMs: 60 * 60 * 1_000,
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
