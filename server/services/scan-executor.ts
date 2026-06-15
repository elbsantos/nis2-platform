/**
 * server/services/scan-executor.ts
 *
 * NIS2 Agentless Scanner Service — v3 (week 3)
 * Integrates Shodan + Censys + ownership verification + NIS2 scoring.
 */

import type { ShodanHostResult } from "../integrations/shodan";
import type { CensysHostResult } from "../integrations/censys";

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
// Domain ownership verification via DNS TXT
// ---------------------------------------------------------------------------

export async function verifyDomainOwnership(
  domain: string,
  orgId: number
): Promise<{ verified: boolean; method?: string }> {
  const { resolveTxt } = await import("dns/promises");
  const token = `nis2pt-verify=${orgId}`;

  try {
    const records = await resolveTxt(domain);
    const flat = records.flat();
    if (flat.some((r) => r === token)) {
      return { verified: true, method: "dns-txt" };
    }
  } catch {}

  // Future: could add .well-known/nis2pt.txt file check here
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

function calculateNIS2Scores(
  ports: PortFinding[],
  vulns: VulnFinding[],
  tlsIssues: TlsIssueFinding[]
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

    const score = Math.max(0, Math.round(100 - deduction));
    scores.push({ article, title: def.title, score, findings });
    weightedTotal += score * def.weight;
    totalWeight += def.weight;
  }

  const overall = Math.round(weightedTotal / totalWeight);
  return { scores, overall };
}

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

    // ── 1. Verify domain ownership ────────────────────────────────────────
    const ownership = await verifyDomainOwnership(options.target, options.organizationId);
    if (!ownership.verified) {
      throw new Error(
        `Verificação de ownership falhou. Adiciona o DNS TXT: nis2pt-verify=${options.organizationId}`
      );
    }

    // ── 2. Shodan lookup ───────────────────────────────────────────────────
    const { lookupHost: shodanLookup } = await import("../integrations/shodan");
    const shodanData: ShodanHostResult | null = await shodanLookup(options.target);

    const openPorts: PortFinding[] =
      shodanData?.ports?.map((p) => ({
        port: p.port,
        protocol: (p.transport ?? "tcp") as "tcp" | "udp",
        service: p.product ?? p._shodan?.module ?? "unknown",
        product: p.product,
        version: p.version,
        cves: Object.keys(p.vulns ?? {}),
      })) ?? [];

    // ── 3. Censys lookup (TLS analysis) ────────────────────────────────────
    const { lookupHost: censysLookup } = await import("../integrations/censys");
    const censysData: CensysHostResult | null = await censysLookup(options.target);

    const tlsIssues: TlsIssueFinding[] = censysData?.tlsIssues ?? [];

    // Add Censys services not in Shodan
    const censysPorts: PortFinding[] =
      censysData?.services
        ?.filter((svc) => !openPorts.some((p) => p.port === svc.port))
        .map((svc) => ({
          port: svc.port,
          protocol: "tcp" as const,
          service: svc.service_name ?? "unknown",
          cves: [],
        })) ?? [];

    const allPorts = [...openPorts, ...censysPorts];

    // ── 4. Build vulnerability list ────────────────────────────────────────
    const vulns: VulnFinding[] = [];
    const { createVulnerability } = await import("../db");

    for (const portFinding of openPorts) {
      for (const cveId of portFinding.cves) {
        const shodanPort = shodanData?.ports?.find((p) => p.port === portFinding.port);
        const cvssScore: number = shodanPort?.vulns?.[cveId]?.cvss ?? 5.0;
        const description =
          shodanPort?.vulns?.[cveId]?.summary ??
          `Vulnerabilidade ${cveId} no porto ${portFinding.port}`;

        const severity = (s: number) =>
          s >= 9 ? "critical" : s >= 7 ? "high" : s >= 4 ? "medium" : "low";

        const nis2Articles = mapCveToNIS2Articles(cveId, description);

        const vuln: VulnFinding = {
          cveId,
          cvssScore,
          severity: severity(cvssScore) as VulnFinding["severity"],
          description,
          affectedService: portFinding.service,
          nis2Articles,
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
      vulns.push({
        cveId: "NIS2-TLS-001",
        cvssScore: 7.5,
        severity: "high",
        description: "Serviço HTTP sem HTTPS — dados transmitidos em claro",
        affectedService: "http",
        nis2Articles: ["Art. 21(2)(h)"],
        remediationHint: "Instala certificado TLS (Let's Encrypt gratuito) e redireciona HTTP → HTTPS.",
      });
    }

    // ── 6. Calculate NIS2 scores ───────────────────────────────────────────
    const { scores, overall } = calculateNIS2Scores(allPorts, vulns, tlsIssues);

    // ── 7. Mark scan complete ──────────────────────────────────────────────
    await updateScanStatus(options.scanId, "completed", undefined, new Date(), {
      vulnerabilitiesFound: vulns.length,
      criticalCount: vulns.filter((v) => v.severity === "critical").length,
      highCount: vulns.filter((v) => v.severity === "high").length,
      mediumCount: vulns.filter((v) => v.severity === "medium").length,
      lowCount: vulns.filter((v) => v.severity === "low").length,
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
