export type AnswerValue = "yes" | "partial" | "no" | "na";

type Tone = "ok" | "warn" | "bad" | "neutral";

/** Fonte única: nível de conformidade de uma resposta → tom semântico do sistema. */
export const answerTone: Record<AnswerValue, Tone> = {
  yes: "ok",
  partial: "warn",
  no: "bad",
  na: "neutral",
};

export const answerLabel: Record<AnswerValue, string> = {
  yes: "Sim",
  partial: "Parcialmente",
  no: "Não",
  na: "N.A.",
};

/** Classes para o botão SELECIONADO (fundo/borda/texto por tom). */
export const answerSelectedClasses: Record<Tone, string> = {
  ok:      "border-ok/50 bg-ok/15 text-ok",
  warn:    "border-warn/50 bg-warn/15 text-warn",
  bad:     "border-bad/50 bg-bad/15 text-bad",
  neutral: "border-line bg-surface-2 text-text",
};

/** Classe do botão NÃO selecionado (igual para os 4). */
export const answerIdleClasses = "border-line text-dim hover:border-accent/50";
