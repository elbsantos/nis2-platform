import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconLock()    { return <span className="text-gray-400">🔒</span>; }
function IconCheck()   { return <span className="text-green-500">✓</span>; }
function IconPlay()    { return <span className="text-blue-600">▶</span>; }
function IconDoc()     { return <span>📄</span>; }
function IconCert()    { return <span>🎓</span>; }

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className="h-2 rounded-full bg-blue-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 shrink-0">{value}/{max}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module card
// ---------------------------------------------------------------------------

function ModuleCard({ module, completedIds }: {
  module: any;
  completedIds: string[];
}) {
  const navigate    = useNavigate();
  const completed   = module.lessons.filter((l: any) => completedIds.includes(l.id)).length;
  const allDone     = completed === module.lessons.length;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Module header */}
      <div className={`px-6 py-4 border-b border-gray-100 ${allDone ? "bg-green-50" : "bg-gray-50"}`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-gray-900">{module.title}</h2>
          {allDone && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              Concluído
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">{module.description}</p>
        <ProgressBar value={completed} max={module.lessons.length} />
      </div>

      {/* Lesson list */}
      <div className="divide-y divide-gray-100">
        {module.lessons.map((lesson: any, index: number) => {
          const isDone   = completedIds.includes(lesson.id);
          const isLocked = lesson.locked;

          return (
            <button
              key={lesson.id}
              disabled={isLocked}
              onClick={() => !isLocked && navigate(`/course/${encodeURIComponent(lesson.id)}`)}
              className={`w-full flex items-center gap-4 px-6 py-4 text-left transition-colors
                ${isLocked
                  ? "opacity-50 cursor-not-allowed bg-gray-50"
                  : "hover:bg-blue-50 cursor-pointer"
                }`}
            >
              {/* Index / status */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold
                ${isDone   ? "bg-green-100 text-green-700"
                : isLocked ? "bg-gray-100 text-gray-400"
                :            "bg-blue-100 text-blue-700"}`}
              >
                {isDone ? <IconCheck /> : isLocked ? <IconLock /> : index + 1}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isLocked ? "text-gray-400" : "text-gray-900"}`}>
                  {lesson.title}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-400">{lesson.durationMinutes} min</span>
                  {lesson.templateCount > 0 && (
                    <span className="text-xs text-gray-400">
                      <IconDoc /> {lesson.templateCount} docs
                    </span>
                  )}
                  {isLocked && (
                    <span className="text-xs text-amber-600 font-medium">Plano Pro</span>
                  )}
                </div>
              </div>

              {!isLocked && (
                <IconPlay />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Certificate card
// ---------------------------------------------------------------------------

function CertificateCard() {
  const certMut = trpc.course.certificate.useMutation();

  function download() {
    certMut.mutate(undefined, {
      onSuccess: ({ pdfBase64, filename }) => {
        const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: "application/pdf" });
        const url   = URL.createObjectURL(blob);
        const a     = document.createElement("a");
        a.href      = url;
        a.download  = filename;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  return (
    <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-6 text-white text-center">
      <div className="text-4xl mb-3"><IconCert /></div>
      <h3 className="text-lg font-bold mb-1">Certificado de Conclusão</h3>
      <p className="text-blue-200 text-sm mb-4">
        Concluíste o curso NIS2 para PMEs em Portugal com sucesso.
      </p>
      <button
        onClick={download}
        disabled={certMut.isPending}
        className="inline-block px-6 py-2.5 bg-white text-blue-700 font-semibold text-sm rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-60"
      >
        {certMut.isPending ? "A gerar…" : "↓ Descarregar certificado (PDF)"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Course() {
  const { data: modules, isLoading: modulesLoading } = trpc.course.getModules.useQuery();
  const { data: progress, isLoading: progressLoading } = trpc.course.getProgress.useQuery();

  const isLoading = modulesLoading || progressLoading;
  const completedIds = progress?.completedIds ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">Curso NIS2 para PMEs em Portugal</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          7 aulas · 2 módulos · 35 documentos prontos a usar
        </p>

        {progress && (
          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progresso geral</span>
              <span className="text-sm text-gray-500">
                {progress.completed}/{progress.total} aulas concluídas
              </span>
            </div>
            <ProgressBar value={progress.completed} max={progress.total} />
          </div>
        )}
      </div>

      {/* Certificate (if complete) */}
      {progress?.certificateIssuedAt && (
        <div className="mb-8">
          <CertificateCard />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16 text-slate-400 text-sm">A carregar curso…</div>
      )}

      {/* Module list */}
      {!isLoading && modules && (
        <div className="space-y-6">
          {modules.map((module: any) => (
            <ModuleCard
              key={module.id}
              module={module}
              completedIds={completedIds}
            />
          ))}
        </div>
      )}

      {/* Pro upsell (if free plan and module 2 locked) */}
      {!isLoading && modules && modules.some((m: any) => m.lessons.some((l: any) => l.locked)) && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
          <p className="text-sm font-semibold text-amber-800 mb-1">
            🔒 Módulo 2 disponível no plano Pro
          </p>
          <p className="text-xs text-amber-700 mb-3">
            Desbloqueia 3 aulas sobre medidas técnicas, gestão de incidentes e auditorias CNCS.
          </p>
          <a
            href="/billing"
            className="inline-block px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800"
          >
            Ver planos →
          </a>
        </div>
      )}
    </div>
  );
}
