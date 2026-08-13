import type { ReactNode } from "react";

/** Cabeçalho de página: eyebrow (mono, acento) + título + descrição. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        {eyebrow && (
          <p className="font-mono text-[11px] tracking-[0.16em] text-accent mb-1.5 uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold text-text">{title}</h1>
        {description && <p className="text-dim mt-1 max-w-[62ch]">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
