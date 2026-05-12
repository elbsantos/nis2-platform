/**
 * backend/integrations/direct-tls.ts
 *
 * Direct TLS certificate inspection and port reachability check.
 * Works even when the server is behind Cloudflare/CDN/Railway proxy.
 * Uses Node.js built-in tls and net modules — no external API needed.
 *
 * This complements Shodan/Censys: they see the CDN IP, we see the
 * actual certificate and protocol negotiated with the domain.
 */

import tls from "tls";
import net from "net";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DirectTlsCertificate {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  daysUntilExpiry: number;
  isExpired: boolean;
  isSelfSigned: boolean;
  isWildcard: boolean;
  tlsVersion: string;
  cipher: string;
  sans: string[];
}

export interface DirectTlsIssue {
  issue: string;
  severity: "critical" | "high" | "medium";
  nis2Article: "Art. 21(2)(h)";
}

export interface DirectPortResult {
  port: number;
  open: boolean;
  service: string;
}

export interface CdnInfo {
  detected: boolean;
  provider: string | null;
  isProtected: boolean;
}

export interface DirectTlsResult {
  accessible: boolean;
  certificate: DirectTlsCertificate | null;
  tlsIssues: DirectTlsIssue[];
  ports: DirectPortResult[];
  cdn: CdnInfo;
}

// ---------------------------------------------------------------------------
// Port check via TCP
// ---------------------------------------------------------------------------

function checkPortOpen(host: string, port: number, timeoutMs = 5_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.connect(port, host, () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
}

// ---------------------------------------------------------------------------
// CDN detection via HTTP response headers
// ---------------------------------------------------------------------------

export async function detectCdn(domain: string): Promise<CdnInfo> {
  try {
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(8_000),
      redirect: "follow",
    });

    const h = (name: string) => res.headers.get(name) ?? "";

    if (h("cf-ray") || h("cf-cache-status") || h("server").toLowerCase().includes("cloudflare")) {
      return { detected: true, provider: "Cloudflare", isProtected: true };
    }
    if (h("x-fastly-request-id")) {
      return { detected: true, provider: "Fastly", isProtected: true };
    }
    if (h("x-akamai-transformed") || h("akamai-cache-status")) {
      return { detected: true, provider: "Akamai", isProtected: true };
    }
    if (h("x-amz-cf-id")) {
      return { detected: true, provider: "AWS CloudFront", isProtected: true };
    }
    if (h("x-cache").includes("HIT") || h("via").includes("proxy")) {
      return { detected: true, provider: "CDN/Proxy", isProtected: true };
    }

    return { detected: false, provider: null, isProtected: false };
  } catch {
    return { detected: false, provider: null, isProtected: false };
  }
}

// ---------------------------------------------------------------------------
// TLS handshake — extract certificate + protocol info
// ---------------------------------------------------------------------------

function tlsHandshake(domain: string): Promise<DirectTlsResult> {
  return new Promise((resolve) => {
    const result: DirectTlsResult = {
      accessible: false,
      certificate: null,
      tlsIssues: [],
      ports: [],
      cdn: { detected: false, provider: null, isProtected: false },
    };

    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        timeout: 10_000,
        rejectUnauthorized: false, // We validate manually below
      },
      () => {
        result.accessible = true;

        const rawCert = socket.getPeerCertificate(true);
        const protocol = socket.getProtocol() ?? "";
        const cipherInfo = socket.getCipher();

        const now = new Date();
        const validFrom = rawCert.valid_from ? new Date(rawCert.valid_from) : new Date(0);
        const validTo   = rawCert.valid_to   ? new Date(rawCert.valid_to)   : new Date(0);
        const daysUntilExpiry = Math.floor(
          (validTo.getTime() - now.getTime()) / (1_000 * 60 * 60 * 24)
        );

        const asStr = (v: string | string[] | undefined): string =>
          Array.isArray(v) ? v[0] ?? "" : v ?? "";

        const subjectCN = asStr(rawCert.subject?.CN);
        const issuerCN  = asStr(rawCert.issuer?.CN) || asStr(rawCert.issuer?.O);
        const isSelfSigned = subjectCN !== "" && subjectCN === issuerCN;
        const isWildcard   = subjectCN.startsWith("*.");

        const sans: string[] = [];
        if (rawCert.subjectaltname) {
          for (const entry of rawCert.subjectaltname.split(",")) {
            const trimmed = entry.trim().replace(/^DNS:/, "");
            if (trimmed) sans.push(trimmed);
          }
        }

        result.certificate = {
          subject: subjectCN as string,
          issuer: issuerCN as string,
          validFrom,
          validTo,
          daysUntilExpiry,
          isExpired: daysUntilExpiry < 0,
          isSelfSigned,
          isWildcard,
          tlsVersion: protocol,
          cipher: cipherInfo?.name ?? "",
          sans,
        };

        // ── Issue detection ──────────────────────────────────────────────────
        if (daysUntilExpiry < 0) {
          result.tlsIssues.push({
            issue: `Certificado TLS expirado há ${Math.abs(daysUntilExpiry)} dias (${validTo.toLocaleDateString("pt-PT")})`,
            severity: "critical",
            nis2Article: "Art. 21(2)(h)",
          });
        } else if (daysUntilExpiry < 7) {
          result.tlsIssues.push({
            issue: `Certificado TLS expira em ${daysUntilExpiry} dias — renovação urgente`,
            severity: "critical",
            nis2Article: "Art. 21(2)(h)",
          });
        } else if (daysUntilExpiry < 30) {
          result.tlsIssues.push({
            issue: `Certificado TLS expira em ${daysUntilExpiry} dias (${validTo.toLocaleDateString("pt-PT")})`,
            severity: "high",
            nis2Article: "Art. 21(2)(h)",
          });
        }

        if (isSelfSigned) {
          result.tlsIssues.push({
            issue: "Certificado TLS auto-assinado — browsers e clientes não confiam automaticamente",
            severity: "high",
            nis2Article: "Art. 21(2)(h)",
          });
        }

        if (/TLSv1\.0|TLSv1\.1|SSLv2|SSLv3/.test(protocol)) {
          result.tlsIssues.push({
            issue: `Protocolo TLS obsoleto "${protocol}" — vulnerável a BEAST/POODLE/DROWN`,
            severity: "high",
            nis2Article: "Art. 21(2)(h)",
          });
        }

        const cipherName = cipherInfo?.name ?? "";
        if (/RC4|DES|3DES|EXPORT|NULL|anon/i.test(cipherName)) {
          result.tlsIssues.push({
            issue: `Cifra fraca "${cipherName}" — dados em trânsito podem ser decifrados`,
            severity: "high",
            nis2Article: "Art. 21(2)(h)",
          });
        }

        socket.end();
        resolve(result);
      }
    );

    socket.on("error", () => resolve(result));
    socket.on("timeout", () => { socket.destroy(); resolve(result); });
  });
}

// ---------------------------------------------------------------------------
// Public API — full direct check
// ---------------------------------------------------------------------------

export async function checkDirectTls(domain: string): Promise<DirectTlsResult> {
  const [port80Open, port443Open, cdnInfo] = await Promise.all([
    checkPortOpen(domain, 80),
    checkPortOpen(domain, 443),
    detectCdn(domain),
  ]);

  const portResults: DirectPortResult[] = [
    { port: 80,  open: port80Open,  service: "HTTP" },
    { port: 443, open: port443Open, service: "HTTPS" },
  ];

  if (!port443Open) {
    return {
      accessible: false,
      certificate: null,
      tlsIssues: [
        {
          issue: "Porto 443 (HTTPS) não acessível — sem encriptação TLS",
          severity: "critical",
          nis2Article: "Art. 21(2)(h)",
        },
      ],
      ports: portResults,
      cdn: cdnInfo,
    };
  }

  const tlsResult = await tlsHandshake(domain);
  tlsResult.ports = portResults;
  tlsResult.cdn = cdnInfo;

  // HTTPS only without redirect warning
  if (port80Open && port443Open && tlsResult.accessible) {
    // We trust HSTS check covers redirect — no extra deduction here
  }

  return tlsResult;
}
