import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { answerTone, answerLabel, answerSelectedClasses, answerIdleClasses, type AnswerValue } from "../lib/answerTone";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { SectionHeader } from "../components/ui/SectionHeader";
import { InfoNote } from "../components/ui/InfoNote";
import { Icon } from "../components/ui/Icon";
import { Alert } from "../components/ui/Alert";
import { ClipboardList, Plus, CheckCircle2 } from "lucide-react";

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
      <InfoNote>
        <p><strong className="text-text">O que é.</strong> Um conjunto de perguntas sobre como a sua empresa gere a segurança da informação — desde cópias de segurança e controlo de acessos até formação e resposta a incidentes. Cobre as medidas que a NIS2 exige.</p>
        <p><strong className="text-text">Porque existe.</strong> A NIS2 exige que as empresas apliquem um conjunto de medidas de segurança. O questionário mede, medida a medida, onde está a sua empresa — o que já cumpre e o que falta. É a base do seu grau de conformidade.</p>
        <p><strong className="text-text">Quando fazer.</strong> Depois do enquadramento. As respostas alimentam o seu score e vários documentos.</p>
        <p><strong className="text-text">Uma nota:</strong> responda com honestidade. Se uma medida não se aplica à sua empresa, pode indicá-lo. O objetivo é um retrato verdadeiro, não uma pontuação alta artificial.</p>
      </InfoNote>

      <SectionHeader
        eyebrow="AUTOAVALIAÇÃO · NIS2 ART. 21"
        title="Questionário NIS2"
        description="42 controlos do Art. 21(2) da Directiva NIS2."
        action={
          <Button onClick={() => startMut.mutate({})} disabled={startMut.isPending}>
            <Icon as={Plus} />
            {startMut.isPending ? "A iniciar…" : "Nova avaliação"}
          </Button>
        }
      />

      {isLoading && (
        <div className="text-center py-16 text-dim text-sm">A carregar…</div>
      )}

      {!isLoading && sessions?.length === 0 && (
        <Card className="text-center py-16 px-4">
          <Icon as={ClipboardList} className="mx-auto mb-4 text-dim" size={40} />
          <p className="text-text font-medium mb-2">Ainda não fez nenhuma avaliação</p>
          <p className="text-sm text-dim mb-6">
            O questionário avalia a conformidade da sua empresa com os 42 controlos obrigatórios do Art. 21(2) da NIS2.
          </p>
          <Button onClick={() => startMut.mutate({})} disabled={startMut.isPending}>
            {startMut.isPending ? "A iniciar…" : "Iniciar primeira avaliação"}
          </Button>
        </Card>
      )}

      {sessions && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((s) => {
            const score   = s.score ? parseInt(s.score) : null;
            const answers = (s.answers as any[]) ?? [];
            const done    = s.status === "completed";
            const scoreTone = score === null ? "" : score >= 80 ? "bg-ok" : score >= 60 ? "bg-warn" : "bg-bad";
            return (
              <Card key={s.id} className="p-4 hover:border-accent/50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <button
                    className="flex-1 text-left"
                    onClick={() => navigate(`/questionnaire/${s.id}`)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone={done ? "ok" : "info"}>{done ? "Concluído" : "Em curso"}</Badge>
                      <span className="text-xs text-faint">#{s.id}</span>
                    </div>
                    <p className="text-sm text-dim">
                      {answers.length}/42 controlos respondidos
                    </p>
                    <p className="text-xs text-faint mt-0.5">
                      {new Date(s.createdAt).toLocaleDateString("pt-PT")}
                    </p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    {done && (
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => navigate(`/questionnaire/${s.id}/report`)}
                      >
                        Ver relatório
                      </Button>
                    )}
                    {score !== null && (
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${scoreTone}`}
                      >
                        {score}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
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
  const totalControls = controls.length;
  const missingCount  = Math.max(totalControls - totalAnswered, 0);
  const canComplete   = totalControls > 0 && totalAnswered === totalControls;

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
            {totalAnswered}/{totalControls} respondidos
          </p>
          {/* Progress bar */}
          <div className="w-full bg-slate-700 rounded-full h-1.5 mb-4">
            <div
              className="h-1.5 rounded-full bg-blue-600 transition-all"
              style={{ width: `${totalControls > 0 ? (totalAnswered / totalControls) * 100 : 0}%` }}
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
              <>
                <button
                  onClick={handleComplete}
                  disabled={!canComplete || completeMut.isPending}
                  className="w-full px-3 py-2 text-xs bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-40"
                >
                  {completeMut.isPending ? "A concluir…" : "Concluir avaliação"}
                </button>
                {!canComplete && missingCount > 0 && (
                  <p className="text-xs text-amber-400 text-center">
                    Faltam {missingCount} pergunta{missingCount === 1 ? "" : "s"} para concluir
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {isCompleted && (
          <Card className="p-5 mb-4 border-ok/40 flex items-center justify-between gap-4">
            <span className="text-sm text-text flex items-center gap-2">
              <Icon as={CheckCircle2} className="text-ok" />
              Avaliação concluída — Score: <strong>{session.score}/100</strong>
            </span>
            <Button
              variant="primary"
              className="px-3 py-1.5 text-xs shrink-0"
              onClick={() => navigate(`/questionnaire/${sessionId}/report`)}
            >
              Ver relatório
            </Button>
          </Card>
        )}

        <div className="mb-4">
          <h2 className="text-lg font-bold text-text">
            Art. 21(2)({activeArticle}) — {ARTICLE_LABELS[activeArticle]}
          </h2>
          <p className="text-xs text-dim mt-0.5">
            {answeredIn(activeArticle)}/{byArticle(activeArticle).length} controlos respondidos
          </p>
        </div>

        <div className="space-y-6">
          {byArticle(activeArticle).map((control) => {
            const current = answers[control.id];
            return (
              <Card key={control.id} className="p-5 mb-3">
                <p className="text-sm font-medium text-text mb-1">
                  <span className="font-mono text-xs text-accent mr-2">{control.id}</span>
                  {control.question}
                </p>
                <p className="text-xs text-dim mb-4">{control.helpText}</p>

                {/* Answer buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {(["yes", "partial", "no", "na"] as AnswerValue[]).map((val) => (
                    <button
                      key={val}
                      disabled={isCompleted}
                      onClick={() => setAnswer(control.id, val)}
                      className={`px-4 py-1.5 text-xs font-medium border rounded-full transition-all ${
                        current === val ? answerSelectedClasses[answerTone[val]] : answerIdleClasses
                      }`}
                    >
                      {answerLabel[val]}
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
                  className="text-xs text-accent hover:underline"
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
              </Card>
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
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={handleComplete}
                  disabled={!canComplete || completeMut.isPending}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-40"
                >
                  {completeMut.isPending ? "A concluir…" : "Concluir avaliação ✓"}
                </button>
                {!canComplete && missingCount > 0 && (
                  <p className="text-xs text-amber-400">
                    Faltam {missingCount} pergunta{missingCount === 1 ? "" : "s"} para concluir
                  </p>
                )}
              </div>
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
      <Alert tone="info" className="mt-3">
        A gerar explicação com IA…
      </Alert>
    );
  }

  if (error) {
    const isUpgrade = error.message?.includes("pro") || error.data?.code === "FORBIDDEN";
    return (
      <Alert tone="warn" className="mt-3">
        {isUpgrade
          ? "Explicações com IA estão disponíveis nos planos Pro e MSSP."
          : `Erro: ${error.message}`}
      </Alert>
    );
  }

  if (!text) return null;

  return (
    <div className="mt-3 p-4 bg-field border border-line rounded-xl text-xs text-dim leading-relaxed whitespace-pre-wrap">
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
