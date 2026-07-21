/**
 * scripts/create-enquadramento-template.ts
 *
 * Gera o template enquadramento-template.docx via PizZip + XML puro.
 * Cada placeholder docxtemplater fica num único <w:r><w:t> — sem risco de tags partidas.
 * Uso: npx tsx scripts/create-enquadramento-template.ts
 *
 * Fonte de verdade legal: ENQUADRAMENTO-NIS2-desenho-v2-faq-relatorio.md
 * Artigos: DL 125/2025 (transposição NIS2); Reg. 756/2026.
 */

import fs from "fs";
import path from "path";
import PizZip from "pizzip";

const TEMPLATE_DIR = path.join(__dirname, "..", "backend", "assets", "templates");
const OUTPUT_PATH  = path.join(TEMPLATE_DIR, "enquadramento-template.docx");

// ---------------------------------------------------------------------------
// Helpers XML
// ---------------------------------------------------------------------------

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function p(
  text: string,
  opts: { bold?: boolean; italic?: boolean; sz?: number; center?: boolean } = {}
): string {
  const rPr = [
    opts.bold   ? "<w:b/>"                        : "",
    opts.italic ? "<w:i/>"                        : "",
    opts.sz     ? `<w:sz w:val="${opts.sz * 2}"/>` : "",
  ].filter(Boolean).join("");
  const pPr = opts.center ? `<w:pPr><w:jc w:val="center"/></w:pPr>` : "";
  const rPrEl = rPr ? `<w:rPr>${rPr}</w:rPr>` : "";
  return `<w:p>${pPr}<w:r>${rPrEl}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;
}

// Parágrafo com prefixo bold + placeholder docxtemplater em run separado
function pKV(key: string, placeholder: string): string {
  return (
    `<w:p>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escXml(key)}</w:t></w:r>` +
    `<w:r><w:t xml:space="preserve">${placeholder}</w:t></w:r>` +
    `</w:p>`
  );
}

// Parágrafo com prefixo bold + placeholder bold
function pKVBold(key: string, placeholder: string): string {
  return (
    `<w:p>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escXml(key)}</w:t></w:r>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${placeholder}</w:t></w:r>` +
    `</w:p>`
  );
}

// Linha de loop — tag docxtemplater isolada no único run do parágrafo
function pLoop(tag: string): string {
  return `<w:p><w:r><w:t>${tag}</w:t></w:r></w:p>`;
}

// Parágrafo de conteúdo de loop com dois placeholders em runs separados.
// Cada {placeholder} num <w:r><w:t> próprio para garantir que docxtemplater o encontra.
function pLoopStepItem(): string {
  return (
    `<w:p>` +
    `<w:r><w:t xml:space="preserve">  • </w:t></w:r>` +
    `<w:r><w:t>{label}</w:t></w:r>` +
    `<w:r><w:t xml:space="preserve"> — </w:t></w:r>` +
    `<w:r><w:t>{article}</w:t></w:r>` +
    `</w:p>`
  );
}

const ep = "<w:p/>";

// ---------------------------------------------------------------------------
// Tabela de sanções — Art. 61.º (muito graves) e Art. 62.º (graves)
// Fonte: ENQUADRAMENTO-NIS2-desenho-v2-faq-relatorio.md §Secção 5
// ---------------------------------------------------------------------------

function tc(text: string, bold = false): string {
  const rPr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return (
    `<w:tc>` +
    `<w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>` +
    `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>` +
    `</w:tc>`
  );
}

function tr(...cells: string[]): string {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

const sancoesTbl = [
  `<w:tbl>`,
  `<w:tblPr>`,
  `  <w:tblW w:w="0" w:type="auto"/>`,
  `  <w:tblBorders>`,
  `    <w:top    w:val="single" w:sz="4" w:space="0" w:color="000000"/>`,
  `    <w:left   w:val="single" w:sz="4" w:space="0" w:color="000000"/>`,
  `    <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>`,
  `    <w:right  w:val="single" w:sz="4" w:space="0" w:color="000000"/>`,
  `    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>`,
  `    <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>`,
  `  </w:tblBorders>`,
  `</w:tblPr>`,
  tr(
    tc("Tipo de infração", true),
    tc("Entidade essencial", true),
    tc("Entidade importante", true),
    tc("Base legal", true),
  ),
  tr(
    tc("Muito grave"),
    tc("até 10 000 000 € ou 2% do VN global"),
    tc("até 7 000 000 € ou 1,4% do VN global"),
    tc("Art. 61.º DL 125/2025"),
  ),
  tr(
    tc("Grave"),
    tc("até 5 000 000 € ou 1% do VN global"),
    tc("até 3 500 000 € ou 0,7% do VN global"),
    tc("Art. 62.º DL 125/2025"),
  ),
  `</w:tbl>`,
].join("\n");

// ---------------------------------------------------------------------------
// Conteúdo word/document.xml
// ---------------------------------------------------------------------------

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>

${p("RELATÓRIO DE ENQUADRAMENTO NIS2", { bold: true, center: true, sz: 18 })}
${p("Decreto-Lei n.º 125/2025 — orientação preliminar", { center: true, sz: 13 })}
${ep}
${pKV("Empresa: ", "{empresa}")}
${pKV("Data: ", "{data}")}
${pKV("Versão do motor: ", "{engineVersion}")}
${ep}
${p("AVISO: Este documento é uma orientação preliminar, não um veredicto jurídico nem uma qualificação oficial. A qualificação formal cabe ao CNCS (Art. 8.º do DL 125/2025). A emissão deste relatório não substitui o registo na plataforma MyCiber nem o aconselhamento jurídico.", { italic: true })}
${ep}

${p("1. Classificação", { bold: true, sz: 14 })}
${pKVBold("Resultado: ", "{classificacao}")}
<w:p><w:r><w:t xml:space="preserve">{resultLabel}</w:t></w:r></w:p>
${ep}

${p("2. Como chegámos aqui — trilha auditável", { bold: true, sz: 14 })}
${p("Cada passo cita o artigo legal que o fundamenta:")}
${pLoop("{#steps}")}
${pLoopStepItem()}
${pLoop("{/steps}")}
${ep}

${p("3. O que a lei já exige de si hoje", { bold: true, sz: 14 })}
${p("Estas obrigações estão em vigor desde a publicação do Regulamento n.º 756/2026 (22 de junho de 2026). São de baixo esforço mas de alto risco se esquecidas — o incumprimento é já uma infração:")}
${p("  • Registo na plataforma MyCiber (myciber.gov.pt) — Art. 35.º do DL 125/2025.")}
${p("  • Designação de responsável de cibersegurança — Art. 31.º do DL 125/2025.")}
${p("  • Designação de ponto de contacto permanente com a CNCS — Art. 32.º do DL 125/2025.")}
${p("  • Ativação do canal de notificação de incidentes significativos — Art. 40.º do DL 125/2025.")}
${ep}

${p("4. O que terá de estar pronto até ~junho de 2028", { bold: true, sz: 14 })}
${p("As medidas de gestão de risco de cibersegurança (Art. 27.º a 30.º do DL 125/2025) têm um período de adaptação de 24 meses (Art. 10.º/2). O prazo previsto é até cerca de junho de 2028. Incluem, entre outras:")}
${p("  • Análise de riscos e adoção de uma política de segurança da informação.")}
${p("  • Gestão de incidentes e continuidade de negócio.")}
${p("  • Segurança da cadeia de abastecimento (Art. 28.º) e dos sistemas de informação.")}
${p("  • Boas práticas de ciberhigiene, formação, criptografia e controlo de acessos.")}
${p("  • Segurança física, ambiental e dos recursos humanos.")}
${p("  • Relatório anual de conformidade (Art. 30.º).")}
${ep}
${p("Nota: até cerca de abril de 2027 é possível pedir dispensa de coimas por ainda não estar adaptado (Art. 65.º do DL 125/2025). Não confunda dispensa de coimas com dispensa de cumprimento — as obrigações existem desde já.", { italic: true })}
${ep}

${p("5. Exposição sancionatória", { bold: true, sz: 14 })}
${p("Escalões aplicáveis à sua categoria (Art. 61.º e 62.º do DL 125/2025). Os valores são tetos máximos; a coima concreta é fixada caso a caso pela CNCS. Há um caminho de conformidade e ainda há tempo.")}
${sancoesTbl}
${ep}

${p("6. Dossier de Registo na CNCS (Art. 35.º)", { bold: true, sz: 14 })}
${p("O registo na plataforma MyCiber (myciber.gov.pt) requer que a entidade disponibilize, entre outros dados:")}
${p("  • Nome e contactos da organização e do ponto de contacto designado.")}
${p("  • Setor(es) e subsetor(es) em que opera (conforme os Anexos I e II do DL 125/2025).")}
${p("  • Lista de endereços IP e gamas de rede da organização — o CISPLAN já dispõe desta informação do scan.")}
${p("  • Identificação dos sistemas de informação e redes críticos para a prestação do serviço.")}
${ep}
${p("A submissão é feita diretamente na plataforma MyCiber. A equipa CISPLAN pode preparar o dossier consigo.", { italic: true })}
${ep}

${p("7. Nível de conformidade exigido", { bold: true, sz: 14 })}
${p("O nível de conformidade exato (básico, substancial ou elevado) é atribuído pelo CNCS com base no setor e na dimensão da entidade (Art. 26.º/5 do DL 125/2025; Anexo II do Regulamento n.º 756/2026). Este relatório não estima o nível — fazê-lo aqui seria prematuro e potencialmente contestável.", { italic: true })}
${ep}
${p("Numa próxima fase, o CISPLAN dar-lhe-á uma estimativa preliminar do nível esperado.")}
${ep}

${p("8. Próximos passos e a nossa equipa", { bold: true, sz: 14 })}
${p("Nível de confidencialidade: RESERVADO — Distribuição restrita à administração e ao responsável de cibersegurança.", { italic: true })}
${ep}
${p("A nossa equipa está disponível para confirmar o enquadramento, preparar o dossier de registo e acompanhar a implementação das medidas ao ritmo da sua empresa. Sem preços e sem compromisso nesta fase.")}
${ep}
${p("  1. Confirme este enquadramento com assessor jurídico ou com a CNCS, se tiver dúvidas.")}
${p("  2. Registe-se na MyCiber (myciber.gov.pt) — Art. 35.º. A equipa CISPLAN pode ajudar.")}
${p("  3. Designe o responsável de cibersegurança (Art. 31.º) e o ponto de contacto (Art. 32.º).")}
${p("  4. Prepare o canal de notificação de incidentes (Art. 40.º).")}
${p("  5. Planeie a implementação das medidas de gestão de risco (Art. 27.º-30.º) dentro do prazo.")}
${ep}
${p("Gerado automaticamente pelo CISPLAN — cisplan.com", { bold: true })}

<w:sectPr/>
</w:body>
</w:document>`;

// ---------------------------------------------------------------------------
// Ficheiros do pacote .docx
// ---------------------------------------------------------------------------

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const relsMain = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;

const relsDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

// ---------------------------------------------------------------------------
// Build e escrita
// ---------------------------------------------------------------------------

const zip = new PizZip();
zip.file("[Content_Types].xml",           contentTypes);
zip.file("_rels/.rels",                   relsMain);
zip.file("word/document.xml",             documentXml);
zip.file("word/_rels/document.xml.rels",  relsDoc);

const buffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
fs.writeFileSync(OUTPUT_PATH, buffer);
console.log("Template criado:", OUTPUT_PATH);
console.log("Tamanho:", buffer.length, "bytes");
