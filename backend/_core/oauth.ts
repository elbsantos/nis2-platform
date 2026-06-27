/**
 * server/_core/oauth.ts
 *
 * Auth routes: register, login, logout, /me.
 * Uses JWT stored in httpOnly cookie (auth_token).
 */

import type { Application } from "express";
import { SignJWT } from "jose";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";
import { getUserByEmail, createUser, createOrganization, getOrCreateOrgForOwner } from "../db";

const COOKIE_NAME = "auth_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

// ---------------------------------------------------------------------------
// Input validation schemas
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  email:   z.string().email().max(255).toLowerCase().trim(),
  password: z.string().min(8).max(128),
  name:    z.string().max(255).trim().optional(),
  orgName: z.string().min(1).max(255).trim(),
});

const loginSchema = z.object({
  email:    z.string().email().max(255).toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

// ---------------------------------------------------------------------------
// Password hashing — scrypt (OWASP-recommended, Node built-in)
// Format stored: "<hex-salt>:<hex-hash>"
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, storedHash] = stored.split(":");
    if (!salt || !storedHash) return false;
    const hash = scryptSync(password, salt, 64);
    return timingSafeEqual(hash, Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("[Auth] JWT_SECRET is not set in production");
  }
  return new TextEncoder().encode(secret ?? "dev-secret-change-in-production-min-32-chars");
}

async function signToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerOAuthRoutes(app: Application): void {
  // ── POST /api/auth/register ──────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Dados inválidos" });
        return;
      }
      const { email, password, name, orgName } = parsed.data;

      const existing = await getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: "Este email já está registado" });
        return;
      }

      const passwordHash = hashPassword(password);
      const user = await createUser({ email, name, passwordHash, role: "admin" });
      const org  = await createOrganization({ name: orgName, ownerId: user.id });

      await import("../db").then(({ getDb }) => {
        const { users } = require("../../database/schema");
        const { eq }    = require("drizzle-orm");
        return getDb()!
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
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        // Return same message as wrong credentials to avoid user enumeration
        res.status(401).json({ error: "Credenciais inválidas" });
        return;
      }
      const { email, password } = parsed.data;

      const user = await getUserByEmail(email);

      // Always run verifyPassword to prevent timing-based user enumeration
      const dummyHash = "0000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
      const valid = user ? verifyPassword(password, user.passwordHash ?? "") : verifyPassword(password, dummyHash);

      if (!user || !valid) {
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

      const org = await getOrCreateOrgForOwner(userId, user.name ?? undefined);
      res.json({ id: user.id, email: user.email, name: user.name, org });
    } catch {
      res.status(401).json({ error: "Token inválido" });
    }
  });
}
