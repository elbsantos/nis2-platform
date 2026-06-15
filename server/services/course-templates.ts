/**
 * server/services/course-templates.ts
 *
 * Template metadata per lesson.
 * url is null until files are uploaded to object storage (May 2026).
 * Set STORAGE_PUBLIC_URL and upload the files to activate downloads.
 */

export interface CourseTemplate {
  name: string;
  filename: string;
  type: "xlsx" | "pdf" | "docx" | "pptx";
  description: string;
  storageKey: string; // S3/object-storage key
  url: string | null; // null until uploaded
}

function templateUrl(key: string): string | null {
  const base = process.env.STORAGE_PUBLIC_URL;
  return base ? `${base}/templates/${key}` : null;
}

export const LESSON_TEMPLATES: Record<string, CourseTemplate[]> = {
  "module-1/lesson-1-1": [
    {
      name: "Autoavaliação EE/EI",
      filename: "NIS2_Autoavaliacao_EE_EI.xlsx",
      type: "xlsx",
      description: "Ferramenta de autoavaliação para determinar se a empresa é EE ou EI",
      storageKey: "modulo1/aula1/NIS2_Autoavaliacao_EE_EI.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Checklist Higiene Cibernética",
      filename: "NIS2_Checklist_Higiene_Cibernetica_EDITAVEL.pdf",
      type: "pdf",
      description: "Checklist editável das boas práticas de higiene cibernética NIS2",
      storageKey: "modulo1/aula1/NIS2_Checklist_Higiene_Cibernetica_EDITAVEL.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Guia 4 Semanas Para Começar",
      filename: "NIS2_Guia_4_Semanas_Para_Comecar_EDITAVEL.pdf",
      type: "pdf",
      description: "Roteiro de 4 semanas para iniciar a conformidade NIS2",
      storageKey: "modulo1/aula1/NIS2_Guia_4_Semanas_Para_Comecar_EDITAVEL.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Inventário de Ativos Críticos",
      filename: "NIS2_Inventario_Ativos_Criticos.xlsx",
      type: "xlsx",
      description: "Template Excel para inventariar todos os ativos de TI críticos",
      storageKey: "modulo1/aula1/NIS2_Inventario_Ativos_Criticos.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Resumo Executivo para Gestão",
      filename: "NIS2_Resumo_Executivo_Gestao.pdf",
      type: "pdf",
      description: "Resumo de uma página sobre a NIS2 para apresentar à administração",
      storageKey: "modulo1/aula1/NIS2_Resumo_Executivo_Gestao.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Apresentação NIS2 para PMEs",
      filename: "Guia_NIS2_para_PMEs_Portuguesas.pptx",
      type: "pptx",
      description: "Apresentação PowerPoint sobre a NIS2 para PMEs portuguesas",
      storageKey: "modulo1/aula1/Guia_NIS2_para_PMEs_Portuguesas.pptx",
      get url() { return templateUrl(this.storageKey); },
    },
  ],

  "module-1/lesson-1-2": [
    {
      name: "Calculadora Dimensão / Registo CNCS",
      filename: "NIS2_Calculadora_Dimensao_Registo_CNCS.xlsx",
      type: "xlsx",
      description: "Calculadora Excel para determinar dimensão da empresa e registar no CNCS",
      storageKey: "modulo1/aula2/NIS2_Calculadora_Dimensao_Registo_CNCS.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Checklist Registo CNCS",
      filename: "NIS2_Checklist_Registo_CNCS_EDITAVEL.pdf",
      type: "pdf",
      description: "Checklist editável com todos os passos para registo no portal CNCS",
      storageKey: "modulo1/aula2/NIS2_Checklist_Registo_CNCS_EDITAVEL.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Fluxograma Classificação 5 Passos",
      filename: "NIS2_Fluxograma_Classificacao_5_Passos.pdf",
      type: "pdf",
      description: "Fluxograma visual dos 5 passos para determinar se a empresa está abrangida",
      storageKey: "modulo1/aula2/NIS2_Fluxograma_Classificacao_5_Passos.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Guia CAEs Abrangidos",
      filename: "NIS2_Guia_CAEs_Abrangidos.xlsx",
      type: "xlsx",
      description: "Lista completa dos CAEs abrangidos pelos Anexos I e II da NIS2",
      storageKey: "modulo1/aula2/NIS2_Guia_CAEs_Abrangidos.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Matriz Setor / Dimensão",
      filename: "NIS2_Matriz_Setor_Dimensao.pdf",
      type: "pdf",
      description: "Matriz visual EE vs EI por setor e dimensão da empresa",
      storageKey: "modulo1/aula2/NIS2_Matriz_Setor_Dimensao.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
  ],

  "module-1/lesson-1-3": [
    {
      name: "Ata Reunião Cibersegurança",
      filename: "NIS2_Ata_Reuniao_Ciberseguranca_EDITAVEL.pdf",
      type: "pdf",
      description: "Template editável de ata para reuniões de cibersegurança da gestão",
      storageKey: "modulo1/aula3/NIS2_Ata_Reuniao_Ciberseguranca_EDITAVEL.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Carta de Nomeação CISO",
      filename: "NIS2_Carta_Nomeacao_CISO.docx",
      type: "docx",
      description: "Template Word para nomeação formal do CISO (exigido pela NIS2)",
      storageKey: "modulo1/aula3/NIS2_Carta_Nomeacao_CISO.docx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Checklist Governação e Gestão",
      filename: "NIS2_Checklist_Governanca_Gestao_EDITAVEL.pdf",
      type: "pdf",
      description: "Checklist de governação NIS2 para órgãos de administração",
      storageKey: "modulo1/aula3/NIS2_Checklist_Governanca_Gestao_EDITAVEL.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Dashboard KPIs de Governação",
      filename: "NIS2_Dashboard_KPIs_Governanca.xlsx",
      type: "xlsx",
      description: "Dashboard Excel com KPIs de cibersegurança para relatório à gestão",
      storageKey: "modulo1/aula3/NIS2_Dashboard_KPIs_Governanca.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Registo de Riscos de Cibersegurança",
      filename: "NIS2_Registo_Riscos_Ciberseguranca.xlsx",
      type: "xlsx",
      description: "Template Excel para registo e acompanhamento de riscos NIS2",
      storageKey: "modulo1/aula3/NIS2_Registo_Riscos_Ciberseguranca.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
  ],

  "module-1/lesson-1-4": [
    {
      name: "Exit Strategy Fornecedores",
      filename: "NIS2_Exit_Strategy_Fornecedores.xlsx",
      type: "xlsx",
      description: "Template para planear a substituição de fornecedores de alto risco",
      storageKey: "modulo1/aula4/NIS2_Exit_Strategy_Fornecedores.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Inventário Fornecedores TPRM",
      filename: "NIS2_Inventario_Fornecedores_TPRM.xlsx",
      type: "xlsx",
      description: "Inventário completo de fornecedores com avaliação de risco TPRM",
      storageKey: "modulo1/aula4/NIS2_Inventario_Fornecedores_TPRM.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Matriz Responsabilidade Cloud",
      filename: "NIS2_Matriz_Responsabilidade_Cloud.pdf",
      type: "pdf",
      description: "Matriz de responsabilidade partilhada para serviços cloud (IaaS/PaaS/SaaS)",
      storageKey: "modulo1/aula4/NIS2_Matriz_Responsabilidade_Cloud.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Questionário Due Diligence Fornecedores",
      filename: "NIS2_Questionario_Due_Diligence_Fornecedores_EDITAVEL.pdf",
      type: "pdf",
      description: "Questionário de due diligence para avaliar a segurança de fornecedores",
      storageKey: "modulo1/aula4/NIS2_Questionario_Due_Diligence_Fornecedores_EDITAVEL.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Template Cláusulas Contratos",
      filename: "NIS2_Template_Clausulas_Contratos.docx",
      type: "docx",
      description: "Cláusulas contratuais NIS2 prontas a inserir em contratos com fornecedores",
      storageKey: "modulo1/aula4/NIS2_Template_Clausulas_Contratos.docx",
      get url() { return templateUrl(this.storageKey); },
    },
  ],

  "module-2/lesson-2-1": [
    {
      name: "Calculadora RTO/RPO e Backup",
      filename: "NIS2_Calculadora_RTO_RPO_Backup.xlsx",
      type: "xlsx",
      description: "Calculadora para definir objetivos de recuperação e estratégia de backup",
      storageKey: "modulo2/aula1/NIS2_Calculadora_RTO_RPO_Backup.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Guia Implementação MFA",
      filename: "NIS2_Guia_Implementacao_MFA.pdf",
      type: "pdf",
      description: "Guia passo-a-passo para ativar MFA em Microsoft 365, Google e sistemas comuns",
      storageKey: "modulo2/aula1/NIS2_Guia_Implementacao_MFA.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Política de Segurança da Informação",
      filename: "NIS2_PSI_Politica_Seguranca_Informacao.docx",
      type: "docx",
      description: "Template Word da PSI pronto a adaptar — exigido pelo Art. 21(2)(a)",
      storageKey: "modulo2/aula1/NIS2_PSI_Politica_Seguranca_Informacao.docx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Tracker das 10 Medidas NIS2",
      filename: "NIS2_Tracker_10_Medidas.xlsx",
      type: "xlsx",
      description: "Tracker Excel para acompanhar a implementação das 10 medidas do Art. 21(2)",
      storageKey: "modulo2/aula1/NIS2_Tracker_10_Medidas.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Cartão de Emergência A5",
      filename: "NIS2_Cartao_Emergencia_A5.pdf",
      type: "pdf",
      description: "Cartão plastificável A5 com os contactos e passos de emergência NIS2",
      storageKey: "modulo2/aula1/NIS2_Cartao_Emergencia_A5.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
  ],

  "module-2/lesson-2-2": [
    {
      name: "Checklist Forense Digital",
      filename: "NIS2_Checklist_Forense_Digital_EDITAVEL.pdf",
      type: "pdf",
      description: "Checklist de preservação de evidências durante um incidente de segurança",
      storageKey: "modulo2/aula2/NIS2_Checklist_Forense_Digital_EDITAVEL.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Guia Comunicação de Crise",
      filename: "NIS2_Guia_Comunicacao_Crise.pdf",
      type: "pdf",
      description: "Guia de comunicação para gestão de crises de cibersegurança",
      storageKey: "modulo2/aula2/NIS2_Guia_Comunicacao_Crise.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Plano de Resposta a Incidentes (IRP)",
      filename: "NIS2_IRP_Plano_Resposta_Incidentes.docx",
      type: "docx",
      description: "Template Word do IRP completo — exigido pelo Art. 21(2)(b)",
      storageKey: "modulo2/aula2/NIS2_IRP_Plano_Resposta_Incidentes.docx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Log de Incidentes",
      filename: "NIS2_Log_Incidentes_Ciberseguranca.xlsx",
      type: "xlsx",
      description: "Registo estruturado de incidentes com campos para reporte CNCS",
      storageKey: "modulo2/aula2/NIS2_Log_Incidentes_Ciberseguranca.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Template Notificação CNCS",
      filename: "NIS2_Template_Notificacao_CNCS_EDITAVEL.pdf",
      type: "pdf",
      description: "Template editável para notificação de incidente ao CNCS (24h/72h/1 mês)",
      storageKey: "modulo2/aula2/NIS2_Template_Notificacao_CNCS_EDITAVEL.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
  ],

  "module-2/lesson-2-3": [
    {
      name: "Calendário Anual de Conformidade",
      filename: "NIS2_Calendario_Anual_Conformidade.xlsx",
      type: "xlsx",
      description: "Calendário Excel com todas as actividades anuais de conformidade NIS2",
      storageKey: "modulo2/aula3/NIS2_Calendario_Anual_Conformidade.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Plano de Ação Correctiva (CAPA)",
      filename: "NIS2_CAPA_Plano_Acao_Correctiva.docx",
      type: "docx",
      description: "Template Word para planos de ação correctiva após auditoria CNCS",
      storageKey: "modulo2/aula3/NIS2_CAPA_Plano_Acao_Correctiva.docx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Checklist Auto-Auditoria CNCS",
      filename: "NIS2_Checklist_Auto_Auditoria_CNCS_EDITAVEL.pdf",
      type: "pdf",
      description: "Simulação de auditoria CNCS para preparação interna",
      storageKey: "modulo2/aula3/NIS2_Checklist_Auto_Auditoria_CNCS_EDITAVEL.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Dossier Conformidade — Índice Mestre",
      filename: "NIS2_Dossier_Conformidade_Indice_Mestre.xlsx",
      type: "xlsx",
      description: "Índice mestre Excel para organizar o Dossier de Conformidade NIS2 completo",
      storageKey: "modulo2/aula3/NIS2_Dossier_Conformidade_Indice_Mestre.xlsx",
      get url() { return templateUrl(this.storageKey); },
    },
    {
      name: "Resumo Executivo do Curso Completo",
      filename: "NIS2_Resumo_Executivo_Curso_Completo.pdf",
      type: "pdf",
      description: "Resumo de 2 páginas de todos os conteúdos do curso para partilhar",
      storageKey: "modulo2/aula3/NIS2_Resumo_Executivo_Curso_Completo.pdf",
      get url() { return templateUrl(this.storageKey); },
    },
  ],
};
