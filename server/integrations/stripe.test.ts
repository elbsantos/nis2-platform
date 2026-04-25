/**
 * server/integrations/stripe.test.ts
 *
 * Unit tests for Stripe helpers.
 * Uses Stripe test mode — no real charges.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Stripe SDK
vi.mock("stripe", () => {
  const mockStripe = {
    customers: {
      search: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ id: "cus_test123" }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: "cs_test123",
          url: "https://checkout.stripe.com/test",
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/test" }),
      },
    },
    subscriptions: {
      update: vi.fn().mockResolvedValue({ id: "sub_test123" }),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  return { default: vi.fn(() => mockStripe) };
});

process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_PRICE_PRO = "price_pro_mock";
process.env.STRIPE_PRICE_MSSP = "price_mssp_mock";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";

import {
  getOrCreateCustomer,
  createCheckoutSession,
  extractPlanFromSubscription,
  constructWebhookEvent,
} from "./stripe";

describe("getOrCreateCustomer", () => {
  it("creates a new customer when none exists", async () => {
    const id = await getOrCreateCustomer(1, "test@example.com", "Test Org");
    expect(id).toBe("cus_test123");
  });
});

describe("createCheckoutSession", () => {
  it("returns a checkout URL for pro plan", async () => {
    const result = await createCheckoutSession({
      orgId: 1,
      email: "test@example.com",
      orgName: "Test Org",
      plan: "pro",
      successUrl: "https://app.com/success",
      cancelUrl: "https://app.com/cancel",
    });
    expect(result.url).toContain("stripe.com");
    expect(result.sessionId).toBe("cs_test123");
  });

  it("throws if price ID not configured", async () => {
    const original = process.env.STRIPE_PRICE_PRO;
    delete process.env.STRIPE_PRICE_PRO;
    await expect(
      createCheckoutSession({
        orgId: 1,
        email: "a@b.com",
        orgName: "X",
        plan: "pro",
        successUrl: "x",
        cancelUrl: "x",
      })
    ).rejects.toThrow("Price ID");
    process.env.STRIPE_PRICE_PRO = original;
  });
});

describe("extractPlanFromSubscription", () => {
  it("extracts pro from metadata", () => {
    const plan = extractPlanFromSubscription({ metadata: { plan: "pro" } } as any);
    expect(plan).toBe("pro");
  });

  it("falls back to free for unknown plan", () => {
    const plan = extractPlanFromSubscription({ metadata: {} } as any);
    expect(plan).toBe("free");
  });
});

describe("constructWebhookEvent", () => {
  it("delegates to stripe.webhooks.constructEvent", () => {
    const { default: Stripe } = require("stripe");
    const instance = new Stripe("sk_test_mock");
    instance.webhooks.constructEvent.mockReturnValue({ type: "test.event" });

    const event = constructWebhookEvent(Buffer.from("body"), "sig");
    expect(event).toEqual({ type: "test.event" });
  });
});
