/**
 * backend/utils/money-format.ts
 *
 * Formatação monetária partilhada por TODOS os geradores de documentos
 * (Carta CISO, Registo CNCS, PSI, Relatório de Enquadramento, futuros).
 * Formato português completo: separador de milhar ".", decimal "," (2 casas),
 * símbolo "€" no fim. Determinístico — não usa toLocaleString (o ICU do Node
 * pode devolver separadores inesperados, ex.: espaço não-quebrável em vez de
 * ponto, já confirmado noutro contexto neste projeto).
 */

/**
 * "15000.00" / "15000" / 15000 → "15.000,00 €".
 * null/undefined/vazio/inválido → placeholder (default "[A PREENCHER]").
 */
export function formatMoedaEuro(
  valor: string | number | null | undefined,
  placeholder = "[A PREENCHER]",
): string {
  if (valor === null || valor === undefined) return placeholder;
  const s = String(valor).trim();
  if (s === "" || s === "None" || s === "null" || s === "undefined") return placeholder;

  const n = Number(s);
  if (!isFinite(n) || Number.isNaN(n)) return placeholder;

  const sign = n < 0 ? "-" : "";
  const [intPartRaw, decPartRaw] = Math.abs(n).toFixed(2).split(".");
  const intPart = intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${sign}${intPart},${decPartRaw} €`;
}
