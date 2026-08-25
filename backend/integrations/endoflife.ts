/**
 * backend/integrations/endoflife.ts
 *
 * endoflife.date API wrapper — verifica se um produto/versão detetado pelo scanner
 * já atingiu fim de suporte. Fonte externa e autoritativa, mesmo padrão do nvd.ts
 * (cache Redis, retries com backoff, falha NUNCA vira achado).
 *
 * Cache: Redis key eol:{slug}, TTL 7 dias — as datas de EOL mudam raramente.
 */

import { getRedisClient } from "../middlewares/rateLimit";

const EOL_BASE          = "https://endoflife.date/api";
const CACHE_TTL          = 7 * 24 * 60 * 60; // 7 dias
const MAX_RETRIES        = 2;
const FETCH_TIMEOUT_MS   = 8_000;

// Nomes que o scanner deteta (PortFinding.product) → slugs do endoflife.date.
// Chaves em minúsculas; mapProductToSlug faz match exato e depois por substring.
const PRODUCT_SLUG_MAP: Record<string, string> = {
  "apache":        "apache",
  "openssh":       "openssh",
  "nginx":         "nginx",
  "mysql":         "mysql",
  "php":           "php",
  "microsoft-iis": "iis",
  "iis":           "iis",
};

export function mapProductToSlug(product: string): string | null {
  const key = product.toLowerCase().trim();
  if (PRODUCT_SLUG_MAP[key]) return PRODUCT_SLUG_MAP[key];
  for (const [name, slug] of Object.entries(PRODUCT_SLUG_MAP)) {
    if (key.includes(name)) return slug;
  }
  return null;
}

export interface EolResult {
  eol:     boolean;
  eolDate: string | null;
  cycle:   string | null;
}

// Devolvido em QUALQUER cenário sem dados fiáveis — produto sem mapeamento, API
// indisponível, produto/ciclo desconhecido na base. Ausência de dados nunca é achado.
const NOT_EOL: EolResult = { eol: false, eolDate: null, cycle: null };

interface EolCycleEntry {
  cycle: string;
  eol:   string | boolean;
  latest?: string;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

async function getCached(slug: string): Promise<EolCycleEntry[] | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(`eol:${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EolCycleEntry[]) : null;
  } catch {
    return null;
  }
}

async function setCache(slug: string, data: EolCycleEntry[]): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.setEx(`eol:${slug}`, CACHE_TTL, JSON.stringify(data));
  } catch {
    // Non-fatal — sem cache, o próximo pedido tenta a API de novo.
  }
}

function jitteredBackoffMs(attempt: number): number {
  return attempt * 500 + Math.random() * 250;
}

// ---------------------------------------------------------------------------
// fetchCycles — lista de ciclos do produto, com cache e retry para erros transitórios
// ---------------------------------------------------------------------------

async function fetchCycles(slug: string): Promise<EolCycleEntry[] | null> {
  const cached = await getCached(slug);
  if (cached) return cached;

  const url = `${EOL_BASE}/${encodeURIComponent(slug)}.json`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "NIS2-Scanner/1.0 (+https://nis2.pt)" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status === 404) {
        // Produto não existe na base — erro permanente, não faz sentido repetir.
        return null;
      }

      if (!res.ok) {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, jitteredBackoffMs(attempt + 1)));
          continue;
        }
        console.warn(`[endoflife.date] ${slug} → HTTP ${res.status}`);
        return null;
      }

      const data = await res.json();
      if (!Array.isArray(data)) return null;
      await setCache(slug, data);
      return data as EolCycleEntry[];
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, jitteredBackoffMs(attempt + 1)));
        continue;
      }
      console.warn(`[endoflife.date] ${slug} indisponível:`, err instanceof Error ? err.message : err);
      return null;
    }
  }
  return null;
}

// Extrai "major.minor" de uma versão livre (ex.: "8.2p1" → "8.2", "2.4.58" → "2.4").
function extractCycle(version: string): string | null {
  const m = version.match(/^(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

// ---------------------------------------------------------------------------
// isEol — função pública
// ---------------------------------------------------------------------------

/**
 * Verifica se `produto`/`versao` (detetados pelo scanner) já atingiu fim de suporte,
 * segundo o endoflife.date. Em qualquer cenário de falha ou ausência de dados —
 * produto sem mapeamento, API indisponível, ciclo desconhecido na base — devolve
 * eol:false. NUNCA gera uma contradição a partir da ausência de dados.
 */
export async function isEol(produto: string, versao: string): Promise<EolResult> {
  try {
    const slug = mapProductToSlug(produto);
    if (!slug) return NOT_EOL;

    const cycles = await fetchCycles(slug);
    if (!cycles) return NOT_EOL;

    const cycleKey = extractCycle(versao);
    if (!cycleKey) return NOT_EOL;

    const entry = cycles.find((c) => c.cycle === cycleKey);
    if (!entry) return NOT_EOL;

    if (entry.eol === false) return { eol: false, eolDate: null, cycle: entry.cycle };
    if (entry.eol === true)  return { eol: true,  eolDate: null, cycle: entry.cycle };

    // entry.eol é uma data ISO — só conta como EOL se já passou.
    const parsed = Date.parse(entry.eol);
    if (isNaN(parsed)) return { eol: false, eolDate: null, cycle: entry.cycle };
    const isPast = parsed <= Date.now();
    return { eol: isPast, eolDate: isPast ? entry.eol : null, cycle: entry.cycle };
  } catch {
    return NOT_EOL;
  }
}
