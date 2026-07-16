/**
 * backend/services/questionnaire-pdf-generator.ts
 *
 * Gerador de PDF para o Relatório de Autoavaliação NIS2 (questionário organizacional).
 * Distinto dos relatórios técnico/executivo do scan — avalia medidas organizacionais.
 */

import PDFDocument from "pdfkit";
import path from "path";
import { drawGauge, drawNIS2Radar } from "./pdf-chart-helpers";

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

const PAGE_W         = 595;
const PAGE_H         = 842;
const MARGIN         = 50;
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
  doc.fontSize(22).font("Sans-Bold").fillColor(C.white)
     .text("CISPLAN", MARGIN, 24);
  doc.fontSize(8).font("Sans").fillColor("#7dd3fc")
     .text("Plataforma de Conformidade NIS2", MARGIN, 50);
  doc.fontSize(9).font("Sans-Bold").fillColor("#94a3b8")
     .text(subtitle, 0, 40, { align: "right", width: PAGE_W - MARGIN });
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
  return 130;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateQuestionnaireReportPdf(data: QReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true, bufferPages: true });
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

    const coverage = Math.round((answeredCount / 42) * 100);

    // ── PAGE 1: DASHBOARD ──────────────────────────────────────────────────────

    drawHeaderStrip(doc, "RELATÓRIO DE AUTOAVALIAÇÃO NIS2");

    let y = 128;

    // Badge CONFIDENCIAL — computar antes para reservar espaço na org row
    const badgeTxt = "CONFIDENCIAL";
    doc.fontSize(7).font("Sans-Bold");
    const badgeW  = doc.widthOfString(badgeTxt) + 16;
    const badgeH  = 16;
    const orgRowH = 42;

    // Org + date row
    doc.rect(MARGIN, y, CW, orgRowH).fillColor("#f0f4ff").fill();
    doc.rect(MARGIN, y, 3, orgRowH).fillColor(C.brand).fill();
    doc.fontSize(12).font("Sans-Bold").fillColor(C.text)
       .text(orgName, MARGIN + 12, y + 8, { width: CW - badgeW - 28 });
    doc.fontSize(8).font("Sans").fillColor(C.muted)
       .text(
         `Art. 21(2) DL 125/2025  ·  Sessão #${sessionId}  ·  ${fmtDate(completedAt)}`,
         MARGIN + 12, y + 26, { width: CW - badgeW - 28 }
       );
    const badgeX = MARGIN + CW - badgeW - 8;
    const badgeY = y + (orgRowH - badgeH) / 2;
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3).fillColor(C.danger).fill();
    doc.fontSize(7).font("Sans-Bold").fillColor(C.white)
       .text(badgeTxt, badgeX, badgeY + 4, { width: badgeW, align: "center", lineBreak: false });
    y += orgRowH + 8;  // y=178

    // ── ROW A: Gauge (r=46) + 3 KPI tiles ─────────────────────────────────────
    const gR     = 46;
    const gaugeH = drawGauge(doc, MARGIN, y, overallScore, scoreLabel(overallScore), gR);
    // gaugeH = gR*2+30 = 122

    const tilesX  = MARGIN + gR * 2 + 12;        // 154
    const tilesW  = CW - gR * 2 - 12;            // 391
    const tileGap = 8;
    const tileW   = (tilesW - 2 * tileGap) / 3;  // 125
    const kpiData = [
      { value: String(answeredCount), sub: "/ 42 controlos",                         color: C.brand },
      { value: `${coverage}%`,        sub: "Cobertura",                               color: scoreColor(coverage) },
      { value: String(gaps.length),   sub: gaps.length === 1 ? "lacuna" : "lacunas", color: gaps.length > 0 ? C.danger : C.success },
    ];
    kpiData.forEach(({ value, sub, color }, i) => {
      const tx = tilesX + i * (tileW + tileGap);
      doc.roundedRect(tx, y, tileW, gaugeH, 4).fillColor("#f8fafc").fill();
      doc.rect(tx, y, tileW, 3).fillColor(color).fill();
      doc.fontSize(22).font("Sans-Bold").fillColor(color)
         .text(value, tx, y + 26, { width: tileW, align: "center" });
      doc.fontSize(8).font("Sans").fillColor(C.muted)
         .text(sub, tx, y + 56, { width: tileW, align: "center" });
    });
    y += gaugeH + 12;  // y ~312

    // ── ROW B: Radar (r=80) + Barras de lacunas por medida ─────────────────────
    const radarR   = 80;
    const radarDim = (radarR + 20) * 2;       // 200
    const barsColX = MARGIN + radarDim + 12;  // 262
    const barsColW = CW - radarDim - 12;      // 283

    const radarScores: Record<string, number | null> = Object.fromEntries(
      measureScores.map(m => [m.slug, m.score])
    );
    const radarH = drawNIS2Radar(doc, MARGIN, y, radarScores, radarR);

    const gapArticles = [...measureScores]
      .filter(m => m.gapCount > 0);

    let barsH = 0;
    if (gapArticles.length > 0) {
      doc.fontSize(8).font("Sans-Bold").fillColor(C.muted)
         .text("Lacunas por Medida", barsColX, y);
      const subText = "N.º de lacunas por artigo — apenas medidas com lacunas identificadas";
      doc.fontSize(7).font("Sans");
      const subH = doc.heightOfString(subText, { width: barsColW });
      doc.fillColor(C.muted).text(subText, barsColX, y + 13, { width: barsColW });
      barsH = 13 + subH + 4;

      // máximo real do array — nunca assumir posição (bug sessão #1)
      const maxGap   = Math.max(...gapArticles.map(m => m.gapCount));
      const bSlugW   = 20;
      const bTitleW  = 150;
      const bCountW  = 24;
      const bBarW    = Math.max(0, barsColW - bSlugW - bTitleW - bCountW - 12);  // 77

      doc.fontSize(7).font("Sans");
      const barLineH  = doc.currentLineHeight();
      doc.fontSize(8).font("Sans-Bold");
      const slugLineH = doc.currentLineHeight();

      let rowsY = y + barsH;
      gapArticles.forEach((m) => {
        const rawTitleH = doc.fontSize(7).font("Sans").heightOfString(m.title, { width: bTitleW });
        const titleH    = Math.min(rawTitleH, 2 * barLineH);
        const rowH_i    = Math.max(18, titleH + 6);

        doc.fontSize(8).font("Sans-Bold").fillColor(C.brand)
           .text(m.slug, barsColX, rowsY + (rowH_i - slugLineH) / 2, { width: bSlugW });

        doc.fontSize(7).font("Sans").fillColor(C.text);
        doc.text(m.title, barsColX + bSlugW + 4, rowsY + (rowH_i - titleH) / 2,
                 { width: bTitleW, height: 2 * barLineH, ellipsis: true });

        const bx    = barsColX + bSlugW + 4 + bTitleW + 4;
        const barY  = rowsY + (rowH_i - 10) / 2;
        const bFill = Math.min(bBarW, Math.max(3, Math.round((m.gapCount / maxGap) * bBarW)));
        doc.rect(bx, barY, bBarW, 10).fillColor(C.border).fill();
        doc.rect(bx, barY, bFill, 10).fillColor(C.danger).fill();

        doc.fontSize(7.5).font("Sans-Bold").fillColor(C.text)
           .text(String(m.gapCount), bx + bBarW + 4, barY, { width: bCountW });

        rowsY += rowH_i;
        barsH  += rowH_i;
      });
    }

    y += Math.max(radarH, barsH) + 12;

    // ── AVISO ──────────────────────────────────────────────────────────────────
    const avisoBody = "Este relatório é resultado de uma autoavaliação e não constitui certificação nem auditoria de conformidade formal ao abrigo do DL 125/2025.";
    const avisoTW   = CW - 20;
    // Medir com Bold (conservador para linha mista Bold+Regular — sobrestima, nunca transborda)
    const avisoTH   = doc.fontSize(7.5).font("Sans-Bold").heightOfString("AVISO:  " + avisoBody, { width: avisoTW });
    const avisoBoxH = 4 + avisoTH + 6;
    doc.rect(MARGIN, y, CW, avisoBoxH).fillColor(C.amberBg).fill();
    doc.rect(MARGIN, y, 3, avisoBoxH).fillColor(C.warning).fill();
    doc.fontSize(7.5).font("Sans-Bold").fillColor(C.amber)
       .text("AVISO: ", MARGIN + 10, y + 4, { width: avisoTW, continued: true });
    doc.font("Sans").fillColor(C.amber).text(avisoBody);
    y += avisoBoxH + 8;

    // ── ROW C: Top prioridades do plano de ação ─────────────────────────────
    if (gaps.length > 0) {
      const cardHeaderH = doc.fontSize(7.5).font("Sans-Bold").heightOfString("X", {});
      const cardPad     = 4;
      const cardGap     = 4;
      const top3TitleH  = 14;
      const cardQW      = CW - 16;

      doc.fontSize(8).font("Sans-Bold");
      const qLineH = doc.currentLineHeight();

      // Pré-medir até 3 candidatos — qH real por cartão, clampado a 2 linhas
      const candidates = gaps.slice(0, 3).map((gap) => {
        const rawQH  = doc.fontSize(8).font("Sans-Bold").heightOfString(gap.question, { width: cardQW });
        const qH     = Math.min(rawQH, 2 * qLineH);
        const cardH  = cardPad + cardHeaderH + 4 + qH + cardPad;
        return { gap, qH, cardH };
      });

      // maxCards com alturas reais — válvula top-3 → top-2 → top-1
      let roomUsed = y + top3TitleH;
      let maxCards = 0;
      for (const { cardH } of candidates) {
        const needed = (maxCards > 0 ? cardGap : 0) + cardH;
        if (roomUsed + needed > CONTENT_BOTTOM) break;
        roomUsed += needed;
        maxCards++;
      }

      if (maxCards > 0) {
        doc.fontSize(9).font("Sans-Bold").fillColor(C.text)
           .text("Top Prioridades do Plano de Ação", MARGIN, y);
        y += top3TitleH;

        candidates.slice(0, maxCards).forEach(({ gap, qH, cardH }, i) => {
          if (i > 0) y += cardGap;
          const rowBg       = i % 2 === 0 ? "#f8fafc" : C.white;
          const circleColor = gap.answer === "no" ? C.danger : C.warning;
          doc.rect(MARGIN, y, CW, cardH).fillColor(rowBg).fill();
          doc.rect(MARGIN, y, CW, cardH).strokeColor(C.border).lineWidth(0.3).stroke();
          doc.rect(MARGIN, y, 3, cardH).fillColor(circleColor).fill();

          const answerLabel = gap.answer === "no" ? "Não cumprido" : "Parcial";
          doc.fontSize(7.5).font("Sans-Bold").fillColor(C.brand)
             .text(gap.controlId, MARGIN + 8, y + cardPad, { continued: true });
          doc.fillColor(circleColor).text(`  ${answerLabel}`, { continued: true });
          doc.fillColor(C.muted).text(`  ·  Art. 21(2)(${gap.articleSlug})`);

          doc.fontSize(8).font("Sans-Bold").fillColor(C.text);
          doc.text(gap.question, MARGIN + 8, y + cardPad + cardHeaderH + 4,
                   { width: cardQW, height: 2 * qLineH, ellipsis: true });

          y += cardH;
        });
      }
    }

    // ── PAGE 2+: PLANO DE AÇÃO ───────────────────────────────────────────────
    if (gaps.length > 0) {
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

    }

    // Passagem final: rodapés com total real (bufferPages: true)
    const range = doc.bufferedPageRange();
    const total  = range.count;
    for (let p = 0; p < total; p++) {
      doc.switchToPage(range.start + p);
      drawPageFooter(doc, p + 1, String(total));
    }
    doc.flushPages();
    doc.end();
  });
}
