/**
 * backend/routers/organization.router.ts
 *
 * Perfil da Entidade — leitura e escrita dos campos de identidade da org.
 * Ambos os endpoints são scoped a ctx.org.id (nunca altera outra org).
 */

import { z } from "zod";
import { router } from "../_core/trpc";
import { freeProcedure } from "../middlewares/planGuard";
import { getOrgProfile, updateOrgProfile } from "../db";

// ---------------------------------------------------------------------------
// Listas canónicas (reutilizadas pelo frontend para dropdowns)
// ---------------------------------------------------------------------------

export const SECTOR_OPTIONS = [
  { value: "tld_dns_confianca",    label: "Registos TLD, DNS autoritativos ou Serviços de Confiança Qualificados" },
  { value: "telecom",              label: "Redes ou serviços de comunicações eletrónicas acessíveis ao público" },
  { value: "cloud_ixp_datacenter", label: "Cloud computing, centros de dados, CDN ou IXP" },
  { value: "gestao_tic",           label: "Gestão de serviços TIC B2B (MSP / MSSP)" },
  { value: "energia",              label: "Energia (eletricidade, gás, petróleo, hidrogénio)" },
  { value: "transportes",          label: "Transportes (aéreo, ferroviário, aquático, rodoviário)" },
  { value: "banca_financeiro",     label: "Banca ou infraestruturas de mercados financeiros" },
  { value: "saude",                label: "Saúde (prestadores, laboratórios, I&D, farmácias)" },
  { value: "agua",                 label: "Água potável e/ou residual" },
  { value: "espaco",               label: "Espaço (operadores de infraestruturas terrestres)" },
  { value: "postais_residuos",     label: "Serviços postais/estafetas ou gestão de resíduos" },
  { value: "quimicos_alimentar",   label: "Químicos ou setor alimentar (distribuição a grande escala)" },
  { value: "industria",            label: "Indústria e manufatura (dispositivos médicos, equipamentos, veículos)" },
  { value: "digital_b2c",          label: "Mercados online, motores de busca ou redes sociais" },
  { value: "admin_publica",        label: "Administração Pública" },
  { value: "outro",                label: "Outro setor" },
] as const;

export const SIZE_OPTIONS = [
  { value: "micro",   label: "Micro (< 10 trabalhadores)" },
  { value: "pequena", label: "Pequena (10–49 trabalhadores)" },
  { value: "media",   label: "Média (50–249 trabalhadores)" },
  { value: "grande",  label: "Grande (≥ 250 trabalhadores)" },
] as const;

export const TAX_ID_TYPE_OPTIONS = [
  { value: "NIPC",  label: "NIPC (Portugal — empresas)" },
  { value: "NIF",   label: "NIF (Portugal — singulares)" },
  { value: "NIT",   label: "NIT (Brasil)" },
  { value: "EIN",   label: "EIN (EUA)" },
  { value: "VAT",   label: "VAT / IVA (UE)" },
  { value: "OTHER", label: "Outro" },
] as const;

// ---------------------------------------------------------------------------
// Schema de validação do input
// ---------------------------------------------------------------------------

const updateProfileInput = z.object({
  legalName:            z.string().max(255).trim().optional().nullable(),
  taxId:                z.string().max(20).trim().optional().nullable(),
  taxIdType:            z.enum(["NIPC", "NIF", "NIT", "EIN", "VAT", "OTHER"]).optional().nullable(),
  address:              z.string().max(500).trim().optional().nullable(),
  sector:               z.string().max(100).optional().nullable(),
  size:                 z.string().max(50).optional().nullable(),
  contactPhone:         z.string().max(50).trim().optional().nullable(),
  securityOfficerName:  z.string().max(255).trim().optional().nullable(),
  securityOfficerEmail: z.string().email().max(255).trim().optional().or(z.literal("")).nullable(),
  legalRepresentative:  z.string().max(255).trim().optional().nullable(),
  jurisdiction:         z.string().length(2).toUpperCase().optional().nullable(),
  domain:               z.string().max(255).trim().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const organizationRouter = router({
  getProfile: freeProcedure
    .query(async ({ ctx }) => {
      return getOrgProfile(ctx.org.id);
    }),

  updateProfile: freeProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      await updateOrgProfile(ctx.org.id, input);
      return { ok: true };
    }),
});
