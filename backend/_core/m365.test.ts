/**
 * backend/_core/m365.test.ts
 *
 * Rotas OAuth admin-consent do connector M365 — sem credenciais Microsoft
 * reais: cliente Microsoft (fetch) e BD mockados.
 *
 * Cobertura:
 *  - /connect: 401 sem sessão, 503 sem config, redireciona com state=JWT(orgId)
 *    quando configurado e autenticado.
 *  - /callback: 400 com state inválido/adulterado (nada é gravado), troca
 *    code→token com sucesso e grava tokens CIFRADOS (nunca em claro),
 *    redireciona em erro devolvido pela Microsoft sem crashar.
 *  - Cross-tenant: o organizationId usado vem SEMPRE do state assinado,
 *    nunca de nada que venha da query do callback.
 */

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted — devem estar antes de qualquer import)
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  getUserById:            vi.fn(),
  getOrCreateOrgForOwner: vi.fn(),
  upsertM365Connection:   vi.fn(),
}));

vi.mock("../utils/encryption", () => ({
  // Prefixo determinístico só para os testes distinguirem "cifrado" de "em claro".
  encrypt: vi.fn((plaintext: string) => `enc:${plaintext}`),
}));

// jose é usado a sério (não mockado) — geramos/validamos JWTs reais com o
// dev-secret, tal como backend/_core/oauth.test.ts.

// ---------------------------------------------------------------------------
// Imports (após vi.mock — vitest faz hoist automaticamente)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { SignJWT, jwtVerify } from "jose";
import * as db from "../db";
import { encrypt } from "../utils/encryption";
import { registerM365Routes } from "./m365";
import { COOKIE_NAME } from "./oauth";

const DEV_SECRET = new TextEncoder().encode("dev-secret-change-in-production-min-32-chars");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  registerM365Routes(app);
  return app;
}

/** JWT de sessão válido (mesmo formato de oauth.ts signToken). */
async function makeAuthToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId), sessionVersion: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(DEV_SECRET);
}

/** State JWT válido, no mesmo formato que registerM365Routes gera. */
async function makeState(orgId: number): Promise<string> {
  return new SignJWT({ orgId, nonce: "test-nonce" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(DEV_SECRET);
}

function setM365Env() {
  process.env.M365_CLIENT_ID     = "test-client-id";
  process.env.M365_CLIENT_SECRET = "test-client-secret";
  process.env.M365_TENANT_ID     = "test-tenant-id";
}

function clearM365Env() {
  delete process.env.M365_CLIENT_ID;
  delete process.env.M365_CLIENT_SECRET;
  delete process.env.M365_TENANT_ID;
}

const _ORIG = {
  M365_CLIENT_ID:     process.env.M365_CLIENT_ID,
  M365_CLIENT_SECRET: process.env.M365_CLIENT_SECRET,
  M365_TENANT_ID:     process.env.M365_TENANT_ID,
};

let fetchSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  clearM365Env();
  fetchSpy = vi.spyOn(global, "fetch");
});

afterEach(() => {
  process.env.M365_CLIENT_ID     = _ORIG.M365_CLIENT_ID;
  process.env.M365_CLIENT_SECRET = _ORIG.M365_CLIENT_SECRET;
  process.env.M365_TENANT_ID     = _ORIG.M365_TENANT_ID;
  fetchSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// GET /api/connectors/m365/connect
// ---------------------------------------------------------------------------

describe("GET /api/connectors/m365/connect", () => {
  it("sem cookie de sessão → 401 (config em falta ou não, aqui config está OK)", async () => {
    setM365Env();

    const res = await request(makeApp()).get("/api/connectors/m365/connect");

    expect(res.status).toBe(401);
    expect(vi.mocked(db.getOrCreateOrgForOwner)).not.toHaveBeenCalled();
  });

  it("sem M365 configurado (env vazias) → 503, mesmo com sessão válida", async () => {
    // clearM365Env() já correu no beforeEach — env fica vazia.
    const token = await makeAuthToken(1);

    const res = await request(makeApp())
      .get("/api/connectors/m365/connect")
      .set("Cookie", `${COOKIE_NAME}=${token}`);

    expect(res.status).toBe(503);
    expect(vi.mocked(db.getOrCreateOrgForOwner)).not.toHaveBeenCalled();
  });

  it("com sessão e config → redireciona para login.microsoftonline.com com state=JWT(orgId correto)", async () => {
    setM365Env();
    vi.mocked(db.getUserById).mockResolvedValue({ id: 42, name: "Ana" } as any);
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue({ id: 7 } as any);

    const token = await makeAuthToken(42);
    const res = await request(makeApp())
      .get("/api/connectors/m365/connect")
      .set("Cookie", `${COOKIE_NAME}=${token}`);

    expect(res.status).toBe(302);
    const location = res.headers.location as string;
    expect(location).toMatch(
      /^https:\/\/login\.microsoftonline\.com\/organizations\/oauth2\/v2\.0\/authorize\?/
    );

    const url = new URL(location);
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("https://graph.microsoft.com/.default offline_access");

    const state = url.searchParams.get("state")!;
    expect(state).toBeTruthy();
    const { payload } = await jwtVerify(state, DEV_SECRET);
    expect(payload.orgId).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// GET /api/connectors/m365/callback
// ---------------------------------------------------------------------------

describe("GET /api/connectors/m365/callback", () => {
  it("sem M365 configurado (env vazias) → 503", async () => {
    const res = await request(makeApp())
      .get("/api/connectors/m365/callback")
      .query({ state: "qualquer", code: "abc", tenant: "t1" });

    expect(res.status).toBe(503);
  });

  it("?error= devolvido pela Microsoft → redireciona para página de erro, não crasha", async () => {
    setM365Env();

    const res = await request(makeApp())
      .get("/api/connectors/m365/callback")
      .query({ error: "access_denied", error_description: "admin recusou consentimento" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("m365=error");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(db.upsertM365Connection)).not.toHaveBeenCalled();
  });

  it("state inválido/adulterado → 400, não troca tokens nem grava nada", async () => {
    setM365Env();

    const res = await request(makeApp())
      .get("/api/connectors/m365/callback")
      .query({ state: "isto-nao-e-um-jwt-valido", code: "abc", tenant: "customer-tenant" });

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(db.upsertM365Connection)).not.toHaveBeenCalled();
  });

  it("state expirado → 400, não grava nada", async () => {
    setM365Env();

    const expiredState = await new SignJWT({ orgId: 7, nonce: "n" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // expirou há 30min
      .sign(DEV_SECRET);

    const res = await request(makeApp())
      .get("/api/connectors/m365/callback")
      .query({ state: expiredState, code: "abc", tenant: "customer-tenant" });

    expect(res.status).toBe(400);
    expect(vi.mocked(db.upsertM365Connection)).not.toHaveBeenCalled();
  });

  it("state válido → troca code por token e grava tokens CIFRADOS (nunca em claro)", async () => {
    setM365Env();
    const state = await makeState(7);

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token:  "raw-access-token-xyz",
        refresh_token: "raw-refresh-token-xyz",
        expires_in:    3600,
      }),
    } as any);

    const res = await request(makeApp())
      .get("/api/connectors/m365/callback")
      .query({ state, code: "auth-code-123", tenant: "customer-tenant-id", admin_consent: "True" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("m365=connected");

    // Token endpoint chamado com o tenant devolvido pela Microsoft no callback.
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://login.microsoftonline.com/customer-tenant-id/oauth2/v2.0/token",
      expect.objectContaining({ method: "POST" })
    );

    expect(vi.mocked(encrypt)).toHaveBeenCalledWith("raw-access-token-xyz");
    expect(vi.mocked(encrypt)).toHaveBeenCalledWith("raw-refresh-token-xyz");

    expect(vi.mocked(db.upsertM365Connection)).toHaveBeenCalledOnce();
    const call = vi.mocked(db.upsertM365Connection).mock.calls[0][0];
    expect(call.organizationId).toBe(7);
    expect(call.tenantId).toBe("customer-tenant-id");
    // Nunca o token em claro — tem de ser o output de encrypt().
    expect(call.accessTokenEnc).not.toBe("raw-access-token-xyz");
    expect(call.accessTokenEnc).toBe("enc:raw-access-token-xyz");
    expect(call.refreshTokenEnc).toBe("enc:raw-refresh-token-xyz");
  });

  it("falha na troca de tokens (fetch não-ok) → redireciona para erro, não crasha, não grava nada", async () => {
    setM365Env();
    const state = await makeState(7);

    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    } as any);

    const res = await request(makeApp())
      .get("/api/connectors/m365/callback")
      .query({ state, code: "auth-code-123", tenant: "customer-tenant-id" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("m365=error");
    expect(vi.mocked(db.upsertM365Connection)).not.toHaveBeenCalled();
  });

  it("cross-tenant: orgId usado vem SEMPRE do state assinado, nunca de campos injetados na query", async () => {
    setM365Env();
    // State assinado legitimamente para a organização 111.
    const state = await makeState(111);

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token:  "tok-a",
        refresh_token: "tok-r",
        expires_in:    3600,
      }),
    } as any);

    // O atacante tenta injetar organizationId/orgId diretamente na query —
    // o handler nunca lê estes campos, só o que vem do state validado.
    const res = await request(makeApp())
      .get("/api/connectors/m365/callback")
      .query({
        state,
        code: "auth-code-123",
        tenant: "customer-tenant-id",
        orgId: "999",
        organizationId: "999",
      });

    expect(res.status).toBe(302);
    expect(vi.mocked(db.upsertM365Connection)).toHaveBeenCalledOnce();
    const call = vi.mocked(db.upsertM365Connection).mock.calls[0][0];
    expect(call.organizationId).toBe(111);
    expect(call.organizationId).not.toBe(999);
  });
});
