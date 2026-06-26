/**
 * backend/utils/version-compare.ts
 *
 * Semver-style version parsing and NVD range matching.
 * Supports strings like "2.4.7", "1.14.0", "6.6.1p1", "9.8p1".
 */

export interface NvdVersionRange {
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?:   string;
  versionEndExcluding?:   string;
}

type SemVer = [number, number, number];

/** Extract [major, minor, patch] from version strings. Returns null if unparseable. */
export function parseVersion(raw: string): SemVer | null {
  const m = raw.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3] ?? "0")];
}

function cmp(a: SemVer, b: SemVer): -1 | 0 | 1 {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return  1;
  }
  return 0;
}

/**
 * Returns true if `version` falls in ANY of the given NVD ranges.
 * Conservative: returns true when version is unparseable or ranges is empty
 * (include the CVE rather than silently discard it).
 */
export function isVersionInNvdRanges(version: string, ranges: NvdVersionRange[]): boolean {
  const parsed = parseVersion(version);
  if (!parsed || ranges.length === 0) return true; // conservative include

  return ranges.some((range) => {
    let inRange = true;

    if (range.versionStartIncluding) {
      const start = parseVersion(range.versionStartIncluding);
      if (start && cmp(parsed, start) < 0) inRange = false;
    }
    if (range.versionStartExcluding) {
      const start = parseVersion(range.versionStartExcluding);
      if (start && cmp(parsed, start) <= 0) inRange = false;
    }
    if (range.versionEndExcluding) {
      const end = parseVersion(range.versionEndExcluding);
      if (end && cmp(parsed, end) >= 0) inRange = false;
    }
    if (range.versionEndIncluding) {
      const end = parseVersion(range.versionEndIncluding);
      if (end && cmp(parsed, end) > 0) inRange = false;
    }

    return inRange;
  });
}
