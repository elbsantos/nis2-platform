import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { answerTone, answerSelectedClasses } from "../lib/answerTone";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { CheckCircle2, ChevronLeft, Download } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreBgClass(score: number): string {
  if (score >= 80) return "bg-ok";
  if (score >= 60) return "bg-warn";
  return "bg-bad";
}

function scoreTextClass(score: number): string {
  if (score >= 80) return "text-ok";
  if (score >= 60) return "text-warn";
  return "text-bad";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Conformidade elevada";
  if (score >= 60) return "Conformidade moderada";
  return "Conformidade baixa";
}

function answerBadge(answer: "no" | "partial") {
  const tone  = answerTone[answer];
  const label = answer === "partial" ? "Parcial" : "Não";
  return <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${answerSelectedClasses[tone]}`}>{label}</span>;
}

function evidenceTag(type: string) {
  const map: Record<string, string> = {
    documento: "Documento",
    registo:   "Registo",
    config:    "Configuração",
    scan:      "Scan",
  };
  return (
    <span className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-dim border border-line">
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
      <Button variant="ghost" onClick={handleClick} disabled={loading}>
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            A gerar PDF…
          </>
        ) : (
          <>
            <Icon as={Download} />
            Exportar PDF
          </>
        )}
      </Button>
      {error && <p className="text-xs text-bad">{error}</p>}
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
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-dim text-sm">
        A gerar relatório…
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-bad text-sm">
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
          <Button
            variant="ghost"
            className="mb-2 px-2 py-1 text-sm"
            onClick={() => navigate("/questionnaire")}
          >
            <Icon as={ChevronLeft} />
            Questionários
          </Button>
          <h1 className="text-2xl font-bold text-text">Relatório de Autoavaliação NIS2</h1>
          <p className="text-sm text-dim mt-1">
            {completedAt
              ? `Concluído em ${new Date(completedAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}`
              : "Questionário concluído"}
            {" · "}{answeredCount} de 42 controlos respondidos ({coverage}% cobertura)
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <PdfButton sessionId={id} />
          <Button
            variant="ghost"
            onClick={() => navigate(`/questionnaire/${id}`)}
          >
            Ver respostas
          </Button>
        </div>
      </div>

      {/* ── Score global ───────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-center gap-6">
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center text-white font-bold shadow-lg shrink-0 ${scoreBgClass(overallScore)}`}
            style={{ fontSize: "1.75rem" }}
          >
            {overallScore}
          </div>
          <div>
            <p className="text-base text-dim">Score de autoavaliação (questionário)</p>
            <p className="text-xl font-semibold text-text mt-1">{scoreLabel(overallScore)}</p>
            <p className="text-sm text-dim mt-1">
              {gaps.length > 0
                ? `${gaps.length} lacuna${gaps.length > 1 ? "s" : ""} identificada${gaps.length > 1 ? "s" : ""} — ver plano de ação abaixo`
                : "Nenhuma lacuna identificada"}
            </p>
            <p className="text-xs text-faint mt-1">
              Baseado em {answeredCount} de 42 controlos respondidos — medidas não respondidas excluídas do cálculo.
            </p>
            <p className="text-xs text-faint">
              Avaliação organizacional — complementar ao score técnico do scan de vulnerabilidades.
            </p>
          </div>
        </div>
      </Card>

      {/* ── Score por medida ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-text mb-4">Score por medida (Art. 21(2))</h2>
        <div className="space-y-3">
          {measureScores.map((m) => {
            const unanswered = m.controlCount - m.answeredCount;
            const hasPartialCoverage = unanswered > 0 && m.answeredCount > 0;
            return (
              <div key={m.slug} className="flex items-center gap-3">
                <span className="text-xs font-mono text-dim w-28 shrink-0">
                  Art. 21(2)({m.slug})
                </span>
                {m.score === null ? (
                  <>
                    {/* Barra tracejada — sem respostas */}
                    <div
                      className="flex-1 h-2.5 rounded-full border border-dashed border-line"
                      style={{ background: "repeating-linear-gradient(90deg, var(--color-line) 0px, var(--color-line) 6px, transparent 6px, transparent 12px)" }}
                    />
                    <span className="text-xs text-faint w-36 text-right italic shrink-0">
                      Não respondido
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex-1 h-2.5 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${scoreBgClass(m.score)}`}
                        style={{ width: `${m.score}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold w-10 text-right shrink-0 ${scoreTextClass(m.score)}`}>
                      {m.score}
                    </span>
                    {m.gapCount > 0 && (
                      <span className="text-xs text-bad w-20 text-right shrink-0">
                        {m.gapCount} lacuna{m.gapCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {hasPartialCoverage && (
                      <span className="text-xs text-warn w-28 text-right shrink-0">
                        +{unanswered} não respondido{unanswered > 1 ? "s" : ""}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-faint space-y-0.5">
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
          <h2 className="text-lg font-semibold text-text mb-2">
            Lacunas identificadas ({gaps.length})
          </h2>
          <p className="text-sm text-dim mb-6">
            Controlos respondidos com "Não" ou "Parcialmente", agrupados por medida do Art. 21(2).
            <span className="ml-2 text-faint">
              Controlos não respondidos não são lacunas — requerem resposta antes de serem avaliados.
            </span>
          </p>
          <div className="space-y-8">
            {Object.entries(gapsByMeasure).map(([slug, slugGaps]) => {
              const meta = measureScores.find((m) => m.slug === slug);
              const unanswered = meta ? meta.controlCount - meta.answeredCount : 0;
              return (
                <div key={slug}>
                  <h3 className="text-sm font-semibold text-dim mb-3 flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-surface-2 px-2 py-0.5 rounded text-dim">
                      Art. 21(2)({slug})
                    </span>
                    {meta?.title}
                    {unanswered > 0 && (
                      <span className="text-xs text-warn font-normal">
                        (+{unanswered} controlo{unanswered > 1 ? "s" : ""} não respondido{unanswered > 1 ? "s" : ""})
                      </span>
                    )}
                  </h3>
                  {/* Grelha 2 colunas em desktop, 1 em mobile */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l border-line">
                    {slugGaps.map((gap) => (
                      <Card key={gap.controlId} className="p-4 space-y-2">
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="font-mono text-xs text-accent">{gap.controlId}</span>
                          {answerBadge(gap.answer)}
                          {evidenceTag(gap.evidenceType)}
                        </div>
                        <p className="text-sm text-text font-medium leading-snug">{gap.question}</p>
                        <p className="text-xs text-dim leading-relaxed">{gap.helpText}</p>
                        <div className="pt-1 border-t border-line text-xs text-faint space-y-1">
                          <p><span className="text-dim font-medium">Porquê: </span>{gap.why}</p>
                          {gap.suggestedDocument && (
                            <p>
                              <span className="text-dim font-medium">Documento sugerido: </span>
                              {gap.suggestedDocument}
                              {gap.evidenceRequired && (
                                <span className="ml-1 text-bad">(obrigatório)</span>
                              )}
                            </p>
                          )}
                        </div>
                      </Card>
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
          <h2 className="text-lg font-semibold text-text mb-2">Plano de ação priorizado</h2>
          <p className="text-sm text-dim mb-6">
            Ordenado do mais urgente ao menos urgente, com base na importância regulatória
            da medida e na gravidade da lacuna (Não &gt; Parcialmente).
          </p>
          <div className="space-y-4">
            {gaps.map((gap, i) => (
              <Card key={gap.controlId} className="flex gap-4 p-4">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${gap.answer === "no" ? "bg-bad" : "bg-warn"}`}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-accent">{gap.controlId}</span>
                    {answerBadge(gap.answer)}
                    <span className="text-xs text-faint font-mono">
                      Art. 21(2)({gap.articleSlug})
                    </span>
                  </div>
                  <p className="text-sm text-text font-medium leading-snug">{gap.question}</p>
                  <p className="text-xs text-dim leading-relaxed">
                    <span className="font-medium text-dim">O que fazer: </span>
                    {gap.helpText}
                  </p>
                  {gap.suggestedDocument && (
                    <p className="text-xs text-faint">
                      <span className="font-medium text-dim">Entregável: </span>
                      {gap.suggestedDocument}
                      {gap.evidenceRequired && (
                        <span className="ml-1 text-bad">(obrigatório)</span>
                      )}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {gaps.length === 0 && (
        <Card className="p-8 text-center border-ok/40">
          <Icon as={CheckCircle2} size={40} className="mx-auto mb-3 text-ok" />
          <p className="text-ok font-semibold text-lg">Todos os controlos cumpridos</p>
          <p className="text-sm text-dim mt-2">
            Nenhuma lacuna identificada nos controlos respondidos. Mantenha a documentação actualizada e repita a avaliação anualmente.
          </p>
        </Card>
      )}

      {/* ── Nota de rodapé ─────────────────────────────────────────────── */}
      <div className="text-xs text-faint border-t border-line pt-6 space-y-1">
        <p>Este relatório é gerado automaticamente a partir das respostas ao questionário de autoavaliação NIS2 (42 controlos, Art. 21(2) do DL n.º 125/2025).</p>
        <p>Não substitui uma auditoria de conformidade formal. Para avaliação técnica da exposição externa, realize um scan de vulnerabilidades na plataforma.</p>
      </div>
    </div>
  );
}
