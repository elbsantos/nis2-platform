/**
 * server/services/ai-remediation.ts
 *
 * Generates structured remediation plans via Claude AI for each vulnerability
 * found in a NIS2 scan. Persists the results in remediation_items.
 */

import { chat, SYSTEM_PROMPTS } from "../integrations/anthropic";
import {
  getVulnerabilitiesByScanId,
  getScanById,
  getOrganizationById,
  createRemediationItem,
  getRemediationItemsByScanId,
} from "../db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RemediationStep {
  order: number;
  instruction: string;
  platform: string;
}

interface ParsedPlan {
  title: string;
  riskSummary: string;
  steps: RemediationStep[];
  effort: "low" | "medium" | "high";
  nis2Articles: string[];
}

// ---------------------------------------------------------------------------
// AI plan parser
// ---------------------------------------------------------------------------

function parseAIPlan(raw: string, vulnTitle: string): ParsedPlan {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  const steps: RemediationStep[] = [];
  const nis2Articles: string[] = [];
  let riskSummary = "";
  let effortRaw = "medium";
  let globalOrder = 0;
  let currentPlatform = "all";

  for (const line of lines) {
    // OS section headers: ### Windows, ### Linux / Ubuntu / Debian, etc.
    if (/^#{1,3}\s*windows/i.test(line)) {
      currentPlatform = "windows";
      continue;
    }
    if (/^#{1,3}\s*(linux|ubuntu|debian)/i.test(line)) {
      currentPlatform = "linux";
      continue;
    }
    if (/^#{1,3}\s*(macos|mac\s*os)/i.test(line)) {
      currentPlatform = "macos";
      continue;
    }
    if (/^#{1,3}\s*(azure|aws|cloud)/i.test(line)) {
      currentPlatform = "cloud";
      continue;
    }
    if (/^#{1,3}\s*(todos|all|geral)/i.test(line)) {
      currentPlatform = "all";
      continue;
    }

    // Numbered steps: "1. ...", "2. ..."
    const stepMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (stepMatch) {
      globalOrder += 1;
      const instruction = stepMatch[2];

      // If not inside an OS section, try to infer from instruction text
      let platform = currentPlatform;
      if (platform === "all") {
        if (/windows/i.test(instruction))                          platform = "windows";
        else if (/linux|ubuntu|debian|apt\s|apt-get/i.test(instruction)) platform = "linux";
        else if (/macos|mac\s*os/i.test(instruction))             platform = "macos";
        else if (/azure|aws|cloud/i.test(instruction))            platform = "cloud";
      }

      steps.push({ order: globalOrder, instruction, platform });
      continue;
    }

    // Effort line
    if (/esfor[cç]o[:\s]*(baixo|médio|medio|alto)/i.test(line)) {
      const m = line.match(/baixo|médio|medio|alto/i);
      if (m) {
        const v = m[0].toLowerCase();
        effortRaw = v === "baixo" ? "low" : v.startsWith("m") ? "medium" : "high";
      }
      continue;
    }

    // NIS2 articles
    const artMatch = line.match(/art\.\s*21\(2\)\([a-j]\)/gi);
    if (artMatch) {
      nis2Articles.push(...artMatch.map((a) => a.trim()));
      continue;
    }

    // First substantial non-step line = risk summary
    if (!riskSummary && line.length > 30) {
      riskSummary = line;
    }
  }

  return {
    title: vulnTitle,
    riskSummary: riskSummary || "Vulnerabilidade requer correção urgente.",
    steps: steps.length > 0
      ? steps
      : [{ order: 1, instruction: "Consultar o aviso original do fabricante e aplicar o patch disponível.", platform: "all" }],
    effort: effortRaw as "low" | "medium" | "high",
    nis2Articles: nis2Articles.length > 0 ? nis2Articles : ["Art. 21(2)(e)"],
  };
}

// ---------------------------------------------------------------------------
// Single vulnerability plan
// ---------------------------------------------------------------------------

async function generatePlanForVuln(
  vuln: {
    id: number;
    cveId: string;
    severity: string;
    cvssScore: string;
    description: string;
    affectedComponent: string;
    port?: number | null;
    remediation?: string | null;
  },
  orgContext: { name: string; sector?: string | null; size?: string | null; orgId?: number; plan?: string }
): Promise<ParsedPlan> {
  const prompt = `Gera um plano de remediação para a seguinte vulnerabilidade detetada numa PME portuguesa:

**CVE:** ${vuln.cveId}
**Severidade:** ${vuln.severity.toUpperCase()} (CVSS ${vuln.cvssScore})
**Componente afetado:** ${vuln.affectedComponent}${vuln.port ? ` (porta ${vuln.port})` : ""}
**Descrição:** ${vuln.description}
${vuln.remediation ? `**Remediação sugerida pelo scanner:** ${vuln.remediation}` : ""}

**Contexto da organização:**
- Nome: ${orgContext.name}
- Sector: ${orgContext.sector ?? "não especificado"}
- Dimensão: ${orgContext.size ?? "PME"}

Segue rigorosamente este formato:
1. Uma ou duas frases explicando o risco concreto para esta empresa
2. Passos de correção separados por SO (usa ### Windows e ### Linux / Ubuntu / Debian quando os passos diferem — máx. 6 por SO, sem repetições entre secções)
3. Indica "Esforço: Baixo/Médio/Alto"
4. Indica os artigos NIS2 relevantes (ex.: Art. 21(2)(e))

IMPORTANTE: Completa sempre cada frase. Não cortes passos a meio.`;

  const raw = await chat({
    system:      SYSTEM_PROMPTS.remediationPlanner,
    messages:    [{ role: "user", content: prompt }],
    maxTokens:   1500,
    temperature: 0.2,
    orgId:       orgContext.orgId,
    plan:        orgContext.plan,
  });

  return parseAIPlan(raw, `${vuln.cveId} — ${vuln.affectedComponent}`);
}

// ---------------------------------------------------------------------------
// Public: generate plans for all vulns in a scan
// ---------------------------------------------------------------------------

export async function generateRemediationForScan(
  scanId: number,
  organizationId: number,
  plan?: string
): Promise<number> {
  const [scan, org] = await Promise.all([
    getScanById(scanId),
    getOrganizationById(organizationId),
  ]);

  if (!scan) throw new Error(`Scan ${scanId} não encontrado`);
  if (scan.organizationId !== organizationId) {
    throw new Error("Sem permissão para aceder a este scan");
  }

  // Skip if plans already exist for this scan
  const existing = await getRemediationItemsByScanId(scanId);
  if (existing.length > 0) return existing.length;

  // Try vulnerabilities table first; fall back to scan.results JSON for synthetic vulns
  // (email/HTTP/TLS/dark-web findings are stored only in scan.results, not in the table)
  const tableVulns = await getVulnerabilitiesByScanId(scanId);
  const vulns: Array<{
    id: number;
    cveId: string;
    severity: string;
    cvssScore: string;
    description: string;
    affectedComponent: string;
    port?: number | null;
    remediation?: string | null;
  }> = tableVulns.length > 0
    ? tableVulns
    : ((scan.results as any)?.vulnerabilities ?? []).map((v: any, i: number) => ({
        id: -(i + 1),
        cveId:             v.cveId,
        severity:          v.severity,
        cvssScore:         String(v.cvssScore ?? 5),
        description:       v.description,
        affectedComponent: v.affectedService ?? "unknown",
        port:              null,
        remediation:       v.remediationHint ?? null,
      }));

  if (vulns.length === 0) return 0;

  const orgContext = {
    name:   org?.name ?? "Organização",
    sector: org?.sector,
    size:   org?.size,
    orgId:  organizationId,
    plan,
  };

  // Process sequentially to avoid rate limiting
  let created = 0;
  for (const vuln of vulns) {
    try {
      const plan = await generatePlanForVuln(vuln, orgContext);
      await createRemediationItem({
        organizationId,
        scanId,
        vulnId:      vuln.id,
        title:       plan.title,
        steps:       plan.steps,
        effort:      plan.effort,
        nis2Articles: plan.nis2Articles,
      });
      created += 1;
    } catch (err) {
      console.error(`[Remediation] Failed for ${vuln.cveId}:`, err);
    }
  }

  return created;
}
