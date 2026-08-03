/**
 * backend/routers/questionnaire.router.test.ts
 *
 * Testa a validação de "42 perguntas todas respondidas" antes de concluir
 * (endpoint `complete`) — a barreira real fica no backend, o botão do
 * frontend é só UX.
 */

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  // freeProcedure (planGuard) faz self-heal de org + lookup de plano antes de
  // qualquer handler correr — têm de estar mockados mesmo não sendo o foco do teste.
  getOrCreateOrgForOwner:          vi.fn(),
  getSubscriptionByOrgId:          vi.fn(),
  createQuestionnaireSession:      vi.fn(),
  getQuestionnaireSessionById:     vi.fn(),
  getQuestionnaireSessionsByOrgId: vi.fn(),
  updateQuestionnaireSession:      vi.fn(),
}));

vi.mock("../services/questionnaire-pdf-generator", () => ({
  generateQuestionnaireReportPdf: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (após mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as db from "../db";
import { questionnaireRouter } from "./questionnaire.router";
import { NIS2_CONTROLS } from "../services/ai-questionnaire";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A  = { id: 1, name: "Org A", ownerId: 10, createdAt: new Date(), updatedAt: new Date() };
const USER_A = {
  id: 10, email: "a@test.com", name: "User A", role: "admin" as const,
  organizationId: ORG_A.id, passwordHash: null, resetTokenHash: null,
  resetTokenExpiresAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

function makeCtx(user: typeof USER_A, org: typeof ORG_A) {
  return { user, org, req: {} as any, res: {} as any, plan: "free" as const };
}

const SESSION_BASE = {
  id: 1, organizationId: ORG_A.id, userId: USER_A.id, sector: null,
  status: "in_progress" as const, score: null, articleScores: null,
  completedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

/** Constrói respostas para TODOS os 42 controlos — "na" é resposta válida, não em branco. */
function allControlsAnswered(naForIds: string[] = []) {
  return NIS2_CONTROLS.map((c) => {
    const answer = naForIds.includes(c.id) ? "na" : "yes";
    return { controlId: c.id, answer, score: answer === "yes" ? 100 : 0 };
  });
}

beforeEach(() => {
  vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
  vi.mocked(db.getSubscriptionByOrgId).mockResolvedValue(null as any);
  vi.mocked(db.updateQuestionnaireSession).mockResolvedValue(undefined as any);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// complete — validação das 42 perguntas
// ---------------------------------------------------------------------------

describe("questionnaire.complete — exige as 42 perguntas todas respondidas", () => {
  it("rejeita com apenas 5 respostas — erro claro a indicar quantas faltam", async () => {
    const fiveAnswers = NIS2_CONTROLS.slice(0, 5).map((c) => ({
      controlId: c.id, answer: "yes", score: 100,
    }));
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue({
      ...SESSION_BASE, answers: fiveAnswers,
    } as any);

    const caller = questionnaireRouter.createCaller(makeCtx(USER_A, ORG_A));
    const err = await caller.complete({ sessionId: 1 }).catch((e) => e);

    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toContain(`todas as ${NIS2_CONTROLS.length} perguntas`);
    expect(err.message).toContain(`Faltam ${NIS2_CONTROLS.length - 5} perguntas`);
    // Não deve gravar nada como concluído quando a validação falha.
    expect(vi.mocked(db.updateQuestionnaireSession)).not.toHaveBeenCalled();
  });

  it("rejeita com zero respostas (regressão do comportamento antigo)", async () => {
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue({
      ...SESSION_BASE, answers: [],
    } as any);

    const caller = questionnaireRouter.createCaller(makeCtx(USER_A, ORG_A));
    const err = await caller.complete({ sessionId: 1 }).catch((e) => e);

    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toContain(`Faltam ${NIS2_CONTROLS.length} perguntas`);
  });

  it("aceita com as 42 respondidas, incluindo casos com N-A entre elas", async () => {
    const naIds = [NIS2_CONTROLS[0].id, NIS2_CONTROLS[10].id, NIS2_CONTROLS[20].id];
    const answers = allControlsAnswered(naIds);
    expect(answers).toHaveLength(NIS2_CONTROLS.length); // sanidade da fixture

    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue({
      ...SESSION_BASE, answers,
    } as any);

    const caller = questionnaireRouter.createCaller(makeCtx(USER_A, ORG_A));
    const result = await caller.complete({ sessionId: 1 });

    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(vi.mocked(db.updateQuestionnaireSession)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "completed" })
    );
  });

  it("rejeita quando falta só 1 pergunta de 42 (caso-limite)", async () => {
    const answers = allControlsAnswered().slice(0, NIS2_CONTROLS.length - 1);
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue({
      ...SESSION_BASE, answers,
    } as any);

    const caller = questionnaireRouter.createCaller(makeCtx(USER_A, ORG_A));
    const err = await caller.complete({ sessionId: 1 }).catch((e) => e);

    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toContain("Faltam 1 pergunta."); // singular, não "1 perguntas"
  });
});
