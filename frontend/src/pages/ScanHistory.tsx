import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Alert } from "../components/ui/Alert";
import { Icon } from "../components/ui/Icon";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<string, string> = {
  completed: "Concluído",
  running:   "A correr",
  pending:   "Na fila",
  failed:    "Falhou",
};

function statusTone(s: string) {
  return s === "completed" ? "ok" : s === "failed" ? "bad" : s === "running" ? "info" : "neutral";
}

export default function ScanHistory() {
  const [page, setPage] = useState(0);

  const { data: scans, isLoading, error } = trpc.scan.list.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const hasPrev = page > 0;
  const hasNext = (scans?.length ?? 0) === PAGE_SIZE;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text">Histórico de Scans</h1>
          <p className="text-sm text-dim mt-0.5">Todos os scans da sua organização</p>
        </div>
        <Link to="/scan/start">
          <Button variant="primary">
            <Icon as={Plus} />
            Novo scan
          </Button>
        </Link>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16 text-dim text-sm">A carregar…</div>
      )}

      {/* Error */}
      {error && (
        <Alert tone="bad">
          Erro ao carregar histórico: {error.message}
        </Alert>
      )}

      {/* Empty */}
      {!isLoading && !error && scans?.length === 0 && (
        <div className="text-center py-16">
          <p className="text-dim text-sm mb-4">Ainda não executou nenhum scan.</p>
          <Link to="/scan/start">
            <Button variant="primary">Iniciar primeiro scan</Button>
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
                <Link key={scan.id} to={`/scan/results/${scan.id}`}>
                  <Card className="p-4 hover:border-accent/50 transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge tone={statusTone(scan.status)}>{STATUS_LABEL[scan.status]}</Badge>
                          <span className="text-xs text-faint">#{scan.id}</span>
                        </div>
                        <p className="font-mono text-sm font-medium text-text truncate">
                          {scan.target}
                        </p>
                        <p className="text-xs text-faint mt-0.5">
                          {new Date(scan.createdAt).toLocaleString("pt-PT")}
                        </p>
                      </div>

                      {isCompleted && results && (
                        <div className="text-right shrink-0">
                          {critical > 0 ? (
                            <p className="text-sm font-semibold text-bad">
                              {critical} crítica{critical !== 1 ? "s" : ""}
                            </p>
                          ) : (
                            <p className="text-sm font-semibold text-ok">Sem críticas</p>
                          )}
                          <p className="text-xs text-faint">
                            {results.vulnerabilitiesFound} vuln.
                          </p>
                        </div>
                      )}

                      <Icon as={ChevronRight} className="shrink-0 text-faint self-center" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="ghost"
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
            >
              <Icon as={ChevronLeft} />
              Anterior
            </Button>
            <span className="text-xs text-dim">Página {page + 1}</span>
            <Button
              variant="ghost"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
            >
              Seguinte
              <Icon as={ChevronRight} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
