import { describe, expect, it } from "vitest";
import { formatMilhares, parseMilhares, toIntegerDigits } from "./formatMilhares";

describe("formatMilhares", () => {
  it("insere separador de milhar a cada 3 dígitos", () => {
    expect(formatMilhares("15000")).toBe("15.000");
    expect(formatMilhares("1500000")).toBe("1.500.000");
    expect(formatMilhares("990000")).toBe("990.000");
    expect(formatMilhares("500")).toBe("500");
    expect(formatMilhares("1")).toBe("1");
  });

  it("string vazia devolve string vazia", () => {
    expect(formatMilhares("")).toBe("");
  });

  it("ignora tudo o que não seja dígito (defesa contra input inesperado)", () => {
    expect(formatMilhares("15.000")).toBe("15.000"); // já mascarado — idempotente
    expect(formatMilhares("15a000")).toBe("15.000");
    expect(formatMilhares("abc")).toBe("");
  });
});

describe("parseMilhares", () => {
  it("remove os separadores de milhar, devolvendo o valor puro", () => {
    expect(parseMilhares("15.000")).toBe("15000");
    expect(parseMilhares("1.500.000")).toBe("1500000");
  });

  it("string vazia devolve string vazia", () => {
    expect(parseMilhares("")).toBe("");
  });

  it("já puro (sem pontos) mantém-se inalterado", () => {
    expect(parseMilhares("15000")).toBe("15000");
  });

  it("round-trip: formatMilhares(parseMilhares(x)) === formatMilhares(x)", () => {
    const masked = "1.234.567";
    expect(formatMilhares(parseMilhares(masked))).toBe(masked);
  });
});

describe("toIntegerDigits", () => {
  it("descarta a parte decimal em vez de a concatenar (regressão do bug de cêntimos)", () => {
    // "990000.00" tem de dar "990000", NUNCA "99000000" (concatenar ".00" seria 100x maior)
    expect(toIntegerDigits("990000.00")).toBe("990000");
    expect(toIntegerDigits("430000.00")).toBe("430000");
  });

  it("valor já inteiro (sem ponto) mantém-se", () => {
    expect(toIntegerDigits("15000")).toBe("15000");
  });

  it("null/undefined/vazio devolvem string vazia", () => {
    expect(toIntegerDigits(null)).toBe("");
    expect(toIntegerDigits(undefined)).toBe("");
    expect(toIntegerDigits("")).toBe("");
  });

  it("aceita number directamente", () => {
    expect(toIntegerDigits(990000)).toBe("990000");
  });
});
