/**
 * backend/integrations/nvd.ts
 *
 * NVD API v2 wrapper — fetch CVE version ranges for accurate filtering.
 * Cache: Redis key nvd:cve:{cveId}, TTL 7 days.
 * Rate limit: global throttle (NVD_API_KEY presente → 45 req/30s; ausente → 5 req/30s).
 */

import { getRedisClient } from "../middlewares/rateLimit";
import { isVersionInNvdRanges, type NvdVersionRange } from "../utils/version-compare";

export { isVersionInNvdRanges };

const NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days
const MAX_CONCURRENT = 4;
const MAX_RETRIES = 3;

// ── Configuração (lida em runtime para testabilidade via process.env) ────────

function getNvdApiKey(): string { return process.env.NVD_API_KEY ?? ""; }

function getMinIntervalMs(): number {
  // NVD_MIN_INTERVAL_MS: override interno para testes (não documentado externamente)
  const override = parseInt(process.env.NVD_MIN_INTERVAL_MS ?? "", 10);
  if (!isNaN(override) && override >= 0) return override;
  // Sem key: conservador em 5/30s → espaçar 6 s; com key: 45/30s → espaçar ~0,67 s
  return getNvdApiKey() ? 667 : 6_000;
}

function getBatchTimeoutMs(): number {
  const override = parseInt(process.env.NVD_BATCH_TIMEOUT_MS ?? "", 10);
  return !isNaN(override) && override > 0 ? override : 5 * 60 * 1_000;
}

// ── Throttle global (cadeia de Promises serializada) ────────────────────────

let _rateLimiterChain = Promise.resolve();
let _lastRequestTime  = 0;
let _noKeyWarnEmitted = false;

async function acquireThrottle(): Promise<void> {
  if (!getNvdApiKey() && !_noKeyWarnEmitted) {
    _noKeyWarnEmitted = true;
    console.warn(
      "[NVD] sem API key — tier público (5 req/30s); scans com muitos CVEs podem " +
      "demorar vários minutos em background. Define NVD_API_KEY para 10× mais rápido."
    );
  }

  const minInterval = getMinIntervalMs();
  const next = _rateLimiterChain.then(async () => {
    const elapsed = Date.now() - _lastRequestTime;
    if (elapsed < minInterval) {
      await new Promise<void>((r) => setTimeout(r, minInterval - elapsed));
    }
    _lastRequestTime = Date.now();
  });
  // Garante que a cadeia não quebra se este slot falhar
  _rateLimiterChain = next.catch(() => {});
  return next;
}

/** @internal Repõe estado do throttle entre testes. */
export function _resetNvdRateLimiter(): void {
  _rateLimiterChain  = Promise.resolve();
  _lastRequestTime   = 0;
  _noKeyWarnEmitted  = false;
}

// 429, 502, 503 são erros transitórios — fazem retry com backoff.
// 400, 404, etc. são permanentes — retornam imediatamente com cache.
const RETRYABLE_STATUS = new Set([429, 502, 503]);

export interface NvdCveInfo {
  cveId: string;
  ranges: NvdVersionRange[];
  hasRangeData: boolean; // false = NVD returned no CPE config → conservative include
  affectedProducts: string[]; // "vendor:product" pairs from CPE criteria, e.g. ["apache:http_server"]
  cvssScore?: number; // CVSS v3.1 preferred > v3.0 > v2; absent = NVD not scored yet
  description?: string; // English description from NVD descriptions[]; absent when NVD omits it
  // true quando NVD não respondeu após todos os retries (429/rede).
  // Distinto de hasRangeData=false: aqui não temos dados por indisponibilidade, não por ausência real.
  // Nunca gravado no cache — o próximo scan tenta de novo.
  nvdUnavailable?: boolean;
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

    // Extract English description (NVD always provides "en"; skip others)
    const descItems: any[] = item.descriptions ?? [];
    const description = descItems.find((d: any) => d.lang === "en")?.value as string | undefined;

    return {
      cveId,
      ranges,
      hasRangeData: ranges.length > 0,
      affectedProducts: [...productSet],
      cvssScore,
      description,
    };
  } catch {
    return { cveId, ranges: [], hasRangeData: false, affectedProducts: [] };
  }
}

// ---------------------------------------------------------------------------
// Single CVE lookup (com retry para erros transitórios)
// ---------------------------------------------------------------------------

// Backoff exponencial com jitter: tentativa 1 → ~1 s, tentativa 2 → ~2 s.
function jitteredBackoffMs(attempt: number): number {
  return attempt * 1000 + Math.random() * 500;
}

export async function lookupCveVersionRanges(cveId: string): Promise<NvdCveInfo> {
  const cached = await getCached(cveId);
  if (cached) return cached;

  const url = `${NVD_BASE}?cveId=${encodeURIComponent(cveId)}`;

  await acquireThrottle(); // Throttle global: espaça pedidos conforme o tier de API

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const apiKey = getNvdApiKey();
      const res = await fetch(url, {
        headers: {
          "User-Agent": "NIS2-Scanner/1.0 (+https://nis2.pt)",
          ...(apiKey ? { apiKey } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const data = await res.json();
        const info = parseNvdResponse(data, cveId);
        await setCache(info);
        return info;
      }

      if (RETRYABLE_STATUS.has(res.status)) {
        console.warn(`[NVD] ${cveId} → HTTP ${res.status} (tentativa ${attempt + 1}/${MAX_RETRIES})`);
        if (attempt < MAX_RETRIES - 1) {
          // Respeita Retry-After se presente e razoável (< 2 min); caso contrário backoff próprio.
          const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "", 10);
          const delay = !isNaN(retryAfterSec) && retryAfterSec > 0 && retryAfterSec < 120
            ? retryAfterSec * 1000
            : jitteredBackoffMs(attempt + 1);
          await new Promise((r) => setTimeout(r, delay));
        }
        continue;
      }

      // Erro permanente (400, 404…) — gravar no cache para evitar repetição.
      console.warn(`[NVD] ${cveId} → HTTP ${res.status}`);
      const info: NvdCveInfo = { cveId, ranges: [], hasRangeData: false, affectedProducts: [] };
      await setCache(info);
      return info;

    } catch (err) {
      console.warn(`[NVD] ${cveId} fetch error (tentativa ${attempt + 1}/${MAX_RETRIES}):`, err instanceof Error ? err.message : err);
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, jitteredBackoffMs(attempt + 1)));
      }
    }
  }

  // Todos os retries esgotados — NVD indisponível. NÃO gravar no cache: o próximo scan tenta de novo.
  console.warn(`[NVD] ${cveId} → NVD indisponível após ${MAX_RETRIES} tentativas`);
  return { cveId, ranges: [], hasRangeData: false, affectedProducts: [], nvdUnavailable: true };
}

// ---------------------------------------------------------------------------
// Batch lookup — max MAX_CONCURRENT at a time
// ---------------------------------------------------------------------------

export async function batchLookupCveVersionRanges(
  cveIds: string[]
): Promise<Map<string, NvdCveInfo>> {
  const result      = new Map<string, NvdCveInfo>();
  const unique      = [...new Set(cveIds)];
  const timeoutMs   = getBatchTimeoutMs();
  const deadline    = Date.now() + timeoutMs;
  let timedOutCount = 0;

  for (let i = 0; i < unique.length; i += MAX_CONCURRENT) {
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      // Teto atingido: marcar CVEs restantes imediatamente sem chamar NVD
      for (const cveId of unique.slice(i)) {
        result.set(cveId, { cveId, ranges: [], hasRangeData: false, affectedProducts: [], nvdUnavailable: true });
        timedOutCount++;
      }
      break;
    }

    const chunk = unique.slice(i, i + MAX_CONCURRENT);
    const settled = await Promise.all(
      chunk.map((cveId) => {
        const timedOut: NvdCveInfo = { cveId, ranges: [], hasRangeData: false, affectedProducts: [], nvdUnavailable: true };
        let raceTimedOut = false;
        return Promise.race([
          lookupCveVersionRanges(cveId),
          new Promise<NvdCveInfo>((r) =>
            setTimeout(() => { raceTimedOut = true; r(timedOut); }, remaining)
          ),
        ]).then((info) => ({ info, raceTimedOut }));
      })
    );

    for (const { info, raceTimedOut } of settled) {
      result.set(info.cveId, info);
      if (raceTimedOut) timedOutCount++;
    }
  }

  if (timedOutCount > 0) {
    console.warn(
      `[NVD] teto de ${Math.round(timeoutMs / 1000)}s atingido — ` +
      `${timedOutCount}/${unique.length} CVEs marcados indeterminados por tempo esgotado`
    );
  }

  return result;
}
