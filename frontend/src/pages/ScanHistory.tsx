import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<string, string> = {
  completed: "Concluído",
  running:   "A correr",
  pending:   "Na fila",
  failed:    "Falhou",
};

const STATUS_CLASSES: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  running:   "bg-blue-100 text-blue-800",
  pending:   "bg-gray-100 text-gray-600",
  failed:    "bg-red-100 text-red-800",
};

export default function ScanHistory() {
  const [page, setPage] = useState(0);

  const { data: scans, isLoading, error } = trpc.scan.list.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const hasPrev = page > 0;
  const hasNext = (scans?.length ?? 0) === PAGE_SIZE;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Histórico de Scans</h1>
          <p className="text-sm text-slate-400 mt-0.5">Todos os scans da tua organização</p>
        </div>
        <Link
          to="/scan/start"
          className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800"
        >
          + Novo scan
        </Link>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16 text-slate-400 text-sm">A carregar…</div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          Erro ao carregar histórico: {error.message}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && scans?.length === 0 && (
        <div className="text-center py-16">
          <p className="text-slate-400 text-sm mb-4">Ainda não executaste nenhum scan.</p>
          <Link
            to="/scan/start"
            className="inline-block px-4 py-2 bg-blue-700 text-white text-sm rounded-md hover:bg-blue-800"
          >
            Iniciar primeiro scan
          </Link>
        </div>
      )}

      {/* Scan list */}
      {scans && scans.length > 0 && (
        <>
          <div className="space-y-3">
            {scans.map((scan) => {
              const results = scan.results as any;
              const isCompleted = scan.status === "completed";
              const critical = results?.criticalCount ?? 0;

              return (
                <Link
                  key={scan.id}
                  to={`/scan/results/${scan.id}`}
                  className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[scan.status]}`}
                        >
                          {STATUS_LABEL[scan.status]}
                        </span>
                        <span className="text-xs text-gray-400">#{scan.id}</span>
                      </div>
                      <p className="font-mono text-sm font-medium text-gray-900 truncate">
                        {scan.target}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(scan.createdAt).toLocaleString("pt-PT")}
                      </p>
                    </div>

                    {isCompleted && results && (
                      <div className="text-right shrink-0">
                        {critical > 0 ? (
                          <p className="text-sm font-semibold text-red-600">
                            {critical} crítica{critical !== 1 ? "s" : ""}
                          </p>
                        ) : (
                          <p className="text-sm font-semibold text-green-600">Sem críticas</p>
                        )}
                        <p className="text-xs text-gray-400">
                          {results.vulnerabilitiesFound} vuln.
                        </p>
                      </div>
                    )}

                    <svg className="shrink-0 h-4 w-4 text-gray-300 self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
              className="px-3 py-1.5 text-sm border border-slate-600 rounded-md text-slate-300 disabled:opacity-40 hover:bg-slate-700/50 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            <span className="text-xs text-slate-400">Página {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
              className="px-3 py-1.5 text-sm border border-slate-600 rounded-md text-slate-300 disabled:opacity-40 hover:bg-slate-700/50 disabled:cursor-not-allowed"
            >
              Seguinte →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
