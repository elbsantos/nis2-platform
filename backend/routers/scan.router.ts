/**
 * server/routers/scan.router.ts
 *
 * tRPC router for NIS2 scan operations.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { freeProcedure, proProcedure } from "../middlewares/planGuard";
import { executeAgentlessScan, verifyOwnership, isIpAddress } from "../services/scan-executor";
import { createScan, getScanById, getScansByOrgId, getScansByBatchId } from "../db";
import { checkScanLimit } from "../middlewares/planGuard";
import { isSafeTarget } from "../middlewares/security";

// Strip protocol, path, port and whitespace — accept "https://example.com/path" as "example.com"
function normaliseTarget(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")  // remove http:// or https://
    .split("/")[0]                 // remove path
    .split("?")[0]                 // remove query string
    .split("#")[0]                 // remove fragment
    .replace(/:(\d+)$/, "");       // remove port (:443, :8080, etc.)
}

// Zod: normalise first, then reject private/internal targets
const safeTarget = z.string().min(1)
  .transform(normaliseTarget)
  .refine(isSafeTarget, {
    message: "Target inválido: apenas domínios públicos são permitidos.",
  });

export const scanRouter = {
  /**
   * Verify target ownership before allowing scan.
   * Domains → DNS TXT record.  Public IPs → HTTP .well-known file.
   */
  verifyOwnership: freeProcedure
    .input(z.object({ domain: safeTarget }))
    .mutation(async ({ ctx, input }) => {
      const isIp  = isIpAddress(input.domain);
      const result = await verifyOwnership(input.domain, ctx.org.id);
      const token  = `nis2pt-verify=${ctx.org.id}`;
      return {
        verified: result.verified,
        method:   result.method,
        isIp,
        token,
        // Convenience fields for the frontend
        dnsName:    isIp ? null  : input.domain,
        wellKnownUrl: isIp ? `http://${input.domain}/.well-known/nis2pt.txt` : null,
      };
    }),

  /**
   * Start a new scan (free tier: 1/month, pro/mssp: unlimited)
   */
  start: freeProcedure
    .input(
      z.object({
        target: safeTarget,
        mode: z.enum(["sme", "supply"]).default("sme"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check scan limit
      const limitCheck = await checkScanLimit(ctx.org.id, ctx.plan);
      if (!limitCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: limitCheck.reason ?? "Scan limit reached",
        });
      }

      // Verify ownership
      const ownership = await verifyOwnership(input.target, ctx.org.id);
      if (!ownership.verified) {
        const hint = isIpAddress(input.target)
          ? `Cria http://${input.target}/.well-known/nis2pt.txt com o conteúdo: nis2pt-verify=${ctx.org.id}`
          : `Adiciona este DNS TXT ao domínio: nis2pt-verify=${ctx.org.id}`;
        throw new TRPCError({ code: "FORBIDDEN", message: `Verificação de ownership falhou. ${hint}` });
      }

      // Create scan record
      const scan = await createScan({
        organizationId: ctx.org.id,
        target: input.target,
        mode: input.mode,
        status: "pending",
      });

      // Start scan async (non-blocking)
      executeAgentlessScan({
        scanId: scan.id,
        organizationId: ctx.org.id,
        target: input.target,
        mode: input.mode,
      }).catch((err) => {
        console.error(`[Scan ${scan.id}] Async execution error:`, err);
      });

      return { scanId: scan.id, status: "started" };
    }),

  /**
   * Get scan results by ID
   */
  getById: freeProcedure
    .input(z.object({ scanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const scan = await getScanById(input.scanId);

      if (!scan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan não encontrado" });
      }

      if (scan.organizationId !== ctx.org.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sem permissão para aceder a este scan",
        });
      }

      return scan;
    }),

  /**
   * List all scans for the org
   */
  list: freeProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).default(10),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const scans = await getScansByOrgId(
        ctx.org.id,
        input?.limit ?? 10,
        input?.offset ?? 0
      );
      return scans;
    }),

  /**
   * Get scan statistics (Pro only)
   */
  stats: proProcedure.query(async ({ ctx }) => {
    const { getOrgScanStats } = await import("../db");
    return getOrgScanStats(ctx.org.id);
  }),

  /**
   * Discover subdomains via CT logs + wordlist (Pro/MSSP only).
   * Verifies root domain ownership before discovery.
   */
  discoverSubdomains: proProcedure
    .input(z.object({ domain: safeTarget }))
    .mutation(async ({ ctx, input }) => {
      if (isIpAddress(input.domain)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Descoberta de subdomínios requer um domínio, não um IP.",
        });
      }
      const ownership = await verifyOwnership(input.domain, ctx.org.id);
      if (!ownership.verified) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Verifica primeiro o ownership do domínio ${input.domain} (DNS TXT: nis2pt-verify=${ctx.org.id}).`,
        });
      }
      const maxResults = ctx.plan === "mssp" ? 200 : 50;
      const { discoverSubdomains } = await import("../integrations/subdomain-discovery");
      const subdomains = await discoverSubdomains(input.domain, maxResults);
      return { domain: input.domain, subdomains };
    }),

  /**
   * Start multiple scans in one batch (Pro: up to 10, MSSP: up to 50).
   * If rootDomain is provided, all targets must be subdomains of it and
   * ownership is verified on the root only.
   */
  startBulk: proProcedure
    .input(
      z.object({
        targets:    z.array(safeTarget).min(1).max(50),
        mode:       z.enum(["sme", "supply"]).default("sme"),
        rootDomain: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const maxTargets = ctx.plan === "mssp" ? 50 : 15;
      if (input.targets.length > maxTargets) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `O teu plano suporta até ${maxTargets} targets por batch.`,
        });
      }

      const batchId = crypto.randomUUID();
      const started: Array<{ target: string; scanId: number }> = [];
      const failed:  Array<{ target: string; reason: string  }> = [];

      // Verify root domain once for the subdomain-discovery flow
      let rootVerified = false;
      if (input.rootDomain) {
        const rootOk = await verifyOwnership(input.rootDomain, ctx.org.id);
        rootVerified = rootOk.verified;
        if (!rootVerified) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Ownership do domínio raiz ${input.rootDomain} não verificado.`,
          });
        }
      }

      for (const target of input.targets) {
        // Skip per-target verification only for confirmed subdomains of the verified root
        const isSubOfRoot =
          rootVerified &&
          input.rootDomain &&
          (target === input.rootDomain || target.endsWith(`.${input.rootDomain}`));

        if (!isSubOfRoot) {
          const ownership = await verifyOwnership(target, ctx.org.id);
          if (!ownership.verified) {
            failed.push({
              target,
              reason: `Ownership não verificado. Adiciona DNS TXT: nis2pt-verify=${ctx.org.id}`,
            });
            continue;
          }
        }

        const scan = await createScan({
          organizationId: ctx.org.id,
          target,
          mode: input.mode,
          status: "pending",
          batchId,
        });
        started.push({ target, scanId: scan.id });
      }

      if (!started.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Nenhum target com ownership verificado. Configura os DNS TXT records.",
        });
      }

      // Start scans async with 3 s stagger to avoid Shodan rate limiting
      started.forEach(({ target, scanId }, i) => {
        setTimeout(() => {
          executeAgentlessScan({
            scanId,
            organizationId: ctx.org.id,
            target,
            mode: input.mode,
          }).catch((err) => console.error(`[Bulk scan ${scanId}] Error:`, err));
        }, i * 3_000);
      });

      return { batchId, started, failed, count: started.length };
    }),

  /**
   * Get all scans belonging to a batch
   */
  getBatch: freeProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getScansByBatchId(ctx.org.id, input.batchId);
    }),
};
