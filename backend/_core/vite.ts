/**
 * server/_core/vite.ts
 *
 * Vite dev server integration (middleware mode) + static file serving for prod.
 */

import path from "path";
import fs from "fs";
import type { Application } from "express";
import type { Server } from "http";

export async function setupVite(app: Application, _server: Server): Promise<void> {
  const { createServer: createViteServer } = await import("vite");

  const vite = await createViteServer({
    configFile: path.resolve(process.cwd(), "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);

  // Fallback: serve index.html for all non-API routes (SPA routing)
  app.use("*", async (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();

    try {
      const template = fs.readFileSync(
        path.resolve(process.cwd(), "frontend/index.html"),
        "utf-8"
      );
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Application): void {
  const distPath = path.resolve(process.cwd(), "dist/public");

  if (!fs.existsSync(distPath)) {
    console.warn("[Static] dist/public not found — run `pnpm build` first");
    return;
  }

  const express = require("express");
  app.use(express.static(distPath));

  app.get("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
