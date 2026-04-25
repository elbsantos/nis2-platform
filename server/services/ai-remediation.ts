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
  let order = 0;

  for (const line of lines) {
    // Numbered steps: "1. ...", "2. ..."
    const stepMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (stepMatch) {
      order += 1;
      // Detect platform hints in the instruction
      const instruction = stepMatch[2];
      let platform = "all";
      if (/windows/i.test(instruction))      platform = "windows";
      else if (/linux|ubuntu|debian/i.test(instruction)) platform = "linux";
      else if (/macos|mac os/i.test(instruction)) platform = "macos";
      else if (/azure|aws|cloud/i.test(instruction))  platform = "cloud";

      steps.push({ order, instruction, platform });
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

    // First non-step paragraph = risk summary
    if (!riskSummary && line.length > 30 && !stepMatch) {
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
  orgContext: { name: string; sector?: string | null; size?: string | null }
): Promise<ParsedPlan> {
  const prompt = `Gera um plano de remediação para a seguinte vulnerabilidade detectada numa PME portuguesa:

**CVE:** ${vuln.cveId}
**Severidade:** ${vuln.severity.toUpperCase()} (CVSS ${vuln.cvssScore})
**Componente afectado:** ${vuln.affectedComponent}${vuln.port ? ` (porta ${vuln.port})` : ""}
**Descrição:** ${vuln.description}
${vuln.remediation ? `**Remediação sugerida pelo scanner:** ${vuln.remediation}` : ""}

**Contexto da organização:**
- Nome: ${orgContext.name}
- Sector: ${orgContext.sector ?? "não especificado"}
- Dimensão: ${orgContext.size ?? "PME"}

Segue rigorosamente este formato:
1. Uma ou duas frases explicando o risco concreto para esta empresa
2. Passos de correcção numerados e concretos (com comandos quando aplicável)
3. Indica "Esforço: Baixo/Médio/Alto"
4. Indica os artigos NIS2 relevantes (ex.: Art. 21(2)(e))`;

  const raw = await chat({
    system: SYSTEM_PROMPTS.remediationPlanner,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 800,
    temperature: 0.2,
  });

  return parseAIPlan(raw, `${vuln.cveId} — ${vuln.affectedComponent}`);
}

// ---------------------------------------------------------------------------
// Public: generate plans for all vulns in a scan
// ---------------------------------------------------------------------------

export async function generateRemediationForScan(
  scanId: number,
  organizationId: number
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

  const vulns = await getVulnerabilitiesByScanId(scanId);
  if (vulns.length === 0) return 0;

  const orgContext = {
    name:   org?.name ?? "Organização",
    sector: org?.sector,
    size:   org?.size,
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
