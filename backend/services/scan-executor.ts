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
  score: number;
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
// Weight = percentage of overall score
// ---------------------------------------------------------------------------

const NIS2_ARTICLE_MAP: Record<string, {
  title: string;
  riskPorts: number[];
  riskCveKeywords: string[];
  weight: number;
}> = {
  "Art. 21(2)(a)": {
    title: "Políticas de segurança dos sistemas de informação",
    riskPorts: [],
    riskCveKeywords: [],
    weight: 10,
  },
  "Art. 21(2)(b)": {
    title: "Gestão de incidentes",
    riskPorts: [],
    riskCveKeywords: [],
    weight: 10,
  },
  "Art. 21(2)(c)": {
    title: "Continuidade de negócio e gestão de crises",
    riskPorts: [],
    riskCveKeywords: [],
    weight: 8,
  },
  "Art. 21(2)(d)": {
    title: "Segurança da cadeia de abastecimento",
    riskPorts: [],
    riskCveKeywords: ["supply-chain", "dependency"],
    weight: 8,
  },
  "Art. 21(2)(e)": {
    title: "Segurança na aquisição e desenvolvimento de sistemas",
    riskPorts: [8080, 8443, 9200, 5984, 27017], // Dev servers, Elasticsearch, CouchDB, MongoDB
    riskCveKeywords: ["injection", "xss", "rce", "deserialization", "xxe"],
    weight: 12,
  },
  "Art. 21(2)(f)": {
    title: "Políticas de avaliação de eficácia das medidas",
    riskPorts: [],
    riskCveKeywords: [],
    weight: 5,
  },
  "Art. 21(2)(g)": {
    title: "Práticas básicas de ciberhigiene e formação",
    riskPorts: [23, 21, 514, 69, 111], // Telnet, FTP, syslog, TFTP, rpcbind
    riskCveKeywords: ["default-password", "weak-auth", "no-auth", "anonymous"],
    weight: 10,
  },
  "Art. 21(2)(h)": {
    title: "Criptografia e encriptação",
    riskPorts: [80], // Plain HTTP
    riskCveKeywords: ["ssl", "tls", "weak-cipher", "heartbleed", "poodle", "rc4", "des"],
    weight: 15,
  },
  "Art. 21(2)(i)": {
    title: "Segurança dos recursos humanos e controlo de acessos",
    riskPorts: [3389, 22, 445, 5900, 5985], // RDP, SSH, SMB, VNC, WinRM
    riskCveKeywords: ["privilege-escalation", "credential", "bypass-auth", "bruteforce"],
    weight: 12,
  },
  "Art. 21(2)(j)": {
    title: "Autenticação multifator e comunicações seguras",
    riskPorts: [25, 110, 143, 587], // SMTP, POP3, IMAP (plain)
    riskCveKeywords: ["mfa", "2fa", "otp", "starttls"],
    weight: 10,
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
// Map CVE to NIS2 articles (keyword-based heuristic)
// ---------------------------------------------------------------------------

function mapCveToNIS2Articles(cveId: string, description: string): string[] {
  const desc = description.toLowerCase();
  const articles: string[] = [];

  if (/ssl|tls|cipher|encrypt|heartbleed|poodle|rc4|des/.test(desc))
    articles.push("Art. 21(2)(h)");
  if (/rdp|ssh|smb|vnc|winrm|auth|credential|privilege|bruteforce/.test(desc))
    articles.push("Art. 21(2)(i)");
  if (/inject|xss|rce|execut|deserializ|xxe/.test(desc))
    articles.push("Art. 21(2)(e)");
  if (/telnet|ftp|default.pass|weak.auth|anonymous/.test(desc))
    articles.push("Art. 21(2)(g)");
  if (/mfa|otp|two.factor|starttls/.test(desc))
    articles.push("Art. 21(2)(j)");
  if (/supply.chain|dependency|third.party/.test(desc))
    articles.push("Art. 21(2)(d)");

  if (!articles.length) articles.push("Art. 21(2)(e)"); // fallback
  return articles;
}

// ---------------------------------------------------------------------------
// Calculate NIS2 scores per article
// ---------------------------------------------------------------------------

interface ExtraDeduction {
  article: string;
  finding: string;
  deduction: number;
}

function calculateNIS2Scores(
  ports: PortFinding[],
  vulns: VulnFinding[],
  tlsIssues: TlsIssueFinding[],
  extraDeductions: ExtraDeduction[] = []
): { scores: NIS2ArticleScore[]; overall: number } {
  const openPortSet = new Set(ports.map((p) => p.port));
  const scores: NIS2ArticleScore[] = [];
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const [article, def] of Object.entries(NIS2_ARTICLE_MAP)) {
    const findings: string[] = [];
    let deduction = 0;

    // Port-based deductions
    for (const riskPort of def.riskPorts) {
      if (openPortSet.has(riskPort)) {
        const svc = ports.find((p) => p.port === riskPort);
        findings.push(
          `Porto ${riskPort} (${svc?.service ?? "unknown"}) exposto — aumenta superfície de ataque`
        );
        deduction += 15;
      }
    }

    // CVE-based deductions
    for (const vuln of vulns) {
      if (vuln.nis2Articles.includes(article)) {
        findings.push(
          `${vuln.cveId} (CVSS ${vuln.cvssScore.toFixed(1)}) — ${vuln.description}`
        );
        deduction += Math.min(vuln.cvssScore * 3, 25);
      }
    }

    // TLS issues (only Art. 21(2)(h))
    if (article === "Art. 21(2)(h)") {
      for (const tls of tlsIssues) {
        findings.push(`Porto ${tls.port}: ${tls.issue}`);
        deduction += tls.severity === "critical" ? 20 : 15;
      }
    }

    // Email security + HTTP header deductions
    for (const extra of extraDeductions) {
      if (extra.article === article) {
        findings.push(extra.finding);
        deduction += extra.deduction;
      }
    }

    const score = Math.max(0, Math.round(100 - deduction));
    scores.push({ article, title: def.title, score, findings });
    weightedTotal += score * def.weight;
    totalWeight += def.weight;
  }

  const overall = Math.round(weightedTotal / totalWeight);
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

    const allPorts = [...openPorts, ...censysPorts, ...directPorts];

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
        const nis2Unknown = ["Art. 21(2)(e)", "Art. 21(2)(f)"];
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
          // Product confirmed by NVD — version filter runs below (same path as non-banner)
        }

        // Filter by version using NVD ranges — skip CVEs that don't affect the detected version
        if (hasVersion) {
          if (nvdInfo?.hasRangeData) {
            const inRange = isVersionInNvdRanges(portFinding.version!, nvdInfo.ranges);
            if (!inRange) {
              console.log(`[CVE filter] ${cveId} — excluído (${portFinding.service} ${portFinding.version}; fora do intervalo NVD)`);
              continue;
            }
            console.log(`[CVE filter] ${cveId} — incluído (${portFinding.service} ${portFinding.version}; dentro do intervalo NVD)`);
          }
          // If hasRangeData=false: NVD returned no config → conservative include (log nothing)
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
          extraDeductions.push({ article: check.nis2Article, finding: `${check.name}: ${check.detail}`, deduction: 20 });
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
          extraDeductions.push({ article: check.nis2Article, finding: `${check.name}: ${check.detail}`, deduction: 12 });
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
        const breachNis2 = breach.hasPasswords
          ? ["Art. 21(2)(i)", "Art. 21(2)(j)"]
          : ["Art. 21(2)(i)"];
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
        extraDeductions.push({
          article: "Art. 21(2)(i)",
          finding: `Breach "${breach.name}": ${breach.dataClasses.join(", ")}`,
          deduction: breach.hasPasswords ? 20 : 8,
        });
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
            nis2Articles: ["Art. 21(2)(g)", "Art. 21(2)(j)"],
            cisControls: getCisControls(cveId, ["Art. 21(2)(g)", "Art. 21(2)(j)"]),
            iso27001Controls: getIso27001Controls(cveId, ["Art. 21(2)(g)", "Art. 21(2)(j)"]),
            nistCsfControls: getNistCsfControls(cveId, ["Art. 21(2)(g)", "Art. 21(2)(j)"]),
            remediationHint: `Investiga o compromisso que colocou o ${isIpAddress(options.target) ? "IP" : "domínio"} na lista negra ${bl.name} e solicita remoção após resolução.`,
          });
          extraDeductions.push({
            article: "Art. 21(2)(g)",
            finding: `Lista negra ${bl.name}: ${bl.detail}`,
            deduction: 20,
          });
        }
      }
    }

    // ── 8. Calculate NIS2 scores ───────────────────────────────────────────
    const { scores, overall } = calculateNIS2Scores(allPorts, vulns, tlsIssues, extraDeductions);

    // ── 9. Mark scan complete ──────────────────────────────────────────────
    await updateScanStatus(options.scanId, "completed", undefined, new Date(), {
      nis2Scores: scores,
      overallScore: overall,
      isSharedInfra,                                          // flag para UI/PDF
      vulnerabilitiesFound: vulns.length,
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
