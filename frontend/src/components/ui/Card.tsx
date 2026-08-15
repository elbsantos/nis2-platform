import type { ReactNode, HTMLAttributes, KeyboardEvent } from "react";

/** Cartão base do sistema CISPLAN. Fundo `surface`, borda `line`, raio de cartão.
 *  Se receber onClick, torna-se clicável e acessível por teclado (role/tabIndex/Enter/Espaço). */
export function Card({
  children,
  className = "",
  as: Tag = "div",
  onClick,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "aside";
} & HTMLAttributes<HTMLElement>) {
  const clickable = typeof onClick === "function";

  const handleKey = clickable
    ? (e: KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (onClick as (ev: unknown) => void)(e);
        }
      }
    : undefined;

  return (
    <Tag
      className={`bg-surface border border-line rounded-[12px] ${clickable ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={handleKey}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
