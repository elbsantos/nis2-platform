/**
 * backend/routers/admin.router.test.ts
 *
 * A1 — gate admin por allowlist (PLATFORM_ADMIN_EMAILS).
 * B4 — scanRedisKeys: iteração SCAN por cursor, dedup, acumulação multi-chunk.
 * Garante que aiTokenStats/scanCreditStats continuam a devolver as mesmas contagens.
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

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { adminRouter, scanRedisKeys } from "./admin.router";
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

// Constrói um mock de cliente Redis que responde a scan com páginas pré-definidas.
// Cada elemento de `pages` é { cursor, keys } — a sequência que SCAN devolve.
function makeScanMock(pages: Array<{ cursor: number; keys: string[] }>) {
  let call = 0;
  return vi.fn().mockImplementation(async () => {
    const page = pages[call] ?? { cursor: 0, keys: [] };
    call++;
    return page;
  });
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

const _PLATFORM_ADMIN_EMAILS = process.env.PLATFORM_ADMIN_EMAILS;

afterEach(() => {
  process.env.PLATFORM_ADMIN_EMAILS = _PLATFORM_ADMIN_EMAILS;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// B4 — scanRedisKeys: helper SCAN
// ---------------------------------------------------------------------------

describe("scanRedisKeys (B4)", () => {
  it("resultado vazio quando SCAN devolve cursor=0 e sem chaves", async () => {
    const mockRedis = { scan: makeScanMock([{ cursor: 0, keys: [] }]) } as any;
    const result = await scanRedisKeys(mockRedis, "prefix:*");
    expect(result).toEqual([]);
    expect(mockRedis.scan).toHaveBeenCalledOnce();
    expect(mockRedis.scan).toHaveBeenCalledWith(0, { MATCH: "prefix:*", COUNT: 100 });
  });

  it("resultado de uma única página (cursor=0 imediato)", async () => {
    const mockRedis = {
      scan: makeScanMock([{ cursor: 0, keys: ["a:1", "a:2", "a:3"] }]),
    } as any;
    const result = await scanRedisKeys(mockRedis, "a:*");
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining(["a:1", "a:2", "a:3"]));
  });

  it("itera múltiplas páginas até cursor=0 e acumula todas as chaves", async () => {
    const mockRedis = {
      scan: makeScanMock([
        { cursor: 42,  keys: ["k:1", "k:2"] },
        { cursor: 77,  keys: ["k:3"] },
        { cursor: 0,   keys: ["k:4", "k:5"] },
      ]),
    } as any;
    const result = await scanRedisKeys(mockRedis, "k:*");
    expect(result).toHaveLength(5);
    expect(result).toEqual(expect.arrayContaining(["k:1", "k:2", "k:3", "k:4", "k:5"]));
    expect(mockRedis.scan).toHaveBeenCalledTimes(3);
    // Confirma que o cursor correcto é passado em cada chamada
    expect(mockRedis.scan).toHaveBeenNthCalledWith(1, 0,  { MATCH: "k:*", COUNT: 100 });
    expect(mockRedis.scan).toHaveBeenNthCalledWith(2, 42, { MATCH: "k:*", COUNT: 100 });
    expect(mockRedis.scan).toHaveBeenNthCalledWith(3, 77, { MATCH: "k:*", COUNT: 100 });
  });

  it("deduplica chaves repetidas entre páginas (comportamento garantido pelo SCAN)", async () => {
    const mockRedis = {
      scan: makeScanMock([
        { cursor: 1, keys: ["dup:1", "dup:2"] },
        { cursor: 0, keys: ["dup:2", "dup:3"] },  // dup:2 repetido
      ]),
    } as any;
    const result = await scanRedisKeys(mockRedis, "dup:*");
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining(["dup:1", "dup:2", "dup:3"]));
  });
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

  it("email na allowlist passa o gate e recebe dados (aiTokenStats)", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@cisplan.com";
    vi.mocked(rateLimit.getRedisClient).mockResolvedValue({
      scan: makeScanMock([{ cursor: 0, keys: [] }]),
      mGet: vi.fn().mockResolvedValue([]),
    } as any);

    const caller = adminRouter.createCaller(makeCtx("admin@cisplan.com"));
    const result = await caller.aiTokenStats();
    expect(result).toHaveProperty("entries");
    expect(Array.isArray(result.entries)).toBe(true);
  });

  it("email na allowlist — case-insensitive", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "Admin@Cisplan.Com";
    vi.mocked(rateLimit.getRedisClient).mockResolvedValue({
      scan: makeScanMock([{ cursor: 0, keys: [] }]),
      mGet: vi.fn().mockResolvedValue([]),
    } as any);

    const caller = adminRouter.createCaller(makeCtx("admin@cisplan.com"));
    const result = await caller.aiTokenStats();
    expect(result).toHaveProperty("entries");
  });
});

// ---------------------------------------------------------------------------
// Testes — contagens correctas (B4 end-to-end)
// ---------------------------------------------------------------------------

describe("adminRouter — contagens correctas com scanRedisKeys (B4)", () => {
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@cisplan.com";
  });

  it("aiTokenStats agrega tokens por org correctamente (multi-página)", async () => {
    // Simula SCAN a devolver chaves em 2 páginas
    const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    vi.mocked(rateLimit.getRedisClient).mockResolvedValue({
      scan: makeScanMock([
        { cursor: 5, keys: [`ai:tokens:org:1:${ym}`] },
        { cursor: 0, keys: [`ai:tokens:org:2:${ym}`] },
      ]),
      mGet: vi.fn().mockResolvedValue(["1500", "800"]),
    } as any);

    const caller = adminRouter.createCaller(makeCtx("admin@cisplan.com"));
    const result = await caller.aiTokenStats();

    expect(result.entries).toHaveLength(2);
    const org1 = result.entries.find((e) => e.orgId === 1);
    const org2 = result.entries.find((e) => e.orgId === 2);
    expect(org1?.tokens).toBe(1500);
    expect(org2?.tokens).toBe(800);
  });

  it("scanCreditStats agrega scans e force-rescans por org correctamente", async () => {
    const ym    = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const today = new Date().toISOString().slice(0, 10);

    // scan é chamado 2 vezes (uma por padrão) — creditKeys e forceKeys em Promise.all
    // O mock retorna na 1ª chamada creditKeys (cursor=0 imediato) e na 2ª forceKeys
    let scanCall = 0;
    const mockScan = vi.fn().mockImplementation(async (_cursor: number, opts: { MATCH: string }) => {
      scanCall++;
      if (opts.MATCH.startsWith("scan:credits")) {
        return { cursor: 0, keys: [`scan:credits:org:10:${ym}`, `scan:credits:org:11:${ym}`] };
      }
      return { cursor: 0, keys: [`force-rescan:org:10:${today}`] };
    });

    vi.mocked(rateLimit.getRedisClient).mockResolvedValue({
      scan: mockScan,
      mGet: vi.fn()
        // 1ª chamada: creditKeys → [5, 3]
        .mockResolvedValueOnce(["5", "3"])
        // 2ª chamada: forceKeys → [2]
        .mockResolvedValueOnce(["2"]),
    } as any);

    const caller = adminRouter.createCaller(makeCtx("admin@cisplan.com"));
    const result = await caller.scanCreditStats();

    expect(result.entries).toHaveLength(2); // org 10 e org 11
    const org10 = result.entries.find((e) => e.orgId === 10);
    const org11 = result.entries.find((e) => e.orgId === 11);
    expect(org10?.scansThisMonth).toBe(5);
    expect(org10?.forceRescansToday).toBe(2);
    expect(org11?.scansThisMonth).toBe(3);
    expect(org11?.forceRescansToday).toBe(0);
  });

  it("Redis indisponível — endpoints retornam entries vazio (sem throw)", async () => {
    vi.mocked(rateLimit.getRedisClient).mockRejectedValue(new Error("Redis down"));
    const caller = adminRouter.createCaller(makeCtx("admin@cisplan.com"));

    const ai     = await caller.aiTokenStats();
    const credit = await caller.scanCreditStats();

    expect(ai.entries).toEqual([]);
    expect(credit.entries).toEqual([]);
  });
});
