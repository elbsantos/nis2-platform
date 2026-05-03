/**
 * server/db-scans.ts
 *
 * Database helpers for scans table.
 * Merge these into server/db.ts
 */

import { db } from "./db";
import { scans, vulnerabilities } from "../database/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";

export interface CreateScanData {
  organizationId: number;
  target: string;
  mode: "sme" | "supply";
  status: "pending" | "running" | "completed" | "failed";
}

export async function createScan(data: CreateScanData) {
  const [scan] = await db
    .insert(scans)
    .values({
      organizationId: data.organizationId,
      target: data.target,
      mode: data.mode,
      status: data.status,
    })
    .$returningId();

  return { id: scan.id, ...data };
}

export async function getScanById(scanId: number) {
  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
  return scan ?? null;
}

export async function getScansByOrgId(orgId: number, limit = 10, offset = 0) {
  return db
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
  return db
    .update(scans)
    .set({
      status,
      startedAt,
      completedAt,
      results: results as any,
      updatedAt: new Date(),
    })
    .where(eq(scans.id, scanId));
}

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
  return db.insert(vulnerabilities).values({
    scanId: data.scanId,
    organizationId: data.organizationId,
    cveId: data.cveId,
    severity: data.severity,
    cvssScore: String(data.cvssScore),
    description: data.description,
    affectedComponent: data.affectedComponent,
    port: data.port,
    remediation: data.remediation,
  });
}

export async function getOrgScanStats(orgId: number) {
  const [totalScans] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(scans)
    .where(eq(scans.organizationId, orgId));

  const [criticalVulns] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(vulnerabilities)
    .where(
      and(
        eq(vulnerabilities.organizationId, orgId),
        eq(vulnerabilities.severity, "critical")
      )
    );

  const lastScan = await db
    .select()
    .from(scans)
    .where(eq(scans.organizationId, orgId))
    .orderBy(desc(scans.createdAt))
    .limit(1);

  return {
    totalScans: Number(totalScans.count ?? 0),
    criticalVulnerabilities: Number(criticalVulns.count ?? 0),
    lastScanDate: lastScan[0]?.createdAt ?? null,
  };
}
