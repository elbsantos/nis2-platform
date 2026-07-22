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
  getFrameworkAssessmentById,
} from "../db";
import { lookupLibrary } from "./ai-remediation";
import { evaluateTree, NIS2_PT_TREE } from "../utils/decision-engine";

// ---------------------------------------------------------------------------
// Caminhos e constantes
// ---------------------------------------------------------------------------

export const TEMPLATE_DIR = path.join(__dirname, "..", "assets", "templates");

export const TEMPLATE_PATHS = {
  registoRiscos:    path.join(TEMPLATE_DIR, "registo-riscos.xlsx"),
  inventarioAtivos: path.join(TEMPLATE_DIR, "inventario-ativos.xlsx"),
  psi:              path.join(TEMPLATE_DIR, "psi-template.docx"),
  enquadramento:    path.join(TEMPLATE_DIR, "enquadramento-template.docx"),
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
const EFFORT_PT: Record<string, string>      = { low: "baixo", medium: "médio", high: "alto" };

/** Guarda contra nulos/strings espúrias nas células Excel. */
function cell(value: string | null | undefined, placeholder = ""): string {
  if (value === null || value === undefined) return placeholder;
  const s = String(value).trim();
  if (s === "" || s === "None" || s === "null" || s === "undefined") return placeholder;
  return s;
}

/** Resumo legível de CVEs para o Inventário de Ativos (coluna H). */
function summarizeCves(cves: string[]): string {
  if (cves.length === 0) return "—";
  if (cves.length <= 3) return cves.join(", ");
  return `${cves.length} CVEs conhecidos — ver Registo de Riscos e relatório técnico`;
}

/**
 * Remove o resultado em cache de todas as células de fórmula do workbook.
 * Sem <v> no XML, o Excel é obrigado a recalcular ao abrir — mais fiável do
 * que fullCalcOnLoad sozinho quando os caches do template contêm zeros.
 */
function clearFormulaCache(wb: ExcelJS.Workbook): void {
  wb.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value as ExcelJS.CellValue;
        if (v !== null && typeof v === "object" && "formula" in (v as object)) {
          cell.value = { formula: (v as ExcelJS.CellFormulaValue).formula } as ExcelJS.CellFormulaValue;
        }
      });
    });
  });
}

/**
 * Pré-calcula e escreve o result das fórmulas COUNTIF/COUNTIFS do Painel de
 * Controlo com base nos grupos de risco já escritos. Necessário porque essas
 * fórmulas referenciam outro sheet e não são recalculadas em Modo Protegido.
 * A fórmula original é preservada no XML para edição futura.
 */
export function preFillPainel(
  wb: ExcelJS.Workbook,
  total: number,
  critico: number,
  alto: number,
  medio: number,
  baixo: number,
): void {
  const painelSheet = wb.getWorksheet("📈 PAINEL DE CONTROLO");
  if (!painelSheet) return;

  const fill = (addr: string, result: number) => {
    const c = painelSheet.getCell(addr);
    const v = c.value as ExcelJS.CellValue;
    if (v !== null && typeof v === "object" && "formula" in (v as object)) {
      c.value = { formula: (v as ExcelJS.CellFormulaValue).formula, result } as ExcelJS.CellFormulaValue;
    }
  };

  fill("C5",  total);    // Total de Riscos — COUNTA(C8:C40)
  fill("C6",  critico);  // Crítico  — Nível >= 17
  fill("C7",  alto);     // Alto     — 10 <= Nível < 17
  fill("C8",  medio);    // Médio    — 5 <= Nível < 10
  fill("C9",  baixo);    // Baixo    — 1 <= Nível < 5
  fill("C12", 0);        // Em curso       — coluna L começa vazia
  fill("C13", 0);        // Concluído      — coluna L começa vazia
  fill("C14", 0);        // Transferir     — coluna L começa vazia
}

// ---------------------------------------------------------------------------
// C15 — Registo de Riscos
// ---------------------------------------------------------------------------

const MAX_RISK_ROWS  = 30;
const MAX_ASSET_ROWS = 18;

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

type RawPort = {
  port: number;
  protocol?: string;
  service?: string;
  product?: string;
  version?: string;
  cves?: string[];
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
  wb.calcProperties.fullCalcOnLoad = true;
  const sheet = wb.getWorksheet("🎯 REGISTO DE RISCOS");
  if (!sheet) throw new Error('[Documentos] Folha "🎯 REGISTO DE RISCOS" não encontrada no template');

  // Header cells (merged — write to master cell)
  sheet.getCell("B3").value = `Empresa: ${org.name}`;
  sheet.getCell("G3").value =
    `Scan #${scanId} de ${formatDate(scan.createdAt)} — Gerado automaticamente`;

  // Contadores para pré-preenchimento do Painel de Controlo
  let cntCritico = 0, cntAlto = 0, cntMedio = 0, cntBaixo = 0;

  // Fill data rows
  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = 8 + i;
    const group  = dataRows[i];

    // Acumular contagens por Nível de Risco (= Prob × Impacto)
    const nivel = group.prob * group.impact;
    if      (nivel >= 17) cntCritico++;
    else if (nivel >= 10) cntAlto++;
    else if (nivel >= 5)  cntMedio++;
    else if (nivel > 0)   cntBaixo++;

    const lib = group.bestCveId
      ? await lookupLibrary(group.bestCveId, "generic")
      : null;

    const riskDesc = cell(
      (lib as any)?.riskSummary,
      `[Vulnerabilidade ${group.bestCveId || "CVE"} detetada — ver relatório técnico]`
    );

    const effort   = (lib as any)?.effort as string | undefined;
    const effortPT = effort ? (EFFORT_PT[effort] ?? effort) : null;
    const treatment = lib
      ? `Aplicar o plano de remediação IA disponível na plataforma ` +
        `(correção/atualização de ${group.affectedComponent}). ` +
        `Esforço estimado: ${effortPT ?? "indeterminado"}.`
      : `Gerar o plano de remediação IA na plataforma para este componente.`;

    const row = sheet.getRow(rowNum);
    // B (col 2): ID — manter R0x pré-definido no template (não sobrescrever)
    row.getCell(3).value  = riskDesc;                                             // C: Ameaça / Risco
    row.getCell(4).value  = cell(group.affectedComponent, "Componente desconhecido"); // D: Ativo(s) Afetado(s)
    row.getCell(5).value  = cell(SEVERITY_PT[group.severity] ?? group.severity);  // E: Categoria
    row.getCell(6).value  = group.prob;                                            // F: Prob.
    row.getCell(7).value  = group.impact;                                          // G: Impacto
    // H (col 8) e I (col 9): fórmulas do template — NÃO TOCAR
    row.getCell(10).value = cell(treatment, "Gerar o plano de remediação IA na plataforma para este componente."); // J: Medida de Tratamento
    row.getCell(11).value = null;                                                   // K: Responsável — explicitamente vazio
    row.getCell(12).value = null;                                                   // L: Estado — explicitamente vazio
    row.getCell(13).value = `Scan #${scanId}`;                                     // M: Origem
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

  clearFormulaCache(wb);
  preFillPainel(wb, dataRows.length, cntCritico, cntAlto, cntMedio, cntBaixo);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generateInventarioAtivos(scanId: number, orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.inventarioAtivos);

  const [scan, org] = await Promise.all([
    getScanById(scanId),
    getOrganizationById(orgId),
  ]);
  if (!scan || !org) throw new Error("[Documentos] Scan ou organização não encontrados");

  const results    = (scan.results as any) ?? {};
  const resolvedIp = typeof results.resolvedIp === "string" ? results.resolvedIp : "";
  const rawPorts: RawPort[] = Array.isArray(results.openPorts) ? results.openPorts : [];

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATHS.inventarioAtivos);
  wb.calcProperties.fullCalcOnLoad = true;
  const sheet = wb.getWorksheet("🌐 SUPERFÍCIE EXTERNA");
  if (!sheet) throw new Error('[Documentos] Folha "🌐 SUPERFÍCIE EXTERNA" não encontrada no template');

  sheet.getCell("B3").value = `Empresa: ${org.name}`;
  sheet.getCell("F3").value =
    `Origem: Scan CISPLAN #${scanId} de ${formatDate(scan.createdAt)} | Preenchido automaticamente — rever`;

  const keyAssets: string[] =
    Array.isArray(org.keyAssets) && org.keyAssets.length > 0 ? org.keyAssets : [];

  const ports = rawPorts.slice(0, MAX_ASSET_ROWS);
  for (let i = 0; i < ports.length; i++) {
    const rowNum = 6 + i;
    const p = ports[i];
    const banner      = [p.product, p.version].filter(Boolean).join(" ");
    const cvesSummary = summarizeCves(p.cves ?? []);
    const obs         = i === 0 && keyAssets.length > 0
      ? `Ativos-chave: ${keyAssets.join(", ")}`
      : null;

    const row = sheet.getRow(rowNum);
    // B (col 2): ID pré-definido (EXT001…) — NÃO sobrescrever
    row.getCell(3).value  = cell(scan.target, "");             // C: Domínio / Host
    row.getCell(4).value  = resolvedIp;                        // D: Endereço IP (vazio se ausente)
    row.getCell(5).value  = p.port;                            // E: Porto
    row.getCell(6).value  = cell(p.service ?? "");             // F: Serviço Detetado
    row.getCell(7).value  = cell(banner);                      // G: Versão / Banner
    row.getCell(8).value  = cvesSummary;                       // H: Vulnerabilidades (CVEs)
    row.getCell(9).value  = null;                              // I: Criticidade — preencher manualmente
    row.getCell(10).value = null;                              // J: Responsável — preencher manualmente
    row.getCell(11).value = obs;                               // K: Observações
    row.commit();
  }

  clearFormulaCache(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generatePsi(orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.psi);

  const org = await getOrganizationById(orgId);
  if (!org) throw new Error("[Documentos] Organização não encontrada");

  const today          = new Date();
  const proximaRevisao = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());

  const data = {
    empresa:          cell(org.legalName ?? org.name, "[A PREENCHER: nome da empresa]"),
    nif:              cell(org.taxId,                  "[A PREENCHER: NIF]"),
    versao:           "1.0",
    data_aprovacao:   "[A PREENCHER]",
    aprovado_por:     "[A PREENCHER]",
    cargo:            "[A PREENCHER]",
    ciso_nome:        cell(org.securityOfficerName,    "[A PREENCHER: responsável de segurança]"),
    data_revisao:     "[A PREENCHER]",
    proxima_revisao:  formatDate(proximaRevisao),
  };

  const content = fs.readFileSync(TEMPLATE_PATHS.psi);
  const zip     = new PizZip(content);
  const doc     = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

// ---------------------------------------------------------------------------
// C-EQ4 — Relatório de Enquadramento NIS2 (.docx)
// ---------------------------------------------------------------------------

export async function generateRelatorioEnquadramento(
  assessmentId: number,
  orgId: number,
): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.enquadramento);

  const assessment = await getFrameworkAssessmentById(assessmentId);
  if (!assessment)
    throw new Error("[Documentos] Assessment não encontrado");
  if (assessment.organizationId !== orgId)
    throw new Error("[Documentos] Acesso não autorizado a este assessment");

  const org = await getOrganizationById(orgId);
  if (!org) throw new Error("[Documentos] Organização não encontrada");

  // Re-corre o motor a partir das respostas guardadas na BD.
  // Motor é puro/determinístico: mesmas respostas → mesma classificação + steps.
  // Funciona para assessments v1 (sem steps) e v2 — a trilha é sempre re-derivada.
  const answers = (assessment.answers ?? {}) as Record<string, string>;
  const result  = evaluateTree(NIS2_PT_TREE, answers);

  const classification = assessment.classification ?? "";
  const isForaOuConfirmar =
    classification === "fora_condicional" || classification === "a_confirmar";

  const CLASSIFICACAO_LABELS: Record<string, string> = {
    essencial:              "Entidade essencial",
    importante:             "Entidade importante",
    a_confirmar:            "A confirmar",
    a_confirmar_contratual: "A confirmar (via cadeia de fornecimento)",
    fora_condicional:       "Provavelmente fora do âmbito",
    fora_mvp:               "Fora do âmbito do CISPLAN (regime autónomo)",
  };

  const data = {
    empresa:            cell(org.legalName ?? org.name, "[A PREENCHER: nome da empresa]"),
    data:               formatDate(new Date()),
    classificacaoLabel: (CLASSIFICACAO_LABELS[classification] ?? classification) || "—",
    resultLabel:        assessment.resultLabel ?? "—",
    engineVersion:      assessment.engineVersion,
    isFora:             classification === "fora_condicional",
    isAConfirmar:       classification === "a_confirmar",
    sec3Title: isForaOuConfirmar
      ? "3. O que a lei exige das entidades abrangidas"
      : "3. O que a lei já exige de si hoje",
    sec4Title: isForaOuConfirmar
      ? "4. O que terá de estar pronto até junho de 2028, se abrangida"
      : "4. O que terá de estar pronto até junho de 2028",
    sec5Title: isForaOuConfirmar
      ? "5. Exposição sancionatória das entidades abrangidas"
      : "5. Exposição sancionatória",
    // Loop {#steps}…{/steps}: um item por nó visitado, com label legível e base legal
    steps: result.steps.map(s => ({ label: s.label, article: s.article })),
  };

  const content = fs.readFileSync(TEMPLATE_PATHS.enquadramento);
  const zip     = new PizZip(content);
  const doc     = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}
