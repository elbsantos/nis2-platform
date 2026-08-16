type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

// Estado do plano
export const statusTone: Record<string, Tone> = {
  todo: "bad", in_progress: "info", done: "ok", wont_fix: "neutral",
};
export const statusLabel: Record<string, string> = {
  todo: "Por fazer", in_progress: "Em curso", done: "Concluído", wont_fix: "Não corrigir",
};

// Severidade — usa os tokens sev-* do sistema (classes de cor de texto/fundo)
export const sevClasses: Record<string, string> = {
  critical: "text-sev-critica border-sev-critica/40 bg-sev-critica/10",
  high:     "text-sev-alta border-sev-alta/40 bg-sev-alta/10",
  medium:   "text-sev-media border-sev-media/40 bg-sev-media/10",
  low:      "text-sev-baixa border-sev-baixa/40 bg-sev-baixa/10",
};
export const sevLabel: Record<string, string> = {
  critical: "Crítica",
  high:     "Alta",
  medium:   "Média",
  low:      "Baixa",
};

// Severidade — variante para FUNDO DE CARTÃO (suave) e para BADGE/PILL (mais forte).
export const sevCardClass: Record<string, string> = {
  critical: "bg-sev-critica/10 border-sev-critica/30",
  high:     "bg-sev-alta/10 border-sev-alta/30",
  medium:   "bg-sev-media/10 border-sev-media/30",
  low:      "bg-sev-baixa/10 border-sev-baixa/30",
};
export const sevBadgeClass: Record<string, string> = {
  critical: "bg-sev-critica/20 text-sev-critica border border-sev-critica/40",
  high:     "bg-sev-alta/20 text-sev-alta border border-sev-alta/40",
  medium:   "bg-sev-media/20 text-sev-media border border-sev-media/40",
  low:      "bg-sev-baixa/20 text-sev-baixa border border-sev-baixa/40",
};

// Esforço — tom contido (não é severidade)
export const effortTone: Record<string, Tone> = {
  low: "ok", medium: "warn", high: "bad",
};
export const effortLabel: Record<string, string> = {
  low: "Baixo", medium: "Médio", high: "Alto",
};

// Modo do scan (PME / Supply Chain) — metadado, não estado nem severidade
export const modeTone: Record<string, Tone> = {
  sme: "warn", supply: "info",
};
export const modeLabel: Record<string, string> = {
  sme: "PME", supply: "Supply Chain",
};

// Classes de tom genéricas — usadas onde o markup existente ainda não foi
// convertido para <Badge> (ver R1: fonte única primeiro, markup final no R2).
export const toneClasses: Record<Tone, string> = {
  ok:      "bg-ok/15 text-ok border border-ok/40",
  warn:    "bg-warn/15 text-warn border border-warn/40",
  bad:     "bg-bad/15 text-bad border border-bad/40",
  info:    "bg-accent/15 text-accent border border-accent/40",
  neutral: "bg-surface-2 text-dim border border-line",
};
