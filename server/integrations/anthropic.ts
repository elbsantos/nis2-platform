/**
 * server/integrations/anthropic.ts
 *
 * Thin wrapper around the Anthropic Messages API.
 * Supports both streaming (for the questionnaire UI) and
 * non-streaming (for async remediation plan generation).
 *
 * Model: claude-sonnet-4-6  (set in ENV, easy to change)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

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
}

export interface StreamOptions extends ChatOptions {
  onChunk: (text: string) => void;
  onDone?: (fullText: string) => void;
}

// ---------------------------------------------------------------------------
// Non-streaming — for background jobs (remediation plans, PDF summaries)
// ---------------------------------------------------------------------------

export async function chat(opts: ChatOptions): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    system: opts.system,
    messages: opts.messages,
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("[Anthropic] Unexpected content type");
  return block.text;
}

// ---------------------------------------------------------------------------
// Streaming — for real-time questionnaire responses
// Used with tRPC observable or SSE endpoint
// ---------------------------------------------------------------------------

export async function streamChat(opts: StreamOptions): Promise<void> {
  const client = getClient();
  let fullText = "";

  const stream = await client.messages.stream({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    system: opts.system,
    messages: opts.messages,
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
