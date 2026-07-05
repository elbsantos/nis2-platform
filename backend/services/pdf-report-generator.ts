/**
 * server/services/pdf-report-generator.ts
 *
 * Enterprise-grade NIS2 compliance PDF reports (Executive + Technical).
 * Format inspired by SecurityScorecard / Tenable / Qualys report standards.
 */

import PDFDocument from "pdfkit";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getScanById, getOrganizationById, getLatestCompletedQuestionnaireForOrg } from "../db";
import {
  combinedNis2Scores,
  overallCombinedScore,
  type CombinedArticleScore,
} from "../utils/combined-score";
import type { NIS2ArticleScore } from "./scan-executor";

// ---------------------------------------------------------------------------
// S3 / Hetzner Object Storage client
// ---------------------------------------------------------------------------

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

const BUCKET = process.env.STORAGE_BUCKET ?? "nis2pt-reports";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const C = {
  brand:    "#1d4ed8",
  navy:     "#0f1e38",
  navyMid:  "#152744",
  success:  "#10b981",
  warning:  "#f59e0b",
  danger:   "#ef4444",
  critical: "#7c3aed",
  text:     "#111827",
  muted:    "#6b7280",
  border:   "#e5e7eb",
  bg:       "#f8fafc",
  white:    "#ffffff",
};

const PAGE_W = 595, PAGE_H = 842, MARGIN = 50, CONTENT_W = PAGE_W - MARGIN * 2;

// ---------------------------------------------------------------------------
// NIS2 Article catalogue
// ---------------------------------------------------------------------------

const NIS2_ARTICLES: Record<string, { short: string; desc: string }> = {
  "Art. 21(2)(a)": { short: "Políticas de Risco",                  desc: "Políticas de análise de risco e segurança dos sistemas de informação" },
  "Art. 21(2)(b)": { short: "Gestão de Incidentes",                desc: "Deteção, resposta e notificação de incidentes de segurança" },
  "Art. 21(2)(c)": { short: "Continuidade de Negócio",             desc: "Cópias de segurança (backups), recuperação de desastres e gestão de crises" },
  "Art. 21(2)(d)": { short: "Cadeia de Abastecimento",             desc: "Segurança nos fornecedores e parceiros tecnológicos" },
  "Art. 21(2)(e)": { short: "Aquisição e Desenvolvimento Seguros", desc: "Segurança na aquisição, desenvolvimento e manutenção de sistemas de informação" },
  "Art. 21(2)(f)": { short: "Avaliação de Eficácia",               desc: "Avaliação e monitorização contínua das medidas de cibersegurança" },
  "Art. 21(2)(g)": { short: "Ciberhigiene e Formação",             desc: "Práticas básicas de ciberhigiene e formação de colaboradores" },
  "Art. 21(2)(h)": { short: "Criptografia e Encriptação",          desc: "Encriptação de dados em trânsito e em repouso; protocolos seguros" },
  "Art. 21(2)(i)": { short: "Segurança RH e Controlo de Acessos", desc: "Segurança dos recursos humanos, controlo de acessos e gestão de ativos" },
  "Art. 21(2)(j)": { short: "Autenticação e Identidade",           desc: "Autenticação multifator, segurança nas comunicações e validação de identidade institucional" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Scan = Awaited<ReturnType<typeof getScanById>>;
type Org  = Awaited<ReturnType<typeof getOrganizationById>>;

// Tipo interno normalizado — construído a partir de results.vulnerabilities (JSONB).
// Fonte única de verdade: o mesmo conjunto que o ecrã (ScanResults.tsx) usa.
interface PdfVuln {
  cveId:             string;
  severity:          string;
  cvssScore:         string;  // string para compatibilidade com parseFloat() existente
  description:       string;
  affectedComponent: string;
  port:              number | null;
  remediation:       string | null;
}

function scoreColor(s: number): string {
  if (s >= 80) return C.success;
  if (s >= 60) return C.warning;
  return C.danger;
}
function scoreLabel(s: number): string {
  if (s >= 80) return "Conformidade Elevada";
  if (s >= 60) return "Conformidade Moderada";
  if (s >= 40) return "Conformidade Baixa";
  return "Não Conforme";
}
function severityColor(s: string): string {
  return { critical: C.critical, high: C.danger, medium: C.warning, low: C.success }[s] ?? C.muted;
}
function severityLabel(s: string): string {
  return { critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" }[s] ?? s;
}
function cvssColor(v: number): string {
  if (v >= 9) return C.critical;
  if (v >= 7) return C.danger;
  if (v >= 4) return C.warning;
  return C.success;
}
function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT");
}
function fmtFull(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-PT");
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function generateReport(options: {
  scanId: number;
  organizationId: number;
  type: "executive" | "technical";
}): Promise<string> {
  const buffer = await generateReportBuffer(options);
  return uploadToStorage(buffer, options.organizationId, options.scanId, options.type);
}

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
  if (scan.organizationId !== options.organizationId)
    throw new Error("Sem permissão para aceder a este scan");

  // Lê sempre de results.vulnerabilities (JSONB) — fonte única de verdade.
  // Garante que PDF e ecrã mostram exactamente o mesmo conjunto de vulns (inclui sintéticos).
  const vulns: PdfVuln[] = ((scan.results as any)?.vulnerabilities ?? []).map((v: any): PdfVuln => ({
    cveId:             v.cveId,
    severity:          v.severity,
    cvssScore:         String(v.cvssScore ?? 5),
    description:       v.description ?? "",
    affectedComponent: v.affectedService ?? v.affectedComponent ?? "unknown",
    port:              v.port ?? null,
    remediation:       v.remediationHint ?? v.remediation ?? null,
  }));

  // Score combinado (scan + questionário) — fonte única via combined-score.ts.
  const nis2Scores = ((scan.results as any)?.nis2Scores ?? []) as NIS2ArticleScore[];
  const qSession   = await getLatestCompletedQuestionnaireForOrg(options.organizationId);
  const qScores    = (qSession?.articleScores as Record<string, number> | null) ?? null;
  const combined   = combinedNis2Scores(nis2Scores, qScores);
  const scanOverall   = (scan.results as any)?.overallScore as number ?? 0;
  const displayOverall = qScores !== null ? overallCombinedScore(combined) : scanOverall;

  // Fontes que efectivamente correram neste scan (gravadas pelo scan-executor).
  // Fallback para scans antigos (sem campo): assume fontes base sem Censys.
  const dataSources: string[] = (scan.results as any)?.dataSources ??
    ["shodan", "directTls", "emailSecurity", "httpHeaders", "darkWeb", "nvd"];
  const scanLimitations: string[] = (scan.results as any)?.scanLimitations ?? [];

  return options.type === "executive"
    ? buildExecutiveReport(scan, vulns, org, combined, displayOverall, qScores !== null, dataSources, scanLimitations)
    : buildTechnicalReport(scan, vulns, org, combined, displayOverall, qScores !== null, dataSources, scanLimitations);
}

// ---------------------------------------------------------------------------
// EXECUTIVE REPORT
// ---------------------------------------------------------------------------

async function buildExecutiveReport(
  scan: Scan,
  vulns: PdfVuln[],
  org: Org,
  combined: CombinedArticleScore[],
  displayOverall: number,
  hasQuestionnaire: boolean,
  dataSources: string[],
  scanLimitations: string[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false,
      info: { Title: "CISPLAN — Relatório Executivo NIS2", Author: "CISPLAN", Creator: "CISPLAN" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Usa scores combinados (scan + questionário) — calculados em generateReportBuffer.
    // displayOverall já reflecte o score combinado quando questionário disponível.
    const overall = displayOverall;
    const counts = {
      critical: vulns.filter(v => v.severity === "critical").length,
      high:     vulns.filter(v => v.severity === "high").length,
      medium:   vulns.filter(v => v.severity === "medium").length,
      low:      vulns.filter(v => v.severity === "low").length,
    };

    // ── PAGE 1: COVER ──────────────────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawCoverPage(doc, scan, overall, "RELATÓRIO EXECUTIVO NIS2", "CONFIDENCIAL");

    // ── PAGE 2: RESUMO EXECUTIVO ───────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Executivo");

    let y = 90;
    let execPage = 2;
    const execAddPage = () => {
      drawRunningFooter(doc, execPage++);
      doc.addPage({ size: "A4", margin: 0 });
      drawRunningHeader(doc, scan?.target ?? "—", "Executivo");
      y = 90;
    };
    const execEnsure = (needed: number) => { if (y + needed > 770) execAddPage(); };

    // Section title
    y = drawSectionTitle(doc, "Resumo Executivo", y);

    // Score + severity boxes side by side
    drawScoreCircle(doc, overall, MARGIN, y);
    const boxW = Math.floor((CONTENT_W - 80) / 4);
    const boxes = [
      { label: "Críticas", count: counts.critical, color: C.critical },
      { label: "Altas",    count: counts.high,     color: C.danger   },
      { label: "Médias",   count: counts.medium,   color: C.warning  },
      { label: "Baixas",   count: counts.low,      color: C.success  },
    ];
    boxes.forEach((b, i) => {
      const bx = MARGIN + 80 + i * (boxW + 5);
      doc.rect(bx, y, boxW, 60).fillColor(C.bg).fill();
      doc.rect(bx, y, boxW, 4).fillColor(b.color).fill();
      doc.fontSize(26).font("Helvetica-Bold").fillColor(b.color)
         .text(String(b.count), bx, y + 14, { width: boxW, align: "center" });
      doc.fontSize(9).font("Helvetica").fillColor(C.muted)
         .text(b.label, bx, y + 43, { width: boxW, align: "center" });
    });
    y += 75;

    // Scan info row
    doc.fontSize(8).font("Helvetica").fillColor(C.muted);
    doc.text(`Alvo: `, MARGIN, y, { continued: true }).fillColor(C.text).text(scan?.target ?? "—", { continued: true });
    doc.fillColor(C.muted).text(`   ·   Data: `, { continued: true }).fillColor(C.text).text(fmt(scan?.completedAt ?? scan?.createdAt));
    doc.fillColor(C.muted).text(`Modo: `, MARGIN, y + 14, { continued: true })
       .fillColor(C.text).text(scan?.mode === "sme" ? "PME (SME)" : "Cadeia de Abastecimento", { continued: true });
    doc.fillColor(C.muted).text(`   ·   Vulnerabilidades: `, { continued: true })
       .fillColor(C.text).text(String(vulns.length));
    y += 36;

    // ── Riscos por severidade (linguagem de gestor) ───────────────────────
    const criticals = vulns.filter(v => v.severity === "critical")
      .sort((a, b) => parseFloat(b.cvssScore) - parseFloat(a.cvssScore));
    const highs     = vulns.filter(v => v.severity === "high")
      .sort((a, b) => parseFloat(b.cvssScore) - parseFloat(a.cvssScore));
    const mediums   = vulns.filter(v => v.severity === "medium")
      .sort((a, b) => parseFloat(b.cvssScore) - parseFloat(a.cvssScore));

    if (vulns.length > 0) {
      execEnsure(60);
      y = drawSectionTitle(doc, "Riscos Identificados por Severidade", y);

      // CRÍTICAS
      if (criticals.length > 0) {
        execEnsure(36);
        doc.rect(MARGIN, y, CONTENT_W, 22).fillColor("#fdf4ff").fill();
        doc.rect(MARGIN, y, 4, 22).fillColor(C.critical).fill();
        doc.fontSize(9).font("Helvetica-Bold").fillColor(C.critical)
           .text(
             `CRÍTICAS (${criticals.length}) — Ação imediata nas próximas 24 a 72 horas`,
             MARGIN + 12, y + 6, { width: CONTENT_W - 16 }
           );
        y += 24;
        criticals.slice(0, 6).forEach((v) => {
          const enriched = enrichFinding(v.description || v.cveId);
          const tH = doc.fontSize(8).font("Helvetica").heightOfString(enriched.text, { width: CONTENT_W - 28 });
          execEnsure(tH + 14);
          doc.rect(MARGIN + 10, y + 3, 5, 5).fillColor(C.critical).fill();
          doc.fontSize(8).font("Helvetica").fillColor(C.text)
             .text(enriched.text, MARGIN + 22, y, { width: CONTENT_W - 26 });
          y += tH + 10;
        });
        if (criticals.length > 6) {
          execEnsure(16);
          doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
             .text(
               `… e mais ${criticals.length - 6} vulnerabilidades críticas — ver Relatório Técnico.`,
               MARGIN + 22, y
             );
          y += 14;
        }
        execEnsure(14);
        doc.fontSize(7.5).font("Helvetica").fillColor(C.brand)
           .text("→ Detalhe técnico completo no Relatório Técnico.", MARGIN + 22, y);
        y += 18;
      }

      // ALTAS
      if (highs.length > 0) {
        execEnsure(36);
        doc.rect(MARGIN, y, CONTENT_W, 22).fillColor("#fff7f0").fill();
        doc.rect(MARGIN, y, 4, 22).fillColor(C.danger).fill();
        doc.fontSize(9).font("Helvetica-Bold").fillColor(C.danger)
           .text(
             `ALTAS (${highs.length}) — Resolução recomendada em 7 dias`,
             MARGIN + 12, y + 6, { width: CONTENT_W - 16 }
           );
        y += 24;
        groupByTheme(highs).forEach(({ theme, count, examples }) => {
          const enriched = enrichFinding(examples[0].description || examples[0].cveId);
          const summary  = count > 1
            ? `${theme} (${count} ocorrências): ${enriched.text}`
            : enriched.text;
          const tH = doc.fontSize(8).font("Helvetica").heightOfString(summary, { width: CONTENT_W - 28 });
          execEnsure(tH + 14);
          doc.rect(MARGIN + 10, y + 3, 5, 5).fillColor(C.danger).fill();
          doc.fontSize(8).font("Helvetica").fillColor(C.text)
             .text(summary, MARGIN + 22, y, { width: CONTENT_W - 26 });
          y += tH + 10;
        });
        execEnsure(14);
        doc.fontSize(7.5).font("Helvetica").fillColor(C.brand)
           .text("→ Detalhe técnico completo no Relatório Técnico.", MARGIN + 22, y);
        y += 18;
      }

      // MÉDIAS
      if (mediums.length > 0) {
        execEnsure(50);
        doc.rect(MARGIN, y, CONTENT_W, 22).fillColor("#fffbeb").fill();
        doc.rect(MARGIN, y, 4, 22).fillColor(C.warning).fill();
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#92400e")
           .text(
             `MÉDIAS (${mediums.length}) — Resolução recomendada em 30 dias`,
             MARGIN + 12, y + 6, { width: CONTENT_W - 16 }
           );
        y += 24;
        const medSummary = buildMediumSummary(mediums);
        const mH = doc.fontSize(8).font("Helvetica").heightOfString(medSummary, { width: CONTENT_W - 28 });
        execEnsure(mH + 28);
        doc.fontSize(8).font("Helvetica").fillColor(C.text)
           .text(medSummary, MARGIN + 22, y, { width: CONTENT_W - 26 });
        y += mH + 8;
        doc.fontSize(7.5).font("Helvetica").fillColor(C.brand)
           .text(
             "→ Listagem individual de cada vulnerabilidade no Relatório Técnico.",
             MARGIN + 22, y
           );
        y += 18;
      }

      y += 6;
    }

    // Conformidade NIS2 overview (mini bars — usa scores combinados)
    if (combined.length) {
      y = drawSectionTitle(doc, "Score por Artigo NIS2 (Art. 21(2))", y);
      const half = Math.ceil(combined.length / 2);
      const colW = CONTENT_W / 2 - 10;
      combined.forEach((s, idx) => {
        const col  = idx < half ? 0 : 1;
        const row  = idx < half ? idx : idx - half;
        const bx   = MARGIN + col * (colW + 20);
        const by   = y + row * 22;
        const art  = s.article.replace("Art. 21(2)", "").replace(/[()]/g, "");
        doc.rect(bx + 20, by + 6, colW - 55, 8).fillColor(C.border).fill();
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(C.muted)
           .text(art, bx, by + 5, { width: 18, align: "right" });
        if (s.combinedScore === null) {
          doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
             .text("N/A", bx + colW - 30, by + 5, { width: 28, align: "right" });
        } else {
          const fill = Math.round((s.combinedScore / 100) * (colW - 55));
          doc.rect(bx + 20, by + 6, Math.max(2, fill), 8).fillColor(scoreColor(s.combinedScore)).fill();
          doc.fontSize(7.5).font("Helvetica-Bold").fillColor(scoreColor(s.combinedScore))
             .text(`${s.combinedScore}`, bx + colW - 30, by + 5, { width: 28, align: "right" });
        }
      });
      y += half * 22 + 10;
    }

    drawRunningFooter(doc, execPage++);

    // ── PRÓXIMOS PASSOS + METODOLOGIA + REFERÊNCIAS ───────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Executivo");
    y = 90;

    y = drawSectionTitle(doc, "Próximos Passos Recomendados", y);
    const steps = buildNextSteps(overall, counts);
    steps.forEach((step, i) => {
      doc.rect(MARGIN, y, 20, 20).fillColor(C.brand).fill();
      doc.fontSize(9).font("Helvetica-Bold").fillColor(C.white)
         .text(String(i + 1), MARGIN, y + 6, { width: 20, align: "center" });
      doc.fontSize(9).font("Helvetica").fillColor(C.text)
         .text(step, MARGIN + 28, y + 5, { width: CONTENT_W - 28 });
      y += 28;
    });
    y += 10;

    y = drawMethodologySection(doc, y, dataSources, scanLimitations);
    y = drawReferencesSection(doc, y);
    drawRunningFooter(doc, execPage);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Finding enrichment: translates raw scanner output into plain-language
// business impact descriptions, with severity classification.
// ---------------------------------------------------------------------------

function enrichFinding(raw: string): { critical: boolean; text: string } {
  const r = raw.toLowerCase();

  if (/dmarc/i.test(raw))
    return { critical: true,  text: "Ausência de Registo DMARC: Falha grave na identidade do email do domínio. Permite que atacantes enviem mensagens falsas em nome da sua empresa (phishing/spoofing)." };
  if (/spf/i.test(raw))
    return { critical: true,  text: "Ausência de Registo SPF: Sem esta validação no DNS, qualquer servidor na Internet pode fazer-se passar pelo seu domínio institucional." };
  if (/dkim/i.test(raw))
    return { critical: true,  text: "Ausência de Assinatura DKIM: Emails enviados pelo domínio não têm assinatura digital criptográfica, facilitando a falsificação de mensagens." };

  if (/27017|mongodb/i.test(raw))
    return { critical: true,  text: "Porta 27017 Exposta (Base de Dados MongoDB): O serviço de base de dados está acessível publicamente, aumentando drasticamente a superfície de ataque." };
  if (/3306|mysql/i.test(raw))
    return { critical: true,  text: "Porta 3306 Exposta (Base de Dados MySQL): O serviço de base de dados está exposto à Internet — deve ser restrito a ligações internas." };
  if (/5432|postgres/i.test(raw))
    return { critical: true,  text: "Porta 5432 Exposta (Base de Dados PostgreSQL): O serviço de base de dados está exposto à Internet — deve ser restrito a ligações internas." };
  if (/6379|redis/i.test(raw))
    return { critical: true,  text: "Porta 6379 Exposta (Redis): Serviço de cache em memória acessível publicamente — alvo frequente de ataques de ransomware." };
  if (/1433|mssql|sql.server/i.test(raw))
    return { critical: true,  text: "Porta 1433 Exposta (SQL Server): Base de dados Microsoft exposta à Internet — restrinja o acesso por firewall." };

  if (/porta.*22|22.*ssh|ssh/i.test(r) || /port.*22/i.test(r))
    return { critical: false, text: "Porta 22 Exposta (Acesso Remoto SSH): O painel de administração remota do servidor está acessível publicamente. Restrinja o acesso por IP ou exija VPN corporativa." };
  if (/porta.*80|port.*80|http\b.*aberto|http\b.*open/i.test(r))
    return { critical: false, text: "Porta 80 Aberta (HTTP Inseguro): O servidor web aceita ligações sem encriptação (texto limpo). Configure o redirecionamento automático obrigatório para HTTPS (porta 443)." };
  if (/3389|rdp|remote.desktop/i.test(raw))
    return { critical: true,  text: "Porta 3389 Exposta (Acesso Remoto Windows/RDP): Painel de controlo remoto exposto — alvo preferencial de ataques de força bruta e ransomware." };
  if (/21\b|ftp/i.test(r))
    return { critical: false, text: "Porta 21 Aberta (FTP): Protocolo de transferência de ficheiros sem encriptação exposto. Substitua por SFTP (porta 22) ou FTPS." };
  if (/23\b|telnet/i.test(r))
    return { critical: true,  text: "Porta 23 Aberta (Telnet): Protocolo obsoleto e sem encriptação — substitua imediatamente por SSH." };

  if (/csp|content.security/i.test(raw))
    return { critical: false, text: "Política de Segurança de Conteúdo (CSP) Permissiva: A política HTTP detetada permite execução de scripts inseguros (unsafe-inline/unsafe-eval), vulnerabilizando a aplicação a ataques de injeção de código." };
  if (/hsts|strict.transport/i.test(raw))
    return { critical: false, text: "HSTS Ausente ou Insuficiente: Sem esta política, os browsers podem aceder ao site por HTTP não encriptado, expondo utilizadores a ataques de interceção (man-in-the-middle)." };
  if (/x.frame|clickjack/i.test(raw))
    return { critical: false, text: "Proteção contra Clickjacking Ausente (X-Frame-Options): O site pode ser embutido em páginas maliciosas para enganar utilizadores a clicarem em elementos ocultos." };
  if (/x.content.type|mime.sniff/i.test(raw))
    return { critical: false, text: "X-Content-Type-Options Ausente: O browser pode interpretar ficheiros com um tipo de conteúdo incorreto, abrindo vetores de ataque." };
  if (/referrer.policy/i.test(raw))
    return { critical: false, text: "Referrer-Policy Ausente ou Permissiva: O URL completo das páginas pode ser partilhado com sites de terceiros, expondo dados de navegação." };
  if (/tls|ssl|certificado|certif/i.test(r))
    return { critical: false, text: "Problema de Certificado TLS/SSL: " + raw };

  // Fallback — return original with classification based on keywords
  const isCritical = /crítico|critical|grave|high|critical/i.test(raw);
  return { critical: isCritical, text: raw };
}

// ---------------------------------------------------------------------------
// DNS record examples for email-related vulnerabilities
// Gives the user the exact TXT record to copy into their DNS provider.
// ---------------------------------------------------------------------------

function getDnsExample(cveId: string, component: string, target: string): string | null {
  const id = (cveId + " " + component).toLowerCase();
  const domain = target.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (/spf/i.test(id)) {
    return (
      `Registo TXT a publicar no domínio raiz ("@") em ${domain}:\n` +
      `  v=spf1 mx ~all\n` +
      `  (Substitui "mx" pelos servidores de email do teu fornecedor, ex: include:_spf.google.com)`
    );
  }
  if (/dmarc/i.test(id)) {
    return (
      `Registo TXT a publicar em _dmarc.${domain}:\n` +
      `  v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100`
    );
  }
  if (/dkim/i.test(id)) {
    return (
      `Registo TXT a publicar em default._domainkey.${domain}:\n` +
      `  Obtém o valor da chave pública DKIM no painel do teu servidor/fornecedor de email (ex: Google Workspace, Microsoft 365)`
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// TECHNICAL REPORT
// ---------------------------------------------------------------------------

async function buildTechnicalReport(
  scan: Scan, vulns: PdfVuln[], org: Org,
  combined: CombinedArticleScore[], displayOverall: number, hasQuestionnaire: boolean,
  dataSources: string[], scanLimitations: string[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false,
      info: { Title: "CISPLAN — Relatório Técnico NIS2", Author: "CISPLAN", Creator: "CISPLAN" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const results   = (scan?.results ?? {}) as Record<string, any>;
    const overall   = displayOverall;
    const openPorts: Array<{ port: number; protocol: string; service: string; product?: string; version?: string; cves: string[] }> =
      results.openPorts ?? [];

    // ── PAGE 1: COVER ──────────────────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawCoverPage(doc, scan, overall, "RELATÓRIO TÉCNICO NIS2", "CONFIDENCIAL — USO RESTRITO");

    // ── PAGE 2: METADADOS + PORTOS & SERVIÇOS ─────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
    let y = 90;

    // Metadata grid
    y = drawSectionTitle(doc, "Metadados do Scan", y);
    const metaRows = [
      ["Alvo",          scan?.target ?? "—"],
      ["Modo de scan",  scan?.mode === "sme" ? "PME / Entidade Importante" : "Cadeia de Abastecimento"],
      ["Estado",        ({ completed: "Concluído", running: "Em execução", pending: "Na fila", failed: "Falhou" } as Record<string, string>)[scan?.status ?? ""] ?? scan?.status ?? "—"],
      ["Início",        fmtFull(scan?.startedAt)],
      ["Conclusão",     fmtFull(scan?.completedAt)],
      ["Score global",  `${overall}/100 — ${scoreLabel(overall)}${hasQuestionnaire ? " (combinado scan + questionário)" : " (scan)"}`],
      ["Vulnerabilidades", `${vulns.length} (${vulns.filter(v => v.severity === "critical").length} críticas, ${vulns.filter(v => v.severity === "high").length} altas, ${vulns.filter(v => v.severity === "medium").length} médias)`],
    ];
    metaRows.forEach(([label, val], i) => {
      const rowBg = i % 2 === 0 ? C.bg : C.white;
      doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(rowBg).fill();
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor(C.muted)
         .text(label, MARGIN + 6, y + 5, { width: 120 });
      doc.fontSize(8.5).font("Helvetica").fillColor(C.text)
         .text(String(val), MARGIN + 130, y + 5, { width: CONTENT_W - 136 });
      y += 18;
    });
    y += 14;

    // openPorts.cves já foi filtrado pelo scan-executor (apenas CVEs NVD-confirmados).
    // Porta exposta = tem pelo menos um CVE confirmado.
    const exposedPorts = openPorts.filter(p => (p.cves ?? []).length > 0);
    const cleanCount   = openPorts.length - exposedPorts.length;

    y = drawSectionTitle(doc, "Portos com Vulnerabilidades Conhecidas", y);
    if (exposedPorts.length > 0) {
      // Summary line
      doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
         .text(
           `${openPorts.length} porta(s) analisada(s) · ${cleanCount} sem CVEs conhecidas (ocultadas) · ${exposedPorts.length} com vulnerabilidades listadas abaixo.`,
           MARGIN, y + 1, { width: CONTENT_W }
         );
      y += 16;
      // Table header
      doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(C.navy).fill();
      doc.fontSize(8).font("Helvetica-Bold").fillColor(C.white);
      doc.text("Porto",            MARGIN + 6,   y + 5, { width: 50 });
      doc.text("Protocolo",        MARGIN + 60,  y + 5, { width: 60 });
      doc.text("Serviço",          MARGIN + 125, y + 5, { width: 100 });
      doc.text("Produto / Versão", MARGIN + 230, y + 5, { width: 160 });
      doc.text("CVEs",             MARGIN + 395, y + 5, { width: 60, align: "center" });
      y += 18;
      exposedPorts.slice(0, 20).forEach((p, i) => {
        if (y > 730) { doc.addPage({ size: "A4", margin: 0 }); drawRunningHeader(doc, scan?.target ?? "—", "Técnico"); y = 90; }
        const rowBg = i % 2 === 0 ? C.bg : C.white;
        doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(rowBg).fill();
        doc.fontSize(8).font("Helvetica-Bold").fillColor(C.brand)
           .text(String(p.port), MARGIN + 6, y + 5, { width: 50 });
        doc.fontSize(8).font("Helvetica").fillColor(C.muted)
           .text(p.protocol.toUpperCase(), MARGIN + 60, y + 5, { width: 60 });
        doc.fillColor(C.text).text(p.service, MARGIN + 125, y + 5, { width: 100 });
        doc.fillColor(C.muted).text(truncate(`${p.product ?? ""} ${p.version ?? ""}`.trim() || "—", 35), MARGIN + 230, y + 5, { width: 160 });
        const cveCount = (p.cves ?? []).length;
        doc.rect(MARGIN + 398, y + 3, 48, 13).fillColor(C.danger).fill();
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(C.white)
           .text(`${cveCount} CVE${cveCount > 1 ? "s" : ""}`, MARGIN + 398, y + 6, { width: 48, align: "center" });
        y += 18;
      });
      if (exposedPorts.length > 20) {
        doc.fontSize(8).font("Helvetica").fillColor(C.muted)
           .text(`+ ${exposedPorts.length - 20} porto(s) com CVEs adicionais — ver detalhe completo na plataforma.`, MARGIN, y + 4);
        y += 18;
      }
    } else if (openPorts.length > 0) {
      doc.rect(MARGIN, y, CONTENT_W, 30).fillColor(C.bg).fill();
      doc.fontSize(9).font("Helvetica").fillColor(C.success)
         .text(`✓ ${openPorts.length} porta(s) analisada(s) — nenhuma com CVEs conhecidas.`, MARGIN + 10, y + 10);
      y += 30;
    } else {
      doc.rect(MARGIN, y, CONTENT_W, 30).fillColor(C.bg).fill();
      doc.fontSize(9).font("Helvetica").fillColor(C.success)
         .text("✓ Nenhum porto exposto detetado nas fontes consultadas.", MARGIN + 10, y + 10);
      y += 30;
    }
    y += 6;
    drawRunningFooter(doc, 2);

    // ── PAGE 3: VULNERABILIDADES ───────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
    y = 90;

    y = drawSectionTitle(doc, `Vulnerabilidades Encontradas (${vulns.length})`, y);
    if (vulns.length > 0) {
      const sorted = [...vulns].sort((a, b) => parseFloat(b.cvssScore) - parseFloat(a.cvssScore));
      let pageNum = 3;
      const TEXT_W = CONTENT_W - 20; // width available for description/remediation text

      sorted.forEach((v) => {
        // Calculate actual heights dynamically to prevent overlap
        const descText  = v.description ?? "";
        const remText   = v.remediation ? `↳ ${v.remediation}` : "";
        const dnsExample = getDnsExample(v.cveId, v.affectedComponent, scan?.target ?? "");
        const descH = doc.fontSize(8).font("Helvetica").heightOfString(descText, { width: TEXT_W });
        const remH  = remText
          ? doc.fontSize(8).font("Helvetica").heightOfString(remText, { width: TEXT_W }) + 4
          : 0;
        const dnsH  = dnsExample
          ? doc.fontSize(7.5).font("Helvetica").heightOfString(dnsExample, { width: TEXT_W - 12 }) + 18
          : 0;
        const HEADER_H = 20; // CVE ID row
        const PADDING  = 14; // top + bottom breathing room
        const rowH = HEADER_H + descH + remH + dnsH + PADDING;

        if (y + rowH > 760) {
          drawRunningFooter(doc, pageNum++);
          doc.addPage({ size: "A4", margin: 0 });
          drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
          y = 90;
        }
        const sColor = severityColor(v.severity);

        // Left accent bar (full card height)
        doc.rect(MARGIN, y, 4, rowH - 4).fillColor(sColor).fill();

        // CVE ID line
        doc.fontSize(9).font("Helvetica-Bold").fillColor(C.text)
           .text(v.cveId, MARGIN + 12, y + 4, { width: 200 });
        doc.fontSize(8).font("Helvetica").fillColor(C.muted)
           .text(
             `CVSS ${v.cvssScore}  ·  ${v.affectedComponent}${v.port ? ` :${v.port}` : ""}`,
             MARGIN + 215, y + 5, { width: 185 }
           );

        // Severity badge (top-right)
        doc.rect(MARGIN + 415, y + 2, 80, 14).fillColor(sColor).fill();
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(C.white)
           .text(severityLabel(v.severity).toUpperCase(), MARGIN + 415, y + 5, { width: 80, align: "center" });

        // Description — placed right below header row
        const descY = y + HEADER_H;
        doc.fontSize(8).font("Helvetica").fillColor(C.muted)
           .text(descText, MARGIN + 12, descY, { width: TEXT_W });

        // Remediation hint — placed below description
        if (remText) {
          const remY = descY + descH + 4;
          doc.fontSize(8).font("Helvetica").fillColor(C.brand)
             .text(remText, MARGIN + 12, remY, { width: TEXT_W });
        }

        // DNS record example box — concrete TXT record to copy/paste
        if (dnsExample) {
          const dnsY = descY + descH + remH + (remText ? 4 : 0) + 4;
          doc.rect(MARGIN + 12, dnsY, TEXT_W, dnsH - 4).fillColor(C.bg).fill();
          doc.rect(MARGIN + 12, dnsY, 3, dnsH - 4).fillColor(C.warning).fill();
          doc.fontSize(7).font("Helvetica-Bold").fillColor(C.muted)
             .text("Registo DNS (copiar para o seu fornecedor de domínio):", MARGIN + 20, dnsY + 4, { width: TEXT_W - 12 });
          doc.fontSize(7.5).font("Helvetica").fillColor(C.navy)
             .text(dnsExample, MARGIN + 20, dnsY + 14, { width: TEXT_W - 12 });
        }

        // Separator line
        doc.moveTo(MARGIN, y + rowH - 2).lineTo(PAGE_W - MARGIN, y + rowH - 2)
           .strokeColor(C.border).lineWidth(0.4).stroke();
        y += rowH;
      });
      drawRunningFooter(doc, 3);
    } else {
      doc.rect(MARGIN, y, CONTENT_W, 36).fillColor("#ecfdf5").fill();
      doc.fontSize(10).font("Helvetica-Bold").fillColor(C.success)
         .text("✓ Nenhuma vulnerabilidade conhecida encontrada.", MARGIN + 12, y + 12);
      drawRunningFooter(doc, 3);
    }

    // ── PAGE 4: NIS2 COMPLIANCE POR ARTIGO ────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
    y = 90;
    y = drawSectionTitle(doc, "Conformidade NIS2 — Detalhe por Artigo (Art. 21(2))", y);

    // Intro text
    doc.fontSize(8).font("Helvetica").fillColor(C.muted)
       .text(
         "Avaliação automatizada baseada nos serviços expostos, vulnerabilidades detetadas e configurações de segurança analisadas. " +
         "Cada artigo reflete um domínio de conformidade da Diretiva NIS2, transposta em Portugal pelo Decreto-Lei n.º 125/2025.",
         MARGIN, y, { width: CONTENT_W }
       );
    y += 28;

    let techPage = 4;
    const FIND_W = CONTENT_W - 52;
    combined.forEach((s) => {
      const rawFindings = s.findings?.filter(Boolean) ?? [];
      const hasFail = rawFindings.length > 0;

      // Enriquecer e deduplicar por texto — múltiplos CVEs do mesmo serviço
      // enriquecem para o mesmo texto (ex: "Porta 22 Exposta") → mostrar uma vez.
      const _enrichedAll = rawFindings.slice(0, 8).map(enrichFinding);
      const _seenEnriched = new Set<string>();
      const enriched = _enrichedAll
        .filter(ef => !_seenEnriched.has(ef.text) && (_seenEnriched.add(ef.text), true))
        .slice(0, 4);
      const findingHeights = enriched.map(ef =>
        doc.fontSize(7.5).font("Helvetica").heightOfString(ef.text, { width: FIND_W }) + 6
      );
      const totalFindH = findingHeights.reduce((a, b) => a + b, 0);
      const rowH = 34 + (hasFail ? totalFindH + 4 : 14);

      if (y + rowH > 750) {
        drawRunningFooter(doc, techPage++);
        doc.addPage({ size: "A4", margin: 0 });
        drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
        y = 90;
      }
      const artInfo = NIS2_ARTICLES[s.article];
      const BAR_MAX = 160;
      const displayScore = s.combinedScore;
      const isNull = displayScore === null;
      const barFill = isNull ? 0 : Math.max(2, Math.round((displayScore! / 100) * BAR_MAX));
      const col = isNull ? C.muted : scoreColor(displayScore!);

      // Score circle (small) — "N/A" para medidas sem score disponível
      doc.circle(MARGIN + 16, y + 16, 14).fillColor(col).fill();
      doc.fontSize(8).font("Helvetica-Bold").fillColor(C.white)
         .text(isNull ? "N/A" : String(displayScore), MARGIN + 4, y + 11, { width: 24, align: "center" });

      // Article + short title
      doc.fontSize(9).font("Helvetica-Bold").fillColor(C.text)
         .text(s.article, MARGIN + 38, y + 2, { width: 100 });
      doc.fontSize(8).font("Helvetica").fillColor(C.muted)
         .text(artInfo?.short ?? "", MARGIN + 38, y + 14, { width: 140 });

      // Progress bar
      doc.rect(MARGIN + 185, y + 10, BAR_MAX, 8).fillColor(C.border).fill();
      doc.rect(MARGIN + 185, y + 10, barFill, 8).fillColor(col).fill();

      // Scope description
      doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
         .text("Âmbito: " + (artInfo?.desc ?? s.title), MARGIN + 360, y + 2, { width: CONTENT_W - 315 });

      // Findings with colored square indicators
      if (hasFail) {
        let fy = y + 30;
        enriched.forEach((ef, fi) => {
          const fColor = ef.critical ? C.danger : C.warning;
          doc.rect(MARGIN + 38, fy + 1, 6, 6).fillColor(fColor).fill();
          doc.fontSize(7.5).font("Helvetica").fillColor(ef.critical ? C.danger : C.text)
             .text(ef.text, MARGIN + 48, fy, { width: FIND_W });
          fy += findingHeights[fi];
        });
      } else if (isNull && !s.scannable) {
        // Medida organizacional sem questionário preenchido
        doc.rect(MARGIN + 38, y + 30, 6, 6).fillColor(C.muted).fill();
        doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
           .text(
             "Não avaliável por scan — requer questionário de autoavaliação (medida organizacional não observável externamente).",
             MARGIN + 48, y + 30, { width: FIND_W }
           );
      } else if (isNull) {
        doc.rect(MARGIN + 38, y + 30, 6, 6).fillColor(C.muted).fill();
        doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
           .text("Sem dados suficientes para avaliação.", MARGIN + 48, y + 30, { width: FIND_W });
      } else if (!s.scannable && s.source === "questionnaire") {
        // Score obtido exclusivamente via questionário (medida organizacional)
        doc.rect(MARGIN + 38, y + 30, 6, 6).fillColor(C.brand).fill();
        doc.fontSize(7.5).font("Helvetica").fillColor(C.brand)
           .text("Score obtido via Questionário NIS2 (medida organizacional).", MARGIN + 48, y + 30, { width: FIND_W });
      } else {
        doc.rect(MARGIN + 38, y + 30, 6, 6).fillColor(C.success).fill();
        doc.fontSize(7.5).font("Helvetica").fillColor(C.success)
           .text("Sem problemas detetados neste domínio.", MARGIN + 48, y + 30, { width: FIND_W });
      }

      doc.moveTo(MARGIN, y + rowH - 2).lineTo(PAGE_W - MARGIN, y + rowH - 2)
         .strokeColor(C.border).lineWidth(0.3).stroke();
      y += rowH;
    });
    y += 10;

    // ── METODOLOGIA + REFERÊNCIAS ──────────────────────────────────────────
    if (y + 200 > 740) {
      drawRunningFooter(doc, techPage++);
      doc.addPage({ size: "A4", margin: 0 });
      drawRunningHeader(doc, scan?.target ?? "—", "Técnico");
      y = 90;
    }
    y = drawMethodologySection(doc, y, dataSources, scanLimitations);
    y = drawReferencesSection(doc, y);
    drawRunningFooter(doc, techPage);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// COVER PAGE
// ---------------------------------------------------------------------------

function drawCoverPage(
  doc: PDFKit.PDFDocument,
  scan: Scan,
  overall: number,
  reportType: string,
  classification: string
): void {
  // Dark navy background — top 55%
  doc.rect(0, 0, PAGE_W, PAGE_H * 0.55).fillColor(C.navy).fill();
  // Accent strip
  doc.rect(0, PAGE_H * 0.55, PAGE_W, 5).fillColor(C.brand).fill();
  // White bottom
  doc.rect(0, PAGE_H * 0.55 + 5, PAGE_W, PAGE_H * 0.45 - 5).fillColor(C.white).fill();

  // ── Brand / Logo area ──
  doc.fontSize(32).font("Helvetica-Bold").fillColor(C.white)
     .text("CISPLAN", MARGIN, 52);
  doc.fontSize(11).font("Helvetica").fillColor("#93c5fd")
     .text("Plataforma de Conformidade NIS2", MARGIN, 92);

  // ── Score circle (large) ──
  const cx = PAGE_W / 2, cy = 185;
  const radius = 60;
  // Outer ring
  doc.circle(cx, cy, radius + 6).fillColor(C.navyMid).fill();
  doc.circle(cx, cy, radius).fillColor(scoreColor(overall)).fill();
  doc.fontSize(38).font("Helvetica-Bold").fillColor(C.white)
     .text(String(overall), cx - 35, cy - 22, { width: 70, align: "center" });
  doc.fontSize(13).font("Helvetica").fillColor(C.white)
     .text("/ 100", cx - 30, cy + 18, { width: 60, align: "center" });

  // Score label below circle
  doc.fontSize(13).font("Helvetica-Bold").fillColor(scoreColor(overall))
     .text(scoreLabel(overall), 0, cy + 75, { align: "center", width: PAGE_W });

  // ── Bottom white section ──
  const by = PAGE_H * 0.55 + 28;

  // Classification badge
  doc.rect(MARGIN, by, 130, 20).fillColor(C.danger).fill();
  doc.fontSize(8).font("Helvetica-Bold").fillColor(C.white)
     .text(classification, MARGIN, by + 6, { width: 130, align: "center" });

  // Report type title
  doc.fontSize(20).font("Helvetica-Bold").fillColor(C.text)
     .text(reportType, MARGIN, by + 34, { width: CONTENT_W });

  // Divider
  doc.moveTo(MARGIN, by + 64).lineTo(PAGE_W - MARGIN, by + 64)
     .strokeColor(C.border).lineWidth(1).stroke();

  // Target + date
  const target = scan?.target ?? "—";
  doc.fontSize(10).font("Helvetica-Bold").fillColor(C.muted)
     .text("Alvo da análise:", MARGIN, by + 76);
  doc.fontSize(14).font("Helvetica-Bold").fillColor(C.brand)
     .text(target, MARGIN, by + 92);
  doc.fontSize(9).font("Helvetica").fillColor(C.muted)
     .text(`Data: ${fmtFull(scan?.completedAt ?? scan?.createdAt)}   ·   Scan ID: #${scan?.id ?? "—"}`, MARGIN, by + 114);

  // Bottom footer bar
  doc.rect(0, PAGE_H - 46, PAGE_W, 46).fillColor(C.navyMid).fill();
  doc.fontSize(7.5).font("Helvetica").fillColor("#93c5fd")
     .text(
       "CISPLAN · cisplan.pt   ·   NIS2 Directiva (UE) 2022/2555 · DL 125/2025   ·   CNCS — Centro Nacional de Cibersegurança",
       MARGIN, PAGE_H - 28, { align: "center", width: CONTENT_W }
     );
}

// ---------------------------------------------------------------------------
// Running header & footer (pages 2+)
// ---------------------------------------------------------------------------

function drawRunningHeader(doc: PDFKit.PDFDocument, target: string, type: string): void {
  doc.rect(0, 0, PAGE_W, 50).fillColor(C.navy).fill();
  doc.rect(0, 50, PAGE_W, 3).fillColor(C.brand).fill();

  doc.fontSize(12).font("Helvetica-Bold").fillColor(C.white)
     .text("CISPLAN", MARGIN, 16);
  doc.fontSize(8).font("Helvetica").fillColor("#93c5fd")
     .text(`Relatório ${type} NIS2`, MARGIN + 80, 19);
  doc.fontSize(8).font("Helvetica").fillColor(C.muted)
     .text(target, 0, 19, { align: "right", width: PAGE_W - MARGIN });
}

function drawRunningFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  doc.rect(0, PAGE_H - 32, PAGE_W, 32).fillColor(C.bg).fill();
  doc.moveTo(MARGIN, PAGE_H - 32).lineTo(PAGE_W - MARGIN, PAGE_H - 32)
     .strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fontSize(7).font("Helvetica").fillColor(C.muted)
     .text(
       `CISPLAN · Relatório gerado em ${fmt(new Date())} · Confidencial`,
       MARGIN, PAGE_H - 20, { width: CONTENT_W - 40 }
     );
  doc.fontSize(7).font("Helvetica-Bold").fillColor(C.brand)
     .text(`Página ${pageNum}`, 0, PAGE_H - 20, { width: PAGE_W - MARGIN, align: "right" });
}

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.rect(MARGIN, y, 4, 18).fillColor(C.brand).fill();
  doc.fontSize(11).font("Helvetica-Bold").fillColor(C.text)
     .text(title, MARGIN + 12, y + 3);
  doc.moveTo(MARGIN, y + 22).lineTo(PAGE_W - MARGIN, y + 22)
     .strokeColor(C.border).lineWidth(0.5).stroke();
  return y + 30;
}

function drawScoreCircle(doc: PDFKit.PDFDocument, score: number, x: number, y: number): void {
  const cx = x + 30, cy = y + 30;
  doc.circle(cx, cy, 32).fillColor(scoreColor(score)).fill();
  doc.fontSize(20).font("Helvetica-Bold").fillColor(C.white)
     .text(String(score), cx - 22, cy - 13, { width: 44, align: "center" });
  doc.fontSize(8).font("Helvetica").fillColor(C.white)
     .text("/ 100", cx - 20, cy + 10, { width: 40, align: "center" });
}

function drawMethodologySection(doc: PDFKit.PDFDocument, y: number, dataSources: string[], scanLimitations: string[]): number {
  y = drawSectionTitle(doc, "Metodologia & Limitações Técnicas", y);

  const intro =
    "Este relatório foi gerado através de uma análise sem agentes (agentless scan), " +
    "recorrendo exclusivamente a fontes de dados externas e técnicas de inteligência de fontes abertas (OSINT). " +
    "As auditorias basearam-se nas seguintes plataformas e protocolos:";

  doc.fontSize(8).font("Helvetica").fillColor(C.text)
     .text(intro, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
  y += doc.heightOfString(intro, { width: CONTENT_W, lineGap: 2 }) + 8;

  const hasCensys = dataSources.includes("censys");
  const hasNvd    = dataSources.includes("nvd");

  const perimeterDetail = hasCensys
    ? "Identificação de portas abertas, serviços ativos e vulnerabilidades conhecidas (CVEs) através das plataformas Shodan InternetDB e Censys."
    : "Identificação de portas abertas, serviços ativos e vulnerabilidades conhecidas (CVEs) via Shodan InternetDB" +
      (hasNvd ? "; validação de versões e intervalos de afectação via NVD (National Vulnerability Database)." : ".");

  const tlsDetail = hasCensys
    ? "Avaliação de certificados digitais e cifras TLS/SSL nas portas normalizadas (443, 8443), combinando dados Censys com verificação directa TCP/TLS."
    : "Verificação directa TCP/TLS de certificados digitais, cifras e configurações de segurança nas portas normalizadas (443, 8443).";

  const categories: Array<{ label: string; detail: string }> = [
    { label: "Mapeamento de Perímetro",      detail: perimeterDetail },
    { label: "Segurança de Identidade",      detail: "Verificação de fugas de credenciais corporativas associadas ao domínio na base de dados Have I Been Pwned (HIBP)." },
    { label: "Encriptação em Trânsito",      detail: tlsDetail },
    { label: "Validação de Email e DNS",     detail: "Análise das configurações DNS públicas do domínio (registos SPF, DMARC e DKIM) e verificação dos cabeçalhos de segurança HTTP." },
  ];

  categories.forEach((cat) => {
    doc.rect(MARGIN, y, 3, 12).fillColor(C.brand).fill();
    doc.fontSize(8).font("Helvetica-Bold").fillColor(C.text)
       .text(cat.label + ": ", MARGIN + 8, y, { continued: true, width: CONTENT_W - 8 });
    doc.font("Helvetica").fillColor(C.muted)
       .text(cat.detail, { width: CONTENT_W - 8 });
    y += doc.heightOfString(cat.detail, { width: CONTENT_W - 8 }) + 8;
  });

  y += 4;
  const limitTitle = "Limitações do Diagnóstico Exterior:";
  doc.fontSize(8).font("Helvetica-Bold").fillColor(C.warning).text(limitTitle, MARGIN, y);
  y += 14;

  const limits =
    "Por ser uma análise estritamente externa (do ponto de vista do atacante), este teste não acede a sistemas internos, " +
    "bases de dados protegidas, aplicações autenticadas ou redes privadas (VPNs/LANs). Consequentemente, vulnerabilidades " +
    "internas, regras de firewalls locais e controlos organizacionais (políticas escritas, planos de formação ou rotinas de " +
    "cópias de segurança) não são avaliados automaticamente. Para auditar estes controlos específicos da NIS2, a organização " +
    "deve preencher o Questionário de Autoavaliação NIS2 (42 controlos) disponível no painel da plataforma. " +
    "Os resultados aqui apresentados baseiam-se em heurísticas de risco e devem ser validados por técnicos de sistemas.";

  doc.fontSize(8).font("Helvetica").fillColor(C.muted)
     .text(limits, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
  y += doc.heightOfString(limits, { width: CONTENT_W, lineGap: 2 }) + 6;

  if (scanLimitations.length > 0) {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(C.warning)
       .text("Limitações específicas deste scan:", MARGIN, y);
    y += 12;
    for (const lim of scanLimitations) {
      doc.fontSize(8).font("Helvetica").fillColor(C.muted)
         .text(`• ${lim}`, MARGIN + 8, y, { width: CONTENT_W - 8, lineGap: 2 });
      y += doc.heightOfString(lim, { width: CONTENT_W - 8, lineGap: 2 }) + 4;
    }
    y += 6;
  } else {
    y += 12;
  }

  return y;
}

function drawReferencesSection(doc: PDFKit.PDFDocument, y: number): number {
  y = drawSectionTitle(doc, "Referências Oficiais & Disclaimer", y);

  const refs = [
    ["Diretiva NIS2",          "Diretiva (UE) 2022/2555 do Parlamento Europeu e do Conselho, de 14 de dezembro de 2022, relativa a medidas destinadas a garantir um elevado nível comum de cibersegurança na União Europeia."],
    ["Transposição Nacional",  "Decreto-Lei n.º 125/2025 — Diploma que transpõe a Diretiva NIS2 para o ordenamento jurídico português e estabelece o regime jurídico da segurança ciberespacial."],
    ["Autoridade Nacional",    "CNCS (Centro Nacional de Cibersegurança) — Autoridade nacional competente para supervisão, regulamentação e aplicação das obrigações NIS2 em Portugal (cncs.gov.pt)."],
    ["Agência Europeia",       "ENISA (European Union Agency for Cybersecurity) — Entidade responsável pelas orientações técnicas e boas práticas europeias (enisa.europa.eu)."],
    ["Obrigação de Notificação", "Em conformidade com o DL n.º 125/2025, qualquer incidente com impacto significativo deve ser notificado ao CNCS no prazo de 24 horas (alerta inicial) e detalhado em relatório completo em 72 horas."],
    ["NVD (Dados CVE)",        "This product uses the NVD API but is not endorsed or certified by the NVD — National Vulnerability Database, NIST (nvd.nist.gov)."],
  ];

  refs.forEach(([label, val], i) => {
    const rowBg = i % 2 === 0 ? C.bg : C.white;
    doc.rect(MARGIN, y, CONTENT_W, 18).fillColor(rowBg).fill();
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor(C.brand)
       .text(label, MARGIN + 6, y + 5, { width: 110 });
    doc.fontSize(7.5).font("Helvetica").fillColor(C.text)
       .text(val, MARGIN + 120, y + 5, { width: CONTENT_W - 126 });
    y += 18;
  });
  y += 10;

  const disclaimer =
    "DISCLAIMER: Este relatório é gerado automaticamente pela plataforma CISPLAN com base em fontes de inteligência pública. " +
    "A informação contida é confidencial e destinada exclusivamente ao uso interno da organização identificada. " +
    "A CISPLAN não se responsabiliza por decisões tomadas exclusivamente com base neste relatório sem confirmação técnica adicional. " +
    "Os resultados devem ser interpretados por um profissional de cibersegurança qualificado.";

  doc.rect(MARGIN, y, CONTENT_W, 4).fillColor(C.danger).fill();
  y += 8;
  doc.fontSize(7.5).font("Helvetica").fillColor(C.muted)
     .text(disclaimer, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
  const h = doc.heightOfString(disclaimer, { width: CONTENT_W, lineGap: 2 });
  return y + h + 10;
}

// ---------------------------------------------------------------------------
// Vulnerability theme classification for executive grouping
// ---------------------------------------------------------------------------

interface ThemeGroup { theme: string; count: number; examples: PdfVuln[] }

function getVulnTheme(v: PdfVuln): string {
  const s = `${v.cveId} ${v.affectedComponent} ${v.description}`.toLowerCase();
  if (/spf|dmarc|dkim/i.test(s))                                        return "Segurança de Email (DNS)";
  if (/tls|ssl|cert|cipher|nis2-tls/i.test(s))                          return "Configuração TLS/SSL";
  if (/ssh|nis2-ssh/i.test(s))                                           return "Acesso Remoto SSH";
  if (/header|csp|hsts|x-frame|referrer|content.type|nis2-header/i.test(s)) return "Cabeçalhos de Segurança HTTP";
  if (/mongo|mysql|postgres|redis|mssql|27017|3306|5432|6379|1433/i.test(s)) return "Base de Dados Exposta";
  if (/rdp|3389|remote.desktop/i.test(s))                               return "Acesso Remoto Windows (RDP)";
  if (/\bftp\b|:21\b|telnet|:23\b/i.test(s))                            return "Protocolo Inseguro";
  return "Software com Vulnerabilidades Conhecidas";
}

function groupByTheme(vulnList: PdfVuln[]): ThemeGroup[] {
  const map = new Map<string, PdfVuln[]>();
  for (const v of vulnList) {
    const t = getVulnTheme(v);
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(v);
  }
  return [...map.entries()]
    .map(([theme, examples]) => ({ theme, count: examples.length, examples }))
    .sort((a, b) => b.count - a.count);
}

function buildMediumSummary(mediums: PdfVuln[]): string {
  const themes = groupByTheme(mediums);
  const topTwo = themes.slice(0, 2).map(t => t.theme.toLowerCase());
  const nature = topTwo.length === 1
    ? `maioritariamente relacionadas com ${topTwo[0]}`
    : `principalmente relacionadas com ${topTwo[0]} e ${topTwo[1]}`;

  const hasCves   = mediums.some(v => /^CVE-/i.test(v.cveId));
  const hasConfig = mediums.some(v => !/^CVE-/i.test(v.cveId));
  const effort    = hasCves && hasConfig
    ? "baixo a médio — combinação de actualizações de software e ajustes de configuração"
    : hasCves
      ? "baixo — actualizações de software e aplicação de patches disponíveis"
      : "baixo — ajustes de configuração nos sistemas afectados";

  const n = mediums.length;
  return (
    `${n} vulnerabilidade${n > 1 ? "s" : ""} de severidade média detectada${n > 1 ? "s" : ""}, ` +
    `${nature}. ` +
    `O nível de risco é moderado — não representam exposição imediata, mas aumentam a superfície de ataque ` +
    `caso não sejam corrigidas. ` +
    `Esforço de correcção estimado: ${effort}. ` +
    `Resolução recomendada no prazo de 30 dias.`
  );
}

// ---------------------------------------------------------------------------
// Next steps builder
// ---------------------------------------------------------------------------

function buildNextSteps(
  overall: number,
  counts: { critical: number; high: number; medium: number; low: number }
): string[] {
  const steps: string[] = [];
  if (overall < 60) {
    steps.push("Efectua uma auditoria de segurança completa com prioridade alta — a conformidade NIS2 está em risco imediato.");
    steps.push("Avalia o risco identificado com os responsáveis de TI e prioriza a correcção das vulnerabilidades críticas antes de novas exposições.");
  }
  if (counts.critical > 0)
    steps.push(`Patcha ${counts.critical} vulnerabilidade(s) crítica(s) identificadas — janela recomendada: 24 a 72 horas.`);
  if (counts.high > 0)
    steps.push(`Resolve ${counts.high} vulnerabilidade(s) de severidade alta — janela recomendada: 7 dias.`);
  if (counts.medium > 0)
    steps.push(`Agenda a correcção de ${counts.medium} vulnerabilidade(s) de severidade média — esforço estimado baixo a médio, resolução em 30 dias.`);
  steps.push("Completa o Questionário NIS2 (42 controlos Art. 21(2)) na plataforma para um score de conformidade completo.");
  steps.push("Gera e implementa os Planos de Remediação por IA disponíveis na plataforma para cada vulnerabilidade.");
  if (overall >= 60)
    steps.push("Agenda um re-scan mensal para monitorizar a evolução do score e detectar novas exposições.");
  return steps.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function truncate(s: string, max: number): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ---------------------------------------------------------------------------
// S3 upload
// ---------------------------------------------------------------------------

async function uploadToStorage(
  buffer: Buffer, orgId: number, scanId: number, type: string
): Promise<string> {
  const key = `reports/${orgId}/${scanId}-${type}.pdf`;
  if (!process.env.STORAGE_ACCESS_KEY) {
    console.warn(`[PDF] Storage not configured — key would be: ${key}`);
    return `https://storage.cisplan.pt/${key}`;
  }
  const client = getS3Client();
  await client.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: buffer,
    ContentType: "application/pdf", ACL: "public-read",
  }));
  return `${process.env.STORAGE_PUBLIC_URL ?? "https://storage.cisplan.pt"}/${key}`;
}
