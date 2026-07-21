/**
 * backend/routers/enquadramento.router.ts
 *
 * tRPC router para o Enquadramento NIS2-PT (DL 125/2025).
 * Motor: backend/utils/decision-engine.ts (C-EQ1)
 * Schema: framework_assessments (C-EQ2)
 *
 * Endpoints (todos freeProcedure):
 *   enquadramento.start       — inicia assessment (status in_progress)
 *   enquadramento.saveAnswers — guarda respostas parciais
 *   enquadramento.complete    — corre motor + persiste trilha completa
 *   enquadramento.getById     — devolve assessment (verifica posse)
 *   enquadramento.list        — lista assessments da org
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure } from "../middlewares/planGuard";
import {
  createFrameworkAssessment,
  getFrameworkAssessmentById,
  updateFrameworkAssessment,
  getFrameworkAssessmentsByOrgId,
} from "../db";
import {
  ENGINE_VERSION,
  NIS2_PT_TREE,
  evaluateTree,
} from "../utils/decision-engine";

export const enquadramentoRouter = router({
  /**
   * Inicia um novo assessment. Grava ENGINE_VERSION do motor, nunca hardcoded.
   */
  start: freeProcedure
    .input(
      z.object({
        frameworkSlug: z.string().max(50).default("nis2-pt-dl125"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const assessment = await createFrameworkAssessment({
        organizationId: ctx.org.id,
        userId:         ctx.user.id,
        frameworkSlug:  input.frameworkSlug,
        engineVersion:  ENGINE_VERSION,
      });
      return { id: assessment.id };
    }),

  /**
   * Guarda respostas parciais. Verifica posse ANTES de qualquer escrita.
   */
  saveAnswers: freeProcedure
    .input(
      z.object({
        id:      z.number().int().positive(),
        answers: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const assessment = await getFrameworkAssessmentById(input.id);
      if (!assessment)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (assessment.organizationId !== ctx.org.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      if (assessment.status === "completed")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Assessment já concluído" });

      await updateFrameworkAssessment(input.id, { answers: input.answers });
      return { saved: Object.keys(input.answers).length };
    }),

  /**
   * Corre o motor determinístico e persiste a trilha auditável completa.
   * Verifica posse ANTES de correr o motor ou escrever na BD.
   */
  complete: freeProcedure
    .input(
      z.object({
        id:      z.number().int().positive(),
        answers: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const assessment = await getFrameworkAssessmentById(input.id);
      if (!assessment)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (assessment.organizationId !== ctx.org.id)
        throw new TRPCError({ code: "FORBIDDEN" });

      const result = evaluateTree(NIS2_PT_TREE, input.answers);

      await updateFrameworkAssessment(input.id, {
        answers:        input.answers,
        decisionPath:   result.path,
        legalBasis:     result.legalBasis,
        classification: result.classification,
        resultLabel:    result.resultLabel,
        status:         "completed",
        completedAt:    new Date(),
      });

      return result;
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
