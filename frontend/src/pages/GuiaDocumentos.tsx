import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, MinusCircle, Lock, ArrowRight } from "lucide-react";
import { Icon } from "../components/ui/Icon";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DocButton } from "../components/DocButton";
import { trpc } from "../lib/trpc";

// ---------------------------------------------------------------------------
// Dados — Guia dos Documentos NIS2 (28 documentos, 7 módulos)
// Fonte: Dossier de Conformidade (aba Índice Mestre) + "Como produzir" próprio do guia.
// ---------------------------------------------------------------------------

type DocState = "gerado" | "empresa" | "condicional";

interface GuiaDoc {
  code: string;
  titulo: string;
  estado: DocState;
  baseLegal: string;
  orientacao: string;
  ficaPorPreencher?: string;
  naoSeEsqueca?: string;
  comoProduzir?: string[];
  arquivarEm: string;
  prazosLegais?: string;
  modeloDocId?: string;
  modeloFilename?: string;
}

interface GuiaModulo {
  id: string;
  titulo: string;
  documentos: GuiaDoc[];
}

const MODULOS: GuiaModulo[] = [
  {
    id: "governanca",
    titulo: "Módulo 1 — Governança e Classificação",
    documentos: [
      {
        code: "D01",
        titulo: "Autoavaliação NIS2 — Classificação EE/EI",
        estado: "gerado",
        baseLegal: "Art. 2.º DL 125/2025",
        orientacao: "Gerado automaticamente pela CISPLAN — **página Documentos**, secção \"Documento do Enquadramento\" (também disponível na página de resultado de cada enquadramento). Rever se a dimensão ou o setor da empresa mudar.",
        arquivarEm: "/NIS2/Governança/",
      },
      {
        code: "D02",
        titulo: "Registo junto do CNCS — Confirmação",
        estado: "gerado",
        baseLegal: "Art. 27.º DL 125/2025",
        orientacao: "Gerado automaticamente pela CISPLAN — **página Documentos**, botão \"Registo Inicial CNCS\". Guardar também o email de confirmação do CNCS com o número de referência, quando o registo for submetido.",
        arquivarEm: "/NIS2/Governança/",
      },
      {
        code: "D03",
        titulo: "Carta de Nomeação do CISO",
        estado: "gerado",
        baseLegal: "Art. 20.º NIS2",
        orientacao: "Gerado automaticamente pela CISPLAN — **página Documentos**, botão \"Carta de Nomeação do CISO\". Requer assinatura do CEO. Atualizar no CNCS se o CISO mudar (prazo 5 dias úteis).",
        ficaPorPreencher: "logótipo da empresa, data e assinaturas (CEO e nomeado).",
        arquivarEm: "/NIS2/Governança/",
      },
      {
        code: "D04",
        titulo: "Ata de Reunião de Cibersegurança (trimestral)",
        estado: "empresa",
        baseLegal: "Art. 20.º NIS2",
        orientacao: "Ata escrita da reunião trimestral da gestão de topo sobre cibersegurança: presenças, temas discutidos (estado de conformidade, incidentes, KPIs) e decisões tomadas. Evidência de supervisão ativa exigida pelo Art. 20.º — qualquer modelo de ata formal assinada serve.",
        comoProduzir: [
          "Agende uma reunião trimestral de 30–60 minutos com a gestão de topo (sócios, administração ou direção). O Art. 20.º exige supervisão *da gestão*, não do departamento de TI — a presença é o ponto essencial.",
          "Prepare a agenda a partir do **Relatório Executivo para a Gestão** que a plataforma gera: score de conformidade, vulnerabilidades críticas em aberto, incidentes do trimestre.",
          "Durante a reunião, registe: data, hora, presenças (nome e cargo), temas discutidos e — o mais importante — **decisões tomadas com responsável e prazo**.",
          "Feche a ata com as assinaturas dos presentes. Um documento de uma página chega; o que conta é ser real, datado e assinado.",
          "Arquive e agende já a reunião seguinte.",
        ],
        arquivarEm: "/NIS2/Governança/Atas/Ata_[Trimestre]_[Ano].pdf",
        modeloDocId: "m1a3-04",
        modeloFilename: "NIS2_Ata_Reuniao_Ciberseguranca_EDITAVEL.pdf",
      },
      {
        code: "D05",
        titulo: "Dashboard de KPIs de Governança (trimestral)",
        estado: "empresa",
        baseLegal: "Art. 20.º NIS2",
        orientacao: "Painel trimestral com indicadores-chave (n.º de incidentes, score de conformidade, formações realizadas) apresentado à gestão de topo. Pode reaproveitar os dados do Relatório Executivo para a Gestão (gerado pela plataforma) como base.",
        comoProduzir: [
          "Escolha 4 a 6 indicadores e mantenha-os estáveis ao longo do tempo — o valor está na **evolução**, não na quantidade. Sugestão: score de conformidade, n.º de vulnerabilidades críticas, n.º de incidentes registados, % de colaboradores com formação feita, taxa de cliques no phishing simulado.",
          "Retire os números das fontes que já tem: o Relatório Executivo (score e vulnerabilidades), o Log de Incidentes (D22), as listas de presenças (D18) e o relatório de phishing (D19).",
          "Registe-os numa folha simples, uma coluna por trimestre, para se ver a tendência.",
          "Apresente na reunião trimestral (D04) e registe na ata que foram apresentados.",
        ],
        arquivarEm: "/NIS2/Governança/KPIs_[Trimestre]_[Ano].xlsx",
        modeloDocId: "m1a3-01",
        modeloFilename: "NIS2_Dashboard_KPIs_Governanca.xlsx",
      },
    ],
  },
  {
    id: "risco-politicas",
    titulo: "Módulo 1 — Análise de Risco e Políticas",
    documentos: [
      {
        code: "D06",
        titulo: "Análise de Risco (anual)",
        estado: "gerado",
        baseLegal: "Art. 21.º §1 NIS2",
        orientacao: "Gerado automaticamente pela CISPLAN — **página Documentos**, botão \"Registo de Riscos\" (probabilidade × impacto, a partir das vulnerabilidades do scan). Cobre a superfície técnica externa; complementar com riscos organizacionais mais amplos se aplicável.",
        arquivarEm: "/NIS2/Riscos/",
      },
      {
        code: "D07",
        titulo: "Política de Segurança da Informação (PSI)",
        estado: "gerado",
        baseLegal: "Art. 21.º NIS2",
        orientacao: "Gerado automaticamente pela CISPLAN — **página Documentos**, botão \"Política de Segurança da Informação\". Requer aprovação e assinatura da gestão de topo, e distribuição a todos os colaboradores com confirmação de leitura.",
        ficaPorPreencher: "logótipo, versão, data de aprovação, nome e cargo de quem aprova, data de revisão.",
        naoSeEsqueca: "a PSI só cumpre o Art. 21.º se for **comunicada**. Distribua por email ou intranet e guarde a confirmação de leitura de cada colaborador — é isso que o auditor pede, não a política em si.",
        arquivarEm: "/NIS2/Políticas/",
      },
      {
        code: "D08",
        titulo: "Inventário de Ativos Críticos",
        estado: "gerado",
        baseLegal: "Art. 21.º §1 NIS2",
        orientacao: "Gerado automaticamente pela CISPLAN — **página Documentos**, botão \"Inventário de Ativos\" (superfície externa detetada pelo scan). Complementar com ativos internos (hardware/software/cloud) não visíveis externamente, se aplicável.",
        arquivarEm: "/NIS2/Ativos/",
      },
    ],
  },
  {
    id: "fornecedores",
    titulo: "Módulo 1 — Fornecedores (TPRM)",
    documentos: [
      {
        code: "D09",
        titulo: "Inventário de Fornecedores TPRM",
        estado: "empresa",
        baseLegal: "Art. 21.º §2(d) NIS2",
        orientacao: "Lista de todos os fornecedores digitais com acesso a sistemas/dados da empresa (MSP, SaaS, consultores com VPN), com nível de criticidade e tipo de acesso. Sem este inventário não é possível gerir o risco de terceiros.",
        comoProduzir: [
          "Comece pelo que já sabe: veja as faturas e os débitos diretos dos últimos 12 meses. Quase todos os fornecedores digitais aparecem aí.",
          "Some os acessos que não são faturados: consultores externos com VPN, o técnico de informática, quem tem acesso ao servidor.",
          "Para cada um, registe: nome, serviço prestado, **que dados ou sistemas acede**, e nível de criticidade (a empresa para se este fornecedor falhar?).",
          "Marque como críticos os que, se falharem ou forem comprometidos, param a operação ou expõem dados de clientes. Esses são os que exigem D10, D11 e D12.",
          "Reveja anualmente — os fornecedores mudam mais do que se pensa.",
        ],
        arquivarEm: "/NIS2/Fornecedores/Inventario_TPRM_[Ano].xlsx",
        modeloDocId: "m1a4-02",
        modeloFilename: "NIS2_Inventario_Fornecedores_TPRM.xlsx",
      },
      {
        code: "D10",
        titulo: "Questionários de Due Diligence respondidos",
        estado: "empresa",
        baseLegal: "Art. 21.º §2(d) NIS2",
        orientacao: "Um ficheiro por fornecedor crítico com a resposta assinada ao questionário de due diligence de segurança. Pode basear-se em certificações já existentes do fornecedor (ISO 27001, SOC 2).",
        comoProduzir: [
          "Comece pelos fornecedores marcados como críticos no D09 — não precisa de questionar todos.",
          "Antes de enviar o questionário, verifique se o fornecedor já publica certificações (ISO 27001, SOC 2) ou uma página de *trust*. Se sim, guarde esse documento — poupa-lhe o questionário e é evidência igualmente válida.",
          "Para os restantes, envie um questionário curto (10 a 15 perguntas): tem política de segurança? faz backups e testa-os? notifica incidentes em quanto tempo? usa MFA? subcontrata alguém que aceda aos nossos dados?",
          "Peça resposta **assinada** por alguém com responsabilidade — um email informal não serve como evidência.",
          "Repita a cada renovação de contrato ou, no mínimo, anualmente.",
        ],
        arquivarEm: "/NIS2/Fornecedores/DueDiligence/[Fornecedor]/DD_[Ano].pdf",
        modeloDocId: "m1a4-04",
        modeloFilename: "NIS2_Questionario_Due_Diligence_Fornecedores_EDITAVEL.pdf",
      },
      {
        code: "D11",
        titulo: "Contratos com Cláusulas NIS2",
        estado: "empresa",
        baseLegal: "Art. 21.º §2(d) NIS2",
        orientacao: "Adenda contratual com fornecedores críticos: notificação de incidentes em 24h, direito de auditoria, requisitos mínimos de segurança, obrigações de subfornecedores, exit strategy. Aplicar em cada renovação de contrato.",
        comoProduzir: [
          "Não reabra contratos a meio — prepare uma **adenda** e aplique-a na próxima renovação. É mais fácil de negociar.",
          "A adenda deve cobrir cinco pontos: notificação de incidentes num prazo definido (24h é o habitual), direito de auditoria ou de exigir evidências, requisitos mínimos de segurança, obrigação de impor o mesmo aos subfornecedores, e as condições de saída.",
          "Comece pelos fornecedores mais críticos e com maior poder negocial do seu lado (os que precisam mais de si do que você deles).",
          "Se o fornecedor recusar, registe a recusa — é informação de risco relevante, e mostra ao auditor que a diligência foi feita.",
          "Guarde a adenda assinada por ambas as partes.",
        ],
        arquivarEm: "/NIS2/Fornecedores/Contratos/[Fornecedor]_Adenda_NIS2.pdf",
        modeloDocId: "m1a4-03",
        modeloFilename: "NIS2_Template_Clausulas_Contratos.docx",
      },
      {
        code: "D12",
        titulo: "Plano de Saída — Exit Strategy",
        estado: "empresa",
        baseLegal: "Art. 21.º §2(d) NIS2",
        orientacao: "Plano documentado de saída/substituição para cada fornecedor crítico, preparado **antes** de qualquer incidente — nunca documentar durante uma crise.",
        comoProduzir: [
          "Para cada fornecedor crítico do D09, responda a quatro perguntas por escrito: onde estão os nossos dados? como os recuperamos? quem seria a alternativa? quanto tempo demorava a mudar?",
          "Confirme que consegue **exportar os dados** — não assuma. Faça o teste uma vez e guarde o resultado.",
          "Identifique pelo menos uma alternativa viável para cada fornecedor crítico, ainda que não a use.",
          "Estime o tempo de migração de forma realista e compare-o com o RTO que definiu (D17). Se não bater certo, é um risco a registar.",
          "Um documento de uma página por fornecedor chega. O que importa é existir antes de ser preciso.",
        ],
        arquivarEm: "/NIS2/Fornecedores/ExitStrategy/Exit_[Fornecedor].xlsx",
        modeloDocId: "m1a4-01",
        modeloFilename: "NIS2_Exit_Strategy_Fornecedores.xlsx",
      },
    ],
  },
  {
    id: "medidas-tecnicas",
    titulo: "Módulo 2 — Medidas Técnicas",
    documentos: [
      {
        code: "D13",
        titulo: "Tracker das 10 Medidas NIS2 (estado atual)",
        estado: "gerado",
        baseLegal: "Art. 21.º NIS2",
        orientacao: "Gerado automaticamente pela CISPLAN — botão \"Tracker das 10 Medidas\", a partir do questionário de autoavaliação. Score de conformidade por medida calculado automaticamente.",
        arquivarEm: "/NIS2/Técnico/",
      },
      {
        code: "D14",
        titulo: "Relatório de Patches e Vulnerabilidades (trimestral)",
        estado: "gerado",
        baseLegal: "Art. 21.º §2(b) NIS2",
        orientacao: "Gerado automaticamente pela CISPLAN — **página Documentos**, botão \"Tracker de Patches e Vulnerabilidades\" (acompanhamento) + \"PDF Técnico\" (detalhe completo), a partir do scan de segurança.",
        arquivarEm: "/NIS2/Técnico/Patches/",
      },
      {
        code: "D15",
        titulo: "Relatório de Teste de Backup e RTO Medido (trimestral)",
        estado: "empresa",
        baseLegal: "Art. 21.º §2(c) NIS2",
        orientacao: "Registo de um teste de restauro **real** de backup: data, ficheiros restaurados e o RTO efetivamente medido (não teórico). Assinado pelo responsável de TI.",
        comoProduzir: [
          "Escolha um sistema crítico e um backup recente. Não avise ninguém de que é um teste — quanto mais parecido com o real, mais útil.",
          "**Cronometre desde o início.** O valor deste documento é o tempo medido, não a confirmação de que o backup existe.",
          "Restaure para um ambiente separado (nunca por cima do sistema em produção) e verifique que os dados abrem e estão íntegros.",
          "Registe: data, sistema testado, origem do backup, hora de início e de fim, **RTO medido**, problemas encontrados.",
          "Compare o RTO medido com o RTO definido (D17). Se for maior, tem duas opções: melhorar o processo ou rever o objetivo — ambas são decisões legítimas, desde que registadas.",
          "Assine e repita trimestralmente.",
        ],
        arquivarEm: "/NIS2/Técnico/Backups/Teste_Restauro_[Trimestre]_[Ano].pdf",
        modeloDocId: "guia-01",
        modeloFilename: "NIS2_Teste_Backup_RTO_Medido.xlsx",
      },
      {
        code: "D16",
        titulo: "Declaração de MFA — Autoavaliação",
        estado: "gerado",
        baseLegal: "Art. 21.º §2(j) NIS2",
        orientacao: "Gerado automaticamente pela CISPLAN — botão \"Declaração de MFA — Autoavaliação\", a partir das 3 respostas de MFA do questionário. É uma declaração de autoavaliação, **não** uma verificação técnica independente — a plataforma não acede aos sistemas da empresa.",
        ficaPorPreencher: "data e assinatura do responsável.",
        arquivarEm: "/NIS2/Técnico/MFA/",
      },
      {
        code: "D17",
        titulo: "Calculadora RTO/RPO aprovada pela gestão",
        estado: "empresa",
        baseLegal: "Art. 21.º §2(c) NIS2",
        orientacao: "Documento com o RTO (indisponibilidade máxima aceitável) e RPO (perda de dados aceitável) definidos por sistema crítico, aprovados formalmente pela gestão de topo.",
        comoProduzir: [
          "Liste os sistemas críticos (o D08 ajuda). Para uma PME são tipicamente 3 a 6: email, ERP/faturação, ficheiros, site.",
          "Para cada um, pergunte à gestão — não ao departamento de TI — duas coisas: \"quanto tempo aguentamos sem isto antes de haver prejuízo sério?\" (RTO) e \"quantas horas de trabalho podemos perder?\" (RPO).",
          "Registe as respostas em horas, por sistema. Resista à tentação de responder \"zero\" a tudo: RTO zero custa muito dinheiro, e a NIS2 não o exige — exige que seja **decidido e justificado**.",
          "Confronte os números com a realidade dos backups: se o backup é diário, o RPO real é 24h, por muito que se deseje 1h.",
          "Leve à reunião de gestão (D04) para aprovação formal e registe na ata. O que dá valor a este documento é a aprovação, não o cálculo.",
        ],
        arquivarEm: "/NIS2/Técnico/BCP/RTO_RPO_Aprovado_[Ano].xlsx",
        modeloDocId: "m2a1-01",
        modeloFilename: "NIS2_Calculadora_RTO_RPO_Backup.xlsx",
      },
    ],
  },
  {
    id: "formacao",
    titulo: "Módulo 2 — Formação e Sensibilização",
    documentos: [
      {
        code: "D18",
        titulo: "Listas de Presenças — Formação Anual",
        estado: "empresa",
        baseLegal: "Art. 21.º §2(g) NIS2",
        orientacao: "Lista de presenças assinada da formação anual obrigatória de cibersegurança — incluindo a gestão de topo (obrigação própria do Art. 20.º NIS2, **não delegável**).",
        comoProduzir: [
          "A formação não precisa de ser longa nem cara. Uma sessão de 60–90 minutos por ano cumpre, desde que seja real e documentada.",
          "Cubra o essencial para uma PME: phishing e como o reconhecer, palavras-passe e MFA, o que fazer perante um incidente (e a quem reportar), uso aceitável dos equipamentos.",
          "**A gestão de topo tem de assistir.** É obrigação própria do Art. 20.º e não pode ser delegada — é dos pontos que o CNCS verifica.",
          "Faça circular uma lista de presenças com nome, cargo, data e assinatura de cada participante. Se a formação for online, exporte o registo de participação da plataforma usada.",
          "Guarde também os materiais usados (slides ou guião) — demonstram o conteúdo coberto.",
        ],
        arquivarEm: "/NIS2/Formação/[Ano]/Lista_Presencas_[data].pdf",
        modeloDocId: "guia-02",
        modeloFilename: "NIS2_Formacao_Lista_Presencas.xlsx",
      },
      {
        code: "D19",
        titulo: "Resultados de Simulação de Phishing (trimestral)",
        estado: "empresa",
        baseLegal: "Art. 21.º §2(g) NIS2",
        orientacao: "Relatório do exercício trimestral de phishing simulado: taxa de cliques, colaboradores identificados para formação de reforço. Meta de referência: taxa de cliques inferior a 5%.",
        comoProduzir: [
          "Use uma ferramenta de simulação (há opções gratuitas e o Microsoft 365 Defender inclui esta funcionalidade nos planos de negócio) ou envie um email de teste preparado internamente.",
          "Prepare um cenário credível para o contexto da empresa — uma fatura pendente, um pedido do fornecedor habitual, uma alteração de dados bancários. Cenários genéricos dão resultados enganadores.",
          "Meça: quantos abriram, quantos clicaram, quantos introduziram credenciais. É a taxa de **cliques** que interessa acompanhar.",
          "**Nunca exponha ou repreenda quem falhou.** O objetivo é formar, não punir — e uma cultura de medo faz com que os incidentes reais deixem de ser reportados.",
          "Ofereça formação de reforço a quem clicou e repita no trimestre seguinte. O que o auditor valoriza é a **tendência descendente**, não o número absoluto.",
        ],
        arquivarEm: "/NIS2/Formação/Phishing/Resultado_[Trimestre]_[Ano].pdf",
        modeloDocId: "guia-03",
        modeloFilename: "NIS2_Simulacao_Phishing_Registo.xlsx",
      },
      {
        code: "D20",
        titulo: "Checklists de Higiene Cibernética assinadas",
        estado: "empresa",
        baseLegal: "Art. 21.º §2(g) NIS2",
        orientacao: "Uma checklist de boas práticas de cibersegurança assinada por cada colaborador (ex.: as \"10 Regras de Ouro\" já incluídas na PSI gerada pela plataforma).",
        comoProduzir: [
          "Não escreva a checklist de raiz — a PSI que a plataforma gera já inclui as regras. Extraia-as para uma folha de uma página.",
          "Escreva em linguagem simples e afirmativa (\"bloqueio o computador quando me ausento\"), não em juridiquês.",
          "Faça assinar por cada colaborador, presencialmente ou por assinatura eletrónica.",
          "Integre no processo de admissão: cada novo colaborador assina no primeiro dia. É a forma mais fácil de manter isto atualizado.",
          "Renove anualmente, a par da formação (D18).",
        ],
        arquivarEm: "/NIS2/Formação/[Ano]/Checklists_Higiene_[Ano].pdf",
        modeloDocId: "m1a1-03",
        modeloFilename: "NIS2_Checklist_Higiene_Cibernetica_EDITAVEL.pdf",
      },
    ],
  },
  {
    id: "incidentes",
    titulo: "Módulo 2 — Gestão de Incidentes",
    documentos: [
      {
        code: "D21",
        titulo: "Plano de Resposta a Incidentes (IRP)",
        estado: "gerado",
        baseLegal: "Art. 23.º NIS2",
        orientacao: "Gerado automaticamente pela CISPLAN — **página Documentos**, botão \"Plano de Resposta a Incidentes\". Testar semestralmente com tabletop exercise (ver D24). Manter cópia impressa na sala de TI.",
        ficaPorPreencher: "versão e data, endereço da sala de crise (física e virtual), nomes e contactos da equipa de resposta, responsável pela comunicação.",
        naoSeEsqueca: "a cópia impressa não é um detalhe — num ataque de ransomware, o plano guardado no servidor cifrado é inútil.",
        arquivarEm: "/NIS2/IRP/",
      },
      {
        code: "D22",
        titulo: "Log de Incidentes (todos os eventos)",
        estado: "empresa",
        baseLegal: "Art. 23.º NIS2",
        orientacao: "Registo de **todos** os eventos de segurança, incluindo os que não chegaram a ser reportáveis ao CNCS — é a evidência de auditoria mais pedida pelo CNCS.",
        comoProduzir: [
          "Uma folha de cálculo simples chega. As colunas essenciais: data e hora, quem detetou, descrição, sistemas afetados, gravidade, ações tomadas, data de resolução, lições aprendidas.",
          "**Registe tudo**, mesmo o que parece pequeno: um email de phishing reportado por um colaborador, uma tentativa de acesso falhada, um portátil perdido. Um log vazio não significa que não houve incidentes — significa que não se registaram, e é assim que o auditor o lê.",
          "Defina quem regista e garanta que os colaboradores sabem a quem reportar.",
          "Reveja o log na reunião trimestral (D04) e leve os números para os KPIs (D05).",
          "Se algum incidente for reportável ao CNCS, o registo aqui é o ponto de partida para as notificações (D23).",
        ],
        arquivarEm: "/NIS2/Incidentes/Log_Incidentes_[Ano].xlsx",
        modeloDocId: "m2a2-01",
        modeloFilename: "NIS2_Log_Incidentes_Ciberseguranca.xlsx",
      },
      {
        code: "D23",
        titulo: "Notificações ao CNCS arquivadas",
        estado: "condicional",
        baseLegal: "Art. 23.º NIS2",
        orientacao: "Só se aplica quando ocorre um incidente reportável. Quando acontecer: guardar o recibo de submissão do CNCS e os três formulários (24h / 72h / relatório final) numa pasta própria por incidente.",
        prazosLegais: "alerta inicial em 24 horas, notificação detalhada em 72 horas, relatório final em 1 mês.",
        naoSeEsqueca: "em caso de indisponibilidade da plataforma: cert@cert.pt · (+351) 210 497 399 · emergência 24/7: (+351) 910 599 284.",
        arquivarEm: "/NIS2/Incidentes/[INC-XXX]/",
        modeloDocId: "guia-06",
        modeloFilename: "NIS2_Notificacao_Incidentes_CNCS.xlsx",
      },
      {
        code: "D24",
        titulo: "Relatório de Tabletop Exercise (semestral)",
        estado: "empresa",
        baseLegal: "Art. 21.º NIS2",
        orientacao: "Relatório do exercício semestral de simulação de incidente (tabletop): cenário testado, participantes e lacunas identificadas no IRP gerado pela plataforma.",
        comoProduzir: [
          "Um *tabletop* é uma simulação de mesa — ninguém toca nos sistemas. Reúna as pessoas numa sala durante 60–90 minutos e discuta um cenário hipotético.",
          "Escolha um cenário realista: \"às 8h de segunda-feira, os ficheiros do servidor estão cifrados e há um pedido de resgate\". Ou: \"um colaborador comunica que enviou as credenciais num site falso\".",
          "Percorra o IRP passo a passo com o cenário à frente: quem é avisado primeiro? quem decide? quem fala com os clientes? em que momento se notifica o CNCS?",
          "**Anote onde o plano falha** — um contacto desatualizado, uma decisão sem responsável definido, um passo que ninguém sabe executar. Essas lacunas são o produto do exercício.",
          "Registe: data, cenário, participantes, lacunas encontradas e correções a fazer no IRP. Atualize o IRP em consequência.",
          "Repita semestralmente, variando o cenário.",
        ],
        arquivarEm: "/NIS2/IRP/Tabletop/Relatorio_Tabletop_[data].pdf",
        modeloDocId: "guia-04",
        modeloFilename: "NIS2_Tabletop_Exercise_Relatorio.xlsx",
      },
    ],
  },
  {
    id: "auditorias",
    titulo: "Módulo 2 — Auditorias e Conformidade",
    documentos: [
      {
        code: "D25",
        titulo: "Auto-Auditoria Anual CNCS",
        estado: "empresa",
        baseLegal: "Arts. 31.º–35.º DL 125/2025",
        orientacao: "Checklist de autoavaliação de conformidade NIS2 preenchido anualmente, para identificar e corrigir lacunas antes de uma auditoria real do CNCS.",
        comoProduzir: [
          "Use o **questionário de autoavaliação da plataforma** como base — são os 42 controlos do Art. 21.º(2), já estruturados.",
          "Percorra este índice documento a documento e marque o estado real de cada um: existe? está atualizado? está assinado?",
          "Seja severo consigo próprio. O objetivo é encontrar as lacunas **antes** do CNCS — uma auto-auditoria complacente não serve para nada.",
          "Para cada lacuna, defina responsável e prazo. Se houver não conformidades sérias, abra um CAPA (D26).",
          "Leve as conclusões à reunião de gestão (D04) e registe na ata.",
        ],
        arquivarEm: "/NIS2/Auditorias/AutoAuditoria_[Ano].pdf",
        modeloDocId: "guia-05",
        modeloFilename: "NIS2_Auto_Auditoria_CNCS.xlsx",
      },
      {
        code: "D26",
        titulo: "CAPA — Plano de Ação Corretiva (não conformidades)",
        estado: "condicional",
        baseLegal: "Arts. 31.º–35.º DL 125/2025",
        orientacao: "Só se aplica perante uma não conformidade identificada (pelo CNCS ou na auto-auditoria). Um CAPA por não conformidade, com causa raiz e prazo de correção.",
        arquivarEm: "/NIS2/Auditorias/CAPA/",
        modeloDocId: "m2a3-03",
        modeloFilename: "NIS2_CAPA_Plano_Acao_Correctiva.docx",
      },
      {
        code: "D27",
        titulo: "Calendário Anual de Conformidade (atividades PDCA)",
        estado: "empresa",
        baseLegal: "Arts. 31.º–35.º DL 125/2025",
        orientacao: "Calendário anual com todas as atividades de conformidade recorrentes (formações, testes de backup, revisões de acesso, auditorias) e os respetivos responsáveis.",
        comoProduzir: [
          "Junte num só calendário tudo o que se repete: reuniões trimestrais (D04), KPIs (D05), testes de backup (D15), phishing (D19), tabletop semestral (D24), formação anual (D18), auto-auditoria (D25), revisão da PSI.",
          "Atribua **um responsável com nome** a cada atividade. \"A equipa de TI\" não é um responsável.",
          "Distribua as atividades ao longo do ano em vez de as acumular — evita a corrida de dezembro.",
          "Marque tudo no calendário partilhado da empresa, com lembretes. Este documento só tem valor se as datas forem reais.",
          "No fim do ano, use-o como checklist do que foi ou não cumprido — é a base da auto-auditoria (D25).",
        ],
        arquivarEm: "/NIS2/Auditorias/Calendario_Conformidade_[Ano].xlsx",
        modeloDocId: "m2a3-01",
        modeloFilename: "NIS2_Calendario_Anual_Conformidade.xlsx",
      },
      {
        code: "D28",
        titulo: "Relatório Anual de Cibersegurança para a Gestão de Topo",
        estado: "gerado",
        baseLegal: "Art. 20.º NIS2",
        orientacao: "Gerado automaticamente pela CISPLAN — **página Documentos**, botão \"Relatório Executivo para a Gestão\" + \"PDF Executivo\" do scan, como suporte adicional. Resumo executivo anual: score, medidas, scan, declaração de supervisão da gestão.",
        arquivarEm: "/NIS2/Auditorias/",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers de render
// ---------------------------------------------------------------------------

/** Divide texto em **negrito** e devolve nós React — único formato inline que o guia usa. */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="text-text font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

const ESTADO_META: Record<DocState, { label: string; tone: "ok" | "bad" | "neutral"; icon: typeof CheckCircle2 }> = {
  gerado:      { label: "Gerado pela plataforma", tone: "ok",      icon: CheckCircle2 },
  empresa:     { label: "A cargo da empresa",     tone: "bad",     icon: AlertCircle },
  condicional: { label: "Condicional (N/A)",      tone: "neutral", icon: MinusCircle },
};

function EstadoBadge({ estado }: { estado: DocState }) {
  const meta = ESTADO_META[estado];
  return (
    <Badge tone={meta.tone}>
      <Icon as={meta.icon} size={13} />
      {meta.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Botão de modelo — tRPC docs.downloadModel (base64), mesmo padrão do DocButton
// usado em Documentos.tsx/ScanResults.tsx. Não usa /api/docs/download (Express):
// esse endpoint depende de o cookie httpOnly chegar num <a href> cross-origin, o
// que falhava em produção; o tRPC usa a mesma origem/mecanismo do resto da app.
// ---------------------------------------------------------------------------

function ModeloButton({ docId, accessible }: { docId: string; accessible: boolean | undefined }) {
  const modelo = trpc.docs.downloadModel.useQuery({ docId }, { enabled: false, retry: false });

  if (accessible === undefined) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-faint px-4 py-2.5">
        A verificar acesso…
      </span>
    );
  }

  if (!accessible) {
    return (
      <Link
        to="/billing"
        className="inline-flex items-center gap-2 border border-line text-dim bg-surface hover:border-warn hover:text-warn text-sm font-medium px-4 py-2.5 rounded-[8px] transition-colors whitespace-nowrap"
      >
        <Icon as={Lock} size={15} /> Modelo — Plano Pro
      </Link>
    );
  }

  return (
    <DocButton
      label="Descarregar modelo"
      onDownload={async () => {
        const r = await modelo.refetch();
        if (!r.data) throw new Error(r.error?.message ?? "Erro ao obter o modelo");
        return r.data;
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Cartão de documento
// ---------------------------------------------------------------------------

function DocCard({ doc, docsById }: { doc: GuiaDoc; docsById: Map<string, boolean> }) {
  return (
    <Card className="p-5" id={doc.code}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <h3 className="text-lg font-semibold text-text">
          <span className="font-mono text-accent mr-2">{doc.code}</span>
          {doc.titulo}
        </h3>
        <EstadoBadge estado={doc.estado} />
      </div>

      <p className="text-xs text-dim mb-3">
        <span className="text-faint">Base legal:</span> {doc.baseLegal}
      </p>

      <p className="text-sm text-dim leading-relaxed mb-3">{renderInline(doc.orientacao)}</p>

      {doc.ficaPorPreencher && (
        <p className="text-sm text-dim leading-relaxed mb-3">
          <span className="text-text font-medium">Fica por preencher: </span>
          {renderInline(doc.ficaPorPreencher)}
        </p>
      )}

      {doc.naoSeEsqueca && (
        <div className="border border-warn/30 bg-warn/5 rounded-[8px] px-4 py-3 mb-3">
          <p className="text-sm text-dim leading-relaxed">
            <span className="text-warn font-medium">Não se esqueça: </span>
            {renderInline(doc.naoSeEsqueca)}
          </p>
        </div>
      )}

      {doc.prazosLegais && (
        <p className="text-sm text-dim leading-relaxed mb-3">
          <span className="text-text font-medium">Prazos legais: </span>
          {doc.prazosLegais}
        </p>
      )}

      {doc.comoProduzir && (
        <div className="mb-3">
          <p className="text-sm text-text font-medium mb-1.5">Como produzir:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-dim leading-relaxed marker:text-faint">
            {doc.comoProduzir.map((step, i) => (
              <li key={i}>{renderInline(step)}</li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs text-faint font-mono mb-4">Arquivar em: {doc.arquivarEm}</p>

      {doc.estado === "gerado" && (
        <Link
          to="/documentos"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          Ir para Documentos <Icon as={ArrowRight} size={14} />
        </Link>
      )}

      {doc.modeloDocId && doc.modeloFilename && (
        <ModeloButton
          docId={doc.modeloDocId}
          accessible={docsById.get(doc.modeloDocId)}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function GuiaDocumentos() {
  const docsList = trpc.docs.list.useQuery();
  const docsById = new Map<string, boolean>(
    (docsList.data ?? []).map((d) => [d.id, d.accessible])
  );

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
      <SectionHeader
        eyebrow="Conformidade documental"
        title="Guia dos Documentos NIS2"
        description="Os 28 documentos que a NIS2 e o DL 125/2025 exigem — o que a plataforma gera por si, e como produzir o resto."
      />

      <Card className="p-6 mb-6">
        <p className="text-sm text-dim leading-relaxed mb-3">
          A conformidade NIS2 não se prova com uma declaração — prova-se com{" "}
          <strong className="text-text font-semibold">documentos</strong>. O Decreto-Lei n.º 125/2025 e
          a Diretiva (UE) 2022/2555 exigem 26 documentos aplicáveis (mais 2 que só existem perante um
          incidente ou uma não conformidade).
        </p>
        <p className="text-sm text-dim leading-relaxed mb-3">
          A CISPLAN <strong className="text-text font-semibold">gera automaticamente 11 desses
          documentos</strong> a partir dos dados que já introduziu: o perfil da empresa, o
          enquadramento, o questionário de autoavaliação e o scan de segurança. Basta rever, assinar e
          arquivar.
        </p>
        <p className="text-sm text-dim leading-relaxed mb-3">
          Os restantes <strong className="text-text font-semibold">dependem de atos da sua
          empresa</strong> — uma reunião que aconteceu, uma formação que foi ministrada, um teste de
          backup que foi executado, um contrato que foi assinado. A plataforma{" "}
          <strong className="text-text font-semibold">não fabrica evidência de atos que não
          ocorreram</strong>: gerar um documento a simular que essa formação ou reunião aconteceu seria
          falsificar evidência de conformidade perante uma auditoria do CNCS.
        </p>
        <p className="text-sm text-dim leading-relaxed">
          O que a plataforma faz por si, nesses casos, é dizer-lhe exatamente quais são, o que devem
          conter e como os produzir — e dar-lhe o modelo pronto a preencher. Cada documento a seu cargo
          tem aqui um ficheiro preparado, com instruções, exemplos e campos assinalados.
        </p>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-sm font-semibold text-text mb-3">Como está organizado</h2>
        <div className="space-y-3">
          <p className="text-sm text-dim leading-relaxed flex items-start gap-2">
            <EstadoBadge estado="gerado" />
            <span>— descarregue na página <Link to="/documentos" className="text-accent hover:underline">Documentos</Link>. Reveja, assine onde for indicado, arquive.</span>
          </p>
          <p className="text-sm text-dim leading-relaxed flex items-start gap-2">
            <EstadoBadge estado="empresa" />
            <span>— exige um ato próprio da organização. Para cada um encontra aqui o que deve conter, um passo a passo, e um modelo pronto a descarregar.</span>
          </p>
          <p className="text-sm text-dim leading-relaxed flex items-start gap-2">
            <EstadoBadge estado="condicional" />
            <span>— só se torna aplicável perante um evento específico. Não conta para a conformidade enquanto esse evento não ocorrer.</span>
          </p>
        </div>
      </Card>

      {/* Navegação por módulo */}
      <div className="flex flex-wrap gap-2 mb-8">
        {MODULOS.map((mod) => (
          <a
            key={mod.id}
            href={`#${mod.id}`}
            className="text-xs text-dim border border-line rounded-full px-3 py-1.5 hover:text-text hover:border-accent transition-colors"
          >
            {mod.titulo.replace(/^Módulo \d — /, "")}
          </a>
        ))}
      </div>

      {MODULOS.map((mod) => (
        <section key={mod.id} id={mod.id} className="mb-10 scroll-mt-4">
          <h2 className="text-xl font-semibold text-text mb-4 pb-2 border-b border-line">
            {mod.titulo}
          </h2>
          <div className="space-y-4">
            {mod.documentos.map((doc) => (
              <DocCard key={doc.code} doc={doc} docsById={docsById} />
            ))}
          </div>
        </section>
      ))}

      <Card className="p-6">
        <p className="text-sm text-dim leading-relaxed mb-2">
          Este guia acompanha o <strong className="text-text font-semibold">Dossier de
          Conformidade</strong> que a plataforma gera — uma folha de cálculo com o índice dos 28
          documentos, o estado de cada um e um score de conformidade documental. O CNCS pede esse
          índice como primeiro passo de uma auditoria.
        </p>
        <p className="text-sm text-dim leading-relaxed">
          Se tiver dúvidas sobre um documento específico, contacte-nos em{" "}
          <a href="mailto:geral@cisplan.com" className="text-accent hover:underline">geral@cisplan.com</a>.
        </p>
      </Card>
    </div>
  );
}
