import { useState, type ReactNode } from "react";

/** Nota de ajuda COLAPSÁVEL, fechada por omissão. Substitui o padrão do
 *  ExplainerPanel sempre aberto, que dominava o topo de cada página. */
export function InfoNote({
  label = "O que é isto?",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 text-[13px] text-dim border border-line rounded-full px-3 py-1.5 hover:text-text hover:border-accent transition-colors"
      >
        {label}
      </button>
      {open && (
        <div className="mt-3 border border-line bg-surface rounded-[12px] p-4 text-[13px] text-dim max-w-[70ch]">
          {children}
        </div>
      )}
    </div>
  );
}
