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
import { SECTOR_OPTIONS, SIZE_OPTIONS, TAX_ID_TYPE_OPTIONS } from "../utils/org-options";

export { SECTOR_OPTIONS, SIZE_OPTIONS, TAX_ID_TYPE_OPTIONS };

// ---------------------------------------------------------------------------
// Schema de validação do input
// ---------------------------------------------------------------------------

const PT_NIF_RE = /^\d{9}$/;

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
}).refine(
  (data) => {
    if (!data.taxId) return true;
    if (data.taxIdType === "NIPC" || data.taxIdType === "NIF") {
      return PT_NIF_RE.test(data.taxId);
    }
    return true;
  },
  { message: "NIF/NIPC português deve ter exactamente 9 dígitos", path: ["taxId"] },
);

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
