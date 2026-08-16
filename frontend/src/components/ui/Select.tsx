import type { SelectHTMLAttributes, ReactNode } from "react";

/** Select tokenizado (escuro), a par do Input. A seta usa a cor do texto do sistema.
 *  Passar as <option> como children. */
export function Select({
  children,
  className = "",
  ...rest
}: {
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={
        "w-full px-4 py-3 rounded-xl text-sm bg-field border border-line text-text " +
        "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-colors " +
        "appearance-none bg-no-repeat " + className
      }
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238a99b4' stroke-width='2'><path d='M6 9l6 6 6-6'/></svg>\")",
        backgroundPosition: "right 12px center",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}
