import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { createApiLimiter, createAuthLimiter, getRedisClient } from "../middlewares/rateLimit";
import { registerWebhookRoutes } from "../middlewares/webhookHandler";
import { registerDocsHandler } from "../middlewares/docs.handler";
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

  // ── 2. Body parsers + cookie parser ────────────────────────────────────
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

  // ── 3. Health check — before HTTPS redirect so Railway probe works ─────
  app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

  // ── 4. Security headers + CORS ──────────────────────────────────────────
  app.use(corsHeaders);
  app.use(securityHeaders);
  app.use((_req, res, next) => {
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    next();
  });

  // ── 5. Force HTTPS in production ────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
      if (proto !== "https") return res.redirect(301, `https://${req.headers.host}${req.url}`);
      next();
    });
  }

  // ── 6. Rate limiters ────────────────────────────────────────────────────
  const [apiLimiter, authLimiter] = await Promise.all([
    createApiLimiter(),
    createAuthLimiter(),
  ]);
  app.use("/api", apiLimiter);
  app.use("/api/oauth", authLimiter);

  // ── 7. Docs download ────────────────────────────────────────────────────
  registerDocsHandler(app);

  // ── 8. OAuth ────────────────────────────────────────────────────────────
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

// Prevent Redis/DB connection errors from crashing the process after startup
process.on("unhandledRejection", (reason) => {
  console.error("[NIS2] Unhandled rejection (non-fatal):", reason);
});

startServer().catch(console.error);
