import type { ReactNode } from "react";

/** Cartão base do sistema CISPLAN. Fundo `surface`, borda `line`, raio de cartão.
 *  Substitui os `const CARD` locais e o hex cru espalhado. */
export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "aside";
}) {
  return (
    <Tag className={`bg-surface border border-line rounded-[12px] ${className}`}>
      {children}
    </Tag>
  );
}
