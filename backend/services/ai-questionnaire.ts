/**
 * backend/services/ai-questionnaire.ts
 *
 * Define os 42 controlos NIS2 Art. 21(2), a lógica de scoring e as explicações IA.
 *
 * Cada controlo tem agora:
 *   measure      — medida do Art. 21(2) a–j (= articleSlug)
 *   why          — 1 linha de justificação sem jargão
 *   evidence     — tipo de evidência esperada e se é obrigatória
 *   autoSource   — quando o scanner consegue preencher/verificar automaticamente
 *   weight       — peso no cálculo do score (default 1; futuro: ajustável por setor)
 */

import { chat, SYSTEM_PROMPTS } from "../integrations/anthropic";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type AnswerValue = "yes" | "partial" | "no" | "na";
export type Measure     = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";
export type EvidenceType = "documento" | "registo" | "config" | "scan";
export type AutoSource   = "scan:tls" | "scan:email" | "scan:headers" | "scan:exposure";

export interface NIS2ControlEvidence {
  required:     boolean;
  type:         EvidenceType;
  templateId?:  string;
  description?: string;
}

export interface NIS2Control {
  id:           string;       // ex.: "a-1"
  article:      string;       // ex.: "Art. 21(2)(a)"
  articleSlug:  string;       // ex.: "a"
  articleTitle: string;
  measure:      Measure;      // = articleSlug para estes 42 controlos
  question:     string;
  helpText:     string;
  why:          string;       // 1 linha; porquê este controlo importa
  evidence:     NIS2ControlEvidence;
  autoSource?:  AutoSource;   // scanner preenche/verifica automaticamente
  weight:       number;       // default 1
}

// ---------------------------------------------------------------------------
// Os 42 controlos — Art. 21(2)(a)–(j)
// ---------------------------------------------------------------------------

export const NIS2_CONTROLS: NIS2Control[] = [

  // ── Art. 21(2)(a) — Políticas de segurança e análise de riscos ───────────

  {
    id: "a-1", article: "Art. 21(2)(a)", articleSlug: "a", measure: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "A empresa tem uma Política de Segurança da Informação (PSI) documentada e aprovada pela gestão de topo?",
    helpText: "A PSI é o documento-base que define os objetivos e responsabilidades de segurança. Deve ser um documento escrito, datado e assinado pela administração.",
    why: "A PSI é o documento que demonstra que a empresa tem uma postura formal de segurança — exigido como base da conformidade NIS2.",
    evidence: { required: true, type: "documento", description: "Política de Segurança da Informação aprovada pela gestão de topo" },
    weight: 1,
  },
  {
    id: "a-2", article: "Art. 21(2)(a)", articleSlug: "a", measure: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "A empresa realiza uma análise formal de riscos de cibersegurança pelo menos uma vez por ano?",
    helpText: "Uma análise de riscos identifica quais ativos são críticos, quais as ameaças relevantes e qual o impacto esperado. Pode ser um documento Excel estruturado ou uma ferramenta dedicada.",
    why: "A análise de riscos é o ponto de partida obrigatório para qualquer programa de segurança fundamentado na NIS2.",
    evidence: { required: true, type: "documento", description: "Relatório de análise de riscos datado e atualizado anualmente" },
    weight: 1,
  },
  {
    id: "a-3", article: "Art. 21(2)(a)", articleSlug: "a", measure: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "Os resultados da análise de riscos são utilizados para definir e priorizar medidas de segurança concretas?",
    helpText: "A análise de riscos só tem valor se gerar ações. Deve existir um plano de tratamento de riscos com responsáveis e prazos.",
    why: "A lei exige que os riscos identificados resultem em planos de ação concretos com responsáveis e prazos.",
    evidence: { required: true, type: "documento", description: "Plano de tratamento de riscos com responsáveis e prazos definidos" },
    weight: 1,
  },
  {
    id: "a-4", article: "Art. 21(2)(a)", articleSlug: "a", measure: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "A PSI é comunicada e acessível a todos os colaboradores da empresa?",
    helpText: "A política deve ser distribuída (email, intranet, formação de integração) e os colaboradores devem confirmar que a leram e aceitaram.",
    why: "Uma política não comunicada é juridicamente ineficaz; a prova de distribuição é exigida em auditoria do CNCS.",
    evidence: { required: true, type: "registo", description: "Registo de confirmação de leitura da PSI pelos colaboradores" },
    weight: 1,
  },
  {
    id: "a-5", article: "Art. 21(2)(a)", articleSlug: "a", measure: "a",
    articleTitle: "Políticas de segurança e análise de riscos",
    question: "Existe um processo documentado para rever e atualizar as políticas de segurança (mínimo anual)?",
    helpText: "Políticas desatualizadas não cumprem a NIS2. Deve existir um calendário de revisão e um registo das versões aprovadas.",
    why: "Políticas desatualizadas constituem incumprimento; a revisão periódica documentada é obrigatória.",
    evidence: { required: true, type: "registo", description: "Registo de revisões da PSI com datas e versões aprovadas" },
    weight: 1,
  },

  // ── Art. 21(2)(b) — Gestão de incidentes ─────────────────────────────────

  {
    id: "b-1", article: "Art. 21(2)(b)", articleSlug: "b", measure: "b",
    articleTitle: "Gestão de incidentes",
    question: "A empresa tem um Plano de Resposta a Incidentes (IRP) documentado com papéis e responsabilidades definidos?",
    helpText: "O IRP define quem faz o quê quando ocorre um incidente: quem lidera, quem comunica, quem aciona o CNCS. Sem este plano, o caos é inevitável.",
    why: "O IRP define quem faz o quê durante uma crise — sem ele a resposta é caótica e o incumprimento dos prazos legais é certo.",
    evidence: { required: true, type: "documento", description: "Plano de Resposta a Incidentes com papéis, responsabilidades e contactos" },
    weight: 1,
  },
  {
    id: "b-2", article: "Art. 21(2)(b)", articleSlug: "b", measure: "b",
    articleTitle: "Gestão de incidentes",
    question: "Existe um processo claro para que os colaboradores detetem e reportem internamente incidentes e eventos suspeitos?",
    helpText: "Os colaboradores devem saber como reportar: endereço de email, número de telefone interno, ou plataforma de ticketing. O reporte rápido é crítico.",
    why: "Sem canal interno de reporte, os incidentes chegam tarde ou não chegam, tornando impossível cumprir os prazos legais ao CNCS.",
    evidence: { required: true, type: "documento", description: "Procedimento interno de reporte de incidentes comunicado a todos os colaboradores" },
    weight: 1,
  },
  {
    id: "b-3", article: "Art. 21(2)(b)", articleSlug: "b", measure: "b",
    articleTitle: "Gestão de incidentes",
    question: "A empresa conhece e cumpre os prazos legais de notificação ao CNCS: aviso inicial 24h, notificação detalhada 72h, relatório final 1 mês?",
    helpText: "Estes prazos são obrigatórios para incidentes significativos ao abrigo do DL 125/2025. O desconhecimento não isenta de responsabilidade.",
    why: "Os prazos de 24h/72h/1 mês ao CNCS são vinculativos; o incumprimento implica coima independentemente de intenção.",
    evidence: { required: true, type: "documento", description: "Procedimento de notificação ao CNCS com prazos legais documentados" },
    weight: 1,
  },
  {
    id: "b-4", article: "Art. 21(2)(b)", articleSlug: "b", measure: "b",
    articleTitle: "Gestão de incidentes",
    question: "Os incidentes são registados num log e analisados após resolução (análise post-mortem/lições aprendidas)?",
    helpText: "O registo de incidentes é evidência para auditorias do CNCS. A análise post-mortem é obrigatória para incidentes significativos.",
    why: "O registo de incidentes é evidência obrigatória em auditorias do CNCS e suporte para análise post-mortem.",
    evidence: { required: true, type: "registo", description: "Log de incidentes com data, tipo, impacto e resolução" },
    weight: 1,
  },
  {
    id: "b-5", article: "Art. 21(2)(b)", articleSlug: "b", measure: "b",
    articleTitle: "Gestão de incidentes",
    question: "O Plano de Resposta a Incidentes foi testado nos últimos 12 meses (exercício de simulação ou teste real)?",
    helpText: "Um plano não testado não é um plano — é uma intenção. O CNCS pode solicitar evidências de que o plano foi exercitado.",
    why: "Um plano não testado é uma intenção, não uma garantia; o CNCS pode solicitar evidências de exercício.",
    evidence: { required: false, type: "registo", description: "Relatório de exercício de simulação de incidente com data e participantes" },
    weight: 1,
  },

  // ── Art. 21(2)(c) — Continuidade de negócio ──────────────────────────────

  {
    id: "c-1", article: "Art. 21(2)(c)", articleSlug: "c", measure: "c",
    articleTitle: "Continuidade de negócio e gestão de crises",
    question: "A empresa tem um Plano de Continuidade de Negócio (BCP) documentado que cobre cenários de ciberincidente?",
    helpText: "O BCP define como a empresa continua a operar (mesmo que de forma degradada) quando os sistemas de TI falham. Inclui procedimentos manuais alternativos.",
    why: "O BCP é exigido para garantir que a empresa mantém operação mínima durante um ciberincidente de impacto significativo.",
    evidence: { required: true, type: "documento", description: "Plano de Continuidade de Negócio com procedimentos alternativos para ciberincidente" },
    weight: 1,
  },
  {
    id: "c-2", article: "Art. 21(2)(c)", articleSlug: "c", measure: "c",
    articleTitle: "Continuidade de negócio e gestão de crises",
    question: "Os backups dos sistemas e dados críticos são realizados regularmente e armazenados offline ou em localização separada?",
    helpText: "A regra 3-2-1: 3 cópias, em 2 tipos de suporte, 1 fora do site. Backups apenas na cloud não são suficientes se os sistemas cloud forem comprometidos.",
    why: "Backups são a última linha de defesa contra ransomware; a localização offsite é crítica para garantir a recuperação.",
    evidence: { required: true, type: "registo", description: "Política de backups e registo de execução com confirmação de localização offsite" },
    weight: 1,
  },
  {
    id: "c-3", article: "Art. 21(2)(c)", articleSlug: "c", measure: "c",
    articleTitle: "Continuidade de negócio e gestão de crises",
    question: "Os backups são testados periodicamente para confirmar que a restauração funciona (teste de restore)?",
    helpText: "Um backup não testado é uma esperança, não uma garantia. O teste de restore deve ser documentado e realizado pelo menos anualmente.",
    why: "Um backup não testado não é garantia de recuperação — o teste periódico e documentado é evidência obrigatória.",
    evidence: { required: true, type: "registo", description: "Relatório de teste de restore com data, sistema testado e resultado" },
    weight: 1,
  },
  {
    id: "c-4", article: "Art. 21(2)(c)", articleSlug: "c", measure: "c",
    articleTitle: "Continuidade de negócio e gestão de crises",
    question: "Os objetivos de tempo de recuperação (RTO) e ponto de recuperação (RPO) estão definidos para os sistemas críticos?",
    helpText: "RTO = quanto tempo a empresa suporta estar sem o sistema. RPO = quanta perda de dados é aceitável. Estes valores determinam a estratégia de backup adequada.",
    why: "RTO e RPO definem o nível de serviço mínimo exigido e a estratégia de backup adequada ao negócio.",
    evidence: { required: true, type: "documento", description: "Documento com RTO e RPO definidos por sistema crítico" },
    weight: 1,
  },

  // ── Art. 21(2)(d) — Segurança da cadeia de abastecimento ─────────────────

  {
    id: "d-1", article: "Art. 21(2)(d)", articleSlug: "d", measure: "d",
    articleTitle: "Segurança da cadeia de abastecimento",
    question: "A empresa tem um inventário documentado de todos os fornecedores digitais que têm acesso aos sistemas ou dados da empresa?",
    helpText: "Inclui: MSP, ISP, fornecedores de SaaS, consultores externos com acesso VPN. Sem inventário não é possível gerir os riscos.",
    why: "Sem inventário de fornecedores não é possível avaliar nem gerir o risco introduzido pela cadeia de abastecimento digital.",
    evidence: { required: true, type: "documento", description: "Inventário de fornecedores digitais com tipo de acesso e criticidade" },
    weight: 1,
  },
  {
    id: "d-2", article: "Art. 21(2)(d)", articleSlug: "d", measure: "d",
    articleTitle: "Segurança da cadeia de abastecimento",
    question: "Os contratos com fornecedores críticos incluem cláusulas mínimas de segurança (ex.: notificação de incidentes, requisitos de controlo de acesso)?",
    helpText: "A NIS2 exige que as obrigações de segurança sejam transferidas contratualmente para os fornecedores relevantes.",
    why: "A NIS2 exige que as obrigações de segurança sejam transferidas contratualmente para fornecedores com acesso a sistemas críticos.",
    evidence: { required: true, type: "documento", description: "Contratos com cláusulas de segurança ou adendas assinadas pelos fornecedores críticos" },
    weight: 1,
  },
  {
    id: "d-3", article: "Art. 21(2)(d)", articleSlug: "d", measure: "d",
    articleTitle: "Segurança da cadeia de abastecimento",
    question: "Os fornecedores críticos são avaliados periodicamente quanto às suas práticas de segurança?",
    helpText: "A avaliação pode ser via questionário de segurança, revisão de certificações (ISO 27001, SOC 2) ou cláusulas de auditoria no contrato.",
    why: "Fornecedores críticos com práticas fracas são um vetor de ataque direto à própria empresa — a avaliação periódica é obrigatória.",
    evidence: { required: false, type: "registo", description: "Registo de avaliação de segurança de fornecedores críticos (questionários ou revisão de certificações)" },
    weight: 1,
  },
  {
    id: "d-4", article: "Art. 21(2)(d)", articleSlug: "d", measure: "d",
    articleTitle: "Segurança da cadeia de abastecimento",
    question: "Existe um processo para gerir e monitorizar o acesso de terceiros (fornecedores, consultores) aos sistemas da empresa?",
    helpText: "Os acessos de terceiros devem ser com utilizadores nominais (não partilhados), com MFA, registados em log e revogados quando terminam.",
    why: "Acessos de terceiros sem monitorização são uma das causas mais frequentes de violações de dados documentadas.",
    evidence: { required: true, type: "registo", description: "Log de acessos de terceiros com datas de criação, uso e revogação" },
    weight: 1,
  },

  // ── Art. 21(2)(e) — Aquisição e desenvolvimento de sistemas ──────────────

  {
    id: "e-1", article: "Art. 21(2)(e)", articleSlug: "e", measure: "e",
    articleTitle: "Segurança na aquisição e desenvolvimento de sistemas",
    question: "Existem critérios de segurança formais para a aquisição de novo software e hardware (ex.: verificação de segurança antes da compra)?",
    helpText: "Antes de adquirir um novo sistema, a empresa deve avaliar: tem suporte ativo? Tem histórico de vulnerabilidades? Suporta MFA?",
    why: "Adquirir sistemas sem critérios de segurança é introduzir riscos controláveis de forma deliberada.",
    evidence: { required: true, type: "documento", description: "Política ou checklist de critérios de segurança para aquisição de TI" },
    weight: 1,
  },
  {
    id: "e-2", article: "Art. 21(2)(e)", articleSlug: "e", measure: "e",
    articleTitle: "Segurança na aquisição e desenvolvimento de sistemas",
    question: "Existe um processo formal de gestão de patches: os sistemas operativos, software e firmware são atualizados regularmente?",
    helpText: "A maioria dos ataques explora vulnerabilidades com patches disponíveis há meses. A gestão de patches é uma das medidas com maior ROI.",
    why: "A maioria dos ataques explora vulnerabilidades com patches disponíveis há meses — a gestão de patches é a medida com maior ROI.",
    evidence: { required: true, type: "registo", description: "Registo ou relatório de gestão de patches com datas e sistemas abrangidos" },
    weight: 1,
  },
  {
    id: "e-3", article: "Art. 21(2)(e)", articleSlug: "e", measure: "e",
    articleTitle: "Segurança na aquisição e desenvolvimento de sistemas",
    question: "Os sistemas em fim de vida (EOL — sem suporte do fabricante) estão identificados e com um plano de migração definido?",
    helpText: "Sistemas EOL (ex.: Windows 7, Windows Server 2012) não recebem patches de segurança. A sua existência é uma violação direta da NIS2.",
    why: "Sistemas EOL sem patches de segurança são violação direta da NIS2 e um vetor de ataque permanente e evitável.",
    evidence: { required: true, type: "documento", description: "Inventário de sistemas EOL com plano de migração e prazos" },
    weight: 1,
  },
  {
    id: "e-4", article: "Art. 21(2)(e)", articleSlug: "e", measure: "e",
    articleTitle: "Segurança na aquisição e desenvolvimento de sistemas",
    question: "Se a empresa desenvolve software, existem práticas de segurança no desenvolvimento (SAST, revisão de código, testes de segurança)?",
    helpText: "Responda N.A. se a empresa não desenvolve software. Se desenvolve, a segurança deve ser integrada desde o início (\"shift left\").",
    why: "Código desenvolvido sem práticas de segurança introduz vulnerabilidades estruturais difíceis e caras de corrigir a posteriori.",
    evidence: { required: false, type: "documento", description: "Política de desenvolvimento seguro ou relatório SAST (N.A. se a empresa não desenvolve software)" },
    weight: 1,
  },

  // ── Art. 21(2)(f) — Avaliação da eficácia ────────────────────────────────

  {
    id: "f-1", article: "Art. 21(2)(f)", articleSlug: "f", measure: "f",
    articleTitle: "Avaliação da eficácia das medidas de segurança",
    question: "A empresa realiza avaliações periódicas da eficácia das suas medidas de segurança (auditoria interna ou externa)?",
    helpText: "A NIS2 não exige auditorias externas anuais para PMEs, mas requer que a empresa verifique se as medidas implementadas funcionam.",
    why: "A NIS2 exige verificação explícita de que as medidas implementadas são eficazes, não apenas que existem no papel.",
    evidence: { required: true, type: "documento", description: "Relatório de auditoria interna ou externa de segurança" },
    weight: 1,
  },
  {
    id: "f-2", article: "Art. 21(2)(f)", articleSlug: "f", measure: "f",
    articleTitle: "Avaliação da eficácia das medidas de segurança",
    question: "São realizados testes de vulnerabilidade (vulnerability scans) ou testes de penetração nos sistemas expostos à internet?",
    helpText: "Scans regulares de vulnerabilidades identificam problemas antes que os atacantes os explorem. A plataforma NIS2 PT automatiza esta análise.",
    why: "Testes de vulnerabilidade regulares identificam falhas antes que atacantes as explorem — o scanner da plataforma cobre este controlo.",
    evidence: { required: true, type: "scan", description: "Relatório de scan de vulnerabilidades ou teste de penetração" },
    autoSource: "scan:exposure",
    weight: 1,
  },
  {
    id: "f-3", article: "Art. 21(2)(f)", articleSlug: "f", measure: "f",
    articleTitle: "Avaliação da eficácia das medidas de segurança",
    question: "Os resultados das avaliações são documentados e utilizados para melhorar as medidas de segurança (ciclo de melhoria contínua)?",
    helpText: "Avaliar sem agir é inútil. Os resultados devem gerar um plano de ação com responsáveis e prazos — e estar disponíveis para o CNCS.",
    why: "Avaliar sem agir é inútil; os resultados devem gerar planos de melhoria documentados com responsáveis e prazos.",
    evidence: { required: true, type: "documento", description: "Plano de ação de melhoria resultante de avaliação de segurança" },
    weight: 1,
  },

  // ── Art. 21(2)(g) — Higiene digital e formação ───────────────────────────

  {
    id: "g-1", article: "Art. 21(2)(g)", articleSlug: "g", measure: "g",
    articleTitle: "Higiene digital e formação em cibersegurança",
    question: "Todos os colaboradores recebem formação básica em cibersegurança (pelo menos uma vez por ano)?",
    helpText: "A formação deve cobrir: identificar phishing, criar passwords seguras, reportar incidentes, uso seguro de dispositivos pessoais (BYOD).",
    why: "O fator humano é o vetor de ataque mais explorado; a formação anual é a mitigação de base obrigatória na NIS2.",
    evidence: { required: true, type: "registo", description: "Registo de presenças em formação anual de cibersegurança" },
    weight: 1,
  },
  {
    id: "g-2", article: "Art. 21(2)(g)", articleSlug: "g", measure: "g",
    articleTitle: "Higiene digital e formação em cibersegurança",
    question: "Colaboradores com funções de TI ou segurança recebem formação especializada adicional?",
    helpText: "Os responsáveis de TI e o CISO devem ter formação técnica atualizada. Pode ser via cursos externos, certificações ou conferências.",
    why: "Responsáveis de TI e segurança sem formação técnica atualizada criam lacunas críticas no programa de segurança da empresa.",
    evidence: { required: false, type: "registo", description: "Certificados ou registos de formação técnica especializada" },
    weight: 1,
  },
  {
    id: "g-3", article: "Art. 21(2)(g)", articleSlug: "g", measure: "g",
    articleTitle: "Higiene digital e formação em cibersegurança",
    question: "Existe uma Política de Uso Aceitável (AUP) das tecnologias da empresa comunicada a todos os colaboradores?",
    helpText: "A AUP define o que os colaboradores podem e não podem fazer com os sistemas da empresa: uso pessoal, BYOD, redes Wi-Fi externas.",
    why: "A AUP define limites claros de uso das tecnologias e é base jurídica para ações disciplinares em caso de violação.",
    evidence: { required: true, type: "documento", description: "Política de Uso Aceitável comunicada e assinada pelos colaboradores" },
    weight: 1,
  },
  {
    id: "g-4", article: "Art. 21(2)(g)", articleSlug: "g", measure: "g",
    articleTitle: "Higiene digital e formação em cibersegurança",
    question: "A empresa realiza exercícios de phishing simulado para testar a consciencialização dos colaboradores?",
    helpText: "Testes de phishing simulado são a forma mais eficaz de avaliar e melhorar a resistência humana ao vetor de ataque mais comum em PMEs.",
    why: "Phishing simulado é a forma mais eficaz de medir e melhorar a resistência humana ao vetor de ataque mais comum em PMEs.",
    evidence: { required: false, type: "registo", description: "Relatório de exercício de phishing simulado com taxa de cliques e ações de seguimento" },
    weight: 1,
  },

  // ── Art. 21(2)(h) — Criptografia ─────────────────────────────────────────

  {
    id: "h-1", article: "Art. 21(2)(h)", articleSlug: "h", measure: "h",
    articleTitle: "Criptografia e encriptação",
    question: "Os dados sensíveis em repouso (armazenados em servidores, PCs, cloud) são encriptados?",
    helpText: "Encriptação de disco (BitLocker, FileVault) protege contra roubo físico. Encriptação de base de dados protege em caso de acesso não autorizado.",
    why: "Dados sensíveis não encriptados em repouso ficam expostos em caso de acesso físico ou lógico não autorizado.",
    evidence: { required: true, type: "config", description: "Evidência de encriptação em repouso ativa (BitLocker, FileVault, encriptação BD, etc.)" },
    weight: 1,
  },
  {
    id: "h-2", article: "Art. 21(2)(h)", articleSlug: "h", measure: "h",
    articleTitle: "Criptografia e encriptação",
    question: "Todos os dados em trânsito são encriptados (HTTPS em todos os sites, TLS nas comunicações, VPN para acesso remoto)?",
    helpText: "Comunicações não encriptadas (HTTP, FTP, Telnet, RDP sem VPN) podem ser intercetadas. Verificar: todos os sites usam HTTPS? Todo o acesso remoto usa VPN?",
    why: "Comunicações não encriptadas podem ser intercetadas em qualquer ponto da rede — o TLS é verificável automaticamente pelo scanner.",
    evidence: { required: true, type: "scan", description: "Relatório TLS/HTTPS do scanner ou certificados HTTPS válidos" },
    autoSource: "scan:tls",
    weight: 1,
  },
  {
    id: "h-3", article: "Art. 21(2)(h)", articleSlug: "h", measure: "h",
    articleTitle: "Criptografia e encriptação",
    question: "Existe uma política de gestão de chaves criptográficas (quem tem acesso, como são armazenadas, quando são rodadas)?",
    helpText: "Chaves criptográficas são as \"chaves do cofre digital\". Se não estiverem protegidas e geridas, a encriptação é inútil.",
    why: "Chaves criptográficas mal geridas tornam a encriptação ineficaz — a sua proteção é tão crítica como os dados que protegem.",
    evidence: { required: true, type: "documento", description: "Política de gestão de chaves criptográficas com responsáveis e rotação definida" },
    weight: 1,
  },

  // ── Art. 21(2)(i) — RH, controlo de acesso e gestão de ativos ────────────

  {
    id: "i-1", article: "Art. 21(2)(i)", articleSlug: "i", measure: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "A empresa tem um inventário atualizado de todos os ativos de TI (hardware, software, cloud services)?",
    helpText: "Não se pode proteger o que não se conhece. O inventário deve incluir computadores, servidores, dispositivos móveis, software instalado e serviços cloud.",
    why: "Não se pode proteger o que não se conhece; o inventário de ativos é o ponto de partida de qualquer programa de segurança.",
    evidence: { required: true, type: "documento", description: "Inventário de ativos de TI (hardware, software, cloud) atualizado" },
    weight: 1,
  },
  {
    id: "i-2", article: "Art. 21(2)(i)", articleSlug: "i", measure: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "O princípio do menor privilégio está implementado: cada colaborador tem apenas os acessos necessários para o seu trabalho?",
    helpText: "Um colaborador de contabilidade não precisa de acesso ao servidor de produção. Acessos excessivos são um risco direto — e um requisito NIS2.",
    why: "Acessos excessivos aumentam a superfície de ataque e amplificam o impacto de qualquer comprometimento de conta.",
    evidence: { required: true, type: "config", description: "Evidência de revisão de permissões ou configuração de RBAC/controlo de acesso" },
    weight: 1,
  },
  {
    id: "i-3", article: "Art. 21(2)(i)", articleSlug: "i", measure: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "O processo de entrada (onboarding) e saída (offboarding) de colaboradores inclui a gestão formal de acessos?",
    helpText: "Contas de ex-colaboradores ativas são uma das causas mais comuns de violações de dados. O offboarding deve incluir revogação imediata de todos os acessos.",
    why: "Contas de ex-colaboradores ativas são causa frequente de violações — o offboarding imediato de todos os acessos é obrigatório.",
    evidence: { required: true, type: "documento", description: "Procedimento de onboarding/offboarding com lista de verificação de acessos" },
    weight: 1,
  },
  {
    id: "i-4", article: "Art. 21(2)(i)", articleSlug: "i", measure: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "Os acessos de utilizadores são revistos periodicamente (ex.: revisão semestral de quem tem acesso a quê)?",
    helpText: "As permissões acumulam-se com o tempo. Uma revisão periódica garante que ninguém tem mais acesso do que o necessário.",
    why: "Permissões acumulam-se com o tempo; a revisão periódica garante o princípio do menor privilégio em vigor continuado.",
    evidence: { required: true, type: "registo", description: "Registo de revisão periódica de permissões de utilizadores (semestral ou anual)" },
    weight: 1,
  },
  {
    id: "i-5", article: "Art. 21(2)(i)", articleSlug: "i", measure: "i",
    articleTitle: "Segurança RH, controlo de acesso e gestão de ativos",
    question: "As contas com privilégios de administrador são geridas de forma especial (contas separadas, controlo reforçado, auditoria de uso)?",
    helpText: "Contas de administrador comprometidas dão controlo total. Devem ser contas separadas (não as do dia-a-dia), com MFA obrigatório e registo de todas as ações.",
    why: "Contas de administrador comprometidas dão controlo total do sistema — requerem controlos especiais e MFA obrigatório.",
    evidence: { required: true, type: "config", description: "Política e evidência de gestão de contas privilegiadas com MFA e auditoria de uso" },
    weight: 1,
  },

  // ── Art. 21(2)(j) — MFA e comunicações seguras ───────────────────────────

  {
    id: "j-1", article: "Art. 21(2)(j)", articleSlug: "j", measure: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "O MFA está ativo para todos os utilizadores no email corporativo (Microsoft 365, Google Workspace, etc.)?",
    helpText: "O Business Email Compromise (BEC) é o ataque mais caro para PMEs em Portugal. O MFA no email bloqueia a grande maioria destes ataques.",
    why: "BEC é o ataque mais caro para PMEs; MFA no email bloqueia a grande maioria — e a segurança de email é verificável pelo scanner.",
    evidence: { required: true, type: "config", description: "Evidência de MFA ativo no email corporativo (screenshot do painel de admin ou relatório)" },
    autoSource: "scan:email",
    weight: 1,
  },
  {
    id: "j-2", article: "Art. 21(2)(j)", articleSlug: "j", measure: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "O MFA está ativo para todo o acesso remoto e VPN?",
    helpText: "Qualquer acesso remoto sem MFA é uma porta aberta. Inclui: RDP, SSH, VPN, acesso a servidores on-premises a partir do exterior.",
    why: "Acesso remoto sem MFA é a porta de entrada mais explorada por ransomware — é o mínimo exigido para qualquer acesso externo.",
    evidence: { required: true, type: "config", description: "Evidência de MFA ativo em VPN e acesso remoto (RDP, SSH, etc.)" },
    weight: 1,
  },
  {
    id: "j-3", article: "Art. 21(2)(j)", articleSlug: "j", measure: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "O MFA está ativo para todas as contas de administrador e acesso a sistemas críticos?",
    helpText: "Contas de administrador sem MFA são o vetor de ataque mais direto. A NIS2 é explícita: MFA obrigatório para contas privilegiadas.",
    why: "Contas de administrador sem MFA são o vetor de ataque mais direto; a NIS2 é explícita na sua obrigatoriedade.",
    evidence: { required: true, type: "config", description: "Evidência de MFA obrigatório para todas as contas de administrador" },
    weight: 1,
  },
  {
    id: "j-4", article: "Art. 21(2)(j)", articleSlug: "j", measure: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "As contas de serviço e APIs usam autenticação forte (ex.: tokens/certificados rotativos, não passwords estáticas partilhadas)?",
    helpText: "Passwords partilhadas ou estáticas em contas de serviço são um risco crítico. Devem ser substituídas por tokens ou certificados com rotação automática.",
    why: "Passwords estáticas em contas de serviço são um risco crítico e auditável — tokens e certificados com rotação são o padrão exigido.",
    evidence: { required: true, type: "config", description: "Política e evidência de autenticação por token/certificado em contas de serviço e APIs" },
    weight: 1,
  },
  {
    id: "j-5", article: "Art. 21(2)(j)", articleSlug: "j", measure: "j",
    articleTitle: "MFA e comunicações seguras",
    question: "As comunicações de voz, vídeo e texto para assuntos sensíveis (ex.: dados de clientes, dados financeiros) usam canais seguros e aprovados?",
    helpText: "WhatsApp pessoal e SMS não são canais aprovados para informação sensível. A empresa deve ter uma política de comunicações e canais aprovados (ex.: Teams, Signal Business).",
    why: "Canais não aprovados para informação sensível criam risco legal, operacional e de perda de dados.",
    evidence: { required: true, type: "documento", description: "Política de comunicações com lista de canais aprovados para informação sensível" },
    weight: 1,
  },
];

// ---------------------------------------------------------------------------
// Scoring — weight-aware (com weight=1, comportamento idêntico ao anterior)
// ---------------------------------------------------------------------------

const ANSWER_SCORES: Record<AnswerValue, number | null> = {
  yes:     100,
  partial: 50,
  no:      0,
  na:      null,
};

export interface ControlAnswer {
  controlId: string;
  answer:    AnswerValue;
  score:     number;
}

export interface ScoreResult {
  overall:         number;
  byArticle:       Record<string, number>;
  answeredCount:   number;
  totalApplicable: number;
}

export function calculateScores(
  answers: Array<{ controlId: string; answer: string; score: number }>
): ScoreResult {
  const answerMap = new Map(answers.map((a) => [a.controlId, a.answer as AnswerValue]));

  const byArticle: Record<string, { weightedSum: number; weightTotal: number }> = {};

  for (const control of NIS2_CONTROLS) {
    const answer = answerMap.get(control.id);
    if (!answer || answer === "na") continue;

    const pts = ANSWER_SCORES[answer];
    if (pts === null) continue;

    if (!byArticle[control.articleSlug]) {
      byArticle[control.articleSlug] = { weightedSum: 0, weightTotal: 0 };
    }
    byArticle[control.articleSlug].weightedSum  += pts * control.weight;
    byArticle[control.articleSlug].weightTotal  += control.weight;
  }

  const articleScores: Record<string, number> = {};
  let totalWeightedSum   = 0;
  let totalWeightTotal   = 0;

  for (const [slug, { weightedSum, weightTotal }] of Object.entries(byArticle)) {
    articleScores[slug] = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
    totalWeightedSum   += weightedSum;
    totalWeightTotal   += weightTotal;
  }

  const answered = answers.filter((a) => a.answer !== "na").length;

  return {
    overall:         totalWeightTotal > 0 ? Math.round(totalWeightedSum / totalWeightTotal) : 0,
    byArticle:       articleScores,
    answeredCount:   answered,
    totalApplicable: NIS2_CONTROLS.filter((c) => answerMap.get(c.id) !== "na").length,
  };
}

// ---------------------------------------------------------------------------
// Explicação via IA
// ---------------------------------------------------------------------------

export async function explainControl(
  control: NIS2Control,
  context: { sector?: string; size?: string; orgName?: string; orgId?: number; plan?: string }
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
    orgId: context.orgId,
    plan:  context.plan,
  });
}
