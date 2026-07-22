/**
 * backend/routers/enquadramento.router.ts
 *
 * tRPC router para o Enquadramento NIS2-PT (DL 125/2025).
 * Motor: backend/utils/decision-engine.ts (C-EQ1)
 * Schema: framework_assessments (C-EQ2)
 *
 * Endpoints (todos freeProcedure):
 *   enquadramento.complete — corre motor + cria linha já completed (C-EQ7)
 *   enquadramento.getById  — devolve assessment (verifica posse)
 *   enquadramento.list     — lista assessments da org
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure } from "../middlewares/planGuard";
import {
  createCompletedFrameworkAssessment,
  getFrameworkAssessmentById,
  getFrameworkAssessmentsByOrgId,
} from "../db";
import {
  ENGINE_VERSION,
  NIS2_PT_TREE,
  evaluateTree,
} from "../utils/decision-engine";

export const enquadramentoRouter = router({
  /**
   * Corre o motor determinístico e cria a linha já com status='completed'.
   * Não há linha in_progress intermédia — nenhum fantasma pode ficar para trás.
   */
  complete: freeProcedure
    .input(
      z.object({
        answers: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = evaluateTree(NIS2_PT_TREE, input.answers);

      const { id } = await createCompletedFrameworkAssessment({
        organizationId: ctx.org.id,
        userId:         ctx.user.id,
        frameworkSlug:  "nis2-pt-dl125",
        engineVersion:  ENGINE_VERSION,
        answers:        input.answers,
        decisionPath:   result.path,
        legalBasis:     result.legalBasis,
        classification: result.classification,
        resultLabel:    result.resultLabel,
      });

      return { id, ...result };
    }),

  /**
   * Devolve um assessment por id. Verifica posse ANTES de devolver dados.
   */
  getById: freeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const assessment = await getFrameworkAssessmentById(input.id);
      if (!assessment)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (assessment.organizationId !== ctx.org.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      return assessment;
    }),

  /**
   * Lista todos os assessments da org autenticada.
   */
  list: freeProcedure.query(async ({ ctx }) => {
    return getFrameworkAssessmentsByOrgId(ctx.org.id);
  }),
});
