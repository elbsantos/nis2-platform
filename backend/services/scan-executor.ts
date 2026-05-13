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

export async function verifyOwnership(
  target: string,
  orgId: number
): Promise<{ verified: boolean; method?: string }> {
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

    // ── 2. Shodan + Censys + Direct TLS (parallel) ─────────────────────────
    const [shodanData, censysData, directTls] = await Promise.all([
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
    ]);

    // ── 3. Merge port findings ─────────────────────────────────────────────
    const openPorts: PortFinding[] =
      shodanData?.ports?.map((p) => ({
        port: p.port,
        protocol: (p.transport ?? "tcp") as "tcp" | "udp",
        service: p.product ?? p._shodan?.module ?? "unknown",
        product: p.product,
        version: p.version,
        cves: Object.keys(p.vulns ?? {}),
      })) ?? [];

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
          cisControls: getCisControls(cveId, nis2Articles, description),
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
        cisControls: getCisControls("NIS2-TLS-001", ["Art. 21(2)(h)"]),
        remediationHint: "Instala certificado TLS (Let's Encrypt gratuito) e redireciona HTTP → HTTPS.",
      });
    }

    // ── 6. Email security + HTTP headers (parallel, domain-only for email) ─
    const [emailSecurity, httpHeaders] = await Promise.all([
      isDomain
        ? import("../integrations/email-security").then((m) =>
            m.checkEmailSecurity(options.target).catch(() => null)
          )
        : Promise.resolve(null),
      import("../integrations/http-headers").then((m) =>
        m.checkHttpHeaders(options.target).catch(() => null)
      ),
    ]);

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
            cisControls: check.cisControls ?? getCisControls(cveId, [check.nis2Article]),
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
            cisControls: check.cisControls ?? getCisControls(cveId, [check.nis2Article]),
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
          cisControls: getCisControls(cveId, breachNis2),
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
