/**
 * frontend/src/lib/featureFlags.ts
 *
 * Flags de funcionalidade — só para esconder/mostrar UI já existente,
 * nunca para reescrever texto. Reversível: mudar o valor e voltar a
 * fazer build repõe o estado anterior, sem tocar em mais nada.
 */

// DEMO: esconde planos/preços em toda a app (landing, /billing, sidebar,
// upsells de plano Free) sem apagar nenhum conteúdo — só envolve em
// condicionais. Reativar depois da demo: mudar para `true`.
export const ENABLE_PRICING = false;

// DEMO: esconde a tab "Scan em lote" no Scanner (mantém Scan único + Subdomínios).
// A lógica de bulk continua ativa — é usada internamente pela descoberta de subdomínios.
// Reativar depois da demo: mudar para `true`.
export const ENABLE_BATCH_SCAN = false;
