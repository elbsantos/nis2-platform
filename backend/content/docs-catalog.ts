/**
 * backend/content/docs-catalog.ts
 *
 * Single source of truth for all 35 course documents.
 * plan: "free" = available on all plans; "pro" = requires Pro or MSSP.
 */

export type DocType = "xlsx" | "pdf" | "docx";
export type DocPlan = "free" | "pro";

export interface CourseDoc {
  id: string;
  lessonId: string;
  filename: string;
  label: string;
  type: DocType;
  plan: DocPlan;
}

export const DOCS_CATALOG: CourseDoc[] = [
  // ── Aula 1.1 — free (preview lesson) ───────────────────────────────────────
  { id: "m1a1-01", lessonId: "1.1", filename: "NIS2_Autoavaliacao_EE_EI.xlsx",                      label: "Ferramenta de Autoavaliação EE/EI",          type: "xlsx", plan: "free" },
  { id: "m1a1-02", lessonId: "1.1", filename: "NIS2_Inventario_Ativos_Criticos.xlsx",               label: "Inventário de Activos Críticos",             type: "xlsx", plan: "free" },
  { id: "m1a1-03", lessonId: "1.1", filename: "NIS2_Checklist_Higiene_Cibernetica_EDITAVEL.pdf",    label: "Checklist de Higiene Cibernética",           type: "pdf",  plan: "free" },
  { id: "m1a1-04", lessonId: "1.1", filename: "NIS2_Guia_4_Semanas_Para_Comecar_EDITAVEL.pdf",      label: "Guia das 4 Semanas para Começar",            type: "pdf",  plan: "free" },
  { id: "m1a1-05", lessonId: "1.1", filename: "NIS2_Resumo_Executivo_Gestao.pdf",                   label: "Resumo Executivo para Gestão",               type: "pdf",  plan: "free" },

  // ── Aula 1.2 ────────────────────────────────────────────────────────────────
  { id: "m1a2-01", lessonId: "1.2", filename: "NIS2_Calculadora_Dimensao_Registo_CNCS.xlsx",        label: "Calculadora de Dimensão (UTAs) + Registo CNCS", type: "xlsx", plan: "pro" },
  { id: "m1a2-02", lessonId: "1.2", filename: "NIS2_Guia_CAEs_Abrangidos.xlsx",                     label: "Guia de CAEs Abrangidos pela NIS2",          type: "xlsx", plan: "pro" },
  { id: "m1a2-03", lessonId: "1.2", filename: "NIS2_Checklist_Registo_CNCS_EDITAVEL.pdf",           label: "Checklist de Registo CNCS (editável)",       type: "pdf",  plan: "pro" },
  { id: "m1a2-04", lessonId: "1.2", filename: "NIS2_Fluxograma_Classificacao_5_Passos.pdf",         label: "Fluxograma Classificação 5 Passos",          type: "pdf",  plan: "pro" },
  { id: "m1a2-05", lessonId: "1.2", filename: "NIS2_Matriz_Setor_Dimensao.pdf",                     label: "Matriz Sector × Dimensão EE/EI",             type: "pdf",  plan: "pro" },

  // ── Aula 1.3 ────────────────────────────────────────────────────────────────
  { id: "m1a3-01", lessonId: "1.3", filename: "NIS2_Dashboard_KPIs_Governanca.xlsx",                label: "Dashboard de KPIs de Governança",            type: "xlsx", plan: "pro" },
  { id: "m1a3-02", lessonId: "1.3", filename: "NIS2_Registo_Riscos_Ciberseguranca.xlsx",            label: "Registo de Riscos com Heatmap",              type: "xlsx", plan: "pro" },
  { id: "m1a3-03", lessonId: "1.3", filename: "NIS2_Carta_Nomeacao_CISO.docx",                      label: "Carta de Nomeação do CISO",                  type: "docx", plan: "pro" },
  { id: "m1a3-04", lessonId: "1.3", filename: "NIS2_Ata_Reuniao_Ciberseguranca_EDITAVEL.pdf",       label: "Ata de Reunião de Cibersegurança (editável)",type: "pdf",  plan: "pro" },
  { id: "m1a3-05", lessonId: "1.3", filename: "NIS2_Checklist_Governanca_Gestao_EDITAVEL.pdf",      label: "Checklist de Governança para Gestão",        type: "pdf",  plan: "pro" },

  // ── Aula 1.4 ────────────────────────────────────────────────────────────────
  { id: "m1a4-01", lessonId: "1.4", filename: "NIS2_Exit_Strategy_Fornecedores.xlsx",               label: "Exit Strategy de Fornecedores Críticos",     type: "xlsx", plan: "pro" },
  { id: "m1a4-02", lessonId: "1.4", filename: "NIS2_Inventario_Fornecedores_TPRM.xlsx",             label: "Inventário de Fornecedores TPRM",            type: "xlsx", plan: "pro" },
  { id: "m1a4-03", lessonId: "1.4", filename: "NIS2_Template_Clausulas_Contratos.docx",             label: "Template Cláusulas NIS2 para Contratos",     type: "docx", plan: "pro" },
  { id: "m1a4-04", lessonId: "1.4", filename: "NIS2_Questionario_Due_Diligence_Fornecedores_EDITAVEL.pdf", label: "Questionário Due Diligence Fornecedores", type: "pdf", plan: "pro" },
  { id: "m1a4-05", lessonId: "1.4", filename: "NIS2_Matriz_Responsabilidade_Cloud.pdf",             label: "Matriz de Responsabilidade Cloud (SaaS/IaaS/PaaS)", type: "pdf", plan: "pro" },

  // ── Aula 2.1 ────────────────────────────────────────────────────────────────
  { id: "m2a1-01", lessonId: "2.1", filename: "NIS2_Calculadora_RTO_RPO_Backup.xlsx",               label: "Calculadora RTO/RPO de Backup",              type: "xlsx", plan: "pro" },
  { id: "m2a1-02", lessonId: "2.1", filename: "NIS2_Tracker_10_Medidas.xlsx",                       label: "Tracker das 10 Medidas NIS2",                type: "xlsx", plan: "pro" },
  { id: "m2a1-03", lessonId: "2.1", filename: "NIS2_PSI_Politica_Seguranca_Informacao.docx",        label: "PSI — Política de Segurança da Informação",  type: "docx", plan: "pro" },
  { id: "m2a1-04", lessonId: "2.1", filename: "NIS2_Cartao_Emergencia_A5.pdf",                      label: "Cartão de Emergência A5 (plastificável)",    type: "pdf",  plan: "pro" },
  { id: "m2a1-05", lessonId: "2.1", filename: "NIS2_Guia_Implementacao_MFA.pdf",                    label: "Guia de Implementação MFA",                  type: "pdf",  plan: "pro" },

  // ── Aula 2.2 ────────────────────────────────────────────────────────────────
  { id: "m2a2-01", lessonId: "2.2", filename: "NIS2_Log_Incidentes_Ciberseguranca.xlsx",            label: "Log de Incidentes com Dashboard",            type: "xlsx", plan: "pro" },
  { id: "m2a2-02", lessonId: "2.2", filename: "NIS2_IRP_Plano_Resposta_Incidentes.docx",            label: "IRP — Plano de Resposta a Incidentes",       type: "docx", plan: "pro" },
  { id: "m2a2-03", lessonId: "2.2", filename: "NIS2_Checklist_Forense_Digital_EDITAVEL-rev.pdf",    label: "Checklist Forense Digital (cadeia custódia)",type: "pdf",  plan: "pro" },
  { id: "m2a2-04", lessonId: "2.2", filename: "NIS2_Guia_Comunicacao_Crise.pdf",                    label: "Guia de Comunicação de Crise",               type: "pdf",  plan: "pro" },
  { id: "m2a2-05", lessonId: "2.2", filename: "NIS2_Template_Notificacao_CNCS_EDITAVEL.pdf",        label: "Templates Notificação CNCS (3 fases)",       type: "pdf",  plan: "pro" },

  // ── Aula 2.3 ────────────────────────────────────────────────────────────────
  { id: "m2a3-01", lessonId: "2.3", filename: "NIS2_Calendario_Anual_Conformidade.xlsx",            label: "Calendário Anual de Conformidade (PDCA)",    type: "xlsx", plan: "pro" },
  { id: "m2a3-02", lessonId: "2.3", filename: "NIS2_Dossier_Conformidade_Indice_Mestre.xlsx",       label: "Dossier de Conformidade — Índice Mestre",    type: "xlsx", plan: "pro" },
  { id: "m2a3-03", lessonId: "2.3", filename: "NIS2_CAPA_Plano_Acao_Correctiva.docx",               label: "CAPA — Plano de Acção Correctiva",           type: "docx", plan: "pro" },
  { id: "m2a3-04", lessonId: "2.3", filename: "NIS2_Checklist_Auto_Auditoria_CNCS_EDITAVEL.pdf",    label: "Checklist Auto-Auditoria CNCS (34 itens)",   type: "pdf",  plan: "pro" },
  { id: "m2a3-05", lessonId: "2.3", filename: "NIS2_Resumo_Executivo_Curso_Completo.pdf",           label: "Resumo Executivo — Curso Completo",          type: "pdf",  plan: "pro" },
];

/** Lesson ID → subdirectory name */
export const LESSON_DIR: Record<string, string> = {
  "1.1": "m1-a1",
  "1.2": "m1-a2",
  "1.3": "m1-a3",
  "1.4": "m1-a4",
  "2.1": "m2-a1",
  "2.2": "m2-a2",
  "2.3": "m2-a3",
};

export function getDocById(id: string): CourseDoc | undefined {
  return DOCS_CATALOG.find((d) => d.id === id);
}

export function getDocsByLesson(lessonId: string): CourseDoc[] {
  return DOCS_CATALOG.filter((d) => d.lessonId === lessonId);
}
