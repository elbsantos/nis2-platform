import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { createApiLimiter, createAuthLimiter, getRedisClient } from "../middlewares/rateLimit";
import { registerWebhookRoutes } from "../middlewares/webhookHandler";
import { securityHeaders, corsHeaders } from "../middlewares/security";
import { logEnvStatus } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(port, () => s.close(() => resolve(true)));
    s.on("error", () => resolve(false));
  });
}

async function findAvailablePort(start = 3000): Promise<number> {
  for (let p = start; p < start + 20; p++) {
    if (await isPortAvailable(p)) return p;
  }
  throw new Error("No available port found");
}

async function startServer() {
  logEnvStatus();

  const app = express();
  const server = createServer(app);

  // ── 1. Stripe webhook — raw body, BEFORE json parser ───────────────────
  registerWebhookRoutes(app);

  // ── 2. Body parsers ─────────────────────────────────────────────────────
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ── 3. Security headers + CORS ──────────────────────────────────────────
  app.use(corsHeaders);
  app.use(securityHeaders);
  app.use((_req, res, next) => {
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    next();
  });

  // ── 4. Force HTTPS in production ────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
      if (proto !== "https") return res.redirect(301, `https://${req.headers.host}${req.url}`);
      next();
    });
  }

  // ── 5. Rate limiters ────────────────────────────────────────────────────
  const [apiLimiter, authLimiter] = await Promise.all([
    createApiLimiter(),
    createAuthLimiter(),
  ]);
  app.use("/api", apiLimiter);
  app.use("/api/oauth", authLimiter);

  // ── 6. Health check ─────────────────────────────────────────────────────
  app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

  // ── 7. OAuth ────────────────────────────────────────────────────────────
  registerOAuthRoutes(app);

  // ── 8. tRPC ─────────────────────────────────────────────────────────────
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  // ── 9. Vite / Static ────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT ?? "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} busy — using ${port}`);

  server.listen(port, () => {
    console.log(`[NIS2] Server on http://localhost:${port}/`);
  });

  process.on("SIGTERM", async () => {
    console.log("[NIS2] Shutting down…");
    try { await (await getRedisClient()).quit(); } catch {}
    server.close(() => process.exit(0));
  });
}

startServer().catch(console.error);
