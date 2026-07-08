export type CvssSeverity = "critical" | "high" | "medium" | "low";

// Canonical CVSS v3 severity thresholds.
// Single source of truth — all severity labels derive from cvssScore via this function.
export function cvssToSeverity(score: number): CvssSeverity {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  return "low";
}
