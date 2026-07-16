/**
 * server/routers/course.router.ts
 *
 * tRPC router for the NIS2 course: progress, quiz, certificate.
 * Module 1 — free tier.  Module 2 — pro/mssp only.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure, proProcedure } from "../middlewares/planGuard";
import {
  markLessonComplete,
  getLessonProgress,
  getCertificateIssuedAt,
  getUserById,
} from "../db";
import {
  courseModules,
  getAllLessons,
  getLessonById,
  type Lesson,
} from "../services/course-config";
import { getDocsByLesson }              from "../content/docs-catalog";
import { generateCertificateBuffer }    from "../services/certificate-generator";

// "module-1/lesson-1-1" → "1.1", "module-2/lesson-2-3" → "2.3"
function toCatalogLessonId(lessonId: string): string {
  const m = lessonId.match(/lesson-(\d+)-(\d+)$/);
  return m ? `${m[1]}.${m[2]}` : "";
}

const TOTAL_LESSONS = getAllLessons().length; // 7

// Strip correct answers before sending to client
function sanitizeQuiz(lesson: Lesson) {
  return lesson.quiz.map(({ id, question, options }) => ({ id, question, options }));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const courseRouter = router({
  /**
   * All modules + lessons with user progress injected
   */
  getModules: freeProcedure.query(async ({ ctx }) => {
    const progress = await getLessonProgress(ctx.user.id, ctx.org.id);
    const completedIds = new Set(progress.map((p) => p.lessonId));

    return courseModules.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => {
        const requiresPro = lesson.moduleId === "module-2";
        const locked      = requiresPro && ctx.plan === "free";
        return {
          id:             lesson.id,
          slug:           lesson.slug,
          moduleId:       lesson.moduleId,
          title:          lesson.title,
          description:    lesson.description,
          durationMinutes: lesson.durationMinutes,
          templateCount:  getDocsByLesson(toCatalogLessonId(lesson.id)).length,
          completed:      completedIds.has(lesson.id),
          locked,
          requiresPro,
        };
      }),
    }));
  }),

  /**
   * Single lesson content (quiz questions without correct answers, templates)
   */
  getLesson: freeProcedure
    .input(z.object({ lessonId: z.string().max(100) }))
    .query(async ({ ctx, input }) => {
      const lesson = getLessonById(input.lessonId);
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });

      if (lesson.moduleId === "module-2" && ctx.plan === "free") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "O Módulo 2 requer o plano Pro. Faz upgrade para aceder a estas aulas.",
        });
      }

      const progress  = await getLessonProgress(ctx.user.id, ctx.org.id);
      const completed = progress.some((p) => p.lessonId === lesson.id);
      const catalogId = toCatalogLessonId(lesson.id);
      const templates = getDocsByLesson(catalogId).map((doc) => {
        const accessible = doc.plan === "free" || ctx.plan !== "free";
        return {
          id:        doc.id,
          name:      doc.label,
          type:      doc.type,
          url:       accessible ? `/api/docs/download/${doc.id}` : null,
          available: accessible,
        };
      });

      return {
        id:             lesson.id,
        moduleId:       lesson.moduleId,
        title:          lesson.title,
        description:    lesson.description,
        durationMinutes: lesson.durationMinutes,
        content:        lesson.content ?? null,
        quiz:           sanitizeQuiz(lesson),
        templates,
        completed,
      };
    }),

  /**
   * Submit quiz answers — returns score and full results with explanations
   */
  submitQuiz: freeProcedure
    .input(
      z.object({
        lessonId: z.string().max(100),
        answers: z.array(
          z.object({
            questionId:    z.string().max(100),
            selectedIndex: z.number().int().min(0).max(3),
          })
        ).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lesson = getLessonById(input.lessonId);
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });

      if (lesson.moduleId === "module-2" && ctx.plan === "free") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const answerMap = new Map(input.answers.map((a) => [a.questionId, a.selectedIndex]));

      let correct = 0;
      const results = lesson.quiz.map((q) => {
        const selected = answerMap.get(q.id) ?? -1;
        const isCorrect = selected === q.correct;
        if (isCorrect) correct++;
        return {
          questionId:    q.id,
          question:      q.question,
          selectedIndex: selected,
          correctIndex:  q.correct,
          correct:       isCorrect,
          explanation:   q.explanation,
        };
      });

      const score = Math.round((correct / lesson.quiz.length) * 100);

      return {
        score,
        correct,
        total:   lesson.quiz.length,
        passed:  score >= 60,
        results,
      };
    }),

  /**
   * Mark lesson as completed and (if all done) record certificateIssuedAt
   */
  markComplete: freeProcedure
    .input(z.object({ lessonId: z.string().max(100) }))
    .mutation(async ({ ctx, input }) => {
      const lesson = getLessonById(input.lessonId);
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });

      if (lesson.moduleId === "module-2" && ctx.plan === "free") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await markLessonComplete({
        userId:         ctx.user.id,
        organizationId: ctx.org.id,
        moduleId:       lesson.moduleId,
        lessonId:       lesson.id,
      });

      // Check if all lessons are now complete
      const progress = await getLessonProgress(ctx.user.id, ctx.org.id);

      const applicableLessons = getAllLessons().filter(
        (l) => ctx.plan !== "free" || l.moduleId === "module-1"
      );
      const allDone = applicableLessons.every((l) =>
        progress.some((p) => p.lessonId === l.id)
      );

      let certificateIssuedAt: Date | null = null;

      if (allDone) {
        const existing = await getCertificateIssuedAt(ctx.user.id);
        if (existing) {
          certificateIssuedAt = existing;
        } else {
          certificateIssuedAt = new Date();
          await markLessonComplete({
            userId:              ctx.user.id,
            organizationId:      ctx.org.id,
            moduleId:            lesson.moduleId,
            lessonId:            lesson.id,
            certificateIssuedAt,
          });
        }
      }

      return {
        completed:           true,
        courseComplete:      allDone,
        certificateIssuedAt,
      };
    }),

  /**
   * Generate certificate on-demand — verifies course completion in DB
   */
  certificate: freeProcedure.mutation(async ({ ctx }) => {
    const progress = await getLessonProgress(ctx.user.id, ctx.org.id);
    const applicableLessons = getAllLessons().filter(
      (l) => ctx.plan !== "free" || l.moduleId === "module-1"
    );
    const allDone = applicableLessons.every((l) =>
      progress.some((p) => p.lessonId === l.id)
    );

    if (!allDone) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Curso não concluído. Completa todas as aulas para acederes ao certificado.",
      });
    }

    const user      = await getUserById(ctx.user.id);
    const issuedAt  = await getCertificateIssuedAt(ctx.user.id);

    const buffer = await generateCertificateBuffer({
      userName:    user?.name ?? ctx.user.email,
      orgName:     ctx.org.name,
      completedAt: issuedAt ?? new Date(),
    });

    return {
      pdfBase64: buffer.toString("base64"),
      filename:  `certificado-cisplan-${ctx.user.id}.pdf`,
    };
  }),

  /**
   * Get overall course progress summary
   */
  getProgress: freeProcedure.query(async ({ ctx }) => {
    const progress       = await getLessonProgress(ctx.user.id, ctx.org.id);
    const issuedAt       = await getCertificateIssuedAt(ctx.user.id);

    const applicableLessons = getAllLessons().filter(
      (l) => ctx.plan !== "free" || l.moduleId === "module-1"
    );

    return {
      completed:           progress.length,
      total:               TOTAL_LESSONS,
      applicable:          applicableLessons.length,
      completedIds:        progress.map((p) => p.lessonId),
      courseComplete:      applicableLessons.every((l) =>
        progress.some((p) => p.lessonId === l.id)
      ),
      certificateIssuedAt: issuedAt,
    };
  }),
});
