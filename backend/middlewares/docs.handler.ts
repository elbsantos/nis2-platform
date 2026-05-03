/**
 * backend/middlewares/docs.handler.ts
 *
 * Express route: GET /api/docs/download/:docId
 * Validates JWT, checks plan gate, streams the file.
 */

import path from "path";
import fs from "fs";
import type { Application, Request, Response } from "express";
import { jwtVerify } from "jose";
import { ENV } from "../_core/env";
import { getDocById, LESSON_DIR } from "../content/docs-catalog";
import { getSubscriptionByOrgId } from "../db-subscriptions";
import { db } from "../db";
import { users } from "../../database/schema";
import { eq } from "drizzle-orm";

const DOCS_BASE = path.resolve(__dirname, "../content/docs");

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf:  "application/pdf",
};

export function registerDocsHandler(app: Application): void {
  app.get("/api/docs/download/:docId", async (req: Request, res: Response) => {
    try {
      // ── 1. Auth ──────────────────────────────────────────────────────────
      const token =
        req.cookies?.["nis2_token"] ??
        req.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      const secret = new TextEncoder().encode(ENV.jwtSecret);
      const { payload } = await jwtVerify(token, secret);
      const userId = payload.sub ? parseInt(payload.sub) : null;

      if (!userId) {
        res.status(401).json({ error: "Token inválido" });
        return;
      }

      // ── 2. Load user + org ───────────────────────────────────────────────
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userRows[0];
      if (!user?.organizationId) {
        res.status(403).json({ error: "Sem organização associada" });
        return;
      }

      // ── 3. Check plan ────────────────────────────────────────────────────
      const sub = await getSubscriptionByOrgId(user.organizationId);
      const plan = sub?.plan ?? "free";

      // ── 4. Resolve document ──────────────────────────────────────────────
      const doc = getDocById(req.params.docId);
      if (!doc) {
        res.status(404).json({ error: "Documento não encontrado" });
        return;
      }

      if (doc.plan === "pro" && plan === "free") {
        res.status(403).json({ error: "Plano Pro ou MSSP necessário para aceder a este documento" });
        return;
      }

      // ── 5. Stream file ───────────────────────────────────────────────────
      const dir      = LESSON_DIR[doc.lessonId];
      const filePath = path.join(DOCS_BASE, dir, doc.filename);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "Ficheiro não disponível" });
        return;
      }

      const mime = MIME[doc.type] ?? "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `attachment; filename="${doc.filename}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      console.error("[Docs] Download error:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  });
}
