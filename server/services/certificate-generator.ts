/**
 * server/services/certificate-generator.ts
 *
 * Generates a PDF completion certificate for the NIS2 course.
 * Uploads to Hetzner Object Storage and returns the public URL.
 */

import PDFDocument from "pdfkit";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

const BUCKET   = process.env.STORAGE_BUCKET ?? "nis2pt-reports";
const C = {
  brand:  "#1d4ed8",
  gold:   "#b45309",
  text:   "#111827",
  muted:  "#6b7280",
  border: "#e5e7eb",
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function generateCertificate(opts: {
  userId: number;
  userName: string;
  orgName: string;
  completedAt: Date;
  overallScore: number;
}): Promise<string> {
  const buffer = await buildCertificate(opts);
  return uploadCertificate(buffer, opts.userId);
}

// ---------------------------------------------------------------------------
// PDF builder
// ---------------------------------------------------------------------------

async function buildCertificate(opts: {
  userName: string;
  orgName: string;
  completedAt: Date;
  overallScore: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", layout: "landscape", margin: 60,
                                     info: { Title: "Certificado NIS2 Plataforma PT" } });
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
    doc.fontSize(13).fillColor(C.brand).font("Helvetica-Bold")
       .text("NIS2 Plataforma PT", 0, 52, { align: "center", width: W });

    doc.fontSize(9).fillColor(C.muted).font("Helvetica")
       .text("Conformidade NIS2 para PMEs Portuguesas | nis2pt.pt", 0, 70, { align: "center", width: W });

    // ── Decorative rule ──
    doc.moveTo(W / 2 - 120, 92).lineTo(W / 2 + 120, 92)
       .strokeColor(C.gold).lineWidth(1).stroke();

    // ── Certificate of Completion title ──
    doc.fontSize(32).fillColor(C.gold).font("Helvetica-Bold")
       .text("Certificado de Conclusão", 0, 108, { align: "center", width: W });

    // ── Body text ──
    doc.fontSize(12).fillColor(C.muted).font("Helvetica")
       .text("Este certificado é atribuído a", 0, 160, { align: "center", width: W });

    // ── Recipient name ──
    doc.fontSize(28).fillColor(C.text).font("Helvetica-Bold")
       .text(opts.userName, 0, 182, { align: "center", width: W });

    // ── Underline name ──
    const nameWidth = Math.min(doc.widthOfString(opts.userName, { fontSize: 28 }) + 40, 400);
    doc.moveTo(W / 2 - nameWidth / 2, 218)
       .lineTo(W / 2 + nameWidth / 2, 218)
       .strokeColor(C.gold).lineWidth(1.5).stroke();

    // ── Course and org ──
    doc.fontSize(12).fillColor(C.muted).font("Helvetica")
       .text("pela conclusão com sucesso do curso", 0, 232, { align: "center", width: W });

    doc.fontSize(15).fillColor(C.brand).font("Helvetica-Bold")
       .text("NIS2 para PMEs em Portugal", 0, 252, { align: "center", width: W });

    doc.fontSize(11).fillColor(C.muted).font("Helvetica")
       .text(`em representação de ${opts.orgName}`, 0, 276, { align: "center", width: W });

    // ── Score badge ──
    const bx = W / 2 - 44, by = 305;
    doc.roundedRect(bx, by, 88, 48, 8).fillColor(C.brand).fill();
    doc.fontSize(24).fillColor("white").font("Helvetica-Bold")
       .text(String(opts.overallScore), bx, by + 4, { width: 88, align: "center" });
    doc.fontSize(9).fillColor("white").font("Helvetica")
       .text("/ 100  Score NIS2", bx, by + 30, { width: 88, align: "center" });

    // ── Date ──
    const dateStr = opts.completedAt.toLocaleDateString("pt-PT", {
      day: "numeric", month: "long", year: "numeric",
    });
    doc.fontSize(10).fillColor(C.muted).font("Helvetica")
       .text(`Concluído em ${dateStr}`, 0, 370, { align: "center", width: W });

    // ── Signature line ──
    doc.moveTo(W / 2 - 80, 415).lineTo(W / 2 + 80, 415)
       .strokeColor(C.muted).lineWidth(0.5).stroke();
    doc.fontSize(9).fillColor(C.muted).font("Helvetica")
       .text("NIS2 Plataforma PT", 0, 420, { align: "center", width: W });

    // ── Footer ──
    doc.fontSize(8).fillColor(C.muted)
       .text(
         `Documento gerado automaticamente por NIS2 Plataforma PT · ${new Date().toLocaleDateString("pt-PT")}`,
         0, H - 48, { align: "center", width: W }
       );

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// S3 upload
// ---------------------------------------------------------------------------

async function uploadCertificate(buffer: Buffer, userId: number): Promise<string> {
  const key = `certificates/${userId}/nis2-certificate-${Date.now()}.pdf`;

  if (!process.env.STORAGE_ACCESS_KEY) {
    console.warn(`[Certificate] Storage not configured — skipping upload. Key: ${key}`);
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
