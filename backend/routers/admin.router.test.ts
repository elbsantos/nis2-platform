/**
 * backend/routers/admin.router.test.ts
 *
 * A1 — gate admin por allowlist (PLATFORM_ADMIN_EMAILS).
 * Garante que um utilizador autenticado cujo email NÃO está na allowlist
 * recebe FORBIDDEN, e que um email válido passa.
 */

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../middlewares/rateLimit", () => ({
  getRedisClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { adminRouter } from "./admin.router";
import * as rateLimit from "../middlewares/rateLimit";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUser(email: string) {
  return {
    id:                  1,
    email,
    name:                "Test User",
    role:                "member" as const,
    organizationId:      1,
    passwordHash:        null,
    resetTokenHash:      null,
    resetTokenExpiresAt: null,
    deletedAt:           null,
    createdAt:           new Date(),
    updatedAt:           new Date(),
  };
}

function makeCtx(email: string) {
  return { user: makeUser(email), req: {} as any, res: {} as any };
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

const _PLATFORM_ADMIN_EMAILS = process.env.PLATFORM_ADMIN_EMAILS;

afterEach(() => {
  process.env.PLATFORM_ADMIN_EMAILS = _PLATFORM_ADMIN_EMAILS;
});

// ---------------------------------------------------------------------------
// Testes — gate PLATFORM_ADMIN_EMAILS
// ---------------------------------------------------------------------------

describe("adminRouter — gate PLATFORM_ADMIN_EMAILS (A1)", () => {
  it("utilizador cujo email NÃO está na allowlist recebe FORBIDDEN", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@cisplan.com";
    const caller = adminRouter.createCaller(makeCtx("hacker@outro.com"));
    const err = await caller.aiTokenStats().catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
  });

  it("allowlist vazia — ninguém passa (fail-closed)", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "";
    const caller = adminRouter.createCaller(makeCtx("admin@cisplan.com"));
    const err = await caller.aiTokenStats().catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
  });

  it("email na allowlist passa o gate e recebe dados", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@cisplan.com";
    vi.mocked(rateLimit.getRedisClient).mockResolvedValue({
      keys:  vi.fn().mockResolvedValue([]),
      mGet:  vi.fn().mockResolvedValue([]),
    } as any);

    const caller = adminRouter.createCaller(makeCtx("admin@cisplan.com"));
    const result = await caller.aiTokenStats();
    expect(result).toHaveProperty("entries");
    expect(Array.isArray(result.entries)).toBe(true);
  });

  it("email na allowlist — case-insensitive", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "Admin@Cisplan.Com";
    vi.mocked(rateLimit.getRedisClient).mockResolvedValue({
      keys:  vi.fn().mockResolvedValue([]),
      mGet:  vi.fn().mockResolvedValue([]),
    } as any);

    const caller = adminRouter.createCaller(makeCtx("admin@cisplan.com"));
    const result = await caller.aiTokenStats();
    expect(result).toHaveProperty("entries");
  });
});
