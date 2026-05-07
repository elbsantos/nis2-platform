import { useParams, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const POLL_INTERVAL = 4_000;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type ScanStatus = "pending" | "running" | "completed" | "failed";

function statusLabel(s: ScanStatus) {
  if (s === "pending")   return "Na fila…";
  if (s === "running")   return "A executar…";
  if (s === "completed") return "Concluído";
  return "Falhou";
}

function StatusDot({ status }: { status: ScanStatus }) {
  const cls: Record<ScanStatus, string> = {
    pending:   "bg-gray-300",
    running:   "bg-blue-500 animate-pulse",
    completed: "bg-green-500",
    failed:    "bg-red-500",
  };
  return <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cls[status]}`} />;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label, value, color = "gray", animate = false,
}: {
  label: string; value: number; color?: "gray" | "green" | "blue" | "red"; animate?: boolean;
}) {
  const text: Record<string, string> = {
    gray: "text-gray-800", green: "text-green-700", blue: "text-blue-700", red: "text-red-700",
  };
  const bg: Record<string, string> = {
    gray: "bg-white", green: "bg-green-50", blue: "bg-blue-50", red: "bg-red-50",
  };
  return (
    <div className={`${bg[color]} border border-gray-200 rounded-lg p-4 text-center`}>
      <p className={`text-2xl font-bold ${text[color]} ${animate ? "animate-pulse" : ""}`}>
        {value}
      </p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BulkScanResults() {
  const { batchId } = useParams<{ batchId: string }>();

  const { data: scans, isLoading } = trpc.scan.getBatch.useQuery(
    { batchId: batchId! },
    {
      enabled: !!batchId,
      refetchInterval: (query) => {
        const data = query.state.data ?? [];
        const anyActive = data.some(
          (s) => s.status === "pending" || s.status === "running"
        );
        return anyActive ? POLL_INTERVAL : false;
      },
    }
  );

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-gray-500 text-sm">A carregar batch…</p>
      </div>
    );
  }

  if (!scans?.length) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 text-sm">Batch não encontrado.</p>
        <Link to="/scan/start" className="mt-4 inline-block text-sm text-blue-700 hover:underline">
          ← Novo scan
        </Link>
      </div>
    );
  }

  const total     = scans.length;
  const completed = scans.filter((s) => s.status === "completed").length;
  const failed    = scans.filter((s) => s.status === "failed").length;
  const running   = total - completed - failed;
  const allDone   = running === 0;

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <Link to="/scan/history" className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
        ← Histórico
      </Link>
      <h1 className="text-xl font-bold text-gray-900 mt-1 mb-0.5">Scan em Lote</h1>
      <p className="text-xs text-gray-400 font-mono mb-6">{batchId}</p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total"      value={total}     />
        <StatCard label="Concluídos" value={completed}  color="green" />
        <StatCard label="Em curso"   value={running}    color="blue"  animate={running > 0} />
        <StatCard label="Falhados"   value={failed}     color="red"   />
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>Progresso geral</span>
          <span>{completed}/{total} ({pct}%)</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Scan list */}
      <div className="space-y-2">
        {scans.map((scan) => {
          const results = scan.results as any;
          const score   = results?.overallScore;
          const critical = results?.criticalCount ?? 0;
          const high     = results?.highCount ?? 0;

          return (
            <div
              key={scan.id}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3"
            >
              <StatusDot status={scan.status as ScanStatus} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{scan.target}</p>
                <p className="text-xs text-gray-400">{statusLabel(scan.status as ScanStatus)}</p>
              </div>

              {scan.status === "completed" && (
                <div className="hidden sm:flex items-center gap-4 text-xs">
                  {score !== undefined && (
                    <span
                      className={`font-semibold ${
                        score >= 80
                          ? "text-green-700"
                          : score >= 50
                          ? "text-amber-600"
                          : "text-red-600"
                      }`}
                    >
                      {score} pts
                    </span>
                  )}
                  {critical > 0 && (
                    <span className="text-red-600 font-medium">{critical} crítica{critical !== 1 ? "s" : ""}</span>
                  )}
                  {critical === 0 && high > 0 && (
                    <span className="text-orange-600">{high} alt{high !== 1 ? "as" : "a"}</span>
                  )}
                  {critical === 0 && high === 0 && (
                    <span className="text-green-600">Sem críticas</span>
                  )}
                </div>
              )}

              {scan.status === "completed" && (
                <Link
                  to={`/scan/results/${scan.id}`}
                  className="px-3 py-1.5 text-xs bg-blue-700 text-white rounded-md hover:bg-blue-800 shrink-0"
                >
                  Ver →
                </Link>
              )}

              {scan.status === "failed" && (
                <span className="text-xs text-red-500">Falhou</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions after all done */}
      {allDone && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/scan/start"
            className="px-4 py-2 border border-gray-300 text-sm rounded-md text-gray-700 hover:bg-gray-50"
          >
            Novo scan
          </Link>
          <Link
            to="/scan/history"
            className="px-4 py-2 border border-gray-300 text-sm rounded-md text-gray-700 hover:bg-gray-50"
          >
            Ver histórico
          </Link>
          {completed > 0 && (
            <Link
              to={`/remediation?batchId=${batchId}`}
              className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800"
            >
              Gerar plano de remediação IA
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
