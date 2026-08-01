/**
 * frontend/src/lib/formatEuroPreview.ts
 *
 * Confirmação visual da ordem de grandeza ao escrever um valor em euros
 * (Opção C — evita o erro de "escrevi 15000 a pensar €15.000, o motor leu
 * outra coisa"). Usado no Enquadramento (VN/balanço) e no Perfil
 * (annualTurnover/annualBalance) — mesma unidade (euros), mesma UX.
 */

import { formatEuros } from "../../../backend/utils/decision-engine";

/** Devolve "= 15.000 € (≈ 15 mil euros)" ou null se o valor estiver vazio/inválido. */
export function formatEuroPreview(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw);
  if (!isFinite(n) || isNaN(n)) return null;

  const abs = Math.abs(n);
  let escala = "";
  if (abs >= 1_000_000) {
    escala = ` (≈ ${formatEuros(n / 1_000_000)} milhões de euros)`;
  } else if (abs >= 1_000) {
    escala = ` (≈ ${formatEuros(n / 1_000)} mil euros)`;
  }

  return `= ${formatEuros(n)} €${escala}`;
}
