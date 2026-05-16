/**
 * server/services/pdf-report-generator.ts
 *
 * Enterprise-grade NIS2 compliance PDF reports (Executive + Technical).
 * Format inspired by SecurityScorecard / Tenable / Qualys report standards.
 */

import PDFDocument from "pdfkit";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getScanById, getVulnerabilitiesByScanId, getOrganizationById } from "../db";

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
  critical: "#7c3aed",
  text:     "#111827",
  muted:    "#6b7280",
  border:   "#e5e7eb",
  bg:       "#f8fafc",
  white:    "#ffffff",
};

const PAGE_W = 595, PAGE_H = 842, MARGIN = 50, CONTENT_W = PAGE_W - MARGIN * 2;

// ---------------------------------------------------------------------------
// NIS2 Article catalogue
// ---------------------------------------------------------------------------

const NIS2_ARTICLES: Record<string, { short: string; desc: string }> = {
  "Art. 21(2)(a)": { short: "Políticas de Risco",         desc: "Políticas de análise de risco e segurança dos sistemas de informação" },
  "Art. 21(2)(b)": { short: "Gestão de Incidentes",        desc: "Detecção, resposta e notificação de incidentes de segurança" },
  "Art. 21(2)(c)": { short: "Continuidade de Negócio",     desc: "Backups, recuperação de desastres e gestão de crises" },
  "Art. 21(2)(d)": { short: "Cadeia de Abastecimento",     desc: "Segurança nos fornecedores e parceiros tecnológicos" },
  "Art. 21(2)(e)": { short: "Desenvolvimento Seguro",       desc: "Segurança na aquisição, desenvolvimento e manutenção de sistemas" },
  "Art. 21(2)(f)": { short: "Avaliação de Eficácia",        desc: "Avaliação e monitorização contínua das medidas de cibersegurança" },
  "Art. 21(2)(g)": { short: "Ciberhigiene e Formação",      desc: "Formação de colaboradores e práticas básicas de ciberhigiene" },
  "Art. 21(2)(h)": { short: "Criptografia",                 desc: "Encriptação de dados em trânsito e em repouso" },
  "Art. 21(2)(i)": { short: "Controlo de Acessos",          desc: "Segurança dos recursos humanos e gestão de identidades" },
  "Art. 21(2)(j)": { short: "Autenticação Multifator",      desc: "MFA obrigatório e comunicações seguras internas" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Scan = Awaited<ReturnType<typeof getScanById>>;
type Vuln = Awaited<ReturnType<typeof getVulnerabilitiesByScanId>>[number];
type Org  = Awaited<ReturnType<typeof getOrganizationById>>;

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
  return { critical: C.critical, high: C.danger, medium: C.warning, low: C.success }[s] ?? C.muted;
}
function severityLabel(s: string): string {
  return { critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" }[s] ?? s;
}
function cvssColor(v: number): string {
  if (v >= 9) return C.critical;
  if (v >= 7) return C.danger;
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

  const tableVulns = await getVulnerabilitiesByScanId(options.scanId);
  const vulns: Vuln[] = tableVulns.length > 0
    ? tableVulns
    : ((scan.results as any)?.vulnerabilities ?? []).map((v: any, i: number) => ({
        id: -(i + 1), scanId: options.scanId,
        organizationId: options.organizationId,
        cveId: v.cveId, severity: v.severity,
        cvssScore: String(v.cvssScore ?? 5),
        description: v.description,
        affectedComponent: v.affectedService ?? "unknown",
        port: null, remediation: v.remediationHint ?? null,
        createdAt: new Date(),
      }));

  return options.type === "executive"
    ? buildExecutiveReport(scan, vulns, org)
    : buildTechnicalReport(scan, vulns, org);
}

// ---------------------------------------------------------------------------
// EXECUTIVE REPORT
// ---------------------------------------------------------------------------

async function buildExecutiveReport(scan: Scan, vulns: Vuln[], org: Org): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false,
      info: { Title: "CISPLAN — Relatório Executivo NIS2", Author: "CISPLAN", Creator: "CISPLAN" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const results   = (scan?.results ?? {}) as Record<string, any>;
    const nis2Scores: Array<{ article: string; title: string; score: number; findings: string[] }> =
      results.nis2Scores ?? [];
    const overall = results.overallScore ?? (nis2Scores.length
      ? Math.round(nis2Scores.reduce((a, s) => a + s.score, 0) / nis2Scores.length) : 0);
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

    // Section title
    y = drawSectionTitle(doc, "Resumo Executivo", y);

    // Score + severity boxes side by side
    drawScoreCircle(doc, overall, MARGIN, y);
    const boxW = Math.floor((CONTENT_W - 80) / 4);
    const boxes = [
      { label: "Críticas", count: counts.critical, color: C.critical },
      { label: "Altas",    count: counts.high,     color: C.danger   },
      { label: "Médias",   count: counts.medium,   color: C.warning  },
      { label: "Baixas",   count: counts.low,      color: C.success  },
    ];
    boxes.forEach((b, i) => {
      const bx = MARGIN + 80 + i * (boxW + 5);
      doc.rect(bx, y, boxW, 60).fillColor(C.bg).fill();
      doc.rect(bx, y, boxW, 4).fillColor(b.color).fill();
      doc.fontSize(26).font("Helvetica-Bold").fillColor(b.color)
         .text(String(b.count), bx, y + 14, { width: boxW, align: "center" });
      doc.fontSize(9).font("Helvetica").fillColor(C.muted)
         .text(b.label, bx, y + 43, { width: boxW, align: "center" });
    });
    y += 75;

    // Scan info row
    doc.fontSize(8).font("Helvetica").fillColor(C.muted);
    doc.text(`Alvo: `, MARGIN, y, { continued: true }).fillColor(C.text).text(scan?.target ?? "—", { continued: true });
    doc.fillColor(C.muted).text(`   ·   Data: `, { continued: true }).fillColor(C.text).text(fmt(scan?.completedAt ?? scan?.createdAt));
    doc.fillColor(C.muted).text(`Modo: `, MARGIN, y + 14, { continued: true })
       .fillColor(C.text).text(scan?.mode === "sme" ? "PME (SME)" : "Cadeia de Abastecimento", { continued: true });
    doc.fillColor(C.muted).text(`   ·   Vulnerabilidades: `, { continued: true })
       .fillColor(C.text).text(String(vulns.length));
    y += 36;

    // Top risks
    const top5 = [...vulns].sort((a, b) => parseFloat(b.cvssScore) - parseFloat(a.cvssScore)).slice(0, 5);
    if (top5.length) {
      y = drawSectionTitle(doc, "Principais Riscos Identificados", y);
      // Table header
      doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(C.navy).fill();
      doc.fontSize(8).font("Helvetica-Bold").fillColor(C.white);
      doc.text("ID / Vulnerabilidade",  MARGIN + 6,  y + 5, { width: 230 });
      doc.text("Componente",            MARGIN + 240, y + 5, { width: 100 });
      doc.text("CVSS",                  MARGIN + 345, y + 5, { width: 45, align: "center" });
      doc.text("Severidade",            MARGIN + 395, y + 5, { width: 100, align: "center" });
      y += 18;

      top5.forEach((v, i) => {
        const rowBg = i % 2 === 0 ? C.bg : C.white;
        doc.rect(MARGIN, y, CONTENT_W, 24).fillColor(rowBg).fill();
        const sColor = severityColor(v.severity);
        doc.fontSize(8).font("Helvetica-Bold").fillColor(C.text)
           .text(v.cveId, MARGIN + 6, y + 4, { width: 115 });
        doc.fontSize(7).font("Helvetica").fillColor(C.muted)
           .text(truncate(v.description, 52), MARGIN + 6, y + 14, { width: 230 });
        doc.fontSize(8).font("Helvetica").fillColor(C.text)
           .text(truncate(v.affectedComponent, 22), MARGIN + 240, y + 8, { width: 100 });
        const cvss = parseFloat(v.cvssScore);
        doc.fontSize(9).font("Helvetica-Bold").fillColor(cvssColor(cvss))
           .text(v.cvssScore, MARGIN + 345, y + 7, { width: 45, align: "center" });
        doc.rect(MARGIN + 400, y + 5, 80, 14).fillColor(sColor).fill();
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(C.white)
           .text(severityLabel(v.severity).toUpperCase(), MARGIN + 400, y + 8, { width: 80, align: "center" });
        y += 24;
      });
      y += 8;
    }

    // Conformidade NIS2 overview (mini bars)
    if (nis2Scores.length) {
      y = drawSectionTitle(doc, "Score por Artigo NIS2 (Art. 21(2))", y);
      const half = Math.ceil(nis2Scores.length / 2);
      const colW = CONTENT_W / 2 - 10;
      nis2Scores.forEach((s, idx) => {
        const col  = idx < half ? 0 : 1;
        const row  = idx < half ? idx : idx - half;
        const bx   = MARGIN + col * (colW + 20);
        const by   = y + row * 22;
        const art  = s.article.replace("Art. 21(2)", "").replace(/[()]/g, "");
        const fill = Math.round((s.score / 100) * (colW - 55));
        doc.rect(bx + 20, by + 6, colW - 55, 8).fillColor(C.border).fill();
        doc.rect(bx + 20, by + 6, Math.max(2, fill), 8).fillColor(scoreColor(s.score)).fill();
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(C.muted)
           .text(art, bx, by + 5, { width: 18, align: "right" });
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(scoreColor(s.score))
           .text(`${s.score}`, bx + colW - 30, by + 5, { width: 28, align: "right" });
      });
      y += half * 22 + 10;
    }

    drawRunningFooter(doc, 2);

    // ── PAGE 3: PRÓXIMOS PASSOS + METODOLOGIA + REFERÊNCIAS ───────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Executivo");
    y = 90;

    y = drawSectionTitle(doc, "Próximos Passos Recomendados", y);
    const steps = buildNextSteps(overall, results, counts);
    steps.forEach((step, i) => {
      doc.rect(MARGIN, y, 20, 20).fillColor(C.brand).fill();
      doc.fontSize(9).font("Helvetica-Bold").fillColor(C.white)
         .text(String(i + 1), MARGIN, y + 6, { width: 20, align: "center" });
      doc.fontSize(9).font("Helvetica").fillColor(C.text)
         .text(step, MARGIN + 28, y + 5, { width: CONTENT_W - 28 });
      y += 28;
    });
    y += 10;

    y = drawMethodologySection(doc, y);
    y = drawReferencesSection(doc, y);
    drawRunningFooter(doc, 3);

    doc.end();
  });
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

async function buildTechnicalReport(scan: Scan, vulns: Vuln[], org: Org): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false,
      info: { Title: "CISPLAN — Relatório Técnico NIS2", Author: "CISPLAN", Creator: "CISPLAN" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const results   = (scan?.results ?? {}) as Record<string, any>;
    const nis2Scores: Array<{ article: string; title: string; score: number; findings: string[] }> =
      results.nis2Scores ?? [];
    const overall = results.overallScore ?? (nis2Scores.length
      ? Math.round(nis2Scores.reduce((a, s) => a + s.score, 0) / nis2Scores.length) : 0);
    const openPorts: Array<{ port: number; protocol: string; service: string; product?: string; version?: string; cves: string[] }> =
      results.openPorts ?? [];

    // ── PAGE 1: COVER ──────────────────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawCoverPage(doc, scan, overall, "RELATÓRIO TÉCNICO NIS2", "CONFIDENCIAL — USO RESTRITO");

    // ── PAGE 2: METADADOS + PORTOS & SERVIÇOS ─────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
    let y = 90;

    // Metadata grid
    y = drawSectionTitle(doc, "Metadados do Scan", y);
    const metaRows = [
      ["Alvo",          scan?.target ?? "—"],
      ["Modo de scan",  scan?.mode === "sme" ? "PME / Entidade Importante" : "Cadeia de Abastecimento"],
      ["Estado",        ({ completed: "Concluído", running: "Em execução", pending: "Na fila", failed: "Falhou" } as Record<string, string>)[scan?.status ?? ""] ?? scan?.status ?? "—"],
      ["Início",        fmtFull(scan?.startedAt)],
      ["Conclusão",     fmtFull(scan?.completedAt)],
      ["Score global",  `${overall}/100 — ${scoreLabel(overall)}`],
      ["Vulnerabilidades", `${vulns.length} (${vulns.filter(v => v.severity === "critical").length} críticas, ${vulns.filter(v => v.severity === "high").length} altas)`],
    ];
    metaRows.forEach(([label, val], i) => {
      const rowBg = i % 2 === 0 ? C.bg : C.white;
      doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(rowBg).fill();
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor(C.muted)
         .text(label, MARGIN + 6, y + 5, { width: 120 });
      doc.fontSize(8.5).font("Helvetica").fillColor(C.text)
         .text(String(val), MARGIN + 130, y + 5, { width: CONTENT_W - 136 });
      y += 18;
    });
    y += 14;

    // Ports & Services — only list ports with known CVEs; clean ports are noise for PMEs
    const exposedPorts = openPorts.filter(p => (p.cves ?? []).length > 0);
    const cleanCount   = openPorts.length - exposedPorts.length;

    y = drawSectionTitle(doc, "Portos com Vulnerabilidades Conhecidas", y);
    if (exposedPorts.length > 0) {
      // Summary line
      doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
         .text(
           `${openPorts.length} porto(s) analisado(s) · ${cleanCount} sem CVEs conhecidas (ocultados) · ${exposedPorts.length} com vulnerabilidades listados abaixo.`,
           MARGIN, y + 1, { width: CONTENT_W }
         );
      y += 16;
      // Table header
      doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(C.navy).fill();
      doc.fontSize(8).font("Helvetica-Bold").fillColor(C.white);
      doc.text("Porto",            MARGIN + 6,   y + 5, { width: 50 });
      doc.text("Protocolo",        MARGIN + 60,  y + 5, { width: 60 });
      doc.text("Serviço",          MARGIN + 125, y + 5, { width: 100 });
      doc.text("Produto / Versão", MARGIN + 230, y + 5, { width: 160 });
      doc.text("CVEs",             MARGIN + 395, y + 5, { width: 60, align: "center" });
      y += 18;
      exposedPorts.slice(0, 20).forEach((p, i) => {
        if (y > 730) { doc.addPage({ size: "A4", margin: 0 }); drawRunningHeader(doc, scan?.target ?? "—", "Técnico"); y = 90; }
        const rowBg = i % 2 === 0 ? C.bg : C.white;
        doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(rowBg).fill();
        doc.fontSize(8).font("Helvetica-Bold").fillColor(C.brand)
           .text(String(p.port), MARGIN + 6, y + 5, { width: 50 });
        doc.fontSize(8).font("Helvetica").fillColor(C.muted)
           .text(p.protocol.toUpperCase(), MARGIN + 60, y + 5, { width: 60 });
        doc.fillColor(C.text).text(p.service, MARGIN + 125, y + 5, { width: 100 });
        doc.fillColor(C.muted).text(truncate(`${p.product ?? ""} ${p.version ?? ""}`.trim() || "—", 35), MARGIN + 230, y + 5, { width: 160 });
        const cveCount = p.cves.length;
        doc.rect(MARGIN + 398, y + 3, 48, 13).fillColor(C.danger).fill();
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(C.white)
           .text(`${cveCount} CVE${cveCount > 1 ? "s" : ""}`, MARGIN + 398, y + 6, { width: 48, align: "center" });
        y += 18;
      });
      if (exposedPorts.length > 20) {
        doc.fontSize(8).font("Helvetica").fillColor(C.muted)
           .text(`+ ${exposedPorts.length - 20} porto(s) com CVEs adicionais — ver detalhe completo na plataforma.`, MARGIN, y + 4);
        y += 18;
      }
    } else if (openPorts.length > 0) {
      doc.rect(MARGIN, y, CONTENT_W, 30).fillColor(C.bg).fill();
      doc.fontSize(9).font("Helvetica").fillColor(C.success)
         .text(`✓ ${openPorts.length} porto(s) analisado(s) — nenhum com CVEs conhecidas.`, MARGIN + 10, y + 10);
      y += 30;
    } else {
      doc.rect(MARGIN, y, CONTENT_W, 30).fillColor(C.bg).fill();
      doc.fontSize(9).font("Helvetica").fillColor(C.success)
         .text("✓ Nenhum porto exposto detetado nas fontes consultadas.", MARGIN + 10, y + 10);
      y += 30;
    }
    y += 6;
    drawRunningFooter(doc, 2);

    // ── PAGE 3: VULNERABILIDADES ───────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
    y = 90;

    y = drawSectionTitle(doc, `Vulnerabilidades Encontradas (${vulns.length})`, y);
    if (vulns.length > 0) {
      const sorted = [...vulns].sort((a, b) => parseFloat(b.cvssScore) - parseFloat(a.cvssScore));
      let pageNum = 3;
      const TEXT_W = CONTENT_W - 20; // width available for description/remediation text

      sorted.forEach((v) => {
        // Calculate actual heights dynamically to prevent overlap
        const descText  = v.description ?? "";
        const remText   = v.remediation ? `↳ ${v.remediation}` : "";
        const dnsExample = getDnsExample(v.cveId, v.affectedComponent, scan?.target ?? "");
        const descH = doc.fontSize(8).font("Helvetica").heightOfString(descText, { width: TEXT_W });
        const remH  = remText
          ? doc.fontSize(8).font("Helvetica").heightOfString(remText, { width: TEXT_W }) + 4
          : 0;
        const dnsH  = dnsExample
          ? doc.fontSize(7.5).font("Helvetica").heightOfString(dnsExample, { width: TEXT_W - 12 }) + 18
          : 0;
        const HEADER_H = 20; // CVE ID row
        const PADDING  = 14; // top + bottom breathing room
        const rowH = HEADER_H + descH + remH + dnsH + PADDING;

        if (y + rowH > 760) {
          drawRunningFooter(doc, pageNum++);
          doc.addPage({ size: "A4", margin: 0 });
          drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
          y = 90;
        }
        const sColor = severityColor(v.severity);

        // Left accent bar (full card height)
        doc.rect(MARGIN, y, 4, rowH - 4).fillColor(sColor).fill();

        // CVE ID line
        doc.fontSize(9).font("Helvetica-Bold").fillColor(C.text)
           .text(v.cveId, MARGIN + 12, y + 4, { width: 200 });
        doc.fontSize(8).font("Helvetica").fillColor(C.muted)
           .text(
             `CVSS ${v.cvssScore}  ·  ${v.affectedComponent}${v.port ? ` :${v.port}` : ""}`,
             MARGIN + 215, y + 5, { width: 185 }
           );

        // Severity badge (top-right)
        doc.rect(MARGIN + 415, y + 2, 80, 14).fillColor(sColor).fill();
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(C.white)
           .text(severityLabel(v.severity).toUpperCase(), MARGIN + 415, y + 5, { width: 80, align: "center" });

        // Description — placed right below header row
        const descY = y + HEADER_H;
        doc.fontSize(8).font("Helvetica").fillColor(C.muted)
           .text(descText, MARGIN + 12, descY, { width: TEXT_W });

        // Remediation hint — placed below description
        if (remText) {
          const remY = descY + descH + 4;
          doc.fontSize(8).font("Helvetica").fillColor(C.brand)
             .text(remText, MARGIN + 12, remY, { width: TEXT_W });
        }

        // DNS record example box — concrete TXT record to copy/paste
        if (dnsExample) {
          const dnsY = descY + descH + remH + (remText ? 4 : 0) + 4;
          doc.rect(MARGIN + 12, dnsY, TEXT_W, dnsH - 4).fillColor(C.bg).fill();
          doc.rect(MARGIN + 12, dnsY, 3, dnsH - 4).fillColor(C.warning).fill();
          doc.fontSize(7).font("Helvetica-Bold").fillColor(C.muted)
             .text("Registo DNS (copiar para o seu fornecedor de domínio):", MARGIN + 20, dnsY + 4, { width: TEXT_W - 12 });
          doc.fontSize(7.5).font("Helvetica").fillColor(C.navy)
             .text(dnsExample, MARGIN + 20, dnsY + 14, { width: TEXT_W - 12 });
        }

        // Separator line
        doc.moveTo(MARGIN, y + rowH - 2).lineTo(PAGE_W - MARGIN, y + rowH - 2)
           .strokeColor(C.border).lineWidth(0.4).stroke();
        y += rowH;
      });
      drawRunningFooter(doc, 3);
    } else {
      doc.rect(MARGIN, y, CONTENT_W, 36).fillColor("#ecfdf5").fill();
      doc.fontSize(10).font("Helvetica-Bold").fillColor(C.success)
         .text("✓ Nenhuma vulnerabilidade conhecida encontrada.", MARGIN + 12, y + 12);
      drawRunningFooter(doc, 3);
    }

    // ── PAGE 4: NIS2 COMPLIANCE POR ARTIGO ────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
    y = 90;
    y = drawSectionTitle(doc, "Conformidade NIS2 — Detalhe por Artigo (Art. 21(2))", y);

    // Intro text
    doc.fontSize(8).font("Helvetica").fillColor(C.muted)
       .text(
         "Avaliação baseada nos serviços expostos, vulnerabilidades detectadas e configurações de segurança analisadas. " +
         "Cada artigo reflecte um domínio de conformidade da Directiva NIS2 (transposta pelo DL 125/2025).",
         MARGIN, y, { width: CONTENT_W }
       );
    y += 28;

    let techPage = 4;
    nis2Scores.forEach((s) => {
      const hasFail = s.findings?.filter(Boolean).length > 0;
      const rowH = hasFail ? 52 + Math.min(s.findings.length, 3) * 11 : 40;
      if (y + rowH > 750) {
        drawRunningFooter(doc, techPage++);
        doc.addPage({ size: "A4", margin: 0 });
        drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
        y = 90;
      }
      const artInfo = NIS2_ARTICLES[s.article];
      const BAR_MAX = 160;
      const barFill = Math.max(2, Math.round((s.score / 100) * BAR_MAX));
      const col = scoreColor(s.score);

      // Score circle (small)
      doc.circle(MARGIN + 16, y + 16, 14).fillColor(col).fill();
      doc.fontSize(8).font("Helvetica-Bold").fillColor(C.white)
         .text(String(s.score), MARGIN + 4, y + 11, { width: 24, align: "center" });

      // Article + title
      doc.fontSize(9).font("Helvetica-Bold").fillColor(C.text)
         .text(s.article, MARGIN + 38, y + 2, { width: 100 });
      doc.fontSize(8).font("Helvetica").fillColor(C.muted)
         .text(artInfo?.short ?? "", MARGIN + 38, y + 14, { width: 140 });

      // Bar
      doc.rect(MARGIN + 185, y + 10, BAR_MAX, 8).fillColor(C.border).fill();
      doc.rect(MARGIN + 185, y + 10, barFill, 8).fillColor(col).fill();

      // Description
      doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
         .text(artInfo?.desc ?? s.title, MARGIN + 360, y + 2, { width: CONTENT_W - 315 });

      // Findings
      if (hasFail) {
        s.findings.filter(Boolean).slice(0, 3).forEach((f, fi) => {
          doc.fontSize(7.5).fillColor(C.danger)
             .text(`• ${truncate(f, 88)}`, MARGIN + 38, y + 28 + fi * 11, { width: CONTENT_W - 38 });
        });
      } else {
        doc.fontSize(7.5).fillColor(C.success)
           .text("✓ Sem problemas detetados neste domínio", MARGIN + 38, y + 28, { width: CONTENT_W - 38 });
      }

      doc.moveTo(MARGIN, y + rowH - 2).lineTo(PAGE_W - MARGIN, y + rowH - 2)
         .strokeColor(C.border).lineWidth(0.3).stroke();
      y += rowH;
    });
    y += 10;

    // ── METODOLOGIA + REFERÊNCIAS ──────────────────────────────────────────
    if (y + 200 > 740) {
      drawRunningFooter(doc, techPage++);
      doc.addPage({ size: "A4", margin: 0 });
      drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
      y = 90;
    }
    y = drawMethodologySection(doc, y);
    y = drawReferencesSection(doc, y);
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
  doc.fontSize(32).font("Helvetica-Bold").fillColor(C.white)
     .text("CISPLAN", MARGIN, 52);
  doc.fontSize(11).font("Helvetica").fillColor("#93c5fd")
     .text("Plataforma de Conformidade NIS2", MARGIN, 92);

  // ── Score circle (large) ──
  const cx = PAGE_W / 2, cy = 185;
  const radius = 60;
  // Outer ring
  doc.circle(cx, cy, radius + 6).fillColor(C.navyMid).fill();
  doc.circle(cx, cy, radius).fillColor(scoreColor(overall)).fill();
  doc.fontSize(38).font("Helvetica-Bold").fillColor(C.white)
     .text(String(overall), cx - 35, cy - 22, { width: 70, align: "center" });
  doc.fontSize(13).font("Helvetica").fillColor(C.white)
     .text("/ 100", cx - 30, cy + 18, { width: 60, align: "center" });

  // Score label below circle
  doc.fontSize(13).font("Helvetica-Bold").fillColor(scoreColor(overall))
     .text(scoreLabel(overall), 0, cy + 75, { align: "center", width: PAGE_W });

  // ── Bottom white section ──
  const by = PAGE_H * 0.55 + 28;

  // Classification badge
  doc.rect(MARGIN, by, 130, 20).fillColor(C.danger).fill();
  doc.fontSize(8).font("Helvetica-Bold").fillColor(C.white)
     .text(classification, MARGIN, by + 6, { width: 130, align: "center" });

  // Report type title
  doc.fontSize(20).font("Helvetica-Bold").fillColor(C.text)
     .text(reportType, MARGIN, by + 34, { width: CONTENT_W });

  // Divider
  doc.moveTo(MARGIN, by + 64).lineTo(PAGE_W - MARGIN, by + 64)
     .strokeColor(C.border).lineWidth(1).stroke();

  // Target + date
  const target = scan?.target ?? "—";
  doc.fontSize(10).font("Helvetica-Bold").fillColor(C.muted)
     .text("Alvo da análise:", MARGIN, by + 76);
  doc.fontSize(14).font("Helvetica-Bold").fillColor(C.brand)
     .text(target, MARGIN, by + 92);
  doc.fontSize(9).font("Helvetica").fillColor(C.muted)
     .text(`Data: ${fmtFull(scan?.completedAt ?? scan?.createdAt)}   ·   Scan ID: #${scan?.id ?? "—"}`, MARGIN, by + 114);

  // Bottom footer bar
  doc.rect(0, PAGE_H - 46, PAGE_W, 46).fillColor(C.navyMid).fill();
  doc.fontSize(7.5).font("Helvetica").fillColor("#93c5fd")
     .text(
       "CISPLAN · cisplan.pt   ·   NIS2 Directiva (UE) 2022/2555 · DL 125/2025   ·   CNCS — Centro Nacional de Cibersegurança",
       MARGIN, PAGE_H - 28, { align: "center", width: CONTENT_W }
     );
}

// ---------------------------------------------------------------------------
// Running header & footer (pages 2+)
// ---------------------------------------------------------------------------

function drawRunningHeader(doc: PDFKit.PDFDocument, target: string, type: string): void {
  doc.rect(0, 0, PAGE_W, 50).fillColor(C.navy).fill();
  doc.rect(0, 50, PAGE_W, 3).fillColor(C.brand).fill();

  doc.fontSize(12).font("Helvetica-Bold").fillColor(C.white)
     .text("CISPLAN", MARGIN, 16);
  doc.fontSize(8).font("Helvetica").fillColor("#93c5fd")
     .text(`Relatório ${type} NIS2`, MARGIN + 80, 19);
  doc.fontSize(8).font("Helvetica").fillColor(C.muted)
     .text(target, 0, 19, { align: "right", width: PAGE_W - MARGIN });
}

function drawRunningFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  doc.rect(0, PAGE_H - 32, PAGE_W, 32).fillColor(C.bg).fill();
  doc.moveTo(MARGIN, PAGE_H - 32).lineTo(PAGE_W - MARGIN, PAGE_H - 32)
     .strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fontSize(7).font("Helvetica").fillColor(C.muted)
     .text(
       `CISPLAN · Relatório gerado em ${fmt(new Date())} · Confidencial`,
       MARGIN, PAGE_H - 20, { width: CONTENT_W - 40 }
     );
  doc.fontSize(7).font("Helvetica-Bold").fillColor(C.brand)
     .text(`Página ${pageNum}`, 0, PAGE_H - 20, { width: PAGE_W - MARGIN, align: "right" });
}

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.rect(MARGIN, y, 4, 18).fillColor(C.brand).fill();
  doc.fontSize(11).font("Helvetica-Bold").fillColor(C.text)
     .text(title, MARGIN + 12, y + 3);
  doc.moveTo(MARGIN, y + 22).lineTo(PAGE_W - MARGIN, y + 22)
     .strokeColor(C.border).lineWidth(0.5).stroke();
  return y + 30;
}

function drawScoreCircle(doc: PDFKit.PDFDocument, score: number, x: number, y: number): void {
  const cx = x + 30, cy = y + 30;
  doc.circle(cx, cy, 32).fillColor(scoreColor(score)).fill();
  doc.fontSize(20).font("Helvetica-Bold").fillColor(C.white)
     .text(String(score), cx - 22, cy - 13, { width: 44, align: "center" });
  doc.fontSize(8).font("Helvetica").fillColor(C.white)
     .text("/ 100", cx - 20, cy + 10, { width: 40, align: "center" });
}

function drawMethodologySection(doc: PDFKit.PDFDocument, y: number): number {
  y = drawSectionTitle(doc, "Metodologia & Limitações", y);
  const text =
    "Este relatório foi gerado por análise sem agentes (agentless) utilizando as seguintes fontes de dados: " +
    "Shodan Internet Intelligence (portos, serviços, CVEs), Censys (confirmação de serviços), " +
    "HIBP — Have I Been Pwned (breaches de credenciais), verificação directa TLS/SSL (portos 443/8443), " +
    "DNS lookup (SPF, DMARC, DKIM) e análise de HTTP Security Headers.\n\n" +
    "Limitações: A análise sem agentes não acede a sistemas internos, bases de dados, aplicações autenticadas ou redes privadas. " +
    "Vulnerabilidades internas, configurações de firewall interna e controlos organizacionais (políticas, formação, backups) " +
    "não são avaliados automaticamente — para esses controlos utilizar o Questionário NIS2 (42 controlos) integrado na plataforma. " +
    "Os scores são calculados com base em heurísticas de risco e devem ser complementados com uma auditoria presencial.";

  doc.rect(MARGIN, y, CONTENT_W, 8).fillColor(C.bg).fill();
  doc.rect(MARGIN, y, 3, 8).fillColor(C.warning).fill();
  doc.fontSize(8).font("Helvetica").fillColor(C.text)
     .text(text, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
  const textHeight = doc.heightOfString(text, { width: CONTENT_W, lineGap: 2 });
  return y + textHeight + 18;
}

function drawReferencesSection(doc: PDFKit.PDFDocument, y: number): number {
  y = drawSectionTitle(doc, "Referências Oficiais & Disclaimer", y);

  const refs = [
    ["Directiva NIS2",         "Directiva (UE) 2022/2555 do Parlamento Europeu e do Conselho, de 14 de Dezembro de 2022"],
    ["Transposição PT",        "Decreto-Lei n.º 125/2025 — Transposição da NIS2 para o ordenamento jurídico português"],
    ["CNCS",                   "Centro Nacional de Cibersegurança — cncs.gov.pt — Autoridade nacional competente NIS2"],
    ["ENISA",                  "European Union Agency for Cybersecurity — enisa.europa.eu — Guidelines NIS2"],
    ["Notificação CNCS",       "Obrigação de notificação de incidentes graves ao CNCS em 24h (alerta) / 72h (relatório inicial)"],
  ];

  refs.forEach(([label, val], i) => {
    const rowBg = i % 2 === 0 ? C.bg : C.white;
    doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(rowBg).fill();
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor(C.brand)
       .text(label, MARGIN + 6, y + 5, { width: 110 });
    doc.fontSize(7.5).font("Helvetica").fillColor(C.text)
       .text(val, MARGIN + 120, y + 5, { width: CONTENT_W - 126 });
    y += 18;
  });
  y += 10;

  const disclaimer =
    "DISCLAIMER: Este relatório é gerado automaticamente pela plataforma CISPLAN com base em fontes de inteligência pública. " +
    "A informação contida é confidencial e destinada exclusivamente ao uso interno da organização identificada. " +
    "A CISPLAN não se responsabiliza por decisões tomadas exclusivamente com base neste relatório sem confirmação técnica adicional. " +
    "Os resultados devem ser interpretados por um profissional de cibersegurança qualificado.";

  doc.rect(MARGIN, y, CONTENT_W, 4).fillColor(C.danger).fill();
  y += 8;
  doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
     .text(disclaimer, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
  const h = doc.heightOfString(disclaimer, { width: CONTENT_W, lineGap: 2 });
  return y + h + 10;
}

// ---------------------------------------------------------------------------
// Next steps builder
// ---------------------------------------------------------------------------

function buildNextSteps(
  overall: number,
  results: Record<string, any>,
  counts: { critical: number; high: number; medium: number; low: number }
): string[] {
  const steps: string[] = [];
  if (overall < 60) {
    steps.push("Efectua uma auditoria de segurança completa com prioridade alta — a conformidade NIS2 está em risco imediato.");
    steps.push("Contacta o CNCS e avalia a necessidade de notificação preventiva.");
  }
  if (counts.critical > 0)
    steps.push(`Patcha ${counts.critical} vulnerabilidade(s) crítica(s) identificadas — janela recomendada: 24 a 72 horas.`);
  if (counts.high > 0)
    steps.push(`Resolve ${counts.high} vulnerabilidade(s) de severidade alta — janela recomendada: 7 dias.`);
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
