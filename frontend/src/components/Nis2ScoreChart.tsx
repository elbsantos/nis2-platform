import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
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

  const radarData = radarItems.map((s) => ({
    subject:  shortLabel(useCombined ? s.article : (s as ArticleScore).article),
    score:    useCombined
      ? (s as CombinedArticleScore).combinedScore as number
      : (s as ArticleScore).score as number,
    fullMark: 100,
  }));

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

  return (
    <div className="space-y-8">
      {/* Score global + legenda de fonte */}
      <div className="flex items-center gap-6">
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center text-white font-bold shadow-lg shrink-0"
          style={{ backgroundColor: scoreColor(displayOverall), fontSize: "2rem" }}
        >
          {displayOverall}
        </div>
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

      {/* Radar */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 16, right: 30, bottom: 16, left: 30 }}>
            <PolarGrid stroke="#1e3a5f" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 16, fill: "#94a3b8", fontWeight: 600 }}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="#f0c040"
              fill="#f0c040"
              fillOpacity={0.12}
              strokeWidth={2}
            />
            <Tooltip
              formatter={(value: number) => [`${value}/100`, "Pontuação"]}
              contentStyle={{
                fontSize: 16,
                backgroundColor: "#152744",
                border: "1px solid #1e3a5f",
                borderRadius: "8px",
                color: "#ffffff",
              }}
              labelStyle={{ color: "#f0c040", fontWeight: 700 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

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
                  <div className="flex-1 h-3 bg-[#1e3a5f] rounded-full overflow-hidden">
                    <div className="h-full w-0" />
                  </div>
                ) : (
                  <div className="flex-1 h-3 bg-[#1e3a5f] rounded-full overflow-hidden">
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
