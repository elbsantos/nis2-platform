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

// Shorten article labels for the radar axis
function shortLabel(article: string): string {
  return article.replace("Art. 21(2)", "").replace("(", "").replace(")", "").trim();
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
    <div className="space-y-6">
      {/* Overall score badge */}
      <div className="flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-sm"
          style={{ backgroundColor: scoreColor(overall) }}
        >
          {overall}
        </div>
        <div>
          <p className="text-sm text-gray-500">Score NIS2 Global</p>
          <p className="font-semibold text-gray-900">
            {overall >= 80 ? "Conformidade elevada" : overall >= 60 ? "Conformidade moderada" : "Conformidade baixa"}
          </p>
        </div>
      </div>

      {/* Radar chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: "#6b7280" }} />
            <Radar
              name="Score"
              dataKey="score"
              stroke="#1d4ed8"
              fill="#1d4ed8"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            <Tooltip
              formatter={(value: number) => [`${value}/100`, "Score"]}
              contentStyle={{ fontSize: 12 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-article breakdown */}
      <div className="space-y-2">
        {scores.map((s) => (
          <div key={s.article} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-24 shrink-0">{s.article}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${s.score}%`, backgroundColor: scoreColor(s.score) }}
              />
            </div>
            <span className="text-xs font-medium w-10 text-right" style={{ color: scoreColor(s.score) }}>
              {s.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
