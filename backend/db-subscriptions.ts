/**
 * server/db-subscriptions.ts
 *
 * Database helpers for subscriptions table.
 * Merge these functions into server/db.ts
 */

import { db } from "./db";
import { subscriptions } from "../database/schema";
import { eq } from "drizzle-orm";

export interface SubscriptionData {
  organizationId: number;
  plan: "free" | "pro" | "mssp";
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  currentPeriodEnd: Date | null;
}

/** Create or update subscription for an org */
export async function upsertSubscription(data: SubscriptionData) {
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, data.organizationId))
    .limit(1);

  if (existing.length > 0) {
    return db
      .update(subscriptions)
      .set({
        plan: data.plan,
        stripeCustomerId: data.stripeCustomerId,
        stripeSubId: data.stripeSubId,
        currentPeriodEnd: data.currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, data.organizationId));
  }

  return db.insert(subscriptions).values({
    organizationId: data.organizationId,
    plan: data.plan,
    stripeCustomerId: data.stripeCustomerId,
    stripeSubId: data.stripeSubId,
    currentPeriodEnd: data.currentPeriodEnd,
  });
}

/** Get subscription by org ID */
export async function getSubscriptionByOrgId(orgId: number) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .limit(1);
  return rows[0] ?? null;
}

/** Get org by Stripe customer ID (for webhook handlers) */
export async function getOrgByStripeCustomerId(customerId: string) {
  const rows = await db
    .select({ organizationId: subscriptions.organizationId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);

  if (!rows[0]) return null;

  const { organizations } = await import("../database/schema");
  const orgs = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, rows[0].organizationId))
    .limit(1);

  return orgs[0] ?? null;
}

/** Count scans this calendar month for an org (free tier limit check) */
export async function countScansThisMonth(orgId: number): Promise<number> {
  const { scans } = await import("../database/schema");
  const { gte, and } = await import("drizzle-orm");
  const { sql } = await import("drizzle-orm");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(scans)
    .where(
      and(
        eq(scans.organizationId, orgId),
        gte(scans.createdAt, startOfMonth)
      )
    );

  return Number(rows[0]?.count ?? 0);
}
