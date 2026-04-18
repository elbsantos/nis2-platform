/**
 * server/integrations/censys.ts
 *
 * Censys focuses on TLS certificates and service fingerprinting.
 * Complements Shodan by surfacing certificate issues (expired certs,
 * weak ciphers, self-signed) that map directly to NIS2 Art. 21(2)(h).
 *
 * Uses the Censys Search v2 API.
 * Free tier: 250 queries/month — sufficient for MVP.
 */

import { getRedisClient } from "../middlewares/rateLimit";

const CENSYS_API_ID = process.env.CENSYS_API_ID ?? "";
const CENSYS_API_SECRET = process.env.CENSYS_API_SECRET ?? "";
const CENSYS_BASE = "https://search.censys.io/api/v2";
const CACHE_TTL_SECONDS = 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CensysService {
  port: number;
  transport_protocol: "TCP" | "UDP";
  service_name: string;
  tls?: {
    certificate?: {
      parsed?: {
        subject?: { common_name?: string };
        issuer?: { common_name?: string };
        validity?: { start: string; end: string };
        subject_key_info?: { key_algorithm?: { name: string } };
      };
      is_expired?: boolean;
      is_self_signed?: boolean;
    };
    cipher_selected?: string;
    version_selected?: string;
  };
}

export interface CensysHostResult {
  ip: string;
  services: CensysService[];
  tlsIssues: TlsIssue[];
}

export interface TlsIssue {
  port: number;
  issue: string;
  nis2Article: "Art. 21(2)(h)";
  severity: "critical" | "high" | "medium";
}

// ---------------------------------------------------------------------------
// Auth header
// ---------------------------------------------------------------------------

function authHeader(): string {
  const encoded = Buffer.from(`${CENSYS_API_ID}:${CENSYS_API_SECRET}`).toString(
    "base64"
  );
  return `Basic ${encoded}`;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

async function getCached(key: string): Promise<CensysHostResult | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as CensysHostResult) : null;
  } catch {
    return null;
  }
}

async function setCache(key: string, value: CensysHostResult): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(value));
  } catch {}
}

// ---------------------------------------------------------------------------
// TLS issue analyser
// ---------------------------------------------------------------------------

function analyseTlsIssues(services: CensysService[]): TlsIssue[] {
  const issues: TlsIssue[] = [];

  for (const svc of services) {
    if (!svc.tls) continue;

    const cert = svc.tls.certificate?.parsed;
    const isExpired = svc.tls.certificate?.is_expired;
    const isSelfSigned = svc.tls.certificate?.is_self_signed;
    const cipher = svc.tls.cipher_selected ?? "";
    const tlsVersion = svc.tls.version_selected ?? "";

    if (isExpired) {
      issues.push({
        port: svc.port,
        issue: `Certificado TLS expirado no porto ${svc.port}`,
        nis2Article: "Art. 21(2)(h)",
        severity: "critical",
      });
    }

    if (isSelfSigned) {
      issues.push({
        port: svc.port,
        issue: `Certificado auto-assinado no porto ${svc.port} — não é de confiança para clientes`,
        nis2Article: "Art. 21(2)(h)",
        severity: "high",
      });
    }

    if (/RC4|DES|3DES|EXPORT|NULL|anon/i.test(cipher)) {
      issues.push({
        port: svc.port,
        issue: `Cifra fraca "${cipher}" activa no porto ${svc.port}`,
        nis2Article: "Art. 21(2)(h)",
        severity: "high",
      });
    }

    if (/TLSv1\.0|TLSv1\.1|SSLv2|SSLv3/.test(tlsVersion)) {
      issues.push({
        port: svc.port,
        issue: `Protocolo obsoleto "${tlsVersion}" no porto ${svc.port} — vulnerável a ataques BEAST/POODLE`,
        nis2Article: "Art. 21(2)(h)",
        severity: "high",
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function lookupHost(
  target: string
): Promise<CensysHostResult | null> {
  if (!CENSYS_API_ID || !CENSYS_API_SECRET) {
    console.warn("[Censys] No credentials — skipping Censys lookup");
    return null;
  }

  const cacheKey = `censys:${target}`;

  try {
    const cached = await getCached(cacheKey);
    if (cached) {
      console.log(`[Censys] Cache hit for ${target}`);
      return cached;
    }

    const url = `${CENSYS_BASE}/hosts/${encodeURIComponent(target)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (res.status === 404) {
      return { ip: target, services: [], tlsIssues: [] };
    }

    if (!res.ok) throw new Error(`Censys ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const services: CensysService[] = data.result?.services ?? [];
    const tlsIssues = analyseTlsIssues(services);

    const result: CensysHostResult = {
      ip: data.result?.ip ?? target,
      services,
      tlsIssues,
    };

    await setCache(cacheKey, result);
    console.log(
      `[Censys] ${target} — ${services.length} services, ${tlsIssues.length} TLS issues`
    );
    return result;
  } catch (err) {
    console.error("[Censys] Lookup failed:", err);
    return null;
  }
}
