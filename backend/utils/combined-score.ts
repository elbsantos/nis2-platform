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
  divergent:          boolean;         // true: diff ≥ 10, ou q=100 e scan<100 (ver ADR-003)
  scannable:          boolean;
  findings:           string[];        // findings do scan (para detalhe no relatório técnico)
}

// ---------------------------------------------------------------------------
// Constantes internas
// ---------------------------------------------------------------------------

const ORGANIZATIONAL_SLUGS = new Set(["a", "b", "c", "d", "g"]);

// Limiar geral de divergência — ver ADR-003 §3.
// 10 pontos: captura diferenças relevantes sem sinalizar ruído de 1-9 pontos.
const DIVERGENCE_THRESHOLD = 10;

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

    // Regra geral: diferença absoluta >= limiar (ADR-003 §3).
    const thresholdDivergent =
      scanScore !== null &&
      qScore    !== null &&
      Math.abs(scanScore - qScore) >= DIVERGENCE_THRESHOLD;

    // Regra especial (ADR-003 §2): autoavaliação = 100 com scan < 100 sinaliza sempre,
    // independentemente da diferença numérica.
    // A assimetria é deliberada — "declarar perfeição e ser desmentido pelo mundo real"
    // é o cenário-bandeira da plataforma e merece destaque mesmo com diff < 10.
    // O inverso (scan=100, q<100) não tem regra especial: não há declaração optimista
    // desmentida, e casos relevantes estouram o limiar geral de qualquer forma.
    // Caso-limite (100, 100): scanScore < 100 é false → não sinaliza. Correcto.
    const declaredPerfectButDisproved =
      scanScore !== null &&
      qScore    === 100 &&
      scanScore < 100;

    const divergent = thresholdDivergent || declaredPerfectButDisproved;

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

// ---------------------------------------------------------------------------
// threeScores — separa o score único em três dimensões: Security / Compliance / Risk
// ---------------------------------------------------------------------------

export interface ThreeScores {
  security:          number | null;   // média dos scanScore das medidas com scan
  compliance:        number | null;   // média dos questionnaireScore das medidas respondidas
  risk:              number;          // 0-100, ver regra abaixo — nunca a média dos outros dois
  riskLabel:         "Baixo" | "Médio" | "Alto" | "Crítico";
  divergence:        number;          // |security - compliance|, 0 se faltar uma fonte
  divergentMeasures: string[];        // slugs das medidas com CombinedArticleScore.divergent
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function riskLabelFor(risk: number): ThreeScores["riskLabel"] {
  if (risk < 25) return "Baixo";
  // Limiar <= 50 (e não < 50) para que a posição neutra de "sem dados" (risk=50) apareça como
  // "Médio" e não "Alto" — presumir risco alto sem evidência é tão errado quanto presumir baixo.
  if (risk <= 50) return "Médio";
  if (risk < 75) return "Alto";
  return "Crítico";
}

/**
 * Separa o score único (overallCombinedScore) em três dimensões:
 *   - security:   média dos scanScore das medidas com scan — exposição técnica OBSERVADA.
 *   - compliance: média dos questionnaireScore das medidas respondidas — o que a empresa
 *                 DECLARA sobre si própria.
 *   - risk:       o risco NÃO é a média dos outros dois. Parte da exposição técnica e é
 *                 AGRAVADO pela divergência quando a empresa declara melhor do que a
 *                 exposição real mostra — uma organização que se autoavalia bem mas tem
 *                 exposição técnica alta opera com uma imagem falsa de si própria, e isso
 *                 é risco acrescido, não neutro. O inverso (declarar pior do que é) não é
 *                 penalizado — é apenas prudência, não uma falha de perceção perigosa.
 *
 *   base          = 100 - security
 *   penalização   = compliance > security ? (compliance - security) * 0.5 : 0
 *   risk          = min(100, base + penalização)
 *
 * Sem scan (security === null): o risco baseia-se só no compliance (100 - compliance), sem
 * penalização — não há exposição técnica observada com que comparar a autoavaliação, logo
 * não há "declarar melhor do que a realidade" a detetar. Mas NUNCA se assume risco baixo só
 * por falta de scan.
 *
 * Sem scan NEM questionário: risco totalmente desconhecido. Assume-se "Médio" (50) como
 * posição neutra deliberada — nem otimista (inventar "Baixo" por ausência de dados seria
 * exatamente o erro que esta função existe para evitar) nem alarmista sem fundamento.
 */
export function threeScores(scores: CombinedArticleScore[]): ThreeScores {
  const securityValues   = scores.filter((s) => s.scanScore !== null).map((s) => s.scanScore as number);
  const complianceValues = scores.filter((s) => s.questionnaireScore !== null).map((s) => s.questionnaireScore as number);

  const security   = average(securityValues);
  const compliance = average(complianceValues);

  let risk: number;
  if (security !== null) {
    const base        = 100 - security;
    const penalizacao = compliance !== null && compliance > security ? (compliance - security) * 0.5 : 0;
    risk = Math.round(Math.min(100, base + penalizacao));
  } else if (compliance !== null) {
    risk = 100 - compliance;
  } else {
    risk = 50;
  }

  const divergence = security !== null && compliance !== null ? Math.abs(security - compliance) : 0;
  const divergentMeasures = scores.filter((s) => s.divergent).map((s) => s.slug);

  return {
    security,
    compliance,
    risk,
    riskLabel: riskLabelFor(risk),
    divergence,
    divergentMeasures,
  };
}
