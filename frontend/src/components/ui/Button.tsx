import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

/** Botão do sistema. `primary` = acento; `ghost` = contorno; `danger` = destrutivo.
 *  Um só acento em toda a app — sem dourado/teal. */
export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: Variant;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium text-sm px-4 py-2.5 rounded-[8px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-accent-ink hover:brightness-110",
    ghost: "border border-line text-text hover:border-accent",
    danger: "bg-bad text-white hover:brightness-110",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
