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
  brand:  "#1d4ed8",
  gold:   "#b45309",
  text:   "#111827",
  muted:  "#6b7280",
};

export async function generateCertificateBuffer(opts: {
  userName: string;
  orgName: string;
  completedAt: Date;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", layout: "landscape", margin: 60,
                                     info: { Title: "Certificado CISPLAN" } });
    doc.registerFont("Sans",      FONT_REGULAR);
    doc.registerFont("Sans-Bold", FONT_BOLD);

    const chunks: Buffer[] = [];
    doc.on("data",  (c: Buffer) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 841.89; // A4 landscape width in points
    const H = 595.28;

    // ── Background ──
    doc.rect(0, 0, W, H).fillColor("#f0f4ff").fill();

    // ── Gold border frame ──
    doc.rect(20, 20, W - 40, H - 40).lineWidth(3).strokeColor(C.gold).stroke();
    doc.rect(26, 26, W - 52, H - 52).lineWidth(1).strokeColor(C.gold).stroke();

    // ── Blue top bar ──
    doc.rect(20, 20, W - 40, 8).fillColor(C.brand).fill();
    doc.rect(20, H - 28, W - 40, 8).fillColor(C.brand).fill();

    // ── Logo / Issuer ──
    doc.fontSize(13).fillColor(C.brand).font("Sans-Bold")
       .text("CISPLAN", 0, 52, { align: "center", width: W });

    doc.fontSize(9).fillColor(C.muted).font("Sans")
       .text("Conformidade NIS2 para PMEs Portuguesas", 0, 70, { align: "center", width: W });

    // ── Decorative rule ──
    doc.moveTo(W / 2 - 120, 92).lineTo(W / 2 + 120, 92)
       .strokeColor(C.gold).lineWidth(1).stroke();

    // ── Certificate of Completion title ──
    doc.fontSize(32).fillColor(C.gold).font("Sans-Bold")
       .text("Certificado de Conclusão", 0, 108, { align: "center", width: W });

    // ── Body text ──
    doc.fontSize(12).fillColor(C.muted).font("Sans")
       .text("Este certificado é atribuído a", 0, 165, { align: "center", width: W });

    // ── Recipient name ──
    doc.fontSize(28).fillColor(C.text).font("Sans-Bold")
       .text(opts.userName, 0, 187, { align: "center", width: W });

    // ── Underline name ──
    const nameWidth = Math.min(doc.widthOfString(opts.userName) + 40, 400);
    doc.moveTo(W / 2 - nameWidth / 2, 223)
       .lineTo(W / 2 + nameWidth / 2, 223)
       .strokeColor(C.gold).lineWidth(1.5).stroke();

    // ── Course and org ──
    doc.fontSize(12).fillColor(C.muted).font("Sans")
       .text("pela conclusão com sucesso do curso", 0, 237, { align: "center", width: W });

    doc.fontSize(15).fillColor(C.brand).font("Sans-Bold")
       .text("NIS2 para PMEs em Portugal", 0, 257, { align: "center", width: W });

    doc.fontSize(11).fillColor(C.muted).font("Sans")
       .text(`em representação de ${opts.orgName}`, 0, 281, { align: "center", width: W });

    // ── Date ──
    const dateStr = opts.completedAt.toLocaleDateString("pt-PT", {
      day: "numeric", month: "long", year: "numeric",
    });
    doc.fontSize(10).fillColor(C.muted).font("Sans")
       .text(`Concluído em ${dateStr}`, 0, 320, { align: "center", width: W });

    // ── Signature line ──
    doc.moveTo(W / 2 - 80, 365).lineTo(W / 2 + 80, 365)
       .strokeColor(C.muted).lineWidth(0.5).stroke();
    doc.fontSize(9).fillColor(C.muted).font("Sans")
       .text("CISPLAN", 0, 370, { align: "center", width: W });

    // ── Footer ──
    doc.fontSize(8).fillColor(C.muted).font("Sans")
       .text(
         `Documento gerado automaticamente por CISPLAN · ${new Date().toLocaleDateString("pt-PT")}`,
         0, H - 48, { align: "center", width: W }
       );

    doc.end();
  });
}
