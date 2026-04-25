/**
 * server/services/ai-questionnaire.test.ts
 *
 * Unit tests for NIS2 control score calculation.
 * AI calls (explainControl) are NOT tested here — they depend on the Anthropic API.
 */

import { describe, it, expect } from "vitest";
import { calculateScores, NIS2_CONTROLS } from "./ai-questionnaire";

// Helper: build a full answer array with the same value for every control
function allAnswers(value: "yes" | "partial" | "no" | "na") {
  return NIS2_CONTROLS.map((c) => ({
    controlId: c.id,
    answer: value,
    score: value === "yes" ? 100 : value === "partial" ? 50 : 0,
  }));
}

// ---------------------------------------------------------------------------
// Control definitions
// ---------------------------------------------------------------------------

describe("NIS2_CONTROLS", () => {
  it("defines 42 controls", () => {
    expect(NIS2_CONTROLS).toHaveLength(42);
  });

  it("covers all 10 NIS2 Art. 21(2) articles (a–j)", () => {
    const slugs = new Set(NIS2_CONTROLS.map((c) => c.articleSlug));
    expect(slugs).toEqual(new Set(["a","b","c","d","e","f","g","h","i","j"]));
  });

  it("each control has unique id", () => {
    const ids = NIS2_CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each control has non-empty question and helpText", () => {
    for (const c of NIS2_CONTROLS) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.helpText.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// calculateScores — boundary conditions
// ---------------------------------------------------------------------------

describe("calculateScores", () => {
  it("returns 100 when all controls answered yes", () => {
    const result = calculateScores(allAnswers("yes"));
    expect(result.overall).toBe(100);
    expect(result.answeredCount).toBe(42);
    expect(result.totalApplicable).toBe(42);
  });

  it("returns 0 when all controls answered no", () => {
    const result = calculateScores(allAnswers("no"));
    expect(result.overall).toBe(0);
    expect(result.answeredCount).toBe(42);
  });

  it("returns ~50 when all controls answered partial", () => {
    const result = calculateScores(allAnswers("partial"));
    expect(result.overall).toBe(50);
  });

  it("excludes na answers from the score calculation", () => {
    const result = calculateScores(allAnswers("na"));
    expect(result.overall).toBe(0);
    expect(result.answeredCount).toBe(0);
    expect(result.totalApplicable).toBe(0);
  });

  it("overall is always between 0 and 100", () => {
    // Mixed answers
    const mixed = NIS2_CONTROLS.map((c, i) => ({
      controlId: c.id,
      answer: (["yes", "partial", "no", "na"] as const)[i % 4],
      score: 50,
    }));
    const result = calculateScores(mixed);
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it("returns per-article scores for all answered articles", () => {
    const result = calculateScores(allAnswers("yes"));
    // All 10 articles should have a score
    expect(Object.keys(result.byArticle)).toHaveLength(10);
    for (const score of Object.values(result.byArticle)) {
      expect(score).toBe(100);
    }
  });

  it("single-control partial answer yields 50 overall", () => {
    const single = [{ controlId: "a-1", answer: "partial", score: 50 }];
    const result = calculateScores(single);
    expect(result.overall).toBe(50);
    expect(result.answeredCount).toBe(1);
  });

  it("empty answers array returns zero overall and zero answeredCount", () => {
    const result = calculateScores([]);
    expect(result.overall).toBe(0);
    expect(result.answeredCount).toBe(0);
    // totalApplicable = controls not marked "na"; with no answers none are "na"
    // so all 42 are technically applicable
    expect(result.totalApplicable).toBe(42);
  });

  it("unknown controlId is silently ignored", () => {
    const result = calculateScores([{ controlId: "z-99", answer: "yes", score: 100 }]);
    expect(result.overall).toBe(0); // z-99 not in NIS2_CONTROLS
  });
});
