import { rateLimit, MemoryStore } from "express-rate-limit";
import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Redis client — shared singleton with connection stability hardening
//
// DIAGNÓSTICO (fix/redis-connection-stability):
//   • Causa raiz: REDIS_URL aponta para o proxy público Railway, que corta
//     ligações ociosas ao fim de ~30 s → ciclo "Socket closed / Reconectado".
//   • Fix principal: preferir REDIS_PRIVATE_URL (rede interna Railway).
//     Serviço-a-serviço DEVE usar endereços internos *.railway.internal.
//   • Fix secundário: TCP keepAlive + PING aplicacional a cada 45 s para que
//     a ligação não fique ociosa mesmo quando não há comandos Redis.
//   • Fix terciário: dedup de logs de erro (mesmo msg = não repetir) +
//     promise-lock para evitar dois createClient() simultâneos em Promise.all.
//
// Cliente: node-redis v4 (package "redis")
// ---------------------------------------------------------------------------

type RedisClient = ReturnType<typeof createClient>;

let _client: RedisClient | null = null;
let _connecting: Promise<RedisClient> | null = null;  // lock para Promise.all
let _pingTimer: ReturnType<typeof setInterval> | null = null;

export async function getRedisClient(): Promise<RedisClient> {
  // Fast path: já ligado
  if (_client?.isOpen) return _client;

  // Se há uma ligação em curso (ex.: Promise.all com múltiplos buildStore),
  // aguardar o mesmo promise em vez de criar um segundo cliente.
  if (_connecting) return _connecting;

  _connecting = _doConnect().finally(() => { _connecting = null; });
  return _connecting;
}

async function _doConnect(): Promise<RedisClient> {
  // URL priority: rede interna Railway → proxy público → localhost dev
  // O proxy público (REDIS_URL) corta ligações ociosas e nunca deve ser
  // usado para comunicação serviço-a-serviço em Railway.
  const redisUrl =
    process.env.REDIS_PRIVATE_URL ??
    process.env.REDIS_URL ??
    "redis://localhost:6379";

  // Log URL mascarando a password (entre ':' e '@')
  const safeUrl = redisUrl.replace(/:([^:@/][^@]*)@/, ":***@");
  console.log(`[Redis] A ligar: ${safeUrl}`);

  if (process.env.REDIS_PRIVATE_URL) {
    console.log("[Redis] A usar rede interna Railway (REDIS_PRIVATE_URL) ✓");
  } else if (process.env.REDIS_URL) {
    console.warn("[Redis] REDIS_PRIVATE_URL não definida — a usar REDIS_URL (proxy público). " +
      "Define REDIS_PRIVATE_URL no Railway para ligação estável.");
  }

  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5_000,
      // TCP keepAlive: envia probes ao nível do OS a cada 30 s.
      // Evita que NATs/firewalls fechem a ligação por inactividade.
      keepAlive: 30_000,
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error("Redis: demasiadas tentativas de reconexão, a desistir");
        return Math.min(retries * 300, 5_000);   // backoff: 300ms → 5 s
      },
    },
  });

  // ── Logging de eventos ──────────────────────────────────────────────────
  let lastErrMsg = "";
  let reconnectAttempts = 0;

  client.on("error", (err: Error) => {
    const msg = err.message ?? String(err);
    // Dedup: "Socket closed unexpectedly" dispara em cada tentativa de reconnect.
    // Registar apenas quando a mensagem muda para não inundar os logs.
    if (msg === lastErrMsg) return;
    lastErrMsg = msg;
    console.error("[Redis] Erro de ligação:", msg);
  });

  client.on("reconnecting", () => {
    reconnectAttempts++;
    if (reconnectAttempts === 1) {
      // Só no primeiro evento: comunicar que a ligação foi perdida.
      console.warn("[Redis] Ligação perdida — a tentar reconectar...");
    }
  });

  client.on("ready", () => {
    lastErrMsg = "";         // reset dedup: próxima desconexão deve ser registada
    if (reconnectAttempts > 0) {
      console.log(`[Redis] Reconectado após ${reconnectAttempts} tentativa(s)`);
      reconnectAttempts = 0;
    }
    _startPing(client);
  });

  client.on("end", () => {
    // A ligação foi permanentemente encerrada (reconnect desistiu ou quit()).
    _stopPing();
  });

  await client.connect();
  _client = client;
  return client;
}

// ── PING aplicacional ───────────────────────────────────────────────────────
// Envia PING a cada 45 s para manter a ligação activa mesmo sem comandos.
// Complementa o TCP keepAlive — alguns proxies fecham ao nível aplicacional
// independentemente do keepAlive TCP.

function _startPing(client: RedisClient): void {
  _stopPing();
  _pingTimer = setInterval(async () => {
    try {
      if (client.isOpen) await client.ping();
    } catch {
      // Silenciar: a lógica de reconnect trata das falhas
    }
  }, 45_000);
}

function _stopPing(): void {
  if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null; }
}

// ---------------------------------------------------------------------------
// ResilientStore — Redis-backed com fallback silencioso para MemoryStore
//
// Porquê: rate-limit-redis v4 + node-redis v4 têm interacção EVALSHA/NOSCRIPT:
//   • EVALSHA falha na primeira vez (script não carregado) → NOSCRIPT → lançado
//   • rate-limit-redis apanha NOSCRIPT e faz retry com EVAL — mas só se o erro
//     for lançado. O wrapper anterior devolvia 1, impedindo o fallback.
//   • Aqui: sendCommand é o form correcto (sem catch wrapper), erros propagam.
//   • ResilientStore apanha erros em increment/decrement/resetKey e cai
//     silenciosamente para MemoryStore — sem logs "error from store".
// ---------------------------------------------------------------------------
class ResilientStore implements Store {
  private redisStore: RedisStore;
  private memStore: MemoryStore;

  constructor(client: RedisClient) {
    this.redisStore = new RedisStore({
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
    try { return await this.redisStore.increment(key); } catch { return this.memStore.increment(key); }
  }

  async decrement(key: string): Promise<void> {
    try { await this.redisStore.decrement(key); } catch { await this.memStore.decrement(key); }
  }

  async resetKey(key: string): Promise<void> {
    try { await this.redisStore.resetKey(key); } catch { await this.memStore.resetKey(key); }
  }
}

// ---------------------------------------------------------------------------
// Key generator — user ID quando autenticado, IP caso contrário
// ---------------------------------------------------------------------------
function keyGenerator(req: Request): string {
  const userId = (req as any).user?.id;
  if (userId) return `user:${userId}`;

  // X-Forwarded-For é definido pelo Cloudflare; fallback para req.ip
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded?.split(",")[0] ?? req.ip ?? "unknown");
  return `ip:${ip}`;
}

// ---------------------------------------------------------------------------
// Build store — Redis quando disponível (ResilientStore), memória caso contrário
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
// Resposta partilhada para 429
// ---------------------------------------------------------------------------
function tooManyRequestsHandler(
  _req: Request,
  res: Response,
  _next: NextFunction,
  message: string,
  retryAfterSeconds: number
) {
  res.status(429).json({ success: false, error: message, retryAfterSeconds });
}

// ---------------------------------------------------------------------------
// 1. API limiter — /api/*  →  100 req / min
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
    skip: (req) => req.path === "/health" || req.path.startsWith("/api/trpc/system.") || req.path.startsWith("/api/auth/"),
    handler: (req, res, next) =>
      tooManyRequestsHandler(req, res, next, "Demasiados pedidos. Tenta novamente dentro de 1 minuto.", 60),
  });
}

// ---------------------------------------------------------------------------
// 2. Auth limiter — /api/auth/*  →  20 req / 15 min (brute-force protection)
//    Exclui /api/auth/forgot-password (coberto pelo limiter dedicado abaixo).
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
    skip: (req) => req.path.startsWith("/api/auth/forgot-password"),
    handler: (req, res, next) =>
      tooManyRequestsHandler(req, res, next, "Demasiadas tentativas de autenticação. Espera 15 minutos.", 15 * 60),
  });
}

// ---------------------------------------------------------------------------
// 3. Forgot-password limiter — /api/auth/forgot-password  →  5 req / 15 min
//    Mais restritivo que o authLimiter geral: previne disparo em massa de
//    emails de reset sem autenticação.
// ---------------------------------------------------------------------------
export async function createForgotPasswordLimiter() {
  const store = await buildStore();
  return rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator,
    store,
    passOnStoreError: true,
    handler: (req, res, next) =>
      tooManyRequestsHandler(req, res, next, "Demasiados pedidos de reset. Espera 15 minutos.", 15 * 60),
  });
}

// ---------------------------------------------------------------------------
// 3. Scan limiter — heavy external API calls (Shodan + Censys)
//    Free: 5/h  |  Pro: 30/h  |  MSSP: 100/h
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
        req, res, next,
        `Limite de scans atingido para o teu plano (${limits[plan]}/hora). Faz upgrade ou aguarda.`,
        3600
      ),
  });
}
