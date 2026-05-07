/**
 * server/integrations/stripe.ts
 *
 * Stripe billing integration for NIS2 Plataforma PT.
 *
 * Plans:
 *   Free  — €0     (no Stripe, just DB flag)
 *   Pro   — €89/mês + IVA (STRIPE_PRICE_PRO)
 *   MSSP  — €199/mês + IVA (STRIPE_PRICE_MSSP)
 */

import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("[Stripe] STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Plan = "free" | "pro" | "mssp";

export interface CheckoutResult {
  url: string;
  sessionId: string;
}

export interface PortalResult {
  url: string;
}

// ---------------------------------------------------------------------------
// Create or retrieve Stripe customer for an org
// ---------------------------------------------------------------------------

export async function getOrCreateCustomer(
  orgId: number,
  email: string,
  orgName: string
): Promise<string> {
  const stripe = getStripe();

  // Search for existing customer by metadata
  const existing = await stripe.customers.search({
    query: `metadata["orgId"]:"${orgId}"`,
    limit: 1,
  });

  if (existing.data.length > 0) {
    return existing.data[0].id;
  }

  const customer = await stripe.customers.create({
    email,
    name: orgName,
    metadata: { orgId: String(orgId) },
  });

  return customer.id;
}

// ---------------------------------------------------------------------------
// Create checkout session (free → pro or free → mssp)
// ---------------------------------------------------------------------------

export async function createCheckoutSession(opts: {
  orgId: number;
  email: string;
  orgName: string;
  plan: "pro" | "mssp";
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutResult> {
  const stripe = getStripe();

  const priceId =
    opts.plan === "pro"
      ? process.env.STRIPE_PRICE_PRO
      : process.env.STRIPE_PRICE_MSSP;

  if (!priceId) {
    throw new Error(`[Stripe] Price ID for plan "${opts.plan}" is not configured`);
  }

  const customerId = await getOrCreateCustomer(
    opts.orgId,
    opts.email,
    opts.orgName
  );

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { orgId: String(opts.orgId), plan: opts.plan },
    },
    locale: "pt",
  });

  if (!session.url) throw new Error("[Stripe] No checkout URL returned");
  return { url: session.url, sessionId: session.id };
}

// ---------------------------------------------------------------------------
// Create customer portal session (manage subscription)
// ---------------------------------------------------------------------------

export async function createPortalSession(opts: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<PortalResult> {
  const stripe = getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: opts.stripeCustomerId,
    return_url: opts.returnUrl,
  });

  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Webhook handler — verify signature and return parsed event
// Called from Express route POST /api/webhooks/stripe
// ---------------------------------------------------------------------------

export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("[Stripe] STRIPE_WEBHOOK_SECRET is not set");
  }

  return getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
}

// ---------------------------------------------------------------------------
// Extract plan from Stripe subscription metadata
// ---------------------------------------------------------------------------

export function extractPlanFromSubscription(
  subscription: Stripe.Subscription
): Plan {
  const plan = subscription.metadata?.plan as Plan | undefined;
  if (plan === "pro" || plan === "mssp") return plan;
  return "free";
}

// ---------------------------------------------------------------------------
// Cancel subscription (downgrade to free)
// ---------------------------------------------------------------------------

export async function cancelSubscription(
  stripeSubId: string
): Promise<void> {
  const stripe = getStripe();
  // Cancel at period end — user keeps access until billing cycle ends
  await stripe.subscriptions.update(stripeSubId, {
    cancel_at_period_end: true,
  });
}
