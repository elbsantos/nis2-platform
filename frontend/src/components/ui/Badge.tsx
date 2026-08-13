import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

/** Etiqueta de ESTADO (verificado/pendente/severidade). Cores só semânticas. */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const styles: Record<Tone, string> = {
    ok: "text-ok border-ok/40 bg-ok/10",
    warn: "text-warn border-warn/40 bg-warn/10",
    bad: "text-bad border-bad/40 bg-bad/10",
    info: "text-accent border-accent/40 bg-accent/10",
    neutral: "text-dim border-line bg-surface-2",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${styles[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
