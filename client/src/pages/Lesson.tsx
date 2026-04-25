import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

// ---------------------------------------------------------------------------
// Template type icons
// ---------------------------------------------------------------------------

const TYPE_ICON: Record<string, string> = {
  xlsx: "📊", pdf: "📄", docx: "📝", pptx: "📊",
};
const TYPE_LABEL: Record<string, string> = {
  xlsx: "Excel", pdf: "PDF", docx: "Word", pptx: "PowerPoint",
};

// ---------------------------------------------------------------------------
// Video placeholder
// ---------------------------------------------------------------------------

function VideoPlaceholder({ title, duration }: { title: string; duration: number }) {
  return (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden" style={{ paddingTop: "56.25%" }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <p className="text-white font-semibold text-sm mb-1">{title}</p>
        <p className="text-gray-400 text-xs">{duration} minutos</p>
        <div className="mt-4 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg">
          <p className="text-amber-300 text-xs font-medium">
            🎬 Vídeo disponível em Maio 2026
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates section
// ---------------------------------------------------------------------------

function TemplatesSection({ templates }: { templates: any[] }) {
  if (templates.length === 0) return null;
  const available = templates.filter((t) => t.available);
  const pending   = templates.filter((t) => !t.available);

  return (
    <section>
      <h3 className="text-sm font-bold text-gray-900 mb-3">
        📁 Templates desta aula ({templates.length})
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {templates.map((t: any) => (
          <div
            key={t.name}
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors
              ${t.available
                ? "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                : "border-gray-100 bg-gray-50"
              }`}
          >
            <span className="text-xl shrink-0 mt-0.5">{TYPE_ICON[t.type] ?? "📎"}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${t.available ? "text-gray-900" : "text-gray-400"}`}>
                {t.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-gray-400">{TYPE_LABEL[t.type]}</span>
                {t.available ? (
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 font-medium hover:underline"
                  >
                    ↓ Descarregar
                  </a>
                ) : (
                  <span className="text-xs text-amber-600">Em breve</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          {pending.length} template(s) disponíveis em Maio 2026 após configuração do servidor.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Quiz section
// ---------------------------------------------------------------------------

function QuizSection({ lessonId, questions }: {
  lessonId: string;
  questions: Array<{ id: string; question: string; options: string[] }>;
}) {
  const [answers, setAnswers]    = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults]    = useState<any>(null);

  const submitMut = trpc.course.submitQuiz.useMutation({
    onSuccess: (data) => {
      setResults(data);
      setSubmitted(true);
    },
  });

  function handleSubmit() {
    const payload = Object.entries(answers).map(([questionId, selectedIndex]) => ({
      questionId,
      selectedIndex,
    }));
    submitMut.mutate({ lessonId, answers: payload });
  }

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  if (questions.length === 0) return null;

  return (
    <section>
      <h3 className="text-sm font-bold text-gray-900 mb-1">🧠 Quiz da aula</h3>
      <p className="text-xs text-gray-400 mb-4">
        {questions.length} perguntas · pontuação mínima para aprovação: 60%
      </p>

      {/* Score result */}
      {submitted && results && (
        <div className={`mb-5 p-4 rounded-xl border ${
          results.passed
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${results.passed ? "bg-green-500" : "bg-red-500"}`}>
              {results.score}
            </div>
            <div>
              <p className={`font-semibold text-sm ${results.passed ? "text-green-800" : "text-red-800"}`}>
                {results.passed ? "Aprovado!" : "Não aprovado"}
              </p>
              <p className="text-xs text-gray-500">
                {results.correct}/{results.total} respostas correctas
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {questions.map((q, qi) => {
          const result = results?.results?.find((r: any) => r.questionId === q.id);
          return (
            <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-900 mb-3">
                <span className="text-blue-600 font-mono text-xs mr-2">{qi + 1}.</span>
                {q.question}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const isSelected = answers[q.id] === oi;
                  const isCorrect  = result?.correctIndex === oi;
                  const isWrong    = submitted && isSelected && !result?.correct;

                  let cls = "border-gray-200 text-gray-700";
                  if (submitted) {
                    if (isCorrect)     cls = "border-green-400 bg-green-50 text-green-800 font-medium";
                    else if (isWrong)  cls = "border-red-400 bg-red-50 text-red-700";
                    else if (isSelected) cls = "border-gray-300 text-gray-500";
                  } else if (isSelected) {
                    cls = "border-blue-500 bg-blue-50 text-blue-800";
                  }

                  return (
                    <button
                      key={oi}
                      disabled={submitted}
                      onClick={() => !submitted && setAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                      className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors
                        ${cls} ${!submitted ? "hover:border-blue-400 hover:bg-blue-50" : ""}`}
                    >
                      <span className="font-mono text-xs text-gray-400 mr-2">
                        {["A", "B", "C", "D"][oi]}.
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {submitted && result?.explanation && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 leading-relaxed">
                  💡 {result.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitMut.isPending}
          className="mt-5 w-full py-3 bg-blue-700 text-white text-sm font-medium rounded-xl
            hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitMut.isPending
            ? "A verificar…"
            : allAnswered
            ? "Submeter respostas"
            : `Responde a todas as ${questions.length} perguntas para submeter`}
        </button>
      )}

      {submitted && !results?.passed && (
        <button
          onClick={() => { setSubmitted(false); setAnswers({}); setResults(null); }}
          className="mt-3 w-full py-2.5 border border-gray-300 text-sm text-gray-700 rounded-xl
            hover:bg-gray-50 transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Lesson() {
  const { lessonId }  = useParams<{ lessonId: string }>();
  const navigate      = useNavigate();
  const decodedId     = lessonId ? decodeURIComponent(lessonId) : "";
  const utils         = trpc.useUtils();

  const { data: lesson, isLoading, error } = trpc.course.getLesson.useQuery(
    { lessonId: decodedId },
    { enabled: !!decodedId }
  );

  const completeMut = trpc.course.markComplete.useMutation({
    onSuccess: (data) => {
      utils.course.getProgress.invalidate();
      utils.course.getModules.invalidate();
      if (data.courseComplete && data.certificateUrl) {
        navigate("/course");
      }
    },
  });

  if (isLoading) {
    return <div className="text-center py-20 text-gray-400 text-sm">A carregar aula…</div>;
  }

  if (error || !lesson) {
    const isLocked = error?.data?.code === "FORBIDDEN";
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        {isLocked ? (
          <>
            <p className="text-2xl mb-3">🔒</p>
            <p className="font-semibold text-gray-800 mb-2">Módulo 2 — Plano Pro</p>
            <p className="text-sm text-gray-500 mb-6">
              {error?.message}
            </p>
            <a
              href="/billing"
              className="inline-block px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800"
            >
              Ver planos →
            </a>
          </>
        ) : (
          <>
            <p className="text-red-500 font-medium mb-2">Aula não encontrada</p>
            <Link to="/course" className="text-sm text-blue-600 hover:underline">
              ← Voltar ao curso
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Link to="/course" className="hover:text-gray-600">Curso</Link>
        <span>›</span>
        <span className="text-gray-600 truncate">{lesson.title}</span>
      </div>

      {/* Video */}
      <VideoPlaceholder title={lesson.title} duration={lesson.durationMinutes} />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">{lesson.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{lesson.description}</p>
        <div className="flex items-center gap-4 mt-3">
          <span className="text-xs text-gray-400">⏱ {lesson.durationMinutes} min</span>
          {lesson.completed && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              ✓ Concluído
            </span>
          )}
        </div>
      </div>

      {/* Templates */}
      <TemplatesSection templates={lesson.templates} />

      {/* Quiz */}
      <QuizSection lessonId={decodedId} questions={lesson.quiz} />

      {/* Complete button */}
      {!lesson.completed && (
        <div className="border-t border-gray-100 pt-6">
          <button
            onClick={() => completeMut.mutate({ lessonId: decodedId })}
            disabled={completeMut.isPending}
            className="w-full py-3 bg-green-600 text-white font-semibold text-sm rounded-xl
              hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {completeMut.isPending ? "A registar…" : "✓ Marcar aula como concluída"}
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">
            Podes concluir sem fazer o quiz — o progresso fica guardado na plataforma.
          </p>
        </div>
      )}

      {lesson.completed && (
        <div className="border-t border-gray-100 pt-6 flex justify-between">
          <Link
            to="/course"
            className="px-4 py-2 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50"
          >
            ← Voltar ao curso
          </Link>
          <Link
            to="/course"
            className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800"
          >
            Próxima aula →
          </Link>
        </div>
      )}
    </div>
  );
}
