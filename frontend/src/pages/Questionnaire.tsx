import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";

type AnswerValue = "yes" | "partial" | "no" | "na";

const ANSWER_LABELS: Record<AnswerValue, string> = {
  yes:     "Sim",
  partial: "Parcialmente",
  no:      "Não",
  na:      "N.A.",
};

const ANSWER_CLASSES: Record<AnswerValue, string> = {
  yes:     "border-green-500 bg-green-50 text-green-800",
  partial: "border-amber-400 bg-amber-50 text-amber-800",
  no:      "border-red-400 bg-red-50 text-red-700",
  na:      "border-gray-300 bg-gray-50 text-gray-500",
};

const ARTICLE_LABELS: Record<string, string> = {
  a: "Políticas de segurança",
  b: "Gestão de incidentes",
  c: "Continuidade de negócio",
  d: "Cadeia de abastecimento",
  e: "Aquisição de sistemas",
  f: "Avaliação da eficácia",
  g: "Formação e higiene digital",
  h: "Criptografia",
  i: "Controlo de acesso",
  j: "MFA e comunicações",
};

// ── Session list / intro ─────────────────────────────────────────────────────

function SessionList() {
  const navigate   = useNavigate();
  const { data: sessions, isLoading } = trpc.questionnaire.list.useQuery();
  const startMut = trpc.questionnaire.start.useMutation({
    onSuccess: (s) => navigate(`/questionnaire/${s.id}`),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Questionário NIS2</h1>
          <p className="text-sm text-slate-400 mt-0.5">42 controlos do Art. 21(2) da Diretiva NIS2</p>
        </div>
        <button
          onClick={() => startMut.mutate({})}
          disabled={startMut.isPending}
          className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50"
        >
          {startMut.isPending ? "A iniciar…" : "+ Nova avaliação"}
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400 text-sm">A carregar…</div>
      )}

      {!isLoading && sessions?.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-slate-300 font-medium mb-2">Ainda não fez nenhuma avaliação</p>
          <p className="text-sm text-slate-400 mb-6">
            O questionário avalia a conformidade da sua empresa com os 42 controlos obrigatórios do Art. 21(2) da NIS2.
          </p>
          <button
            onClick={() => startMut.mutate({})}
            disabled={startMut.isPending}
            className="px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50"
          >
            Iniciar primeira avaliação
          </button>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((s) => {
            const score   = s.score ? parseInt(s.score) : null;
            const answers = (s.answers as any[]) ?? [];
            const done    = s.status === "completed";
            return (
              <div
                key={s.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    className="flex-1 text-left"
                    onClick={() => navigate(`/questionnaire/${s.id}`)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        done ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
                      }`}>
                        {done ? "Concluído" : "Em curso"}
                      </span>
                      <span className="text-xs text-gray-400">#{s.id}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {answers.length}/42 controlos respondidos
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(s.createdAt).toLocaleDateString("pt-PT")}
                    </p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    {done && (
                      <button
                        onClick={() => navigate(`/questionnaire/${s.id}/report`)}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800"
                      >
                        Ver relatório
                      </button>
                    )}
                    {score !== null && (
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444" }}
                      >
                        {score}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Active questionnaire ─────────────────────────────────────────────────────

function ActiveQuestionnaire({ sessionId }: { sessionId: number }) {
  const navigate = useNavigate();
  const utils    = trpc.useUtils();

  const { data: session, isLoading: sessionLoading } = trpc.questionnaire.getById.useQuery({ sessionId });
  const { data: controls = [] } = trpc.questionnaire.controls.useQuery();

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [activeArticle, setActiveArticle] = useState<string>("a");
  const [expandedExplain, setExpandedExplain] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const saveAnswersMut  = trpc.questionnaire.saveAnswers.useMutation();
  const completeMut     = trpc.questionnaire.complete.useMutation({
    onSuccess: () => {
      utils.questionnaire.list.invalidate();
      navigate(`/questionnaire/${sessionId}/report`);
    },
  });

  // Sync existing answers from DB
  useEffect(() => {
    if (session?.answers) {
      const map: Record<string, AnswerValue> = {};
      for (const a of session.answers as any[]) {
        map[a.controlId] = a.answer as AnswerValue;
      }
      setAnswers(map);
    }
  }, [session]);

  const articles = [...new Set(controls.map((c) => c.articleSlug))];
  const byArticle = (slug: string) => controls.filter((c) => c.articleSlug === slug);
  const answeredIn = (slug: string) => byArticle(slug).filter((c) => answers[c.id]).length;
  const totalAnswered = controls.filter((c) => answers[c.id]).length;

  function setAnswer(controlId: string, val: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [controlId]: val }));
  }

  async function handleSave() {
    setSaving(true);
    const payload = Object.entries(answers).map(([controlId, answer]) => ({
      controlId,
      answer: answer as AnswerValue,
    }));
    await saveAnswersMut.mutateAsync({ sessionId, answers: payload });
    setSaving(false);
  }

  async function handleComplete() {
    await handleSave();
    await completeMut.mutateAsync({ sessionId });
  }

  if (sessionLoading) {
    return <div className="text-center py-20 text-gray-400 text-sm">A carregar…</div>;
  }

  if (!session) {
    return <div className="text-center py-20 text-red-500 text-sm">Sessão não encontrada.</div>;
  }

  const isCompleted = session.status === "completed";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex gap-6">
      {/* Left sidebar — article navigation */}
      <aside className="w-52 shrink-0">
        <div className="sticky top-6 space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {totalAnswered}/42 respondidos
          </p>
          {/* Progress bar */}
          <div className="w-full bg-slate-700 rounded-full h-1.5 mb-4">
            <div
              className="h-1.5 rounded-full bg-blue-600 transition-all"
              style={{ width: `${(totalAnswered / 42) * 100}%` }}
            />
          </div>
          {articles.map((slug) => {
            const total    = byArticle(slug).length;
            const answered = answeredIn(slug);
            const done     = answered === total;
            return (
              <button
                key={slug}
                onClick={() => setActiveArticle(slug)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  activeArticle === slug
                    ? "bg-blue-700 text-white"
                    : "text-slate-300 hover:bg-[#152744]"
                }`}
              >
                <span className="font-mono text-xs mr-1">
                  {done ? "✓" : `${answered}/${total}`}
                </span>{" "}
                {ARTICLE_LABELS[slug]}
              </button>
            );
          })}

          <div className="pt-4 space-y-2">
            <button
              onClick={handleSave}
              disabled={saving || isCompleted}
              className="w-full px-3 py-2 text-xs border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700/50 disabled:opacity-40"
            >
              {saving ? "A guardar…" : "Guardar progresso"}
            </button>
            {!isCompleted && (
              <button
                onClick={handleComplete}
                disabled={totalAnswered < 1 || completeMut.isPending}
                className="w-full px-3 py-2 text-xs bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-40"
              >
                {completeMut.isPending ? "A concluir…" : "Concluir avaliação"}
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {isCompleted && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 flex items-center justify-between gap-4">
            <span>Avaliação concluída — Score: <strong>{session.score}/100</strong></span>
            <button
              onClick={() => navigate(`/questionnaire/${sessionId}/report`)}
              className="px-3 py-1.5 text-xs font-medium bg-green-700 text-white rounded-lg hover:bg-green-800 shrink-0"
            >
              Ver relatório
            </button>
          </div>
        )}

        <div className="mb-4">
          <h2 className="text-lg font-bold text-white">
            Art. 21(2)({activeArticle}) — {ARTICLE_LABELS[activeArticle]}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {answeredIn(activeArticle)}/{byArticle(activeArticle).length} controlos respondidos
          </p>
        </div>

        <div className="space-y-6">
          {byArticle(activeArticle).map((control) => {
            const current = answers[control.id];
            return (
              <div
                key={control.id}
                className="bg-white border border-gray-200 rounded-xl p-5"
              >
                <p className="text-sm font-medium text-gray-900 mb-1">
                  <span className="font-mono text-xs text-blue-600 mr-2">{control.id}</span>
                  {control.question}
                </p>
                <p className="text-xs text-gray-400 mb-4">{control.helpText}</p>

                {/* Answer buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {(["yes", "partial", "no", "na"] as AnswerValue[]).map((val) => (
                    <button
                      key={val}
                      disabled={isCompleted}
                      onClick={() => setAnswer(control.id, val)}
                      className={`px-4 py-1.5 text-xs font-medium border rounded-full transition-all ${
                        current === val
                          ? ANSWER_CLASSES[val]
                          : "border-gray-200 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {ANSWER_LABELS[val]}
                    </button>
                  ))}
                </div>

                {/* AI explain toggle */}
                <button
                  onClick={() => {
                    if (expandedExplain === control.id) {
                      setExpandedExplain(null);
                    } else {
                      setExpandedExplain(control.id);
                    }
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {expandedExplain === control.id ? "▲ Fechar explicação" : "▼ Explicar este controlo com IA"}
                </button>

                {expandedExplain === control.id && (
                  <ExplainPanel
                    controlId={control.id}
                    cachedExplanation={explanations[control.id]}
                    onExplained={(text) =>
                      setExplanations((prev) => ({ ...prev, [control.id]: text }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Article navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => {
              const idx = articles.indexOf(activeArticle);
              if (idx > 0) setActiveArticle(articles[idx - 1]);
            }}
            disabled={articles.indexOf(activeArticle) === 0}
            className="px-4 py-2 text-sm border border-slate-600 rounded-md text-slate-300 disabled:opacity-40 hover:bg-slate-700/50"
          >
            ← Artigo anterior
          </button>
          {articles.indexOf(activeArticle) < articles.length - 1 ? (
            <button
              onClick={() => {
                const idx = articles.indexOf(activeArticle);
                setActiveArticle(articles[idx + 1]);
              }}
              className="px-4 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800"
            >
              Artigo seguinte →
            </button>
          ) : (
            !isCompleted && (
              <button
                onClick={handleComplete}
                disabled={totalAnswered < 1 || completeMut.isPending}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-40"
              >
                {completeMut.isPending ? "A concluir…" : "Concluir avaliação ✓"}
              </button>
            )
          )}
        </div>
      </main>
    </div>
  );
}

// ── AI explain panel ─────────────────────────────────────────────────────────

function ExplainPanel({
  controlId,
  cachedExplanation,
  onExplained,
}: {
  controlId: string;
  cachedExplanation?: string;
  onExplained: (text: string) => void;
}) {
  const { data, isLoading, error } = trpc.questionnaire.explainControl.useQuery(
    { controlId },
    {
      enabled: !cachedExplanation,
      staleTime: Infinity,
    }
  );

  useEffect(() => {
    if (data?.explanation && !cachedExplanation) {
      onExplained(data.explanation);
    }
  }, [data, cachedExplanation, onExplained]);

  const text = cachedExplanation ?? data?.explanation;

  if (isLoading) {
    return (
      <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-600 animate-pulse">
        A gerar explicação com IA…
      </div>
    );
  }

  if (error) {
    const isUpgrade = error.message?.includes("pro") || error.data?.code === "FORBIDDEN";
    return (
      <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
        {isUpgrade
          ? "Explicações com IA estão disponíveis nos planos Pro e MSSP."
          : `Erro: ${error.message}`}
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="mt-3 p-4 bg-blue-50 border border-blue-100 rounded-lg text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
      {text}
    </div>
  );
}

// ── Route entry ──────────────────────────────────────────────────────────────

export default function Questionnaire() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const id = sessionId ? parseInt(sessionId, 10) : null;

  if (id && !isNaN(id)) return <ActiveQuestionnaire sessionId={id} />;
  return <SessionList />;
}
