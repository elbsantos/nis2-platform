import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Conformidade elevada";
  if (score >= 60) return "Conformidade moderada";
  return "Conformidade baixa";
}

function answerBadge(answer: "no" | "partial") {
  return answer === "partial"
    ? <span className="px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-800 font-medium">Parcial</span>
    : <span className="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-700 font-medium">Não</span>;
}

function evidenceTag(type: string) {
  const map: Record<string, string> = {
    documento: "Documento",
    registo:   "Registo",
    config:    "Configuração",
    scan:      "Scan",
  };
  return (
    <span className="px-1.5 py-0.5 text-xs rounded bg-slate-100 text-slate-600 border border-slate-200">
      {map[type] ?? type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PDF download button (pattern idêntico a ScanResults)
// ---------------------------------------------------------------------------

function PdfButton({ sessionId }: { sessionId: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const generate = trpc.questionnaire.exportPdf.useQuery(
    { sessionId },
    { enabled: false, retry: false }
  );

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const result = await generate.refetch();
      if (!result.data) throw new Error("Sem dados");
      const { pdfBase64, filename } = result.data;
      const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: "application/pdf" });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement("a");
      a.href      = url;
      a.download  = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError("Erro ao gerar PDF. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors flex items-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            A gerar PDF…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar PDF
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function QuestionnaireReport() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate      = useNavigate();
  const id            = sessionId ? parseInt(sessionId, 10) : 0;

  const { data: report, isLoading, error } = trpc.questionnaire.report.useQuery(
    { sessionId: id },
    { enabled: id > 0 }
  );

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-slate-400 text-sm">
        A gerar relatório…
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-red-400 text-sm">
        {error?.message ?? "Relatório não disponível."}
      </div>
    );
  }

  const { overallScore, answeredCount, totalApplicable, measureScores, gaps, completedAt } = report;
  const coverage = Math.round((answeredCount / 42) * 100);

  // Gaps agrupados por medida
  const gapsByMeasure: Record<string, typeof gaps> = {};
  for (const gap of gaps) {
    if (!gapsByMeasure[gap.articleSlug]) gapsByMeasure[gap.articleSlug] = [];
    gapsByMeasure[gap.articleSlug].push(gap);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate("/questionnaire")}
            className="text-sm text-slate-400 hover:text-white mb-2 inline-flex items-center gap-1"
          >
            ← Questionários
          </button>
          <h1 className="text-2xl font-bold text-white">Relatório de Autoavaliação NIS2</h1>
          <p className="text-sm text-slate-400 mt-1">
            {completedAt
              ? `Concluído em ${new Date(completedAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}`
              : "Questionário concluído"}
            {" · "}{answeredCount} de 42 controlos respondidos ({coverage}% cobertura)
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <PdfButton sessionId={id} />
          <button
            onClick={() => navigate(`/questionnaire/${id}`)}
            className="px-4 py-2 text-sm border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700/50"
          >
            Ver respostas
          </button>
        </div>
      </div>

      {/* ── Score global ───────────────────────────────────────────────── */}
      <section className="bg-[#0f1e38] border border-[#1e3a5f] rounded-2xl p-6">
        <div className="flex items-center gap-6">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-white font-bold shadow-lg shrink-0"
            style={{ backgroundColor: scoreColor(overallScore), fontSize: "1.75rem" }}
          >
            {overallScore}
          </div>
          <div>
            <p className="text-base text-slate-400">Score de autoavaliação (questionário)</p>
            <p className="text-xl font-semibold text-white mt-1">{scoreLabel(overallScore)}</p>
            <p className="text-sm text-slate-400 mt-1">
              {gaps.length > 0
                ? `${gaps.length} lacuna${gaps.length > 1 ? "s" : ""} identificada${gaps.length > 1 ? "s" : ""} — ver plano de ação abaixo`
                : "Nenhuma lacuna identificada"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Baseado em {answeredCount} de 42 controlos respondidos — medidas não respondidas excluídas do cálculo.
            </p>
            <p className="text-xs text-slate-500">
              Avaliação organizacional — complementar ao score técnico do scan de vulnerabilidades.
            </p>
          </div>
        </div>
      </section>

      {/* ── Score por medida ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Score por medida (Art. 21(2))</h2>
        <div className="space-y-3">
          {measureScores.map((m) => {
            const unanswered = m.controlCount - m.answeredCount;
            const hasPartialCoverage = unanswered > 0 && m.answeredCount > 0;
            return (
              <div key={m.slug} className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400 w-28 shrink-0">
                  Art. 21(2)({m.slug})
                </span>
                {m.score === null ? (
                  <>
                    {/* Barra tracejada — sem respostas */}
                    <div
                      className="flex-1 h-2.5 rounded-full border border-dashed border-slate-600"
                      style={{ background: "repeating-linear-gradient(90deg, #1e3a5f 0px, #1e3a5f 6px, transparent 6px, transparent 12px)" }}
                    />
                    <span className="text-xs text-slate-500 w-36 text-right italic shrink-0">
                      Não respondido
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex-1 h-2.5 bg-[#1e3a5f] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${m.score}%`, backgroundColor: scoreColor(m.score) }}
                      />
                    </div>
                    <span
                      className="text-sm font-bold w-10 text-right shrink-0"
                      style={{ color: scoreColor(m.score) }}
                    >
                      {m.score}
                    </span>
                    {m.gapCount > 0 && (
                      <span className="text-xs text-red-400 w-20 text-right shrink-0">
                        {m.gapCount} lacuna{m.gapCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {hasPartialCoverage && (
                      <span className="text-xs text-amber-500 w-28 text-right shrink-0">
                        +{unanswered} não respondido{unanswered > 1 ? "s" : ""}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-slate-500 space-y-0.5">
          {measureScores.map((m) => (
            <div key={m.slug} className="flex gap-2">
              <span className="font-mono w-28 shrink-0">({m.slug}) {m.title.split(" ").slice(0, 3).join(" ")}…</span>
              <span>{m.answeredCount}/{m.controlCount} controlos respondidos</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Lacunas por medida — grelha 2 colunas ─────────────────────── */}
      {gaps.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">
            Lacunas identificadas ({gaps.length})
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Controlos respondidos com "Não" ou "Parcialmente", agrupados por medida do Art. 21(2).
            <span className="ml-2 text-slate-500">
              Controlos não respondidos não são lacunas — requerem resposta antes de serem avaliados.
            </span>
          </p>
          <div className="space-y-8">
            {Object.entries(gapsByMeasure).map(([slug, slugGaps]) => {
              const meta = measureScores.find((m) => m.slug === slug);
              const unanswered = meta ? meta.controlCount - meta.answeredCount : 0;
              return (
                <div key={slug}>
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-[#1e3a5f] px-2 py-0.5 rounded text-slate-400">
                      Art. 21(2)({slug})
                    </span>
                    {meta?.title}
                    {unanswered > 0 && (
                      <span className="text-xs text-amber-500 font-normal">
                        (+{unanswered} controlo{unanswered > 1 ? "s" : ""} não respondido{unanswered > 1 ? "s" : ""})
                      </span>
                    )}
                  </h3>
                  {/* Grelha 2 colunas em desktop, 1 em mobile */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l border-[#1e3a5f]">
                    {slugGaps.map((gap) => (
                      <div
                        key={gap.controlId}
                        className="bg-[#0f1e38] border border-[#1e3a5f] rounded-xl p-4 space-y-2"
                      >
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="font-mono text-xs text-blue-400">{gap.controlId}</span>
                          {answerBadge(gap.answer)}
                          {evidenceTag(gap.evidenceType)}
                        </div>
                        <p className="text-sm text-white font-medium leading-snug">{gap.question}</p>
                        <p className="text-xs text-slate-400 leading-relaxed">{gap.helpText}</p>
                        <div className="pt-1 border-t border-[#1e3a5f] text-xs text-slate-500 space-y-1">
                          <p><span className="text-slate-400 font-medium">Porquê: </span>{gap.why}</p>
                          {gap.suggestedDocument && (
                            <p>
                              <span className="text-slate-400 font-medium">Documento sugerido: </span>
                              {gap.suggestedDocument}
                              {gap.evidenceRequired && (
                                <span className="ml-1 text-red-400">(obrigatório)</span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Plano de ação priorizado ───────────────────────────────────── */}
      {gaps.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Plano de ação priorizado</h2>
          <p className="text-sm text-slate-400 mb-6">
            Ordenado do mais urgente ao menos urgente, com base na importância regulatória
            da medida e na gravidade da lacuna (Não &gt; Parcialmente).
          </p>
          <div className="space-y-4">
            {gaps.map((gap, i) => (
              <div
                key={gap.controlId}
                className="flex gap-4 bg-[#0f1e38] border border-[#1e3a5f] rounded-xl p-4"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: gap.answer === "no" ? "#ef4444" : "#f59e0b" }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-blue-400">{gap.controlId}</span>
                    {answerBadge(gap.answer)}
                    <span className="text-xs text-slate-500 font-mono">
                      Art. 21(2)({gap.articleSlug})
                    </span>
                  </div>
                  <p className="text-sm text-white font-medium leading-snug">{gap.question}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    <span className="font-medium text-slate-300">O que fazer: </span>
                    {gap.helpText}
                  </p>
                  {gap.suggestedDocument && (
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-400">Entregável: </span>
                      {gap.suggestedDocument}
                      {gap.evidenceRequired && (
                        <span className="ml-1 text-red-400">(obrigatório)</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {gaps.length === 0 && (
        <section className="bg-green-900/20 border border-green-800 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">✓</p>
          <p className="text-green-400 font-semibold text-lg">Todos os controlos cumpridos</p>
          <p className="text-sm text-slate-400 mt-2">
            Nenhuma lacuna identificada nos controlos respondidos. Mantenha a documentação actualizada e repita a avaliação anualmente.
          </p>
        </section>
      )}

      {/* ── Nota de rodapé ─────────────────────────────────────────────── */}
      <div className="text-xs text-slate-500 border-t border-[#1e3a5f] pt-6 space-y-1">
        <p>Este relatório é gerado automaticamente a partir das respostas ao questionário de autoavaliação NIS2 (42 controlos, Art. 21(2) do DL n.º 125/2025).</p>
        <p>Não substitui uma auditoria de conformidade formal. Para avaliação técnica da exposição externa, realize um scan de vulnerabilidades na plataforma.</p>
      </div>
    </div>
  );
}
