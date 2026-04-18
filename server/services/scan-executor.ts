/**
 * scan-executor.ts  —  NIS2 Agentless Scanner
 *
 * Replaces the old Nmap-based executor with Shodan + Censys API calls.
 * No root required. No binary installed. Cloud-safe.
 *
 * Dependencies to add:
 *   pnpm add shodan-client @censys/sdk
 */

import { updateScanStatus, createVulnerability } from "../db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentlessScanOptions {
  scanId: number;
  organizationId: number;
  target: string;          // domain or IP
  mode: "sme" | "supply";
  timeout?: number;
}

export interface NIS2ArticleScore {
  article: string;         // e.g. "Art. 21(2)(a)"
  title: string;           // e.g. "Políticas de segurança dos SI"
  score: number;           // 0–100
  findings: string[];      // human-readable issues contributing to score deduction
}

export interface AgentlessScanResult {
  scanId: number;
  success: boolean;
  target: string;
  openPorts: PortFinding[];
  vulnerabilities: VulnFinding[];
  nis2Scores: NIS2ArticleScore[];
  overallScore: number;    // weighted average 0–100
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
  nis2Articles: string[];  // Which NIS2 articles this vuln maps to
  remediationHint: string;
}

// ---------------------------------------------------------------------------
// NIS2 Article → CVE/port mapping table
// Based on Art. 21 NIS2 Directive (EU) 2022/2555
// ---------------------------------------------------------------------------

const NIS2_ARTICLE_MAP: Record<string, {
  title: string;
  riskPorts: number[];
  riskCveKeywords: string[];
  weight: number;          // % of overall score
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
    riskPorts: [8080, 8443, 9200, 5984],
    riskCveKeywords: ["injection", "xss", "rce", "deserialization"],
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
    riskPorts: [23, 21, 514, 69],           // Telnet, FTP, syslog, TFTP
    riskCveKeywords: ["default-password", "weak-auth", "no-auth"],
    weight: 10,
  },
  "Art. 21(2)(h)": {
    title: "Criptografia e encriptação",
    riskPorts: [80],                         // Plain HTTP
    riskCveKeywords: ["ssl", "tls", "weak-cipher", "heartbleed", "poodle"],
    weight: 15,
  },
  "Art. 21(2)(i)": {
    title: "Segurança dos recursos humanos e controlo de acessos",
    riskPorts: [3389, 22, 445, 5900],        // RDP, SSH, SMB, VNC
    riskCveKeywords: ["privilege-escalation", "credential", "bypass-auth"],
    weight: 12,
  },
  "Art. 21(2)(j)": {
    title: "Autenticação multifator e comunicações seguras",
    riskPorts: [25, 110, 143],               // SMTP, POP3, IMAP plain
    riskCveKeywords: ["mfa", "2fa", "otp"],
    weight: 10,
  },
};

// ---------------------------------------------------------------------------
// Ownership verification
// ---------------------------------------------------------------------------

export async function verifyDomainOwnership(
  domain: string,
  orgId: number
): Promise<boolean> {
  // Check for DNS TXT record: nis2pt-verify=<orgId>
  // In production, use a real DNS lookup library (dns.promises.resolveTxt)
  const { resolveTxt } = await import("dns/promises");
  try {
    const records = await resolveTxt(domain);
    const token = `nis2pt-verify=${orgId}`;
    return records.flat().some((r) => r === token);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Score calculator
// ---------------------------------------------------------------------------

function calculateNIS2Scores(
  ports: PortFinding[],
  vulns: VulnFinding[]
): { scores: NIS2ArticleScore[]; overall: number } {
  const openPortNumbers = new Set(ports.map((p) => p.port));
  const cvssTotal = vulns.reduce((s, v) => s + v.cvssScore, 0);
  const scores: NIS2ArticleScore[] = [];
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const [article, def] of Object.entries(NIS2_ARTICLE_MAP)) {
    const findings: string[] = [];
    let deduction = 0;

    // Port-based deductions
    for (const riskPort of def.riskPorts) {
      if (openPortNumbers.has(riskPort)) {
        const svc = ports.find((p) => p.port === riskPort);
        findings.push(
          `Porto ${riskPort} (${svc?.service ?? "unknown"}) exposto — aumenta superfície de ataque`
        );
        deduction += 15;
      }
    }

    // CVE keyword-based deductions
    for (const vuln of vulns) {
      const matchesArticle = vuln.nis2Articles.includes(article);
      if (matchesArticle) {
        findings.push(
          `${vuln.cveId} (CVSS ${vuln.cvssScore.toFixed(1)}) — ${vuln.description}`
        );
        deduction += Math.min(vuln.cvssScore * 3, 25);
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
// Map CVE to NIS2 articles (simplified keyword matching)
// ---------------------------------------------------------------------------

function mapCveToNIS2Articles(cveId: string, description: string): string[] {
  const desc = description.toLowerCase();
  const articles: string[] = [];

  if (/ssl|tls|cipher|encrypt|heartbleed|poodle/.test(desc))
    articles.push("Art. 21(2)(h)");
  if (/rdp|ssh|smb|vnc|auth|credential|privilege/.test(desc))
    articles.push("Art. 21(2)(i)");
  if (/inject|xss|rce|execut|deserializ/.test(desc))
    articles.push("Art. 21(2)(e)");
  if (/telnet|ftp|default.pass|weak.auth/.test(desc))
    articles.push("Art. 21(2)(g)");
  if (/mfa|otp|two.factor/.test(desc))
    articles.push("Art. 21(2)(j)");
  if (!articles.length) articles.push("Art. 21(2)(e)"); // fallback

  return articles;
}

// ---------------------------------------------------------------------------
// Main executor — replaces executeScanWithAnalysis (Nmap)
// ---------------------------------------------------------------------------

export async function executeAgentlessScan(
  options: AgentlessScanOptions
): Promise<AgentlessScanResult> {
  const startTime = Date.now();

  try {
    await updateScanStatus(options.scanId, "running", new Date());

    // ----- 1. Shodan lookup -----------------------------------------------
    // Dynamically imported to allow mocking in tests
    const { lookupHost } = await import("../integrations/shodan");
    const shodanData = await lookupHost(options.target);

    const openPorts: PortFinding[] = (shodanData?.ports ?? []).map((p: any) => ({
      port: p.port,
      protocol: (p.transport ?? "tcp") as "tcp" | "udp",
      service: p.product ?? p._shodan?.module ?? "unknown",
      product: p.product,
      version: p.version,
      cves: Object.keys(p.vulns ?? {}),
    }));

    // ----- 2. Censys lookup (TLS / certificates) --------------------------
    const { lookupHost: censysLookup } = await import("../integrations/censys");
    const censysData = await censysLookup(options.target);

    // Add TLS issues as additional port findings if not already in Shodan
    const censysPorts: PortFinding[] =
      censysData?.services
        ?.filter(
          (svc: any) =>
            !openPorts.some((p) => p.port === svc.port)
        )
        .map((svc: any) => ({
          port: svc.port,
          protocol: "tcp" as const,
          service: svc.service_name ?? "unknown",
          cves: [],
        })) ?? [];

    const allPorts = [...openPorts, ...censysPorts];

    // ----- 3. Build vulnerability list ------------------------------------
    const vulns: VulnFinding[] = [];

    for (const portFinding of openPorts) {
      for (const cveId of portFinding.cves) {
        const severity = (cvssScore: number) =>
          cvssScore >= 9
            ? "critical"
            : cvssScore >= 7
            ? "high"
            : cvssScore >= 4
            ? "medium"
            : "low";

        // Shodan embeds CVSS in vuln data
        const shodanPort = shodanData?.ports?.find(
          (p: any) => p.port === portFinding.port
        );
        const cvssScore: number =
          shodanPort?.vulns?.[cveId]?.cvss ?? 5.0;

        const description =
          shodanPort?.vulns?.[cveId]?.summary ??
          `Vulnerabilidade ${cveId} no porto ${portFinding.port}`;

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

        // Persist to DB
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
        }).catch((err) =>
          console.error(`[Scanner] Failed to persist vuln ${cveId}:`, err)
        );
      }
    }

    // ----- 4. Deduct points for plain HTTP --------------------------------
    const hasHttp = allPorts.some((p) => p.port === 80);
    const hasHttps = allPorts.some((p) => p.port === 443);
    if (hasHttp && !hasHttps) {
      vulns.push({
        cveId: "NIS2-TLS-001",
        cvssScore: 7.5,
        severity: "high",
        description: "Serviço HTTP sem HTTPS disponível — dados transmitidos em claro",
        affectedService: "http",
        nis2Articles: ["Art. 21(2)(h)"],
        remediationHint:
          "Instala um certificado TLS (Let's Encrypt é gratuito) e redireciona HTTP → HTTPS.",
      });
    }

    // ----- 5. Calculate NIS2 scores ---------------------------------------
    const { scores, overall } = calculateNIS2Scores(allPorts, vulns);

    // ----- 6. Mark scan complete ------------------------------------------
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
      nis2Scores: scores,
      overallScore: overall,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Scanner] Scan ${options.scanId} failed:`, message);

    await updateScanStatus(options.scanId, "failed", undefined, new Date())
      .catch(() => {});

    return {
      scanId: options.scanId,
      success: false,
      target: options.target,
      openPorts: [],
      vulnerabilities: [],
      nis2Scores: [],
      overallScore: 0,
      error: message,
      durationMs: Date.now() - startTime,
    };
  }
}
