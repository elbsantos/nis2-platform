/**
 * scripts/sample-enquadramento.ts
 *
 * Gera um .docx real (sem BD) a partir do template de enquadramento.
 * Verifica que o ZIP contém word/document.xml.
 * Uso: npx tsx scripts/sample-enquadramento.ts
 */

import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { evaluateTree, NIS2_PT_TREE } from "../backend/utils/decision-engine";

const TEMPLATE_PATH = path.join(
  __dirname, "..", "backend", "assets", "templates", "enquadramento-template.docx"
);
const OUTPUT_PATH = path.join(__dirname, "..", "..", "sample-enquadramento.docx");

// Respostas reais: industria, autónoma, 80 trabalhadores, VN=12M, balanço=5M
const answers = { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12", "D.b": "5" };
const motorResult = evaluateTree(NIS2_PT_TREE, answers);

const data = {
  empresa:       "TechMed, Lda.",
  data:          "15/07/2026",
  classificacao: motorResult.classification,
  resultLabel:   motorResult.resultLabel,
  engineVersion: "2",
  // Trilha auditável com labels legíveis (ENGINE_VERSION 2)
  steps: motorResult.steps.map(s => ({ label: s.label, article: s.article })),
};

if (!fs.existsSync(TEMPLATE_PATH)) {
  console.error("Template não encontrado:", TEMPLATE_PATH);
  process.exit(1);
}

// Renderizar com docxtemplater
const content = fs.readFileSync(TEMPLATE_PATH);
const zip     = new PizZip(content);
const doc     = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
doc.render(data);
const buffer = doc.getZip().generate({ type: "nodebuffer" }) as Buffer;

// Verificar estrutura ZIP — deve ter word/document.xml
const resultZip = new PizZip(buffer);
const hasDocXml = Object.keys(resultZip.files).includes("word/document.xml");
if (!hasDocXml) {
  console.error("ERRO: word/document.xml não encontrado no ZIP gerado.");
  process.exit(1);
}

fs.writeFileSync(OUTPUT_PATH, buffer);
console.log("word/document.xml presente no ZIP: OK");
console.log("Ficheiro gerado:", OUTPUT_PATH);
console.log("Tamanho:", buffer.length, "bytes");
console.log("\nAbre em: " + OUTPUT_PATH.replace(/\//g, "\\"));
