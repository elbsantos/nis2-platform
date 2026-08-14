/**
 * server/routers/scan.router.ts
 *
 * tRPC router for NIS2 scan operations.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { freeProcedure } from "../middlewares/planGuard";
import { executeAgentlessScan, verifyOwnership, verifyOwnershipWithRootFallback, isIpAddress, buildVerificationToken } from "../services/scan-executor";
import { createScan, getScanById, getScansByOrgId, getScansByBatchId, getRecentCompletedScan, getLatestCompletedQuestionnaireForOrg } from "../db";
import { combinedNis2Scores, overallCombinedScore } from "../utils/combined-score";
import type { NIS2ArticleScore } from "../services/scan-executor";
import { getRedisClient } from "../middlewares/rateLimit";
import { isSafeTarget } from "../middlewares/security";

const SCAN_CACHE_TTL_HOURS     = parseInt(process.env.SCAN_CACHE_TTL_HOURS     ?? "24", 10);
const MAX_FORCE_RESCANS_PER_DAY = parseInt(process.env.MAX_FORCE_RESCANS_PER_DAY ?? "3",  10);

// DEMO: limite global temporário do tab "Scan em lote" (alvos livres,
// startBulk SEM rootDomain), independente do plano do utilizador. Pós-MVP,
// restaurar os limites por plano (Pro=15, MSSP=50) — requer NVD_API_KEY
// paga para suportar lotes maiores sem lentidão perceptível (o NVD tem
// throttle GLOBAL de ~1 pedido/6s sem chave, partilhado por todo o
// servidor — ver auditoria "Scan em lote", 2026-08-07).
// NÃO se aplica ao fluxo de descoberta de subdomínios (startBulk COM
// rootDomain) — esse fluxo já tem os seus próprios limites testados e
// ativados (maxSubs: 50 Pro / 200 MSSP em discoverSubdomains; 15/50 aqui
// em startBulk) e não deve ser limitado por uma decisão de demo pensada
// para o tab de alvos livres.
const DEMO_MAX_TARGETS = 3;
// DEV ONLY — ignora TODAS as camadas de cache do scan (DB + Redis Shodan/Censys/NVD).
// Nunca ligar em produção: cada scan consome créditos de API reais.
// Leitura em runtime (não constante de módulo) para que alterações ao .env
// sejam respeitadas sem reiniciar o servidor — consistente com shodan.ts,
// censys.ts e nvd.ts que já usam este padrão.
const isDevCacheDisabled = () => process.env.DEV_CACHE_DISABLED === "true";

function formatScannedAgo(completedAt: Date): string {
  const hours = Math.floor((Date.now() - completedAt.getTime()) / 3_600_000);
  if (hours < 1)  return "há menos de 1 hora";
  if (hours === 1) return "há 1 hora";
  if (hours < 24) return `há ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

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
      const token  = buildVerificationToken(ctx.org.id);
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
   * Start a new scan (free tier: 1/month, pro/mssp: unlimited).
   * Returns a cached result if a completed scan for the same target exists within
   * SCAN_CACHE_TTL_HOURS (default 24h). Pass force:true to override the cache
   * (limited to MAX_FORCE_RESCANS_PER_DAY per org).
   */
  start: freeProcedure
    .input(
      z.object({
        target: safeTarget,
        mode:  z.enum(["sme", "supply"]).default("sme"),
        force: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const ownership = await verifyOwnership(input.target, ctx.org.id);
      if (!ownership.verified) {
        const hint = isIpAddress(input.target)
          ? `Cria http://${input.target}/.well-known/nis2pt.txt com o conteúdo: ${buildVerificationToken(ctx.org.id)}`
          : `Adiciona este DNS TXT ao domínio: ${buildVerificationToken(ctx.org.id)}`;
        throw new TRPCError({ code: "FORBIDDEN", message: `Verificação de ownership falhou. ${hint}` });
      }

      // ── TTL cache — fast-path for recently scanned targets (OBJETIVO 2+4) ──
      // DEV_CACHE_DISABLED bypassa APENAS a tranca das 24h (DB).
      // A cache de dados (NVD/Shodan/Censys) é gerida independentemente em cada
      // integração e NÃO é afectada por esta flag.
      if (isDevCacheDisabled()) {
        console.warn(`[Scan] DEV_CACHE_DISABLED=true — tranca 24h ignorada para ${input.target}`);
      }

      const recentScan = isDevCacheDisabled()
        ? null   // ← bypassa a tranca das 24h: recentScan=null → linha seguinte nunca devolve cached
        : await getRecentCompletedScan(ctx.org.id, input.target, SCAN_CACHE_TTL_HOURS);

      if (recentScan && !input.force) {
        return {
          scanId:     recentScan.id,
          status:     "cached" as const,
          scannedAgo: formatScannedAgo(recentScan.completedAt!),
        };
      }

      // ── Force-rescan rate limit (ignorado em modo dev) ────────────────────
      if (!isDevCacheDisabled() && recentScan && input.force) {
        const today    = new Date().toISOString().slice(0, 10);
        const forceKey = `force-rescan:org:${ctx.org.id}:${today}`;
        try {
          const redis = await getRedisClient();
          const count = parseInt((await redis.get(forceKey)) ?? "0", 10);
          if (count >= MAX_FORCE_RESCANS_PER_DAY) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Limite de ${MAX_FORCE_RESCANS_PER_DAY} re-scans forçados por dia atingido.`,
            });
          }
          const newCount = await redis.incrBy(forceKey, 1);
          if (newCount === 1) await redis.expire(forceKey, 25 * 3600);
        } catch (err) {
          if (err instanceof TRPCError) throw err;
          // Redis unavailable — allow the force-rescan rather than blocking the user
        }

        // Invalida caches de integrações para que re-scan forçado use dados frescos.
        // Shodan resolve o IP internamente; Censys usa o target directamente.
        const { invalidateCache: invalidateShodan } = await import("../integrations/shodan");
        await invalidateShodan(input.target).catch(() => {});
        try {
          const redis = await getRedisClient();
          await redis.del(`censys:${input.target}`);
        } catch { /* Redis indisponível — scan usa dados em cache se existirem */ }
      }

      // ── Dev: invalida Redis explicitamente (defesa em profundidade) ───────
      // Com DEV_CACHE_DISABLED, recentScan=null → o bloco force-rescan acima nunca corre.
      // As integrações já ignoram a leitura do Redis, mas entradas antigas ficam.
      // Removê-las garante que ao desligar o flag não reaparecem dados obsoletos.
      if (isDevCacheDisabled()) {
        const { invalidateCache: invalidateShodan } = await import("../integrations/shodan");
        await invalidateShodan(input.target).catch(() => {});
        getRedisClient()
          .then((redis) => redis.del(`censys:${input.target}`))
          .catch(() => {});
      }

      // Create scan record
      const scan = await createScan({
        organizationId: ctx.org.id,
        target: input.target,
        mode:   input.mode,
        status: "pending",
      });

      console.log(
        `[Scan] Scan fresco iniciado — scanId=${scan.id}, target=${input.target}` +
        (isDevCacheDisabled() ? " [DEV_CACHE_DISABLED — tranca 24h ignorada]" : "")
      );

      // Monthly credit counter (OBJETIVO 5)
      const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      getRedisClient()
        .then(async (redis) => {
          const key = `scan:credits:org:${ctx.org.id}:${ym}`;
          const n   = await redis.incrBy(key, 1);
          if (n === 1) await redis.expire(key, 35 * 24 * 3600);
        })
        .catch(() => {}); // non-fatal

      // Start scan async (non-blocking)
      executeAgentlessScan({
        scanId:         scan.id,
        organizationId: ctx.org.id,
        target:         input.target,
        mode:           input.mode,
      }).catch((err) => {
        console.error(`[Scan ${scan.id}] Async execution error:`, err);
      });

      return { scanId: scan.id, status: "started" as const };
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
  stats: freeProcedure.query(async ({ ctx }) => {
    const { getOrgScanStats } = await import("../db");
    return getOrgScanStats(ctx.org.id);
  }),

  /**
   * Discover subdomains via CT logs + wordlist (Pro/MSSP only).
   * Verifies root domain ownership before discovery.
   */
  discoverSubdomains: freeProcedure
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
          message: `Verifica primeiro o ownership do domínio ${input.domain} (DNS TXT: ${buildVerificationToken(ctx.org.id)}).`,
        });
      }
      const maxResults = ctx.plan === "mssp" ? 200 : 50;
      const { discoverSubdomains } = await import("../integrations/subdomain-discovery");
      const subdomains = await discoverSubdomains(input.domain, maxResults);
      return { domain: input.domain, subdomains };
    }),

  /**
   * Start multiple scans in one batch.
   * SEM rootDomain (tab "Scan em lote", alvos livres): limitado a
   * DEMO_MAX_TARGETS (3), independente do plano — ver comentário na
   * constante para o porquê e o que fazer pós-MVP.
   * COM rootDomain (fluxo de descoberta de subdomínios): mantém os
   * limites por plano de sempre (Pro=15, MSSP=50) — não afetado pelo
   * limite de demo, que é especificamente do tab de alvos livres.
   * Se rootDomain for fornecido, todos os targets têm de ser subdomínios
   * dele e a ownership é herdada do raiz (verifyOwnershipWithRootFallback).
   */
  startBulk: freeProcedure
    .input(
      z.object({
        // .max(50) fica no teto do fluxo de subdomínios (o mais alto dos
        // dois), não no limite de demo (3) — o gate de 3 alvos para o tab
        // de alvos livres é aplicado no handler, abaixo, condicionado à
        // ausência de rootDomain. Reduzir isto para .max(3) partiria o
        // fluxo de subdomínios já testado e ativado.
        targets:    z.array(safeTarget).min(1).max(50),
        mode:       z.enum(["sme", "supply"]).default("sme"),
        rootDomain: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.rootDomain) {
        // Tab "Scan em lote" — alvos livres, limite de demo.
        if (input.targets.length > DEMO_MAX_TARGETS) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `O scan em lote está limitado a ${DEMO_MAX_TARGETS} alvos nesta fase.`,
          });
        }
      } else {
        // Fluxo de subdomínios — limite por plano, inalterado pela demo.
        const maxTargets = ctx.plan === "mssp" ? 50 : 15;
        if (input.targets.length > maxTargets) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `O teu plano suporta até ${maxTargets} targets por batch.`,
          });
        }
      }

      const batchId = crypto.randomUUID();
      const started: Array<{ target: string; scanId: number }> = [];
      const failed:  Array<{ target: string; reason: string  }> = [];

      // Verifica o domínio raiz uma vez à entrada — falha rápido e com
      // mensagem clara se nem o raiz estiver verificado, antes de percorrer
      // os targets todos. A verificação por-target (com herança) usa a
      // mesma fonte única de verdade logo a seguir.
      if (input.rootDomain) {
        const rootOk = await verifyOwnership(input.rootDomain, ctx.org.id);
        if (!rootOk.verified) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Ownership do domínio raiz ${input.rootDomain} não verificado.`,
          });
        }
      }

      for (const target of input.targets) {
        const ownership = await verifyOwnershipWithRootFallback(target, ctx.org.id, input.rootDomain);
        if (!ownership.verified) {
          failed.push({
            target,
            reason: `Ownership não verificado. Adiciona DNS TXT: ${buildVerificationToken(ctx.org.id)}`,
          });
          continue;
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
            // Propaga o raiz para o executor poder herdar a mesma ownership
            // já validada aqui, em vez de re-exigir um TXT no subdomínio.
            rootDomain: input.rootDomain,
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

  /**
   * Score combinado (scan + questionário) para o gráfico "Score NIS2 por Artigo".
   * Fonte única: combinedNis2Scores() de backend/utils/combined-score.ts.
   * Consumido pelo ecrã (ScanResults) e pelos PDFs (pdf-report-generator).
   */
  combinedArticleScores: freeProcedure
    .input(z.object({ scanId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const scan = await getScanById(input.scanId);
      if (!scan) throw new TRPCError({ code: "NOT_FOUND", message: "Scan não encontrado" });
      if (scan.organizationId !== ctx.org.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }

      const nis2Scores = ((scan.results as any)?.nis2Scores ?? []) as NIS2ArticleScore[];
      const qSession   = await getLatestCompletedQuestionnaireForOrg(ctx.org.id);
      const qScores    = (qSession?.articleScores as Record<string, number> | null) ?? null;

      const combined      = combinedNis2Scores(nis2Scores, qScores);
      const scanOverall   = (scan.results as any)?.overallScore as number ?? 0;
      const overallCombined = qScores !== null ? overallCombinedScore(combined) : scanOverall;

      return {
        combined,
        overallCombined,
        hasQuestionnaire: qScores !== null,
        questionnaireCompletedAt: qSession?.completedAt ?? null,
      };
    }),
};
