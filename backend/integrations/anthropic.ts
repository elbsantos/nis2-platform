/**
 * server/integrations/anthropic.ts
 *
 * Thin wrapper around the Anthropic Messages API.
 * Supports both streaming (for the questionnaire UI) and
 * non-streaming (for async remediation plan generation).
 *
 * Model: claude-sonnet-4-6  (set in ENV, easy to change)
 *
 * Cost protections:
 *   1. AI_ENABLED=false disables all AI calls (feature flag)
 *   2. Per-org monthly token budget tracked in Redis
 *      Pro: 50 000 tokens/month  |  MSSP: 200 000 tokens/month
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getRedisClient } from "../middlewares/rateLimit";

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("[Anthropic] ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatOptions {
  system: string;
  messages: MessageParam[];
  maxTokens?: number;
  temperature?: number;
  /** Pass to enable per-org token budget enforcement */
  orgId?: number;
  /** "free" | "pro" | "mssp" — determines monthly token limit */
  plan?: string;
}

export interface StreamOptions extends ChatOptions {
  onChunk: (text: string) => void;
  onDone?: (fullText: string) => void;
}

// ---------------------------------------------------------------------------
// Cost protection 2 — per-org monthly token budget (Redis)
// ---------------------------------------------------------------------------

const TOKEN_LIMITS: Record<string, number> = {
  pro:  75_000,
  mssp: 300_000,
  // enterprise: sem limite — não está neste mapa intencionalmente
};

function tokenKey(orgId: number): string {
  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `ai:tokens:org:${orgId}:${ym}`;
}

async function checkTokenBudget(orgId: number, plan: string): Promise<void> {
  const limit = TOKEN_LIMITS[plan];
  if (!limit) return; // mssp or unknown — no hard cap

  try {
    const redis   = await getRedisClient();
    const current = await redis.get(tokenKey(orgId));
    if (current && parseInt(current, 10) >= limit) {
      throw new Error(
        `[Anthropic] Limite mensal de ${limit.toLocaleString()} tokens atingido ` +
        `(org ${orgId}, plano ${plan}). Aguarda o início do próximo mês.`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("[Anthropic] Limite")) throw err;
    // Redis unavailable — log and allow the call rather than blocking the user
    console.warn("[Anthropic] Redis indisponível — verificação de tokens ignorada:", (err as Error).message);
  }
}

async function recordTokenUsage(orgId: number, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  try {
    const redis  = await getRedisClient();
    const key    = tokenKey(orgId);
    const result = await redis.incrBy(key, tokens);
    if (result === tokens) {
      // First write this month — set TTL of 35 days so it auto-expires
      await redis.expire(key, 35 * 24 * 60 * 60);
    }
  } catch (err) {
    console.warn("[Anthropic] Redis indisponível — uso de tokens não registado:", (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Non-streaming — for background jobs (remediation plans, PDF summaries)
// ---------------------------------------------------------------------------

export async function chat(opts: ChatOptions): Promise<string> {
  // Protection 3: AI feature flag
  if (process.env.AI_ENABLED === "false") {
    throw new Error("[Anthropic] Funcionalidades AI desactivadas (AI_ENABLED=false)");
  }

  // Protection 2: check token budget before the API call
  if (opts.orgId !== undefined && opts.plan) {
    await checkTokenBudget(opts.orgId, opts.plan);
  }

  const client = getClient();

  const response = await client.messages.create({
    model:       process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    max_tokens:  opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    system:      opts.system,
    messages:    opts.messages,
  });

  // Protection 2: record actual token usage
  if (opts.orgId !== undefined) {
    const used = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);
    await recordTokenUsage(opts.orgId, used);
  }

  const block = response.content[0];
  if (block.type !== "text") throw new Error("[Anthropic] Unexpected content type");
  return block.text;
}

// ---------------------------------------------------------------------------
// Streaming — for real-time questionnaire responses
// Used with tRPC observable or SSE endpoint
// ---------------------------------------------------------------------------

export async function streamChat(opts: StreamOptions): Promise<void> {
  // Protection 3: AI feature flag
  if (process.env.AI_ENABLED === "false") {
    throw new Error("[Anthropic] Funcionalidades AI desactivadas (AI_ENABLED=false)");
  }

  // Protection 2: check token budget before the API call
  if (opts.orgId !== undefined && opts.plan) {
    await checkTokenBudget(opts.orgId, opts.plan);
  }

  const client = getClient();
  let fullText = "";

  const stream = client.messages.stream({
    model:       process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    max_tokens:  opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    system:      opts.system,
    messages:    opts.messages,
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      opts.onChunk(chunk.delta.text);
      fullText += chunk.delta.text;
    }
  }

  // Protection 2: record actual token usage from the final streamed message
  if (opts.orgId !== undefined) {
    try {
      const finalMsg = await stream.finalMessage();
      const used = (finalMsg.usage.input_tokens ?? 0) + (finalMsg.usage.output_tokens ?? 0);
      await recordTokenUsage(opts.orgId, used);
    } catch {
      // Non-fatal — stream already completed
    }
  }

  opts.onDone?.(fullText);
}

// ---------------------------------------------------------------------------
// Pre-built system prompts
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPTS = {
  /**
   * NIS2 questionnaire guide — explains controls to non-technical PME managers
   */
  questionnaireGuide: `És um especialista em cibersegurança e conformidade NIS2 a ajudar
PMEs portuguesas. O teu papel é explicar cada controlo da Directiva NIS2 (EU 2022/2555)
em linguagem clara, sem jargão técnico, adaptada ao sector e dimensão da empresa.

Regras:
- Responde sempre em Português Europeu (Portugal)
- Usa exemplos concretos do contexto da empresa quando disponíveis
- Para cada pergunta, explica o porquê do controlo existir e o impacto prático
- Mantém respostas concisas (máx. 3 parágrafos)
- Nunca inventes requisitos — baseia-te exclusivamente na NIS2 e nas orientações do CNCS`,

  /**
   * Remediation plan generator — produces step-by-step guides per CVE/finding
   */
  remediationPlanner: `És um engenheiro de segurança sénior a criar planos de remediação
para PMEs portuguesas sem equipa de IT dedicada.

Para cada vulnerabilidade ou não-conformidade, produz:
1. Explicação simples do risco (1–2 frases)
2. Passos de correcção numerados e concretos (com comandos quando aplicável)
3. Plataformas cobertas: Windows, Linux/Ubuntu, macOS, cloud (Azure/AWS)
4. Estimativa de esforço: Baixo (< 1h) / Médio (1–4h) / Alto (> 4h)
5. Artigo NIS2 relevante

Responde SEMPRE em Português Europeu. Usa linguagem técnica mas acessível.
NÃO inventas soluções — se não há solução clara, diz-o explicitamente.`,

  /**
   * Executive report summary — translates technical findings to business language
   */
  executiveSummary: `És um CISO virtual a apresentar resultados de conformidade NIS2
ao conselho de administração de uma PME portuguesa.

Transforma dados técnicos de scan em linguagem de negócio:
- Foca no impacto financeiro e reputacional
- Usa o contexto legal NIS2/CNCS português
- Quantifica riscos em termos de coimas possíveis (Art. 34 NIS2: até €10M ou 2% volume negócios)
- Recomenda 3 prioridades máximas
- Tom: profissional, directo, sem alarmar desnecessariamente`,
} as const;
