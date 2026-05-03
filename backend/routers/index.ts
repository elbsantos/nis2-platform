/**
 * server/routers/index.ts
 *
 * Main tRPC router combining all sub-routers.
 */

import { router } from "../_core/trpc";
import { scanRouter }          from "./scan.router";
import { questionnaireRouter } from "./questionnaire.router";
import { remediationRouter }   from "./remediation.router";
import { billingRouter }       from "./billing.router";
import { courseRouter }        from "./course.router";
import { docsRouter }          from "./docs.router";

export const appRouter = router({
  scan:          scanRouter,
  questionnaire: questionnaireRouter,
  remediation:   remediationRouter,
  billing:       billingRouter,
  course:        courseRouter,
  docs:          docsRouter,
});

export type AppRouter = typeof appRouter;
