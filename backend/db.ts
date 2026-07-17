/**
 * server/db.ts
 *
 * Single DB entry point. Exports the Drizzle instance and all query helpers.
 * Consolidates db-scans.ts and db-subscriptions.ts.
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../database/schema";
import {
  organizations,
  users,
  scans,
  vulnerabilities,
  subscriptions,
} from "../database/schema";
import { eq, desc, asc, and, gte, like, sql, isNull } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Connection pool — resilient singleton that resets on fatal errors
// ---------------------------------------------------------------------------

let _db:   ReturnType<typeof drizzle<typeof schema>> | null = null;
let _pool: mysql.Pool | null = null;

function createPool(): mysql.Pool {
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL ?? "mysql://root:root@localhost:3306/nis2db",
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout:  15_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });

  // Reset singleton when pool hits a fatal error (e.g. MySQL restart on Railway).
  // Next call to getDb() will create a fresh pool automatically.
  (pool as any).on("error", (err: any) => {
    if (err.fatal) {
      console.error("[DB] Fatal pool error — resetting pool:", err.code);
      _pool = null;
      _db   = null;
    }
  });

  return pool;
}

export function getDb() {
  if (!_db || !_pool) {
    _pool = createPool();
    _db   = drizzle(_pool, { schema, mode: "default" }) as unknown as ReturnType<typeof drizzle<typeof schema>>;
  }
  return _db!;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { User, Organization, Scan, Vulnerability, Subscription } from "../database/schema";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getUserById(userId: number) {
  const rows = await getDb().select().from(users).where(
    and(eq(users.id, userId), isNull(users.deletedAt))
  ).limit(1);
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

export async function setResetToken(userId: number, tokenHash: string, expiresAt: Date) {
  await getDb()
    .update(users)
    .set({ resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function getUserByResetToken(tokenHash: string) {
  const rows = await getDb().select().from(users).where(eq(users.resetTokenHash, tokenHash)).limit(1);
  return rows[0] ?? null;
}

export async function clearResetToken(userId: number) {
  await getDb()
    .update(users)
    .set({ resetTokenHash: null, resetTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function resetUserPassword(userId: number, passwordHash: string) {
  await getDb()
    .update(users)
    .set({ passwordHash, resetTokenHash: null, resetTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function getOrganizationByOwnerId(ownerId: number) {
  const rows = await getDb()
    .select()
    .from(organizations)
    .where(eq(organizations.ownerId, ownerId))
    .orderBy(asc(organizations.id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * ADR-002: Self-heal — retorna a org do dono ou cria uma se não existir.
 * Garante uma-org-por-dono: se já existe, nunca cria duplicado.
 */
export async function getOrCreateOrgForOwner(
  ownerId: number,
  displayName?: string
): Promise<NonNullable<Awaited<ReturnType<typeof getOrganizationByOwnerId>>>> {
  const existing = await getOrganizationByOwnerId(ownerId);
  if (existing) return existing;

  const name = displayName?.trim() || `Org-${ownerId}`;
  const [row] = await getDb()
    .insert(organizations)
    .values({ name, ownerId })
    .$returningId();

  // Link user → org
  await getDb()
    .update(users)
    .set({ organizationId: row.id })
    .where(eq(users.id, ownerId));

  // Fetch full org row (includes sector, size, etc.)
  const created = await getOrganizationByOwnerId(ownerId);
  if (!created) throw new Error(`[DB] getOrCreateOrgForOwner: org ${row.id} not found after insert`);
  return created;
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
  batchId?: string;
}

export async function createScan(data: CreateScanData) {
  const [row] = await getDb().insert(scans).values(data).$returningId();
  return { id: row.id, ...data };
}

export async function getScansByBatchId(orgId: number, batchId: string) {
  return getDb()
    .select()
    .from(scans)
    .where(and(eq(scans.organizationId, orgId), eq(scans.batchId, batchId)))
    .orderBy(asc(scans.createdAt));
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
  results?: Record<string, any>
) {
  return getDb()
    .update(scans)
    .set({
      status,
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(results ? { results: results as any } : {}),
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
  plan: "free" | "pro" | "mssp" | "enterprise";
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

/**
 * Returns the most recent completed scan for the given org+target within the
 * specified TTL window. Used by the scan router to short-circuit repeated scans.
 */
export async function getRecentCompletedScan(
  orgId: number,
  target: string,
  ttlHours = 24
) {
  const since = new Date(Date.now() - ttlHours * 3_600_000);
  const rows = await getDb()
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.organizationId, orgId),
        eq(scans.target, target),
        eq(scans.status, "completed"),
        gte(scans.completedAt, since)
      )
    )
    .orderBy(desc(scans.completedAt))
    .limit(1);
  return rows[0] ?? null;
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

/**
 * Returns the first existing remediation item for this org whose title starts
 * with `${cveId} —`. Used to avoid regenerating AI plans for known CVEs.
 */
export async function getRemediationItemByCvePrefix(orgId: number, cveId: string) {
  const rows = await getDb()
    .select()
    .from(remediationItems)
    .where(
      and(
        eq(remediationItems.organizationId, orgId),
        like(remediationItems.title, `${cveId} —%`)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Remediation library
// ---------------------------------------------------------------------------

import { questionnaireSessions, remediationItems, courseProgress, controlEvidence, remediationLibrary } from "../database/schema";

export async function getLibraryByCveId(cveId: string) {
  const rows = await getDb()
    .select()
    .from(remediationLibrary)
    .where(eq(remediationLibrary.cveId, cveId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertLibraryEntry(data: {
  cveId:         string;
  steps:         Array<{ order: number; instruction: string; platform: string }>;
  effort:        "low" | "medium" | "high";
  nis2Articles:  string[];
  promptVersion: number;
}) {
  await getDb()
    .insert(remediationLibrary)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        steps:         data.steps,
        effort:        data.effort,
        nis2Articles:  data.nis2Articles,
        promptVersion: data.promptVersion,
        updatedAt:     new Date(),
      },
    });
  const rows = await getDb()
    .select()
    .from(remediationLibrary)
    .where(eq(remediationLibrary.cveId, data.cveId))
    .limit(1);
  return rows[0]!;
}

// ---------------------------------------------------------------------------
// Course progress
// ---------------------------------------------------------------------------

export async function markLessonComplete(data: {
  userId: number;
  organizationId: number;
  moduleId: string;
  lessonId: string;
  certificateIssuedAt?: Date;
}) {
  const existing = await getDb()
    .select({ id: courseProgress.id })
    .from(courseProgress)
    .where(
      and(eq(courseProgress.userId, data.userId), eq(courseProgress.lessonId, data.lessonId))
    )
    .limit(1);

  if (existing.length === 0) {
    return getDb().insert(courseProgress).values({
      userId:              data.userId,
      organizationId:      data.organizationId,
      moduleId:            data.moduleId,
      lessonId:            data.lessonId,
      certificateIssuedAt: data.certificateIssuedAt,
    });
  }

  if (data.certificateIssuedAt) {
    return getDb()
      .update(courseProgress)
      .set({ certificateIssuedAt: data.certificateIssuedAt })
      .where(
        and(eq(courseProgress.userId, data.userId), eq(courseProgress.lessonId, data.lessonId))
      );
  }
}

export async function getLessonProgress(userId: number, organizationId: number) {
  return getDb()
    .select()
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.userId, userId),
        eq(courseProgress.organizationId, organizationId)
      )
    );
}

export async function getCertificateIssuedAt(userId: number): Promise<Date | null> {
  const rows = await getDb()
    .select({ certificateIssuedAt: courseProgress.certificateIssuedAt })
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.userId, userId),
        sql`${courseProgress.certificateIssuedAt} IS NOT NULL`
      )
    )
    .limit(1);
  return rows[0]?.certificateIssuedAt ?? null;
}

// ---------------------------------------------------------------------------
// Questionnaire sessions
// ---------------------------------------------------------------------------

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

export async function getLatestCompletedQuestionnaireForOrg(orgId: number) {
  const rows = await getDb()
    .select({
      id:           questionnaireSessions.id,
      articleScores: questionnaireSessions.articleScores,
      completedAt:  questionnaireSessions.completedAt,
    })
    .from(questionnaireSessions)
    .where(
      and(
        eq(questionnaireSessions.organizationId, orgId),
        eq(questionnaireSessions.status, "completed")
      )
    )
    .orderBy(desc(questionnaireSessions.completedAt))
    .limit(1);
  return rows[0] ?? null;
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
  dueDate?: string | Date | null;
}) {
  const [row] = await getDb().insert(remediationItems).values({
    ...data,
    dueDate: typeof data.dueDate === "string" ? new Date(data.dueDate) : data.dueDate,
  }).$returningId();
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

export async function getRemediationItemsWithScanInfo(
  orgId: number,
  opts?: {
    status?: "todo" | "in_progress" | "done" | "wont_fix";
    scanId?: number;
  }
) {
  return getDb()
    .select({
      id:                remediationItems.id,
      scanId:            remediationItems.scanId,
      title:             remediationItems.title,
      steps:             remediationItems.steps,
      effort:            remediationItems.effort,
      status:            remediationItems.status,
      nis2Articles:      remediationItems.nis2Articles,
      dueDate:           remediationItems.dueDate,
      target:            scans.target,
      mode:              scans.mode,
      cveId:             vulnerabilities.cveId,
      severity:          vulnerabilities.severity,
      cvssScore:         vulnerabilities.cvssScore,
      affectedComponent: vulnerabilities.affectedComponent,
    })
    .from(remediationItems)
    .leftJoin(scans, eq(remediationItems.scanId, scans.id))
    .leftJoin(vulnerabilities, eq(remediationItems.vulnId, vulnerabilities.id))
    .where(
      and(
        eq(remediationItems.organizationId, orgId),
        opts?.status   ? eq(remediationItems.status, opts.status)     : undefined,
        opts?.scanId != null ? eq(remediationItems.scanId, opts.scanId) : undefined,
      )
    )
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

// ---------------------------------------------------------------------------
// Account deletion (RGPD art. 17)
// ---------------------------------------------------------------------------

/**
 * Executes account deletion atomically inside a single transaction:
 *   1. Hard-deletes all org data in FK-safe order.
 *   2. Anonymises the user row (lápide com deletedAt).
 * Returns stripeSubId (if any) so the caller can cancel it outside the tx.
 */
export async function deleteAccount(userId: number): Promise<{ stripeSubId: string | null }> {
  return getDb().transaction(async (tx) => {
    // Read user inside the transaction (not through getUserById which uses getDb())
    const userRows = await tx.select().from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    const user = userRows[0];
    if (!user) throw new Error(`deleteAccount: user ${userId} not found or already deleted`);

    const orgId = user.organizationId;
    let stripeSubId: string | null = null;

    if (orgId) {
      // Capture stripeSubId before deleting subscriptions
      const subRows = await tx.select({ stripeSubId: subscriptions.stripeSubId })
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, orgId))
        .limit(1);
      stripeSubId = subRows[0]?.stripeSubId ?? null;

      // Hard-delete in FK-safe order (most-dependent first)
      await tx.delete(remediationItems).where(eq(remediationItems.organizationId, orgId));
      await tx.delete(vulnerabilities).where(eq(vulnerabilities.organizationId, orgId));
      await tx.delete(controlEvidence).where(eq(controlEvidence.organizationId, orgId));
      await tx.delete(subscriptions).where(eq(subscriptions.organizationId, orgId));
      await tx.delete(scans).where(eq(scans.organizationId, orgId));
      await tx.delete(questionnaireSessions).where(eq(questionnaireSessions.organizationId, orgId));
      await tx.delete(courseProgress).where(eq(courseProgress.organizationId, orgId));
      await tx.delete(organizations).where(eq(organizations.id, orgId));
    } else {
      // Edge case: user without org — delete by userId directly
      await tx.delete(questionnaireSessions).where(eq(questionnaireSessions.userId, userId));
      await tx.delete(courseProgress).where(eq(courseProgress.userId, userId));
    }

    // Anonymise user row (preserve id as FK anchor; PII cleared)
    await tx.update(users).set({
      email:               `deleted_${userId}@deleted`,
      name:                null,
      passwordHash:        null,
      resetTokenHash:      null,
      resetTokenExpiresAt: null,
      deletedAt:           new Date(),
      updatedAt:           new Date(),
    }).where(eq(users.id, userId));

    return { stripeSubId };
  });
}
