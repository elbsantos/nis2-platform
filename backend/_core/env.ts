/**
 * server/_core/env.ts
 *
 * Centralised, validated environment configuration.
 * Throws at startup if required variables are missing in production.
 */

function required(key: string): string {
  const val = process.env[key];
  if (!val && process.env.NODE_ENV === "production") {
    throw new Error(`[Env] Required environment variable missing: ${key}`);
  }
  return val ?? "";
}

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const ENV = {
  // ── Server ────────────────────────────────────────────────────────────────
  nodeEnv: optional("NODE_ENV", "development"),
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  port: parseInt(optional("PORT", "3000")),
  appUrl: optional("APP_URL", "http://localhost:3000"),

  // ── Database ──────────────────────────────────────────────────────────────
  // Railway MySQL exposes MYSQL_URL; fallback keeps DATABASE_URL working locally
  databaseUrl: process.env.DATABASE_URL || process.env.MYSQL_URL || (() => { if (process.env.NODE_ENV === "production") throw new Error("[Env] DATABASE_URL or MYSQL_URL required"); return ""; })(),

  // ── Redis ─────────────────────────────────────────────────────────────────
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),

  // ── Auth ──────────────────────────────────────────────────────────────────
  jwtSecret: required("JWT_SECRET"),
  cookieSecret: required("COOKIE_SECRET"),

  // ── OAuth (existing) ──────────────────────────────────────────────────────
  appId: optional("VITE_APP_ID"),
  oAuthServerUrl: optional("OAUTH_SERVER_URL"),
  ownerOpenId: optional("OWNER_OPEN_ID"),

  // ── Shodan ────────────────────────────────────────────────────────────────
  shodanApiKey: optional("SHODAN_API_KEY"), // empty = use free InternetDB

  // ── Censys ────────────────────────────────────────────────────────────────
  censysApiKey: optional("CENSYS_API_KEY"), // Personal Access Token

  // ── Anthropic ─────────────────────────────────────────────────────────────
  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
  anthropicModel: optional("ANTHROPIC_MODEL", "claude-sonnet-4-6"),

  // ── Stripe ────────────────────────────────────────────────────────────────
  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
  stripePricePro: optional("STRIPE_PRICE_PRO"),
  stripePriceMssp: optional("STRIPE_PRICE_MSSP"),
  stripePriceEnterprise: optional("STRIPE_PRICE_ENTERPRISE"),

  // ── Resend (email) ────────────────────────────────────────────────────────
  resendApiKey: optional("RESEND_API_KEY"),
  emailFrom: optional("EMAIL_FROM", "NIS2 Plataforma <noreply@nis2pt.pt>"),

  // ── Internal ──────────────────────────────────────────────────────────────
  forgeApiUrl: optional("BUILT_IN_FORGE_API_URL"),
  forgeApiKey: optional("BUILT_IN_FORGE_API_KEY"),
} as const;

// ---------------------------------------------------------------------------
// Startup validation log (non-blocking in dev)
// ---------------------------------------------------------------------------

const OPTIONAL_BUT_WARN = [
  ["SHODAN_API_KEY", "Scanner usará InternetDB (gratuito, menos detalhe)"],
  ["CENSYS_API_KEY", "Análise TLS/certificados desactivada"],
  ["ANTHROPIC_API_KEY", "Questionário IA e remediação desactivados"],
  ["STRIPE_SECRET_KEY", "Billing desactivado — todos os utilizadores em Free"],
  ["RESEND_API_KEY", "Emails transaccionais desactivados"],
] as const;

export function logEnvStatus(): void {
  const missing = OPTIONAL_BUT_WARN.filter(([key]) => !process.env[key]);
  if (missing.length > 0) {
    console.warn("[Env] Optional variables not set:");
    for (const [key, note] of missing) {
      console.warn(`  ⚠  ${key} — ${note}`);
    }
  }
}
