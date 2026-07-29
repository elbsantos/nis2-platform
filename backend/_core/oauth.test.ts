/**
 * backend/_core/oauth.test.ts
 *
 * B3 — registo atómico e caminhos de auth.
 *
 * Commit 1: POST /api/auth/register usa registerUserAtomically (tudo-ou-nada).
 * Commit 2: GET /api/auth/me devolve 500 se user não tem org (estado inesperado).
 */

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted — devem estar antes de qualquer import)
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  getUserByEmail:           vi.fn(),
  getUserById:              vi.fn(),
  registerUserAtomically:   vi.fn(),
  getOrganizationByOwnerId: vi.fn(),
  setResetToken:            vi.fn(),
  getUserByResetToken:      vi.fn(),
  resetUserPassword:        vi.fn(),
  deleteAccount:            vi.fn(),
}));

// jose é importado dinamicamente em oauth.ts (/me usa jwtVerify via import())
// Não mockamos jose — usamos o dev-secret real para gerar tokens válidos nos testes.

// ---------------------------------------------------------------------------
// Imports (após vi.mock — vitest hoists os vi.mock automaticamente)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { SignJWT } from "jose";
import * as db from "../db";
import { registerOAuthRoutes } from "./oauth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cria uma app Express mínima com os routes de auth registados. */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  registerOAuthRoutes(app);
  return app;
}

/** Gera um JWT válido com o dev-secret (JWT_SECRET ausente → dev fallback). */
async function makeToken(userId: number): Promise<string> {
  const secret = new TextEncoder().encode("dev-secret-change-in-production-min-32-chars");
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Commit 1 — POST /api/auth/register (register atómico)
// ---------------------------------------------------------------------------

describe("POST /api/auth/register — register atómico (B3 commit-1)", () => {
  it("cria user+org atomicamente e devolve 200 com id e orgId", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(null as any);
    vi.mocked(db.registerUserAtomically).mockResolvedValue({ userId: 42, orgId: 7 });

    const res = await request(makeApp())
      .post("/api/auth/register")
      .send({ email: "novo@test.com", password: "password123", name: "Test", orgName: "Org Teste" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 42, email: "novo@test.com", orgId: 7 });
    expect(vi.mocked(db.registerUserAtomically)).toHaveBeenCalledOnce();
    expect(vi.mocked(db.registerUserAtomically)).toHaveBeenCalledWith(
      expect.objectContaining({ email: "novo@test.com", orgName: "Org Teste" })
    );
  });

  it("se registerUserAtomically lança, retorna 500 — user NÃO persiste (rollback)", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(null as any);
    vi.mocked(db.registerUserAtomically).mockRejectedValue(new Error("DB error — rollback"));

    const res = await request(makeApp())
      .post("/api/auth/register")
      .send({ email: "fail@test.com", password: "password123", orgName: "Org" });

    expect(res.status).toBe(500);
    // registerUserAtomically foi chamado (transação iniciada) mas rejeitou → nenhuma resposta 200
    expect(vi.mocked(db.registerUserAtomically)).toHaveBeenCalledOnce();
  });

  it("rejeita email duplicado com 409 sem chamar registerUserAtomically", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({ id: 1, email: "dup@test.com" } as any);

    const res = await request(makeApp())
      .post("/api/auth/register")
      .send({ email: "dup@test.com", password: "password123", orgName: "Org" });

    expect(res.status).toBe(409);
    expect(vi.mocked(db.registerUserAtomically)).not.toHaveBeenCalled();
  });

  it("rejeita input inválido (email malformado) com 400", async () => {
    const res = await request(makeApp())
      .post("/api/auth/register")
      .send({ email: "nao-e-email", password: "password123", orgName: "Org" });

    expect(res.status).toBe(400);
    expect(vi.mocked(db.registerUserAtomically)).not.toHaveBeenCalled();
  });

  it("rejeita password curta com 400", async () => {
    const res = await request(makeApp())
      .post("/api/auth/register")
      .send({ email: "ok@test.com", password: "curta", orgName: "Org" });

    expect(res.status).toBe(400);
    expect(vi.mocked(db.registerUserAtomically)).not.toHaveBeenCalled();
  });

  it("devolve cookie auth_token após registo com sucesso", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(null as any);
    vi.mocked(db.registerUserAtomically).mockResolvedValue({ userId: 5, orgId: 3 });

    const res = await request(makeApp())
      .post("/api/auth/register")
      .send({ email: "cookie@test.com", password: "password123", orgName: "Org" });

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] as string[] | string;
    const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : cookies;
    expect(cookieStr).toContain("auth_token=");
  });
});

// Testes GET /api/auth/me adicionados no commit 2 (B3 commit-2).
