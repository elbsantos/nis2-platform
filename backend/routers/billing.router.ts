/**
 * server/routers/billing.router.ts
 *
 * tRPC router for subscription management via Stripe.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure } from "../middlewares/planGuard";
import { getSubscriptionByOrgId } from "../db";
import {
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
} from "../integrations/stripe";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const billingRouter = router({
  /**
   * Get current subscription details for the authenticated org
   */
  getSubscription: freeProcedure.query(async ({ ctx }) => {
    const sub = await getSubscriptionByOrgId(ctx.org.id);
    return {
      plan:             (sub?.plan ?? "free") as "free" | "pro" | "mssp",
      stripeCustomerId: sub?.stripeCustomerId ?? null,
      stripeSubId:      sub?.stripeSubId ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      cancelAt:         sub?.cancelAt ?? null,
      isActive:
        !sub?.cancelAt &&
        (!sub?.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date()),
    };
  }),

  /**
   * Create a Stripe Checkout session to upgrade (free → pro or free → mssp)
   */
  createCheckout: freeProcedure
    .input(z.object({ plan: z.enum(["pro", "mssp"]) }))
    .mutation(async ({ ctx, input }) => {
      const result = await createCheckoutSession({
        orgId:      ctx.org.id,
        email:      ctx.user.email,
        orgName:    ctx.org.name,
        plan:       input.plan,
        successUrl: `${APP_URL}/billing?success=1&plan=${input.plan}`,
        cancelUrl:  `${APP_URL}/billing?canceled=1`,
      });
      return { url: result.url };
    }),

  /**
   * Open the Stripe Customer Portal (manage/cancel subscription)
   */
  openPortal: freeProcedure.mutation(async ({ ctx }) => {
    const sub = await getSubscriptionByOrgId(ctx.org.id);
    if (!sub?.stripeCustomerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Não tens uma subscrição activa para gerir.",
      });
    }

    const result = await createPortalSession({
      stripeCustomerId: sub.stripeCustomerId,
      returnUrl: `${APP_URL}/billing`,
    });
    return { url: result.url };
  }),

  /**
   * Cancel subscription at period end (keeps access until billing cycle ends)
   */
  cancel: freeProcedure.mutation(async ({ ctx }) => {
    const sub = await getSubscriptionByOrgId(ctx.org.id);
    if (!sub?.stripeSubId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Não tens uma subscrição activa.",
      });
    }

    await cancelSubscription(sub.stripeSubId);
    return { ok: true };
  }),
});
