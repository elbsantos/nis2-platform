/**
 * frontend/src/lib/formatMilhares.ts
 *
 * Máscara de milhares para campos de dinheiro (euros inteiros, sem cêntimos).
 * Separação estrita: o valor MASCARADO ("15.000") é só para exibição; o valor
 * PURO ("15000") é o que é guardado no estado e enviado ao backend.
 */

/** "15000" → "15.000". Ignora tudo o que não seja dígito. */
export function formatMilhares(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "15.000" → "15000" — valor puro a guardar/enviar. Ignora tudo o que não seja dígito. */
export function parseMilhares(masked: string): string {
  return masked.replace(/\D/g, "");
}

/**
 * Extrai só os dígitos INTEIROS de um valor vindo da BD, que pode ter cêntimos
 * (ex.: "990000.00", de quando o campo ainda aceitava decimal(15,2)). Descarta
 * a parte decimal em vez de a concatenar aos dígitos inteiros.
 */
export function toIntegerDigits(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const intPart = s.split(".")[0] ?? "";
  return intPart.replace(/\D/g, "");
}
