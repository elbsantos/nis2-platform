import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface ArticleScore {
  article: string;
  title: string;
  score: number;
  findings: string[];
}

interface Props {
  scores: ArticleScore[];
}

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

export default function Nis2ScoreChart({ scores }: Props) {
  const data = scores.map((s) => ({
    subject: shortLabel(s.article),
    score: s.score,
    fullMark: 100,
  }));

  const overall = scores.length
    ? Math.round(scores.reduce((acc, s) => acc + s.score, 0) / scores.length)
    : 0;

  return (
    <div className="space-y-8">
      {/* Overall score badge */}
      <div className="flex items-center gap-6">
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center text-white font-bold shadow-lg shrink-0"
          style={{ backgroundColor: scoreColor(overall), fontSize: "2rem" }}
        >
          {overall}
        </div>
        <div>
          <p className="text-xl text-slate-400">Score NIS2 Global</p>
          <p className="text-2xl font-semibold text-white mt-1">{conformanceLabel(overall)}</p>
          <p className="text-lg text-slate-400 mt-1">{scores.length} artigos avaliados</p>
        </div>
      </div>

      {/* Radar chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 16, right: 30, bottom: 16, left: 30 }}>
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

      {/* Per-article breakdown */}
      <div className="space-y-3">
        {scores.map((s) => (
          <div key={s.article} className="flex items-center gap-4">
            <span className="text-lg text-slate-400 w-32 shrink-0 font-mono">{s.article}</span>
            <div className="flex-1 h-3 bg-[#1e3a5f] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${s.score}%`, backgroundColor: scoreColor(s.score) }}
              />
            </div>
            <span
              className="text-xl font-bold w-12 text-right shrink-0"
              style={{ color: scoreColor(s.score) }}
            >
              {s.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
