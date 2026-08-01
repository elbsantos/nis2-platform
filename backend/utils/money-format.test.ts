import { describe, expect, it } from "vitest";
import { formatMoedaEuro } from "./money-format";

describe("formatMoedaEuro", () => {
  it("formata string com cêntimos", () => {
    expect(formatMoedaEuro("15000.00")).toBe("15.000,00 €");
  });

  it("formata string sem cêntimos (inteiro puro)", () => {
    expect(formatMoedaEuro("15000")).toBe("15.000,00 €");
  });

  it("arredonda a 2 casas decimais", () => {
    expect(formatMoedaEuro("1500000.5")).toBe("1.500.000,50 €");
    expect(formatMoedaEuro("15000.006")).toBe("15.000,01 €"); // arredonda para cima
    expect(formatMoedaEuro("15000.004")).toBe("15.000,00 €"); // arredonda para baixo
  });

  it("valores grandes (milhões) com múltiplos separadores de milhar", () => {
    expect(formatMoedaEuro("60000000")).toBe("60.000.000,00 €");
    expect(formatMoedaEuro(43000000.99)).toBe("43.000.000,99 €");
  });

  it("aceita number directamente", () => {
    expect(formatMoedaEuro(990000)).toBe("990.000,00 €");
  });

  it("valores pequenos (sem separador de milhar)", () => {
    expect(formatMoedaEuro("500")).toBe("500,00 €");
    expect(formatMoedaEuro("0")).toBe("0,00 €");
  });

  it("negativos preservam o sinal antes do número", () => {
    expect(formatMoedaEuro("-15000")).toBe("-15.000,00 €");
  });

  it("null/undefined → placeholder default '[A PREENCHER]'", () => {
    expect(formatMoedaEuro(null)).toBe("[A PREENCHER]");
    expect(formatMoedaEuro(undefined)).toBe("[A PREENCHER]");
  });

  it("string vazia/'None'/'null'/'undefined' → placeholder default", () => {
    expect(formatMoedaEuro("")).toBe("[A PREENCHER]");
    expect(formatMoedaEuro("None")).toBe("[A PREENCHER]");
    expect(formatMoedaEuro("null")).toBe("[A PREENCHER]");
    expect(formatMoedaEuro("undefined")).toBe("[A PREENCHER]");
  });

  it("valor não numérico → placeholder default", () => {
    expect(formatMoedaEuro("abc")).toBe("[A PREENCHER]");
  });

  it("placeholder customizado (padrão dos geradores, mesmo estilo de cell())", () => {
    expect(formatMoedaEuro(null, "[A PREENCHER: volume de negócios]")).toBe(
      "[A PREENCHER: volume de negócios]"
    );
  });
});
