/**
 * backend/routers/scan-ssrf-entrypoint.test.ts
 *
 * Formaliza o ponto 4 da auditoria SSRF (Fase 1): normaliseTarget + isSafeTarget
 * no ponto de entrada (scan.verifyOwnership) bloqueiam tentativas de ofuscação
 * do alvo ANTES de qualquer chamada de rede — testado através do router real
 * (appRouter), nunca chamando isSafeTarget/normaliseTarget directamente, para
 * confirmar o pipeline completo (zod → normaliseTarget → isSafeTarget) tal
 * como o utilizador o exercita.
 */

vi.mock("../db", () => ({
  getOrCreateOrgForOwner: vi.fn(),
  getSubscriptionByOrgId: vi.fn(),
}));

vi.mock("../services/scan-executor", () => ({
  executeAgentlessScan:            vi.fn(),
  verifyOwnership:                 vi.fn(),
  verifyOwnershipWithRootFallback: vi.fn(),
  isIpAddress:                     vi.fn().mockReturnValue(false),
  buildVerificationToken:          vi.fn().mockResolvedValue("nis2pt-verify=stub"),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "../db";
import * as scanExecutor from "../services/scan-executor";
import { appRouter } from "./index";

const ORG_A = { id: 1, name: "Org A", ownerId: 10, createdAt: new Date(), updatedAt: new Date() };
const USER_A = {
  id: 10, email: "a@test.com", name: "User A", role: "admin" as const,
  organizationId: ORG_A.id, passwordHash: null, resetTokenHash: null,
  resetTokenExpiresAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

function makeCtx() {
  return { user: USER_A, org: ORG_A, req: {} as any, res: {} as any, plan: "free" as const };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
  vi.mocked(db.getSubscriptionByOrgId).mockResolvedValue({ plan: "pro" } as any);
});

describe("scan.verifyOwnership — ofuscação de destino no ponto de entrada", () => {
  it.each([
    ["METADATA.GOOGLE.INTERNAL",          "maiúsculas puras"],
    ["Metadata.Google.Internal",          "capitalização mista"],
  ])("%s (%s) → bloqueado, verifyOwnership de rede NUNCA chamado", async (domain) => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.scan.verifyOwnership({ domain })).rejects.toThrow();
    expect(scanExecutor.verifyOwnership).not.toHaveBeenCalled();
  });

  it("http://127.0.0.1:8080/x (protocolo+porta+path a esconder IP privado) → bloqueado após normaliseTarget", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.scan.verifyOwnership({ domain: "http://127.0.0.1:8080/x" })
    ).rejects.toThrow();
    expect(scanExecutor.verifyOwnership).not.toHaveBeenCalled();
  });

  it("https://169.254.169.254:443/latest/meta-data/ (metadata cloud com protocolo+porta+path) → bloqueado", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.scan.verifyOwnership({ domain: "https://169.254.169.254:443/latest/meta-data/" })
    ).rejects.toThrow();
    expect(scanExecutor.verifyOwnership).not.toHaveBeenCalled();
  });

  it.each([
    ["::ffff:127.0.0.1",       "loopback IPv4-mapeado"],
    ["::ffff:169.254.169.254", "metadata cloud IPv4-mapeado"],
  ])("%s (%s) submetido DIRETAMENTE como alvo → bloqueado no ponto de entrada, não só no lookup", async (domain) => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.scan.verifyOwnership({ domain })).rejects.toThrow();
    expect(scanExecutor.verifyOwnership).not.toHaveBeenCalled();
  });

  it("controlo positivo — domínio público legítimo passa a validação de entrada e chega ao handler", async () => {
    vi.mocked(scanExecutor.verifyOwnership).mockResolvedValue({ verified: true, method: "dns-txt" });
    const caller = appRouter.createCaller(makeCtx());

    const result = await caller.scan.verifyOwnership({ domain: "example.com" });

    expect(result.verified).toBe(true);
    // Prova que os testes acima bloqueiam pela razão certa (isSafeTarget), não
    // porque toda e qualquer chamada a verifyOwnership falha neste setup.
    expect(scanExecutor.verifyOwnership).toHaveBeenCalledWith("example.com", ORG_A.id);
  });
});
