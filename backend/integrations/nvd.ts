/**
 * backend/integrations/nvd.ts
 *
 * NVD API v2 wrapper — fetch CVE version ranges for accurate filtering.
 * Cache: Redis key nvd:cve:{cveId}, TTL 7 days.
 * Rate limit: max 4 concurrent fetches (NVD public rate limit).
 */

import { getRedisClient } from "../middlewares/rateLimit";
import { isVersionInNvdRanges, type NvdVersionRange } from "../utils/version-compare";

export { isVersionInNvdRanges };

const NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days
const MAX_CONCURRENT = 4;

export interface NvdCveInfo {
  cveId: string;
  ranges: NvdVersionRange[];
  hasRangeData: boolean; // false = NVD returned no CPE config → conservative include
  affectedProducts: string[]; // "vendor:product" pairs from CPE criteria, e.g. ["apache:http_server"]
  cvssScore?: number; // CVSS v3.1 preferred > v3.0 > v2; absent = NVD not scored yet
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

async function getCached(cveId: string): Promise<NvdCveInfo | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(`nvd:cve:${cveId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NvdCveInfo;
    // Backwards-compatible: old cached entries may lack affectedProducts
    if (!parsed.affectedProducts) parsed.affectedProducts = [];
    return parsed;
  } catch {
    return null;
  }
}

async function setCache(info: NvdCveInfo): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.setEx(`nvd:cve:${info.cveId}`, CACHE_TTL, JSON.stringify(info));
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// CPE parsing — handles NVD 2.3 format:
// cpe:2.3:a:apache:http_server:2.4.7:*:*:*:*:*:*:*
//                   ^^^^^^      ^^^^^^^^^^^  = vendor:product
// ---------------------------------------------------------------------------

function extractVersionFromCpe(criteria: string): string | null {
  const parts = criteria.split(":");
  const version = parts[5]; // cpe, 2.3, type, vendor, product, VERSION
  if (!version || version === "*" || version === "-") return null;
  return version;
}

function extractVendorProductFromCpe(criteria: string): string | null {
  const parts = criteria.split(":");
  // cpe:2.3:type:vendor:product:... → indices 3 and 4
  const vendor = parts[3];
  const product = parts[4];
  if (!vendor || !product || vendor === "*" || product === "*") return null;
  return `${vendor}:${product}`;
}

// ---------------------------------------------------------------------------
// Parse NVD API response → version ranges + affected products
// ---------------------------------------------------------------------------

function parseNvdResponse(data: unknown, cveId: string): NvdCveInfo {
  try {
    const root = data as any;
    const item = root?.vulnerabilities?.[0]?.cve;
    if (!item) return { cveId, ranges: [], hasRangeData: false, affectedProducts: [] };

    const ranges: NvdVersionRange[] = [];
    const productSet = new Set<string>();

    const configurations: any[] = item.configurations ?? [];
    for (const config of configurations) {
      const nodes: any[] = config.nodes ?? [];
      for (const node of nodes) {
        const cpeMatches: any[] = node.cpeMatch ?? [];
        for (const match of cpeMatches) {
          if (!match.vulnerable) continue;

          const vp = extractVendorProductFromCpe(match.criteria ?? "");
          if (vp) productSet.add(vp);

          const hasExplicitRange =
            match.versionStartIncluding ||
            match.versionStartExcluding ||
            match.versionEndIncluding ||
            match.versionEndExcluding;

          if (hasExplicitRange) {
            ranges.push({
              versionStartIncluding: match.versionStartIncluding,
              versionStartExcluding: match.versionStartExcluding,
              versionEndIncluding:   match.versionEndIncluding,
              versionEndExcluding:   match.versionEndExcluding,
            });
          } else {
            // Specific version CPE — treat as exact-match range
            const v = extractVersionFromCpe(match.criteria ?? "");
            if (v) {
              ranges.push({
                versionStartIncluding: v,
                versionEndIncluding:   v,
              });
            }
          }
        }
      }
    }

    // Extract CVSS score: v3.1 preferred > v3.0 > v2 (all from primary source)
    const metrics = item.metrics ?? {};
    const cvssScore: number | undefined =
      metrics.cvssMetricV31?.[0]?.cvssData?.baseScore ??
      metrics.cvssMetricV30?.[0]?.cvssData?.baseScore ??
      metrics.cvssMetricV2?.[0]?.cvssData?.baseScore;

    return {
      cveId,
      ranges,
      hasRangeData: ranges.length > 0,
      affectedProducts: [...productSet],
      cvssScore,
    };
  } catch {
    return { cveId, ranges: [], hasRangeData: false, affectedProducts: [] };
  }
}

// ---------------------------------------------------------------------------
// Single CVE lookup
// ---------------------------------------------------------------------------

export async function lookupCveVersionRanges(cveId: string): Promise<NvdCveInfo> {
  const cached = await getCached(cveId);
  if (cached) return cached;

  try {
    const url = `${NVD_BASE}?cveId=${encodeURIComponent(cveId)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "NIS2-Scanner/1.0 (+https://nis2.pt)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[NVD] ${cveId} → HTTP ${res.status}`);
      const info: NvdCveInfo = { cveId, ranges: [], hasRangeData: false, affectedProducts: [] };
      await setCache(info);
      return info;
    }

    const data = await res.json();
    const info = parseNvdResponse(data, cveId);
    await setCache(info);
    return info;
  } catch (err) {
    console.warn(`[NVD] ${cveId} fetch error:`, err instanceof Error ? err.message : err);
    return { cveId, ranges: [], hasRangeData: false, affectedProducts: [] };
  }
}

// ---------------------------------------------------------------------------
// Batch lookup — max MAX_CONCURRENT at a time
// ---------------------------------------------------------------------------

export async function batchLookupCveVersionRanges(
  cveIds: string[]
): Promise<Map<string, NvdCveInfo>> {
  const result = new Map<string, NvdCveInfo>();
  const unique = [...new Set(cveIds)];

  for (let i = 0; i < unique.length; i += MAX_CONCURRENT) {
    const chunk = unique.slice(i, i + MAX_CONCURRENT);
    const infos = await Promise.all(chunk.map(lookupCveVersionRanges));
    for (const info of infos) result.set(info.cveId, info);
  }

  return result;
}
