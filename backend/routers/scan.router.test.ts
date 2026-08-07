/**
 * backend/routers/scan.router.test.ts
 *
 * scan.startBulk — limite de demo (3 alvos, tab "Scan em lote" com alvos
 * livres) vs. o fluxo de descoberta de subdomínios (rootDomain), que
 * mantém os limites por plano de sempre e não deve ser afetado pela demo.
 */

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  getOrCreateOrgForOwner:               vi.fn(),
  getSubscriptionByOrgId:               vi.fn(),
  createScan:                           vi.fn(),
  getScanById:                          vi.fn(),
  getScansByOrgId:                      vi.fn(),
  getScansByBatchId:                    vi.fn(),
  getRecentCompletedScan:               vi.fn(),
  getLatestCompletedQuestionnaireForOrg: vi.fn(),
}));

vi.mock("../services/scan-executor", () => ({
  executeAgentlessScan:            vi.fn().mockResolvedValue({ success: true }),
  verifyOwnership:                 vi.fn(),
  verifyOwnershipWithRootFallback: vi.fn(),
  isIpAddress:                     vi.fn().mockReturnValue(false),
}));

vi.mock("../middlewares/rateLimit", () => ({
  getRedisClient: vi.fn().mockRejectedValue(new Error("redis down")),
}));

// ---------------------------------------------------------------------------
// Imports (após mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "../db";
import * as scanExecutor from "../services/scan-executor";
import { appRouter } from "./index";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = { id: 1, name: "Org A", ownerId: 10, createdAt: new Date(), updatedAt: new Date() };
const USER_A = {
  id: 10, email: "a@test.com", name: "User A", role: "admin" as const,
  organizationId: ORG_A.id, passwordHash: null, resetTokenHash: null,
  resetTokenExpiresAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

function makeCtx() {
  return { user: USER_A, org: ORG_A, req: {} as any, res: {} as any, plan: "free" as const };
}

let nextScanId = 1;

beforeEach(() => {
  vi.clearAllMocks();
  nextScanId = 1;
  vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
  vi.mocked(db.getSubscriptionByOrgId).mockResolvedValue({ plan: "pro" } as any); // plano pro por omissão
  vi.mocked(db.createScan).mockImplementation(async (data: any) => ({ id: nextScanId++, ...data }));
  vi.mocked(scanExecutor.verifyOwnership).mockResolvedValue({ verified: true, method: "dns-txt" });
  vi.mocked(scanExecutor.verifyOwnershipWithRootFallback).mockResolvedValue({ verified: true, method: "dns-txt" });
});

// ---------------------------------------------------------------------------
// Limite de demo — tab "Scan em lote" (SEM rootDomain)
// ---------------------------------------------------------------------------

describe("scan.startBulk — limite de demo (3 alvos, alvos livres)", () => {
  it("3 alvos sem rootDomain → aceites, todos iniciados", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.scan.startBulk({
      targets: ["a.pt", "b.pt", "c.pt"],
      mode: "sme",
    });
    expect(result.started).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
  });

  it("4 alvos sem rootDomain → rejeitado com a mensagem de demo, não a de plano", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.scan.startBulk({ targets: ["a.pt", "b.pt", "c.pt", "d.pt"], mode: "sme" })
    ).rejects.toThrow("O scan em lote está limitado a 3 alvos nesta fase.");
  });

  it("mesmo em plano MSSP, sem rootDomain o limite continua a ser 3 (demo é global, não por plano)", async () => {
    vi.mocked(db.getSubscriptionByOrgId).mockResolvedValue({ plan: "mssp" } as any);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.scan.startBulk({ targets: ["a.pt", "b.pt", "c.pt", "d.pt"], mode: "sme" })
    ).rejects.toThrow("O scan em lote está limitado a 3 alvos nesta fase.");
  });
});

// ---------------------------------------------------------------------------
// Fluxo de subdomínios (COM rootDomain) — NÃO fica limitado a 3
// ---------------------------------------------------------------------------

describe("scan.startBulk — fluxo de subdomínios (rootDomain) mantém os limites por plano", () => {
  it("5 subdomínios de um rootDomain verificado (plano pro, limite 15) → todos aceites, sem cair no limite de demo", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.scan.startBulk({
      targets: ["a.cisplan.com", "b.cisplan.com", "c.cisplan.com", "d.cisplan.com", "e.cisplan.com"],
      mode: "sme",
      rootDomain: "cisplan.com",
    });
    expect(result.started).toHaveLength(5);
    expect(result.failed).toHaveLength(0);
  });

  it("16 subdomínios (excede o limite Pro de 15) → rejeitado com a mensagem de PLANO, não a de demo", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const targets = Array.from({ length: 16 }, (_, i) => `s${i}.cisplan.com`);
    await expect(
      caller.scan.startBulk({ targets, mode: "sme", rootDomain: "cisplan.com" })
    ).rejects.toThrow("O teu plano suporta até 15 targets por batch.");
  });

  it("50 subdomínios com plano MSSP (limite 50) → todos aceites", async () => {
    vi.mocked(db.getSubscriptionByOrgId).mockResolvedValue({ plan: "mssp" } as any);
    const caller = appRouter.createCaller(makeCtx());
    const targets = Array.from({ length: 50 }, (_, i) => `s${i}.cisplan.com`);
    const result = await caller.scan.startBulk({ targets, mode: "sme", rootDomain: "cisplan.com" });
    expect(result.started).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// Não-regressão — isSafeTarget e ownership continuam a aplicar-se
// ---------------------------------------------------------------------------

describe("scan.startBulk — não-regressão (isSafeTarget e ownership)", () => {
  it("alvo com IP privado é rejeitado pelo zod/isSafeTarget antes do handler correr", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.scan.startBulk({ targets: ["10.0.0.5"], mode: "sme" })
    ).rejects.toThrow();
    // Nunca chegou a criar nenhum scan — a rejeição foi ao nível do input.
    expect(db.createScan).not.toHaveBeenCalled();
  });

  it("alvo sem ownership verificado vai para failed[], não derruba o lote inteiro", async () => {
    vi.mocked(scanExecutor.verifyOwnershipWithRootFallback).mockImplementation(
      async (target: string) => ({ verified: target !== "semtxt.pt" })
    );
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.scan.startBulk({ targets: ["ok.pt", "semtxt.pt"], mode: "sme" });

    expect(result.started).toHaveLength(1);
    expect(result.started[0].target).toBe("ok.pt");
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].target).toBe("semtxt.pt");
    expect(result.failed[0].reason).toContain("Ownership não verificado");
  });

  it("se NENHUM alvo passar ownership, o pedido inteiro falha", async () => {
    vi.mocked(scanExecutor.verifyOwnershipWithRootFallback).mockResolvedValue({ verified: false });
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.scan.startBulk({ targets: ["a.pt", "b.pt"], mode: "sme" })
    ).rejects.toThrow("Nenhum target com ownership verificado");
  });
});
