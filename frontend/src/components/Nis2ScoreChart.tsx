// Valores das cores do sistema (mantidos aqui para reuso nos elementos SVG/JSX abaixo).
const C = {
  accent:   "#5b9cff",  // --color-accent
  ok:       "#10b981",  // --color-ok
  warn:     "#f59e0b",  // --color-warn
  bad:      "#ef4444",  // --color-bad
  line:     "#1e3a5f",  // --color-line
  surface2: "#152744",  // --color-surface-2
  text:     "#e7edf6",  // --color-text
  dim:      "#8a99b4",  // --color-dim
};

// ---------------------------------------------------------------------------
// Tipos — espelham CombinedArticleScore de backend/utils/combined-score.ts
// ---------------------------------------------------------------------------

export interface ArticleScore {
  article: string;
  title: string;
  score: number | null;
  scannable?: boolean;
  findings: string[];
}

export type CombinedSource = "scan" | "questionnaire" | "combined" | "none";

export interface CombinedArticleScore {
  article:            string;
  slug:               string;
  title:              string;
  scanScore:          number | null;
  questionnaireScore: number | null;
  combinedScore:      number | null;
  source:             CombinedSource;
  divergent:          boolean;
  scannable:          boolean;
  findings:           string[];
}

interface Props {
  /** Scores do scan (fallback quando não há dados combinados) */
  scores:           ArticleScore[];
  overallScore:     number;
  /** Dados combinados — fornecidos quando o backend já calculou */
  combined?:        CombinedArticleScore[] | null;
  overallCombined?: number | null;
  hasQuestionnaire?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers visuais
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 80) return C.ok;
  if (score >= 60) return C.warn;
  return C.bad;
}

function shortLabel(article: string): string {
  return article.replace("Art. 21(2)", "").replace("(", "").replace(")", "").trim();
}

function conformanceLabel(score: number): string {
  if (score >= 80) return "Conformidade elevada";
  if (score >= 60) return "Conformidade moderada";
  return "Conformidade baixa";
}

const SOURCE_LABEL: Record<CombinedSource, string> = {
  scan:          "Scan",
  questionnaire: "Questionário",
  combined:      "Scan + Quest.",
  none:          "—",
};

const SOURCE_COLOR: Record<CombinedSource, string> = {
  scan:          "bg-blue-900/60 text-blue-300 border-blue-700/40",
  questionnaire: "bg-teal-900/60 text-teal-300 border-teal-700/40",
  combined:      "bg-violet-900/60 text-violet-300 border-violet-700/40",
  none:          "bg-slate-800 text-slate-500 border-slate-700/40",
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function Nis2ScoreChart({
  scores,
  overallScore,
  combined,
  overallCombined,
  hasQuestionnaire = false,
}: Props) {
  const useCombined = combined != null && combined.length > 0;
  const displayOverall = useCombined && overallCombined != null
    ? overallCombined
    : overallScore;

  // Radar: artigos com score visível
  const radarItems = useCombined
    ? combined.filter((s) => s.combinedScore !== null)
    : scores.filter((s) => s.score !== null && s.scannable !== false);

  // Barra de score para cada artigo (sempre 10 artigos)
  const barItems = useCombined
    ? combined
    : scores.map((s) => ({
        article:            s.article,
        slug:               "",
        title:              s.title,
        scanScore:          s.score,
        questionnaireScore: null,
        combinedScore:      s.score,
        source:             s.score !== null ? ("scan" as CombinedSource) : ("none" as CombinedSource),
        divergent:          false,
        scannable:          s.scannable ?? true,
        findings:           s.findings,
      }));

  // Divergência declarado (questionário) vs observado (scan), por medida
  const dumbbellItems = (barItems as CombinedArticleScore[]).filter(
    (s) => s.scanScore !== null && s.questionnaireScore !== null
  );
  const betterCount = dumbbellItems.filter(
    (s) => (s.scanScore as number) >= (s.questionnaireScore as number)
  ).length;
  const worseCount = dumbbellItems.length - betterCount;

  return (
    <div className="space-y-8">
      {/* Score global + legenda de fonte */}
      <div>
        {useCombined ? (
          <>
            <p className="text-xl text-slate-400">Score de Conformidade NIS2</p>
            <p className="text-2xl font-semibold text-white mt-1">{conformanceLabel(displayOverall)}</p>
            <p className="text-lg text-slate-400 mt-1">
              {radarItems.length} de 10 medidas avaliadas
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Questionário + Scan · {combined.filter((s) => s.divergent).length > 0 && (
                <span className="text-amber-400 font-medium">
                  {combined.filter((s) => s.divergent).length} divergência{combined.filter((s) => s.divergent).length > 1 ? "s" : ""} detectada{combined.filter((s) => s.divergent).length > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="text-xl text-slate-400">Score técnico (scan)</p>
            <p className="text-2xl font-semibold text-white mt-1">{conformanceLabel(displayOverall)}</p>
            <p className="text-lg text-slate-400 mt-1">{radarItems.length} artigos avaliados por scan</p>
            <p className="text-sm text-slate-500 mt-1">
              Avaliação parcial — medidas organizacionais requerem questionário
            </p>
          </>
        )}
      </div>

      {/* Convite a completar questionário quando não existe */}
      {!hasQuestionnaire && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-blue-950/50 border border-blue-700/30">
          <span className="text-blue-400 text-lg shrink-0 mt-0.5">ℹ</span>
          <p className="text-sm text-blue-300">
            <span className="font-semibold">Conformidade incompleta.</span> As medidas organizacionais
            (a, b, c, d, g) não são avaliáveis por scan externo. Completa o{" "}
            <a href="/questionnaire" className="underline text-blue-200 hover:text-white">Questionário NIS2</a>{" "}
            para obter o score combinado das 10 medidas.
          </p>
        </div>
      )}

      {/* Divergência declarado vs observado */}
      {dumbbellItems.length === 0 ? (
        <p className="text-lg text-slate-500 italic">
          Sem comparação declarado-vs-observado: este scan não tem questionário
          associado. Responda ao questionário para cruzar a sua declaração com a
          evidência técnica.
        </p>
      ) : (
        <div
          role="img"
          aria-label={`Divergência declarado vs observado em ${dumbbellItems.length} medida${dumbbellItems.length > 1 ? "s" : ""}: ${betterCount} com observação igual ou melhor que a declaração, ${worseCount} com declaração mais otimista que a evidência técnica.`}
          className="space-y-4"
        >
          {dumbbellItems.map((s) => {
            const declared = s.questionnaireScore as number;
            const observed = s.scanScore as number;
            const better   = observed >= declared;
            const lineColor = better ? C.ok : C.bad;
            const left  = Math.min(declared, observed);
            const width = Math.max(Math.abs(observed - declared), 0.5);

            return (
              <div key={s.article} className="flex items-center gap-3">
                <span className="text-base text-slate-400 font-mono w-36 shrink-0">
                  {s.article}
                </span>
                <div className="relative flex-1 h-3">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-px"
                    style={{ backgroundColor: C.line }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded-full"
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: lineColor }}
                  />
                  <span
                    title={`Declarado: ${declared}`}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2"
                    style={{ left: `${declared}%`, backgroundColor: C.dim, borderColor: C.dim }}
                  />
                  <span
                    title={`Observado: ${observed}`}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
                    style={{ left: `${observed}%`, backgroundColor: C.accent }}
                  />
                </div>
                <span className="text-sm text-slate-400 w-32 text-right shrink-0">
                  {declared} → <span style={{ color: C.accent }}>{observed}</span>
                </span>
              </div>
            );
          })}

          {/* Legenda */}
          <div
            className="flex flex-wrap gap-x-6 gap-y-2 text-sm pt-2 border-t"
            style={{ color: C.dim, borderColor: C.line }}
          >
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block border-2" style={{ backgroundColor: C.dim, borderColor: C.dim }} />
              Declarado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: C.accent }} />
              Observado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: C.ok }} />
              Observado melhor — tranquilizador
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: C.bad }} />
              Declarado melhor — risco
            </span>
          </div>
        </div>
      )}

      {/* Lista de artigos */}
      <div className="space-y-3">
        {barItems.map((s) => {
          const score     = s.combinedScore;
          const isDivergent = (s as CombinedArticleScore).divergent ?? false;
          const source    = (s as CombinedArticleScore).source ?? "none";
          const scanSc    = (s as CombinedArticleScore).scanScore ?? null;
          const questSc   = (s as CombinedArticleScore).questionnaireScore ?? null;

          return (
            <div
              key={s.article}
              className={`rounded-lg px-3 py-2 ${
                isDivergent
                  ? "bg-amber-950/30 border border-amber-700/30"
                  : "bg-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Artigo + ícone de divergência */}
                <div className="flex items-center gap-1.5 w-36 shrink-0">
                  <span className="text-base text-slate-400 font-mono">{s.article}</span>
                  {isDivergent && (
                    <span
                      title="Divergência: scan e questionário discordam nesta medida"
                      className="text-amber-400 text-base leading-none"
                    >
                      ⚠
                    </span>
                  )}
                </div>

                {/* Barra de progresso */}
                {score === null ? (
                  <div className="flex-1 h-3 bg-line rounded-full overflow-hidden">
                    <div className="h-full w-0" />
                  </div>
                ) : (
                  <div className="flex-1 h-3 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
                    />
                  </div>
                )}

                {/* Valor */}
                {score === null ? (
                  <span className="text-sm text-slate-500 w-28 text-right shrink-0 italic">
                    {useCombined ? "Sem dados" : "Não avaliável por scan"}
                  </span>
                ) : (
                  <span
                    className="text-xl font-bold w-10 text-right shrink-0"
                    style={{ color: scoreColor(score) }}
                  >
                    {score}
                  </span>
                )}

                {/* Etiqueta de fonte */}
                {useCombined && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded border font-medium w-24 text-center shrink-0 ${SOURCE_COLOR[source]}`}
                  >
                    {SOURCE_LABEL[source]}
                  </span>
                )}
              </div>

              {/* Sub-scores quando há divergência */}
              {isDivergent && scanSc !== null && questSc !== null && (
                <div className="mt-1 ml-36 flex gap-4 text-xs text-slate-500">
                  <span>
                    Scan:{" "}
                    <span className="font-semibold" style={{ color: scoreColor(scanSc) }}>
                      {scanSc}
                    </span>
                  </span>
                  <span>
                    Questionário:{" "}
                    <span className="font-semibold" style={{ color: scoreColor(questSc) }}>
                      {questSc}
                    </span>
                  </span>
                  <span className="text-amber-500">
                    Score adoptado: {score} (mais severo)
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
