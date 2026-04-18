import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  createApiLimiter,
  createAuthLimiter,
  getRedisClient,
} from "../middlewares/rateLimit";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ---- Body parser -------------------------------------------------------
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ---- Security headers --------------------------------------------------
  app.use((_req, res, next) => {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // ---- Force HTTPS in production -----------------------------------------
  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      const proto =
        req.headers["x-forwarded-proto"] ?? req.protocol;
      if (proto !== "https") {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
  }

  // ---- Rate limiters (initialised once, reused per request) --------------
  const apiLimiter = await createApiLimiter();
  const authLimiter = await createAuthLimiter();

  // General API rate limit — all /api/* routes
  app.use("/api", apiLimiter);

  // Stricter limit for auth routes
  app.use("/api/oauth", authLimiter);

  // ---- Health check (not rate limited) -----------------------------------
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  // ---- OAuth callback under /api/oauth/callback --------------------------
  registerOAuthRoutes(app);

  // ---- tRPC API ----------------------------------------------------------
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ---- Static / Vite -----------------------------------------------------
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT ?? "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[NIS2] Server running on http://localhost:${port}/`);
    console.log(
      `[NIS2] Rate limiting: ${process.env.REDIS_URL ? "Redis" : "in-memory (set REDIS_URL for production)"}`
    );
  });

  // ---- Graceful shutdown -------------------------------------------------
  process.on("SIGTERM", async () => {
    console.log("[NIS2] SIGTERM — shutting down gracefully");
    try {
      const redis = await getRedisClient();
      await redis.quit();
    } catch {}
    server.close(() => process.exit(0));
  });
}

startServer().catch(console.error);
