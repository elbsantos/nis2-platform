/**
 * server/routers/index.ts
 *
 * Main tRPC router combining all sub-routers.
 */

import { router } from "../_core/trpc";
import { scanRouter } from "./scan.router";

export const appRouter = router({
  scan: scanRouter,
  // Add other routers as they're built:
  // questionnaire: questionnaireRouter,
  // remediation: remediationRouter,
  // course: courseRouter,
  // billing: billingRouter,
});

export type AppRouter = typeof appRouter;
