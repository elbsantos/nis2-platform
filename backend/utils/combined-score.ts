/**
 * backend/utils/combined-score.ts
 *
 * Módulo único de cálculo do score combinado (scan + questionário).
 * Consumido pelo router de scan (endpoint combinedArticleScores) e pelo
 * gerador de PDF. O ecrã e os PDFs consomem o resultado deste módulo —
 * não recalculam.
 *
 * Lógica por medida (Art. 21(2)):
 *   Organizacionais (a, b, c, d, g) → 100 % do questionário.
 *   Técnicas/mistas (e, f, h, i, j) → regra da mais severa (min) quando
 *     ambas as fontes existem; se só uma → usa essa.
 */

import type { NIS2ArticleScore } from "../services/scan-executor";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type CombinedSource = "scan" | "questionnaire" | "combined" | "none";

export interface CombinedArticleScore {
  article:            string;          // "Art. 21(2)(a)"
  slug:               string;          // "a"
  title:              string;
  scanScore:          number | null;   // null se o artigo não é avaliável por scan
  questionnaireScore: number | null;   // null se questionário não foi preenchido
  combinedScore:      number | null;   // score resultante (regra acima)
  source:             CombinedSource;
  divergent:          boolean;         // true quando ambas fontes discordam > DIVERGENCE_THRESHOLD
  scannable:          boolean;
  findings:           string[];        // findings do scan (para detalhe no relatório técnico)
}

// ---------------------------------------------------------------------------
// Constantes internas
// ---------------------------------------------------------------------------

const ORGANIZATIONAL_SLUGS = new Set(["a", "b", "c", "d", "g"]);
const DIVERGENCE_THRESHOLD = 20;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function articleToSlug(article: string): string {
  const m = article.match(/\(([a-j])\)/);
  return m ? m[1] : "";
}

// ---------------------------------------------------------------------------
// combinedNis2Scores — cálculo principal
// ---------------------------------------------------------------------------

export function combinedNis2Scores(
  scanScores:      NIS2ArticleScore[],
  qArticleScores:  Record<string, number> | null
): CombinedArticleScore[] {
  return scanScores.map((s) => {
    const slug   = articleToSlug(s.article);
    const qScore = qArticleScores?.[slug] ?? null;
    const scanScore = s.score;

    let combinedScore: number | null;
    let source: CombinedSource;

    if (ORGANIZATIONAL_SLUGS.has(slug)) {
      // Medida puramente organizacional — 100 % do questionário
      combinedScore = qScore;
      source        = qScore !== null ? "questionnaire" : "none";
    } else {
      // Técnica / mista — regra da mais severa
      if (scanScore !== null && qScore !== null) {
        combinedScore = Math.min(scanScore, qScore);
        source        = "combined";
      } else if (scanScore !== null) {
        combinedScore = scanScore;
        source        = "scan";
      } else if (qScore !== null) {
        combinedScore = qScore;
        source        = "questionnaire";
      } else {
        combinedScore = null;
        source        = "none";
      }
    }

    const divergent =
      scanScore !== null &&
      qScore    !== null &&
      Math.abs(scanScore - qScore) >= DIVERGENCE_THRESHOLD;

    return {
      article:            s.article,
      slug,
      title:              s.title,
      scanScore,
      questionnaireScore: qScore,
      combinedScore,
      source,
      divergent,
      scannable:          s.scannable,
      findings:           s.findings,
    };
  });
}

// ---------------------------------------------------------------------------
// overallCombinedScore — média simples das medidas com score
// ---------------------------------------------------------------------------

export function overallCombinedScore(combined: CombinedArticleScore[]): number {
  const scored = combined.filter((s) => s.combinedScore !== null);
  if (scored.length === 0) return 0;
  const sum = scored.reduce((acc, s) => acc + s.combinedScore!, 0);
  return Math.round(sum / scored.length);
}
