import type { LucideIcon } from "lucide-react";

/** Wrapper fino para uniformizar tamanho e traço de todos os ícones lucide. */
export function Icon({
  as: Cmp,
  size = 17,
  className = "",
}: {
  as: LucideIcon;
  size?: number;
  className?: string;
}) {
  return <Cmp size={size} strokeWidth={1.7} className={className} aria-hidden="true" />;
}
