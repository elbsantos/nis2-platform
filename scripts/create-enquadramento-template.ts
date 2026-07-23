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
    tc("até 10 000 000 € ou 2% do VN mundial, o que for mais elevado"),
    tc("até 7 000 000 € ou 1,4% do VN mundial, o que for mais elevado"),
    tc("Art. 61.º/2 do RJC"),
  ),
  tr(
    tc("Grave"),
    tc("até 5 000 000 € ou 1% do VN mundial, o que for mais elevado"),
    tc("até 3 500 000 € ou 0,7% do VN mundial, o que for mais elevado"),
    tc("Art. 62.º/2 do RJC"),
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
${p("AVISO: Este documento é uma orientação preliminar, não um veredicto jurídico nem uma qualificação oficial. A qualificação formal cabe ao CNCS (artigo 8.º do RJC). A emissão deste relatório não substitui o registo na plataforma MyCiber nem o aconselhamento jurídico.", { italic: true })}
${ep}

${p("1. Classificação", { bold: true, sz: 14 })}
${pKVBold("Resultado: ", "{classificacaoLabel}")}
<w:p><w:r><w:t xml:space="preserve">{resultLabel}</w:t></w:r></w:p>
${ep}

${p("2. Como chegámos aqui — trilha auditável", { bold: true, sz: 14 })}
${p("Cada passo cita o artigo legal que o fundamenta:")}
${pLoop("{#steps}")}
${pLoopStepItem()}
${pLoop("{/steps}")}
${ep}

${pLoop("{#isFora}")}
${p("As secções seguintes descrevem as obrigações aplicáveis às entidades abrangidas pelo Regime Jurídico da Cibersegurança. De acordo com este enquadramento preliminar, a sua organização não é abrangida, pelo que estas obrigações não lhe são exigíveis. São apresentadas a título informativo, para o caso de a situação da organização se alterar ou de se verificarem os critérios qualitativos do artigo 3.º, n.º 2, do RJC.")}
${pLoop("{/isFora}")}
${pLoop("{#isAConfirmar}")}
${p("As secções seguintes descrevem as obrigações aplicáveis às entidades abrangidas pelo Regime Jurídico da Cibersegurança. De acordo com este enquadramento preliminar, o enquadramento da sua organização não está determinado, pelo que estas obrigações só lhe serão exigíveis caso se confirme que está abrangida. São apresentadas a título informativo, para o caso de a situação da organização se alterar ou de se verificarem os critérios qualitativos do artigo 3.º, n.º 2, do RJC.")}
${pLoop("{/isAConfirmar}")}
${ep}

${p("{sec3Title}", { bold: true, sz: 14 })}
${p("Estas obrigações estão em vigor desde a entrada em vigor do Regime Jurídico da Cibersegurança, em 3 de abril de 2026 (artigo 11.º do Decreto-Lei n.º 125/2025). O Regulamento n.º 756/2026, em vigor desde 23 de junho de 2026, não as criou: operacionalizou-as, definindo o funcionamento da plataforma eletrónica MyCiber e os procedimentos de autoidentificação, qualificação, comunicação e notificação.")}
${p("  • Autoidentificação (artigo 8.º, n.º 1, do RJC): 60 dias após a disponibilização da plataforma eletrónica, para entidades já em atividade à data de entrada em vigor do RJC; 30 dias após o início de atividade, para as restantes. O CNCS refere na sua página estes prazos em dias úteis e a lei não fixa a data de disponibilização da plataforma — confirme o prazo aplicável junto do CNCS.")}
${p("  • Designação obrigatória de responsável de cibersegurança (artigo 31.º) e de ponto de contacto permanente (artigo 32.º). A comunicação faz-se no prazo de 20 dias úteis a contar do início de funções. Para as entidades que já exerciam atividade à data de entrada em vigor do RJC, os artigos 14.º, n.º 2, e 15.º, n.º 2, do Regulamento n.º 756/2026 determinam que o prazo se conta a partir da notificação da qualificação da entidade (artigo 8.º, n.º 5, do RJC).")}
${p("  • Ativação do canal de notificação de incidentes significativos — artigo 40.º do RJC.")}
${ep}

${p("{sec4Title}", { bold: true, sz: 14 })}
${p("O disposto nos n.os 1 e 2 do artigo 27.º, nos artigos 28.º a 30.º e no artigo 33.º do RJC produz efeitos 24 meses após a publicação do Regulamento n.º 756/2026, ou seja, a partir de 22 de junho de 2028 (artigo 10.º, n.º 2, do Decreto-Lei n.º 125/2025).")}
${p("  • Análise de riscos e adoção de uma política de segurança da informação.")}
${p("  • Gestão de incidentes e continuidade de negócio.")}
${p("  • Segurança da cadeia de abastecimento (Art. 28.º) e dos sistemas de informação.")}
${p("  • Boas práticas de ciberhigiene, formação, criptografia e controlo de acessos.")}
${p("  • Segurança física, ambiental e dos recursos humanos.")}
${p("  • Relatório anual de conformidade (Art. 30.º).")}
${ep}
${p("Dispensa de coimas (artigo 65.º do RJC): até 3 de abril de 2027 — 12 meses a contar da entrada em vigor do RJC — as entidades podem solicitar à autoridade competente, mediante pedido devidamente fundamentado, a dispensa da aplicação das coimas previstas no n.º 2 do artigo 61.º e no n.º 2 do artigo 62.º, com fundamento na inexistência de um procedimento interno de adaptação ao novo regime. A dispensa não é automática, depende de decisão da autoridade, e não abrange as contraordenações leves nem as sanções acessórias. A dispensa respeita apenas à aplicação de coimas e não dispensa o cumprimento das obrigações, que se mantêm exigíveis.", { italic: true })}
${ep}

${p("{sec5Title}", { bold: true, sz: 14 })}
${p("{sec5Intro}")}
${sancoesTbl}
${p("Nota: as contraordenações muito graves previstas nas alíneas b), c) e f) do n.º 1 do artigo 61.º do RJC só produzem efeitos a partir de 22 de junho de 2028, nos termos do artigo 10.º, n.º 2, do Decreto-Lei n.º 125/2025.", { italic: true })}
${pLoop("{#isAbrangida}")}
${p("O incumprimento dos deveres de designação do responsável de cibersegurança (artigo 31.º) e de ponto de contacto permanente (artigo 32.º) constitui contraordenação muito grave, nos termos das alíneas d) e e) do n.º 1 do artigo 61.º do RJC. Estas alíneas não constam do diferimento previsto no artigo 10.º, n.º 2, do Decreto-Lei n.º 125/2025.", { italic: true })}
${pLoop("{/isAbrangida}")}
${pLoop("{#isAConfirmar}")}
${p("O incumprimento dos deveres de designação do responsável de cibersegurança (artigo 31.º) e de ponto de contacto permanente (artigo 32.º) constitui contraordenação muito grave, nos termos das alíneas d) e e) do n.º 1 do artigo 61.º do RJC. Estas alíneas não constam do diferimento previsto no artigo 10.º, n.º 2, do Decreto-Lei n.º 125/2025.", { italic: true })}
${pLoop("{/isAConfirmar}")}
${p("Salvo em caso de dolo, a instauração de processo de contraordenação depende de prévia advertência da autoridade competente para cumprimento da obrigação omitida em prazo razoável (artigo 66.º, n.º 5, do RJC).", { italic: true })}
${ep}

${p("6. Dossier de Registo na CNCS (Art. 35.º)", { bold: true, sz: 14 })}
${p("O registo na plataforma MyCiber (myciber.gov.pt) requer que a entidade disponibilize, entre outros dados:")}
${p("  • Nome e contactos da organização e do ponto de contacto designado.")}
${p("  • Setor(es) e subsetor(es) em que opera (conforme os Anexos I e II do DL 125/2025).")}
${p("  • Lista de ativos publicamente acessíveis — artigo 32.º do Regulamento n.º 756/2026. Abrange todos os ativos diretamente acessíveis pela Internet, com indicação do serviço suportado, nome do equipamento ou software, modelo e versão, sistema operativo, software do servidor aplicacional, endereço IP, FQDN, fabricante e dependências entre ativos. Constitui informação classificada de grau reservado e é atualizada anualmente. A versão inicial é comunicada até 31 de janeiro do ano seguinte ao da notificação de qualificação, ou no prazo de seis meses após essa notificação, consoante o que ocorrer primeiro. O scan externo do CISPLAN recolhe já a maior parte destes elementos.")}
${p("  • Identificação dos sistemas de informação e redes críticos para a prestação do serviço.")}
${ep}
${p("A submissão é feita diretamente na plataforma MyCiber. A equipa CISPLAN pode preparar o dossier consigo.", { italic: true })}
${ep}

${p("7. Nível de conformidade exigido", { bold: true, sz: 14 })}
${p("O nível de conformidade exato (básico, substancial ou elevado) é atribuído pelo CNCS com base no setor e na dimensão da entidade (artigo 26.º, n.º 5, do RJC; Anexo II do Regulamento n.º 756/2026). Este relatório não estima o nível — fazê-lo aqui seria prematuro e potencialmente contestável.", { italic: true })}
${ep}
${p("Numa próxima fase, o CISPLAN dar-lhe-á uma estimativa preliminar do nível esperado.")}
${ep}

${p("8. Próximos passos e a nossa equipa", { bold: true, sz: 14 })}
${p("Nível de confidencialidade: RESERVADO — Distribuição restrita à administração e ao responsável de cibersegurança.", { italic: true })}
${ep}
${p("A nossa equipa está disponível para confirmar o enquadramento, preparar o dossier de registo e acompanhar a implementação das medidas ao ritmo da sua empresa. Sem preços e sem compromisso nesta fase.")}
${ep}
${pLoop("{#isAbrangida}")}
${p("  1. Confirme este enquadramento com assessor jurídico ou com a CNCS, se tiver dúvidas.")}
${p("  2. Registe-se na MyCiber (myciber.gov.pt) — Art. 35.º. A equipa CISPLAN pode ajudar.")}
${p("  3. Designe o responsável de cibersegurança (Art. 31.º) e o ponto de contacto (Art. 32.º).")}
${p("  4. Prepare o canal de notificação de incidentes (Art. 40.º).")}
${p("  5. Planeie a implementação das medidas de gestão de risco (Art. 27.º-30.º) dentro do prazo.")}
${pLoop("{/isAbrangida}")}
${pLoop("{#isFora}")}
${p("  1. Confirme este enquadramento com assessor jurídico ou junto do CNCS. Este relatório é uma orientação preliminar e não substitui a qualificação oficial.")}
${p("  2. Verifique se lhe são aplicáveis os critérios qualitativos do artigo 3.º, n.º 2, do RJC — nomeadamente ser o único prestador de um serviço essencial, ou a organização prestar serviços de comunicações eletrónicas, serviços de confiança ou serviços de DNS e registo de domínios, casos em que a dimensão é irrelevante.")}
${p("  3. Reavalie o enquadramento se a dimensão da organização aumentar ou se a estrutura de grupo se alterar.")}
${p("  4. Ainda que não abrangida, pode adotar voluntariamente o Quadro Nacional de Referência para a Cibersegurança. O CNCS pode recomendá-lo a entidades fora do âmbito de aplicação (artigo 24.º, n.º 2, e artigo 30.º, n.º 8, do Regulamento n.º 756/2026).")}
${pLoop("{/isFora}")}
${pLoop("{#isAConfirmar}")}
${p("  1. Confirme este enquadramento com assessor jurídico ou junto do CNCS. Este relatório é uma orientação preliminar e não substitui a qualificação oficial.")}
${p("  2. Reúna os dados em falta que determinam o enquadramento — nomeadamente o balanço total anual e a estrutura de grupo — e repita a avaliação. São esses dados que decidem se a organização está abrangida e em que categoria.")}
${p("  3. Verifique se lhe são aplicáveis os critérios qualitativos do artigo 3.º, n.º 2, do RJC, que abrangem determinadas entidades independentemente da dimensão.")}
${p("  4. Caso se confirme que está abrangida, os passos aplicáveis são os descritos nas secções 3 e 4 deste relatório.")}
${pLoop("{/isAConfirmar}")}
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
