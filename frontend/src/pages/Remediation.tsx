import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { PageHeader } from "../components/ui/PageHeader";
import { DataTable, type ColumnDef } from "../components/ui/DataTable";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Alert } from "../components/ui/Alert";
import { InfoNote } from "../components/ui/InfoNote";
import { Icon } from "../components/ui/Icon";
import { Wrench } from "lucide-react";
import {
  statusTone, statusLabel,
  sevClasses, sevLabel,
  effortTone, effortLabel,
  modeTone, modeLabel,
  toneClasses,
} from "../lib/remediationTones";

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
      <span className="font-mono text-xs text-dim whitespace-nowrap">
        {row.target ?? "—"}
      </span>
    ),
  },
  {
    key: "cveId",
    header: "CVE",
    render: (row) =>
      row.cveId ? (
        <span className="font-mono text-xs text-warn whitespace-nowrap">
          {row.cveId}
        </span>
      ) : (
        <span className="text-faint">—</span>
      ),
  },
  {
    key: "severity",
    header: "Severidade",
    render: (row) => {
      if (!row.severity) return <span className="text-faint">—</span>;
      return (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${sevClasses[row.severity]}`}
          >
            {sevLabel[row.severity]}
          </span>
          {row.cvssScore && (
            <span className="text-xs text-dim">{row.cvssScore}</span>
          )}
        </div>
      );
    },
  },
  {
    key: "component",
    header: "Componente",
    render: (row) => (
      <span className="text-xs text-dim">
        {row.affectedComponent ?? "—"}
      </span>
    ),
  },
  {
    key: "effort",
    header: "Esforço",
    render: (row) => (
      <Badge tone={effortTone[row.effort]} className="whitespace-nowrap">
        {effortLabel[row.effort]}
      </Badge>
    ),
  },
  {
    key: "nis2",
    header: "Artigo NIS2",
    render: (row) => {
      const articles = row.nis2Articles ?? [];
      if (!articles.length) return <span className="text-faint">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {articles.slice(0, 2).map((a) => (
            <span key={a} className="text-xs text-accent whitespace-nowrap">
              {a}
            </span>
          ))}
          {articles.length > 2 && (
            <span className="text-xs text-faint">+{articles.length - 2}</span>
          )}
        </div>
      );
    },
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => (
      <Badge tone={statusTone[row.status]} className="whitespace-nowrap">
        {statusLabel[row.status]}
      </Badge>
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
              {statusLabel[s]}
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
              ? "bg-accent text-accent-ink border-accent font-medium"
              : "text-dim border-line hover:bg-surface-2"
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
                ? "bg-accent text-accent-ink border-accent font-medium"
                : "text-dim border-line hover:bg-surface-2"
            }`}
          >
            {statusLabel[s]} ({counts[s] ?? 0})
          </button>
        ))}
      </div>
    ) : undefined;

  return (
    <div className="max-w-6xl mx-auto px-8 py-6">
      <PageHeader
        title="Planos de Remediação"
        subtitle="Gerados por IA com base nos resultados dos scans NIS2"
        actions={filterToolbar}
      />

      <InfoNote>
        <p><strong className="text-text">O que é.</strong> Para cada vulnerabilidade que o scanner encontra, a plataforma gera um plano de correção — o que fazer, por que ordem, e com que prioridade.</p>
        <p><strong className="text-text">Porque existe.</strong> Encontrar problemas não basta — é preciso saber como os resolver. A remediação traduz cada achado técnico numa ação concreta, priorizada por risco, para que saiba por onde começar.</p>
        <p><strong className="text-text">Quando fazer.</strong> Depois de um scan que tenha encontrado vulnerabilidades. Se o scan estiver limpo, não há nada a remediar.</p>
      </InfoNote>

      {/* Alerts */}
      {genMsg && (
        <Alert tone={polling ? "info" : "ok"} className="mb-5">
          {genMsg}
        </Alert>
      )}
      {genError && (
        <Alert tone="bad" className="mb-5">
          {genError.includes("pro") || genError.includes("FORBIDDEN")
            ? "A geração de planos de remediação com IA está disponível nos planos Pro e MSSP."
            : genError}
        </Alert>
      )}

      {/* Generate CTA — only when deep-linked to a specific scan */}
      {scanIdFromUrl && (
        <div className="mb-6">
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={generating || polling}
          >
            {generating ? "A iniciar…" : polling ? "A gerar…" : "Gerar planos para este scan"}
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="py-16 text-center text-dim text-sm">A carregar…</div>
      )}

      {/* Empty state */}
      {!isLoading && totalCount === 0 && (
        <div className="py-16 text-center">
          <Icon as={Wrench} className="mx-auto mb-4 text-faint" size={32} />
          <p className="text-text font-medium mb-2">Sem planos de remediação</p>
          <p className="text-sm text-dim max-w-sm mx-auto">
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
              <div className="flex items-center gap-3 mb-3 pb-2 border-b border-line">
                <h2 className="text-sm font-semibold text-text font-mono">
                  {group.target}
                </h2>
                {group.mode && (
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${toneClasses[modeTone[group.mode]]}`}
                  >
                    {modeLabel[group.mode]}
                  </span>
                )}
                <span className="text-xs text-dim">
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
