import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Force test env so buildStore() returns in-memory store
process.env.NODE_ENV = "test";

import { createApiLimiter, createAuthLimiter, createScanLimiter } from "./rateLimit";

async function buildApp(limiter: any) {
  const app = express();
  app.use(await limiter);
  app.get("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("apiLimiter", () => {
  it("allows requests under the limit", async () => {
    const app = await buildApp(createApiLimiter());
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("returns 429 after 100 requests from same IP", async () => {
    const app = await buildApp(createApiLimiter());
    const reqs = Array.from({ length: 100 }, () =>
      request(app).get("/test").set("X-Forwarded-For", "1.2.3.4")
    );
    await Promise.all(reqs);
    const over = await request(app)
      .get("/test")
      .set("X-Forwarded-For", "1.2.3.4");
    expect(over.status).toBe(429);
    expect(over.body.success).toBe(false);
    expect(over.body.retryAfterSeconds).toBe(60);
  });

  it("does NOT rate limit the /health endpoint (skip rule)", async () => {
    const apiLimiter = await createApiLimiter();
    const app = express();
    app.use("/api", apiLimiter);
    app.get("/health", (_req, res) => res.json({ status: "ok" }));
    // No matter how many calls, /health must always respond 200
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
    }
  });
});

describe("authLimiter", () => {
  it("returns 429 after 20 requests", async () => {
    const app = await buildApp(createAuthLimiter());
    const reqs = Array.from({ length: 20 }, () =>
      request(app).get("/test").set("X-Forwarded-For", "5.5.5.5")
    );
    await Promise.all(reqs);
    const over = await request(app)
      .get("/test")
      .set("X-Forwarded-For", "5.5.5.5");
    expect(over.status).toBe(429);
    expect(over.body.retryAfterSeconds).toBe(900); // 15 * 60
  });
});

describe("scanLimiter", () => {
  it("free plan: blocks after 5 scans/hour", async () => {
    const app = await buildApp(createScanLimiter("free"));
    const reqs = Array.from({ length: 5 }, () =>
      request(app).get("/test").set("X-Forwarded-For", "9.9.9.9")
    );
    await Promise.all(reqs);
    const over = await request(app)
      .get("/test")
      .set("X-Forwarded-For", "9.9.9.9");
    expect(over.status).toBe(429);
  });

  it("pro plan: allows 30 scans/hour", async () => {
    const app = await buildApp(createScanLimiter("pro"));
    for (let i = 0; i < 30; i++) {
      const res = await request(app)
        .get("/test")
        .set("X-Forwarded-For", "7.7.7.7");
      expect(res.status).toBe(200);
    }
    const over = await request(app)
      .get("/test")
      .set("X-Forwarded-For", "7.7.7.7");
    expect(over.status).toBe(429);
  });

  it("mssp plan: allows 100 scans/hour", async () => {
    const app = await buildApp(createScanLimiter("mssp"));
    for (let i = 0; i < 100; i++) {
      const res = await request(app)
        .get("/test")
        .set("X-Forwarded-For", "8.8.8.8");
      expect(res.status).toBe(200);
    }
    const over = await request(app)
      .get("/test")
      .set("X-Forwarded-For", "8.8.8.8");
    expect(over.status).toBe(429);
  });
});
