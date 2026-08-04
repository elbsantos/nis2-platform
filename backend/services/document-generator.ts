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
import { TRPCError } from "@trpc/server";
import {
  getScanById,
  getOrganizationById,
  getVulnerabilitiesByScanId,
  getFrameworkAssessmentById,
  getLatestFrameworkAssessmentByOrgId,
  getLatestCompletedQuestionnaireForOrg,
  getQuestionnaireSessionById,
} from "../db";
import { lookupLibrary } from "./ai-remediation";
import { NIS2_CONTROLS } from "./ai-questionnaire";
import { DEADLINE_BY_SEVERITY } from "./pdf-report-generator";
import {
  evaluateTree,
  NIS2_PT_TREE,
  ENGINE_VERSION,
  CLASSIFICACAO_LABELS,
  getSectorAnexoLabel,
} from "../utils/decision-engine";
import { formatMoedaEuro } from "../utils/money-format";
import { buildReportData } from "../routers/questionnaire.router";

// ---------------------------------------------------------------------------
// Caminhos e constantes
// ---------------------------------------------------------------------------

export const TEMPLATE_DIR = path.join(__dirname, "..", "assets", "templates");

export const TEMPLATE_PATHS = {
  registoRiscos:    path.join(TEMPLATE_DIR, "registo-riscos.xlsx"),
  inventarioAtivos: path.join(TEMPLATE_DIR, "inventario-ativos.xlsx"),
  psi:              path.join(TEMPLATE_DIR, "psi-template.docx"),
  enquadramento:    path.join(TEMPLATE_DIR, "enquadramento-template.docx"),
  cartaCiso:        path.join(TEMPLATE_DIR, "carta-ciso-template.docx"),
  registoCncs:      path.join(TEMPLATE_DIR, "registo-cncs-template.docx"),
  irp:              path.join(TEMPLATE_DIR, "irp-template.docx"),
  relatorioGestao:  path.join(TEMPLATE_DIR, "registo-gestao-template.docx"),
  tracker10Medidas: path.join(TEMPLATE_DIR, "tracker-10-medidas-template.xlsx"),
  declaracaoMfa:    path.join(TEMPLATE_DIR, "declaracao-mfa-template.docx"),
  patchTracker:     path.join(TEMPLATE_DIR, "tracker-patches-template.xlsx"),
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

/** Converte uma data em modo string do drizzle ("YYYY-MM-DD") para "DD/MM/YYYY". */
function formatDateOnlyStr(d: string | null | undefined): string | null {
  if (!d) return null;
  const [y, m, dd] = d.split("-");
  if (!y || !m || !dd) return null;
  return `${dd}/${m}/${y}`;
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
// Carta de Nomeação do CISO (.docx) — 1º dos 6 documentos do Dossier
// ---------------------------------------------------------------------------

export async function generateCartaCiso(orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.cartaCiso);

  const org = await getOrganizationById(orgId);
  if (!org) throw new Error("[Documentos] Organização não encontrada");

  const hoje = new Date();
  // Referência auto-gerada sem tabela de contador nova: reaproveita o id (já sequencial e único).
  const referencia = `CISO-${hoje.getFullYear()}-${String(orgId).padStart(6, "0")}`;

  const data = {
    empresa:        cell(org.legalName ?? org.name, "[A PREENCHER: nome da empresa]"),
    nif:            cell(org.taxId, "[A PREENCHER: NIF]"),
    sede:           cell(org.address, "[A PREENCHER: sede social]"),
    cae:            cell(org.caeCode, "[A PREENCHER: código CAE]"),
    representante:  cell(org.legalRepresentative, "[A PREENCHER: representante legal]"),
    cargo_rep:      cell(org.legalRepresentativeRole, "[A PREENCHER: cargo do representante]"),
    ciso_nome:      cell(org.securityOfficerName, "[A PREENCHER: nome do CISO]"),
    ciso_nif:       cell(org.securityOfficerTaxId, "[A PREENCHER: NIF do CISO]"),
    ciso_cargo:     cell(org.securityOfficerRole, "[A PREENCHER: cargo actual do CISO]"),
    ciso_inicio:    cell(formatDateOnlyStr(org.securityOfficerStartDate), "[A PREENCHER: data de início]"),
    ciso_email:     cell(org.securityOfficerEmail, "[A PREENCHER: email do CISO]"),
    ciso_telemovel: cell(org.securityOfficerPhone, "[A PREENCHER: telemóvel do CISO]"),
    referencia,
    localidade:     cell(org.city, "[A PREENCHER: localidade]"),
    data_extenso:   hoje.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" }),
  };

  const content = fs.readFileSync(TEMPLATE_PATHS.cartaCiso);
  const zip     = new PizZip(content);
  const doc     = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

// ---------------------------------------------------------------------------
// Registo Inicial CNCS (.docx) — 2º dos 6 documentos do Dossier
// ---------------------------------------------------------------------------

export async function generateRegistoCncs(orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.registoCncs);

  const org = await getOrganizationById(orgId);
  if (!org) throw new Error("[Documentos] Organização não encontrada");

  const assessment = await getLatestFrameworkAssessmentByOrgId(orgId);
  if (!assessment)
    throw new Error(
      "[Documentos] É necessário completar o Enquadramento NIS2 antes de gerar o Registo CNCS."
    );

  if (String(assessment.engineVersion) !== String(ENGINE_VERSION))
    throw new Error(
      `Este enquadramento foi calculado com a versão ${assessment.engineVersion} do motor de decisão; a versão actual é ${ENGINE_VERSION}. Para garantir a coerência do registo, é necessário repetir o enquadramento.`
    );

  // Re-corre o motor a partir das respostas guardadas — mesmo padrão de generateRelatorioEnquadramento.
  const answers = (assessment.answers ?? {}) as Record<string, string>;
  evaluateTree(NIS2_PT_TREE, answers); // valida que as respostas ainda produzem um resultado coerente

  const classification     = assessment.classification ?? "";
  const classificacaoLabel = (CLASSIFICACAO_LABELS[classification] ?? classification) || "—";
  const setorAnexoLabel    = getSectorAnexoLabel(answers["A.setor"]);

  const hoje = new Date();
  // Referência auto-gerada sem tabela de contador nova (mesmo padrão da Carta CISO).
  const referencia = `REG-CNCS-${hoje.getFullYear()}-${String(orgId).padStart(6, "0")}`;

  // Lista vazia é resposta válida ("só opera em Portugal") — não é dado em falta.
  const paisesOperacao = Array.isArray(org.countriesOfOperation) && org.countriesOfOperation.length > 0
    ? org.countriesOfOperation.join(", ")
    : "Nenhum — opera apenas em Portugal";

  const data = {
    empresa:         cell(org.legalName ?? org.name, "[A PREENCHER: nome da empresa]"),
    nif:             cell(org.taxId, "[A PREENCHER: NIF]"),
    sede:            cell(org.address, "[A PREENCHER: sede social]"),
    cae:             cell(org.caeCode, "[A PREENCHER: código CAE]"),
    setor_anexo:     cell(setorAnexoLabel, "[A CONFIRMAR: setor não consta dos Anexos I/II]"),
    classificacao:   classificacaoLabel,
    ciso_nome:       cell(org.securityOfficerName, "[A PREENCHER: nome do CISO]"),
    ciso_email:      cell(org.securityOfficerEmail, "[A PREENCHER: email do CISO]"),
    ciso_telefone:   cell(org.securityOfficerPhone, "[A PREENCHER: telefone do CISO]"),
    ciso_cargo:      cell(org.securityOfficerRole, "[A PREENCHER: cargo do CISO]"),
    ceo_contacto:    cell(org.ceoContact, "[A PREENCHER: contacto alternativo de gestão]"),
    colaboradores:   cell(org.employeeCount != null ? String(org.employeeCount) : null, "[A PREENCHER: nº de colaboradores]"),
    volume_negocios: formatMoedaEuro(org.annualTurnover, "[A PREENCHER: volume de negócios]"),
    paises_operacao: paisesOperacao,
    referencia,
    data_extenso:    hoje.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" }),
  };

  const content = fs.readFileSync(TEMPLATE_PATHS.registoCncs);
  const zip     = new PizZip(content);
  const doc     = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

// ---------------------------------------------------------------------------
// IRP — Plano de Resposta a Incidentes (.docx) — 3º dos 6 documentos do Dossier
// ---------------------------------------------------------------------------

export async function generateIrp(orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.irp);

  const org = await getOrganizationById(orgId);
  if (!org) throw new Error("[Documentos] Organização não encontrada");

  const hoje = new Date();
  // Referência auto-gerada sem tabela de contador nova (mesmo padrão da Carta CISO/Registo CNCS).
  const referencia = `IRP-${hoje.getFullYear()}-${String(orgId).padStart(6, "0")}`;

  const data = {
    empresa:           cell(org.legalName ?? org.name, "[A PREENCHER: nome da empresa]"),
    nif:               cell(org.taxId, "[A PREENCHER: NIF]"),
    // CISO — Comandante do Incidente: nome/email/telefone, contacto de emergência directo.
    cargo_ic_nome:     cell(org.securityOfficerName, "[A PREENCHER: nome do CISO]"),
    cargo_ic_email:    cell(org.securityOfficerEmail, "[A PREENCHER: email do CISO]"),
    cargo_ic_telefone: cell(org.securityOfficerPhone, "[A PREENCHER: telefone do CISO]"),
    // CEO — decisor de negócio escalado pelo CISO: só email, sem linha directa 24/7.
    ceo_nome:          cell(org.ceoName, "[A PREENCHER: nome do CEO]"),
    ceo_email:         cell(org.ceoContact, "[A PREENCHER: email do CEO]"),
    referencia,
    data_extenso:      hoje.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" }),
    // Data da versão 1.0 no historial de versões: é criada hoje, na geração — não "a definir"
    // como o resto do historial (formato curto DD/MM/AAAA, mais legível numa coluna estreita).
    data_versao_1:     formatDate(hoje),
  };

  const content = fs.readFileSync(TEMPLATE_PATHS.irp);
  const zip     = new PizZip(content);
  const doc     = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

// ---------------------------------------------------------------------------
// Relatório Executivo para a Gestão (.docx) — 4º dos 6 documentos do Dossier
// ---------------------------------------------------------------------------

/**
 * Limiares de conformidade por medida — mesmos já usados em questionnaire-pdf-generator.ts
 * (scoreColor/scoreLabel). Partilhada por generateRelatorioGestao e generateTracker10Medidas —
 * uma correção aqui aplica-se aos dois documentos.
 *
 * score === null significa que a medida não teve NENHUMA resposta aplicável no questionário
 * (todos os controlos respondidos "na") — é uma medida NÃO AVALIADA, distinta de "Em falta"
 * (medida avaliada, com score real abaixo de 60). Confundir os dois penalizava injustamente
 * empresas para as quais a medida legitimamente não se aplica.
 */
function measureStatusLabel(score: number | null): "Conforme" | "Parcial" | "Em falta" | "Não avaliado" {
  if (score === null) return "Não avaliado";
  if (score >= 80) return "Conforme";
  if (score >= 60) return "Parcial";
  return "Em falta";
}

/**
 * Verifica as 3 fontes exigidas pelo Relatório Executivo (questionário, enquadramento, scan
 * SELECIONADO pelo utilizador — não "o mais recente") e devolve a lista COMPLETA do que falta
 * — nunca só o primeiro problema encontrado.
 *
 * scanId vem explicitamente da página onde o utilizador estava (histórico de scans), exactamente
 * como registoRiscos/inventarioAtivos/report.generate já fazem — este documento tinha ficado de
 * fora desse padrão e usava "o scan mais recente da org", ignorando qual estava selecionado.
 */
async function checkRelatorioGestaoPreconditions(orgId: number, scanId: number) {
  const missing: string[] = [];

  const questionnaire = await getLatestCompletedQuestionnaireForOrg(orgId);
  if (!questionnaire) missing.push("questionário de autoavaliação");

  const assessment = await getLatestFrameworkAssessmentByOrgId(orgId);
  if (!assessment) {
    missing.push("enquadramento NIS2");
  } else if (String(assessment.engineVersion) !== String(ENGINE_VERSION)) {
    missing.push("enquadramento NIS2 (motor desatualizado — repita a avaliação)");
  }

  const scan = await getScanById(scanId);
  // Scoping de segurança — mesma validação de registoRiscos/inventarioAtivos/report.generate:
  // getScanById não filtra por organização, por isso é preciso confirmar aqui explicitamente.
  if (scan && scan.organizationId !== orgId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este scan não pertence à sua organização." });
  }
  if (!scan || scan.status !== "completed") missing.push("scan de segurança");

  return { missing, questionnaire, assessment, scan };
}

export async function generateRelatorioGestao(orgId: number, scanId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.relatorioGestao);

  const org = await getOrganizationById(orgId);
  if (!org) throw new Error("[Documentos] Organização não encontrada");

  const { missing, questionnaire, assessment, scan } = await checkRelatorioGestaoPreconditions(orgId, scanId);
  if (missing.length > 0) {
    throw new Error(
      `[Documentos] Não é possível gerar o Relatório Executivo. Complete primeiro: ${missing.join(", ")}.`
    );
  }

  // A partir daqui as 3 fontes existem — o guard acima garante non-null.
  const questionnaireSession = await getQuestionnaireSessionById(questionnaire!.id);
  const reportData = await buildReportData(questionnaireSession, org.name);

  const answers = (assessment!.answers ?? {}) as Record<string, string>;
  evaluateTree(NIS2_PT_TREE, answers); // valida coerência — mesmo padrão do Registo CNCS
  const classification     = assessment!.classification ?? "";
  const classificacaoLabel = (CLASSIFICACAO_LABELS[classification] ?? classification) || "—";

  let conformes = 0, parciais = 0, falta = 0, naoAvaliadas = 0;
  const medidas = reportData.measureScores.map((m) => {
    const estado = measureStatusLabel(m.score);
    if (estado === "Conforme") conformes++;
    else if (estado === "Parcial") parciais++;
    else if (estado === "Não avaliado") naoAvaliadas++;
    else falta++;
    return {
      slug_maiusc: m.slug.toUpperCase(),
      titulo:      m.title,
      score_fmt:   m.score !== null ? `${m.score}/100` : "Sem dados",
      estado,
      controlos:   String(m.controlCount),
      // "Não avaliado" (score null) não tem lacunas por definição — buildReportData já
      // devolve gapCount=0 nesse caso, mas mostramos "—" para não sugerir "0 lacunas
      // encontradas numa avaliação real" quando na verdade não houve avaliação nenhuma.
      lacunas:     m.score === null ? "—" : String(m.gapCount),
    };
  });

  const overallScore = reportData.overallScore;
  const leituraSumario = overallScore >= 80
    ? "O nível de conformidade global é elevado; recomenda-se consolidar as últimas lacunas identificadas."
    : overallScore >= 60
    ? "O nível de conformidade global é moderado; recomenda-se um plano de ação para as lacunas prioritárias."
    : "O nível de conformidade global é baixo; é necessário um plano de ação urgente para as medidas em falta.";

  const scanResults    = (scan!.results as any) ?? {};
  const scanCritical   = Number(scanResults.criticalCount ?? 0);
  const scanHigh       = Number(scanResults.highCount ?? 0);
  const scanMedium     = Number(scanResults.mediumCount ?? 0);
  const scanLow        = Number(scanResults.lowCount ?? 0);
  const scanVulnsTotal = scanCritical + scanHigh + scanMedium + scanLow;

  const hoje = new Date();
  // Referência auto-gerada sem tabela de contador nova (mesmo padrão dos outros 3 documentos).
  const referencia = `REL-GEST-${hoje.getFullYear()}-${String(orgId).padStart(6, "0")}`;

  const data = {
    empresa:           cell(org.legalName ?? org.name, "[A PREENCHER: nome da empresa]"),
    referencia,
    data_extenso:      hoje.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" }),
    classificacao:     classificacaoLabel,
    score_global:      `${overallScore}/100`,
    medidas_conformes: String(conformes),
    medidas_parciais:  String(parciais),
    medidas_falta:     String(falta),
    medidas_nao_avaliadas: String(naoAvaliadas),
    leitura_sumario:   leituraSumario,
    medidas, // array — secção repetível {#medidas}...{/medidas} no template
    scan_data:         formatDate(scan!.completedAt),
    scan_vulns_total:  String(scanVulnsTotal),
    scan_criticas:     String(scanCritical),
    scan_altas:        String(scanHigh),
    scan_medias:       String(scanMedium),
    scan_baixas:       String(scanLow),
    ceo_nome:          cell(org.ceoName, "[A PREENCHER: nome do CEO]"),
  };

  const content = fs.readFileSync(TEMPLATE_PATHS.relatorioGestao);
  const zip     = new PizZip(content);
  const doc     = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

// ---------------------------------------------------------------------------
// Tracker das 10 Medidas (.xlsx) — 5º dos 6 documentos do Dossier
// ---------------------------------------------------------------------------

const TRACKER_ROW_BY_INDEX = 8; // primeira linha de dados na folha "📊 TRACKER 10 MEDIDAS"

export async function generateTracker10Medidas(orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.tracker10Medidas);

  const org = await getOrganizationById(orgId);
  if (!org) throw new Error("[Documentos] Organização não encontrada");

  const questionnaire = await getLatestCompletedQuestionnaireForOrg(orgId);
  if (!questionnaire) {
    throw new Error(
      "[Documentos] Não é possível gerar o Tracker das 10 Medidas. Complete primeiro o questionário de autoavaliação."
    );
  }

  const session     = await getQuestionnaireSessionById(questionnaire.id);
  const reportData  = await buildReportData(session, org.name);

  const hoje = new Date();
  // Referência auto-gerada sem tabela de contador nova (mesmo padrão dos outros documentos).
  const referencia = `TRACKER-${hoje.getFullYear()}-${String(orgId).padStart(6, "0")}`;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATHS.tracker10Medidas);
  wb.calcProperties.fullCalcOnLoad = true;

  const sheet = wb.getWorksheet("📊 TRACKER 10 MEDIDAS");
  if (!sheet) throw new Error('[Documentos] Folha "📊 TRACKER 10 MEDIDAS" não encontrada no template');

  sheet.getCell("B3").value = `Empresa: ${org.legalName ?? org.name}`;
  sheet.getCell("G3").value = `Referência: ${referencia}   |   Gerado em: ${formatDate(hoje)}`;

  // measureScores já vem ordenado a-j de buildReportData — mesma ordem das linhas do template.
  reportData.measureScores.forEach((m, i) => {
    const rowNum = TRACKER_ROW_BY_INDEX + i;
    const row = sheet.getRow(rowNum);
    // Mesmos limiares 80/60 do Relatório Executivo para a Gestão — coerência obrigatória
    // entre documentos: a mesma medida nunca pode ter estado diferente de um doc para o outro.
    const estado = measureStatusLabel(m.score);
    row.getCell(3).value  = m.title;                                     // C: Medida — mesmo título do doc 4
    row.getCell(4).value  = estado;                                      // D: Estado
    row.getCell(5).value  = m.score !== null ? `${m.score}/100` : "Sem dados"; // E: Score
    // "Não avaliado" (score null) mostra "—" em vez de "0" — 0 poderia sugerir uma
    // avaliação real sem lacunas, quando na verdade a medida não foi avaliada.
    row.getCell(6).value  = m.score === null ? "—" : String(m.gapCount);  // F: Lacunas
    row.getCell(8).value  = "[A definir pela equipa]";                   // H: Responsável
    row.getCell(10).value = "[A definir pela equipa]";                   // J: Prazo
    row.getCell(11).value = "[A definir pela equipa]";                   // K: Evidência
    row.commit();
  });

  const dashboard = wb.getWorksheet("📈 DASHBOARD");
  if (!dashboard) throw new Error('[Documentos] Folha "📈 DASHBOARD" não encontrada no template');
  dashboard.getCell("C4").value = `${reportData.overallScore}/100`;

  clearFormulaCache(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Declaração de MFA — Autoavaliação (.docx) — 6º dos 6 documentos do Dossier
// ---------------------------------------------------------------------------

/** As 3 perguntas de MFA do questionário (Art. 21.º/2/j) — j-4/j-5 são outros temas da medida j. */
const MFA_CONTROL_IDS = ["j-1", "j-2", "j-3"] as const;

/** Sim/Parcial/Não/N-A — mesmo vocabulário do formulário do questionário, sem reinterpretação. */
const MFA_ANSWER_LABEL: Record<string, string> = { yes: "Sim", partial: "Parcial", no: "Não", na: "N-A" };

export async function generateDeclaracaoMfa(orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.declaracaoMfa);

  const org = await getOrganizationById(orgId);
  if (!org) throw new Error("[Documentos] Organização não encontrada");

  const questionnaire = await getLatestCompletedQuestionnaireForOrg(orgId);
  if (!questionnaire) {
    throw new Error(
      "[Documentos] Não é possível gerar a Declaração de MFA. Complete primeiro o questionário de autoavaliação."
    );
  }

  const session  = await getQuestionnaireSessionById(questionnaire.id);
  const answers  = (session?.answers ?? []) as Array<{ controlId: string; answer: string }>;
  const answerMap = new Map(answers.map((a) => [a.controlId, a.answer]));

  // Fallback [A PREENCHER] por consistência com os outros geradores — na prática não deve
  // acontecer, pois as 42 perguntas são obrigatórias para concluir o questionário.
  const [q1, q2, q3] = MFA_CONTROL_IDS.map((id) => {
    const control = NIS2_CONTROLS.find((c) => c.id === id);
    const ans      = answerMap.get(id);
    return {
      pergunta: cell(control?.question, "[A PREENCHER: pergunta não encontrada]"),
      estado:   ans ? (MFA_ANSWER_LABEL[ans] ?? "[A PREENCHER]") : "[A PREENCHER]",
    };
  });

  const hoje = new Date();
  // Referência auto-gerada sem tabela de contador nova (mesmo padrão dos outros documentos).
  const referencia = `MFA-${hoje.getFullYear()}-${String(orgId).padStart(6, "0")}`;

  const data = {
    empresa:          cell(org.legalName ?? org.name, "[A PREENCHER: nome da empresa]"),
    referencia,
    data_extenso:     hoje.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" }),
    q1_pergunta:      q1.pergunta,
    q1_estado:        q1.estado,
    q2_pergunta:      q2.pergunta,
    q2_estado:        q2.estado,
    q3_pergunta:      q3.pergunta,
    q3_estado:        q3.estado,
    responsavel_nome: cell(org.securityOfficerName, "[A PREENCHER: nome do CISO]"),
  };

  const content = fs.readFileSync(TEMPLATE_PATHS.declaracaoMfa);
  const zip     = new PizZip(content);
  const doc     = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

// ---------------------------------------------------------------------------
// Tracker de Patches e Vulnerabilidades (.xlsx) — D14, ferramenta de acompanhamento
// ---------------------------------------------------------------------------

const MAX_PATCH_ROWS      = 100; // linhas pré-estilizadas no template — além disto, linha de excedente
const PATCH_FIRST_DATA_ROW = 13;

export async function generatePatchTracker(scanId: number, orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.patchTracker);

  const [scan, org, vulns] = await Promise.all([
    getScanById(scanId),
    getOrganizationById(orgId),
    getVulnerabilitiesByScanId(scanId),
  ]);
  if (!scan || !org) throw new Error("[Documentos] Scan ou organização não encontrados");

  // Ordenado por severidade (críticas primeiro) e, dentro da mesma severidade, por CVSS
  // decrescente — mesma lógica de ordenação de aggregateRiskGroups.
  const sorted = [...vulns].sort((a, b) => {
    const diff = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
    if (diff !== 0) return diff;
    return Number(b.cvssScore ?? 0) - Number(a.cvssScore ?? 0);
  });

  const counts = {
    critical: sorted.filter((v) => v.severity === "critical").length,
    high:     sorted.filter((v) => v.severity === "high").length,
    medium:   sorted.filter((v) => v.severity === "medium").length,
    low:      sorted.filter((v) => v.severity === "low").length,
  };

  const hoje = new Date();
  // Referência auto-gerada sem tabela de contador nova (mesmo padrão dos outros documentos).
  const referencia = `PATCH-${hoje.getFullYear()}-${String(orgId).padStart(6, "0")}`;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATHS.patchTracker);
  wb.calcProperties.fullCalcOnLoad = true;
  const sheet = wb.getWorksheet("🔧 TRACKER DE PATCHES");
  if (!sheet) throw new Error('[Documentos] Folha "🔧 TRACKER DE PATCHES" não encontrada no template');

  sheet.getCell("B3").value = `Empresa: ${org.legalName ?? org.name}`;
  sheet.getCell("F3").value = `Referência: ${referencia}`;
  sheet.getCell("B4").value = `Alvo do scan: ${cell(scan.target, "[A PREENCHER]")}`;
  sheet.getCell("F4").value = `Data do scan: ${formatDate(scan.completedAt ?? scan.createdAt)}`;
  sheet.getCell("B5").value =
    `Data do documento: ${hoje.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })}`;

  sheet.getCell("B10").value = String(counts.critical);
  sheet.getCell("C10").value = String(counts.high);
  sheet.getCell("D10").value = String(counts.medium);
  sheet.getCell("E10").value = String(counts.low);
  sheet.getCell("F10").value = String(sorted.length);

  if (sorted.length === 0) {
    // Um scan limpo é um bom resultado, não uma falha — mensagem clara, sem gerar erro nem
    // deixar a tabela visualmente vazia/confusa.
    sheet.mergeCells(`B${PATCH_FIRST_DATA_ROW}:I${PATCH_FIRST_DATA_ROW}`);
    const msgCell = sheet.getCell(`B${PATCH_FIRST_DATA_ROW}`);
    msgCell.value = "Nenhuma vulnerabilidade detetada neste scan — sem patches pendentes.";
    msgCell.font = { italic: true };
  } else {
    const rowsToWrite = sorted.slice(0, MAX_PATCH_ROWS);
    rowsToWrite.forEach((v, i) => {
      const rowNum = PATCH_FIRST_DATA_ROW + i;
      const row = sheet.getRow(rowNum);
      row.getCell(2).value  = i + 1;                                                  // B: #
      row.getCell(3).value  = SEVERITY_PT[v.severity] ?? v.severity;                   // C: Severidade
      row.getCell(4).value  = cell(v.affectedComponent, "[A PREENCHER]");              // D: Serviço/Componente
      row.getCell(5).value  = v.port ?? "—";                                          // E: Porta
      row.getCell(6).value  = cell(v.cveId, "[A PREENCHER]");                          // F: CVE
      // Patch Recomendado — o resumo de 1 linha já gravado pelo scanner (sem chamada a IA),
      // não o plano completo (esse fica na secção de Remediação da plataforma).
      row.getCell(7).value  = cell(v.remediation, "[A PREENCHER: patch recomendado]");  // G: Patch Recomendado
      row.getCell(8).value  = DEADLINE_BY_SEVERITY[v.severity] ?? "—";                  // H: Prazo
      row.getCell(9).value  = "[A definir pela equipa]";                                // I: Estado
      row.commit();
    });

    const overflow = sorted.length - rowsToWrite.length;
    if (overflow > 0) {
      const overRow = sheet.getRow(PATCH_FIRST_DATA_ROW + MAX_PATCH_ROWS);
      overRow.getCell(3).value =
        `(+ ${overflow} ${overflow === 1 ? "vulnerabilidade adicional" : "vulnerabilidades adicionais"} omitidas — consulte o Relatório Técnico)`;
      overRow.commit();
    }
  }

  clearFormulaCache(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
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

  if (String(assessment.engineVersion) !== String(ENGINE_VERSION))
    throw new Error(
      `Este enquadramento foi calculado com a versão ${assessment.engineVersion} do motor de decisão; a versão actual é ${ENGINE_VERSION}. Para garantir a coerência do relatório, é necessário repetir o enquadramento.`
    );

  // Re-corre o motor a partir das respostas guardadas na BD.
  // Motor é puro/determinístico: mesmas respostas → mesma classificação + steps.
  // Funciona para assessments v1 (sem steps) e v2 — a trilha é sempre re-derivada.
  const answers = (assessment.answers ?? {}) as Record<string, string>;
  const result  = evaluateTree(NIS2_PT_TREE, answers);

  const { coverageState } = result;

  // ── Ponto de decisão único: todo o texto varia aqui, nunca abaixo ────────────
  const TEXTOS = {
    abrangida: {
      sec3Title: "3. O que a lei já exige de si hoje",
      sec4Title: "4. O que terá de estar pronto até junho de 2028",
      sec5Title: "5. Exposição sancionatória",
      sec5Intro: "Escalões aplicáveis à sua categoria (artigos 61.º e 62.º do RJC). Os valores são tetos máximos; a coima concreta é fixada caso a caso pela autoridade de cibersegurança competente. Há um caminho de conformidade e ainda há tempo.",
      emVigor:   "Estas obrigações estão em vigor desde a entrada em vigor do Regime Jurídico da Cibersegurança, em 3 de abril de 2026 (artigo 11.º do Decreto-Lei n.º 125/2025). O Regulamento n.º 756/2026, em vigor desde 23 de junho de 2026, não as criou: operacionalizou-as, definindo o funcionamento da plataforma eletrónica MyCiber e os procedimentos de autoidentificação, qualificação, comunicação e notificação.",
      provavel:  false,
    },
    condicional: {
      sec3Title: "3. O que a lei exige das entidades abrangidas",
      sec4Title: "4. O que terá de estar pronto até junho de 2028, se abrangida",
      sec5Title: "5. Exposição sancionatória das entidades abrangidas",
      sec5Intro: "Escalões aplicáveis às entidades abrangidas (artigos 61.º e 62.º do RJC). Os valores são tetos máximos; a coima concreta é fixada caso a caso pela autoridade de cibersegurança competente.",
      emVigor:   "As obrigações abaixo vigoram, na ordem jurídica, desde a entrada em vigor do RJC (3 de abril de 2026). A sua exigibilidade a esta organização depende de se confirmar que está abrangida.",
      provavel:  true,
    },
    fora: {
      sec3Title: "3. O que a lei exige das entidades abrangidas",
      sec4Title: "4. O que terá de estar pronto até junho de 2028, se abrangida",
      sec5Title: "5. Exposição sancionatória das entidades abrangidas",
      sec5Intro: "Escalões aplicáveis às entidades abrangidas (artigos 61.º e 62.º do RJC). Os valores são tetos máximos; a coima concreta é fixada caso a caso pela autoridade de cibersegurança competente.",
      emVigor:   "As obrigações abaixo vigoram na ordem jurídica desde 3 de abril de 2026, mas não são exigíveis a esta organização com o enquadramento atual.",
      provavel:  false,
    },
  } as const;
  const textos = TEXTOS[coverageState];

  const classification = assessment.classification ?? "";
  const rawLabel        = (CLASSIFICACAO_LABELS[classification] ?? classification) || "—";
  const classificacaoLabel = textos.provavel ? `Provável — ${rawLabel}` : rawLabel;

  const data = {
    empresa:          cell(org.legalName ?? org.name, "[A PREENCHER: nome da empresa]"),
    data:             formatDate(new Date()),
    classificacaoLabel,
    resultLabel:      assessment.resultLabel ?? "—",
    engineVersion:    assessment.engineVersion,
    isFora:           coverageState === 'fora',
    isCondicional:    coverageState === 'condicional',
    isAbrangida:      coverageState === 'abrangida',
    sec3Title:        textos.sec3Title,
    sec4Title:        textos.sec4Title,
    sec5Title:        textos.sec5Title,
    sec5Intro:        textos.sec5Intro,
    emVigorTexto:     textos.emVigor,
    provavel:         textos.provavel,
    // Loop {#steps}…{/steps}: um item por nó visitado, com label legível e base legal
    steps: result.steps.map(s => ({ label: s.label, article: s.article })),
  };

  const content = fs.readFileSync(TEMPLATE_PATHS.enquadramento);
  const zip     = new PizZip(content);
  const doc     = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}
