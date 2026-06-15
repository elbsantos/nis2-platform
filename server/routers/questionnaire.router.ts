/**
 * server/routers/questionnaire.router.ts
 *
 * tRPC router for NIS2 Art. 21(2) questionnaire (42 controls).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure, proProcedure } from "../middlewares/planGuard";
import {
  createQuestionnaireSession,
  getQuestionnaireSessionById,
  getQuestionnaireSessionsByOrgId,
  updateQuestionnaireSession,
} from "../db";
import {
  NIS2_CONTROLS,
  calculateScores,
  explainControl,
} from "../services/ai-questionnaire";

export const questionnaireRouter = router({
  /**
   * List of all 42 NIS2 controls (static — no DB needed)
   */
  controls: freeProcedure.query(() => NIS2_CONTROLS),

  /**
   * Start a new questionnaire session
   */
  start: freeProcedure
    .input(z.object({ sector: z.string().max(100).optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await createQuestionnaireSession({
        organizationId: ctx.org.id,
        userId:         ctx.user.id,
        sector:         input.sector,
      });
      return session;
    }),

  /**
   * List sessions for the authenticated org
   */
  list: freeProcedure.query(async ({ ctx }) => {
    return getQuestionnaireSessionsByOrgId(ctx.org.id);
  }),

  /**
   * Get a single session by ID
   */
  getById: freeProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const session = await getQuestionnaireSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.organizationId !== ctx.org.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return session;
    }),

  /**
   * Save answers (partial or full) to a session
   */
  saveAnswers: freeProcedure
    .input(
      z.object({
        sessionId: z.number().int().positive(),
        answers: z.array(
          z.object({
            controlId: z.string().max(20),
            answer: z.enum(["yes", "partial", "no", "na"]),
          })
        ).max(42),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getQuestionnaireSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.organizationId !== ctx.org.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (session.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sessão já concluída" });
      }

      // Merge with existing answers
      const existing = (session.answers ?? []) as Array<{ controlId: string; answer: string; score: number }>;
      const existingMap = new Map(existing.map((a) => [a.controlId, a]));

      for (const a of input.answers) {
        const score = a.answer === "yes" ? 100 : a.answer === "partial" ? 50 : 0;
        existingMap.set(a.controlId, { controlId: a.controlId, answer: a.answer, score });
      }

      const merged = Array.from(existingMap.values());
      await updateQuestionnaireSession(input.sessionId, { answers: merged });
      return { saved: input.answers.length };
    }),

  /**
   * Complete a session — calculates final scores and persists
   */
  complete: freeProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getQuestionnaireSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.organizationId !== ctx.org.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const answers = (session.answers ?? []) as Array<{ controlId: string; answer: string; score: number }>;
      if (answers.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma resposta registada" });
      }

      const scores = calculateScores(answers);

      await updateQuestionnaireSession(input.sessionId, {
        score:         String(scores.overall),
        articleScores: scores.byArticle,
        status:        "completed",
        completedAt:   new Date(),
      });

      return { overall: scores.overall, byArticle: scores.byArticle };
    }),

  /**
   * AI explanation of a control (pro/mssp only)
   */
  explainControl: proProcedure
    .input(z.object({ controlId: z.string().max(20) }))
    .query(async ({ ctx, input }) => {
      const control = NIS2_CONTROLS.find((c) => c.id === input.controlId);
      if (!control) throw new TRPCError({ code: "NOT_FOUND" });

      const explanation = await explainControl(control, {
        sector:  ctx.org.sector ?? undefined,
        size:    ctx.org.size   ?? undefined,
        orgName: ctx.org.name,
        orgId:   ctx.org.id,
        plan:    ctx.plan,
      });

      return { controlId: input.controlId, explanation };
    }),
});
