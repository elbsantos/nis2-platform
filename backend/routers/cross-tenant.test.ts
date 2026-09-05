/**
 * backend/routers/cross-tenant.test.ts
 *
 * Suite de regressão de isolamento cross-tenant — prova que a organização A
 * nunca lê, altera, exporta ou apaga recursos da organização B, para todas as
 * procedures identificadas na auditoria (scan, questionnaire, remediation,
 * report, documents).
 *
 * Padrão "E.12" (ver enquadramento.router.test.ts): NUNCA injetar ctx.org nem
 * orgId no contexto. Passar só { user, req, res } e deixar
 * getOrCreateOrgForOwner (mockado) resolver a org do chamador — testa o
 * router real, não um atalho. Os recursos de A são injetados como "o que a
 * BD devolve quando perguntada" (o getter mockado devolve o recurso de A
 * independentemente de quem pergunta, como uma BD real faria).
 *
 * enquadramento.getById e documents.relatorioEnquadramento já têm cobertura
 * cross-tenant em enquadramento.router.test.ts — não duplicados aqui.
 */

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted — antes de qualquer import)
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  getOrCreateOrgForOwner:               vi.fn(),
  getSubscriptionByOrgId:               vi.fn(),
  getScanById:                          vi.fn(),
  getScansByBatchId:                    vi.fn(),
  getScansByOrgId:                      vi.fn(),
  getLatestCompletedQuestionnaireForOrg: vi.fn(),
  getQuestionnaireSessionById:          vi.fn(),
  updateQuestionnaireSession:           vi.fn(),
  getRemediationItemsByScanId:          vi.fn(),
  getRemediationItemsWithScanInfo:      vi.fn(),
  updateRemediationStatus:              vi.fn(),
  getOrganizationById:                  vi.fn(),
  getLatestFrameworkAssessmentByOrgId:  vi.fn(),
  getFrameworkAssessmentById:           vi.fn(),
}));

vi.mock("../services/ai-remediation", () => ({
  generateRemediationForScan: vi.fn(),
  countEligibleVulns:         vi.fn(),
}));

vi.mock("../services/scan-executor", () => ({
  executeAgentlessScan:            vi.fn(),
  verifyOwnership:                 vi.fn(),
  verifyOwnershipWithRootFallback: vi.fn(),
  isIpAddress:                     vi.fn().mockReturnValue(false),
  buildVerificationToken:          vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (após mocks registados)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import * as aiRemediation from "../services/ai-remediation";
import { appRouter } from "./index";

// ---------------------------------------------------------------------------
// Fixtures — mesmo padrão de ids de enquadramento.router.test.ts
// ---------------------------------------------------------------------------

const ORG_A = { id: 1, name: "Org A", ownerId: 10, createdAt: new Date(), updatedAt: new Date() };
const ORG_B = { id: 2, name: "Org B", ownerId: 20, createdAt: new Date(), updatedAt: new Date() };

const USER_B = {
  id: 20, email: "b@test.com", name: "User B", role: "member" as const,
  organizationId: ORG_B.id, passwordHash: null, resetTokenHash: null,
  resetTokenExpiresAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

// Scan pertencente a Org A
const SCAN_A = {
  id: 55, organizationId: ORG_A.id, target: "example.com", mode: "sme" as const,
  status: "completed" as const, batchId: null, startedAt: new Date(), completedAt: new Date(),
  results: { vulnerabilities: [] }, createdAt: new Date(), updatedAt: new Date(),
};

const BATCH_A_ID = "11111111-1111-1111-1111-111111111111";

// Sessão de questionário pertencente a Org A
const SESSION_A = {
  id: 77, organizationId: ORG_A.id, userId: 10, sector: "energia",
  answers: [{ controlId: "a1", answer: "yes", score: 100 }],
  score: "80", articleScores: { a: 80 }, status: "completed" as const,
  completedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
};

// Item de remediação pertencente a Org A
const REMEDIATION_ITEM_A_ID = 501;

function makeCtx(user: typeof USER_B) {
  return { user, req: {} as any, res: {} as any };
}

async function rejects(promise: Promise<unknown>): Promise<TRPCError> {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(TRPCError);
  return err as TRPCError;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Middleware freeProcedure → planGuard: quem chama é sempre User B → Org B
  vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_B as any);
  vi.mocked(db.getSubscriptionByOrgId).mockResolvedValue(null as any); // plano free
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("cross-tenant isolation", () => {
  // ── scan ──────────────────────────────────────────────────────────────────

  it("scan.getById — B não lê scan de A → FORBIDDEN", async () => {
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.scan.getById({ scanId: SCAN_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("scan.combinedArticleScores — B não lê scores do scan de A → FORBIDDEN", async () => {
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.scan.combinedArticleScores({ scanId: SCAN_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("scan.controlValidation — B não lê a validação de controlos do scan de A → FORBIDDEN", async () => {
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.scan.controlValidation({ scanId: SCAN_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("scan.getBatch — B nunca recebe scans do batch de A (seguro por construção, sem throw)", async () => {
    // Reflete o comportamento real de getScansByBatchId: WHERE organizationId = orgId AND batchId = X
    vi.mocked(db.getScansByBatchId).mockImplementation((orgId: number, batchId: string) =>
      Promise.resolve(orgId === ORG_A.id && batchId === BATCH_A_ID ? [SCAN_A] : []) as any
    );
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const result = await caller.scan.getBatch({ batchId: BATCH_A_ID });
    expect(result).toEqual([]);
  });

  // ── questionnaire ─────────────────────────────────────────────────────────

  it("questionnaire.getById — B não lê sessão de A → FORBIDDEN", async () => {
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue(SESSION_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.questionnaire.getById({ sessionId: SESSION_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("questionnaire.saveAnswers — B não altera respostas de A → FORBIDDEN e updateQuestionnaireSession nunca chamado", async () => {
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue(SESSION_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(
      caller.questionnaire.saveAnswers({
        sessionId: SESSION_A.id,
        answers: [{ controlId: "a1", answer: "no" }],
      })
    );
    expect(err.code).toBe("FORBIDDEN");
    expect(db.updateQuestionnaireSession).not.toHaveBeenCalled();
  });

  it("questionnaire.complete — B não conclui a sessão de A → FORBIDDEN e updateQuestionnaireSession nunca chamado", async () => {
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue(SESSION_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.questionnaire.complete({ sessionId: SESSION_A.id }));
    expect(err.code).toBe("FORBIDDEN");
    expect(db.updateQuestionnaireSession).not.toHaveBeenCalled();
  });

  it("questionnaire.report — B não lê o relatório da sessão de A → FORBIDDEN", async () => {
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue(SESSION_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.questionnaire.report({ sessionId: SESSION_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("questionnaire.exportPdf — B não exporta o PDF da sessão de A → FORBIDDEN", async () => {
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue(SESSION_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.questionnaire.exportPdf({ sessionId: SESSION_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  // ── remediation ───────────────────────────────────────────────────────────

  it("remediation.generate — B não dispara geração sobre o scan de A → FORBIDDEN e generateRemediationForScan nunca chamado", async () => {
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.remediation.generate({ scanId: SCAN_A.id }));
    expect(err.code).toBe("FORBIDDEN");
    expect(aiRemediation.generateRemediationForScan).not.toHaveBeenCalled();
  });

  it("remediation.progress — B não vê o progresso do scan de A → FORBIDDEN", async () => {
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.remediation.progress({ scanId: SCAN_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("remediation.updateStatus — item de A nunca é atualizado com o orgId de A (a resposta 200 NÃO é prova de isolamento)", async () => {
    const caller = appRouter.createCaller(makeCtx(USER_B));

    // A procedure não faz throw (o UPDATE em BD filtra por organizationId e
    // afeta 0 linhas em silêncio) — a prova de isolamento está em como a
    // camada de dados foi invocada, nunca na resposta HTTP.
    const result = await caller.remediation.updateStatus({
      itemId: REMEDIATION_ITEM_A_ID,
      status: "done",
    });
    expect(result).toEqual({ ok: true });

    // A prova real: o orgId passado à BD é sempre o do chamador (B),
    // nunca o de A — updateRemediationStatus filtra por este valor.
    expect(db.updateRemediationStatus).toHaveBeenCalledWith(
      REMEDIATION_ITEM_A_ID,
      ORG_B.id,
      "done"
    );
    expect(db.updateRemediationStatus).not.toHaveBeenCalledWith(
      REMEDIATION_ITEM_A_ID,
      ORG_A.id,
      expect.anything()
    );
  });

  it("remediation.list — filtrar por scanId de A nunca devolve itens de A (seguro por construção, sem throw)", async () => {
    // Reflete o comportamento real: WHERE organizationId = orgId AND scanId = X
    vi.mocked(db.getRemediationItemsWithScanInfo).mockImplementation(
      (orgId: number) => Promise.resolve(orgId === ORG_A.id ? [{ id: REMEDIATION_ITEM_A_ID }] : []) as any
    );
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const result = await caller.remediation.list({ scanId: SCAN_A.id });
    expect(result).toEqual([]);
  });

  // ── report ────────────────────────────────────────────────────────────────

  it("report.generate — B não exporta o PDF do scan de A → FORBIDDEN", async () => {
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.report.generate({ scanId: SCAN_A.id, type: "executive" }));
    expect(err.code).toBe("FORBIDDEN");
  });

  // ── documents ─────────────────────────────────────────────────────────────

  it("documents.registoRiscos — B não exporta o Registo de Riscos do scan de A → FORBIDDEN", async () => {
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.documents.registoRiscos({ scanId: SCAN_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("documents.inventarioAtivos — B não exporta o Inventário de Ativos do scan de A → FORBIDDEN", async () => {
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.documents.inventarioAtivos({ scanId: SCAN_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("documents.patchTracker — B não exporta o Tracker de Patches do scan de A → FORBIDDEN", async () => {
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);
    const caller = appRouter.createCaller(makeCtx(USER_B));

    const err = await rejects(caller.documents.patchTracker({ scanId: SCAN_A.id }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("documents.relatorioGestao — B não gera o Relatório de Gestão do scan de A → FORBIDDEN (verificado na camada de serviço, end-to-end via o router)", async () => {
    // A posse é verificada dentro de document-generator.ts, não no router —
    // este teste tem de correr o caminho real (createCaller), não pode
    // assumir que o router sozinho basta.
    vi.spyOn(fs, "existsSync").mockReturnValue(true); // bypassa o guard de template
    vi.mocked(db.getOrganizationById).mockResolvedValue(ORG_B as any);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue(null as any);
    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue(null as any);
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_A as any);

    const caller = appRouter.createCaller(makeCtx(USER_B));
    const err = await caller.documents.relatorioGestao({ scanId: SCAN_A.id }).catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
  });
});
