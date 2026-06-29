/**
 * server/routers/questionnaire.router.ts
 *
 * tRPC router for NIS2 Art. 21(2) questionnaire (42 controls).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure } from "../middlewares/planGuard";
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

// ---------------------------------------------------------------------------
// Pesos das medidas para cálculo de prioridade no relatório
// Alinhado com NIS2_ARTICLE_MAP em scan-executor (importância regulatória)
// ---------------------------------------------------------------------------
const MEASURE_WEIGHTS: Record<string, number> = {
  a: 10, b: 10, c: 8, d: 8, e: 12, f: 5, g: 10, h: 15, i: 12, j: 10,
};

// ---------------------------------------------------------------------------
// Metadados das 10 medidas — derivado de NIS2_CONTROLS para evitar duplicação
// ---------------------------------------------------------------------------
const MEASURE_META: Record<string, { article: string; title: string }> = {};
for (const c of NIS2_CONTROLS) {
  if (!MEASURE_META[c.articleSlug]) {
    MEASURE_META[c.articleSlug] = { article: c.article, title: c.articleTitle };
  }
}

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
   * Relatório completo de uma sessão concluída:
   * score por medida, lacunas e plano de ação priorizado.
   */
  report: freeProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const session = await getQuestionnaireSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.organizationId !== ctx.org.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (session.status !== "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sessão não concluída" });
      }

      const answers = (session.answers ?? []) as Array<{
        controlId: string;
        answer: string;
        score: number;
      }>;
      const articleScores = (session.articleScores ?? {}) as Record<string, number>;
      const answerMap = new Map(answers.map((a) => [a.controlId, a.answer]));

      // ── Score por medida ──────────────────────────────────────────────────
      const measureScores = (["a","b","c","d","e","f","g","h","i","j"] as const).map((slug) => {
        const meta     = MEASURE_META[slug] ?? { article: `Art. 21(2)(${slug})`, title: slug };
        const controls = NIS2_CONTROLS.filter((c) => c.articleSlug === slug);
        const applicable = controls.filter((c) => {
          const ans = answerMap.get(c.id);
          return ans !== undefined && ans !== "na";
        });
        const gapCount = applicable.filter((c) => {
          const ans = answerMap.get(c.id);
          return ans === "no" || ans === "partial";
        }).length;
        return {
          slug,
          article:      meta.article,
          title:        meta.title,
          score:        applicable.length > 0 ? (articleScores[slug] ?? null) : null,
          controlCount: controls.length,
          answeredCount: applicable.length,
          gapCount,
        };
      });

      // ── Lacunas — controlos não cumpridos ou parciais ─────────────────────
      const gaps = answers
        .filter((a) => a.answer === "no" || a.answer === "partial")
        .map((a) => {
          const control = NIS2_CONTROLS.find((c) => c.id === a.controlId);
          if (!control) return null;
          const answerScore    = a.answer === "partial" ? 50 : 0;
          const measureWeight  = MEASURE_WEIGHTS[control.articleSlug] ?? 10;
          // prioridade: medidas mais pesadas e respostas mais negativas primeiro
          const priority       = measureWeight * (100 - answerScore);
          return {
            controlId:           control.id,
            article:             control.article,
            articleSlug:         control.articleSlug,
            articleTitle:        control.articleTitle,
            question:            control.question,
            answer:              a.answer as "no" | "partial",
            helpText:            control.helpText,
            why:                 control.why,
            priority,
            suggestedDocument:   control.evidence.description ?? null,
            evidenceType:        control.evidence.type,
            evidenceRequired:    control.evidence.required,
          };
        })
        .filter((g): g is NonNullable<typeof g> => g !== null)
        .sort((a, b) => b.priority - a.priority);

      return {
        sessionId:    session.id,
        completedAt:  session.completedAt,
        overallScore: session.score ? parseInt(session.score, 10) : 0,
        answeredCount: answers.filter((a) => a.answer !== "na").length,
        totalApplicable: NIS2_CONTROLS.filter((c) => {
          const ans = answerMap.get(c.id);
          return ans !== undefined && ans !== "na";
        }).length,
        measureScores,
        gaps,          // ordenadas por prioridade — servem de plano de ação
      };
    }),

  /**
   * AI explanation of a control (pro/mssp only)
   */
  explainControl: freeProcedure
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
