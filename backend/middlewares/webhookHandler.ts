/**
 * server/middlewares/webhookHandler.ts
 *
 * Express route handler for Stripe webhooks.
 * Register in server/_core/index.ts BEFORE the json body parser
 * (Stripe needs the raw body to verify the signature).
 *
 * Usage in index.ts:
 *   import { registerWebhookRoutes } from "../middlewares/webhookHandler";
 *   registerWebhookRoutes(app); // BEFORE app.use(express.json())
 */

import type { Application } from "express";
import {
  constructWebhookEvent,
  extractPlanFromSubscription,
} from "../integrations/stripe";
import {
  upsertSubscription,
  getOrgByStripeCustomerId,
  getUserByOrgId,
} from "../db";
import {
  sendUpgradeConfirmed,
  sendPaymentFailed,
} from "../integrations/resend";

// ---------------------------------------------------------------------------
// Register raw-body route BEFORE express.json()
// ---------------------------------------------------------------------------

export function registerWebhookRoutes(app: Application): void {
  app.post(
    "/api/webhooks/stripe",
    // Raw body middleware — only for this route
    (req, res, next) => {
      let data = Buffer.alloc(0);
      req.on("data", (chunk: Buffer) => {
        data = Buffer.concat([data, chunk]);
      });
      req.on("end", () => {
        (req as any).rawBody = data;
        next();
      });
    },
    async (req, res) => {
      const signature = req.headers["stripe-signature"] as string;
      const rawBody = (req as any).rawBody as Buffer;

      if (!signature || !rawBody) {
        return res.status(400).json({ error: "Missing signature or body" });
      }

      let event;
      try {
        event = constructWebhookEvent(rawBody, signature);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid signature";
        console.error("[Webhook] Signature verification failed:", msg);
        return res.status(400).json({ error: msg });
      }

      console.log(`[Webhook] Received: ${event.type}`);

      try {
        await handleStripeEvent(event);
        res.json({ received: true });
      } catch (err) {
        console.error(`[Webhook] Handler error for ${event.type}:`, err);
        // Return 200 to prevent Stripe retrying — log the error for manual review
        res.json({ received: true, warning: "Handler error — logged" });
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Event router
// ---------------------------------------------------------------------------

async function handleStripeEvent(event: any): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object);
      break;

    case "customer.subscription.updated":
    case "customer.subscription.created":
      await handleSubscriptionUpdated(event.data.object);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object);
      break;

    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object);
      break;

    default:
      // Ignore unhandled events
      break;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session: any): Promise<void> {
  const customerId = session.customer as string;
  const plan = session.subscription
    ? extractPlanFromSubscription({ metadata: { plan: session.metadata?.plan } } as any)
    : "free";

  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) {
    console.error(`[Webhook] Org not found for Stripe customer: ${customerId}`);
    return;
  }

  await upsertSubscription({
    organizationId: org.id,
    plan,
    stripeCustomerId: customerId,
    stripeSubId: session.subscription as string | null,
    currentPeriodEnd: null,
  });

  const user = await getUserByOrgId(org.id);
  if (user?.email && plan !== "free") {
    await sendUpgradeConfirmed({
      to: user.email,
      name: user.name ?? "utilizador",
      plan: plan as "pro" | "mssp",
      dashboardUrl: `${process.env.APP_URL ?? "https://nis2pt.pt"}/dashboard`,
    }).catch((e) => console.error("[Webhook] Email send failed:", e));
  }
}

async function handleSubscriptionUpdated(subscription: any): Promise<void> {
  const customerId = subscription.customer as string;
  const plan = extractPlanFromSubscription(subscription);

  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) return;

  await upsertSubscription({
    organizationId: org.id,
    plan,
    stripeCustomerId: customerId,
    stripeSubId: subscription.id,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
  });
}

async function handleSubscriptionDeleted(subscription: any): Promise<void> {
  const customerId = subscription.customer as string;
  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) return;

  // Downgrade to free
  await upsertSubscription({
    organizationId: org.id,
    plan: "free",
    stripeCustomerId: customerId,
    stripeSubId: null,
    currentPeriodEnd: null,
  });
}

async function handlePaymentFailed(invoice: any): Promise<void> {
  const customerId = invoice.customer as string;
  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) return;

  const user = await getUserByOrgId(org.id);
  if (user?.email) {
    await sendPaymentFailed({
      to: user.email,
      name: user.name ?? "utilizador",
      retryUrl: `${process.env.APP_URL ?? "https://nis2pt.pt"}/billing`,
    }).catch((e) => console.error("[Webhook] Payment failed email error:", e));
  }
}
