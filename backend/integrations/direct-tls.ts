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
  cvssScore: number;
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
// Common ports to scan on every target
// ---------------------------------------------------------------------------

const COMMON_PORTS: Array<{ port: number; service: string }> = [
  { port: 21,    service: "FTP" },
  { port: 22,    service: "SSH" },
  { port: 23,    service: "Telnet" },
  { port: 25,    service: "SMTP" },
  { port: 53,    service: "DNS" },
  { port: 80,    service: "HTTP" },
  { port: 110,   service: "POP3" },
  { port: 143,   service: "IMAP" },
  { port: 443,   service: "HTTPS" },
  { port: 445,   service: "SMB" },
  { port: 587,   service: "SMTP/TLS" },
  { port: 993,   service: "IMAPS" },
  { port: 995,   service: "POP3S" },
  { port: 1433,  service: "MSSQL" },
  { port: 3306,  service: "MySQL" },
  { port: 3389,  service: "RDP" },
  { port: 5432,  service: "PostgreSQL" },
  { port: 5900,  service: "VNC" },
  { port: 6379,  service: "Redis" },
  { port: 8080,  service: "HTTP-Alt" },
  { port: 8443,  service: "HTTPS-Alt" },
  { port: 9929,  service: "nping-echo" },
  { port: 27017, service: "MongoDB" },
];

// ---------------------------------------------------------------------------
// Port check via TCP
// ---------------------------------------------------------------------------

function checkPortOpen(host: string, port: number, timeoutMs = 3_000): Promise<boolean> {
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
            cvssScore: 8.0,
            severity: "critical",
            nis2Article: "Art. 21(2)(h)",
          });
        } else if (daysUntilExpiry < 7) {
          result.tlsIssues.push({
            issue: `Certificado TLS expira em ${daysUntilExpiry} dias — renovação urgente`,
            cvssScore: 8.0,
            severity: "critical",
            nis2Article: "Art. 21(2)(h)",
          });
        } else if (daysUntilExpiry < 30) {
          result.tlsIssues.push({
            issue: `Certificado TLS expira em ${daysUntilExpiry} dias (${validTo.toLocaleDateString("pt-PT")})`,
            cvssScore: 6.5,
            severity: "high",
            nis2Article: "Art. 21(2)(h)",
          });
        }

        if (isSelfSigned) {
          result.tlsIssues.push({
            issue: "Certificado TLS auto-assinado — browsers e clientes não confiam automaticamente",
            cvssScore: 7.4,
            severity: "high",
            nis2Article: "Art. 21(2)(h)",
          });
        }

        if (/TLSv1\.0|TLSv1\.1|SSLv2|SSLv3/.test(protocol)) {
          result.tlsIssues.push({
            issue: `Protocolo TLS obsoleto "${protocol}" — vulnerável a BEAST/POODLE/DROWN`,
            cvssScore: 7.4,
            severity: "high",
            nis2Article: "Art. 21(2)(h)",
          });
        }

        const cipherName = cipherInfo?.name ?? "";
        if (/RC4|DES|3DES|EXPORT|NULL|anon/i.test(cipherName)) {
          result.tlsIssues.push({
            issue: `Cifra fraca "${cipherName}" — dados em trânsito podem ser decifrados`,
            cvssScore: 7.5,
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
// Legacy TLS protocol probe — separate connection offering TLSv1.0/1.1 only.
// Node.js 18+ refuses to negotiate below TLS 1.2 in the main handshake, so
// PROTOCOL-OBSOLETE can only be detected via a dedicated probe that explicitly
// caps maxVersion at TLSv1.1.
// ---------------------------------------------------------------------------

type LegacyProbeResult =
  | { status: "vulnerable"; protocol: string }  // server accepted TLS 1.0/1.1 → finding
  | { status: "clean" }                          // server refused legacy via TLS alert → no finding
  | { status: "inconclusive"; reason: string };  // timeout / network error → log, no finding

function checkLegacyProtocol(domain: string, timeoutMs = 5_000): Promise<LegacyProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: LegacyProbeResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const s = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        minVersion: "TLSv1"   as tls.SecureVersion,
        maxVersion: "TLSv1.1" as tls.SecureVersion,
        ciphers: "DEFAULT:@SECLEVEL=0",
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        // Handshake succeeded — server accepted TLS 1.0/1.1.
        const proto = s.getProtocol() ?? "";
        s.destroy();
        console.log(`[sonda legada TLS] ${domain}: vulnerable — ${proto}`);
        settle({ status: "vulnerable", protocol: proto });
      }
    );

    s.on("timeout", () => {
      s.destroy();
      settle({ status: "inconclusive", reason: `Timeout (${timeoutMs / 1000} s)` });
    });

    s.on("error", (err) => {
      s.destroy();
      const msg = (err as Error).message ?? "";
      // TLS alerts that unambiguously mean "server refused our protocol offer":
      //   alert 70 (protocol_version) — RFC 5246 §7.2: version not supported
      //   alert 40 (handshake_failure) — no common protocol/cipher found
      // "no protocols available" / "unsupported protocol" are EXCLUDED because they
      // can originate from the client (local OpenSSL policy) before the server even
      // responds — marking them "clean" would be a false negative.
      // Everything else (ECONNRESET, ETIMEDOUT, ECONNREFUSED, client-side SSL errors)
      // is inconclusive: could be network, firewall, or local TLS stack limitation.
      if (/alert protocol version|alert number 70|alert handshake failure|alert number 40/i.test(msg)) {
        settle({ status: "clean" });
      } else {
        settle({ status: "inconclusive", reason: msg.slice(0, 120) });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API — full direct check
// ---------------------------------------------------------------------------

export async function checkDirectTls(domain: string): Promise<DirectTlsResult> {
  // Scan all common ports + CDN detection in parallel
  const [portResults, cdnInfo] = await Promise.all([
    Promise.all(
      COMMON_PORTS.map(({ port, service }) =>
        checkPortOpen(domain, port).then((open): DirectPortResult => ({ port, open, service }))
      )
    ),
    detectCdn(domain),
  ]);

  const openPorts = portResults.filter((p) => p.open);
  const port443Open = portResults.find((p) => p.port === 443)?.open ?? false;

  if (!port443Open) {
    return {
      accessible: false,
      certificate: null,
      tlsIssues: [
        {
          issue: "Porto 443 (HTTPS) não acessível — sem encriptação TLS",
          cvssScore: 8.0,
          severity: "critical",
          nis2Article: "Art. 21(2)(h)",
        },
      ],
      ports: openPorts,
      cdn: cdnInfo,
    };
  }

  // Run main TLS handshake and legacy protocol probe in parallel (both need port 443 open).
  const [tlsResult, legacyResult] = await Promise.all([
    tlsHandshake(domain),
    checkLegacyProtocol(domain),
  ]);

  if (legacyResult.status === "vulnerable") {
    tlsResult.tlsIssues.push({
      issue: `Protocolo TLS obsoleto "${legacyResult.protocol}" aceite pelo servidor — vulnerável a BEAST/POODLE/DROWN`,
      cvssScore: 7.4,
      severity: "high",
      nis2Article: "Art. 21(2)(h)",
    });
  } else if (legacyResult.status === "inconclusive") {
    console.log(`[TLS legacy probe] ${domain}: inconclusivo — ${legacyResult.reason}`);
  }
  // status "clean": sem finding, sem log (esperado para servidores modernos).

  tlsResult.ports = openPorts;
  tlsResult.cdn = cdnInfo;
  return tlsResult;
}
