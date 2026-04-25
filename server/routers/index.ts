/**
 * server/routers/index.ts
 *
 * Main tRPC router combining all sub-routers.
 */

import { router } from "../_core/trpc";
import { scanRouter } from "./scan.router";
import { questionnaireRouter } from "./questionnaire.router";
import { remediationRouter } from "./remediation.router";

export const appRouter = router({
  scan:          scanRouter,
  questionnaire: questionnaireRouter,
  remediation:   remediationRouter,
  // course: courseRouter,   — Week 7-8
  // billing: billingRouter, — Week 7-8
});

export type AppRouter = typeof appRouter;
