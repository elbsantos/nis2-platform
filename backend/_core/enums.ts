/**
 * backend/_core/enums.ts
 *
 * Enums Zod partilhados entre o backend (routers/procedures) e o frontend
 * (formulários de perfil, filtros, etc.). Exportar daqui evita duplicação.
 *
 * Nota: as colunas BD são varchar — a validação de valores vive aqui, não
 * em ENUM MySQL, para não rejeitar dados legados (ver ADR-001).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Dimensão da empresa — escalões UE de PME (Art. 2.º Recomendação 2003/361/CE)
// ---------------------------------------------------------------------------

export const companySize = z.enum(["micro", "pequena", "media", "grande"]);
export type CompanySize = z.infer<typeof companySize>;

export const COMPANY_SIZE_LABEL: Record<CompanySize, string> = {
  micro:   "Micro (< 10 colaboradores, < 2 M€ VN)",
  pequena: "Pequena (10–49 colaboradores, < 10 M€ VN)",
  media:   "Média (50–249 colaboradores, < 50 M€ VN)",
  grande:  "Grande (≥ 250 colaboradores ou ≥ 50 M€ VN)",
};

// ---------------------------------------------------------------------------
// Setor — Anexos I e II da NIS2 / DL 125/2025
// ---------------------------------------------------------------------------

export const companySector = z.enum([
  // Anexo I — Setores essenciais
  "energia",
  "transportes",
  "banca",
  "mercado_financeiro",
  "saude",
  "agua_potavel",
  "aguas_residuais",
  "infraestrutura_digital",
  "gestao_tic",
  "administracao_publica",
  "espaco",
  // Anexo II — Setores importantes
  "servicos_postais",
  "gestao_residuos",
  "quimicos",
  "alimentar",
  "fabricacao_medica",
  "fabricacao_eletronica",
  "fabricacao_eletrica",
  "fabricacao_maquinaria",
  "fabricacao_veiculos",
  "fabricacao_transporte",
  "fornecedores_digitais",
  "investigacao",
  // Outros
  "outro",
]);
export type CompanySector = z.infer<typeof companySector>;

export const COMPANY_SECTOR_LABEL: Record<CompanySector, string> = {
  // Anexo I
  energia:                "Energia",
  transportes:            "Transportes",
  banca:                  "Banca",
  mercado_financeiro:     "Infraestruturas do mercado financeiro",
  saude:                  "Saúde",
  agua_potavel:           "Água potável",
  aguas_residuais:        "Águas residuais",
  infraestrutura_digital: "Infraestrutura digital",
  gestao_tic:             "Gestão de serviços de TIC (B2B)",
  administracao_publica:  "Administração pública",
  espaco:                 "Espaço",
  // Anexo II
  servicos_postais:       "Serviços postais e de estafetas",
  gestao_residuos:        "Gestão de resíduos",
  quimicos:               "Produtos químicos",
  alimentar:              "Produtos alimentares",
  fabricacao_medica:      "Fabricação — dispositivos médicos",
  fabricacao_eletronica:  "Fabricação — produtos eletrónicos e ópticos",
  fabricacao_eletrica:    "Fabricação — equipamentos elétricos",
  fabricacao_maquinaria:  "Fabricação — maquinaria e equipamentos",
  fabricacao_veiculos:    "Fabricação — veículos automóveis",
  fabricacao_transporte:  "Fabricação — outro equipamento de transporte",
  fornecedores_digitais:  "Fornecedores digitais",
  investigacao:           "Investigação",
  outro:                  "Outro / Não listado",
};

// ---------------------------------------------------------------------------
// ADR-002 — Identidade fiscal e jurisdição
// ---------------------------------------------------------------------------

export const taxIdType = z.enum(["NIPC", "NIF", "NIT", "EIN", "VAT", "OTHER"]);
export type TaxIdType = z.infer<typeof taxIdType>;

export const TAX_ID_TYPE_LABEL: Record<TaxIdType, string> = {
  NIPC:  "NIPC (Número de Identificação de Pessoa Coletiva — PT)",
  NIF:   "NIF (Número de Identificação Fiscal — PT)",
  NIT:   "NIT (Número de Identificação Tributária — BR)",
  EIN:   "EIN (Employer Identification Number — US)",
  VAT:   "VAT Number (IVA — UE)",
  OTHER: "Outro",
};

export const jurisdictionCode = z.string().length(2).toUpperCase();
export type JurisdictionCode = z.infer<typeof jurisdictionCode>;

// ---------------------------------------------------------------------------
// Estado e origem da evidência
// ---------------------------------------------------------------------------

export const evidenceStatus = z.enum([
  "missing",
  "in_progress",
  "provided",
  "verified",
  "na",
]);
export type EvidenceStatus = z.infer<typeof evidenceStatus>;

export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = {
  missing:     "Em falta",
  in_progress: "Em preparação",
  provided:    "Fornecida",
  verified:    "Verificada",
  na:          "N.A.",
};

export const evidenceSource = z.enum(["manual", "scan", "ai"]);
export type EvidenceSource = z.infer<typeof evidenceSource>;

export const EVIDENCE_SOURCE_LABEL: Record<EvidenceSource, string> = {
  manual: "Manual",
  scan:   "Scanner",
  ai:     "IA",
};
