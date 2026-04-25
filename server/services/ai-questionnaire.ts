/**
 * server/services/ai-questionnaire.ts
 *
 * Defines the 42 NIS2 Art. 21(2) controls, scoring logic, and AI explanations.
 */

import { chat, SYSTEM_PROMPTS } from "../integrations/anthropic";

// ---------------------------------------------------------------------------
// Control definitions
// ---------------------------------------------------------------------------

export type AnswerValue = "yes" | "partial" | "no" | "na";

export interface NIS2Control {
  id: string;           // e.g. "a-1"
  article: string;      // e.g. "Art. 21(2)(a)"
  articleSlug: string;  // e.g. "a"
  articleTitle: string;
  question: string;
  helpText: string;     // brief guidance shown in UI
}

export const NIS2_CONTROLS: NIS2Control[] = [
  // ── Art. 21(2)(a) — Políticas de segurança e análise de riscos ────────────
  {
    id: "a-1",
    article: "Art. 21(2)(a)",
    articleSlug: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "A empresa tem uma Política de Segurança da Informação (PSI) documentada e aprovada pela gestão de topo?",
    helpText: "A PSI é o documento-base que define os objetivos e responsabilidades de segurança. Deve ser um documento escrito, datado e assinado pela administração.",
  },
  {
    id: "a-2",
    article: "Art. 21(2)(a)",
    articleSlug: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "A empresa realiza uma análise formal de riscos de cibersegurança pelo menos uma vez por ano?",
    helpText: "Uma análise de riscos identifica quais ativos são críticos, quais as ameaças relevantes e qual o impacto esperado. Pode ser um documento Excel estruturado ou uma ferramenta dedicada.",
  },
  {
    id: "a-3",
    article: "Art. 21(2)(a)",
    articleSlug: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "Os resultados da análise de riscos são utilizados para definir e priorizar medidas de segurança concretas?",
    helpText: "A análise de riscos só tem valor se gerar ações. Deve existir um plano de tratamento de riscos com responsáveis e prazos.",
  },
  {
    id: "a-4",
    article: "Art. 21(2)(a)",
    articleSlug: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "A PSI é comunicada e acessível a todos os colaboradores da empresa?",
    helpText: "A política deve ser distribuída (email, intranet, formação de integração) e os colaboradores devem confirmar que a leram e aceitaram.",
  },
  {
    id: "a-5",
    article: "Art. 21(2)(a)",
    articleSlug: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "Existe um processo documentado para rever e atualizar as políticas de segurança (mínimo anual)?",
    helpText: "Políticas desatualizadas não cumprem a NIS2. Deve existir um calendário de revisão e um registo das versões aprovadas.",
  },

  // ── Art. 21(2)(b) — Gestão de incidentes ─────────────────────────────────
  {
    id: "b-1",
    article: "Art. 21(2)(b)",
    articleSlug: "b",
    articleTitle: "Gestão de incidentes",
    question: "A empresa tem um Plano de Resposta a Incidentes (IRP) documentado com papéis e responsabilidades definidos?",
    helpText: "O IRP define quem faz o quê quando ocorre um incidente: quem lidera, quem comunica, quem aciona o CNCS. Sem este plano, o caos é inevitável.",
  },
  {
    id: "b-2",
    article: "Art. 21(2)(b)",
    articleSlug: "b",
    articleTitle: "Gestão de incidentes",
    question: "Existe um processo claro para que os colaboradores detetem e reportem internamente incidentes e eventos suspeitos?",
    helpText: "Os colaboradores devem saber como reportar: endereço de email, número de telefone interno, ou plataforma de ticketing. O reporte rápido é crítico.",
  },
  {
    id: "b-3",
    article: "Art. 21(2)(b)",
    articleSlug: "b",
    articleTitle: "Gestão de incidentes",
    question: "A empresa conhece e cumpre os prazos legais de notificação ao CNCS: aviso inicial 24h, notificação detalhada 72h, relatório final 1 mês?",
    helpText: "Estes prazos são obrigatórios para incidentes significativos ao abrigo do DL 125/2025. O desconhecimento não isenta de responsabilidade.",
  },
  {
    id: "b-4",
    article: "Art. 21(2)(b)",
    articleSlug: "b",
    articleTitle: "Gestão de incidentes",
    question: "Os incidentes são registados num log e analisados após resolução (análise post-mortem/lições aprendidas)?",
    helpText: "O registo de incidentes é evidência para auditorias do CNCS. A análise post-mortem é obrigatória para incidentes significativos.",
  },
  {
    id: "b-5",
    article: "Art. 21(2)(b)",
    articleSlug: "b",
    articleTitle: "Gestão de incidentes",
    question: "O Plano de Resposta a Incidentes foi testado nos últimos 12 meses (exercício de simulação ou teste real)?",
    helpText: "Um plano não testado não é um plano — é uma intenção. O CNCS pode solicitar evidências de que o plano foi exercitado.",
  },

  // ── Art. 21(2)(c) — Continuidade de negócio ──────────────────────────────
  {
    id: "c-1",
    article: "Art. 21(2)(c)",
    articleSlug: "c",
    articleTitle: "Continuidade de negócio e gestão de crises",
    question: "A empresa tem um Plano de Continuidade de Negócio (BCP) documentado que cobre cenários de ciberincidente?",
    helpText: "O BCP define como a empresa continua a operar (mesmo que de forma degradada) quando os sistemas de TI falham. Inclui procedimentos manuais alternativos.",
  },
  {
    id: "c-2",
    article: "Art. 21(2)(c)",
    articleSlug: "c",
    articleTitle: "Continuidade de negócio e gestão de crises",
    question: "Os backups dos sistemas e dados críticos são realizados regularmente e armazenados offline ou em localização separada?",
    helpText: "A regra 3-2-1: 3 cópias, em 2 tipos de suporte, 1 fora do site. Backups apenas na cloud não são suficientes se os sistemas cloud forem comprometidos.",
  },
  {
    id: "c-3",
    article: "Art. 21(2)(c)",
    articleSlug: "c",
    articleTitle: "Continuidade de negócio e gestão de crises",
    question: "Os backups são testados periodicamente para confirmar que a restauração funciona (teste de restore)?",
    helpText: "Um backup não testado é uma esperança, não uma garantia. O teste de restore deve ser documentado e realizado pelo menos anualmente.",
  },
  {
    id: "c-4",
    article: "Art. 21(2)(c)",
    articleSlug: "c",
    articleTitle: "Continuidade de negócio e gestão de crises",
    question: "Os objetivos de tempo de recuperação (RTO) e ponto de recuperação (RPO) estão definidos para os sistemas críticos?",
    helpText: "RTO = quanto tempo a empresa suporta estar sem o sistema. RPO = quanta perda de dados é aceitável. Estes valores determinam a estratégia de backup adequada.",
  },

  // ── Art. 21(2)(d) — Segurança da cadeia de abastecimento ─────────────────
  {
    id: "d-1",
    article: "Art. 21(2)(d)",
    articleSlug: "d",
    articleTitle: "Segurança da cadeia de abastecimento",
    question: "A empresa tem um inventário documentado de todos os fornecedores digitais que têm acesso aos sistemas ou dados da empresa?",
    helpText: "Inclui: MSP, ISP, fornecedores de SaaS, consultores externos com acesso VPN. Sem inventário não é possível gerir os riscos.",
  },
  {
    id: "d-2",
    article: "Art. 21(2)(d)",
    articleSlug: "d",
    articleTitle: "Segurança da cadeia de abastecimento",
    question: "Os contratos com fornecedores críticos incluem cláusulas mínimas de segurança (ex.: notificação de incidentes, requisitos de controlo de acesso)?",
    helpText: "A NIS2 exige que as obrigações de segurança sejam transferidas contratualmente para os fornecedores relevantes.",
  },
  {
    id: "d-3",
    article: "Art. 21(2)(d)",
    articleSlug: "d",
    articleTitle: "Segurança da cadeia de abastecimento",
    question: "Os fornecedores críticos são avaliados periodicamente quanto às suas práticas de segurança?",
    helpText: "A avaliação pode ser via questionário de segurança, revisão de certificações (ISO 27001, SOC 2) ou cláusulas de auditoria no contrato.",
  },
  {
    id: "d-4",
    article: "Art. 21(2)(d)",
    articleSlug: "d",
    articleTitle: "Segurança da cadeia de abastecimento",
    question: "Existe um processo para gerir e monitorizar o acesso de terceiros (fornecedores, consultores) aos sistemas da empresa?",
    helpText: "Os acessos de terceiros devem ser com utilizadores nominais (não partilhados), com MFA, registados em log e revogados quando terminam.",
  },

  // ── Art. 21(2)(e) — Aquisição e desenvolvimento de sistemas ──────────────
  {
    id: "e-1",
    article: "Art. 21(2)(e)",
    articleSlug: "e",
    articleTitle: "Segurança na aquisição e desenvolvimento de sistemas",
    question: "Existem critérios de segurança formais para a aquisição de novo software e hardware (ex.: verificação de segurança antes da compra)?",
    helpText: "Antes de adquirir um novo sistema, a empresa deve avaliar: tem suporte ativo? Tem histórico de vulnerabilidades? Suporta MFA?",
  },
  {
    id: "e-2",
    article: "Art. 21(2)(e)",
    articleSlug: "e",
    articleTitle: "Segurança na aquisição e desenvolvimento de sistemas",
    question: "Existe um processo formal de gestão de patches: os sistemas operativos, software e firmware são atualizados regularmente?",
    helpText: "A maioria dos ataques explora vulnerabilidades com patches disponíveis há meses. A gestão de patches é uma das medidas com maior ROI.",
  },
  {
    id: "e-3",
    article: "Art. 21(2)(e)",
    articleSlug: "e",
    articleTitle: "Segurança na aquisição e desenvolvimento de sistemas",
    question: "Os sistemas em fim de vida (EOL — sem suporte do fabricante) estão identificados e com um plano de migração definido?",
    helpText: "Sistemas EOL (ex.: Windows 7, Windows Server 2012) não recebem patches de segurança. A sua existência é uma violação direta da NIS2.",
  },
  {
    id: "e-4",
    article: "Art. 21(2)(e)",
    articleSlug: "e",
    articleTitle: "Segurança na aquisição e desenvolvimento de sistemas",
    question: "Se a empresa desenvolve software, existem práticas de segurança no desenvolvimento (SAST, revisão de código, testes de segurança)?",
    helpText: "Responda N.A. se a empresa não desenvolve software. Se desenvolve, a segurança deve ser integrada desde o início (\"shift left\").",
  },

  // ── Art. 21(2)(f) — Avaliação da eficácia ────────────────────────────────
  {
    id: "f-1",
    article: "Art. 21(2)(f)",
    articleSlug: "f",
    articleTitle: "Avaliação da eficácia das medidas de segurança",
    question: "A empresa realiza avaliações periódicas da eficácia das suas medidas de segurança (auditoria interna ou externa)?",
    helpText: "A NIS2 não exige auditorias externas anuais para PMEs, mas requer que a empresa verifique se as medidas implementadas funcionam.",
  },
  {
    id: "f-2",
    article: "Art. 21(2)(f)",
    articleSlug: "f",
    articleTitle: "Avaliação da eficácia das medidas de segurança",
    question: "São realizados testes de vulnerabilidade (vulnerability scans) ou testes de penetração nos sistemas expostos à internet?",
    helpText: "Scans regulares de vulnerabilidades identificam problemas antes que os atacantes os explorem. A plataforma NIS2 PT automatiza esta análise.",
  },
  {
    id: "f-3",
    article: "Art. 21(2)(f)",
    articleSlug: "f",
    articleTitle: "Avaliação da eficácia das medidas de segurança",
    question: "Os resultados das avaliações são documentados e utilizados para melhorar as medidas de segurança (ciclo de melhoria contínua)?",
    helpText: "Avaliar sem agir é inútil. Os resultados devem gerar um plano de ação com responsáveis e prazos — e estar disponíveis para o CNCS.",
  },

  // ── Art. 21(2)(g) — Higiene digital e formação ───────────────────────────
  {
    id: "g-1",
    article: "Art. 21(2)(g)",
    articleSlug: "g",
    articleTitle: "Higiene digital e formação em cibersegurança",
    question: "Todos os colaboradores recebem formação básica em cibersegurança (pelo menos uma vez por ano)?",
    helpText: "A formação deve cobrir: identificar phishing, criar passwords seguras, reportar incidentes, uso seguro de dispositivos pessoais (BYOD).",
  },
  {
    id: "g-2",
    article: "Art. 21(2)(g)",
    articleSlug: "g",
    articleTitle: "Higiene digital e formação em cibersegurança",
    question: "Colaboradores com funções de TI ou segurança recebem formação especializada adicional?",
    helpText: "Os responsáveis de TI e o CISO devem ter formação técnica atualizada. Pode ser via cursos externos, certificações ou conferências.",
  },
  {
    id: "g-3",
    article: "Art. 21(2)(g)",
    articleSlug: "g",
    articleTitle: "Higiene digital e formação em cibersegurança",
    question: "Existe uma Política de Uso Aceitável (AUP) das tecnologias da empresa comunicada a todos os colaboradores?",
    helpText: "A AUP define o que os colaboradores podem e não podem fazer com os sistemas da empresa: uso pessoal, BYOD, redes Wi-Fi externas.",
  },
  {
    id: "g-4",
    article: "Art. 21(2)(g)",
    articleSlug: "g",
    articleTitle: "Higiene digital e formação em cibersegurança",
    question: "A empresa realiza exercícios de phishing simulado para testar a consciencialização dos colaboradores?",
    helpText: "Testes de phishing simulado são a forma mais eficaz de avaliar e melhorar a resistência humana ao vetor de ataque mais comum em PMEs.",
  },

  // ── Art. 21(2)(h) — Criptografia ─────────────────────────────────────────
  {
    id: "h-1",
    article: "Art. 21(2)(h)",
    articleSlug: "h",
    articleTitle: "Criptografia e encriptação",
    question: "Os dados sensíveis em repouso (armazenados em servidores, PCs, cloud) são encriptados?",
    helpText: "Encriptação de disco (BitLocker, FileVault) protege contra roubo físico. Encriptação de base de dados protege em caso de acesso não autorizado.",
  },
  {
    id: "h-2",
    article: "Art. 21(2)(h)",
    articleSlug: "h",
    articleTitle: "Criptografia e encriptação",
    question: "Todos os dados em trânsito são encriptados (HTTPS em todos os sites, TLS nas comunicações, VPN para acesso remoto)?",
    helpText: "Comunicações não encriptadas (HTTP, FTP, Telnet, RDP sem VPN) podem ser intercetadas. Verificar: todos os sites usam HTTPS? Todo o acesso remoto usa VPN?",
  },
  {
    id: "h-3",
    article: "Art. 21(2)(h)",
    articleSlug: "h",
    articleTitle: "Criptografia e encriptação",
    question: "Existe uma política de gestão de chaves criptográficas (quem tem acesso, como são armazenadas, quando são rodadas)?",
    helpText: "Chaves criptográficas são as \"chaves do cofre digital\". Se não estiverem protegidas e geridas, a encriptação é inútil.",
  },

  // ── Art. 21(2)(i) — RH, controlo de acesso e gestão de ativos ────────────
  {
    id: "i-1",
    article: "Art. 21(2)(i)",
    articleSlug: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "A empresa tem um inventário atualizado de todos os ativos de TI (hardware, software, cloud services)?",
    helpText: "Não se pode proteger o que não se conhece. O inventário deve incluir computadores, servidores, dispositivos móveis, software instalado e serviços cloud.",
  },
  {
    id: "i-2",
    article: "Art. 21(2)(i)",
    articleSlug: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "O princípio do menor privilégio está implementado: cada colaborador tem apenas os acessos necessários para o seu trabalho?",
    helpText: "Um colaborador de contabilidade não precisa de acesso ao servidor de produção. Acessos excessivos são um risco direto — e um requisito NIS2.",
  },
  {
    id: "i-3",
    article: "Art. 21(2)(i)",
    articleSlug: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "O processo de entrada (onboarding) e saída (offboarding) de colaboradores inclui a gestão formal de acessos?",
    helpText: "Contas de ex-colaboradores ativas são uma das causas mais comuns de violações de dados. O offboarding deve incluir revogação imediata de todos os acessos.",
  },
  {
    id: "i-4",
    article: "Art. 21(2)(i)",
    articleSlug: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "Os acessos de utilizadores são revistos periodicamente (ex.: revisão semestral de quem tem acesso a quê)?",
    helpText: "As permissões acumulam-se com o tempo. Uma revisão periódica garante que ninguém tem mais acesso do que o necessário.",
  },
  {
    id: "i-5",
    article: "Art. 21(2)(i)",
    articleSlug: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "As contas com privilégios de administrador são geridas de forma especial (contas separadas, controlo reforçado, auditoria de uso)?",
    helpText: "Contas de administrador comprometidas dão controlo total. Devem ser contas separadas (não as do dia-a-dia), com MFA obrigatório e registo de todas as ações.",
  },

  // ── Art. 21(2)(j) — MFA e comunicações seguras ────────────────────────────
  {
    id: "j-1",
    article: "Art. 21(2)(j)",
    articleSlug: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "O MFA está ativo para todos os utilizadores no email corporativo (Microsoft 365, Google Workspace, etc.)?",
    helpText: "O Business Email Compromise (BEC) é o ataque mais caro para PMEs em Portugal. O MFA no email bloqueia a grande maioria destes ataques.",
  },
  {
    id: "j-2",
    article: "Art. 21(2)(j)",
    articleSlug: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "O MFA está ativo para todo o acesso remoto e VPN?",
    helpText: "Qualquer acesso remoto sem MFA é uma porta aberta. Inclui: RDP, SSH, VPN, acesso a servidores on-premises a partir do exterior.",
  },
  {
    id: "j-3",
    article: "Art. 21(2)(j)",
    articleSlug: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "O MFA está ativo para todas as contas de administrador e acesso a sistemas críticos?",
    helpText: "Contas de administrador sem MFA são o vetor de ataque mais direto. A NIS2 é explícita: MFA obrigatório para contas privilegiadas.",
  },
  {
    id: "j-4",
    article: "Art. 21(2)(j)",
    articleSlug: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "As contas de serviço e APIs usam autenticação forte (ex.: tokens/certificados rotativos, não passwords estáticas partilhadas)?",
    helpText: "Passwords partilhadas ou estáticas em contas de serviço são um risco crítico. Devem ser substituídas por tokens ou certificados com rotação automática.",
  },
  {
    id: "j-5",
    article: "Art. 21(2)(j)",
    articleSlug: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "As comunicações de voz, vídeo e texto para assuntos sensíveis (ex.: dados de clientes, dados financeiros) usam canais seguros e aprovados?",
    helpText: "WhatsApp pessoal e SMS não são canais aprovados para informação sensível. A empresa deve ter uma política de comunicações e canais aprovados (ex.: Teams, Signal Business).",
  },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const ANSWER_SCORES: Record<AnswerValue, number | null> = {
  yes:     100,
  partial: 50,
  no:      0,
  na:      null, // excluded from calculation
};

export interface ControlAnswer {
  controlId: string;
  answer: AnswerValue;
  score: number; // 0 | 50 | 100
}

export interface ScoreResult {
  overall: number;
  byArticle: Record<string, number>; // articleSlug → score
  answeredCount: number;
  totalApplicable: number;
}

export function calculateScores(
  answers: Array<{ controlId: string; answer: string; score: number }>
): ScoreResult {
  const answerMap = new Map(answers.map((a) => [a.controlId, a.answer as AnswerValue]));

  const byArticle: Record<string, { sum: number; count: number }> = {};

  for (const control of NIS2_CONTROLS) {
    const answer = answerMap.get(control.id);
    if (!answer || answer === "na") continue;

    const pts = ANSWER_SCORES[answer];
    if (pts === null) continue;

    if (!byArticle[control.articleSlug]) {
      byArticle[control.articleSlug] = { sum: 0, count: 0 };
    }
    byArticle[control.articleSlug].sum   += pts;
    byArticle[control.articleSlug].count += 1;
  }

  const articleScores: Record<string, number> = {};
  let totalSum   = 0;
  let totalCount = 0;

  for (const [slug, { sum, count }] of Object.entries(byArticle)) {
    articleScores[slug] = count > 0 ? Math.round(sum / count) : 0;
    totalSum   += sum;
    totalCount += count;
  }

  const answered = answers.filter((a) => a.answer !== "na").length;

  return {
    overall:          totalCount > 0 ? Math.round(totalSum / totalCount) : 0,
    byArticle:        articleScores,
    answeredCount:    answered,
    totalApplicable:  NIS2_CONTROLS.filter(
      (c) => answerMap.get(c.id) !== "na"
    ).length,
  };
}

// ---------------------------------------------------------------------------
// AI explanation
// ---------------------------------------------------------------------------

export async function explainControl(
  control: NIS2Control,
  context: { sector?: string; size?: string; orgName?: string }
): Promise<string> {
  const contextLine = [
    context.orgName ? `Empresa: ${context.orgName}` : null,
    context.sector  ? `Sector: ${context.sector}`  : null,
    context.size    ? `Dimensão: ${context.size} colaboradores` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return chat({
    system: SYSTEM_PROMPTS.questionnaireGuide,
    messages: [
      {
        role: "user",
        content: `${contextLine ? `Contexto: ${contextLine}\n\n` : ""}Explica o seguinte controlo NIS2 de forma clara e prática para o gestor desta empresa:

**${control.article} — ${control.articleTitle}**
Pergunta: ${control.question}

Inclui: (1) porquê este controlo existe na lei, (2) o que significa na prática para esta empresa, (3) um exemplo concreto de como implementar.`,
      },
    ],
    maxTokens: 512,
    temperature: 0.3,
  });
}
