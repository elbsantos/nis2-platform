/**
 * backend/_core/context.test.ts
 *
 * P1-1 — revogação de sessão via sessionVersion. Testa getUserFromCookie
 * (via createContext): o token tem de bater certo com user.sessionVersion,
 * e um token sem o claim (emitido antes desta mudança) tem de ser tratado
 * como versão 0 — retrocompatível, sem deslogar sessões existentes.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { SignJWT } from "jose";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

vi.mock("../db", () => ({
  getUserById: vi.fn(),
}));

import * as db from "../db";
import { createContext } from "./context";
import { getJwtSecret } from "./env";

async function makeToken(userId: number, sessionVersion?: number): Promise<string> {
  const claims: Record<string, unknown> = { sub: String(userId) };
  if (sessionVersion !== undefined) claims.sessionVersion = sessionVersion;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

function fakeReq(cookieValue?: string): CreateExpressContextOptions["req"] {
  return { cookies: cookieValue ? { auth_token: cookieValue } : {} } as any;
}

const fakeRes = {} as CreateExpressContextOptions["res"];

afterEach(() => {
  vi.clearAllMocks();
});

describe("getUserFromCookie (via createContext) — revogação de sessão por sessionVersion", () => {
  it("token com sessionVersion=0 + user.sessionVersion=0 → autentica", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 1, sessionVersion: 0 } as any);
    const token = await makeToken(1, 0);

    const ctx = await createContext({ req: fakeReq(token), res: fakeRes });

    expect(ctx.user).not.toBeNull();
    expect(ctx.user?.id).toBe(1);
  });

  it("token com sessionVersion=0 + user.sessionVersion=1 (após reset) → REJEITA (null)", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 1, sessionVersion: 1 } as any);
    const token = await makeToken(1, 0);

    const ctx = await createContext({ req: fakeReq(token), res: fakeRes });

    expect(ctx.user).toBeNull();
  });

  it("token SEM claim sessionVersion (retrocompat) + user.sessionVersion=0 → autentica", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 1, sessionVersion: 0 } as any);
    const token = await makeToken(1); // token "antigo", sem o claim

    const ctx = await createContext({ req: fakeReq(token), res: fakeRes });

    expect(ctx.user).not.toBeNull();
    expect(ctx.user?.id).toBe(1);
  });

  it("token SEM claim sessionVersion + user.sessionVersion=1 → rejeita", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 1, sessionVersion: 1 } as any);
    const token = await makeToken(1); // token "antigo", sem o claim

    const ctx = await createContext({ req: fakeReq(token), res: fakeRes });

    expect(ctx.user).toBeNull();
  });

  it("sem cookie → user null, sem consultar a BD (comportamento pré-existente)", async () => {
    const ctx = await createContext({ req: fakeReq(undefined), res: fakeRes });

    expect(ctx.user).toBeNull();
    expect(db.getUserById).not.toHaveBeenCalled();
  });

  it("utilizador não encontrado na BD → null", async () => {
    vi.mocked(db.getUserById).mockResolvedValue(null as any);
    const token = await makeToken(999, 0);

    const ctx = await createContext({ req: fakeReq(token), res: fakeRes });

    expect(ctx.user).toBeNull();
  });
});
