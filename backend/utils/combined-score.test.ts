/**
 * backend/utils/combined-score.test.ts
 *
 * Unit tests for threeScores() — separação do score único em Security / Compliance / Risk.
 */

import { describe, it, expect } from "vitest";
import { threeScores, type CombinedArticleScore } from "./combined-score";

function score(overrides: Partial<CombinedArticleScore>): CombinedArticleScore {
  return {
    article:            "Art. 21(2)(h)",
    slug:               "h",
    title:              "Criptografia e encriptação",
    scanScore:          null,
    questionnaireScore: null,
    combinedScore:      null,
    source:             "none",
    divergent:          false,
    scannable:          true,
    findings:           [],
    ...overrides,
  };
}

describe("threeScores", () => {
  it("security 45 / compliance 40 — declara pior que é, sem penalização", () => {
    const r = threeScores([score({ scanScore: 45, questionnaireScore: 40 })]);
    expect(r.security).toBe(45);
    expect(r.compliance).toBe(40);
    expect(r.risk).toBe(55); // 100 - 45, sem penalização (compliance < security)
    expect(r.riskLabel).toBe("Alto");
    expect(r.divergence).toBe(5);
  });

  it("security 45 / compliance 85 — declara melhor que é, risco MAIS ALTO que o caso anterior (penalização de 20)", () => {
    const worse  = threeScores([score({ scanScore: 45, questionnaireScore: 40 })]);
    const better = threeScores([score({ scanScore: 45, questionnaireScore: 85 })]);
    expect(better.security).toBe(45);
    expect(better.compliance).toBe(85);
    expect(better.risk).toBe(75); // (100-45) + (85-45)*0.5 = 55 + 20
    expect(better.riskLabel).toBe("Crítico");
    expect(better.risk).toBeGreaterThan(worse.risk);
  });

  it("sem scan — risk calculado só do compliance, sem penalização", () => {
    const r = threeScores([score({ scanScore: null, questionnaireScore: 40, scannable: false })]);
    expect(r.security).toBeNull();
    expect(r.compliance).toBe(40);
    expect(r.risk).toBe(60); // 100 - 40, sem penalização (não há security para comparar)
    expect(r.riskLabel).toBe("Alto");
    expect(r.divergence).toBe(0); // falta uma fonte
  });

  it("ambos 100 — risco baixo", () => {
    const r = threeScores([score({ scanScore: 100, questionnaireScore: 100 })]);
    expect(r.security).toBe(100);
    expect(r.compliance).toBe(100);
    expect(r.risk).toBe(0);
    expect(r.riskLabel).toBe("Baixo");
    expect(r.divergence).toBe(0);
  });

  it("sem scan nem questionário — risco desconhecido, nunca presume 'Baixo'", () => {
    const r = threeScores([score({ scanScore: null, questionnaireScore: null, scannable: false })]);
    expect(r.security).toBeNull();
    expect(r.compliance).toBeNull();
    expect(r.risk).toBe(50);
    expect(r.riskLabel).toBe("Médio");
    expect(r.riskLabel).not.toBe("Baixo");
  });

  it("security e compliance são a média entre várias medidas", () => {
    const r = threeScores([
      score({ slug: "h", scanScore: 40, questionnaireScore: 60 }),
      score({ slug: "i", scanScore: 60, questionnaireScore: 80 }),
    ]);
    expect(r.security).toBe(50);
    expect(r.compliance).toBe(70);
  });

  it("divergentMeasures reflete os slugs com divergent=true, ignora os restantes", () => {
    const r = threeScores([
      score({ slug: "h", scanScore: 40, questionnaireScore: 90, divergent: true }),
      score({ slug: "i", scanScore: 80, questionnaireScore: 85, divergent: false }),
      score({ slug: "j", scanScore: null, questionnaireScore: null, divergent: false, scannable: false }),
    ]);
    expect(r.divergentMeasures).toEqual(["h"]);
  });
});
