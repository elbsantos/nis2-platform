/**
 * server/db.ts
 *
 * Single DB entry point. Exports the Drizzle instance and all query helpers.
 * Consolidates db-scans.ts and db-subscriptions.ts.
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import {
  organizations,
  users,
  scans,
  vulnerabilities,
  subscriptions,
} from "../drizzle/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Connection singleton
// ---------------------------------------------------------------------------

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const pool = mysql.createPool({
      uri: process.env.DATABASE_URL ?? "mysql://root:root@localhost:3306/nis2db",
      waitForConnections: true,
      connectionLimit: 10,
    });
    _db = drizzle(pool, { schema, mode: "default" });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { User, Organization, Scan, Vulnerability, Subscription } from "../drizzle/schema";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getUserById(userId: number) {
  const rows = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string) {
  const rows = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(data: {
  email: string;
  name?: string;
  passwordHash?: string;
  organizationId?: number;
  role?: "admin" | "member";
}) {
  const [row] = await getDb().insert(users).values(data).$returningId();
  return { id: row.id, ...data };
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function getOrganizationByOwnerId(ownerId: number) {
  const rows = await getDb()
    .select()
    .from(organizations)
    .where(eq(organizations.ownerId, ownerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOrganizationById(orgId: number) {
  const rows = await getDb()
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createOrganization(data: {
  name: string;
  domain?: string;
  ownerId?: number;
  sector?: string;
}) {
  const [row] = await getDb().insert(organizations).values(data).$returningId();
  return { id: row.id, ...data };
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

export interface CreateScanData {
  organizationId: number;
  target: string;
  mode: "sme" | "supply";
  status: "pending" | "running" | "completed" | "failed";
}

export async function createScan(data: CreateScanData) {
  const [row] = await getDb().insert(scans).values(data).$returningId();
  return { id: row.id, ...data };
}

export async function getScanById(scanId: number) {
  const rows = await getDb().select().from(scans).where(eq(scans.id, scanId)).limit(1);
  return rows[0] ?? null;
}

export async function getScansByOrgId(orgId: number, limit = 10, offset = 0) {
  return getDb()
    .select()
    .from(scans)
    .where(eq(scans.organizationId, orgId))
    .orderBy(desc(scans.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateScanStatus(
  scanId: number,
  status: "pending" | "running" | "completed" | "failed",
  startedAt?: Date,
  completedAt?: Date,
  results?: Record<string, number>
) {
  return getDb()
    .update(scans)
    .set({
      status,
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(results ? { results } : {}),
      updatedAt: new Date(),
    })
    .where(eq(scans.id, scanId));
}

export async function getOrgScanStats(orgId: number) {
  const [totalScans] = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(scans)
    .where(eq(scans.organizationId, orgId));

  const [criticalVulns] = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(vulnerabilities)
    .where(
      and(
        eq(vulnerabilities.organizationId, orgId),
        eq(vulnerabilities.severity, "critical")
      )
    );

  const lastScan = await getDb()
    .select()
    .from(scans)
    .where(eq(scans.organizationId, orgId))
    .orderBy(desc(scans.createdAt))
    .limit(1);

  return {
    totalScans: Number(totalScans?.count ?? 0),
    criticalVulnerabilities: Number(criticalVulns?.count ?? 0),
    lastScanDate: lastScan[0]?.createdAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Vulnerabilities
// ---------------------------------------------------------------------------

export interface CreateVulnerabilityData {
  scanId: number;
  organizationId: number;
  cveId: string;
  severity: "critical" | "high" | "medium" | "low";
  cvssScore: number;
  description: string;
  affectedComponent: string;
  port?: number;
  remediation?: string;
}

export async function createVulnerability(data: CreateVulnerabilityData) {
  return getDb().insert(vulnerabilities).values({
    ...data,
    cvssScore: String(data.cvssScore),
  });
}

export async function getVulnerabilitiesByScanId(scanId: number) {
  return getDb()
    .select()
    .from(vulnerabilities)
    .where(eq(vulnerabilities.scanId, scanId))
    .orderBy(desc(vulnerabilities.cvssScore));
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function getSubscriptionByOrgId(orgId: number) {
  const rows = await getDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertSubscription(data: {
  organizationId: number;
  plan: "free" | "pro" | "mssp";
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  currentPeriodEnd: Date | null;
}) {
  const existing = await getDb()
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, data.organizationId))
    .limit(1);

  if (existing.length > 0) {
    return getDb()
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.organizationId, data.organizationId));
  }

  return getDb().insert(subscriptions).values(data);
}

export async function getOrgByStripeCustomerId(customerId: string) {
  const rows = await getDb()
    .select({ organizationId: subscriptions.organizationId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);

  if (!rows[0]) return null;

  return getOrganizationById(rows[0].organizationId);
}

export async function getUserByOrgId(orgId: number) {
  const org = await getOrganizationById(orgId);
  if (!org?.ownerId) return null;
  return getUserById(org.ownerId);
}

export async function countScansThisMonth(orgId: number): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(scans)
    .where(and(eq(scans.organizationId, orgId), gte(scans.createdAt, startOfMonth)));

  return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Questionnaire sessions
// ---------------------------------------------------------------------------

import { questionnaireSessions, remediationItems } from "../drizzle/schema";

export async function createQuestionnaireSession(data: {
  organizationId: number;
  userId: number;
  sector?: string;
}) {
  const [row] = await getDb().insert(questionnaireSessions).values(data).$returningId();
  return { id: row.id, ...data, status: "in_progress" as const, answers: [] };
}

export async function getQuestionnaireSessionById(sessionId: number) {
  const rows = await getDb()
    .select()
    .from(questionnaireSessions)
    .where(eq(questionnaireSessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getQuestionnaireSessionsByOrgId(orgId: number) {
  return getDb()
    .select()
    .from(questionnaireSessions)
    .where(eq(questionnaireSessions.organizationId, orgId))
    .orderBy(desc(questionnaireSessions.createdAt));
}

export async function updateQuestionnaireSession(
  sessionId: number,
  data: {
    answers?: Array<{ controlId: string; answer: string; score: number }>;
    score?: string;
    articleScores?: Record<string, number>;
    status?: "in_progress" | "completed";
    completedAt?: Date;
  }
) {
  return getDb()
    .update(questionnaireSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(questionnaireSessions.id, sessionId));
}

// ---------------------------------------------------------------------------
// Remediation items
// ---------------------------------------------------------------------------

export async function createRemediationItem(data: {
  organizationId: number;
  scanId?: number;
  vulnId?: number;
  title: string;
  steps?: Array<{ order: number; instruction: string; platform: string }>;
  effort: "low" | "medium" | "high";
  nis2Articles?: string[];
  dueDate?: string;
}) {
  const [row] = await getDb().insert(remediationItems).values(data).$returningId();
  return { id: row.id, ...data };
}

export async function getRemediationItemsByOrgId(
  orgId: number,
  status?: "todo" | "in_progress" | "done" | "wont_fix"
) {
  const q = getDb()
    .select()
    .from(remediationItems)
    .where(
      status
        ? and(
            eq(remediationItems.organizationId, orgId),
            eq(remediationItems.status, status)
          )
        : eq(remediationItems.organizationId, orgId)
    )
    .orderBy(desc(remediationItems.createdAt));
  return q;
}

export async function getRemediationItemsByScanId(scanId: number) {
  return getDb()
    .select()
    .from(remediationItems)
    .where(eq(remediationItems.scanId, scanId))
    .orderBy(desc(remediationItems.createdAt));
}

export async function updateRemediationStatus(
  itemId: number,
  orgId: number,
  status: "todo" | "in_progress" | "done" | "wont_fix"
) {
  return getDb()
    .update(remediationItems)
    .set({
      status,
      resolvedAt: status === "done" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(remediationItems.id, itemId),
        eq(remediationItems.organizationId, orgId)
      )
    );
}
