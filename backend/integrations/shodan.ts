/**
 * server/integrations/shodan.ts
 *
 * Thin wrapper around the Shodan InternetDB (free, no key) and
 * Shodan API (paid, for CVE details and service versions).
 *
 * Cost strategy:
 *  - InternetDB is always the default (free, no API key)
 *  - Paid API requires SHODAN_API_KEY + SHODAN_USE_PAID=true (explicit opt-in)
 *  - Cache results in Redis for 24h to minimise API calls + cost
 */

import { getRedisClient } from "../middlewares/rateLimit";

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const SHODAN_API_KEY  = process.env.SHODAN_API_KEY ?? "";
// Paid API is opt-in: set SHODAN_USE_PAID=true to use the richer paid endpoint.
// Default: InternetDB (free) — avoids spending Shodan API credits unintentionally.
const SHODAN_USE_PAID = process.env.SHODAN_USE_PAID === "true";
const INTERNETDB_URL  = "https://internetdb.shodan.io";
const SHODAN_API_URL  = "https://api.shodan.io";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShodanPort {
  port: number;
  transport: "tcp" | "udp";
  product?: string;
  version?: string;
  _shodan?: { module: string };
  vulns?: Record<
    string,
    { cvss: number; summary: string; references: string[] }
  >;
}

export interface ShodanHostResult {
  ip: string;
  hostnames: string[];
  tags: string[];
  ports: ShodanPort[];
  cpes: string[];
  vulns: string[]; // CVE IDs from InternetDB
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

async function getCached(key: string): Promise<ShodanHostResult | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as ShodanHostResult) : null;
  } catch {
    return null; // Redis down — proceed without cache
  }
}

async function setCache(key: string, value: ShodanHostResult): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(value));
  } catch {
    // Non-fatal — scan still works without cache
  }
}

// ---------------------------------------------------------------------------
// Resolve domain → IP
// ---------------------------------------------------------------------------

async function resolveToIp(target: string): Promise<string> {
  // If already an IP, return as-is
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(target)) return target;

  const { resolve4 } = await import("dns/promises");
  const [ip] = await resolve4(target);
  return ip;
}

// ---------------------------------------------------------------------------
// InternetDB lookup (free, no API key)
// Returns basic port + CVE list
// ---------------------------------------------------------------------------

async function internetDbLookup(ip: string): Promise<ShodanHostResult> {
  const res = await fetch(`${INTERNETDB_URL}/${ip}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 404) {
    // Host not in Shodan — return empty result (not an error)
    return { ip, hostnames: [], tags: [], ports: [], cpes: [], vulns: [] };
  }

  if (!res.ok) throw new Error(`Shodan InternetDB ${res.status}: ${await res.text()}`);

  const data = await res.json() as any;

  return {
    ip,
    hostnames: data.hostnames ?? [],
    tags: data.tags ?? [],
    cpes: data.cpes ?? [],
    vulns: data.vulns ?? [],
    ports: (data.ports ?? []).map((port: number) => ({
      port,
      transport: "tcp" as const,
    })),
  };
}

// ---------------------------------------------------------------------------
// Full API lookup (paid, richer data)
// ---------------------------------------------------------------------------

async function apiLookup(ip: string): Promise<ShodanHostResult> {
  const url = `${SHODAN_API_URL}/shodan/host/${ip}?key=${SHODAN_API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });

  if (res.status === 404) {
    return { ip, hostnames: [], tags: [], ports: [], cpes: [], vulns: [] };
  }

  // 401/403 = key exists but no paid membership — silently fall back to InternetDB
  if (res.status === 401 || res.status === 403) {
    console.warn(`[Shodan] API key sem membership (${res.status}) — usando InternetDB gratuito`);
    return internetDbLookup(ip);
  }

  if (!res.ok) throw new Error(`Shodan API ${res.status}: ${await res.text()}`);

  const data = await res.json() as any;

  const ports: ShodanPort[] = (data.data ?? []).map((svc: any) => ({
    port: svc.port,
    transport: svc.transport ?? "tcp",
    product: svc.product,
    version: svc.version,
    _shodan: svc._shodan,
    vulns: svc.vulns,
  }));

  return {
    ip,
    hostnames: data.hostnames ?? [],
    tags: data.tags ?? [],
    cpes: data.cpes ?? [],
    vulns: Object.keys(data.vulns ?? {}),
    ports,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function lookupHost(
  target: string
): Promise<ShodanHostResult | null> {
  try {
    const ip = await resolveToIp(target);
    const cacheKey = `shodan:${ip}`;

    const cached = await getCached(cacheKey);
    if (cached) {
      console.log(`[Shodan] Cache hit for ${ip}`);
      return cached;
    }

    // InternetDB first (free); paid API only when explicitly opted in
    const result = (SHODAN_API_KEY && SHODAN_USE_PAID)
      ? await apiLookup(ip)
      : await internetDbLookup(ip);

    await setCache(cacheKey, result);
    console.log(
      `[Shodan] ${ip} — ${result.ports.length} ports, ${result.vulns.length} CVEs`
    );
    return result;
  } catch (err) {
    console.error("[Shodan] Lookup failed:", err);
    return null; // Graceful degradation — scan continues with Censys data only
  }
}

export function invalidateCache(target: string): Promise<void> {
  return resolveToIp(target)
    .then((ip) =>
      getRedisClient().then((redis) => redis.del(`shodan:${ip}`)).then(() => {})
    )
    .catch(() => {});
}
