/**
 * backend/services/certificate-generator.ts
 *
 * Generates a PDF completion certificate for the NIS2 course.
 * Returns a Buffer (base64 conversion done at the router level).
 */

import PDFDocument from "pdfkit";
import path from "path";

const FONT_REGULAR = path.join(__dirname, "..", "assets", "fonts", "DejaVuSans.ttf");
const FONT_BOLD    = path.join(__dirname, "..", "assets", "fonts", "DejaVuSans-Bold.ttf");

const C = {
  navy:  "#12233b",
  gold:  "#b45309",
  text:  "#111827",
  muted: "#6b7280",
};

export async function generateCertificateBuffer(opts: {
  userName: string;
  orgName: string;
  completedAt: Date;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0,
                                   info: { Title: "Certificado CISPLAN" } });
    doc.registerFont("Sans",      FONT_REGULAR);
    doc.registerFont("Sans-Bold", FONT_BOLD);

    const chunks: Buffer[] = [];
    doc.on("data",  (c: Buffer) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 841.89;
    const H = 595.28;

    // ── Background ──
    doc.rect(0, 0, W, H).fillColor("#f8faff").fill();

    // ── Double frame navy ──
    doc.rect(15, 15, W - 30, H - 30).lineWidth(1.5).strokeColor(C.navy).stroke();
    doc.rect(23, 23, W - 46, H - 46).lineWidth(0.5).strokeColor(C.navy).stroke();

    // ── CISPLAN header ──
    doc.fontSize(20).font("Sans-Bold").fillColor(C.navy)
       .text("CISPLAN", 0, 42, { align: "center", width: W });

    doc.fontSize(9).font("Sans").fillColor(C.muted)
       .text("Conformidade NIS2 para PMEs Portuguesas", 0, 68, { align: "center", width: W });

    // ── Gold rule ──
    doc.moveTo(W / 2 - 140, 86).lineTo(W / 2 + 140, 86)
       .strokeColor(C.gold).lineWidth(0.8).stroke();

    // ── CERTIFICADO DE CONCLUSÃO ──
    doc.fontSize(15).font("Sans-Bold").fillColor(C.navy)
       .text("CERTIFICADO DE CONCLUSÃO", 0, 98, {
         align: "center", width: W, characterSpacing: 3,
       });

    // ── Thin navy separator ──
    doc.moveTo(W / 2 - 100, 124).lineTo(W / 2 + 100, 124)
       .strokeColor(C.navy).lineWidth(0.3).stroke();

    // ── "Este certificado é atribuído a" ──
    doc.fontSize(10).font("Sans").fillColor(C.muted)
       .text("Este certificado é atribuído a", 0, 138, { align: "center", width: W });

    // ── Recipient name — reduced if name exceeds useful width ──
    const MAX_NAME_W = 560;
    let namePt = 24;
    doc.fontSize(namePt).font("Sans-Bold");
    while (namePt > 13 && doc.widthOfString(opts.userName) > MAX_NAME_W) {
      namePt -= 1;
      doc.fontSize(namePt);
    }
    const nameLineH = doc.currentLineHeight();
    const nameY     = 158;

    doc.fillColor(C.text)
       .text(opts.userName, 0, nameY, { align: "center", width: W });

    // ── Gold underline under name ──
    const nameStrW   = Math.min(doc.widthOfString(opts.userName) + 40, 440);
    const underlineY = nameY + nameLineH + 4;
    doc.moveTo(W / 2 - nameStrW / 2, underlineY)
       .lineTo(W / 2 + nameStrW / 2, underlineY)
       .strokeColor(C.gold).lineWidth(1).stroke();

    // ── Course block ──
    let y = underlineY + 22;

    doc.fontSize(10).font("Sans").fillColor(C.muted)
       .text("pela conclusão com sucesso do curso", 0, y, { align: "center", width: W });
    y += doc.currentLineHeight() + 6;

    doc.fontSize(14).font("Sans-Bold").fillColor(C.navy)
       .text("NIS2 para PMEs em Portugal", 0, y, { align: "center", width: W });
    y += doc.currentLineHeight() + 7;

    doc.fontSize(10).font("Sans").fillColor(C.muted)
       .text(`em representação de ${opts.orgName}`, 0, y, { align: "center", width: W });
    y += doc.currentLineHeight() + 16;

    const dateStr = opts.completedAt.toLocaleDateString("pt-PT", {
      day: "numeric", month: "long", year: "numeric",
    });
    doc.fontSize(9).font("Sans").fillColor(C.muted)
       .text(`Concluído em ${dateStr}`, 0, y, { align: "center", width: W });

    // ── Vectorial seal ──
    const cx  = W / 2;
    const cy  = 448;
    const rOuter = 40;
    const rInner = 33;

    doc.circle(cx, cy, rOuter).lineWidth(1.5).strokeColor(C.navy).stroke();
    doc.circle(cx, cy, rInner).lineWidth(0.5).strokeColor(C.navy).stroke();

    doc.fontSize(8).font("Sans-Bold").fillColor(C.navy)
       .text("CISPLAN", cx - 35, cy - 7, { width: 70, align: "center" });
    doc.fontSize(6).font("Sans").fillColor(C.navy)
       .text("NIS2 · 2026", cx - 35, cy + 5, { width: 70, align: "center" });

    // ── Footer ──
    doc.fontSize(8).font("Sans").fillColor(C.muted)
       .text(
         `Documento gerado automaticamente por CISPLAN · ${new Date().toLocaleDateString("pt-PT")}`,
         0, H - 42, { align: "center", width: W }
       );

    doc.end();
  });
}
