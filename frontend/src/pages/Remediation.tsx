import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { PageHeader } from "../components/ui/PageHeader";
import { DataTable, type ColumnDef } from "../components/ui/DataTable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status   = "todo" | "in_progress" | "done" | "wont_fix";
type Severity = "critical" | "high" | "medium" | "low";
type Effort   = "low" | "medium" | "high";
type ScanMode = "sme" | "supply";
type OsTab    = "all" | "windows" | "linux";

type RemItem = {
  id:                number;
  scanId:            number | null;
  title:             string;
  steps:             { order: number; instruction: string; platform: string }[] | null;
  effort:            Effort;
  status:            Status;
  nis2Articles:      string[] | null;
  dueDate:           Date | null;
  target:            string | null;
  mode:              ScanMode | null;
  cveId:             string | null;
  severity:          Severity | null;
  cvssScore:         string | null;
  affectedComponent: string | null;
};

type ScanGroup = {
  scanId: number | null;
  target: string;
  mode:   ScanMode | null;
  items:  RemItem[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<Status, string> = {
  todo:        "Por fazer",
  in_progress: "Em curso",
  done:        "Concluído",
  wont_fix:    "Não corrigir",
};

const STATUS_BADGE: Record<Status, string> = {
  todo:        "bg-red-900/40 text-red-400 border border-red-700",
  in_progress: "bg-blue-900/40 text-blue-400 border border-blue-700",
  done:        "bg-green-900/40 text-green-400 border border-green-700",
  wont_fix:    "bg-slate-700 text-slate-400 border border-slate-600",
};

const SEV_BADGE: Record<Severity, string> = {
  critical: "bg-red-900/40 text-red-400 border border-red-700",
  high:     "bg-orange-900/40 text-orange-400 border border-orange-700",
  medium:   "bg-yellow-900/40 text-yellow-400 border border-yellow-700",
  low:      "bg-blue-900/40 text-blue-400 border border-blue-700",
};

const SEV_LABEL: Record<Severity, string> = {
  critical: "Crítica",
  high:     "Alta",
  medium:   "Média",
  low:      "Baixa",
};

const EFFORT_BADGE: Record<Effort, string> = {
  low:    "bg-green-900/30 text-green-400",
  medium: "bg-amber-900/30 text-amber-400",
  high:   "bg-red-900/30 text-red-400",
};

const EFFORT_LABEL: Record<Effort, string> = {
  low: "Baixo", medium: "Médio", high: "Alto",
};

const MODE_BADGE: Record<ScanMode, string> = {
  sme:    "bg-amber-900/30 text-amber-400 border border-amber-700",
  supply: "bg-teal-900/30 text-teal-400 border border-teal-700",
};

const MODE_LABEL: Record<ScanMode, string> = {
  sme:    "PME",
  supply: "Supply Chain",
};

const PLATFORM_ICONS: Record<string, string> = {
  windows: "🪟", linux: "🐧", macos: "🍎", cloud: "☁️", all: "🔧",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByScan(items: RemItem[]): ScanGroup[] {
  const map = new Map<string, ScanGroup>();
  for (const item of items) {
    const key = item.scanId == null ? "__null__" : String(item.scanId);
    if (!map.has(key)) {
      map.set(key, {
        scanId: item.scanId,
        target: item.target ?? "Sem alvo",
        mode:   item.mode,
        items:  [],
      });
    }
    map.get(key)!.items.push(item);
  }
  return [...map.values()].sort((a, b) => {
    if (a.scanId === null) return 1;
    if (b.scanId === null) return -1;
    return b.scanId - a.scanId;
  });
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

const COLUMNS: ColumnDef<RemItem>[] = [
  {
    key: "target",
    header: "Alvo",
    render: (row) => (
      <span className="font-mono text-xs text-slate-300 whitespace-nowrap">
        {row.target ?? "—"}
      </span>
    ),
  },
  {
    key: "cveId",
    header: "CVE",
    render: (row) =>
      row.cveId ? (
        <span className="font-mono text-xs text-amber-400 whitespace-nowrap">
          {row.cveId}
        </span>
      ) : (
        <span className="text-slate-500">—</span>
      ),
  },
  {
    key: "severity",
    header: "Severidade",
    render: (row) => {
      if (!row.severity) return <span className="text-slate-500">—</span>;
      return (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${SEV_BADGE[row.severity]}`}
          >
            {SEV_LABEL[row.severity]}
          </span>
          {row.cvssScore && (
            <span className="text-xs text-slate-400">{row.cvssScore}</span>
          )}
        </div>
      );
    },
  },
  {
    key: "component",
    header: "Componente",
    render: (row) => (
      <span className="text-xs text-slate-300">
        {row.affectedComponent ?? "—"}
      </span>
    ),
  },
  {
    key: "effort",
    header: "Esforço",
    render: (row) => (
      <span
        className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${EFFORT_BADGE[row.effort]}`}
      >
        {EFFORT_LABEL[row.effort]}
      </span>
    ),
  },
  {
    key: "nis2",
    header: "Artigo NIS2",
    render: (row) => {
      const articles = row.nis2Articles ?? [];
      if (!articles.length) return <span className="text-slate-500">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {articles.slice(0, 2).map((a) => (
            <span key={a} className="text-xs text-blue-400 whitespace-nowrap">
              {a}
            </span>
          ))}
          {articles.length > 2 && (
            <span className="text-xs text-slate-500">+{articles.length - 2}</span>
          )}
        </div>
      );
    },
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => (
      <span
        className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${STATUS_BADGE[row.status]}`}
      >
        {STATUS_LABEL[row.status]}
      </span>
    ),
  },
];

// ---------------------------------------------------------------------------
// Expanded row — steps + status update
// ---------------------------------------------------------------------------

function ExpandedContent({
  item,
  onUpdateStatus,
}: {
  item: RemItem;
  onUpdateStatus: (itemId: number, status: Status) => void;
}) {
  const [osTab, setOsTab] = useState<OsTab>("all");
  const steps = item.steps ?? [];

  const osTabs = [...new Set(steps.map((s) => s.platform))].filter(
    (p): p is "windows" | "linux" => p === "windows" || p === "linux"
  );

  const visibleSteps =
    osTab === "all"
      ? steps.map((s, i) => ({ ...s, displayOrder: i + 1 }))
      : steps
          .filter((s) => s.platform === osTab || s.platform === "all")
          .map((s, i) => ({ ...s, displayOrder: i + 1 }));

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-white">{item.title}</p>

      {steps.length > 0 && (
        <div>
          {osTabs.length > 0 && (
            <div className="flex gap-1 mb-3 border-b border-[#1e3a5f] pb-2">
              {(["all", ...osTabs] as OsTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={(e) => { e.stopPropagation(); setOsTab(tab); }}
                  className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                    osTab === tab
                      ? "bg-blue-700 text-white"
                      : "text-slate-400 hover:bg-[#152744]"
                  }`}
                >
                  {tab !== "all" && (PLATFORM_ICONS[tab] ?? "")}{" "}
                  {tab === "all" ? "Todos" : tab === "windows" ? "Windows" : "Linux"}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {visibleSteps.map((step) => (
              <div key={`${step.platform}-${step.order}`} className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-900/40 text-blue-400 border border-blue-700 rounded-full text-xs font-bold flex items-center justify-center">
                  {step.displayOrder}
                </span>
                <div className="flex-1">
                  {osTab === "all" && (
                    <span className="text-xs text-slate-500 mr-1">
                      {PLATFORM_ICONS[step.platform] ?? "🔧"}
                    </span>
                  )}
                  <span className="text-sm text-slate-300">{step.instruction}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-3 border-t border-[#1e3a5f]">
        <p className="text-xs text-slate-500 mb-2">Actualizar estado:</p>
        <div className="flex flex-wrap gap-2">
          {(["todo", "in_progress", "done", "wont_fix"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); onUpdateStatus(item.id, s); }}
              disabled={item.status === s}
              className={`px-3 py-1 text-xs rounded-full border transition-colors disabled:opacity-40 ${
                item.status === s
                  ? "bg-slate-700 text-white border-slate-600"
                  : "text-slate-400 border-slate-600 hover:bg-[#152744]"
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Remediation() {
  const [searchParams] = useSearchParams();
  const scanIdParam    = searchParams.get("scanId");
  const scanIdFromUrl  = scanIdParam ? parseInt(scanIdParam, 10) : undefined;

  const [statusFilter, setStatusFilter] = useState<Status | undefined>(undefined);
  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [generating, setGenerating]     = useState(false);
  const [polling, setPolling]           = useState(false);
  const [genError, setGenError]         = useState<string | null>(null);
  const [genMsg, setGenMsg]             = useState<string | null>(null);
  const noChangeCount                   = useRef(0);
  const lastDoneRef                     = useRef(-1);

  const utils = trpc.useUtils();

  const { data: allItems, isLoading } = trpc.remediation.list.useQuery(
    { scanId: scanIdFromUrl },
    { refetchOnWindowFocus: false }
  );

  const { data: progress } = trpc.remediation.progress.useQuery(
    { scanId: scanIdFromUrl! },
    {
      enabled: polling && scanIdFromUrl != null,
      refetchInterval: polling ? 5000 : false,
    }
  );

  useEffect(() => {
    if (!progress || !polling) return;
    const { done, eligible } = progress;
    setGenMsg(`A gerar planos… ${done} / ${eligible}`);
    if (done >= eligible) {
      setPolling(false);
      setGenMsg(`${done} planos de remediação gerados com IA.`);
      utils.remediation.list.invalidate();
      return;
    }
    if (done === lastDoneRef.current) {
      noChangeCount.current += 1;
      if (noChangeCount.current >= 6) {
        setPolling(false);
        utils.remediation.list.invalidate();
      }
    } else {
      noChangeCount.current = 0;
      lastDoneRef.current = done;
    }
  }, [progress, polling]);

  const generateMut = trpc.remediation.generate.useMutation({
    onSuccess: (r) => {
      setGenerating(false);
      lastDoneRef.current = r.existing;
      noChangeCount.current = 0;
      setPolling(true);
      const pending = r.eligible - r.existing;
      setGenMsg(pending > 0 ? `A gerar ${pending} planos de remediação com IA…` : "Planos já gerados.");
    },
    onError: (err) => {
      setGenerating(false);
      setGenError(err.message);
    },
  });

  const updateStatusMut = trpc.remediation.updateStatus.useMutation({
    onSuccess: () => utils.remediation.list.invalidate(),
  });

  function handleGenerate() {
    if (!scanIdFromUrl) return;
    setGenerating(true);
    setGenError(null);
    setGenMsg(null);
    generateMut.mutate({ scanId: scanIdFromUrl });
  }

  function handleToggle(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleUpdateStatus(itemId: number, status: Status) {
    updateStatusMut.mutate({ itemId, status });
  }

  // Client-side status filter (counts come from all items, unfiltered)
  const filtered: RemItem[] = (allItems ?? []).filter(
    (item) => !statusFilter || item.status === statusFilter
  );

  const groups = groupByScan(filtered);

  const totalCount = allItems?.length ?? 0;
  const counts = (allItems ?? []).reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<Status, number>
  );

  // Status filter toolbar — rendered in PageHeader actions slot
  const filterToolbar =
    totalCount > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setStatusFilter(undefined)}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            !statusFilter
              ? "bg-white text-gray-900 border-white font-medium"
              : "text-slate-300 border-slate-600 hover:bg-slate-700/50"
          }`}
        >
          Todos ({totalCount})
        </button>
        {(["todo", "in_progress", "done", "wont_fix"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? undefined : s)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-white text-gray-900 border-white font-medium"
                : "text-slate-300 border-slate-600 hover:bg-slate-700/50"
            }`}
          >
            {STATUS_LABEL[s]} ({counts[s] ?? 0})
          </button>
        ))}
      </div>
    ) : undefined;

  return (
    <div className="px-8 py-6">
      <PageHeader
        title="Planos de Remediação"
        subtitle="Gerados por IA com base nos resultados dos scans NIS2"
        actions={filterToolbar}
      />

      {/* Alerts */}
      {genMsg && (
        <div className={`mb-5 rounded-lg p-3 text-sm ${polling ? "bg-blue-900/30 border border-blue-700 text-blue-400" : "bg-green-900/30 border border-green-700 text-green-400"}`}>
          {genMsg}
        </div>
      )}
      {genError && (
        <div className="mb-5 bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-400">
          {genError.includes("pro") || genError.includes("FORBIDDEN")
            ? "A geração de planos de remediação com IA está disponível nos planos Pro e MSSP."
            : genError}
        </div>
      )}

      {/* Generate CTA — only when deep-linked to a specific scan */}
      {scanIdFromUrl && (
        <div className="mb-6">
          <button
            onClick={handleGenerate}
            disabled={generating || polling}
            className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {generating ? "A iniciar…" : polling ? "A gerar…" : "Gerar planos para este scan"}
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="py-16 text-center text-slate-400 text-sm">A carregar…</div>
      )}

      {/* Empty state */}
      {!isLoading && totalCount === 0 && (
        <div className="py-16 text-center">
          <div className="text-4xl mb-4">🛠️</div>
          <p className="text-slate-300 font-medium mb-2">Sem planos de remediação</p>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            {scanIdFromUrl
              ? "Ainda não há planos gerados para este scan. Clica em \"Gerar planos\" para começar."
              : "Acede aos resultados de um scan e clica em \"Gerar plano de remediação IA\" para criar planos."}
          </p>
        </div>
      )}

      {/* Scan sections */}
      {!isLoading && groups.length > 0 && (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.scanId ?? "__null__"}>
              {/* Section header */}
              <div className="flex items-center gap-3 mb-3 pb-2 border-b border-[#1e3a5f]">
                <h2 className="text-sm font-semibold text-white font-mono">
                  {group.target}
                </h2>
                {group.mode && (
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${MODE_BADGE[group.mode]}`}
                  >
                    {MODE_LABEL[group.mode]}
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "item" : "itens"}
                </span>
              </div>

              <DataTable
                columns={COLUMNS}
                rows={group.items}
                expandedId={expandedId}
                onToggle={handleToggle}
                renderExpanded={(row) => (
                  <ExpandedContent
                    item={row}
                    onUpdateStatus={handleUpdateStatus}
                  />
                )}
                emptyMessage={
                  statusFilter
                    ? "Sem itens com este estado neste scan."
                    : "Sem itens."
                }
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
