/**
 * server/services/scan-executor.ts
 *
 * NIS2 Agentless Scanner Service — v3 (week 3)
 * Integrates Shodan + Censys + ownership verification + NIS2 scoring.
 */

import http from "http";
import type { ShodanHostResult } from "../integrations/shodan";
import type { CensysHostResult } from "../integrations/censys";
import type { DirectTlsResult } from "../integrations/direct-tls";
import type { EmailSecurityResult } from "../integrations/email-security";
import type { HttpHeadersResult } from "../integrations/http-headers";
import type { DarkWebResult } from "../integrations/dark-web";
import { getCisControls } from "../utils/cis-mapping";
import { getIso27001Controls, getNistCsfControls } from "../utils/framework-mapping";
import { batchLookupCveVersionRanges, isVersionInNvdRanges } from "../integrations/nvd";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentlessScanOptions {
  scanId: number;
  organizationId: number;
  target: string;
  mode: "sme" | "supply";
  timeout?: number;
}

export interface NIS2ArticleScore {
  article: string;
  title: string;
  /** null = não avaliável por scan externo (medida organizacional); 0–100 = score técnico */
  score: number | null;
  /** false = medida organizacional, não observável por scan externo */
  scannable: boolean;
  findings: string[];
}

export interface AgentlessScanResult {
  scanId: number;
  success: boolean;
  target: string;
  openPorts: PortFinding[];
  vulnerabilities: VulnFinding[];
  tlsIssues: TlsIssueFinding[];
  nis2Scores: NIS2ArticleScore[];
  overallScore: number;
  emailSecurity?: EmailSecurityResult;
  httpHeaders?: HttpHeadersResult;
  darkWeb?: DarkWebResult;
  directTls?: DirectTlsResult;
  error?: string;
  durationMs: number;
}

export interface PortFinding {
  port: number;
  protocol: "tcp" | "udp";
  service: string;
  product?: string;
  version?: string;
  cves: string[];
}

export interface VulnFinding {
  cveId: string;
  cvssScore: number;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  affectedService: string;
  port?: number;
  nis2Articles: string[];
  cisControls: string[];
  iso27001Controls: string[];
  nistCsfControls: string[];
  remediationHint: string;
}

export interface TlsIssueFinding {
  port: number;
  issue: string;
  severity: "critical" | "high" | "medium";
  nis2Article: "Art. 21(2)(h)";
}

// ---------------------------------------------------------------------------
// NIS2 Article mapping — Art. 21(2)(a)–(j)
//
// scannable=false: medida organizacional, não observável por scan externo.
//   Estas medidas NÃO recebem score do scan — aparecem como "não avaliável".
//   O score global do scan é calculado apenas sobre as medidas scannable=true.
//
// scannable=true: tem componente técnica observável externamente.
//   (e) parcial · (f) parcial · (h) · (i) parcial · (j) parcial
//
// Porta/keyword → medida: um achado pertence a UMA só medida.
//   Telnet (23), FTP (21) → (h) criptografia (protocolo em claro)
//   syslog (514), TFTP (69), rpcbind (111) → (e) serviços expostos
//   CVEs "default-password / weak-auth / anonymous" → (i) controlo de acessos
// ---------------------------------------------------------------------------

const NIS2_ARTICLE_MAP: Record<string, {
  title: string;
  riskPorts: number[];
  weight: number;
  scannable: boolean;
}> = {
  "Art. 21(2)(a)": {
    title: "Políticas de segurança dos sistemas de informação",
    riskPorts: [],
    weight: 10,
    scannable: false,   // puramente organizacional
  },
  "Art. 21(2)(b)": {
    title: "Gestão de incidentes",
    riskPorts: [],
    weight: 10,
    scannable: false,   // puramente organizacional
  },
  "Art. 21(2)(c)": {
    title: "Continuidade de negócio e gestão de crises",
    riskPorts: [],
    weight: 8,
    scannable: false,   // puramente organizacional
  },
  "Art. 21(2)(d)": {
    title: "Segurança da cadeia de abastecimento",
    riskPorts: [],
    weight: 8,
    scannable: false,   // não observável por scan externo
  },
  "Art. 21(2)(e)": {
    title: "Segurança na aquisição e desenvolvimento de sistemas",
    // Dev servers, Elasticsearch, CouchDB, MongoDB + syslog, TFTP, rpcbind (movidos de g)
    riskPorts: [8080, 8443, 9200, 5984, 27017, 514, 69, 111],
    weight: 12,
    scannable: true,
  },
  "Art. 21(2)(f)": {
    title: "Políticas de avaliação de eficácia das medidas",
    riskPorts: [],
    weight: 5,
    scannable: false,   // organizacional — não observável por scan externo
  },
  "Art. 21(2)(g)": {
    title: "Práticas básicas de ciberhigiene e formação",
    riskPorts: [],      // portas movidas para (h) e (e); não observável por scan
    weight: 10,
    scannable: false,   // formação/higiene organizacional não é observável externamente
  },
  "Art. 21(2)(h)": {
    title: "Criptografia e encriptação",
    // Plain HTTP + FTP (21) + Telnet (23) — protocolos em claro (movidos de g)
    riskPorts: [80, 21, 23],
    weight: 15,
    scannable: true,
  },
  "Art. 21(2)(i)": {
    title: "Segurança dos recursos humanos e controlo de acessos",
    riskPorts: [3389, 22, 445, 5900, 5985], // RDP, SSH, SMB, VNC, WinRM
    weight: 12,
    scannable: true,
  },
  "Art. 21(2)(j)": {
    title: "Autenticação multifator e comunicações seguras",
    riskPorts: [25, 110, 143, 587], // SMTP, POP3, IMAP (plain)
    weight: 10,
    scannable: true,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export function isIpAddress(target: string): boolean {
  return IPV4_RE.test(target.trim());
}

// ---------------------------------------------------------------------------
// Ownership verification — DNS TXT for domains, HTTP .well-known for IPs
// ---------------------------------------------------------------------------

function fetchWellKnownToken(ip: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: ip, path: "/.well-known/nis2pt.txt", timeout: 5000 },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => resolve(body.trim()));
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

// Public test targets authorised by their owners for security scanning
const PUBLIC_TEST_TARGETS = new Set([
  "scanme.nmap.org",
  "testphp.vulnweb.com",
  "testasp.vulnweb.com",
  "testaspnet.vulnweb.com",
  "demo.testfire.net",
  "badssl.com",
  "http.badssl.com",
  "expired.badssl.com",
  "wrong.host.badssl.com",
  "self-signed.badssl.com",
]);

export async function verifyOwnership(
  target: string,
  orgId: number
): Promise<{ verified: boolean; method?: string }> {
  // Public test domains skip ownership verification
  if (PUBLIC_TEST_TARGETS.has(target)) {
    return { verified: true, method: "public-test-target" };
  }

  const token = `nis2pt-verify=${orgId}`;

  if (isIpAddress(target)) {
    const found = await fetchWellKnownToken(target);
    return found === token
      ? { verified: true, method: "http-file" }
      : { verified: false };
  }

  // Domain — DNS TXT record
  const { resolveTxt } = await import("dns/promises");
  try {
    const records = await resolveTxt(target);
    if (records.flat().some((r) => r === token)) {
      return { verified: true, method: "dns-txt" };
    }
  } catch {}

  return { verified: false };
}

// ---------------------------------------------------------------------------
// Map CVE to a single NIS2 article (one finding → one medida)
//
// Regra: cada achado pertence a UMA medida, a mais específica que corresponde.
// Medidas não scannáveis (a,b,c,d,g) não recebem achados de scan.
// Prioridade: (h) cripto > (i) acessos > (j) autenticação > (e) sistemas > fallback (e)
// ---------------------------------------------------------------------------

function mapCveToNIS2Articles(cveId: string, description: string): string[] {
  const desc = description.toLowerCase();

  // (h) Criptografia — problemas de protocolo em claro ou cipher fraco
  if (/ssl|tls|cipher|encrypt|heartbleed|poodle|rc4|des|weak.cipher/.test(desc))
    return ["Art. 21(2)(h)"];

  // (i) Controlo de acessos — acesso remoto, credenciais, privilege escalation
  // Inclui keywords de (g) ("default-password", "weak-auth", "anonymous") movidos aqui
  if (/rdp|ssh|smb|vnc|winrm|auth|credential|privilege|bruteforce|default.pass|weak.auth|no.auth|anonymous/.test(desc))
    return ["Art. 21(2)(i)"];

  // (j) Autenticação/identidade — MFA, OTP, STARTTLS, email auth
  if (/mfa|otp|two.factor|starttls|dmarc|dkim|spf/.test(desc))
    return ["Art. 21(2)(j)"];

  // (e) Segurança de sistemas — injecção, execução, deserialização, serviços expostos
  if (/inject|xss|rce|execut|deserializ|xxe|telnet|ftp|supply.chain|dependency/.test(desc))
    return ["Art. 21(2)(e)"];

  return ["Art. 21(2)(e)"]; // fallback: vulnerabilidade de sistema genérica
}

// ---------------------------------------------------------------------------
// Calculate NIS2 scores per article
//
// Regras:
//   • Artigos não scannáveis (scannable=false) → score=null, findings=[].
//     Não entram na média ponderada (score global reflete só o avaliável).
//   • Dedup por CVE dentro de cada artigo — o mesmo CVE não conta mais de uma vez.
//   • Dedup por porto dentro de cada artigo — porto não deduzido duas vezes.
// ---------------------------------------------------------------------------

interface ExtraDeduction {
  article: string;
  finding: string;
  deduction: number;
}

// Converts a TlsIssueFinding to a VulnFinding so TLS problems appear in
// results.vulnerabilities and are visible to the user (CORREÇÃO 5).
// ID is stable per port+condition — dedup handles duplicates across sources.
function tlsIssueToVulnFinding(tls: TlsIssueFinding): VulnFinding {
  const issue = tls.issue;
  const port  = tls.port;

  let slug: string;
  let remediationHint: string;

  if (/expirado/i.test(issue)) {
    slug = "CERT-EXPIRED";
    remediationHint = "Renova o certificado TLS imediatamente (certbot renew ou equivalente).";
  } else if (/expira/i.test(issue)) {
    slug = "CERT-EXPIRING";
    remediationHint = "Renova o certificado TLS antes da expiração (certbot renew ou equivalente).";
  } else if (/auto-assinado/i.test(issue)) {
    slug = "CERT-SELFSIGNED";
    remediationHint = "Substitui o certificado auto-assinado por um emitido por uma CA pública (ex.: Let's Encrypt).";
  } else if (/obsoleto|TLSv1\.|SSLv/i.test(issue)) {
    slug = "PROTOCOL-OBSOLETE";
    remediationHint = "Desactiva TLS 1.0/1.1 e SSL 2/3 na configuração do servidor; usa apenas TLS 1.2+.";
  } else if (/cifra|fraca|RC4|DES|EXPORT|NULL|anon/i.test(issue)) {
    slug = "CIPHER-WEAK";
    remediationHint = "Remove cifras fracas (RC4, DES, 3DES, EXPORT, NULL) da configuração TLS do servidor.";
  } else if (/não acessível/i.test(issue)) {
    slug = "PORT-CLOSED";
    remediationHint = "Instala certificado TLS e abre o porto 443 (HTTPS).";
  } else {
    slug = "ISSUE";
    remediationHint = "Verifica a configuração TLS do servidor.";
  }

  const cveId = `NIS2-TLS-${port}-${slug}`;
  const cvssScore = tls.severity === "critical" ? 8.0 : tls.severity === "high" ? 6.5 : 5.0;
  const nis2 = [tls.nis2Article] as string[];

  return {
    cveId,
    cvssScore,
    severity: tls.severity,
    description: issue,
    affectedService: "tls",
    port,
    nis2Articles: nis2,
    cisControls:      getCisControls(cveId, nis2),
    iso27001Controls: getIso27001Controls(cveId, nis2),
    nistCsfControls:  getNistCsfControls(cveId, nis2),
    remediationHint,
  };
}

function calculateNIS2Scores(
  ports: PortFinding[],
  vulns: VulnFinding[],
  extraDeductions: ExtraDeduction[] = []
): { scores: NIS2ArticleScore[]; overall: number } {
  const openPortSet = new Set(ports.map((p) => p.port));
  const scores: NIS2ArticleScore[] = [];
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const [article, def] of Object.entries(NIS2_ARTICLE_MAP)) {
    // Medidas organizacionais não avaliáveis por scan externo
    if (!def.scannable) {
      scores.push({ article, title: def.title, score: null, scannable: false, findings: [] });
      continue;
    }

    const findings: string[] = [];
    let deduction = 0;
    const seenPorts = new Set<number>();
    const seenCves  = new Set<string>();

    // Port-based deductions (sem duplicados)
    for (const riskPort of def.riskPorts) {
      if (openPortSet.has(riskPort) && !seenPorts.has(riskPort)) {
        seenPorts.add(riskPort);
        const svc = ports.find((p) => p.port === riskPort);
        findings.push(`Porto ${riskPort} (${svc?.service ?? "unknown"}) exposto — aumenta superfície de ataque`);
        deduction += 15;
      }
    }

    // CVE + synthetic vuln deductions (cada achado conta uma vez por artigo).
    // TLS issues chegam aqui como VulnFinding (tlsIssueToVulnFinding) — fonte única.
    for (const vuln of vulns) {
      if (vuln.nis2Articles.includes(article) && !seenCves.has(vuln.cveId)) {
        seenCves.add(vuln.cveId);
        findings.push(`${vuln.cveId} (CVSS ${vuln.cvssScore.toFixed(1)}) — ${vuln.description}`);
        deduction += Math.min(vuln.cvssScore * 3, 25);
      }
    }

    // Deduções extra (avisos/warns que não têm vuln associada)
    for (const extra of extraDeductions) {
      if (extra.article === article) {
        findings.push(extra.finding);
        deduction += extra.deduction;
      }
    }

    const score = Math.max(0, Math.round(100 - deduction));
    scores.push({ article, title: def.title, score, scannable: true, findings });
    weightedTotal += score * def.weight;
    totalWeight   += def.weight;
  }

  // Overall = média ponderada APENAS sobre artigos scannáveis
  const overall = totalWeight > 0 ? Math.round(weightedTotal / totalWeight) : 0;
  return { scores, overall };
}

// ---------------------------------------------------------------------------
// CPE helpers — for matching Shodan CPEs to banner-detected services
// ---------------------------------------------------------------------------

// Extract "vendor:product" from CPE 2.2 or 2.3 strings.
// CPE 2.2: "cpe:/a:apache:http_server:2.4.7"  → "apache:http_server"
// CPE 2.3: "cpe:2.3:a:apache:http_server:..." → "apache:http_server"
function parseCpeVendorProduct(cpe: string): string | null {
  const parts = cpe.split(":");
  let vendor: string, product: string;
  if (cpe.startsWith("cpe:2.3:")) {
    vendor = parts[3]; product = parts[4];
  } else {
    vendor = parts[2]; product = parts[3];
  }
  if (!vendor || !product || vendor === "*" || product === "*") return null;
  return `${vendor}:${product}`;
}

// Returns true if vendor:product string is compatible with the detected service name.
// E.g. "apache:http_server" matches serviceName "apache".
function cpeMatchesService(vendorProduct: string, serviceName: string): boolean {
  const lc = serviceName.toLowerCase();
  const [vendor, product] = vendorProduct.split(":");
  return lc.includes(vendor) || lc.includes(product) ||
    vendor.includes(lc) || product.includes(lc);
}

// Extract version from CPE 2.2 ("cpe:/a:apache:http_server:2.4.7") or
// CPE 2.3 ("cpe:2.3:a:apache:http_server:2.4.7:*:...") strings.
function parseCpeVersion(cpe: string): string | null {
  const parts = cpe.split(":");
  const v = cpe.startsWith("cpe:2.3:") ? parts[5] : parts[4];
  if (!v || v === "*" || v === "-") return null;
  return v;
}

// Maps well-known port numbers to service name tokens for CPE matching.
// Used to identify services on non-HTTP ports using Shodan CPE data.
const CPE_PORT_HINTS: Record<number, string> = {
  21:    "ftp",
  22:    "ssh",
  25:    "smtp",
  110:   "pop3",
  143:   "imap",
  3306:  "mysql",
  5432:  "postgresql",
  6379:  "redis",
  27017: "mongodb",
};

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeAgentlessScan(
  options: AgentlessScanOptions
): Promise<AgentlessScanResult> {
  const startTime = Date.now();

  try {
    const { updateScanStatus } = await import("../db");
    await updateScanStatus(options.scanId, "running", new Date());

    // ── 1. Verify ownership (DNS TXT for domains, HTTP .well-known for IPs) ─
    const ownership = await verifyOwnership(options.target, options.organizationId);
    if (!ownership.verified) {
      const hint = isIpAddress(options.target)
        ? `Cria http://${options.target}/.well-known/nis2pt.txt com o conteúdo: nis2pt-verify=${options.organizationId}`
        : `Adiciona o DNS TXT record: nis2pt-verify=${options.organizationId}`;
      throw new Error(`Verificação de ownership falhou. ${hint}`);
    }

    const isDomain = !isIpAddress(options.target);

    // ── 2. Shodan + Censys + Direct TLS + HTTP headers (parallel) ──────────
    // HTTP headers fetched here (not in step 6) so the Server: banner is
    // available to enrich port 80/443 service/version before the CVE loop.
    const [shodanData, censysData, directTls, httpHeaders] = await Promise.all([
      import("../integrations/shodan").then((m) =>
        m.lookupHost(options.target).catch(() => null)
      ) as Promise<ShodanHostResult | null>,
      import("../integrations/censys").then((m) =>
        m.lookupHost(options.target).catch(() => null)
      ) as Promise<CensysHostResult | null>,
      isDomain
        ? import("../integrations/direct-tls").then((m) =>
            m.checkDirectTls(options.target).catch(() => null)
          ) as Promise<DirectTlsResult | null>
        : Promise.resolve(null),
      import("../integrations/http-headers").then((m) =>
        m.checkHttpHeaders(options.target).catch(() => null)
      ) as Promise<HttpHeadersResult | null>,
    ]);

    // ── 3. Detect shared/anycast infrastructure ────────────────────────────
    // Railway, Vercel, Netlify, Cloudflare et al. use anycast IPs shared across
    // tenants — Shodan sees all 200+ ports of the platform, not the app's ports.
    const SHARED_INFRA_PROVIDERS = [
      "railway", "vercel", "netlify", "cloudflare", "fastly", "akamai",
      "digitalocean", "render", "fly.io", "heroku", "azurewebsites",
    ];
    const SHARED_INFRA_TAGS = ["cloud", "hosting", "cdn", "proxy", "anycast"];
    const shodanPortCount  = shodanData?.ports?.length ?? 0;
    const shodanTags       = (shodanData?.tags ?? []).map(t => t.toLowerCase());
    const shodanHostnames  = (shodanData?.hostnames ?? []).map(h => h.toLowerCase());
    const isSharedInfra = isDomain && (
      shodanPortCount > 40 ||
      shodanTags.some(t => SHARED_INFRA_TAGS.includes(t)) ||
      shodanHostnames.some(h => SHARED_INFRA_PROVIDERS.some(p => h.includes(p)))
    );

    if (isSharedInfra) {
      const providerHint = shodanHostnames.find(h => SHARED_INFRA_PROVIDERS.some(p => h.includes(p))) ?? "infraestrutura cloud partilhada";
      console.log(`[Scanner] ${options.target} → IP partilhado (${providerHint}, ${shodanPortCount} portos) — portos Shodan ignorados para CVEs`);
    }

    // ── Merge port findings ────────────────────────────────────────────────
    // If shared infra detected, strip CVEs from Shodan ports (they belong to
    // the platform, not the target app). Keep ports for informational display.
    const openPorts: PortFinding[] =
      shodanData?.ports?.map((p) => ({
        port: p.port,
        protocol: (p.transport ?? "tcp") as "tcp" | "udp",
        service: p.product ?? p._shodan?.module ?? "unknown",
        product: p.product,
        version: p.version,
        cves: isSharedInfra ? [] : Object.keys(p.vulns ?? {}),
      })) ?? [];

    // ── Enrich HTTP ports with Server: banner + CPE-based CVE assignment ──────
    // InternetDB ports carry no product/version/vulns. The Server: response header
    // provides the service identity. Host-level CVEs (shodanData.vulns) are then
    // assigned to the correct port via CPE matching so NVD can filter by product
    // and version. The paid Shodan API may also return a product without version;
    // the banner fills in the missing version in that case too.
    const bannerEnrichedPorts = new Set<number>();

    if (httpHeaders?.serverBanner) {
      const banner = httpHeaders.serverBanner;
      const m = banner.match(/^([A-Za-z0-9_\-\.]+)(?:\/([^\s(]+))?/);
      if (m) {
        const bannerProduct = m[1];
        const bannerVersion = m[2];
        const shodanCpes = shodanData?.cpes ?? [];
        const hostCves   = shodanData?.vulns ?? [];

        for (const p of openPorts) {
          if (p.port !== 80 && p.port !== 443) continue;

          // Set service from banner when Shodan has none
          if (p.service === "unknown") {
            p.service = bannerProduct.toLowerCase();
            p.product = bannerProduct;
          }
          // Fill missing version — paid Shodan API may return product but not version
          if (!p.version && bannerVersion) {
            p.version = bannerVersion;
          }

          // Assign host-level CVEs when version is now known, no per-port CVEs exist,
          // and a matching CPE confirms the service identity (prevents SSH CVEs from
          // appearing on the Apache port, etc.).
          if (p.version && p.cves.length === 0 && hostCves.length > 0 && shodanCpes.length > 0) {
            const matchCpe = shodanCpes
              .map(parseCpeVendorProduct)
              .find((vp): vp is string => vp !== null && cpeMatchesService(vp, p.service));
            if (matchCpe) {
              p.cves = [...hostCves];
              bannerEnrichedPorts.add(p.port);
              console.log(`[CVE] Porto ${p.port} (${p.service} ${p.version}): ${hostCves.length} CVEs candidatos via CPE ${matchCpe}`);
            }
          }
        }
        console.log(`[Scanner] Server banner: ${banner} → produto=${bannerProduct} versão=${bannerVersion ?? "desconhecida"}`);
      }
    }

    // Phase 2: CPE-based service/version identification for non-HTTP "unknown" ports.
    // Only updates display fields (service, version) — does NOT assign host CVEs.
    // CVE assignment for SSH is handled by the dedicated SSH check (step 5b).
    const shodanCpesAll = shodanData?.cpes ?? [];
    for (const p of openPorts) {
      if (p.service !== "unknown") continue;
      const hint = CPE_PORT_HINTS[p.port];
      if (!hint) continue;
      for (const cpe of shodanCpesAll) {
        const vp = parseCpeVendorProduct(cpe);
        if (!vp || !cpeMatchesService(vp, hint)) continue;
        p.service = vp.split(":")[1] ?? hint;
        const cpeVer = parseCpeVersion(cpe);
        if (cpeVer && !p.version) p.version = cpeVer;
        console.log(`[Scanner] Porto ${p.port}: CPE → ${p.service} ${p.version ?? "(versão desconhecida)"}`);
        break;
      }
    }

    // Add Censys services not already in Shodan
    const censysPorts: PortFinding[] =
      censysData?.services
        ?.filter((svc) => !openPorts.some((p) => p.port === svc.port))
        .map((svc) => ({
          port: svc.port,
          protocol: "tcp" as const,
          service: svc.service_name ?? "unknown",
          cves: [],
        })) ?? [];

    // Add ports confirmed by direct TCP check (80/443) if not already present
    const directPorts: PortFinding[] = (directTls?.ports ?? [])
      .filter((dp) => dp.open && !openPorts.some((p) => p.port === dp.port) && !censysPorts.some((p) => p.port === dp.port))
      .map((dp) => ({
        port: dp.port,
        protocol: "tcp" as const,
        service: dp.service,
        cves: [],
      }));

    // Dedup by port number: Shodan e Censys podem ambos reportar o mesmo porto.
    // Shodan tem prioridade (pode ter CVEs/versão); Censys/direct apenas preenchem gaps.
    const _rawAllPorts = [...openPorts, ...censysPorts, ...directPorts];
    const _seenPortNums = new Set<number>();
    const allPorts = _rawAllPorts.filter((p) => {
      if (_seenPortNums.has(p.port)) return false;
      _seenPortNums.add(p.port);
      return true;
    });

    // ── TLS issues — prefer direct TLS (works through CDN), fall back to Censys
    const censysTlsIssues: TlsIssueFinding[] = censysData?.tlsIssues ?? [];
    const directTlsIssues: TlsIssueFinding[] = (directTls?.tlsIssues ?? []).map((i) => ({
      port: 443,
      issue: i.issue,
      severity: i.severity,
      nis2Article: i.nis2Article,
    }));
    // Use direct TLS issues if available (more accurate), else fall back to Censys
    const tlsIssues: TlsIssueFinding[] =
      directTlsIssues.length > 0 ? directTlsIssues : censysTlsIssues;

    // ── 4. Build vulnerability list ────────────────────────────────────────
    const vulns: VulnFinding[] = [];
    const { createVulnerability } = await import("../db");
    const currentYear = new Date().getFullYear();

    // Pre-fetch NVD version ranges for all CVEs found — batch to stay within rate limits.
    // This allows us to filter out CVEs that don't actually affect the detected version.
    const allCveIds = openPorts.flatMap((p) => p.cves);
    const nvdRangeMap = await batchLookupCveVersionRanges(allCveIds);

    for (const portFinding of openPorts) {
      // When a port has CVEs but no version, emit ONE synthetic finding instead of all CVEs.
      // This avoids flooding the report with potentially inapplicable CVEs.
      const hasVersion = Boolean(portFinding.version);
      const hasCves = portFinding.cves.length > 0;

      if (hasCves && !hasVersion) {
        const svcName = portFinding.service !== "unknown" ? portFinding.service : `serviço na porta ${portFinding.port}`;
        console.log(`[CVE filter] Porto ${portFinding.port}: versão desconhecida com ${portFinding.cves.length} CVEs → NIS2-SVC-UNKNOWN`);
        const nis2Unknown = ["Art. 21(2)(e)"];
        vulns.push({
          cveId: "NIS2-SVC-UNKNOWN",
          cvssScore: 5.0,
          severity: "medium",
          description: `${svcName} (porto ${portFinding.port}) expõe ${portFinding.cves.length} CVE(s) conhecidos mas a versão não foi detectada — actualiza ou identifica o serviço para avaliar a exposição real.`,
          affectedService: portFinding.service,
          nis2Articles: nis2Unknown,
          cisControls:      getCisControls("NIS2-SVC-UNKNOWN", nis2Unknown),
          iso27001Controls: getIso27001Controls("NIS2-SVC-UNKNOWN", nis2Unknown),
          nistCsfControls:  getNistCsfControls("NIS2-SVC-UNKNOWN", nis2Unknown),
          remediationHint: `Identifica a versão do ${svcName} e actualiza para eliminar as vulnerabilidades conhecidas.`,
        });
        continue;
      }

      for (const cveId of portFinding.cves) {
        // Filter out CVEs with future year — reserved IDs not yet officially published
        const cveYearMatch = cveId.match(/^CVE-(\d{4})-/);
        if (cveYearMatch && parseInt(cveYearMatch[1]) > currentYear) {
          console.log(`[Scanner] Skipping future CVE ${cveId} (year > ${currentYear})`);
          continue;
        }

        const shodanPort = shodanData?.ports?.find((p) => p.port === portFinding.port);
        const nvdInfo = nvdRangeMap.get(cveId);

        // Prefer per-port Shodan CVSS (paid API), then NVD CVSS, then 5.0 as last resort.
        // For InternetDB (free), shodanPort.vulns is always undefined → NVD CVSS used instead.
        const cvssScore: number = shodanPort?.vulns?.[cveId]?.cvss ?? nvdInfo?.cvssScore ?? 5.0;

        // Skip CVEs with no CVSS score (unscored = not yet officially published)
        if (cvssScore === 0) {
          console.log(`[Scanner] Skipping unscored CVE ${cveId}`);
          continue;
        }

        // Strict mode for banner-enriched ports (CVEs came from host-level Shodan, not per-port).
        // Without NVD product confirmation we cannot verify the CVE applies to this service.
        // "Conservative include" would reintroduce the 120-CVE regression; be explicit instead.
        if (bannerEnrichedPorts.has(portFinding.port)) {
          if (!nvdInfo || nvdInfo.affectedProducts.length === 0) {
            // No NVD data or no product info → cannot confirm → exclude
            console.log(`[CVE filter] ${cveId} — excluído (sem dados NVD de produto; porto banner ${portFinding.port})`);
            continue;
          }
          const productMatch = nvdInfo.affectedProducts.some(
            (ap) => cpeMatchesService(ap, portFinding.service)
          );
          if (!productMatch) {
            console.log(`[CVE filter] ${cveId} — excluído (${portFinding.service}: produto NVD [${nvdInfo.affectedProducts.join(", ")}] não corresponde)`);
            continue;
          }
          // Produto confirmado — mas sem intervalo de versões não conseguimos confirmar
          // que a versão detectada é afectada. Para banner-enriched rejeitamos.
          if (!nvdInfo.hasRangeData) {
            console.log(`[CVE filter] ${cveId} — excluído (sem intervalo NVD; banner ${portFinding.port}; versão ${portFinding.version ?? "desconhecida"} não confirmável)`);
            continue;
          }
          // hasRangeData=true garantido — version filter corre abaixo
        }

        // Regra unificada (CORREÇÃO 1+2): CVE só é listado se há intervalo NVD real
        // que confirme que a versão detetada é afetada. Aplica-se a TODOS os portos;
        // sem dados de versão reais não inventamos. Banner-enriched já exigiu
        // hasRangeData=true no bloco anterior, portanto não há duplicação.
        if (hasVersion) {
          if (!nvdInfo?.hasRangeData) {
            console.log(`[CVE filter] ${cveId} — excluído (sem intervalo NVD; ${portFinding.service} ${portFinding.version} não confirmável)`);
            continue;
          }
          const inRange = isVersionInNvdRanges(portFinding.version!, nvdInfo.ranges);
          if (!inRange) {
            console.log(`[CVE filter] ${cveId} — excluído (${portFinding.service} ${portFinding.version}; fora do intervalo NVD)`);
            continue;
          }
          console.log(`[CVE filter] ${cveId} — incluído (${portFinding.service} ${portFinding.version}; dentro do intervalo NVD)`);
        }

        const severity = (s: number) =>
          s >= 9 ? "critical" : s >= 7 ? "high" : s >= 4 ? "medium" : "low";
        const sevPT = (s: number) =>
          s >= 9 ? "crítica" : s >= 7 ? "alta" : s >= 4 ? "média" : "baixa";
        const description = `Vulnerabilidade ${cveId} detectada no serviço ${portFinding.service} (porto ${portFinding.port}). Gravidade ${sevPT(cvssScore)} com pontuação CVSS ${cvssScore.toFixed(1)}. Actualiza o serviço para corrigir esta exposição.`;

        const nis2Articles = mapCveToNIS2Articles(cveId, description);

        const vuln: VulnFinding = {
          cveId,
          cvssScore,
          severity: severity(cvssScore) as VulnFinding["severity"],
          description,
          affectedService: portFinding.service,
          port: portFinding.port,
          nis2Articles,
          cisControls:      getCisControls(cveId, nis2Articles, description),
          iso27001Controls: getIso27001Controls(cveId, nis2Articles, description),
          nistCsfControls:  getNistCsfControls(cveId, nis2Articles, description),
          remediationHint: `Actualiza o serviço ${portFinding.service} para eliminar ${cveId}.`,
        };

        vulns.push(vuln);

        await createVulnerability({
          scanId: options.scanId,
          organizationId: options.organizationId,
          cveId,
          severity: vuln.severity,
          cvssScore,
          description,
          affectedComponent: portFinding.service,
          port: portFinding.port,
          remediation: vuln.remediationHint,
        }).catch((e) => console.error(`[Scanner] DB persist error for ${cveId}:`, e));
      }
    }

    // ── 5. Check for plain HTTP without HTTPS ──────────────────────────────
    const hasHttp = allPorts.some((p) => p.port === 80);
    const hasHttps = allPorts.some((p) => p.port === 443);
    if (hasHttp && !hasHttps) {
      const tlsNis2 = ["Art. 21(2)(h)"];
      vulns.push({
        cveId: "NIS2-TLS-001",
        cvssScore: 7.5,
        severity: "high",
        description: "Serviço HTTP sem HTTPS — dados transmitidos em claro",
        affectedService: "http",
        nis2Articles: tlsNis2,
        cisControls:      getCisControls("NIS2-TLS-001", tlsNis2),
        iso27001Controls: getIso27001Controls("NIS2-TLS-001", tlsNis2),
        nistCsfControls:  getNistCsfControls("NIS2-TLS-001", tlsNis2),
        remediationHint: "Instala certificado TLS (Let's Encrypt gratuito) e redireciona HTTP → HTTPS.",
      });
    }

    // ── 5b. SSH version check — quando porto 22 está aberto ───────────────
    const sshOpen = allPorts.some((p) => p.port === 22);
    if (sshOpen) {
      const sshTarget = shodanData?.ip ?? options.target;
      const sshResult = await import("../integrations/ssh-check")
        .then((m) => m.checkSsh(sshTarget))
        .catch(() => null);

      if (sshResult) {
        // Update port 22 display fields from live SSH banner (fallback after CPE enrichment)
        const port22 = allPorts.find((p) => p.port === 22);
        if (port22) {
          if (port22.service === "unknown") port22.service = "openssh";
          if (!port22.version && sshResult.version) port22.version = sshResult.version;
        }

        for (const sv of sshResult.vulns) {
          const affectedService = `SSH (${sshResult.software})`;
          vulns.push({
            cveId:            sv.cveId,
            cvssScore:        sv.cvssScore,
            severity:         sv.severity,
            description:      sv.description,
            affectedService,
            port:             sshResult.port,
            nis2Articles:     sv.nis2Articles,
            cisControls:      sv.cisControls,
            iso27001Controls: sv.iso27001Controls,
            nistCsfControls:  sv.nistCsfControls,
            remediationHint:  sv.remediationHint,
          });

          await createVulnerability({
            scanId:           options.scanId,
            organizationId:   options.organizationId,
            cveId:            sv.cveId,
            severity:         sv.severity,
            cvssScore:        sv.cvssScore,
            description:      sv.description,
            affectedComponent: affectedService,
            port:             sshResult.port,
            remediation:      sv.remediationHint,
          }).catch((e) => console.error(`[Scanner] DB persist SSH ${sv.cveId}:`, e));
        }

        // Propaga os IDs dos CVEs SSH para port22.cves em allPorts.
        // allPorts é guardado em results.openPorts (linha updateScanStatus).
        // Sem isto, a tabela de portos filtra exposedPorts = cves.length > 0
        // e porta 22 aparece limpa mesmo com CVEs SSH na lista de vulnerabilidades.
        if (sshResult.vulns.length > 0 && port22) {
          const sshCveIds = sshResult.vulns.map((v) => v.cveId);
          port22.cves = [...new Set([...port22.cves, ...sshCveIds])];
        }
      }
    }

    // ── 6. Email security (domain-only; http-headers already fetched in step 2) ─
    const emailSecurity = isDomain
      ? await import("../integrations/email-security").then((m) =>
          m.checkEmailSecurity(options.target).catch(() => null)
        )
      : null;

    // Convert failed email checks to synthetic vulns
    const extraDeductions: ExtraDeduction[] = [];

    if (emailSecurity) {
      for (const check of emailSecurity.checks) {
        if (check.status === "fail") {
          const cvssScore = check.name === "DMARC" ? 7.0 : 5.0;
          const cveId = `NIS2-EMAIL-${check.name.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`;
          vulns.push({
            cveId,
            cvssScore,
            severity: cvssScore >= 7 ? "high" : "medium",
            description: check.detail,
            affectedService: "email",
            nis2Articles: [check.nis2Article],
            cisControls:      check.cisControls      ?? getCisControls(cveId, [check.nis2Article]),
            iso27001Controls: check.iso27001Controls ?? getIso27001Controls(cveId, [check.nis2Article]),
            nistCsfControls:  check.nistCsfControls  ?? getNistCsfControls(cveId, [check.nis2Article]),
            remediationHint: `Configura ${check.name} no DNS do domínio ${options.target}.`,
          });
          // Não adicionar extraDeduction: a vuln já deduz pelo cvssScore — evita dupla contagem.
        } else if (check.status === "warn") {
          extraDeductions.push({ article: check.nis2Article, finding: `${check.name} (aviso): ${check.detail}`, deduction: 8 });
        }
      }
    }

    // Convert failed HTTP header checks to synthetic vulns
    if (httpHeaders) {
      for (const check of httpHeaders.checks) {
        if (check.status === "fail") {
          const cvssScore = check.name === "HSTS" || check.name === "CSP" ? 6.5 : 4.0;
          const cveId = `NIS2-HEADER-${check.name.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`;
          vulns.push({
            cveId,
            cvssScore,
            severity: cvssScore >= 7 ? "high" : cvssScore >= 4 ? "medium" : "low",
            description: check.detail,
            affectedService: "http",
            nis2Articles: [check.nis2Article],
            cisControls:      check.cisControls      ?? getCisControls(cveId, [check.nis2Article]),
            iso27001Controls: check.iso27001Controls ?? getIso27001Controls(cveId, [check.nis2Article]),
            nistCsfControls:  check.nistCsfControls  ?? getNistCsfControls(cveId, [check.nis2Article]),
            remediationHint: `Adiciona o header ${check.name} na configuração do servidor web.`,
          });
          // Não adicionar extraDeduction: a vuln já deduz pelo cvssScore — evita dupla contagem.
        } else if (check.status === "warn") {
          extraDeductions.push({ article: check.nis2Article, finding: `${check.name} (aviso): ${check.detail}`, deduction: 4 });
        }
      }
    }

    // ── 7. Dark web monitoring — HIBP + DNS blacklists ────────────────────────
    const darkWeb = await import("../integrations/dark-web").then((m) =>
      m.checkDarkWeb(options.target, isIpAddress(options.target)).catch(() => null)
    );

    if (darkWeb) {
      for (const breach of darkWeb.breaches) {
        const cvssScore = breach.hasPasswords ? 8.5 : 6.0;
        const cveId = `NIS2-BREACH-${breach.name.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 20)}`;
        // Um breach mapeia para (i) controlo de acessos.
        // Para passwords, extra warn em (j) autenticação — sem criar vuln duplicada.
        const breachNis2 = ["Art. 21(2)(i)"];
        vulns.push({
          cveId,
          cvssScore,
          severity: cvssScore >= 7 ? "high" : "medium",
          description: `Credenciais da organização expostas no breach "${breach.name}" — dados: ${breach.dataClasses.join(", ")}.`,
          affectedService: "credentials",
          nis2Articles: breachNis2,
          cisControls:      getCisControls(cveId, breachNis2),
          iso27001Controls: getIso27001Controls(cveId, breachNis2),
          nistCsfControls:  getNistCsfControls(cveId, breachNis2),
          remediationHint: `Força o reset de passwords afectadas pelo breach "${breach.name}" e activa MFA em todas as contas.`,
        });
        // Não adicionar extraDeduction para (i): a vuln já deduz — evita dupla contagem.
        if (breach.hasPasswords) {
          extraDeductions.push({
            article: "Art. 21(2)(j)",
            finding: `Passwords expostas no breach "${breach.name}" — MFA obrigatório`,
            deduction: 12,
          });
        }
      }
      for (const bl of darkWeb.blacklists) {
        if (bl.listed) {
          const cveId = `NIS2-BLACKLIST-${bl.name.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`;
          vulns.push({
            cveId,
            cvssScore: 7.0,
            severity: "high",
            description: bl.detail,
            affectedService: isIpAddress(options.target) ? "network" : "domain",
            // Lista negra = indicador de comprometimento → (i) controlo de acessos.
            // (g) é não-scannável; não mapear para ela por scan externo.
            nis2Articles: ["Art. 21(2)(i)"],
            cisControls: getCisControls(cveId, ["Art. 21(2)(i)"]),
            iso27001Controls: getIso27001Controls(cveId, ["Art. 21(2)(i)"]),
            nistCsfControls: getNistCsfControls(cveId, ["Art. 21(2)(i)"]),
            remediationHint: `Investiga o compromisso que colocou o ${isIpAddress(options.target) ? "IP" : "domínio"} na lista negra ${bl.name} e solicita remoção após resolução.`,
          });
          // Vuln já deduz pelo cvssScore; sem extraDeduction extra para (i).
        }
      }
    }

    // ── 8b. Converter TlsIssueFindings em VulnFindings (CORREÇÃO 5) ──────────
    // TLS issues afectam o score de Art. 21(2)(h) mas ficavam invisíveis na lista
    // de achados. Convertê-los em VulnFindings garante coerência: o cliente vê a
    // causa do score baixar. Os IDs são estáveis (porto+condição) — o dedup abaixo
    // elimina duplicados se Censys e direct-tls reportarem a mesma condição.
    for (const tls of tlsIssues) {
      vulns.push(tlsIssueToVulnFinding(tls));
    }

    // ── 8. Calculate NIS2 scores ───────────────────────────────────────────
    // Dedup vulns: mesmo CVE pode vir de múltiplas fontes (Shodan + SSH check + dark web).
    // Mantemos o primeiro encontrado (o que vem do Shodan/NVD tem CVSS mais preciso).
    const _seenCveIds = new Set<string>();
    vulns.splice(0, vulns.length, ...vulns.filter((v) => !_seenCveIds.has(v.cveId) && (_seenCveIds.add(v.cveId), true)));

    // Actualiza openPorts.cves para conter apenas os CVEs que passaram o filtro NVD.
    // Garante que UI (p.cves.length) e PDF lêem exactamente a mesma contagem.
    const survivedCves = new Set(vulns.map((v) => v.cveId));
    for (const port of allPorts) {
      port.cves = port.cves.filter((id) => survivedCves.has(id));
    }

    const { scores, overall } = calculateNIS2Scores(allPorts, vulns, extraDeductions);

    // ── 9. Mark scan complete ──────────────────────────────────────────────
    await updateScanStatus(options.scanId, "completed", undefined, new Date(), {
      nis2Scores: scores,
      overallScore: overall,
      isSharedInfra,                                          // flag para UI/PDF
      // vulnerabilitiesFound gravado em separado foi eliminado (CORREÇÃO 4):
      // o total é results.vulnerabilities.length — uma única fonte de verdade.
      criticalCount: vulns.filter((v) => v.severity === "critical").length,
      highCount: vulns.filter((v) => v.severity === "high").length,
      mediumCount: vulns.filter((v) => v.severity === "medium").length,
      lowCount: vulns.filter((v) => v.severity === "low").length,
      vulnerabilities: vulns,
      openPorts: allPorts,
      tlsIssues,
      emailSecurity: emailSecurity ?? undefined,
      httpHeaders:   httpHeaders   ?? undefined,
      darkWeb:       darkWeb       ?? undefined,
      directTls:     directTls     ?? undefined,
    });

    return {
      scanId: options.scanId,
      success: true,
      target: options.target,
      openPorts: allPorts,
      vulnerabilities: vulns,
      tlsIssues,
      nis2Scores: scores,
      overallScore: overall,
      emailSecurity: emailSecurity ?? undefined,
      httpHeaders:   httpHeaders   ?? undefined,
      darkWeb:       darkWeb       ?? undefined,
      directTls:     directTls     ?? undefined,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Scanner] Scan ${options.scanId} failed:`, message);

    const { updateScanStatus } = await import("../db");
    await updateScanStatus(options.scanId, "failed", undefined, new Date()).catch(() => {});

    return {
      scanId: options.scanId,
      success: false,
      target: options.target,
      openPorts: [],
      vulnerabilities: [],
      tlsIssues: [],
      nis2Scores: [],
      overallScore: 0,
      error: message,
      durationMs: Date.now() - startTime,
    };
  }
}
