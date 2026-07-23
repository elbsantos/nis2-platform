/**
 * backend/routers/enquadramento.router.test.ts
 *
 * E.12 — isolamento multi-tenant
 *
 * Estratégia: createCaller com ctx.user real (canal de produção intacto).
 * A resolução de identidade corre como em produção:
 *   ctx.user.id → getOrCreateOrgForOwner → ctx.org.id
 * Só a camada de dados é mockada (o que a BD devolve).
 * Nunca se mocka ctx.org nem se injeta orgId directamente.
 */

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  getOrCreateOrgForOwner:         vi.fn(),
  getSubscriptionByOrgId:         vi.fn(),
  getFrameworkAssessmentById:     vi.fn(),
  getFrameworkAssessmentsByOrgId: vi.fn(),
  createCompletedFrameworkAssessment: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (após mocks registados)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { enquadramentoRouter } from "./enquadramento.router";
import { documentsRouter }     from "./documents.router";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = { id: 1,  name: "Org A", ownerId: 10, createdAt: new Date(), updatedAt: new Date() };
const ORG_B = { id: 2,  name: "Org B", ownerId: 20, createdAt: new Date(), updatedAt: new Date() };

const USER_B = {
  id:                   20,
  email:                "b@test.com",
  name:                 "User B",
  role:                 "member" as const,
  organizationId:       ORG_B.id,
  passwordHash:         null,
  resetTokenHash:       null,
  resetTokenExpiresAt:  null,
  deletedAt:            null,
  createdAt:            new Date(),
  updatedAt:            new Date(),
};

// Assessment pertencente a Org A
const ASSESSMENT_A = {
  id:             99,
  organizationId: ORG_A.id,
  userId:         10,
  frameworkSlug:  "nis2-pt-dl125",
  classification: "importante",
  resultLabel:    "Entidade importante",
  engineVersion:  "3",
  status:         "completed" as const,
  decisionPath:   ["A", "C", "D", "E"],
  legalBasis:     ["Art. 3.º do RJC"],
  answers:        {},
  completedAt:    new Date(),
  createdAt:      new Date(),
  updatedAt:      new Date(),
};

function makeCtx(user: typeof USER_B) {
  return { user, req: {} as any, res: {} as any };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Middleware freeProcedure → planGuard: user B pertence a Org B
  vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_B as any);
  // planGuard: plano free (sem subscrição)
  vi.mocked(db.getSubscriptionByOrgId).mockResolvedValue(null as any);
  // Assessment que existe na BD pertence a Org A
  vi.mocked(db.getFrameworkAssessmentById).mockResolvedValue(ASSESSMENT_A as any);
  // Org B não tem assessments próprios
  vi.mocked(db.getFrameworkAssessmentsByOrgId).mockResolvedValue([] as any);
});

// ---------------------------------------------------------------------------
// Testes de isolamento
// ---------------------------------------------------------------------------

describe("enquadramento.getById — isolamento multi-tenant", () => {
  it("Org B recebe FORBIDDEN ao tentar aceder a assessment de Org A", async () => {
    const caller = enquadramentoRouter.createCaller(makeCtx(USER_B));
    const err = await caller.getById({ id: ASSESSMENT_A.id }).catch(e => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
    // Nenhum dado do assessment de A deve ter chegado ao caller
    expect(err).not.toHaveProperty("data.assessment");
  });
});

describe("documents.relatorioEnquadramento — isolamento multi-tenant", () => {
  it("Org B recebe FORBIDDEN ao tentar gerar relatório de assessment de Org A", async () => {
    const caller = documentsRouter.createCaller(makeCtx(USER_B));
    const err = await caller.relatorioEnquadramento({ assessmentId: ASSESSMENT_A.id }).catch(e => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
  });
});

describe("enquadramento.list — isolamento multi-tenant", () => {
  it("lista devolvida a Org B não contém ids de assessments de Org A", async () => {
    // BD: Org A tem dados, Org B não tem — mock distingue por orgId
    vi.mocked(db.getFrameworkAssessmentsByOrgId).mockImplementation(
      (orgId: number) => Promise.resolve(orgId === ORG_A.id ? [ASSESSMENT_A] : []) as any
    );

    const caller = enquadramentoRouter.createCaller(makeCtx(USER_B));
    const result = await caller.list();

    // Org B só deve ver os seus próprios dados (lista vazia neste cenário)
    expect(result.map((a: any) => a.id)).not.toContain(ASSESSMENT_A.id);
  });
});
