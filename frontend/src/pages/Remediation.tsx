import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";

type Status = "todo" | "in_progress" | "done" | "wont_fix";
type OsTab = "all" | "windows" | "linux";

const STATUS_LABEL: Record<Status, string> = {
  todo:        "Por fazer",
  in_progress: "Em curso",
  done:        "Concluído",
  wont_fix:    "Não corrigir",
};

const STATUS_CLASSES: Record<Status, string> = {
  todo:        "bg-red-100 text-red-800",
  in_progress: "bg-blue-100 text-blue-800",
  done:        "bg-green-100 text-green-800",
  wont_fix:    "bg-gray-100 text-gray-500",
};

const EFFORT_LABEL = { low: "Baixo", medium: "Médio", high: "Alto" };
const EFFORT_CLASSES = {
  low:    "bg-green-50 text-green-700",
  medium: "bg-amber-50 text-amber-700",
  high:   "bg-red-50 text-red-700",
};

const PLATFORM_ICONS: Record<string, string> = {
  windows: "🪟",
  linux:   "🐧",
  macos:   "🍎",
  cloud:   "☁️",
  all:     "🔧",
};

const OS_TAB_LABELS: Record<OsTab, string> = {
  all:     "Todos",
  windows: "Windows",
  linux:   "Linux / Ubuntu",
};

/** Returns which OS tabs to show and filter steps accordingly. */
function getVisibleSteps(steps: any[], activeTab: OsTab) {
  if (activeTab === "all") return steps.map((s, i) => ({ ...s, displayOrder: i + 1 }));
  return steps
    .filter((s) => s.platform === activeTab || s.platform === "all")
    .map((s, i) => ({ ...s, displayOrder: i + 1 }));
}

/** Detects which OS-specific platforms are present (excluding "all"). */
function detectOsTabs(steps: any[]): OsTab[] {
  const platforms = new Set(steps.map((s) => s.platform as string));
  const tabs: OsTab[] = [];
  if (platforms.has("windows")) tabs.push("windows");
  if (platforms.has("linux"))   tabs.push("linux");
  return tabs;
}

export default function Remediation() {
  const [searchParams]         = useSearchParams();
  const scanIdParam            = searchParams.get("scanId");
  const [statusFilter, setStatusFilter] = useState<Status | undefined>(undefined);
  const [expanded, setExpanded]         = useState<number | null>(null);
  const [osTab, setOsTab]               = useState<Record<number, OsTab>>({});
  const [generating, setGenerating]     = useState(false);
  const [genError, setGenError]         = useState<string | null>(null);
  const [genSuccess, setGenSuccess]     = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.remediation.list.useQuery(
    { status: statusFilter },
    { refetchOnWindowFocus: false }
  );

  const generateMut = trpc.remediation.generate.useMutation({
    onSuccess: (r) => {
      setGenerating(false);
      setGenSuccess(`${r.generated} planos de remediação gerados com IA.`);
      utils.remediation.list.invalidate();
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
    if (!scanIdParam) return;
    setGenerating(true);
    setGenError(null);
    setGenSuccess(null);
    generateMut.mutate({ scanId: parseInt(scanIdParam, 10) });
  }

  const counts = items?.reduce(
    (acc, item) => {
      acc[item.status as Status] = (acc[item.status as Status] ?? 0) + 1;
      return acc;
    },
    {} as Record<Status, number>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Planos de Remediação</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Gerados por IA com base nos resultados dos scans NIS2
          </p>
        </div>
        {scanIdParam && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50"
          >
            {generating ? "A gerar com IA…" : "Gerar para este scan"}
          </button>
        )}
      </div>

      {/* Alerts */}
      {genSuccess && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
          {genSuccess}
        </div>
      )}
      {genError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {genError.includes("pro") || genError.includes("FORBIDDEN")
            ? "A geração de planos de remediação com IA está disponível nos planos Pro e MSSP."
            : genError}
        </div>
      )}

      {/* Status filter + summary */}
      {items && items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setStatusFilter(undefined)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              !statusFilter
                ? "bg-white text-gray-900 border-white"
                : "text-slate-300 border-slate-600 hover:bg-slate-700/50"
            }`}
          >
            Todos ({items.length})
          </button>
          {(["todo", "in_progress", "done", "wont_fix"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? undefined : s)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                statusFilter === s
                  ? "bg-white text-gray-900 border-white"
                  : "text-slate-300 border-slate-600 hover:bg-slate-700/50"
              }`}
            >
              {STATUS_LABEL[s]} ({counts?.[s] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16 text-slate-400 text-sm">A carregar…</div>
      )}

      {/* Empty */}
      {!isLoading && items?.length === 0 && !scanIdParam && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🛠️</div>
          <p className="text-slate-300 font-medium mb-2">Sem planos de remediação</p>
          <p className="text-sm text-slate-400">
            Acede aos resultados de um scan e clica em "Gerar plano de remediação" para criar planos com IA.
          </p>
        </div>
      )}

      {!isLoading && items?.length === 0 && scanIdParam && (
        <div className="text-center py-12">
          <p className="text-slate-400 text-sm mb-4">
            Ainda não há planos gerados para este scan.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50"
          >
            {generating ? "A gerar…" : "Gerar planos com IA agora"}
          </button>
        </div>
      )}

      {/* Item list */}
      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => {
            const steps = (item.steps as any[]) ?? [];
            const articles = (item.nis2Articles as string[]) ?? [];
            const effort = item.effort as keyof typeof EFFORT_LABEL;
            const status = item.status as Status;
            const isOpen = expanded === item.id;

            return (
              <div
                key={item.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                {/* Item header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_CLASSES[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${EFFORT_CLASSES[effort]}`}>
                          Esforço: {EFFORT_LABEL[effort]}
                        </span>
                        {articles.map((a) => (
                          <span key={a} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full">
                            {a}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    </div>
                    <span className="text-gray-400 text-sm shrink-0">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {/* Expanded steps */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {/* OS tabs — only shown when there are Windows/Linux-specific steps */}
                    {(() => {
                      const osTabs = detectOsTabs(steps);
                      if (osTabs.length === 0) return null;
                      const activeTab = osTab[item.id] ?? "all";
                      const allTabs: OsTab[] = ["all", ...osTabs];
                      return (
                        <div className="flex gap-1 mt-4 mb-3 border-b border-gray-100 pb-2">
                          {allTabs.map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setOsTab((prev) => ({ ...prev, [item.id]: tab }))}
                              className={`px-3 py-1 text-xs rounded-t font-medium transition-colors ${
                                activeTab === tab
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-500 hover:bg-gray-100"
                              }`}
                            >
                              {tab !== "all" && (PLATFORM_ICONS[tab] ?? "")} {OS_TAB_LABELS[tab]}
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    <div className="mt-2 space-y-3">
                      {getVisibleSteps(steps, osTab[item.id] ?? "all").map((step: any) => (
                        <div key={`${step.platform}-${step.order}`} className="flex gap-3">
                          <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center justify-center">
                            {step.displayOrder}
                          </span>
                          <div className="flex-1">
                            {(osTab[item.id] ?? "all") === "all" && (
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-xs">{PLATFORM_ICONS[step.platform] ?? "🔧"}</span>
                                <span className="text-xs text-gray-400 capitalize">{step.platform}</span>
                              </div>
                            )}
                            <p className="text-sm text-gray-700">{step.instruction}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Status update */}
                    <div className="mt-5 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-2">Atualizar estado:</p>
                      <div className="flex flex-wrap gap-2">
                        {(["todo", "in_progress", "done", "wont_fix"] as Status[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => updateStatusMut.mutate({ itemId: item.id, status: s })}
                            disabled={status === s || updateStatusMut.isPending}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors disabled:opacity-40 ${
                              status === s
                                ? "bg-gray-900 text-white border-gray-900"
                                : "text-gray-600 border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
