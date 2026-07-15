/**
 * backend/services/questionnaire-pdf-generator.ts
 *
 * Gerador de PDF para o Relatório de Autoavaliação NIS2 (questionário organizacional).
 * Distinto dos relatórios técnico/executivo do scan — avalia medidas organizacionais.
 */

import PDFDocument from "pdfkit";
import path from "path";

const FONT_REGULAR = path.join(__dirname, "..", "assets", "fonts", "DejaVuSans.ttf");
const FONT_BOLD    = path.join(__dirname, "..", "assets", "fonts", "DejaVuSans-Bold.ttf");

// ---------------------------------------------------------------------------
// Design tokens — alinhados com pdf-report-generator.ts
// ---------------------------------------------------------------------------

const C = {
  brand:   "#1d4ed8",
  navy:    "#0f1e38",
  navyMid: "#152744",
  success: "#10b981",
  warning: "#f59e0b",
  danger:  "#ef4444",
  text:    "#111827",
  muted:   "#6b7280",
  border:  "#e5e7eb",
  white:   "#ffffff",
  amber:   "#92400e",
  amberBg: "#fffbeb",
};

const PAGE_W  = 595;
const PAGE_H  = 842;
const MARGIN  = 50;
const CW             = PAGE_W - MARGIN * 2;  // content width = 495
const CONTENT_BOTTOM = 757;

// ---------------------------------------------------------------------------
// Types — espelham o que o router devolve
// ---------------------------------------------------------------------------

export interface QReportMeasure {
  slug:          string;
  article:       string;
  title:         string;
  score:         number | null;
  controlCount:  number;
  answeredCount: number;
  gapCount:      number;
}

export interface QReportGap {
  controlId:         string;
  article:           string;
  articleSlug:       string;
  articleTitle:      string;
  question:          string;
  answer:            "no" | "partial";
  helpText:          string;
  why:               string;
  priority:          number;
  suggestedDocument: string | null;
  evidenceType:      string;
  evidenceRequired:  boolean;
}

export interface QReportData {
  orgName:         string;
  sessionId:       number;
  completedAt:     Date | null;
  overallScore:    number;
  answeredCount:   number;
  totalApplicable: number;
  measureScores:   QReportMeasure[];
  gaps:            QReportGap[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(s: number): string {
  if (s >= 80) return C.success;
  if (s >= 60) return C.warning;
  return C.danger;
}

function scoreLabel(s: number): string {
  if (s >= 80) return "Conformidade Elevada";
  if (s >= 60) return "Conformidade Moderada";
  return "Conformidade Baixa";
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function drawHeaderStrip(doc: PDFKit.PDFDocument, subtitle: string): void {
  doc.rect(0, 0, PAGE_W, 110).fillColor(C.navy).fill();
  doc.fontSize(18).font("Sans-Bold").fillColor(C.white)
     .text("NIS2 PT", MARGIN, 26);
  doc.fontSize(8).font("Sans").fillColor("#7dd3fc")
     .text("CISPLAN — Plataforma de Conformidade NIS2", MARGIN, 48);
  // Right: subtitle
  doc.fontSize(9).font("Sans-Bold").fillColor("#94a3b8")
     .text(subtitle, 0, 40, { align: "right", width: PAGE_W - MARGIN });
  // Accent line
  doc.rect(0, 110, PAGE_W, 3).fillColor(C.brand).fill();
}

function drawPageFooter(doc: PDFKit.PDFDocument, pageNum: number, total: string): void {
  const y = PAGE_H - 36;
  doc.rect(0, y, PAGE_W, 36).fillColor(C.navy).fill();
  doc.fontSize(7).font("Sans").fillColor(C.muted)
     .text(
       "Autoavaliação organizacional NIS2 — Não constitui certificação nem auditoria de conformidade formal.",
       MARGIN, y + 8, { width: CW - 80 }
     );
  doc.fontSize(7).font("Sans").fillColor(C.muted)
     .text(`${pageNum} / ${total}`, PAGE_W - MARGIN - 30, y + 13, { width: 30, align: "right" });
}

function newPage(doc: PDFKit.PDFDocument): number {
  doc.addPage({ size: "A4", margin: 0 });
  return 130; // y after header strip
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateQuestionnaireReportPdf(data: QReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    doc.registerFont("Sans",      FONT_REGULAR);
    doc.registerFont("Sans-Bold", FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const {
      orgName, sessionId, completedAt, overallScore,
      answeredCount, totalApplicable, measureScores, gaps,
    } = data;

    const totalPages = gaps.length > 12 ? "3+" : gaps.length > 0 ? "2" : "2";
    const coverage   = Math.round((answeredCount / 42) * 100);

    // ── PAGE 1: CAPA + SCORE GLOBAL + SCORE POR MEDIDA ─────────────────────

    drawHeaderStrip(doc, "RELATÓRIO DE AUTOAVALIAÇÃO NIS2");

    let y = 128;

    // Organisation + date row
    doc.rect(MARGIN, y, CW, 42).fillColor("#f0f4ff").fill();
    doc.rect(MARGIN, y, 3, 42).fillColor(C.brand).fill();
    doc.fontSize(12).font("Sans-Bold").fillColor(C.text)
       .text(orgName, MARGIN + 12, y + 8, { width: CW - 20 });
    doc.fontSize(8).font("Sans").fillColor(C.muted)
       .text(
         `Art. 21(2) DL 125/2025  ·  Sessão #${sessionId}  ·  ${fmtDate(completedAt)}`,
         MARGIN + 12, y + 26, { width: CW - 20 }
       );
    y += 54;

    // Score circle + summary
    const cx = MARGIN + 56;
    const cy = y + 48;
    doc.circle(cx, cy, 46).fillColor(C.navyMid).fill();
    doc.circle(cx, cy, 42).fillColor(scoreColor(overallScore)).fill();
    doc.fontSize(26).font("Sans-Bold").fillColor(C.white)
       .text(String(overallScore), cx - 28, cy - 16, { width: 56, align: "center" });
    doc.fontSize(8).font("Sans").fillColor(C.white)
       .text("/ 100", cx - 20, cy + 12, { width: 40, align: "center" });

    const sx = MARGIN + 112;
    doc.fontSize(13).font("Sans-Bold").fillColor(C.text)
       .text("Score de Autoavaliação (Questionário)", sx, y + 12);
    doc.fontSize(11).font("Sans").fillColor(scoreColor(overallScore))
       .text(scoreLabel(overallScore), sx, y + 30);
    doc.fontSize(8).font("Sans").fillColor(C.muted)
       .text(
         `${answeredCount} de 42 controlos respondidos (${coverage}% cobertura)` +
         (gaps.length > 0 ? `  ·  ${gaps.length} lacuna${gaps.length > 1 ? "s" : ""} identificada${gaps.length > 1 ? "s" : ""}` : ""),
         sx, y + 50
       );
    doc.fontSize(7.5).font("Sans").fillColor(C.muted)
       .text(
         "Score calculado apenas sobre os controlos respondidos (exclui N.A. e não respondidos).",
         sx, y + 64
       );
    y += 108;

    // Disclaimer box
    doc.rect(MARGIN, y, CW, 28).fillColor(C.amberBg).fill();
    doc.rect(MARGIN, y, 3, 28).fillColor(C.warning).fill();
    doc.fontSize(7.5).font("Sans-Bold").fillColor(C.amber)
       .text("AVISO: ", MARGIN + 10, y + 4, { continued: true });
    doc.font("Sans").fillColor(C.amber)
       .text(
         "Este relatório é resultado de uma autoavaliação e não constitui certificação nem auditoria de conformidade formal ao abrigo do DL 125/2025.",
         { width: CW - 20 }
       );
    y += 40;

    // ── Score por medida ────────────────────────────────────────────────────
    doc.fontSize(10).font("Sans-Bold").fillColor(C.text)
       .text("Score por Medida — Art. 21(2)", MARGIN, y);
    y += 16;

    const BAR_LABEL_W = 120;
    const BAR_W       = CW - BAR_LABEL_W - 60;

    for (const m of measureScores) {
      if (y > CONTENT_BOTTOM) {
        drawPageFooter(doc, 1, totalPages);
        y = newPage(doc);
        drawHeaderStrip(doc, "SCORE POR MEDIDA");
      }

      // Article label
      doc.fontSize(7.5).font("Sans-Bold").fillColor(C.muted)
         .text(`Art. 21(2)(${m.slug})`, MARGIN, y + 2, { width: BAR_LABEL_W });

      // Bar track
      doc.rect(MARGIN + BAR_LABEL_W, y, BAR_W, 9).fillColor(C.border).fill();

      if (m.score === null) {
        // Sem respostas — barra tracejada simulada com texto
        doc.fontSize(7).font("Sans").fillColor(C.muted)
           .text("sem respostas", MARGIN + BAR_LABEL_W + 4, y + 1);
      } else {
        const fill = Math.max(3, Math.round((m.score / 100) * BAR_W));
        doc.rect(MARGIN + BAR_LABEL_W, y, fill, 9).fillColor(scoreColor(m.score)).fill();
        // Score number
        doc.fontSize(7.5).font("Sans-Bold").fillColor(scoreColor(m.score))
           .text(String(m.score), MARGIN + BAR_LABEL_W + BAR_W + 4, y + 1, { width: 28 });
        // Gap count
        if (m.gapCount > 0) {
          doc.fontSize(6.5).font("Sans").fillColor(C.danger)
             .text(`${m.gapCount}L`, MARGIN + BAR_LABEL_W + BAR_W + 32, y + 2, { width: 18 });
        }
      }

      // Short title (truncated)
      const shortTitle = m.title.length > 42 ? m.title.slice(0, 40) + "…" : m.title;
      doc.fontSize(6.5).font("Sans").fillColor(C.muted)
         .text(shortTitle, MARGIN, y + 12, { width: CW });

      y += 26;
    }

    // ── PAGE 2+: PLANO DE AÇÃO ───────────────────────────────────────────────
    if (gaps.length > 0) {
      drawPageFooter(doc, 1, totalPages);
      y = newPage(doc);
      drawHeaderStrip(doc, "PLANO DE AÇÃO");

      doc.fontSize(11).font("Sans-Bold").fillColor(C.text)
         .text(`Plano de Ação Priorizado (${gaps.length} lacuna${gaps.length > 1 ? "s" : ""})`, MARGIN, y);
      doc.fontSize(7.5).font("Sans").fillColor(C.muted)
         .text(
           "Ordenado do mais urgente ao menos urgente. Prioridade: peso regulatório da medida × gravidade da lacuna.",
           MARGIN, y + 16, { width: CW }
         );
      y += 34;

      let pageNum = 2;

      for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i];

        const tw = CW - 32;

        // Measured heights — DejaVu metrics via heightOfString
        const headerH = doc.fontSize(7.5).font("Sans-Bold").heightOfString("X", {});
        const qH      = doc.fontSize(8).font("Sans-Bold").heightOfString(gap.question, { width: tw });
        const helpH   = doc.fontSize(7.5).font("Sans").heightOfString(
          "O que fazer: " + gap.helpText, { width: tw }
        );
        // linha mista bold+regular: medir com a bold (conservador — sobrestima, nunca transborda)
        const docH  = gap.suggestedDocument
          ? doc.fontSize(7).font("Sans-Bold").heightOfString(
              "Entregável: " + gap.suggestedDocument +
              (gap.evidenceRequired ? "  (obrigatório)" : ""),
              { width: tw }
            )
          : 0;
        const rowH = 8 + headerH + qH + helpH + docH + 16;

        if (y + rowH > CONTENT_BOTTOM) {
          drawPageFooter(doc, pageNum++, totalPages);
          y = newPage(doc);
          drawHeaderStrip(doc, "PLANO DE AÇÃO (cont.)");
        }

        // Row background
        const rowBg = i % 2 === 0 ? "#f8fafc" : C.white;
        doc.rect(MARGIN, y, CW, rowH).fillColor(rowBg).fill();
        doc.rect(MARGIN, y, CW, rowH).strokeColor(C.border).lineWidth(0.3).stroke();

        // Priority number circle
        const circleColor = gap.answer === "no" ? C.danger : C.warning;
        const numX = MARGIN + 14;
        const numY = y + rowH / 2;
        doc.circle(numX, numY, 10).fillColor(circleColor).fill();
        doc.fontSize(8).font("Sans-Bold").fillColor(C.white)
           .text(String(i + 1), numX - 8, numY - 5, { width: 16, align: "center" });

        const tx = MARGIN + 30;
        let iy = y + 8;

        // Control ID + answer badge + article
        const answerLabel = gap.answer === "no" ? "Não cumprido" : "Parcialmente cumprido";
        doc.fontSize(7.5).font("Sans-Bold").fillColor(C.brand)
           .text(gap.controlId, tx, iy, { continued: true });
        doc.fillColor(circleColor)
           .text(`  ${answerLabel}`, { continued: true });
        doc.fillColor(C.muted)
           .text(`  ·  Art. 21(2)(${gap.articleSlug})`);
        iy = doc.y;

        // Question
        doc.fontSize(8).font("Sans-Bold").fillColor(C.text)
           .text(gap.question, tx, iy, { width: tw });
        iy = doc.y;

        // What to do
        doc.fontSize(7.5).font("Sans").fillColor(C.muted)
           .text("O que fazer: ", tx, iy, { width: tw, continued: true });
        doc.fillColor(C.text).text(gap.helpText, { width: tw });
        iy = doc.y;

        // Suggested document
        if (gap.suggestedDocument) {
          doc.fontSize(7).font("Sans-Bold").fillColor(C.muted)
             .text("Entregável: ", tx, iy, { width: tw, continued: true });
          doc.font("Sans").fillColor(C.text)
             .text(gap.suggestedDocument, { continued: gap.evidenceRequired });
          if (gap.evidenceRequired) {
            doc.fillColor(C.danger).text("  (obrigatório)");
          }
        }

        y += rowH + 4;
      }

      drawPageFooter(doc, pageNum, totalPages);
    } else {
      drawPageFooter(doc, 1, totalPages);
    }

    doc.end();
  });
}
