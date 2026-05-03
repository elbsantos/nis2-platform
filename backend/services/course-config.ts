/**
 * server/services/course-config.ts
 *
 * Static configuration for the NIS2 PT course:
 * lessons metadata, IDs, and multiple-choice quiz questions (5 per lesson).
 */

import { lessonContent } from "./course-content";

export interface QuizQuestion {
  id: string;
  question: string;
  options: [string, string, string, string]; // always 4 options
  correct: 0 | 1 | 2 | 3;                   // index of correct option
  explanation: string;
}

export interface Lesson {
  id: string;          // e.g. "module-1/lesson-1-1"
  moduleId: string;    // e.g. "module-1"
  slug: string;        // e.g. "lesson-1-1"
  title: string;
  description: string;
  durationMinutes: number;
  content?: string;    // Markdown body — rendered in the lesson page
  quiz: QuizQuestion[];
}

export interface Module {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
}

// ---------------------------------------------------------------------------
// Quiz data
// ---------------------------------------------------------------------------

const quizzes: Record<string, QuizQuestion[]> = {

  "lesson-1-1": [
    {
      id: "q1-1-1",
      question: "A Diretiva NIS2 foi publicada com o identificador legislativo:",
      options: [
        "EU 2022/2555",
        "EU 2016/1148",
        "EU 2024/3108",
        "EU 2020/1828",
      ],
      correct: 0,
      explanation:
        "A NIS2 é a Diretiva (UE) 2022/2555, publicada em dezembro de 2022 e com prazo de transposição a outubro de 2024.",
    },
    {
      id: "q1-1-2",
      question: "Qual o decreto-lei que transpôs a NIS2 para o ordenamento jurídico português?",
      options: [
        "DL 125/2025",
        "DL 65/2021",
        "DL 99/2023",
        "DL 7/2004",
      ],
      correct: 0,
      explanation:
        "O DL 125/2025 é o diploma de transposição da NIS2 em Portugal, aprovado no início de 2025.",
    },
    {
      id: "q1-1-3",
      question: "Qual a entidade portuguesa responsável pela supervisão e fiscalização do cumprimento da NIS2?",
      options: [
        "CNCS — Centro Nacional de Cibersegurança",
        "ANACOM — Autoridade Nacional de Comunicações",
        "INFARMED — Autoridade do Medicamento",
        "Banco de Portugal",
      ],
      correct: 0,
      explanation:
        "O CNCS é a autoridade competente NIS2 em Portugal, responsável pelo registo, auditorias e aplicação de sanções.",
    },
    {
      id: "q1-1-4",
      question: "A NIS2 substituiu qual diretiva anterior no domínio da cibersegurança europeia?",
      options: [
        "Diretiva SRI / NIS1 (2016/1148)",
        "RGPD / GDPR (2016/679)",
        "Diretiva ePrivacy (2002/58/CE)",
        "Diretiva CER sobre resiliência de entidades críticas",
      ],
      correct: 0,
      explanation:
        "A NIS2 revogou e substituiu a NIS1 (Diretiva SRI de 2016), ampliando o âmbito e as sanções.",
    },
    {
      id: "q1-1-5",
      question: "O que significa o acrónimo NIS no contexto desta diretiva?",
      options: [
        "Network and Information Security (Segurança das Redes e da Informação)",
        "National Information Standard",
        "New Infrastructure Security",
        "Network Infrastructure Supervision",
      ],
      correct: 0,
      explanation:
        "NIS significa \"Network and Information Security\" — em português, Segurança das Redes e dos Sistemas de Informação.",
    },
  ],

  "lesson-1-2": [
    {
      id: "q1-2-1",
      question: "Quantos sectores de alta criticidade estão listados no Anexo I da NIS2?",
      options: ["11 sectores", "7 sectores", "15 sectores", "8 sectores"],
      correct: 0,
      explanation:
        "O Anexo I lista 11 sectores de alta criticidade (ex.: energia, transportes, banca, saúde, infraestrutura digital).",
    },
    {
      id: "q1-2-2",
      question: "O que significa 'UTA' no critério de dimensão da NIS2?",
      options: [
        "Unidade de Trabalho Anual — equivalente a um trabalhador a tempo inteiro durante um ano",
        "Unidade de Tributação Anual",
        "Unidade de Transação de Ativos",
        "Unidade de Tecnologia Avançada",
      ],
      correct: 0,
      explanation:
        "UTA (Unidade de Trabalho Anual) mede o equivalente a tempo inteiro do pessoal da empresa durante um ano.",
    },
    {
      id: "q1-2-3",
      question:
        "Uma empresa com 60 colaboradores e €8M de volume de negócios no setor de transportes é classificada como:",
      options: [
        "Entidade Importante (EI) — média empresa num setor do Anexo I",
        "Entidade Essencial (EE) — cumpre o critério de grande empresa",
        "Não abrangida pela NIS2 (abaixo dos limites)",
        "Entidade Crítica Nacional, sujeita ao regime mais exigente",
      ],
      correct: 0,
      explanation:
        "Transportes é setor do Anexo I. Com 50–249 UTAs e até €50M, é média empresa → Entidade Importante.",
    },
    {
      id: "q1-2-4",
      question: "Qual das seguintes organizações fica automaticamente EXCLUÍDA do âmbito da NIS2?",
      options: [
        "Microempresa com 8 colaboradores e €1,5M de volume de negócios",
        "Empresa de 45 colaboradores no setor da saúde",
        "Fornecedor de DNS com 25 colaboradores",
        "Empresa de logística com 200 colaboradores",
      ],
      correct: 0,
      explanation:
        "Microempresas (< 10 UTAs e < €2M) estão geralmente excluídas, salvo se forem prestadores de infraestrutura crítica.",
    },
    {
      id: "q1-2-5",
      question:
        "Para ser classificada como Entidade Essencial (EE), uma empresa num setor do Anexo I precisa de ter pelo menos:",
      options: [
        "250 UTAs e €50M de volume de negócios ou €43M de balanço total",
        "100 UTAs e €20M de volume de negócios",
        "500 UTAs e €100M de volume de negócios",
        "50 UTAs e €10M de volume de negócios",
      ],
      correct: 0,
      explanation:
        "Grande empresa = ≥ 250 UTAs E (≥ €50M de VN OU ≥ €43M de balanço). Empresas médias em setores Anexo I são EI.",
    },
  ],

  "lesson-1-3": [
    {
      id: "q1-3-1",
      question: "Para Entidades Essenciais, qual a coima máxima prevista no regime NIS2?",
      options: [
        "€10.000.000 ou 2% do volume de negócios mundial anual (o que for mais elevado)",
        "€1.000.000 ou 1% do volume de negócios",
        "€5.000.000 ou 5% do volume de negócios",
        "€50.000 por cada infração",
      ],
      correct: 0,
      explanation:
        "O Art. 34.º da NIS2 fixa €10M ou 2% do VN mundial para EEs. Para EIs, o limite é €7M ou 1,4%.",
    },
    {
      id: "q1-3-2",
      question:
        "Além da empresa como pessoa coletiva, quem pode ser responsabilizado pessoalmente pelo incumprimento da NIS2?",
      options: [
        "Os membros dos órgãos de gestão (gerentes, CEO, administradores)",
        "Apenas o responsável de TI ou o CISO",
        "Apenas o Data Protection Officer (DPO)",
        "Nenhum individuo — a lei só responsabiliza a pessoa coletiva",
      ],
      correct: 0,
      explanation:
        "A NIS2 introduziu responsabilidade pessoal dos órgãos de gestão, que podem ser temporariamente proibidos de exercer cargos.",
    },
    {
      id: "q1-3-3",
      question:
        "A NIS2 exige que a gestão de topo da empresa faça o quê em matéria de cibersegurança?",
      options: [
        "Receba formação adequada e regular em cibersegurança",
        "Passe a certificação CISM ou CISSP",
        "Contrate um consultor externo certificado ISO 27001",
        "Instale e configure um firewall de nova geração",
      ],
      correct: 0,
      explanation:
        "A NIS2 obriga os órgãos de gestão a receber formação em cibersegurança para poderem supervisionar adequadamente os riscos.",
    },
    {
      id: "q1-3-4",
      question: "A quem deve o CISO reportar diretamente para garantir independência e eficácia?",
      options: [
        "Diretamente à gestão de topo (CEO / Conselho de Administração)",
        "Ao responsável do departamento de TI ou sistemas",
        "Ao CNCS, como entidade supervisora",
        "A um consultor externo de cibersegurança",
      ],
      correct: 0,
      explanation:
        "A NIS2 e as orientações do CNCS recomendam que o CISO reporte ao nível mais alto de gestão para evitar conflitos de interesse com a TI operacional.",
    },
    {
      id: "q1-3-5",
      question: "Todas as entidades abrangidas pela NIS2 devem, obrigatoriamente:",
      options: [
        "Registar-se no portal do CNCS e notificar a sua categorização (EE ou EI)",
        "Obter a certificação ISO 27001 num prazo de 12 meses",
        "Publicar um relatório anual de cibersegurança no seu site",
        "Contratar, pelo menos, dois profissionais certificados CISSP",
      ],
      correct: 0,
      explanation:
        "O registo no CNCS é obrigatório para todas as entidades abrangidas, sendo a base do regime de supervisão.",
    },
  ],

  "lesson-1-4": [
    {
      id: "q1-4-1",
      question:
        "O ataque à SolarWinds (2020) é usado na aula como exemplo paradigmático de que tipo de ameaça?",
      options: [
        "Ataque à cadeia de abastecimento (supply chain attack)",
        "Ataque de phishing direto a colaboradores",
        "Ataque DDoS contra infraestrutura crítica",
        "Ransomware enviado por email corporativo",
      ],
      correct: 0,
      explanation:
        "Um backdoor foi inserido numa atualização legítima da SolarWinds, comprometendo 18.000 organizações através de um único fornecedor.",
    },
    {
      id: "q1-4-2",
      question:
        "Para a maioria das PMEs portuguesas, qual fornecedor digital representa o MAIOR risco de segurança?",
      options: [
        "MSP (Managed Service Provider) — tem acesso administrativo a todos os sistemas",
        "ISP (fornecedor de internet) — controla a conectividade",
        "Fornecedor de hardware (routers, switches)",
        "Fornecedor de software de email",
      ],
      correct: 0,
      explanation:
        "O MSP gere toda a infraestrutura de TI. Se for comprometido, o atacante obtém acesso total — como ter 'as chaves do reino'.",
    },
    {
      id: "q1-4-3",
      question: "O que caracteriza um ataque 'one-to-many' na cadeia de abastecimento?",
      options: [
        "Comprometer um único fornecedor para atacar simultaneamente todas as suas organizações clientes",
        "Um atacante que usa múltiplos vetores para atacar uma única empresa",
        "Um ataque que começa num país e se propaga por muitos",
        "Um vírus que infeta um computador e se espalha pela rede interna",
      ],
      correct: 0,
      explanation:
        "Atacar um fornecedor partilhado por centenas de empresas é muito mais eficiente do ponto de vista do atacante.",
    },
    {
      id: "q1-4-4",
      question:
        "O Art. 21.º da NIS2 obriga as empresas a fazer o quê relativamente à sua cadeia de abastecimento?",
      options: [
        "Avaliar e gerir os riscos de cibersegurança dos fornecedores e prestadores de serviços",
        "Apenas monitorizar os fornecedores críticos de 1.ª linha",
        "Substituir todos os fornecedores por empresas portuguesas certificadas",
        "Exigir certificação ISO 27001 a todos os fornecedores",
      ],
      correct: 0,
      explanation:
        "A NIS2 exige uma gestão formal de riscos de fornecedores — avaliação de segurança, cláusulas contratuais e monitorização contínua.",
    },
    {
      id: "q1-4-5",
      question:
        "Qual é o primeiro passo recomendado no processo de gestão de riscos da cadeia de abastecimento?",
      options: [
        "Inventariar todos os fornecedores digitais da empresa",
        "Pedir imediatamente a todos os fornecedores a sua política de segurança",
        "Rescindir contratos com fornecedores sem certificação de segurança",
        "Contratar uma empresa de auditoria externa para avaliar os fornecedores",
      ],
      correct: 0,
      explanation:
        "Não se pode gerir o que não se conhece. O inventário completo de fornecedores é sempre o ponto de partida.",
    },
  ],

  "lesson-2-1": [
    {
      id: "q2-1-1",
      question:
        "Segundo o Microsoft Security Intelligence, o MFA bloqueia que percentagem de ataques de comprometimento de conta?",
      options: ["99,9%", "75%", "90%", "50%"],
      correct: 0,
      explanation:
        "O MFA bloqueia 99,9% dos ataques de credential stuffing e phishing — sendo a medida de maior ROI para qualquer PME.",
    },
    {
      id: "q2-1-2",
      question:
        "Qual das seguintes medidas é considerada a de MAIOR impacto imediato com menor investimento?",
      options: [
        "MFA — Autenticação Multifator",
        "Firewall de nova geração (NGFW)",
        "Solução EDR com análise comportamental",
        "Pen testing trimestral",
      ],
      correct: 0,
      explanation:
        "O MFA é gratuito ou de custo muito baixo (ex.: Microsoft Authenticator) e tem o maior impacto imediato na redução de risco.",
    },
    {
      id: "q2-1-3",
      question:
        "Qual método de MFA é o MENOS recomendado em contexto NIS2, por ser vulnerável a SIM-swapping?",
      options: [
        "MFA por SMS",
        "Chave de segurança física FIDO2/WebAuthn",
        "App de autenticação TOTP (ex.: Microsoft/Google Authenticator)",
        "Push notification em app corporativa aprovada",
      ],
      correct: 0,
      explanation:
        "O MFA por SMS pode ser intercetado via SIM-swapping. Apps TOTP e chaves físicas FIDO2 são significativamente mais seguras.",
    },
    {
      id: "q2-1-4",
      question: "O Art. 21.º da Diretiva NIS2 define quantas medidas técnicas e operacionais mínimas obrigatórias?",
      options: ["10 medidas", "5 medidas", "20 medidas", "42 medidas"],
      correct: 0,
      explanation:
        "O Art. 21.º(2) lista 10 medidas mínimas: desde políticas de segurança até criptografia, gestão de incidentes e continuidade de negócio.",
    },
    {
      id: "q2-1-5",
      question: "O princípio de 'defesa em profundidade' (defense in depth) pressupõe que:",
      options: [
        "Nenhuma camada de segurança é perfeita — várias camadas sobrepostas tornam o ataque muito mais difícil",
        "Apenas as defesas mais avançadas e caras são eficazes",
        "Se existir um perímetro de rede forte, as defesas internas são dispensáveis",
        "Toda a segurança deve ser concentrada nos sistemas mais críticos",
      ],
      correct: 0,
      explanation:
        "A metáfora da cebola: cada camada atrasa e dificulta o atacante; a falha de uma não compromete as restantes.",
    },
  ],

  "lesson-2-2": [
    {
      id: "q2-2-1",
      question:
        "Após detetar um incidente significativo, qual o prazo máximo para enviar o aviso inicial (early warning) ao CNCS?",
      options: ["24 horas", "72 horas", "7 dias", "30 dias"],
      correct: 0,
      explanation:
        "A NIS2 impõe um aviso inicial ao CNCS em até 24 horas após a deteção, com uma notificação detalhada a seguir em 72 horas.",
    },
    {
      id: "q2-2-2",
      question: "Qual o prazo para a notificação detalhada ao CNCS após a deteção de um incidente significativo?",
      options: ["72 horas", "24 horas", "48 horas", "1 semana"],
      correct: 0,
      explanation:
        "72 horas é o prazo NIS2 para a notificação detalhada — que deve incluir a severidade, o impacto e as medidas adotadas.",
    },
    {
      id: "q2-2-3",
      question:
        "Para que um incidente seja considerado 'significativo' ao abrigo da NIS2, deve preencher qual critério?",
      options: [
        "Ter causado (ou ser suscetível de causar) perturbação operacional grave ou perdas financeiras significativas",
        "Envolver obrigatoriamente dados pessoais (RGPD)",
        "Ter sido divulgado nos meios de comunicação social",
        "Ter um impacto financeiro superior a €10.000",
      ],
      correct: 0,
      explanation:
        "O critério é objetivo: impacto grave na continuidade do serviço ou perdas financeiras. Não depende de terceiros saberem do incidente.",
    },
    {
      id: "q2-2-4",
      question: "Qual o prazo para o relatório final de incidente a apresentar ao CNCS?",
      options: [
        "1 mês após a notificação inicial",
        "72 horas após a contenção do incidente",
        "6 meses após o incidente",
        "1 semana após a notificação inicial",
      ],
      correct: 0,
      explanation:
        "O relatório final (post-mortem completo) deve ser entregue no prazo de 1 mês, com análise de causa raiz e medidas corretivas.",
    },
    {
      id: "q2-2-5",
      question:
        "No cenário de ransomware descrito na aula, os 'dois relógios' que começa a contar simultaneamente são:",
      options: [
        "O contador de resgate dos atacantes e o prazo legal de notificação ao CNCS (24h/72h)",
        "O tempo de recuperação dos backups e o prazo de pagamento do seguro",
        "O downtime do servidor e o prazo de comunicação aos clientes",
        "O tempo até os dados serem publicados e o prazo de resposta da imprensa",
      ],
      correct: 0,
      explanation:
        "Esta metáfora central da aula sublinha que um incidente cria obrigações legais imediatas paralelas à resposta técnica.",
    },
  ],

  "lesson-2-3": [
    {
      id: "q2-3-1",
      question:
        "Qual a diferença no regime de supervisão do CNCS entre Entidades Essenciais e Entidades Importantes?",
      options: [
        "EEs: auditorias proativas e regulares (ex ante); EIs: supervisão reativa, após ocorrência (ex post)",
        "EEs não são auditadas porque têm mais recursos; EIs têm auditorias anuais obrigatórias",
        "Ambas têm o mesmo regime de supervisão, apenas com frequências diferentes",
        "EIs têm mais auditorias por serem mais numerosas no mercado português",
      ],
      correct: 0,
      explanation:
        "A NIS2 distingue: EEs estão sob supervisão contínua proativa; EIs apenas são inspecionadas quando há indícios de incumprimento.",
    },
    {
      id: "q2-3-2",
      question: "O 'Dossier de Conformidade NIS2' de uma empresa deve conter, essencialmente:",
      options: [
        "Evidências de todas as medidas implementadas: políticas, atas de formação, testes de backup e registos de incidentes",
        "Apenas o certificado de conformidade emitido pelo CNCS após auditoria",
        "Os contratos com todos os fornecedores de TI e as suas apólices de seguro",
        "O relatório anual de contas e o organograma da empresa",
      ],
      correct: 0,
      explanation:
        "O dossier é um arquivo probatório — reúne as evidências de que as medidas do Art. 21.º estão de facto implementadas.",
    },
    {
      id: "q2-3-3",
      question: "O CNCS tem poder para, no exercício da sua função de supervisão:",
      options: [
        "Emitir ordens vinculativas, aplicar coimas e suspender autorizações de atividade",
        "Apenas emitir recomendações não vinculativas e orientações de boas práticas",
        "Auditar as empresas, mas as coimas só podem ser aplicadas por tribunal cível",
        "Monitorizar, mas não sancionar diretamente — reporta ao Ministério da Justiça",
      ],
      correct: 0,
      explanation:
        "O CNCS é uma autoridade de supervisão com plenos poderes executivos — inclui auditorias, ordens vinculativas e sanções diretas.",
    },
    {
      id: "q2-3-4",
      question:
        "Para manter a conformidade NIS2 ativa ao longo do tempo, o curso recomenda:",
      options: [
        "Scans de conformidade regulares, formação periódica da equipa e atualização do dossier",
        "Obter a certificação ISO 27001, que substitui automaticamente todos os requisitos NIS2",
        "Contratar um advogado especializado em ciberdireito para gerir toda a conformidade",
        "Apenas agir quando o CNCS iniciar uma auditoria ou enviar notificação formal",
      ],
      correct: 0,
      explanation:
        "A conformidade NIS2 é um processo contínuo — não um projeto com data de fim. Scans regulares e formação são a chave da manutenção.",
    },
    {
      id: "q2-3-5",
      question:
        "Qual foi o principal objetivo da criação da NIS2 em relação à NIS1?",
      options: [
        "Ampliar o âmbito de aplicação, aumentar as sanções e harmonizar a supervisão em toda a UE",
        "Reduzir a burocracia das empresas e simplificar as obrigações de reporte",
        "Substituir o RGPD como instrumento principal de proteção de dados na UE",
        "Restringir a aplicação a empresas com mais de 1.000 colaboradores",
      ],
      correct: 0,
      explanation:
        "A NIS2 nasceu precisamente das insuficiências da NIS1: âmbito limitado, sanções baixas e aplicação inconsistente entre Estados-Membros.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Course structure
// ---------------------------------------------------------------------------

export const courseModules: Module[] = [
  {
    id: "module-1",
    title: "Módulo 1 — Fundamentos NIS2 e Obrigações Legais",
    description:
      "Do enquadramento legal às responsabilidades concretas da sua empresa: o que é a NIS2, se se aplica a si, e o que deve fazer.",
    lessons: [
      {
        id: "module-1/lesson-1-1",
        moduleId: "module-1",
        slug: "lesson-1-1",
        title: "Aula 1.1 — O Que é a NIS2 e Porque se Aplica a Mim",
        description:
          "Enquadramento histórico e legal da NIS2: o que mudou em relação à NIS1, porque surgiu, quem supervisiona em Portugal e o impacto real para as PMEs.",
        durationMinutes: 18,
        content: lessonContent["lesson-1-1"],
        quiz: quizzes["lesson-1-1"],
      },
      {
        id: "module-1/lesson-1-2",
        moduleId: "module-1",
        slug: "lesson-1-2",
        title: "Aula 1.2 — Âmbito e Classificação de Entidades",
        description:
          "Os dois eixos de classificação (setor e dimensão), os Anexos I e II, o cálculo de UTAs, a distinção EE/EI e o fluxograma de 5 passos para saber onde a sua empresa se encaixa.",
        durationMinutes: 21,
        content: lessonContent["lesson-1-2"],
        quiz: quizzes["lesson-1-2"],
      },
      {
        id: "module-1/lesson-1-3",
        moduleId: "module-1",
        slug: "lesson-1-3",
        title: "Aula 1.3 — Responsabilidades Legais e Governação",
        description:
          "Obrigações dos órgãos de gestão, responsabilidade pessoal, nomeação do CISO, formação obrigatória e o regime de coimas até €10M.",
        durationMinutes: 24,
        content: lessonContent["lesson-1-3"],
        quiz: quizzes["lesson-1-3"],
      },
      {
        id: "module-1/lesson-1-4",
        moduleId: "module-1",
        slug: "lesson-1-4",
        title: "Aula 1.4 — Gestão de Riscos e Cadeia de Abastecimento",
        description:
          "O caso SolarWinds, os 6 tipos de fornecedores digitais de qualquer PME, a lógica do ataque one-to-many, e o processo de avaliação de fornecedores exigido pelo Art. 21.º.",
        durationMinutes: 29,
        content: lessonContent["lesson-1-4"],
        quiz: quizzes["lesson-1-4"],
      },
    ],
  },
  {
    id: "module-2",
    title: "Módulo 2 — Implementação, Incidentes e Auditorias",
    description:
      "As 10 medidas técnicas obrigatórias, como gerir e reportar um incidente nas 72 horas legais, e como preparar a empresa para uma auditoria do CNCS.",
    lessons: [
      {
        id: "module-2/lesson-2-1",
        moduleId: "module-2",
        slug: "lesson-2-1",
        title: "Aula 2.1 — As 10 Medidas Técnicas e Operacionais",
        description:
          "As 10 medidas do Art. 21.º(2) ordenadas por ROI de segurança: MFA, segmentação de rede, gestão de patches, backups, criptografia e mais — cada uma com uma ação concreta para começar hoje.",
        durationMinutes: 33,
        content: lessonContent["lesson-2-1"],
        quiz: quizzes["lesson-2-1"],
      },
      {
        id: "module-2/lesson-2-2",
        moduleId: "module-2",
        slug: "lesson-2-2",
        title: "Aula 2.2 — Gestão e Reporte de Incidentes",
        description:
          "O guia de sobrevivência para as 72 horas após um incidente: o que é um incidente reportável, os três prazos legais (24h/72h/1 mês), o processo de contenção e o relatório final para o CNCS.",
        durationMinutes: 27,
        content: lessonContent["lesson-2-2"],
        quiz: quizzes["lesson-2-2"],
      },
      {
        id: "module-2/lesson-2-3",
        moduleId: "module-2",
        slug: "lesson-2-3",
        title: "Aula 2.3 — Supervisão, Auditorias e Conformidade Contínua",
        description:
          "Os poderes do CNCS, as diferenças de supervisão entre EE e EI, como preparar o Dossier de Conformidade e o plano de ação para os 30 dias seguintes.",
        durationMinutes: 25,
        content: lessonContent["lesson-2-3"],
        quiz: quizzes["lesson-2-3"],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getAllLessons(): Lesson[] {
  return courseModules.flatMap((m) => m.lessons);
}

export function getLessonById(id: string): Lesson | undefined {
  return getAllLessons().find((l) => l.id === id);
}

export function getModuleById(id: string): Module | undefined {
  return courseModules.find((m) => m.id === id);
}
