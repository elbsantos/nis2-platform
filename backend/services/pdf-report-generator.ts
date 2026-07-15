/**
 * server/services/pdf-report-generator.ts
 *
 * Enterprise-grade NIS2 compliance PDF reports (Executive + Technical).
 * Format inspired by SecurityScorecard / Tenable / Qualys report standards.
 */

import PDFDocument from "pdfkit";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getScanById, getOrganizationById, getLatestCompletedQuestionnaireForOrg } from "../db";
import {
  combinedNis2Scores,
  overallCombinedScore,
  type CombinedArticleScore,
} from "../utils/combined-score";
import type { NIS2ArticleScore } from "./scan-executor";
import {
  aggregateByRootCause,
  buildMediumIndividualsSummary,
  type RootCauseGroup,
  type RcaVuln,
} from "./root-cause-aggregation";
import { drawGauge, drawSeverityTiles, drawNIS2Radar, drawServiceBars } from "./pdf-chart-helpers";

const sev = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

// Fontes embebidas — DejaVu Sans cobre Unicode (setas →↳, diacríticos PT, ✓…)
// path.join(__dirname, …) é resolvido relativamente ao módulo, não ao cwd — seguro no Railway.
const FONT_REGULAR = path.join(__dirname, "..", "assets", "fonts", "DejaVuSans.ttf");
const FONT_BOLD    = path.join(__dirname, "..", "assets", "fonts", "DejaVuSans-Bold.ttf");

// ---------------------------------------------------------------------------
// S3 / Hetzner Object Storage client
// ---------------------------------------------------------------------------

function getS3Client(): S3Client {
  return new S3Client({
    region:   process.env.STORAGE_REGION   ?? "eu-central-1",
    endpoint: process.env.STORAGE_ENDPOINT ?? "https://fsn1.your-objectstorage.com",
    credentials: {
      accessKeyId:     process.env.STORAGE_ACCESS_KEY ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

const BUCKET = process.env.STORAGE_BUCKET ?? "nis2pt-reports";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const C = {
  brand:    "#1d4ed8",
  navy:     "#0f1e38",
  navyMid:  "#152744",
  success:  "#10b981",
  warning:  "#f59e0b",
  danger:   "#ef4444",
  critical: "#dc2626",
  high:     "#ea580c",
  low:      "#3b82f6",
  text:     "#111827",
  muted:    "#6b7280",
  border:   "#e5e7eb",
  bg:       "#f8fafc",
  white:    "#ffffff",
};

const PAGE_W = 595, PAGE_H = 842, MARGIN = 50, CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_BOTTOM = 757; // PAGE_H(842) − footer(32) − header(53)

// ---------------------------------------------------------------------------
// NIS2 Article catalogue
// ---------------------------------------------------------------------------

const NIS2_ARTICLES: Record<string, { short: string; desc: string }> = {
  "Art. 21(2)(a)": { short: "Políticas de Risco",                  desc: "Políticas de análise de risco e segurança dos sistemas de informação" },
  "Art. 21(2)(b)": { short: "Gestão de Incidentes",                desc: "Deteção, resposta e notificação de incidentes de segurança" },
  "Art. 21(2)(c)": { short: "Continuidade de Negócio",             desc: "Cópias de segurança (backups), recuperação de desastres e gestão de crises" },
  "Art. 21(2)(d)": { short: "Cadeia de Abastecimento",             desc: "Segurança nos fornecedores e parceiros tecnológicos" },
  "Art. 21(2)(e)": { short: "Aquisição e Desenvolvimento Seguros", desc: "Segurança na aquisição, desenvolvimento e manutenção de sistemas de informação" },
  "Art. 21(2)(f)": { short: "Avaliação de Eficácia",               desc: "Avaliação e monitorização contínua das medidas de cibersegurança" },
  "Art. 21(2)(g)": { short: "Ciberhigiene e Formação",             desc: "Práticas básicas de ciberhigiene e formação de colaboradores" },
  "Art. 21(2)(h)": { short: "Criptografia e Encriptação",          desc: "Encriptação de dados em trânsito e em repouso; protocolos seguros" },
  "Art. 21(2)(i)": { short: "Segurança RH e Controlo de Acessos", desc: "Segurança dos recursos humanos, controlo de acessos e gestão de ativos" },
  "Art. 21(2)(j)": { short: "Autenticação e Identidade",           desc: "Autenticação multifator, segurança nas comunicações e validação de identidade institucional" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Scan = Awaited<ReturnType<typeof getScanById>>;
type Org  = Awaited<ReturnType<typeof getOrganizationById>>;

// Tipo interno normalizado — construído a partir de results.vulnerabilities (JSONB).
// Fonte única de verdade: o mesmo conjunto que o ecrã (ScanResults.tsx) usa.
interface PdfVuln {
  cveId:             string;
  severity:          string;
  cvssScore:         string;  // string para compatibilidade com parseFloat() existente
  description:       string;
  affectedComponent: string;
  port:              number | null;
  remediation:       string | null;
}

function scoreColor(s: number): string {
  if (s >= 80) return C.success;
  if (s >= 60) return C.warning;
  return C.danger;
}
function scoreLabel(s: number): string {
  if (s >= 80) return "Conformidade Elevada";
  if (s >= 60) return "Conformidade Moderada";
  if (s >= 40) return "Conformidade Baixa";
  return "Não Conforme";
}
function severityColor(s: string): string {
  return { critical: C.critical, high: C.high, medium: C.warning, low: C.low }[s] ?? C.muted;
}
function severityLabel(s: string): string {
  return { critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" }[s] ?? s;
}
function cvssColor(v: number): string {
  if (v >= 9) return C.critical;
  if (v >= 7) return C.high;
  if (v >= 4) return C.warning;
  return C.success;
}
function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT");
}
function fmtFull(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-PT");
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function generateReport(options: {
  scanId: number;
  organizationId: number;
  type: "executive" | "technical";
}): Promise<string> {
  const buffer = await generateReportBuffer(options);
  return uploadToStorage(buffer, options.organizationId, options.scanId, options.type);
}

export async function generateReportBuffer(options: {
  scanId: number;
  organizationId: number;
  type: "executive" | "technical";
}): Promise<Buffer> {
  const [scan, org] = await Promise.all([
    getScanById(options.scanId),
    getOrganizationById(options.organizationId),
  ]);

  if (!scan) throw new Error(`Scan ${options.scanId} não encontrado`);
  if (scan.organizationId !== options.organizationId)
    throw new Error("Sem permissão para aceder a este scan");

  // Lê sempre de results.vulnerabilities (JSONB) — fonte única de verdade.
  // Garante que PDF e ecrã mostram exactamente o mesmo conjunto de vulns (inclui sintéticos).
  const vulns: PdfVuln[] = ((scan.results as any)?.vulnerabilities ?? []).map((v: any): PdfVuln => ({
    cveId:             v.cveId,
    severity:          v.severity,
    cvssScore:         String(v.cvssScore ?? 5),
    description:       v.description ?? "",
    affectedComponent: v.affectedService ?? v.affectedComponent ?? "unknown",
    port:              v.port ?? null,
    remediation:       v.remediationHint ?? v.remediation ?? null,
  }));

  // Score combinado (scan + questionário) — fonte única via combined-score.ts.
  const nis2Scores = ((scan.results as any)?.nis2Scores ?? []) as NIS2ArticleScore[];
  const qSession   = await getLatestCompletedQuestionnaireForOrg(options.organizationId);
  const qScores    = (qSession?.articleScores as Record<string, number> | null) ?? null;
  const combined   = combinedNis2Scores(nis2Scores, qScores);
  const scanOverall   = (scan.results as any)?.overallScore as number ?? 0;
  const displayOverall = qScores !== null ? overallCombinedScore(combined) : scanOverall;

  // Fontes que efectivamente correram neste scan (gravadas pelo scan-executor).
  // Fallback para scans antigos (sem campo): assume fontes base sem Censys.
  const dataSources: string[] = (scan.results as any)?.dataSources ??
    ["shodan", "directTls", "emailSecurity", "httpHeaders", "darkWeb", "nvd"];
  const scanLimitations: string[] = (scan.results as any)?.scanLimitations ?? [];

  return options.type === "executive"
    ? buildExecutiveReport(scan, vulns, org, combined, displayOverall, qScores !== null, dataSources, scanLimitations)
    : buildTechnicalReport(scan, vulns, org, combined, displayOverall, qScores !== null, dataSources, scanLimitations);
}

// ---------------------------------------------------------------------------
// EXECUTIVE REPORT
// ---------------------------------------------------------------------------

async function buildExecutiveReport(
  scan: Scan,
  vulns: PdfVuln[],
  org: Org,
  combined: CombinedArticleScore[],
  displayOverall: number,
  hasQuestionnaire: boolean,
  dataSources: string[],
  scanLimitations: string[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false,
      info: { Title: "CISPLAN — Relatório Executivo NIS2", Author: "CISPLAN", Creator: "CISPLAN" } });
    doc.registerFont("Sans",      FONT_REGULAR);
    doc.registerFont("Sans-Bold", FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Usa scores combinados (scan + questionário) — calculados em generateReportBuffer.
    // displayOverall já reflecte o score combinado quando questionário disponível.
    const overall = displayOverall;
    const counts = {
      critical: vulns.filter(v => v.severity === "critical").length,
      high:     vulns.filter(v => v.severity === "high").length,
      medium:   vulns.filter(v => v.severity === "medium").length,
      low:      vulns.filter(v => v.severity === "low").length,
    };

    // ── PAGE 1: COVER ──────────────────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawCoverPage(doc, scan, overall, "RELATÓRIO EXECUTIVO NIS2", "CONFIDENCIAL");

    // ── PAGE 2: RESUMO EXECUTIVO ───────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Executivo");

    let y = 90;
    let execPage = 2;
    const execAddPage = () => {
      drawRunningFooter(doc, execPage++);
      doc.addPage({ size: "A4", margin: 0 });
      drawRunningHeader(doc, scan?.target ?? "—", "Executivo");
      y = 90;
    };
    const execEnsure = (needed: number) => { if (y + needed > CONTENT_BOTTOM) execAddPage(); };

    // Section title
    y = drawSectionTitle(doc, "Resumo Executivo", y);

    // Scan info row
    doc.fontSize(8).font("Sans").fillColor(C.muted);
    doc.text(`Alvo: `, MARGIN, y, { continued: true }).fillColor(C.text).text(scan?.target ?? "—", { continued: true });
    doc.fillColor(C.muted).text(`   ·   Data: `, { continued: true }).fillColor(C.text).text(fmt(scan?.completedAt ?? scan?.createdAt));
    doc.fillColor(C.muted).text(`Modo: `, MARGIN, y + 14, { continued: true })
       .fillColor(C.text).text(scan?.mode === "sme" ? "PME (SME)" : "Cadeia de Abastecimento", { continued: true });
    doc.fillColor(C.muted).text(`   ·   Vulnerabilidades: `, { continued: true })
       .fillColor(C.text).text(String(vulns.length));
    y += 36;

    // ── Riscos por severidade — agregação por causa raiz ─────────────────
    const execOpenPorts: Array<{ port: number; service?: string; version?: string }> =
      ((scan?.results ?? {}) as Record<string, any>).openPorts ?? [];
    const rcaResult = aggregateByRootCause(vulns, execOpenPorts);

    const criticals = vulns.filter(v => v.severity === "critical");
    const highs     = vulns.filter(v => v.severity === "high");
    const mediums   = vulns.filter(v => v.severity === "medium");
    const lows      = vulns.filter(v => v.severity === "low");

    // Renderiza um grupo de causa raiz numa secção de severidade específica.
    // Mostra a contagem da secção e o total do grupo para contexto.
    const drawExecGroup = (group: RootCauseGroup, sColor: string, sev: "critical" | "high" | "medium" | "low") => {
      const secCount = group.counts[sev];
      const secSingular: Record<string, string> = { critical: "crítica",  high: "alta",  medium: "média",  low: "baixa"  };
      const secPlural:   Record<string, string> = { critical: "críticas", high: "altas", medium: "médias", low: "baixas" };
      const sevLbl = secCount === 1 ? secSingular[sev] : secPlural[sev];
      const sshTitle = group.service.match(/^SSH \(OpenSSH_(\S+)/i);
      const displayTitle = sshTitle
        ? `Software OpenSSH ${sshTitle[1]} desatualizado${group.port !== null ? ` (porto ${group.port})` : ""}`
        : group.title;
      const titleLine = `${displayTitle} — ${secCount} ${sevLbl} (${group.counts.total} no total)`;
      const titleH   = doc.fontSize(8).font("Sans-Bold").heightOfString(titleLine,     { width: CONTENT_W - 28 });
      const summaryH = doc.fontSize(8).font("Sans")     .heightOfString(group.summary, { width: CONTENT_W - 28 });
      const actionH  = doc.fontSize(7.5).font("Sans")   .heightOfString(`→ ${group.action}`, { width: CONTENT_W - 28 });
      execEnsure(titleH + summaryH + actionH + 22);
      doc.rect(MARGIN + 10, y + 3, 5, 5).fillColor(sColor).fill();
      doc.fontSize(8).font("Sans-Bold").fillColor(C.text)
         .text(titleLine, MARGIN + 22, y, { width: CONTENT_W - 26 });
      y += titleH + 2;
      doc.fontSize(8).font("Sans").fillColor(C.muted)
         .text(group.summary, MARGIN + 22, y, { width: CONTENT_W - 26 });
      y += summaryH + 4;
      doc.fontSize(7.5).font("Sans").fillColor(C.brand)
         .text(`→ ${group.action}`, MARGIN + 22, y, { width: CONTENT_W - 26 });
      y += actionH + 10;
    };

    // Renderiza um finding individual (sintético ou CVE não agrupado).
    const drawExecIndividual = (v: RcaVuln, sColor: string) => {
      const enriched = enrichFinding(v.description || v.cveId, v.cveId);
      const tH = doc.fontSize(8).font("Sans").heightOfString(enriched.text, { width: CONTENT_W - 28 });
      execEnsure(tH + 14);
      doc.rect(MARGIN + 10, y + 3, 5, 5).fillColor(sColor).fill();
      doc.fontSize(8).font("Sans").fillColor(C.text)
         .text(enriched.text, MARGIN + 22, y, { width: CONTENT_W - 26 });
      y += tH + 10;
    };

    // ── PAINEL DE RELANCE ─────────────────────────────────────────────────
    // Linha 1: Gauge (esq.) + Severity Tiles (dir.)
    execEnsure(150);
    const gH = drawGauge(doc, MARGIN, y, overall, scoreLabel(overall), 52);
    const tH2 = drawSeverityTiles(doc, MARGIN + 120, y, counts, 375);
    y += Math.max(gH, tH2) + 16;

    // Linha 2: Radar NIS2 (esq.) + Barras por serviço (dir.)
    execEnsure(240);
    const radarScores: Record<string, number | null> = {};
    combined.forEach(s => { radarScores[s.slug] = s.combinedScore; });
    const serviceRows = rcaResult.groups.slice(0, 8).map(g => ({
      label: g.port !== null ? `${g.service}:${g.port}` : g.service,
      counts: { critical: g.counts.critical, high: g.counts.high, medium: g.counts.medium, low: g.counts.low },
    }));
    const panelLineY = y;
    const radarH = drawNIS2Radar(doc, MARGIN, panelLineY, radarScores, 90);
    if (serviceRows.length > 0) {
      const barsX = MARGIN + 236;
      doc.fontSize(8).font("Sans-Bold").fillColor(C.muted)
         .text("Vulnerabilidades por serviço", barsX, panelLineY);
      drawServiceBars(doc, barsX, panelLineY + 18, serviceRows, 259);
    }
    y += Math.max(radarH, serviceRows.length > 0 ? 18 + serviceRows.length * 30 : 0) + 20;

    // ── PRIORIDADES IMEDIATAS ─────────────────────────────────────────────
    const topGroups = [...rcaResult.groups]
      .sort((a, b) => {
        const ord: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (ord[a.topSeverity] ?? 4) - (ord[b.topSeverity] ?? 4);
      })
      .slice(0, 3);

    if (topGroups.length > 0) {
      execEnsure(40);
      y = drawSectionTitle(doc, "Prioridades Imediatas", y);
      const deadlineMap: Record<string, string> = {
        critical: "24–72 horas", high: "7 dias", medium: "30 dias", low: "90 dias",
      };
      topGroups.forEach(g => {
        const sColor   = severityColor(g.topSeverity);
        const sshT     = g.service.match(/^SSH \(OpenSSH_(\S+)/i);
        const dTitle   = sshT
          ? `Software OpenSSH ${sshT[1]} desatualizado${g.port !== null ? ` (porto ${g.port})` : ""}`
          : g.title;
        const titleH   = doc.fontSize(8).font("Sans-Bold").heightOfString(dTitle,           { width: CONTENT_W - 20 });
        const actionH  = doc.fontSize(7.5).font("Sans")    .heightOfString(`→ ${g.action}`, { width: CONTENT_W - 20 });
        const cardH    = 6 + titleH + 4 + actionH + 4 + 12 + 10;
        execEnsure(cardH + 8);
        doc.rect(MARGIN, y, CONTENT_W, cardH).fillColor(C.bg).fill();
        doc.rect(MARGIN, y, 4, cardH).fillColor(sColor).fill();
        doc.fontSize(8).font("Sans-Bold").fillColor(C.text)
           .text(dTitle, MARGIN + 12, y + 6, { width: CONTENT_W - 20 });
        y += 6 + titleH + 4;
        doc.fontSize(7.5).font("Sans").fillColor(C.brand)
           .text(`→ ${g.action}`, MARGIN + 12, y, { width: CONTENT_W - 20 });
        y += actionH + 4;
        doc.fontSize(7).font("Sans").fillColor(C.muted)
           .text(`Prazo recomendado: ${deadlineMap[g.topSeverity]}`, MARGIN + 12, y);
        y += 12 + 10;
      });
      y += 8;
    }

    if (vulns.length > 0) {
      execEnsure(60);
      y = drawSectionTitle(doc, "Riscos Identificados por Severidade", y);

      // Grupos multi-severidade aparecem em várias secções.
      // Regra: 1ª ocorrência = bloco completo; ocorrências seguintes = linha compacta.
      const renderedGroups = new Set<string>();
      const topSevSection: Record<string, string> = {
        critical: "CRÍTICAS", high: "ALTAS", medium: "MÉDIAS", low: "BAIXAS",
      };

      // Linha compacta para 2ª+ ocorrência do mesmo grupo.
      const drawExecGroupCompact = (group: RootCauseGroup, sColor: string, sev: "critical" | "high" | "medium" | "low") => {
        const secCount = group.counts[sev];
        const secSingular: Record<string, string> = { critical: "crítica", high: "alta", medium: "média", low: "baixa" };
        const secPlural:   Record<string, string> = { critical: "críticas", high: "altas", medium: "médias", low: "baixas" };
        const sevLbl = secCount === 1 ? secSingular[sev] : secPlural[sev];
        const sshT = group.service.match(/^SSH \(OpenSSH_(\S+)/i);
        const dTitle = sshT
          ? `Software OpenSSH ${sshT[1]} desatualizado${group.port !== null ? ` (porto ${group.port})` : ""}`
          : group.title;
        const cLine = `${dTitle} — ${secCount} ${sevLbl} (${group.counts.total} no total) — ver secção ${topSevSection[group.topSeverity]}`;
        const cH = doc.fontSize(8).font("Sans").heightOfString(cLine, { width: CONTENT_W - 28 });
        execEnsure(cH + 14);
        doc.rect(MARGIN + 10, y + 3, 5, 5).fillColor(sColor).fill();
        doc.fontSize(8).font("Sans").fillColor(C.muted)
           .text(cLine, MARGIN + 22, y, { width: CONTENT_W - 26 });
        y += cH + 10;
      };

      // Wrapper: bloco completo na 1ª ocorrência, compacto nas seguintes.
      const drawGroup = (group: RootCauseGroup, sColor: string, sev: "critical" | "high" | "medium" | "low") => {
        if (renderedGroups.has(group.key)) {
          drawExecGroupCompact(group, sColor, sev);
        } else {
          renderedGroups.add(group.key);
          drawExecGroup(group, sColor, sev);
        }
      };

      // CRÍTICAS — grupos com criticals + individuais críticos
      if (criticals.length > 0) {
        execEnsure(36);
        doc.rect(MARGIN, y, CONTENT_W, 22).fillColor("#fdf4ff").fill();
        doc.rect(MARGIN, y, 4, 22).fillColor(C.critical).fill();
        doc.fontSize(9).font("Sans-Bold").fillColor(C.critical)
           .text(
             `CRÍTICAS (${criticals.length}) — Ação imediata nas próximas 24 a 72 horas`,
             MARGIN + 12, y + 6, { width: CONTENT_W - 16 }
           );
        y += 24;
        rcaResult.groups.filter(g => g.counts.critical > 0)
          .forEach(g => drawGroup(g, C.critical, "critical"));
        rcaResult.individuals.filter(i => i.severity === "critical")
          .forEach(v => drawExecIndividual(v, C.critical));
        execEnsure(14);
        doc.fontSize(7.5).font("Sans").fillColor(C.brand)
           .text("→ Detalhe técnico completo no Relatório Técnico.", MARGIN + 22, y);
        y += 18;
      }

      // ALTAS — grupos com highs + individuais altos
      if (highs.length > 0) {
        execEnsure(36);
        doc.rect(MARGIN, y, CONTENT_W, 22).fillColor("#fff7f0").fill();
        doc.rect(MARGIN, y, 4, 22).fillColor(C.high).fill();
        doc.fontSize(9).font("Sans-Bold").fillColor(C.high)
           .text(
             `ALTAS (${highs.length}) — Resolução recomendada em 7 dias`,
             MARGIN + 12, y + 6, { width: CONTENT_W - 16 }
           );
        y += 24;
        rcaResult.groups.filter(g => g.counts.high > 0)
          .forEach(g => drawGroup(g, C.high, "high"));
        rcaResult.individuals.filter(i => i.severity === "high")
          .forEach(v => drawExecIndividual(v, C.high));
        execEnsure(14);
        doc.fontSize(7.5).font("Sans").fillColor(C.brand)
           .text("→ Detalhe técnico completo no Relatório Técnico.", MARGIN + 22, y);
        y += 18;
      }

      // MÉDIAS — grupos com mediums + parágrafo para individuais
      if (mediums.length > 0) {
        execEnsure(50);
        doc.rect(MARGIN, y, CONTENT_W, 22).fillColor("#fffbeb").fill();
        doc.rect(MARGIN, y, 4, 22).fillColor(C.warning).fill();
        doc.fontSize(9).font("Sans-Bold").fillColor("#92400e")
           .text(
             `MÉDIAS (${mediums.length}) — Resolução recomendada em 30 dias`,
             MARGIN + 12, y + 6, { width: CONTENT_W - 16 }
           );
        y += 24;
        rcaResult.groups.filter(g => g.counts.medium > 0)
          .forEach(g => drawGroup(g, C.warning, "medium"));
        const medIndividuals = rcaResult.individuals.filter(i => i.severity === "medium");
        if (medIndividuals.length > 0) {
          const medSummary = buildMediumIndividualsSummary(medIndividuals);
          const mH = doc.fontSize(8).font("Sans").heightOfString(medSummary, { width: CONTENT_W - 28 });
          execEnsure(mH + 28);
          doc.fontSize(8).font("Sans").fillColor(C.text)
             .text(medSummary, MARGIN + 22, y, { width: CONTENT_W - 26 });
          y += mH + 8;
        }
        execEnsure(14);
        doc.fontSize(7.5).font("Sans").fillColor(C.brand)
           .text(
             "→ Listagem individual de cada vulnerabilidade no Relatório Técnico.",
             MARGIN + 22, y
           );
        y += 18;
      }

      // BAIXAS — grupos com lows + individuais baixos
      if (lows.length > 0) {
        execEnsure(36);
        doc.rect(MARGIN, y, CONTENT_W, 22).fillColor("#eff6ff").fill();
        doc.rect(MARGIN, y, 4, 22).fillColor(C.low).fill();
        doc.fontSize(9).font("Sans-Bold").fillColor(C.low)
           .text(
             `BAIXAS (${lows.length}) — Resolução recomendada em 90 dias`,
             MARGIN + 12, y + 6, { width: CONTENT_W - 16 }
           );
        y += 24;
        rcaResult.groups.filter(g => g.counts.low > 0)
          .forEach(g => drawGroup(g, C.low, "low"));
        rcaResult.individuals.filter(i => i.severity === "low")
          .forEach(v => drawExecIndividual(v, C.low));
        execEnsure(14);
        doc.fontSize(7.5).font("Sans").fillColor(C.brand)
           .text("→ Detalhe técnico completo no Relatório Técnico.", MARGIN + 22, y);
        y += 18;
      }

      y += 6;
    }

    // ── PRÓXIMOS PASSOS + METODOLOGIA + REFERÊNCIAS ───────────────────────
    if (y + 60 > CONTENT_BOTTOM) execAddPage();

    y = drawSectionTitle(doc, "Próximos Passos Recomendados", y);
    const steps = buildNextSteps(overall, counts);
    steps.forEach((step, i) => {
      doc.rect(MARGIN, y, 20, 20).fillColor(C.brand).fill();
      doc.fontSize(9).font("Sans-Bold").fillColor(C.white)
         .text(String(i + 1), MARGIN, y + 6, { width: 20, align: "center" });
      doc.fontSize(9).font("Sans").fillColor(C.text)
         .text(step, MARGIN + 28, y + 5, { width: CONTENT_W - 28 });
      y += 28;
    });
    y += 10;

    if (y + 200 > CONTENT_BOTTOM) execAddPage();
    y = drawMethodologySection(doc, y, dataSources, scanLimitations, execAddPage);
    y = drawReferencesSection(doc, y, execAddPage);
    drawRunningFooter(doc, execPage);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Finding enrichment: translates raw scanner output into plain-language
// business impact descriptions, with severity classification.
//
// PRINCÍPIO: enrichFinding NUNCA reescreve descrições NVD reais.
// Uma descrição vinda do NVD é a verdade final. O enriquecimento existe
// apenas para findings SINTÉTICOS nossos (NIS2-*, deduções de porto,
// headers, email) que não têm descrição de utilizador.
// ---------------------------------------------------------------------------

export function enrichFinding(raw: string, cveId?: string): { critical: boolean; text: string } {
  // Guard: CVE real com descrição — devolve intocado.
  // Fonte estrutural preferida (cveId param); fallback: texto começa com "CVE-NNNN-NNNNN"
  // (formato de findings[] do scan-executor: "CVE-XXXX-N (CVSS N.N) — descrição").
  // raw !== structuralCveId garante que há descrição real (não só o cveId como fallback).
  const structuralCveId = cveId ?? (raw.match(/^(CVE-\d{4}-\d+)\b/)?.[1]);
  if (structuralCveId && /^CVE-\d{4}-\d+$/.test(structuralCveId) && raw !== structuralCveId) {
    return { critical: false, text: raw };
  }

  const r = raw.toLowerCase();

  if (/dmarc/i.test(raw)) {
    if (/\(aviso\)/i.test(raw))
      return { critical: false, text: "DMARC em modo de monitorização (p=none): a política existe mas não bloqueia emails não autenticados. Considere endurecer para quarantine ou reject." };
    return { critical: true,  text: "Ausência de registo DMARC: sem esta política, atacantes podem enviar emails falsos em nome do domínio (phishing/spoofing)." };
  }
  if (/spf/i.test(raw)) {
    if (/\(aviso\)/i.test(raw))
      return { critical: false, text: "SPF configurado de forma permissiva: a política existe mas autoriza envio a partir de qualquer servidor, reduzindo a proteção contra spoofing." };
    return { critical: true,  text: "Ausência de registo SPF: sem esta validação, qualquer servidor pode enviar email em nome do domínio." };
  }
  if (/dkim/i.test(raw)) {
    if (/\(aviso\)/i.test(raw))
      return { critical: false, text: "DKIM não detectado nos selectores comuns — pode estar configurado com um selector personalizado. Confirme com o seu fornecedor de email." };
    return { critical: true,  text: "Ausência de assinatura DKIM: os emails do domínio não têm assinatura criptográfica, facilitando a falsificação de mensagens." };
  }

  if (/27017|mongodb/i.test(raw))
    return { critical: true,  text: "Porta 27017 Exposta (Base de Dados MongoDB): O serviço de base de dados está acessível publicamente, aumentando drasticamente a superfície de ataque." };
  if (/3306|mysql/i.test(raw))
    return { critical: true,  text: "Porta 3306 Exposta (Base de Dados MySQL): O serviço de base de dados está exposto à Internet — deve ser restrito a ligações internas." };
  if (/5432|postgres/i.test(raw))
    return { critical: true,  text: "Porta 5432 Exposta (Base de Dados PostgreSQL): O serviço de base de dados está exposto à Internet — deve ser restrito a ligações internas." };
  if (/6379|redis/i.test(raw))
    return { critical: true,  text: "Porta 6379 Exposta (Redis): Serviço de cache em memória acessível publicamente — alvo frequente de ataques de ransomware." };
  if (/1433|mssql|sql.server/i.test(raw))
    return { critical: true,  text: "Porta 1433 Exposta (SQL Server): Base de dados Microsoft exposta à Internet — restrinja o acesso por firewall." };

  if (/porta.*22|22.*ssh|ssh/i.test(r) || /port.*22/i.test(r))
    return { critical: false, text: "Porta 22 Exposta (Acesso Remoto SSH): O painel de administração remota do servidor está acessível publicamente. Restrinja o acesso por IP ou exija VPN corporativa." };
  if (/porta.*80|port.*80|http\b.*aberto|http\b.*open/i.test(r))
    return { critical: false, text: "Porta 80 Aberta (HTTP Inseguro): O servidor web aceita ligações sem encriptação (texto limpo). Configure o redirecionamento automático obrigatório para HTTPS (porta 443)." };
  if (/3389|rdp|remote.desktop/i.test(raw))
    return { critical: true,  text: "Porta 3389 Exposta (Acesso Remoto Windows/RDP): Painel de controlo remoto exposto — alvo preferencial de ataques de força bruta e ransomware." };
  // Âncoras de contexto: exige "porto 21" / "port 21" ou a palavra isolada "ftp".
  // Evita falsos positivos em versões NVD como "2.4.21" que disparariam /21\b/.
  if (/\bporto?\s+21\b|\bftp\b/i.test(r))
    return { critical: false, text: "Porta 21 Aberta (FTP): Protocolo de transferência de ficheiros sem encriptação exposto. Substitua por SFTP (porta 22) ou FTPS." };
  if (/\bporto?\s+23\b|\btelnet\b/i.test(r))
    return { critical: true,  text: "Porta 23 Aberta (Telnet): Protocolo obsoleto e sem encriptação — substitua imediatamente por SSH." };

  if (/csp|content.security/i.test(raw))
    return { critical: false, text: "Política de Segurança de Conteúdo (CSP) Permissiva: A política HTTP detetada permite execução de scripts inseguros (unsafe-inline/unsafe-eval), vulnerabilizando a aplicação a ataques de injeção de código." };
  if (/hsts|strict.transport/i.test(raw))
    return { critical: false, text: "HSTS Ausente ou Insuficiente: Sem esta política, os browsers podem aceder ao site por HTTP não encriptado, expondo utilizadores a ataques de interceção (man-in-the-middle)." };
  if (/x.frame|clickjack/i.test(raw))
    return { critical: false, text: "Proteção contra Clickjacking Ausente (X-Frame-Options): O site pode ser embutido em páginas maliciosas para enganar utilizadores a clicarem em elementos ocultos." };
  if (/x.content.type|mime.sniff/i.test(raw))
    return { critical: false, text: "X-Content-Type-Options Ausente: O browser pode interpretar ficheiros com um tipo de conteúdo incorreto, abrindo vetores de ataque." };
  if (/referrer.policy/i.test(raw))
    return { critical: false, text: "Referrer-Policy Ausente ou Permissiva: O URL completo das páginas pode ser partilhado com sites de terceiros, expondo dados de navegação." };
  if (/tls|ssl|certificado|certif/i.test(r))
    return { critical: false, text: "Problema de Certificado TLS/SSL: " + raw };

  // Fallback — return original with classification based on keywords
  const isCritical = /crítico|critical|grave|high|critical/i.test(raw);
  return { critical: isCritical, text: raw };
}



// ---------------------------------------------------------------------------
// DNS record examples for email-related vulnerabilities
// Gives the user the exact TXT record to copy into their DNS provider.
// ---------------------------------------------------------------------------

function getDnsExample(cveId: string, component: string, target: string): string | null {
  const id = (cveId + " " + component).toLowerCase();
  const domain = target.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (/spf/i.test(id)) {
    return (
      `Registo TXT a publicar no domínio raiz ("@") em ${domain}:\n` +
      `  v=spf1 mx ~all\n` +
      `  (Substitui "mx" pelos servidores de email do teu fornecedor, ex: include:_spf.google.com)`
    );
  }
  if (/dmarc/i.test(id)) {
    return (
      `Registo TXT a publicar em _dmarc.${domain}:\n` +
      `  v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100`
    );
  }
  if (/dkim/i.test(id)) {
    return (
      `Registo TXT a publicar em default._domainkey.${domain}:\n` +
      `  Obtém o valor da chave pública DKIM no painel do teu servidor/fornecedor de email (ex: Google Workspace, Microsoft 365)`
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// TECHNICAL REPORT
// ---------------------------------------------------------------------------

async function buildTechnicalReport(
  scan: Scan, vulns: PdfVuln[], org: Org,
  combined: CombinedArticleScore[], displayOverall: number, hasQuestionnaire: boolean,
  dataSources: string[], scanLimitations: string[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false,
      info: { Title: "CISPLAN — Relatório Técnico NIS2", Author: "CISPLAN", Creator: "CISPLAN" } });
    doc.registerFont("Sans",      FONT_REGULAR);
    doc.registerFont("Sans-Bold", FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const results   = (scan?.results ?? {}) as Record<string, any>;
    const overall   = displayOverall;
    const openPorts: Array<{ port: number; protocol: string; service: string; product?: string; version?: string; cves: string[] }> =
      results.openPorts ?? [];

    // ── PAGE 1: COVER ──────────────────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawCoverPage(doc, scan, overall, "RELATÓRIO TÉCNICO NIS2", "CONFIDENCIAL — USO RESTRITO");

    // ── PAGE 2: METADADOS + PORTOS & SERVIÇOS ─────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
    let y = 90;
    let techPage = 2;
    const techAddPage = () => {
      drawRunningFooter(doc, techPage++);
      doc.addPage({ size: "A4", margin: 0 });
      drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
      y = 90;
    };

    // Metadata grid
    y = drawSectionTitle(doc, "Metadados do Scan", y);
    const c = vulns.filter(v => v.severity === "critical").length;
    const a = vulns.filter(v => v.severity === "high").length;
    const m = vulns.filter(v => v.severity === "medium").length;
    const b = vulns.filter(v => v.severity === "low").length;
    const metaRows = [
      ["Alvo",          scan?.target ?? "—"],
      ["Modo de scan",  scan?.mode === "sme" ? "PME / Entidade Importante" : "Cadeia de Abastecimento"],
      ["Estado",        ({ completed: "Concluído", running: "Em execução", pending: "Na fila", failed: "Falhou" } as Record<string, string>)[scan?.status ?? ""] ?? scan?.status ?? "—"],
      ["Início",        fmtFull(scan?.startedAt)],
      ["Conclusão",     fmtFull(scan?.completedAt)],
      ["Score global",  `${overall}/100 — ${scoreLabel(overall)}${hasQuestionnaire ? " (combinado scan + questionário)" : " (scan)"}`],
      ["Vulnerabilidades", `${vulns.length} (${sev(c,"crítica","críticas")}, ${sev(a,"alta","altas")}, ${sev(m,"média","médias")}, ${sev(b,"baixa","baixas")})`],
    ];
    metaRows.forEach(([label, val], i) => {
      const rowBg = i % 2 === 0 ? C.bg : C.white;
      doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(rowBg).fill();
      doc.fontSize(8.5).font("Sans-Bold").fillColor(C.muted)
         .text(label, MARGIN + 6, y + 5, { width: 120 });
      doc.fontSize(8.5).font("Sans").fillColor(C.text)
         .text(String(val), MARGIN + 130, y + 5, { width: CONTENT_W - 136 });
      y += 18;
    });
    y += 14;

    // openPorts.cves já foi filtrado pelo scan-executor (apenas CVEs NVD-confirmados).
    // Mostrar TODOS os portos: badge vermelho com contagem para os que têm CVEs; "—" para os limpos.
    const withCvesCount    = openPorts.filter(p => (p.cves ?? []).length > 0).length;
    const withoutCvesCount = openPorts.length - withCvesCount;

    y = drawSectionTitle(doc, "Portos Analisados", y);
    if (openPorts.length > 0) {
      // Summary line
      doc.fontSize(7.5).font("Sans").fillColor(C.muted)
         .text(
           `${openPorts.length} porta(s) analisada(s) · ${withCvesCount} com vulnerabilidades · ${withoutCvesCount} sem CVEs conhecidos.`,
           MARGIN, y + 1, { width: CONTENT_W }
         );
      y += 16;
      // Table header
      doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(C.navy).fill();
      doc.fontSize(8).font("Sans-Bold").fillColor(C.white);
      doc.text("Porto",            MARGIN + 6,   y + 5, { width: 50 });
      doc.text("Protocolo",        MARGIN + 60,  y + 5, { width: 60 });
      doc.text("Serviço",          MARGIN + 125, y + 5, { width: 100 });
      doc.text("Produto / Versão", MARGIN + 230, y + 5, { width: 160 });
      doc.text("CVEs",             MARGIN + 395, y + 5, { width: 60, align: "center" });
      y += 18;
      openPorts.slice(0, 20).forEach((p, i) => {
        if (y + 18 > CONTENT_BOTTOM) techAddPage();
        const rowBg = i % 2 === 0 ? C.bg : C.white;
        doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(rowBg).fill();
        doc.fontSize(8).font("Sans-Bold").fillColor(C.brand)
           .text(String(p.port), MARGIN + 6, y + 5, { width: 50 });
        doc.fontSize(8).font("Sans").fillColor(C.muted)
           .text(p.protocol.toUpperCase(), MARGIN + 60, y + 5, { width: 60 });
        doc.fillColor(C.text).text(p.service, MARGIN + 125, y + 5, { width: 100 });
        doc.fillColor(C.muted).text(truncate(`${p.product ?? ""} ${p.version ?? ""}`.trim() || "—", 35), MARGIN + 230, y + 5, { width: 160 });
        const cveCount = (p.cves ?? []).length;
        if (cveCount > 0) {
          doc.rect(MARGIN + 398, y + 3, 48, 13).fillColor(C.danger).fill();
          doc.fontSize(7.5).font("Sans-Bold").fillColor(C.white)
             .text(`${cveCount} CVE${cveCount > 1 ? "s" : ""}`, MARGIN + 398, y + 6, { width: 48, align: "center" });
        } else {
          doc.fontSize(7.5).font("Sans").fillColor(C.muted)
             .text("—", MARGIN + 398, y + 6, { width: 48, align: "center" });
        }
        y += 18;
      });
      if (openPorts.length > 20) {
        doc.fontSize(8).font("Sans").fillColor(C.muted)
           .text(`+ ${openPorts.length - 20} porto(s) adicionais — ver detalhe completo na plataforma.`, MARGIN, y + 4);
        y += 18;
      }
    } else {
      doc.rect(MARGIN, y, CONTENT_W, 30).fillColor(C.bg).fill();
      doc.fontSize(9).font("Sans").fillColor(C.success)
         .text("✓ Nenhum porto exposto detetado nas fontes consultadas.", MARGIN + 10, y + 10);
      y += 30;
    }
    y += 6;

    // ── VULNERABILIDADES ───────────────────────────────────────────────────
    if (y + 70 > CONTENT_BOTTOM) techAddPage();

    y = drawSectionTitle(doc, `Vulnerabilidades Encontradas (${vulns.length})`, y);

    // ── Resumo por Causa Raiz (síntese antes da lista individual) ─────────
    if (vulns.length > 0) {
      const techRca = aggregateByRootCause(vulns, openPorts);
      if (techRca.groups.length > 0) {
        doc.fontSize(8).font("Sans-Bold").fillColor(C.text)
           .text("Resumo por causa raiz:", MARGIN, y);
        y += 14;
        techRca.groups.forEach((g) => {
          const sshM = g.service.match(/^SSH \(OpenSSH_(\S+)/i);
          const dispSvc = sshM ? `OpenSSH ${sshM[1]}` : g.service;
          const dispVer = sshM ? null : g.version;
          const line = `${dispSvc}${dispVer ? ` ${dispVer}` : ""}${g.port !== null ? ` (porto ${g.port})` : ""}: ` +
            `${g.counts.total} CVEs — ` +
            [
              g.counts.critical > 0 ? `${g.counts.critical} crít.` : "",
              g.counts.high     > 0 ? `${g.counts.high} alt.`      : "",
              g.counts.medium   > 0 ? `${g.counts.medium} méd.`    : "",
              g.counts.low      > 0 ? `${g.counts.low} baixa${g.counts.low !== 1 ? "s" : ""}` : "",
            ].filter(Boolean).join(" · ");
          const lH = doc.fontSize(7.5).font("Sans").heightOfString(line, { width: CONTENT_W - 16 });
          if (y + lH > CONTENT_BOTTOM) techAddPage();
          doc.rect(MARGIN, y + 2, 3, lH).fillColor(severityColor(g.topSeverity)).fill();
          doc.fontSize(7.5).font("Sans").fillColor(C.muted)
             .text(line, MARGIN + 8, y, { width: CONTENT_W - 12 });
          y += lH + 4;
        });
        if (techRca.individuals.length > 0) {
          const indLine = `${techRca.individuals.length} finding${techRca.individuals.length !== 1 ? "s" : ""} individu${techRca.individuals.length !== 1 ? "ais" : "al"} (sintéticos de configuração e serviços isolados)`;
          doc.fontSize(7.5).font("Sans").fillColor(C.muted)
             .text(indLine, MARGIN + 8, y, { width: CONTENT_W - 12 });
          y += 14;
        }
        doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y)
           .strokeColor(C.border).lineWidth(0.4).stroke();
        y += 12;
      }
    }

    if (vulns.length > 0) {
      const sorted = [...vulns].sort((a, b) => parseFloat(b.cvssScore) - parseFloat(a.cvssScore));
      const TEXT_W = CONTENT_W - 20; // width available for description/remediation text

      sorted.forEach((v) => {
        // Calculate actual heights dynamically to prevent overlap
        const descText  = v.description ?? "";
        const remText   = v.remediation ? `↳ ${v.remediation}` : "";
        const dnsExample = getDnsExample(v.cveId, v.affectedComponent, scan?.target ?? "");
        const descH = doc.fontSize(8).font("Sans").heightOfString(descText, { width: TEXT_W });
        const remH  = remText
          ? doc.fontSize(8).font("Sans").heightOfString(remText, { width: TEXT_W }) + 4
          : 0;
        const dnsH  = dnsExample
          ? doc.fontSize(7.5).font("Sans").heightOfString(dnsExample, { width: TEXT_W - 12 }) + 18
          : 0;
        const HEADER_H = 20; // CVE ID row
        const PADDING  = 14; // top + bottom breathing room
        const rowH = HEADER_H + descH + remH + dnsH + PADDING;

        if (y + rowH > CONTENT_BOTTOM) techAddPage();
        const sColor = severityColor(v.severity);

        // Left accent bar (full card height)
        doc.rect(MARGIN, y, 4, rowH - 4).fillColor(sColor).fill();

        // CVE ID line
        doc.fontSize(9).font("Sans-Bold").fillColor(C.text)
           .text(v.cveId, MARGIN + 12, y + 4, { width: 200 });
        doc.fontSize(8).font("Sans").fillColor(C.muted)
           .text(
             `CVSS ${v.cvssScore}  ·  ${v.affectedComponent}${v.port ? ` :${v.port}` : ""}`,
             MARGIN + 215, y + 5, { width: 185 }
           );

        // Severity badge (top-right)
        doc.rect(MARGIN + 415, y + 2, 80, 14).fillColor(sColor).fill();
        doc.fontSize(7.5).font("Sans-Bold").fillColor(C.white)
           .text(severityLabel(v.severity).toUpperCase(), MARGIN + 415, y + 5, { width: 80, align: "center" });

        // Description — placed right below header row
        const descY = y + HEADER_H;
        doc.fontSize(8).font("Sans").fillColor(C.muted)
           .text(descText, MARGIN + 12, descY, { width: TEXT_W });

        // Remediation hint — placed below description
        if (remText) {
          const remY = descY + descH + 4;
          doc.fontSize(8).font("Sans").fillColor(C.brand)
             .text(remText, MARGIN + 12, remY, { width: TEXT_W });
        }

        // DNS record example box — concrete TXT record to copy/paste
        if (dnsExample) {
          const dnsY = descY + descH + remH + (remText ? 4 : 0) + 4;
          doc.rect(MARGIN + 12, dnsY, TEXT_W, dnsH - 4).fillColor(C.bg).fill();
          doc.rect(MARGIN + 12, dnsY, 3, dnsH - 4).fillColor(C.warning).fill();
          doc.fontSize(7).font("Sans-Bold").fillColor(C.muted)
             .text("Registo DNS (copiar para o seu fornecedor de domínio):", MARGIN + 20, dnsY + 4, { width: TEXT_W - 12 });
          doc.fontSize(7.5).font("Sans").fillColor(C.navy)
             .text(dnsExample, MARGIN + 20, dnsY + 14, { width: TEXT_W - 12 });
        }

        // Separator line
        doc.moveTo(MARGIN, y + rowH - 2).lineTo(PAGE_W - MARGIN, y + rowH - 2)
           .strokeColor(C.border).lineWidth(0.4).stroke();
        y += rowH;
      });
    } else {
      doc.rect(MARGIN, y, CONTENT_W, 36).fillColor("#ecfdf5").fill();
      doc.fontSize(10).font("Sans-Bold").fillColor(C.success)
         .text("✓ Nenhuma vulnerabilidade conhecida encontrada.", MARGIN + 12, y + 12);
      y += 36;
    }

    // ── NIS2 COMPLIANCE POR ARTIGO ─────────────────────────────────────────
    if (y + 110 > CONTENT_BOTTOM) techAddPage();
    y = drawSectionTitle(doc, "Conformidade NIS2 — Detalhe por Artigo (Art. 21(2))", y);

    // Intro text
    doc.fontSize(8).font("Sans").fillColor(C.muted)
       .text(
         "Avaliação automatizada baseada nos serviços expostos, vulnerabilidades detetadas e configurações de segurança analisadas. " +
         "Cada artigo reflete um domínio de conformidade da Diretiva NIS2, transposta em Portugal pelo Decreto-Lei n.º 125/2025.",
         MARGIN, y, { width: CONTENT_W }
       );
    y += 28;
    const FIND_W = CONTENT_W - 52;
    combined.forEach((s) => {
      const rawFindings = s.findings?.filter(Boolean) ?? [];
      const hasFail = rawFindings.length > 0;

      // Enriquecer e deduplicar por texto — múltiplos CVEs do mesmo serviço
      // enriquecem para o mesmo texto (ex: "Porta 22 Exposta") → mostrar uma vez.
      const _enrichedAll = rawFindings.slice(0, 8).map((f) => enrichFinding(f));
      const _seenEnriched = new Set<string>();
      const enriched = _enrichedAll
        .filter(ef => !_seenEnriched.has(ef.text) && (_seenEnriched.add(ef.text), true))
        .slice(0, 4);
      const findingHeights = enriched.map(ef =>
        doc.fontSize(7.5).font("Sans").heightOfString(ef.text, { width: FIND_W }) + 6
      );
      const totalFindH = findingHeights.reduce((a, b) => a + b, 0);
      const rowH = 34 + (hasFail ? totalFindH + 4 : 14);

      if (y + rowH > CONTENT_BOTTOM) techAddPage();
      const artInfo = NIS2_ARTICLES[s.article];
      const BAR_MAX = 160;
      const displayScore = s.combinedScore;
      const isNull = displayScore === null;
      const barFill = isNull ? 0 : Math.max(2, Math.round((displayScore! / 100) * BAR_MAX));
      const col = isNull ? C.muted : scoreColor(displayScore!);

      // Score circle (small) — "N/A" para medidas sem score disponível
      doc.circle(MARGIN + 16, y + 16, 14).fillColor(col).fill();
      doc.fontSize(8).font("Sans-Bold").fillColor(C.white)
         .text(isNull ? "N/A" : String(displayScore), MARGIN + 4, y + 11, { width: 24, align: "center" });

      // Article + short title
      doc.fontSize(9).font("Sans-Bold").fillColor(C.text)
         .text(s.article, MARGIN + 38, y + 2, { width: 100 });
      doc.fontSize(8).font("Sans").fillColor(C.muted)
         .text(artInfo?.short ?? "", MARGIN + 38, y + 14, { width: 140 });

      // Progress bar
      doc.rect(MARGIN + 185, y + 10, BAR_MAX, 8).fillColor(C.border).fill();
      doc.rect(MARGIN + 185, y + 10, barFill, 8).fillColor(col).fill();

      // Scope description
      doc.fontSize(7.5).font("Sans").fillColor(C.muted)
         .text("Âmbito: " + (artInfo?.desc ?? s.title), MARGIN + 360, y + 2, { width: CONTENT_W - 315 });

      // Findings with colored square indicators
      if (hasFail) {
        let fy = y + 30;
        enriched.forEach((ef, fi) => {
          const fColor = ef.critical ? C.critical : C.warning;
          doc.rect(MARGIN + 38, fy + 1, 6, 6).fillColor(fColor).fill();
          doc.fontSize(7.5).font("Sans").fillColor(ef.critical ? C.critical : C.text)
             .text(ef.text, MARGIN + 48, fy, { width: FIND_W });
          fy += findingHeights[fi];
        });
      } else if (isNull && !s.scannable) {
        // Medida organizacional sem questionário preenchido
        doc.rect(MARGIN + 38, y + 30, 6, 6).fillColor(C.muted).fill();
        doc.fontSize(7.5).font("Sans").fillColor(C.muted)
           .text(
             "Não avaliável por scan — requer questionário de autoavaliação (medida organizacional não observável externamente).",
             MARGIN + 48, y + 30, { width: FIND_W }
           );
      } else if (isNull) {
        doc.rect(MARGIN + 38, y + 30, 6, 6).fillColor(C.muted).fill();
        doc.fontSize(7.5).font("Sans").fillColor(C.muted)
           .text("Sem dados suficientes para avaliação.", MARGIN + 48, y + 30, { width: FIND_W });
      } else if (!s.scannable && s.source === "questionnaire") {
        // Score obtido exclusivamente via questionário (medida organizacional)
        doc.rect(MARGIN + 38, y + 30, 6, 6).fillColor(C.brand).fill();
        doc.fontSize(7.5).font("Sans").fillColor(C.brand)
           .text("Score obtido via Questionário NIS2 (medida organizacional).", MARGIN + 48, y + 30, { width: FIND_W });
      } else {
        doc.rect(MARGIN + 38, y + 30, 6, 6).fillColor(C.success).fill();
        doc.fontSize(7.5).font("Sans").fillColor(C.success)
           .text("Sem problemas detetados neste domínio.", MARGIN + 48, y + 30, { width: FIND_W });
      }

      doc.moveTo(MARGIN, y + rowH - 2).lineTo(PAGE_W - MARGIN, y + rowH - 2)
         .strokeColor(C.border).lineWidth(0.3).stroke();
      y += rowH;
    });
    y += 10;

    // ── METODOLOGIA + REFERÊNCIAS ──────────────────────────────────────────
    if (y + 200 > CONTENT_BOTTOM) techAddPage();
    y = drawMethodologySection(doc, y, dataSources, scanLimitations, techAddPage);
    y = drawReferencesSection(doc, y, techAddPage);
    drawRunningFooter(doc, techPage);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// COVER PAGE
// ---------------------------------------------------------------------------

function drawCoverPage(
  doc: PDFKit.PDFDocument,
  scan: Scan,
  overall: number,
  reportType: string,
  classification: string
): void {
  // Dark navy background — top 55%
  doc.rect(0, 0, PAGE_W, PAGE_H * 0.55).fillColor(C.navy).fill();
  // Accent strip
  doc.rect(0, PAGE_H * 0.55, PAGE_W, 5).fillColor(C.brand).fill();
  // White bottom
  doc.rect(0, PAGE_H * 0.55 + 5, PAGE_W, PAGE_H * 0.45 - 5).fillColor(C.white).fill();

  // ── Brand / Logo area ──
  doc.fontSize(32).font("Sans-Bold").fillColor(C.white)
     .text("CISPLAN", MARGIN, 52);
  doc.fontSize(11).font("Sans").fillColor("#93c5fd")
     .text("Plataforma de Conformidade NIS2", MARGIN, 92);

  // ── Score circle (large) ──
  const cx = PAGE_W / 2, cy = 185;
  const radius = 60;
  // Outer ring
  doc.circle(cx, cy, radius + 6).fillColor(C.navyMid).fill();
  doc.circle(cx, cy, radius).fillColor(scoreColor(overall)).fill();
  doc.fontSize(38).font("Sans-Bold").fillColor(C.white)
     .text(String(overall), cx - 35, cy - 22, { width: 70, align: "center" });
  doc.fontSize(13).font("Sans").fillColor(C.white)
     .text("/ 100", cx - 30, cy + 18, { width: 60, align: "center" });

  // Score label below circle
  doc.fontSize(13).font("Sans-Bold").fillColor(scoreColor(overall))
     .text(scoreLabel(overall), 0, cy + 75, { align: "center", width: PAGE_W });

  // ── Bottom white section ──
  const by = PAGE_H * 0.55 + 28;

  // Classification badge — largura calculada ao texto (DejaVu mais larga que Helvetica)
  const badgeW = Math.max(110, doc.fontSize(8).font("Sans-Bold").widthOfString(classification) + 16);
  doc.rect(MARGIN, by, badgeW, 20).fillColor(C.danger).fill();
  doc.fontSize(8).font("Sans-Bold").fillColor(C.white)
     .text(classification, MARGIN, by + 6, { width: badgeW, align: "center", lineBreak: false });

  // Report type title
  doc.fontSize(20).font("Sans-Bold").fillColor(C.text)
     .text(reportType, MARGIN, by + 34, { width: CONTENT_W });

  // Divider
  doc.moveTo(MARGIN, by + 64).lineTo(PAGE_W - MARGIN, by + 64)
     .strokeColor(C.border).lineWidth(1).stroke();

  // Target + date
  const target = scan?.target ?? "—";
  doc.fontSize(10).font("Sans-Bold").fillColor(C.muted)
     .text("Alvo da análise:", MARGIN, by + 76);
  doc.fontSize(14).font("Sans-Bold").fillColor(C.brand)
     .text(target, MARGIN, by + 92);
  doc.fontSize(9).font("Sans").fillColor(C.muted)
     .text(`Data: ${fmtFull(scan?.completedAt ?? scan?.createdAt)}   ·   Scan ID: #${scan?.id ?? "—"}`, MARGIN, by + 114);

  // Bottom footer bar
  doc.rect(0, PAGE_H - 46, PAGE_W, 46).fillColor(C.navyMid).fill();
  doc.fontSize(7.5).font("Sans").fillColor("#93c5fd")
     .text(
       "CISPLAN · cisplan.com   ·   NIS2 Directiva (UE) 2022/2555 · DL 125/2025   ·   CNCS — Centro Nacional de Cibersegurança",
       MARGIN, PAGE_H - 28, { align: "center", width: CONTENT_W }
     );
}

// ---------------------------------------------------------------------------
// Running header & footer (pages 2+)
// ---------------------------------------------------------------------------

function drawRunningHeader(doc: PDFKit.PDFDocument, target: string, type: string): void {
  doc.rect(0, 0, PAGE_W, 50).fillColor(C.navy).fill();
  doc.rect(0, 50, PAGE_W, 3).fillColor(C.brand).fill();

  doc.fontSize(12).font("Sans-Bold").fillColor(C.white)
     .text("CISPLAN", MARGIN, 16);
  doc.fontSize(8).font("Sans").fillColor("#93c5fd")
     .text(`Relatório ${type} NIS2`, MARGIN + 80, 19);
  doc.fontSize(8).font("Sans").fillColor(C.muted)
     .text(target, 0, 19, { align: "right", width: PAGE_W - MARGIN });
}

function drawRunningFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  doc.rect(0, PAGE_H - 32, PAGE_W, 32).fillColor(C.bg).fill();
  doc.moveTo(MARGIN, PAGE_H - 32).lineTo(PAGE_W - MARGIN, PAGE_H - 32)
     .strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fontSize(7).font("Sans").fillColor(C.muted)
     .text(
       `CISPLAN · Relatório gerado em ${fmt(new Date())} · Confidencial`,
       MARGIN, PAGE_H - 20, { width: CONTENT_W - 40 }
     );
  doc.fontSize(7).font("Sans-Bold").fillColor(C.brand)
     .text(`Página ${pageNum}`, 0, PAGE_H - 20, { width: PAGE_W - MARGIN, align: "right" });
}

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.rect(MARGIN, y, 4, 18).fillColor(C.brand).fill();
  doc.fontSize(11).font("Sans-Bold").fillColor(C.text)
     .text(title, MARGIN + 12, y + 3);
  doc.moveTo(MARGIN, y + 22).lineTo(PAGE_W - MARGIN, y + 22)
     .strokeColor(C.border).lineWidth(0.5).stroke();
  return y + 30;
}

function drawScoreCircle(doc: PDFKit.PDFDocument, score: number, x: number, y: number): void {
  const cx = x + 30, cy = y + 30;
  doc.circle(cx, cy, 32).fillColor(scoreColor(score)).fill();
  doc.fontSize(20).font("Sans-Bold").fillColor(C.white)
     .text(String(score), cx - 22, cy - 13, { width: 44, align: "center" });
  doc.fontSize(8).font("Sans").fillColor(C.white)
     .text("/ 100", cx - 20, cy + 10, { width: 40, align: "center" });
}

/** Exported for testing: builds the methodology bullet list from dataSources. */
export function buildMethodologyBullets(dataSources: string[]): Array<{ label: string; detail: string }> {
  const hasCensys      = dataSources.includes("censys");
  const hasNvd         = dataSources.includes("nvd");
  const hasHttpHeaders = dataSources.includes("httpHeaders");

  const perimeterDetail = hasCensys
    ? "Identificação de portas abertas, serviços ativos e vulnerabilidades conhecidas (CVEs) através das plataformas Shodan InternetDB e Censys."
    : "Identificação de portas abertas, serviços ativos e vulnerabilidades conhecidas (CVEs) via Shodan InternetDB" +
      (hasNvd ? "; validação de versões e intervalos de afectação via NVD (National Vulnerability Database)." : ".");

  const tlsDetail = hasCensys
    ? "Avaliação de certificados digitais e protocolos TLS/SSL (incluindo deteção de TLS 1.0/1.1 obsoletos) nas portas normalizadas (443, 8443), combinando dados Censys com verificação directa TCP/TLS. A verificação de cifras fracas individuais (RC4/3DES) não está incluída nesta versão."
    : "Verificação directa TCP/TLS de certificados digitais e protocolos (incluindo deteção de TLS 1.0/1.1 obsoletos) nas portas normalizadas (443, 8443). A verificação de cifras fracas individuais (RC4/3DES) não está incluída nesta versão.";

  return [
    { label: "Mapeamento de Perímetro",      detail: perimeterDetail },
    { label: "Segurança de Identidade",      detail: "Verificação de fugas de credenciais corporativas associadas ao domínio na base de dados Have I Been Pwned (HIBP)." },
    { label: "Encriptação em Trânsito",      detail: tlsDetail },
    { label: "Validação de Email e DNS",     detail: "Análise das configurações DNS públicas do domínio (registos SPF, DMARC e DKIM)." },
    ...(hasHttpHeaders ? [{ label: "Cabeçalhos de Segurança HTTP", detail: "Verificação dos cabeçalhos de segurança HTTP (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) na resposta do servidor web." }] : []),
  ];
}

function drawMethodologySection(doc: PDFKit.PDFDocument, y: number, dataSources: string[], scanLimitations: string[], ensurePage: (needed: number) => void): number {
  if (y + 60 > CONTENT_BOTTOM) { ensurePage(60); y = 90; }
  y = drawSectionTitle(doc, "Metodologia & Limitações Técnicas", y);

  const intro =
    "Este relatório foi gerado através de uma análise sem agentes (agentless scan), " +
    "recorrendo exclusivamente a fontes de dados externas e técnicas de inteligência de fontes abertas (OSINT). " +
    "As auditorias basearam-se nas seguintes plataformas e protocolos:";

  const introH = doc.fontSize(8).font("Sans").heightOfString(intro, { width: CONTENT_W, lineGap: 2 });
  if (y + introH > CONTENT_BOTTOM) { ensurePage(introH); y = 90; }
  doc.fontSize(8).font("Sans").fillColor(C.text)
     .text(intro, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
  y += introH + 8;

  const categories = buildMethodologyBullets(dataSources);

  categories.forEach((cat) => {
    const estH = doc.fontSize(8).font("Sans").heightOfString(cat.label + ": " + cat.detail, { width: CONTENT_W - 8 });
    if (y + estH + 8 > CONTENT_BOTTOM) { ensurePage(estH + 8); y = 90; }
    doc.rect(MARGIN, y, 3, 12).fillColor(C.brand).fill();
    doc.fontSize(8).font("Sans-Bold").fillColor(C.text)
       .text(cat.label + ": ", MARGIN + 8, y, { continued: true, width: CONTENT_W - 8 });
    doc.font("Sans").fillColor(C.muted)
       .text(cat.detail, { width: CONTENT_W - 8 });
    y = doc.y + 8;
  });

  const limitTitle = "Limitações do Diagnóstico Exterior:";
  const limits =
    "Por ser uma análise estritamente externa (do ponto de vista do atacante), este teste não acede a sistemas internos, " +
    "bases de dados protegidas, aplicações autenticadas ou redes privadas (VPNs/LANs). Consequentemente, vulnerabilidades " +
    "internas, regras de firewalls locais e controlos organizacionais (políticas escritas, planos de formação ou rotinas de " +
    "cópias de segurança) não são avaliados automaticamente. Para auditar estes controlos específicos da NIS2, a organização " +
    "deve preencher o Questionário de Autoavaliação NIS2 (42 controlos) disponível no painel da plataforma. " +
    "Os resultados aqui apresentados baseiam-se em heurísticas de risco e devem ser validados por técnicos de sistemas.";
  const limTitleH = doc.fontSize(8).font("Sans-Bold").heightOfString(limitTitle, { width: CONTENT_W });
  const limitsH   = doc.fontSize(8).font("Sans").heightOfString(limits, { width: CONTENT_W, lineGap: 2 });
  if (y + 4 + limTitleH + 14 + 12 > CONTENT_BOTTOM) { ensurePage(4 + limTitleH + 14 + 12); y = 90; }
  y += 4;
  doc.fontSize(8).font("Sans-Bold").fillColor(C.warning).text(limitTitle, MARGIN, y);
  y += 14;
  if (y + limitsH + 6 > CONTENT_BOTTOM) { ensurePage(limitsH + 6); y = 90; }
  doc.fontSize(8).font("Sans").fillColor(C.muted)
     .text(limits, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
  y += limitsH + 6;

  if (scanLimitations.length > 0) {
    const specTitleH = doc.fontSize(8).font("Sans-Bold").heightOfString("Limitações específicas deste scan:", { width: CONTENT_W });
    const firstItemH = doc.fontSize(8).font("Sans").heightOfString(`• ${scanLimitations[0]}`, { width: CONTENT_W - 8, lineGap: 2 });
    if (y + specTitleH + 12 + firstItemH + 4 > CONTENT_BOTTOM) { ensurePage(specTitleH + 12 + firstItemH + 4); y = 90; }
    doc.fontSize(8).font("Sans-Bold").fillColor(C.warning)
       .text("Limitações específicas deste scan:", MARGIN, y);
    y += 12;
    for (const lim of scanLimitations) {
      const limH = doc.fontSize(8).font("Sans").heightOfString(`• ${lim}`, { width: CONTENT_W - 8, lineGap: 2 });
      if (y + limH + 4 > CONTENT_BOTTOM) { ensurePage(limH + 4); y = 90; }
      doc.fontSize(8).font("Sans").fillColor(C.muted)
         .text(`• ${lim}`, MARGIN + 8, y, { width: CONTENT_W - 8, lineGap: 2 });
      y += doc.heightOfString(lim, { width: CONTENT_W - 8, lineGap: 2 }) + 4;
    }
    y += 6;
  } else {
    y += 12;
  }

  return y;
}

function drawReferencesSection(doc: PDFKit.PDFDocument, y: number, ensurePage: (needed: number) => void): number {
  if (y + 60 > CONTENT_BOTTOM) { ensurePage(60); y = 90; }
  y = drawSectionTitle(doc, "Referências Oficiais & Disclaimer", y);

  const refs = [
    ["Diretiva NIS2",          "Diretiva (UE) 2022/2555 do Parlamento Europeu e do Conselho, de 14 de dezembro de 2022, relativa a medidas destinadas a garantir um elevado nível comum de cibersegurança na União Europeia."],
    ["Transposição Nacional",  "Decreto-Lei n.º 125/2025 — Diploma que transpõe a Diretiva NIS2 para o ordenamento jurídico português e estabelece o regime jurídico da segurança ciberespacial."],
    ["Autoridade Nacional",    "CNCS (Centro Nacional de Cibersegurança) — Autoridade nacional competente para supervisão, regulamentação e aplicação das obrigações NIS2 em Portugal (cncs.gov.pt)."],
    ["Agência Europeia",       "ENISA (European Union Agency for Cybersecurity) — Entidade responsável pelas orientações técnicas e boas práticas europeias (enisa.europa.eu)."],
    ["Obrigação de Notificação", "Em conformidade com o DL n.º 125/2025, qualquer incidente com impacto significativo deve ser notificado ao CNCS no prazo de 24 horas (alerta inicial) e detalhado em relatório completo em 72 horas."],
    ["NVD (Dados CVE)",        "This product uses the NVD API but is not endorsed or certified by the NVD — National Vulnerability Database, NIST (nvd.nist.gov)."],
  ];

  refs.forEach(([label, val], i) => {
    const valH = doc.fontSize(7.5).font("Sans").heightOfString(val, { width: CONTENT_W - 126 });
    const rowH = Math.max(18, valH + 10);
    if (y + rowH > CONTENT_BOTTOM) { ensurePage(rowH); y = 90; }
    const rowBg = i % 2 === 0 ? C.bg : C.white;
    doc.rect(MARGIN, y, CONTENT_W, rowH).fillColor(rowBg).fill();
    doc.fontSize(7.5).font("Sans-Bold").fillColor(C.brand)
       .text(label, MARGIN + 6, y + 5, { width: 110 });
    doc.fontSize(7.5).font("Sans").fillColor(C.text)
       .text(val, MARGIN + 120, y + 5, { width: CONTENT_W - 126 });
    y = doc.y + 4;
  });
  y += 6;

  const disclaimer =
    "DISCLAIMER: Este relatório é gerado automaticamente pela plataforma CISPLAN com base em fontes de inteligência pública. " +
    "A informação contida é confidencial e destinada exclusivamente ao uso interno da organização identificada. " +
    "A CISPLAN não se responsabiliza por decisões tomadas exclusivamente com base neste relatório sem confirmação técnica adicional. " +
    "Os resultados devem ser interpretados por um profissional de cibersegurança qualificado.";

  const disclaimerH = doc.fontSize(7.5).font("Sans").heightOfString(disclaimer, { width: CONTENT_W, lineGap: 2 });
  if (y + 4 + 8 + disclaimerH + 10 > CONTENT_BOTTOM) { ensurePage(4 + 8 + disclaimerH + 10); y = 90; }
  doc.rect(MARGIN, y, CONTENT_W, 4).fillColor(C.danger).fill();
  y += 8;
  doc.fontSize(7.5).font("Sans").fillColor(C.muted)
     .text(disclaimer, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
  return y + disclaimerH + 10;
}

// groupByTheme, getVulnTheme, buildMediumSummary removidos em 0.6:
// substituídos por aggregateByRootCause (root-cause-aggregation.ts)

// ---------------------------------------------------------------------------
// Next steps builder
// ---------------------------------------------------------------------------

function buildNextSteps(
  overall: number,
  counts: { critical: number; high: number; medium: number; low: number }
): string[] {
  const steps: string[] = [];
  if (overall < 60) {
    steps.push("Efectua uma auditoria de segurança completa com prioridade alta — a conformidade NIS2 está em risco imediato.");
    steps.push("Avalia o risco identificado com os responsáveis de TI e prioriza a correcção das vulnerabilidades críticas antes de novas exposições.");
  }
  if (counts.critical > 0)
    steps.push(`Patcha ${counts.critical} vulnerabilidade(s) crítica(s) identificadas — janela recomendada: 24 a 72 horas.`);
  if (counts.high > 0)
    steps.push(`Resolve ${counts.high} vulnerabilidade(s) de severidade alta — janela recomendada: 7 dias.`);
  if (counts.medium > 0)
    steps.push(`Agenda a correcção de ${counts.medium} vulnerabilidade(s) de severidade média — esforço estimado baixo a médio, resolução em 30 dias.`);
  steps.push("Completa o Questionário NIS2 (42 controlos Art. 21(2)) na plataforma para um score de conformidade completo.");
  steps.push("Gera e implementa os Planos de Remediação por IA disponíveis na plataforma para cada vulnerabilidade.");
  if (overall >= 60)
    steps.push("Agenda um re-scan mensal para monitorizar a evolução do score e detectar novas exposições.");
  return steps.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function truncate(s: string, max: number): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ---------------------------------------------------------------------------
// S3 upload
// ---------------------------------------------------------------------------

async function uploadToStorage(
  buffer: Buffer, orgId: number, scanId: number, type: string
): Promise<string> {
  const key = `reports/${orgId}/${scanId}-${type}.pdf`;
  if (!process.env.STORAGE_ACCESS_KEY) {
    console.warn(`[PDF] Storage not configured — key would be: ${key}`);
    return `https://storage.cisplan.pt/${key}`;
  }
  const client = getS3Client();
  await client.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: buffer,
    ContentType: "application/pdf", ACL: "public-read",
  }));
  return `${process.env.STORAGE_PUBLIC_URL ?? "https://storage.cisplan.pt"}/${key}`;
}
