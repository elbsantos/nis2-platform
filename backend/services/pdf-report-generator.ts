/**
 * server/services/pdf-report-generator.ts
 *
 * Generates NIS2 compliance PDF reports (executive + technical).
 * Uploads to Hetzner Object Storage (S3-compatible) and returns the public URL.
 */

import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getScanById, getVulnerabilitiesByScanId, getOrganizationById } from "../db";

// ---------------------------------------------------------------------------
// S3 / Hetzner Object Storage client
// ---------------------------------------------------------------------------

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.STORAGE_REGION ?? "eu-central-1",
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
// Colours and fonts
// ---------------------------------------------------------------------------

const C = {
  brand:   "#1d4ed8",
  success: "#10b981",
  warning: "#f59e0b",
  danger:  "#ef4444",
  text:    "#111827",
  muted:   "#6b7280",
  border:  "#e5e7eb",
  bg:      "#f9fafb",
};

function scoreColor(score: number): string {
  if (score >= 80) return C.success;
  if (score >= 60) return C.warning;
  return C.danger;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function generateReport(options: {
  scanId: number;
  organizationId: number;
  type: "executive" | "technical";
}): Promise<string> {
  const buffer = await generateReportBuffer(options);
  return uploadToStorage(buffer, options.organizationId, options.scanId, options.type);
}

/**
 * Generate the PDF and return its raw Buffer (no S3 upload).
 * Used by the tRPC router to return base64 for direct browser download.
 */
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
  if (scan.organizationId !== options.organizationId) {
    throw new Error("Sem permissão para aceder a este scan");
  }

  // Use vulnerabilities from scan.results JSON as fallback (same as ai-remediation)
  const tableVulns = await getVulnerabilitiesByScanId(options.scanId);
  const vulns = tableVulns.length > 0
    ? tableVulns
    : ((scan.results as any)?.vulnerabilities ?? []).map((v: any, i: number) => ({
        id: -(i + 1),
        scanId: options.scanId,
        organizationId: options.organizationId,
        cveId:             v.cveId,
        severity:          v.severity,
        cvssScore:         String(v.cvssScore ?? 5),
        description:       v.description,
        affectedComponent: v.affectedService ?? "unknown",
        port:              null,
        remediation:       v.remediationHint ?? null,
        createdAt:         new Date(),
      }));

  return options.type === "executive"
    ? buildExecutiveReport(scan, vulns as any, org)
    : buildTechnicalReport(scan, vulns as any, org);
}

// ---------------------------------------------------------------------------
// Report builder helpers
// ---------------------------------------------------------------------------

type Scan  = Awaited<ReturnType<typeof getScanById>>;
type Vuln  = Awaited<ReturnType<typeof getVulnerabilitiesByScanId>>[number];
type Org   = Awaited<ReturnType<typeof getOrganizationById>>;

async function buildExecutiveReport(scan: Scan, vulns: Vuln[], org: Org): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margin: 50, info: { Title: "NIS2 Relatório Executivo" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const results = (scan?.results ?? {}) as Record<string, number>;
    const nis2Scores: Array<{ article: string; title: string; score: number }> =
      (results as any).nis2Scores ?? [];
    const overall = nis2Scores.length
      ? Math.round(nis2Scores.reduce((a, s) => a + s.score, 0) / nis2Scores.length)
      : 0;

    // ── Header ──
    drawHeader(doc, "Relatório Executivo NIS2");

    // ── Score circle ──
    const cx = 100, cy = doc.y + 60;
    doc.circle(cx, cy, 45).fillColor(scoreColor(overall)).fill();
    doc.fontSize(22).fillColor("white").font("Helvetica-Bold")
       .text(String(overall), cx - 20, cy - 14, { width: 40, align: "center" });
    doc.fontSize(10).text("/ 100", cx - 20, cy + 10, { width: 40, align: "center" });

    doc.fontSize(11).fillColor(C.text).font("Helvetica-Bold")
       .text("Score NIS2 Global", 160, cy - 20);
    doc.fontSize(10).fillColor(C.muted).font("Helvetica")
       .text(
         overall >= 80 ? "Conformidade elevada" : overall >= 60 ? "Conformidade moderada" : "Conformidade baixa",
         160, cy
       );
    doc.text(`Alvo: ${scan?.target}`, 160, cy + 16);
    doc.text(`Data: ${new Date(scan?.completedAt ?? scan?.createdAt ?? Date.now()).toLocaleDateString("pt-PT")}`, 160, cy + 32);

    doc.moveDown(4);

    // ── Top 3 riscos ──
    const top3 = [...vulns]
      .sort((a, b) => parseFloat(b.cvssScore) - parseFloat(a.cvssScore))
      .slice(0, 3);

    if (top3.length > 0) {
      drawSectionTitle(doc, "Top 3 Riscos Identificados");
      top3.forEach((v, i) => {
        const sev = severityLabel(v.severity);
        doc.fontSize(10).font("Helvetica-Bold").fillColor(C.text)
           .text(`${i + 1}. ${v.cveId}`, { continued: true });
        doc.font("Helvetica").fillColor(C.muted).text(`  CVSS ${v.cvssScore} · ${sev}`);
        doc.fontSize(9).fillColor(C.muted).text(v.description ?? "", { indent: 14 });
        doc.moveDown(0.4);
      });
      doc.moveDown(0.5);
    }

    // ── Próximos passos ──
    drawSectionTitle(doc, "Próximos Passos Recomendados");
    const steps = buildNextSteps(overall, results);
    steps.forEach((step, i) => {
      doc.fontSize(10).font("Helvetica").fillColor(C.text)
         .text(`${i + 1}. ${step}`);
      doc.moveDown(0.3);
    });

    drawFooter(doc);
    doc.end();
  });
}

async function buildTechnicalReport(scan: Scan, vulns: Vuln[], org: Org): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margin: 50, info: { Title: "NIS2 Relatório Técnico" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const results   = (scan?.results ?? {}) as Record<string, any>;
    const nis2Scores: Array<{ article: string; title: string; score: number; findings: string[] }> =
      results.nis2Scores ?? [];
    const overall = nis2Scores.length
      ? Math.round(nis2Scores.reduce((a, s) => a + s.score, 0) / nis2Scores.length)
      : 0;

    // ── Header ──
    drawHeader(doc, "Relatório Técnico NIS2");

    // ── Metadata ──
    doc.fontSize(9).fillColor(C.muted).font("Helvetica");
    [
      ["Alvo",          scan?.target ?? "—"],
      ["Modo",          scan?.mode === "sme" ? "PME" : "Cadeia de abastecimento"],
      ["Data início",   scan?.startedAt   ? new Date(scan.startedAt).toLocaleString("pt-PT")   : "—"],
      ["Data conclusão",scan?.completedAt ? new Date(scan.completedAt).toLocaleString("pt-PT") : "—"],
      ["Score global",  `${overall}/100`],
    ].forEach(([label, val]) => {
      doc.text(`${label}: `, { continued: true }).fillColor(C.text).text(val ?? "—");
      doc.fillColor(C.muted);
    });

    doc.moveDown(1);

    // ── Scores por artigo ──
    if (nis2Scores.length > 0) {
      drawSectionTitle(doc, "Score NIS2 por Artigo (Art. 21(2))");
      const BAR_X = 50, BAR_MAX = 190, TEXT_X = 255, TEXT_W = 290;
      nis2Scores.forEach((s) => {
        if (doc.y > 700) doc.addPage();
        const rowY = doc.y;
        const fillW = Math.max(2, Math.round((s.score / 100) * BAR_MAX));
        // Bar background + fill
        doc.rect(BAR_X, rowY, BAR_MAX, 7).fillColor(C.border).fill();
        doc.rect(BAR_X, rowY, fillW, 7).fillColor(scoreColor(s.score)).fill();
        // Article label + score
        doc.fontSize(9).font("Helvetica-Bold").fillColor(C.text)
           .text(`${s.article} — ${s.score}/100`, TEXT_X, rowY - 1, { width: TEXT_W });
        doc.fontSize(8).font("Helvetica").fillColor(C.muted)
           .text(s.title, TEXT_X, rowY + 10, { width: TEXT_W });
        // Advance cursor past bar row
        doc.y = rowY + 24;
        // Findings (only failures worth showing)
        const fails = (s.findings ?? []).filter(Boolean).slice(0, 2);
        fails.forEach((f) => {
          doc.fontSize(7.5).fillColor(C.muted).text(`  • ${f}`, BAR_X, doc.y, { width: 495 });
        });
        if (fails.length) doc.moveDown(0.3);
      });
      doc.moveDown(0.8);
    }

    // ── Vulnerabilities ──
    if (vulns.length > 0) {
      drawSectionTitle(doc, `Vulnerabilidades Encontradas (${vulns.length})`);
      vulns.forEach((v) => {
        doc.fontSize(9).font("Helvetica-Bold").fillColor(C.text)
           .text(`${v.cveId}`, { continued: true });
        doc.font("Helvetica").fillColor(C.muted)
           .text(`  CVSS ${v.cvssScore} · ${severityLabel(v.severity)}${v.port ? ` · Porto ${v.port}` : ""}`);
        doc.fontSize(8).fillColor(C.muted).text(v.description ?? "", { indent: 10 });
        if (v.remediation) {
          doc.fontSize(8).fillColor(C.brand).text(`↳ ${v.remediation}`, { indent: 10 });
        }
        doc.moveDown(0.5);

        // Avoid page overflow — add page if near bottom
        if (doc.y > 720) doc.addPage();
      });
    } else {
      doc.fontSize(10).fillColor(C.success)
         .text("✓ Nenhuma vulnerabilidade conhecida encontrada.");
    }

    drawFooter(doc);
    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function drawHeader(doc: PDFKit.PDFDocument, title: string): void {
  // Blue top bar
  doc.rect(0, 0, 595, 6).fillColor(C.brand).fill();

  // Brand name only — target appears in the body
  doc.fontSize(18).fillColor(C.brand).font("Helvetica-Bold")
     .text("CISPLAN", 50, 25);

  doc.fontSize(14).fillColor(C.text).font("Helvetica-Bold")
     .text(title, 50, 55);

  // Horizontal rule
  doc.moveTo(50, 80).lineTo(545, 80).strokeColor(C.border).lineWidth(1).stroke();
  doc.moveDown(1.5);
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  doc.fontSize(11).fillColor(C.brand).font("Helvetica-Bold").text(title);
  doc.moveTo(doc.x, doc.y + 2).lineTo(545, doc.y + 2).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.moveDown(0.6);
}

function drawFooter(doc: PDFKit.PDFDocument): void {
  // y=755 keeps the footer within the A4 content area (page height 842 - margin 50 = 792)
  // avoids PDFKit auto-adding a new page when y > bottom margin
  doc.fontSize(8).fillColor(C.muted).font("Helvetica")
     .text(
       `CISPLAN · Relatório gerado em ${new Date().toLocaleDateString("pt-PT")}`,
       50, 755, { align: "center", width: 495 }
     );
}

function severityLabel(s: string): string {
  return { critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" }[s] ?? s;
}

function buildNextSteps(overall: number, results: Record<string, any>): string[] {
  const steps: string[] = [];
  if (overall < 60) {
    steps.push("Efectua uma auditoria de segurança completa com prioridade alta.");
    steps.push("Resolve imediatamente todas as vulnerabilidades críticas e altas.");
  }
  if ((results.criticalCount ?? 0) > 0) {
    steps.push(`Patcha ${results.criticalCount} vulnerabilidade(s) crítica(s) — janela recomendada: 24–72h.`);
  }
  if ((results.highCount ?? 0) > 0) {
    steps.push(`Resolve ${results.highCount} vulnerabilidade(s) alta(s) — janela recomendada: 7 dias.`);
  }
  steps.push("Completa o questionário NIS2 (42 controlos) para um score combinado mais preciso.");
  steps.push("Revê os guias de remediação gerados por IA na plataforma.");
  if (steps.length < 3) {
    steps.push("Mantém os sistemas actualizados e monitoriza regularmente com novos scans.");
  }
  return steps.slice(0, 5);
}

// ---------------------------------------------------------------------------
// S3 upload
// ---------------------------------------------------------------------------

async function uploadToStorage(
  buffer: Buffer,
  orgId: number,
  scanId: number,
  type: string
): Promise<string> {
  const key = `reports/${orgId}/${scanId}-${type}.pdf`;

  // Graceful fallback when storage isn't configured (dev mode)
  if (!process.env.STORAGE_ACCESS_KEY) {
    console.warn(`[PDF] Storage not configured — skipping upload. Key would be: ${key}`);
    return `https://storage.nis2pt.pt/${key}`;
  }

  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: "application/pdf",
      ACL:         "public-read",
    })
  );

  return `${process.env.STORAGE_PUBLIC_URL ?? "https://storage.nis2pt.pt"}/${key}`;
}
