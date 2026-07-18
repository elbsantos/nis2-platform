/**
 * backend/services/document-generator.ts
 *
 * Geração de documentos NIS2 auto-preenchidos.
 * C14b: infra (templates, CONTENT_TYPES, requireTemplate).
 * C15: Registo de Riscos — agregação + riskSummary da biblioteca.
 * C16: Inventário de Ativos (pendente).
 * C17: PSI (pendente).
 *
 * Templates em backend/assets/templates/ (copiados pelo build step).
 */

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import {
  getScanById,
  getOrganizationById,
  getVulnerabilitiesByScanId,
} from "../db";
import { lookupLibrary } from "./ai-remediation";

// ---------------------------------------------------------------------------
// Caminhos e constantes
// ---------------------------------------------------------------------------

export const TEMPLATE_DIR = path.join(__dirname, "..", "assets", "templates");

export const TEMPLATE_PATHS = {
  registoRiscos:    path.join(TEMPLATE_DIR, "registo-riscos.xlsx"),
  inventarioAtivos: path.join(TEMPLATE_DIR, "inventario-ativos.xlsx"),
  psi:              path.join(TEMPLATE_DIR, "psi-template.docx"),
} as const;

export const CONTENT_TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

// ---------------------------------------------------------------------------
// Guard de template
// ---------------------------------------------------------------------------

function requireTemplate(templatePath: string): void {
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `[Documentos] Template não encontrado: ${path.basename(templatePath)}. ` +
      `Coloque o ficheiro em backend/assets/templates/.`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_PT: Record<string, string>    = { critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" };
const SEVERITY_PROB: Record<string, number>  = { critical: 5, high: 4, medium: 3, low: 2 };

// ---------------------------------------------------------------------------
// C15 — Registo de Riscos
// ---------------------------------------------------------------------------

const MAX_RISK_ROWS = 30;

export interface RiskGroup {
  affectedComponent: string;
  severity: string;
  maxCvss: number;
  bestCveId: string;
  prob: number;
  impact: number;
  vulnCount: number;
}

type RawVuln = {
  cveId?: string | null;
  severity?: string | null;
  cvssScore?: string | number | null;
  description?: string | null;
  affectedComponent?: string | null;
};

/**
 * Agrupa vulnerabilidades por (affectedComponent, severity), ordena por
 * severidade decrescente e, dentro do mesmo nível, por CVSS máximo.
 * Exportado para testes unitários sem dependências de I/O.
 */
export function aggregateRiskGroups(
  vulns: RawVuln[],
  maxRows = MAX_RISK_ROWS
): { rows: RiskGroup[]; overflow: number } {
  const eligible = vulns.filter((v) => v.cveId?.trim() && v.description?.trim());

  const groups = new Map<string, { affectedComponent: string; severity: string; vulns: RawVuln[] }>();
  for (const v of eligible) {
    const comp = v.affectedComponent?.trim() || "Componente desconhecido";
    const sev  = (v.severity ?? "low").toLowerCase();
    const key  = `${comp}||${sev}`;
    if (!groups.has(key)) groups.set(key, { affectedComponent: comp, severity: sev, vulns: [] });
    groups.get(key)!.vulns.push(v);
  }

  const sorted = [...groups.values()].sort((a, b) => {
    const diff = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
    if (diff !== 0) return diff;
    const maxA = Math.max(...a.vulns.map((v) => Number(v.cvssScore ?? 0)));
    const maxB = Math.max(...b.vulns.map((v) => Number(v.cvssScore ?? 0)));
    return maxB - maxA;
  });

  const overflow = Math.max(0, sorted.length - maxRows);
  const rows = sorted.slice(0, maxRows).map((g) => {
    const maxCvss = Math.max(...g.vulns.map((v) => Number(v.cvssScore ?? 0)));
    const bestVuln = [...g.vulns].sort(
      (a, b) => Number(b.cvssScore ?? 0) - Number(a.cvssScore ?? 0)
    )[0];
    return {
      affectedComponent: g.affectedComponent,
      severity:          g.severity,
      maxCvss,
      bestCveId:  bestVuln?.cveId ?? "",
      prob:       SEVERITY_PROB[g.severity] ?? 2,
      impact:     Math.min(5, Math.max(1, Math.ceil(maxCvss / 2))),
      vulnCount:  g.vulns.length,
    };
  });

  return { rows, overflow };
}

export async function generateRegistoRiscos(scanId: number, orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.registoRiscos);

  const [scan, org, tableVulns] = await Promise.all([
    getScanById(scanId),
    getOrganizationById(orgId),
    getVulnerabilitiesByScanId(scanId),
  ]);

  if (!scan || !org) throw new Error("[Documentos] Scan ou organização não encontrados");

  const rawVulns: RawVuln[] = tableVulns.length > 0
    ? tableVulns
    : ((scan.results as any)?.vulnerabilities ?? []);

  const { rows: dataRows, overflow } = aggregateRiskGroups(rawVulns);

  // Load workbook
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATHS.registoRiscos);
  const sheet = wb.getWorksheet("🎯 REGISTO DE RISCOS");
  if (!sheet) throw new Error('[Documentos] Folha "🎯 REGISTO DE RISCOS" não encontrada no template');

  // Header cells (merged — write to master cell)
  sheet.getCell("B3").value = `Empresa: ${org.name}`;
  sheet.getCell("G3").value =
    `Scan #${scanId} de ${formatDate(scan.createdAt)} — Gerado automaticamente`;

  // Fill data rows
  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = 8 + i;
    const group  = dataRows[i];

    const lib = group.bestCveId
      ? await lookupLibrary(group.bestCveId, "generic")
      : null;

    const riskDesc = (lib as any)?.riskSummary
      ?? `[Vulnerabilidade ${group.bestCveId || "CVE"} detetada — ver relatório técnico]`;

    const steps: Array<{ order: number; instruction: string }> =
      (lib as any)?.steps ?? [];
    const firstStep = steps.sort((a, b) => a.order - b.order)[0]?.instruction ?? "";
    const treatment = firstStep
      ? `${firstStep} — plano completo na plataforma`
      : "[Gerar plano de remediação IA na plataforma]";

    const row = sheet.getRow(rowNum);
    // B (col 2): ID — manter R0x pré-definido no template (não sobrescrever)
    row.getCell(3).value  = riskDesc;                                      // C: Ameaça / Risco
    row.getCell(4).value  = group.affectedComponent;                       // D: Ativo(s) Afetado(s)
    row.getCell(5).value  = SEVERITY_PT[group.severity] ?? group.severity; // E: Categoria
    row.getCell(6).value  = group.prob;                                    // F: Prob.
    row.getCell(7).value  = group.impact;                                  // G: Impacto
    // H (col 8) e I (col 9): fórmulas do template — NÃO TOCAR
    row.getCell(10).value = treatment;                                     // J: Medida de Tratamento
    // K (col 11): Responsável — deixar vazio
    // L (col 12): Estado — deixar vazio (dropdown do cliente)
    row.getCell(13).value = `Scan #${scanId}`;                             // M: Origem
    row.commit();
  }

  // Linha de excedente se > 30 grupos
  if (overflow > 0) {
    const overRow = sheet.getRow(8 + MAX_RISK_ROWS);
    overRow.getCell(3).value =
      `(+ ${overflow} ${overflow === 1 ? "grupo adicional" : "grupos adicionais"} omitidos — consulte o relatório completo)`;
    overRow.getCell(13).value = `Scan #${scanId}`;
    overRow.commit();
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generateInventarioAtivos(scanId: number, orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.inventarioAtivos);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATHS.inventarioAtivos);
  // C16: mapeamento de openPorts + resolvedIp, linhas 6-23
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generatePsi(orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.psi);
  const content = fs.readFileSync(TEMPLATE_PATHS.psi);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  // C17: preenchimento de tags empresa, nif, versao, datas, ciso_nome, etc.
  doc.render({});
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}
