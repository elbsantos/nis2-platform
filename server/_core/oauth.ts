/**
 * server/_core/oauth.ts
 *
 * Auth routes: register, login, logout, /me.
 * Uses JWT stored in httpOnly cookie (auth_token).
 */

import type { Application } from "express";
import { SignJWT } from "jose";
import { createHash } from "crypto";
import { getUserByEmail, createUser, createOrganization, getOrganizationByOwnerId } from "../db";

const COOKIE_NAME = "auth_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "dev-secret-change-in-production-min-32-chars";
  return new TextEncoder().encode(secret);
}

function hashPassword(password: string): string {
  return createHash("sha256")
    .update(password + (process.env.COOKIE_SECRET ?? "salt"))
    .digest("hex");
}

async function signToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export function registerOAuthRoutes(app: Application): void {
  // ── POST /api/auth/register ──────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name, orgName } = req.body as {
        email?: string;
        password?: string;
        name?: string;
        orgName?: string;
      };

      if (!email || !password || !orgName) {
        res.status(400).json({ error: "email, password e orgName são obrigatórios" });
        return;
      }

      const existing = await getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: "Este email já está registado" });
        return;
      }

      const passwordHash = hashPassword(password);
      const user = await createUser({ email, name, passwordHash, role: "admin" });

      const org = await createOrganization({ name: orgName, ownerId: user.id });

      await import("../db").then(({ getDb }) => {
        const { users } = require("../../drizzle/schema");
        const { eq } = require("drizzle-orm");
        return getDb()
          .update(users)
          .set({ organizationId: org.id })
          .where(eq(users.id, user.id));
      });

      const token = await signToken(user.id);
      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      res.json({ id: user.id, email, name, orgId: org.id });
    } catch (err) {
      console.error("[Auth] Register error:", err);
      res.status(500).json({ error: "Erro ao registar" });
    }
  });

  // ── POST /api/auth/login ─────────────────────────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email || !password) {
        res.status(400).json({ error: "email e password são obrigatórios" });
        return;
      }

      const user = await getUserByEmail(email);
      if (!user || user.passwordHash !== hashPassword(password)) {
        res.status(401).json({ error: "Credenciais inválidas" });
        return;
      }

      const token = await signToken(user.id);
      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      res.json({ id: user.id, email: user.email, name: user.name });
    } catch (err) {
      console.error("[Auth] Login error:", err);
      res.status(500).json({ error: "Erro ao fazer login" });
    }
  });

  // ── POST /api/auth/logout ────────────────────────────────────────────────
  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.json({ ok: true });
  });

  // ── GET /api/auth/me ─────────────────────────────────────────────────────
  app.get("/api/auth/me", async (req, res) => {
    try {
      const { jwtVerify } = await import("jose");
      const raw = req.cookies?.[COOKIE_NAME] as string | undefined;
      if (!raw) { res.status(401).json({ error: "Não autenticado" }); return; }

      const { payload } = await jwtVerify(raw, getJwtSecret());
      const userId = parseInt(String(payload.sub), 10);
      const { getUserById } = await import("../db");
      const user = await getUserById(userId);
      if (!user) { res.status(401).json({ error: "Utilizador não encontrado" }); return; }

      const org = await getOrganizationByOwnerId(userId);
      res.json({ id: user.id, email: user.email, name: user.name, org });
    } catch {
      res.status(401).json({ error: "Token inválido" });
    }
  });
}
