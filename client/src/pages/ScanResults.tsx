import { useParams, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { trpc } from "../lib/trpc";
import Nis2ScoreChart from "../components/Nis2ScoreChart";

// Poll interval while scan is running (ms)
const POLL_INTERVAL = 4_000;

export default function ScanResults() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate    = useNavigate();
  const id          = parseInt(scanId ?? "", 10);

  const { data: scan, isLoading, error } = trpc.scan.getById.useQuery(
    { scanId: id },
    {
      enabled: !isNaN(id),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "pending" || status === "running" ? POLL_INTERVAL : false;
      },
    }
  );

  // Redirect on invalid ID
  if (isNaN(id)) {
    navigate("/scan/history", { replace: true });
    return null;
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Spinner />
        <p className="mt-4 text-gray-500 text-sm">A carregar resultados…</p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !scan) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-red-600 font-medium">Scan não encontrado</p>
        <Link to="/scan/history" className="mt-4 inline-block text-sm text-blue-700 hover:underline">
          ← Ver histórico
        </Link>
      </div>
    );
  }

  // ── Scan failed ──────────────────────────────────────────────────────────
  if (scan.status === "failed") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-2xl mb-3">⚠️</p>
        <p className="font-semibold text-gray-800 mb-1">Scan falhou</p>
        <p className="text-sm text-gray-500 mb-6">
          Verifica que o DNS TXT record está correcto e tenta novamente.
        </p>
        <Link
          to="/scan/start"
          className="inline-block px-4 py-2 bg-blue-700 text-white text-sm rounded-md hover:bg-blue-800"
        >
          Novo scan
        </Link>
      </div>
    );
  }

  // ── Running / pending ────────────────────────────────────────────────────
  if (scan.status === "pending" || scan.status === "running") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Spinner size="lg" />
        <p className="mt-6 text-gray-700 font-medium">
          {scan.status === "pending" ? "Scan na fila…" : "A executar scan NIS2…"}
        </p>
        <p className="text-sm text-gray-400 mt-2">
          A analisar <span className="font-mono">{scan.target}</span> via Shodan + Censys.
          Pode demorar 1–3 minutos.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          {["Verificação de ownership", "Análise Shodan", "Análise TLS Censys", "Score NIS2"].map(
            (step, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
                  <span className="text-blue-700 text-xs font-bold">{i + 1}</span>
                </div>
                <span className="text-xs text-gray-400 max-w-[70px] text-center">{step}</span>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  // ── Completed ────────────────────────────────────────────────────────────
  const results  = scan.results as any;
  const vulnCount = results?.vulnerabilitiesFound ?? 0;
  const critical  = results?.criticalCount ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/scan/history" className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
            ← Histórico
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{scan.target}</h1>
          <p className="text-sm text-gray-400">
            Scan #{scan.id} · {new Date(scan.completedAt ?? scan.createdAt).toLocaleString("pt-PT")}
          </p>
        </div>
        <div className="flex gap-2">
          <PdfButton scanId={scan.id} type="executive" label="PDF Executivo" />
          <PdfButton scanId={scan.id} type="technical" label="PDF Técnico" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Vulnerabilidades" value={String(vulnCount)} accent={vulnCount > 0} />
        <SummaryCard label="Críticas" value={String(critical)} accent={critical > 0} danger />
        <SummaryCard label="Duração" value={scan.completedAt ? elapsedLabel(scan.startedAt, scan.completedAt) : "—"} />
      </div>

      {/* NIS2 score chart — requires full scan data from executor */}
      <section className="bg-white border border-[#e8e4db] rounded-xl p-6">
        <h2 className="text-base font-semibold text-[#0f1e38] mb-4">Score NIS2 por Artigo</h2>
        {results?.nis2Scores ? (
          <Nis2ScoreChart scores={results.nis2Scores} />
        ) : (
          <p className="text-sm text-gray-400">Dados de score não disponíveis para este scan.</p>
        )}
      </section>

      {/* Vulnerability list */}
      <section className="bg-white border border-[#e8e4db] rounded-xl p-6">
        <h2 className="text-base font-semibold text-[#0f1e38] mb-4">
          Vulnerabilidades
          {vulnCount > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">({vulnCount})</span>
          )}
        </h2>
        <VulnerabilityListFromScan scanId={scan.id} />
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
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
        <Link
          to={`/remediation?scanId=${scan.id}`}
          className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800"
        >
          Gerar plano de remediação IA
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ size = "md" }: { size?: "md" | "lg" }) {
  const cls = size === "lg" ? "h-12 w-12" : "h-8 w-8";
  return (
    <svg className={`${cls} animate-spin text-blue-700 mx-auto`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function SummaryCard({
  label, value, accent = false, danger = false,
}: {
  label: string; value: string; accent?: boolean; danger?: boolean;
}) {
  return (
    <div className="bg-white border border-[#e8e4db] rounded-lg p-4 text-center">
      <p className={`text-2xl font-bold ${danger && accent ? "text-red-600" : accent ? "text-amber-600" : "text-[#0f1e38]"}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function PdfButton({ scanId, type, label }: { scanId: number; type: string; label: string }) {
  return (
    <a
      href={`/api/trpc/report.generate?input=${encodeURIComponent(JSON.stringify({ scanId, type }))}`}
      className="px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-md hover:bg-blue-800 transition-colors"
      title={label}
    >
      ↓ {label}
    </a>
  );
}

const RICH_SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high:     "bg-orange-100 text-orange-800",
  medium:   "bg-yellow-100 text-yellow-800",
  low:      "bg-blue-100 text-blue-800",
};

const RICH_SEVERITY_LABEL: Record<string, string> = {
  critical: "Crítica",
  high:     "Alta",
  medium:   "Média",
  low:      "Baixa",
};

function RichVulnCard({ vuln }: { vuln: any }) {
  const score = typeof vuln.cvssScore === "number"
    ? vuln.cvssScore.toFixed(1)
    : vuln.cvssScore;

  return (
    <div className="bg-[#f8f5ee] border border-[#e8e4db] rounded-lg p-3 flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${RICH_SEVERITY_CLASSES[vuln.severity] ?? "bg-gray-100 text-gray-700"}`}>
          {RICH_SEVERITY_LABEL[vuln.severity] ?? vuln.severity}
        </span>
        <span className="text-xs text-gray-500 shrink-0">CVSS {score}</span>
      </div>
      <p className="font-mono text-xs font-bold text-[#0f1e38]">{vuln.cveId}</p>
      {(vuln.affectedService ?? vuln.affectedComponent) && (
        <p className="text-xs text-[#152744] font-medium truncate">
          {vuln.affectedService ?? vuln.affectedComponent}
        </p>
      )}
      <p className="text-xs text-gray-600 line-clamp-3 flex-1">{vuln.description}</p>
      {vuln.nis2Articles?.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-[#e8e4db]">
          {vuln.nis2Articles.map((a: string) => (
            <span key={a} className="text-[10px] bg-[#0f1e38] text-[#f0c040] px-1.5 py-0.5 rounded font-medium">{a}</span>
          ))}
          {vuln.cisControls?.map((c: string) => (
            <span key={c} className="text-[10px] bg-[#152744] text-white px-1.5 py-0.5 rounded">{c}</span>
          ))}
          {vuln.iso27001Controls?.map((c: string) => (
            <span key={c} className="text-[10px] bg-[#1a5c38] text-white px-1.5 py-0.5 rounded">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function VulnerabilityListFromScan({ scanId }: { scanId: number }) {
  const { data, isLoading } = trpc.scan.getById.useQuery({ scanId });
  const [filter, setFilter] = useState<"all" | "critical" | "high" | "medium" | "low">("all");

  if (isLoading) return <p className="text-sm text-gray-400">A carregar…</p>;

  const results  = (data?.results as any) ?? {};
  const allVulns: any[] = results.vulnerabilities ?? [];

  if (allVulns.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">
        Nenhuma vulnerabilidade registada.
      </p>
    );
  }

  const counts = {
    critical: allVulns.filter((v: any) => v.severity === "critical").length,
    high:     allVulns.filter((v: any) => v.severity === "high").length,
    medium:   allVulns.filter((v: any) => v.severity === "medium").length,
    low:      allVulns.filter((v: any) => v.severity === "low").length,
  };

  const filtered = filter === "all" ? allVulns : allVulns.filter((v: any) => v.severity === filter);
  const filterLabels: Record<string, string> = {
    all: "Todas", critical: "Críticas", high: "Altas", medium: "Médias", low: "Baixas",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["all", "critical", "high", "medium", "low"] as const).map((sev) => {
          const count = sev === "all" ? allVulns.length : counts[sev];
          return (
            <button
              key={sev}
              onClick={() => setFilter(sev)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === sev
                  ? "bg-[#0f1e38] text-white"
                  : "bg-[#e8e4db] text-[#0f1e38] hover:bg-[#d8d4cb]"
              }`}
            >
              {filterLabels[sev]} ({count})
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((vuln: any, i: number) => (
          <RichVulnCard key={`${vuln.cveId}-${i}`} vuln={vuln} />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-6">
          Nenhuma vulnerabilidade com este filtro.
        </p>
      )}
    </div>
  );
}

function elapsedLabel(start?: Date | string | null, end?: Date | string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}min`;
}
