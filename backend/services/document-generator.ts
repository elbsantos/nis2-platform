/**
 * backend/services/document-generator.ts
 *
 * Infra de geração de documentos NIS2 auto-preenchidos.
 * C14b: skeleton com verificação de templates e content-types.
 * C15/C16/C17: preenchimento de dados reais em cada função.
 *
 * Templates em backend/assets/templates/ (copiados pelo build step):
 *   - registo-riscos.xlsx
 *   - inventario-ativos.xlsx
 *   - psi-template.docx
 */

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

// ---------------------------------------------------------------------------
// Caminhos e constantes
// ---------------------------------------------------------------------------

export const TEMPLATE_DIR = path.join(__dirname, "..", "assets", "templates");

export const TEMPLATE_PATHS = {
  registoRiscos:    path.join(TEMPLATE_DIR, "registo-riscos.xlsx"),
  inventarioAtivos: path.join(TEMPLATE_DIR, "inventario-ativos.xlsx"),
  psi:              path.join(TEMPLATE_DIR, "psi-template.docx"),
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
// Geradores (C15/C16/C17 preenchem dados reais dentro de cada função)
// ---------------------------------------------------------------------------

export async function generateRegistoRiscos(scanId: number, orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.registoRiscos);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATHS.registoRiscos);
  // C15: agregação por (affectedComponent, severity) e preenchimento linhas 8-37
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generateInventarioAtivos(scanId: number, orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.inventarioAtivos);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATHS.inventarioAtivos);
  // C16: mapeamento de openPorts + resolvedIp, linhas 6-23
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generatePsi(orgId: number): Promise<Buffer> {
  requireTemplate(TEMPLATE_PATHS.psi);
  const content = fs.readFileSync(TEMPLATE_PATHS.psi);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  // C17: preenchimento de tags empresa, nif, versao, datas, ciso_nome, etc.
  doc.render({});
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}
