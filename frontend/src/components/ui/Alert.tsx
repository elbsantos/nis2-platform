import type { ReactNode } from "react";

type Tone = "ok" | "bad" | "warn" | "info";

/** Bloco de mensagem inline (erro/sucesso/aviso). Cor = só estado.
 *  Distinto do Badge (etiqueta curta): este é um bloco p-3 para mensagens. */
export function Alert({
  children,
  tone = "info",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const styles: Record<Tone, string> = {
    ok:   "bg-ok/10 border-ok/30 text-ok",
    bad:  "bg-bad/10 border-bad/30 text-bad",
    warn: "bg-warn/10 border-warn/30 text-warn",
    info: "bg-accent/10 border-accent/30 text-accent",
  };
  return (
    <div className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${styles[tone]} ${className}`}>
      {children}
    </div>
  );
}
