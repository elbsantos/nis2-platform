import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import Nis2ScoreChart from "../components/Nis2ScoreChart";
import VulnerabilityList from "../components/VulnerabilityList";
import { DocButton } from "../components/DocButton";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import {
  Shield, AlertTriangle, Check, CheckCircle2, XCircle, HelpCircle,
  FileQuestion, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { sevCardClass, sevBadgeClass, sevLabel, toneClasses } from "../lib/remediationTones";

const POLL_INTERVAL = 4_000;

export default function ScanResults() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate   = useNavigate();
  const id         = parseInt(scanId ?? "", 10);

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

  // Score combinado (scan + questionário) — calculado no backend (fonte única).
  // Só activa quando o scan está concluído.
  const scanDone = scan?.status === "completed";
  const { data: combinedData } = trpc.scan.combinedArticleScores.useQuery(
    { scanId: id },
    { enabled: !isNaN(id) && scanDone }
  );

  const pdfExecutive = trpc.report.generate.useQuery(
    { scanId: scan?.id ?? 0, type: "executive" },
    { enabled: false, retry: false }
  );
  const pdfTechnical = trpc.report.generate.useQuery(
    { scanId: scan?.id ?? 0, type: "technical" },
    { enabled: false, retry: false }
  );

  if (isNaN(id)) {
    navigate("/scan/history", { replace: true });
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <Spinner />
          <p className="mt-4 text-dim text-xl">A carregar resultados…</p>
        </div>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-bad font-medium text-2xl">Scan não encontrado</p>
          <Link to="/scan/history" className="mt-4 inline-block text-xl text-accent hover:underline">
            ← Ver histórico
          </Link>
        </div>
      </div>
    );
  }

  if (scan.status === "failed") {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <Icon as={AlertTriangle} className="text-warn mx-auto mb-3" size={36} />
          <p className="font-semibold text-text text-2xl mb-1">Scan falhou</p>
          <p className="text-xl text-dim mb-6">
            Verifica que o DNS TXT record está correcto e tenta novamente.
          </p>
          <Link to="/scan/start">
            <Button variant="primary">Novo scan</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (scan.status === "pending" || scan.status === "running") {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center max-w-2xl px-4">
          <Spinner size="lg" />
          <p className="mt-6 text-text font-medium text-2xl">
            {scan.status === "pending" ? "Scan na fila…" : "A executar scan NIS2…"}
          </p>
          <p className="text-xl text-dim mt-2">
            A analisar <span className="font-mono">{scan.target}</span> via Shodan + Censys + DNS.
            Pode demorar 1–3 minutos.
          </p>
          <div className="mt-8 flex justify-center gap-4 flex-wrap">
            {[
              "Verificação de propriedade",
              "Análise Shodan",
              "Análise TLS Censys",
              "Segurança Email",
              "Headers HTTP",
              "Dark Web & Reputação",
              "Score NIS2",
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-warn/10 border border-warn/40 flex items-center justify-center animate-pulse">
                  <span className="text-warn text-lg font-bold">{i + 1}</span>
                </div>
                <span className="text-lg text-dim max-w-[90px] text-center">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const results   = scan.results as any;
  // CORREÇÃO 4: fonte única — comprimento do array, não contador separado.
  // Fallback vulnerabilitiesFound garante retrocompatibilidade com scans antigos.
  const vulnCount = (results?.vulnerabilities as unknown[] | undefined)?.length
    ?? results?.vulnerabilitiesFound
    ?? 0;
  // Vulns com cveId e description válidos — mesma lógica de filtro do backend.
  const eligibleCount = (results?.vulnerabilities as Array<{ cveId?: string; description?: string }> | undefined)
    ?.filter((v) => v.cveId?.trim() && v.description?.trim())
    .length ?? 0;
  // Portas/serviços detetados — é a fonte real de generateInventarioAtivos
  // (lê results.openPorts, não results.vulnerabilities). Um scan "limpo"
  // (eligibleCount=0) pode ter portas abertas sem CVEs conhecidos — o
  // Inventário de Ativos continua a ter conteúdo válido nesse caso.
  const portsCount = (results?.openPorts as unknown[] | undefined)?.length ?? 0;
  const critical  = results?.criticalCount ?? 0;
  const high      = results?.highCount ?? 0;
  const medium    = results?.mediumCount ?? 0;
  const low       = results?.lowCount ?? 0;

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <Link to="/scan/history" className="text-lg text-dim hover:text-text hover:underline">
              ← Histórico
            </Link>
            <h1 className="text-3xl font-bold text-text mt-1">{scan.target}</h1>
            <p className="text-xl text-dim">
              Scan #{scan.id} · {new Date(scan.completedAt ?? scan.createdAt).toLocaleString("pt-PT")}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap items-start">
            <DocButton
              label="PDF Executivo"
              onDownload={async () => {
                const r = await pdfExecutive.refetch();
                if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
                return { fileBase64: r.data.pdfBase64, filename: r.data.filename, contentType: "application/pdf" };
              }}
            />
            <DocButton
              label="PDF Técnico"
              onDownload={async () => {
                const r = await pdfTechnical.refetch();
                if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
                return { fileBase64: r.data.pdfBase64, filename: r.data.filename, contentType: "application/pdf" };
              }}
            />
            {eligibleCount > 0 && (
              <Link to={`/remediation?scanId=${scan.id}`}>
                <Button variant="primary">Planos de Remediação IA</Button>
              </Link>
            )}
          </div>
        </div>

        {/* Summary cards — 6 colunas: total + 4 severidades + duração */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
          <SummaryCard label="Vulnerabilidades" value={String(vulnCount)} accent={vulnCount > 0} />
          <SummaryCard label="Críticas" value={String(critical)} accent={critical > 0} danger />
          <SummaryCard label="Altas"    value={String(high)}     accent={high > 0}     warn />
          <SummaryCard label="Médias"   value={String(medium)}   accent={medium > 0}   mediumSev />
          <SummaryCard label="Baixas"   value={String(low)}      accent={low > 0}      lowSev />
          <SummaryCard label="Duração"  value={scan.completedAt ? elapsedLabel(scan.startedAt, scan.completedAt) : "—"} />
        </div>

        {/* Três scores — Security / Compliance / Risk (substitui o score único como métrica de topo) */}
        {combinedData?.threeScores && <ThreeScoreCards scores={combinedData.threeScores} />}

        {/* NIS2 Score chart */}
        <Card as="section" className="p-6">
          <h2 className="text-2xl font-semibold text-text mb-4">Declaração vs Evidência por Artigo</h2>
          {results?.nis2Scores ? (
            <Nis2ScoreChart
              scores={results.nis2Scores}
              overallScore={results.overallScore ?? 0}
              combined={combinedData?.combined}
              overallCombined={combinedData?.overallCombined}
              hasQuestionnaire={combinedData?.hasQuestionnaire ?? false}
            />
          ) : (
            <p className="text-xl text-dim">Dados de score não disponíveis para este scan.</p>
          )}
        </Card>

        {/* Control Validation — cruzamento questionário × evidência técnica, controlo a controlo */}
        {scanDone && <ControlValidationSection scanId={scan.id} />}

        {/* TLS & Certificates */}
        {results?.directTls && (
          <Card as="section" className="p-6">
            <h2 className="text-2xl font-semibold text-text mb-4">TLS &amp; Certificados</h2>
            <TlsSection directTls={results.directTls} />
          </Card>
        )}

        {/* Ports & Services */}
        {results?.openPorts && results.openPorts.length > 0 && (
          <Card as="section" className="p-6">
            <h2 className="text-2xl font-semibold text-text mb-4">Portas &amp; Serviços</h2>
            <PortsSection ports={results.openPorts} cdn={results.directTls?.cdn} />
          </Card>
        )}

        {/* Email security */}
        {results?.emailSecurity && (
          <Card as="section" className="p-6">
            <h2 className="text-2xl font-semibold text-text mb-4">Segurança de Email</h2>
            <SecurityChecklist checks={results.emailSecurity.checks} />
          </Card>
        )}

        {/* HTTP headers */}
        {results?.httpHeaders && (
          <Card as="section" className="p-6">
            <h2 className="text-2xl font-semibold text-text mb-1">Headers de Segurança HTTP</h2>
            <p className="text-lg text-dim mb-4">
              Analisado via <span className="font-mono">{results.httpHeaders.url}</span>
            </p>
            <SecurityChecklist checks={results.httpHeaders.checks} />
          </Card>
        )}

        {/* Dark web & reputation */}
        {results?.darkWeb && (
          <Card as="section" className="p-6">
            <h2 className="text-2xl font-semibold text-text mb-4">Dark Web &amp; Reputação</h2>
            <DarkWebSection darkWeb={results.darkWeb} />
          </Card>
        )}

        {/* Vulnerabilities */}
        <Card as="section" className="p-6">
          <h2 className="text-2xl font-semibold text-text mb-4">
            Vulnerabilidades
            {vulnCount > 0 && (
              <span className="ml-2 text-xl font-normal text-dim">({vulnCount})</span>
            )}
          </h2>
          <VulnerabilityListFromScan results={results} />
        </Card>

        {/* Documentos NIS2 */}
        <DocumentsSection scanId={scan.id} eligibleCount={eligibleCount} portsCount={portsCount} />

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link to="/scan/start"
            className="px-5 py-3 border border-line text-xl rounded-md text-dim hover:bg-surface-2"
          >
            Novo scan
          </Link>
          <Link to="/scan/history"
            className="px-5 py-3 border border-line text-xl rounded-md text-dim hover:bg-surface-2"
          >
            Ver histórico
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ size = "md" }: { size?: "md" | "lg" }) {
  const cls = size === "lg" ? "h-14 w-14" : "h-10 w-10";
  return (
    <svg className={`${cls} animate-spin text-accent mx-auto`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function SummaryCard({
  label, value, accent = false, danger = false, warn = false, mediumSev = false, lowSev = false,
}: {
  label: string; value: string; accent?: boolean; danger?: boolean; warn?: boolean; mediumSev?: boolean; lowSev?: boolean;
}) {
  const color = danger && accent    ? "text-bad"
    : warn && accent       ? "text-sev-alta"
    : mediumSev && accent  ? "text-sev-media"
    : lowSev && accent     ? "text-sev-baixa"
    : accent               ? "text-accent"
    : "text-text";
  return (
    <Card className="p-5 text-center">
      <p className={`text-4xl font-bold ${color}`}>{value}</p>
      <p className="text-lg text-dim mt-1">{label}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Três scores — Security / Compliance / Risk (backend/utils/combined-score.ts)
// ---------------------------------------------------------------------------

type Tone = "ok" | "warn" | "bad" | "neutral";

function scoreTone(value: number | null): Tone {
  if (value === null) return "neutral";
  if (value >= 80) return "ok";
  if (value >= 60) return "warn";
  return "bad";
}

const RISK_LABEL_TONE: Record<string, Tone> = {
  "Baixo":   "ok",
  "Médio":   "warn",
  "Alto":    "bad",
  "Crítico": "bad",
};

interface ThreeScoresData {
  security:          number | null;
  compliance:        number | null;
  risk:              number;
  riskLabel:         "Baixo" | "Médio" | "Alto" | "Crítico";
  divergence:        number;
  divergentMeasures: string[];
}

function ScoreCard({ label, value, tone, description }: { label: string; value: string; tone: Tone; description: string }) {
  return (
    <div className={`rounded-[12px] p-5 ${toneClasses[tone]}`}>
      <p className="text-sm font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-4xl font-bold mt-1">{value}</p>
      <p className="text-sm mt-2 opacity-80">{description}</p>
    </div>
  );
}

function ThreeScoreCards({ scores }: { scores: ThreeScoresData }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ScoreCard
          label="Security Score"
          value={scores.security !== null ? String(scores.security) : "—"}
          tone={scoreTone(scores.security)}
          description="Quanto a superfície técnica está protegida"
        />
        <ScoreCard
          label="Compliance Score"
          value={scores.compliance !== null ? String(scores.compliance) : "—"}
          tone={scoreTone(scores.compliance)}
          description="Quanto dos controlos aplicáveis foram declarados"
        />
        <ScoreCard
          label="Risk Score"
          value={scores.riskLabel}
          tone={RISK_LABEL_TONE[scores.riskLabel] ?? "neutral"}
          description={`${scores.risk}/100`}
        />
      </div>
      {scores.security !== null && scores.compliance !== null &&
       scores.compliance > scores.security && scores.divergence > 15 && (
        <p className="text-sm text-warn mt-3 flex items-center gap-2">
          <Icon as={AlertTriangle} size={15} />
          A autoavaliação declara mais conformidade do que a evidência técnica mostra.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control Validation — cruzamento questionário × evidência técnica (42 controlos)
// ---------------------------------------------------------------------------

type ValidationState = "verified" | "verified_noncompliant" | "contradicted" | "unconfirmed" | "self_declared";

interface ControlValidationRow {
  controlId: string;
  answer:    string | null;
  state:     ValidationState;
  evidence:  string[];
  coverage:  string | null;
  source:    "scanner" | null;
  inconclusiveReason?: string;
}

interface ControlMeta {
  id:            string;
  articleSlug:   string;
  articleTitle:  string;
  question:      string;
}

const STATE_META: Record<ValidationState, { label: string; tone: Tone; icon: typeof CheckCircle2 }> = {
  verified:              { label: "Verificado",              tone: "ok",      icon: CheckCircle2 },
  verified_noncompliant: { label: "Verificado — não conforme", tone: "warn",  icon: AlertCircle },
  contradicted:          { label: "Contraditado",             tone: "bad",     icon: XCircle },
  unconfirmed:           { label: "A confirmar",              tone: "warn",    icon: HelpCircle },
  self_declared:         { label: "Autodeclarado",            tone: "neutral", icon: FileQuestion },
};

const MEASURE_ORDER = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

function ControlRow({ control, meta }: { control: ControlValidationRow; meta?: ControlMeta }) {
  const stateMeta = STATE_META[control.state];
  return (
    <div className={`border rounded-[10px] p-4 ${control.state === "contradicted" ? "border-bad/30 bg-bad/5" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm text-text font-medium flex-1">
          <span className="font-mono text-faint mr-2">{control.controlId}</span>
          {meta?.question ?? "—"}
        </p>
        <Badge tone={stateMeta.tone}>
          <Icon as={stateMeta.icon} size={13} />
          {stateMeta.label}
        </Badge>
      </div>
      {control.evidence.length > 0 && (
        <ul className="space-y-1 mb-2">
          {control.evidence.map((e, i) => (
            <li key={i} className="text-sm text-dim flex items-start gap-2">
              <Icon as={stateMeta.icon} size={13} className="mt-0.5 shrink-0 opacity-70" />
              {e}
            </li>
          ))}
        </ul>
      )}
      {control.coverage && (
        <p className="text-xs text-faint">O que não é verificado: {control.coverage}</p>
      )}
    </div>
  );
}

function MeasureSection({ slug, title, controls, metaById }: {
  slug: string; title: string; controls: ControlValidationRow[]; metaById: Map<string, ControlMeta>;
}) {
  const visible = controls.filter((c) => c.state !== "self_declared");
  if (visible.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">
        {slug} · {title}
      </h3>
      <div className="space-y-2">
        {visible.map((c) => <ControlRow key={c.controlId} control={c} meta={metaById.get(c.controlId)} />)}
      </div>
    </div>
  );
}

/**
 * Bloco colapsável genérico para os dois grupos de self_declared — os "analisados sem
 * conclusão" (têm inconclusiveReason, mostrada por item) e os "sem fonte técnica"
 * (estruturais, sem regra nenhuma — mostram só a pergunta).
 */
function CollapsibleControlGroup({ title, description, controls, metaById }: {
  title: string; description?: string; controls: ControlValidationRow[]; metaById: Map<string, ControlMeta>;
}) {
  const [open, setOpen] = useState(false);
  if (controls.length === 0) return null;

  return (
    <div className="border border-line rounded-[12px] p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-text">{title}</p>
          {description && (
            <p className="text-sm text-dim mt-1.5 max-w-[70ch]">{description}</p>
          )}
        </div>
        <Icon as={open ? ChevronUp : ChevronDown} className="shrink-0 mt-1 text-dim" />
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          {MEASURE_ORDER.map((slug) => {
            const inMeasure = controls.filter((c) => metaById.get(c.controlId)?.articleSlug === slug);
            if (inMeasure.length === 0) return null;
            const measureTitle = metaById.get(inMeasure[0].controlId)?.articleTitle ?? "";
            return (
              <div key={slug}>
                <h4 className="text-xs font-semibold text-faint uppercase tracking-wide mb-1.5">{slug} · {measureTitle}</h4>
                <ul className="space-y-1.5">
                  {inMeasure.map((c) => (
                    <li key={c.controlId} className="text-sm text-dim">
                      <span className="font-mono text-faint mr-2">{c.controlId}</span>
                      {metaById.get(c.controlId)?.question}
                      {c.inconclusiveReason && (
                        <span className="block text-xs text-faint mt-0.5">{c.inconclusiveReason}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ControlValidationSection({ scanId }: { scanId: number }) {
  const { data } = trpc.scan.controlValidation.useQuery({ scanId });
  const { data: controlsData } = trpc.questionnaire.controls.useQuery();

  if (!data || !controlsData) return null;

  const metaById = new Map<string, ControlMeta>(controlsData.map((c) => [c.id, c]));
  const selfDeclared  = data.validations.filter((v) => v.state === "self_declared");
  // Dois grupos distintos: os "inconclusivos" têm regra técnica mas a resposta foi
  // "não"/"parcial" sem evidência que a confirme (o número varia por alvo); os
  // "estruturais" são os controlos sem regra técnica nenhuma (fixo, 36 hoje).
  const inconclusive  = selfDeclared.filter((v) => v.inconclusiveReason);
  const structural    = selfDeclared.filter((v) => !v.inconclusiveReason);
  const { summary } = data;

  return (
    <Card as="section" className="p-6">
      <h2 className="text-2xl font-semibold text-text mb-1">Control Validation</h2>
      <p className="text-dim mb-4">
        Cruzamos a sua declaração no questionário com a evidência técnica do scan, controlo a controlo.
      </p>

      <p className="text-lg mb-6">
        <span className="text-ok font-semibold">{summary.verified} verificados</span>
        <span className="text-dim"> · </span>
        <span className="text-warn font-semibold">{summary.verifiedNoncompliant} não conformes</span>
        <span className="text-dim"> · </span>
        <span className="text-bad font-semibold">{summary.contradicted} contraditados</span>
        <span className="text-dim"> · </span>
        <span className="text-warn font-semibold">{summary.unconfirmed} a confirmar</span>
        <span className="text-dim"> · </span>
        <span className="text-text font-semibold">{summary.selfDeclared} autodeclarados</span>
        <span className="text-faint"> (de 42)</span>
      </p>

      <div className="space-y-6">
        {MEASURE_ORDER.map((slug) => {
          const inMeasure = data.validations.filter((v) => metaById.get(v.controlId)?.articleSlug === slug);
          const title = metaById.get(inMeasure[0]?.controlId)?.articleTitle ?? "";
          return <MeasureSection key={slug} slug={slug} title={title} controls={inMeasure} metaById={metaById} />;
        })}
      </div>

      <div className="mt-6 space-y-3">
        <CollapsibleControlGroup
          title={`${inconclusive.length} controlos analisados sem conclusão`}
          controls={inconclusive}
          metaById={metaById}
        />
        <CollapsibleControlGroup
          title={`${structural.length} controlos sem fonte técnica`}
          description="Estes controlos dependem da sua declaração. Nenhuma ferramenta de conformidade os verifica hoje — nós dizemos-lhe quais são. O nosso roadmap leva a verificação técnica a 30 dos 42 controlos."
          controls={structural}
          metaById={metaById}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Documentos NIS2 — download de ficheiros gerados automaticamente
// (DocButton/triggerDownload vivem em ../components/DocButton — partilhado
// com a página /documentos)
// ---------------------------------------------------------------------------

function DocumentsSection({ scanId, eligibleCount, portsCount }: { scanId: number; eligibleCount: number; portsCount: number }) {
  const registoRiscos = trpc.documents.registoRiscos.useQuery(
    { scanId },
    { enabled: false, retry: false }
  );
  const inventarioAtivos = trpc.documents.inventarioAtivos.useQuery(
    { scanId },
    { enabled: false, retry: false }
  );
  const psi = trpc.documents.psi.useQuery(
    undefined,
    { enabled: false, retry: false }
  );
  const cartaCiso = trpc.documents.cartaCiso.useQuery(
    undefined,
    { enabled: false, retry: false }
  );
  const registoCncs = trpc.documents.registoCncs.useQuery(
    undefined,
    { enabled: false, retry: false }
  );
  const irp = trpc.documents.irp.useQuery(
    undefined,
    { enabled: false, retry: false }
  );
  const relatorioGestao = trpc.documents.relatorioGestao.useQuery(
    { scanId },
    { enabled: false, retry: false }
  );
  const tracker10Medidas = trpc.documents.tracker10Medidas.useQuery(
    undefined,
    { enabled: false, retry: false }
  );
  const declaracaoMfa = trpc.documents.declaracaoMfa.useQuery(
    undefined,
    { enabled: false, retry: false }
  );
  const patchTracker = trpc.documents.patchTracker.useQuery(
    { scanId },
    { enabled: false, retry: false }
  );
  const dossier = trpc.documents.dossier.useQuery(
    undefined,
    { enabled: false, retry: false }
  );

  return (
    <Card as="section" className="p-6">
      <h2 className="text-2xl font-semibold text-text mb-1">Documentos NIS2</h2>
      <p className="text-dim text-lg mb-5">
        Documentos pré-preenchidos com os dados do scan — reveja e complete antes de usar.
      </p>
      <div className="flex flex-wrap gap-3">
        {eligibleCount > 0 && (
          <DocButton
            label="Registo de Riscos (.xlsx)"
            onDownload={async () => {
              const r = await registoRiscos.refetch();
              if (!r.data) throw new Error("Sem dados");
              return r.data;
            }}
          />
        )}
        {portsCount > 0 && (
          <DocButton
            label="Inventário de Ativos (.xlsx)"
            onDownload={async () => {
              const r = await inventarioAtivos.refetch();
              if (!r.data) throw new Error("Sem dados");
              return r.data;
            }}
          />
        )}
        <DocButton
          label="Tracker de Patches e Vulnerabilidades (.xlsx)"
          onDownload={async () => {
            const r = await patchTracker.refetch();
            // Gera sempre, mesmo com 0 vulnerabilidades (scan limpo) — por isso fica fora
            // do gate eligibleCount>0 do Registo de Riscos.
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Política de Segurança da Informação (.docx)"
          onDownload={async () => {
            const r = await psi.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Carta de Nomeação do CISO (.docx)"
          onDownload={async () => {
            const r = await cartaCiso.refetch();
            if (!r.data) throw new Error("Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Registo Inicial CNCS (.docx)"
          onDownload={async () => {
            const r = await registoCncs.refetch();
            // Surge a mensagem real do servidor (ex.: "complete o Enquadramento
            // primeiro") em vez do genérico "Sem dados" — precondição legível.
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Plano de Resposta a Incidentes (.docx)"
          onDownload={async () => {
            const r = await irp.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Relatório Executivo para a Gestão (.docx)"
          onDownload={async () => {
            const r = await relatorioGestao.refetch();
            // Precondição exige questionário + enquadramento + scan — a mensagem
            // real do servidor lista tudo o que falta de uma vez.
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Tracker das 10 Medidas (.xlsx)"
          onDownload={async () => {
            const r = await tracker10Medidas.refetch();
            // Precondição exige só o questionário — a mensagem real do servidor
            // pede para o completar primeiro.
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Declaração de MFA — Autoavaliação (.docx)"
          onDownload={async () => {
            const r = await declaracaoMfa.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Dossier de Conformidade — Índice Mestre (.xlsx)"
          onDownload={async () => {
            const r = await dossier.refetch();
            // Trava exige perfil + enquadramento + questionário + scan — a mensagem
            // real do servidor lista tudo o que falta de uma vez.
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SecurityChecklist
// ---------------------------------------------------------------------------

interface SecurityCheck {
  name: string;
  status: "pass" | "warn" | "fail" | "unverified";
  detail: string;
  nis2Article: string;
  cisControls?: string[];
  iso27001Controls?: string[];
  nistCsfControls?: string[];
}

function FrameworkTags({ cis, iso, nist }: { cis?: string[]; iso?: string[]; nist?: string[] }) {
  if (!cis?.length && !iso?.length && !nist?.length) return null;
  return (
    <>
      {cis?.map((c) => (
        <Badge key={c} tone="neutral" className="text-lg">{c}</Badge>
      ))}
      {iso?.map((c) => (
        <Badge key={c} tone="neutral" className="text-lg">{c}</Badge>
      ))}
      {nist?.map((c) => (
        <Badge key={c} tone="neutral" className="text-lg">{c}</Badge>
      ))}
    </>
  );
}

function SecurityChecklist({ checks }: { checks: SecurityCheck[] }) {
  const badge = (status: "pass" | "warn" | "fail" | "unverified") => {
    if (status === "pass")       return <Badge tone="ok" className="text-lg">OK</Badge>;
    if (status === "warn")       return <Badge tone="warn" className="text-lg">Aviso</Badge>;
    if (status === "unverified") return <Badge tone="neutral" className="text-lg">Não verificado</Badge>;
    return <Badge tone="bad" className="text-lg">Falha</Badge>;
  };

  return (
    <ul className="space-y-4">
      {checks.map((c) => (
        <li key={c.name} className="flex items-start gap-4 bg-surface-2 border border-line rounded-lg p-4">
          <div className="mt-0.5 shrink-0">{badge(c.status)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <p className="text-xl font-medium text-text">{c.name}</p>
              <span className="text-lg text-dim">{c.nis2Article}</span>
              <FrameworkTags cis={c.cisControls} iso={c.iso27001Controls} nist={c.nistCsfControls} />
            </div>
            <p className="text-lg text-dim">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// VulnerabilityListFromScan — grid 2-3 cards per row
// ---------------------------------------------------------------------------

interface VulnSummary {
  cveId: string;
  severity: string;
  cvssScore: number;
  description: string;
  affectedService: string;
  nis2Articles: string[];
  cisControls?: string[];
  iso27001Controls?: string[];
  nistCsfControls?: string[];
}

function VulnerabilityListFromScan({ results }: { results: any }) {
  // Fonte única: results.vulnerabilities (array, pós-consolidação).
  // Fallback vulnerabilitiesFound para retrocompatibilidade com scans antigos.
  const vulns: VulnSummary[] = results?.vulnerabilities ?? [];
  const hasAnyVulns = vulns.length > 0 || (results?.vulnerabilitiesFound ?? 0) > 0;

  if (!hasAnyVulns) {
    return (
      <p className="text-xl text-dim text-center py-8">
        Nenhuma vulnerabilidade registada.
      </p>
    );
  }

  if (!vulns.length) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        {results.criticalCount > 0 && (
          <div className={`border rounded-xl p-5 ${sevCardClass.critical}`}>
            <p className="text-4xl font-bold text-sev-critica">{results.criticalCount}</p>
            <p className="text-xl text-dim mt-1">Críticas</p>
          </div>
        )}
        {results.highCount > 0 && (
          <div className={`border rounded-xl p-5 ${sevCardClass.high}`}>
            <p className="text-4xl font-bold text-sev-alta">{results.highCount}</p>
            <p className="text-xl text-dim mt-1">Altas</p>
          </div>
        )}
        {results.mediumCount > 0 && (
          <div className={`border rounded-xl p-5 ${sevCardClass.medium}`}>
            <p className="text-4xl font-bold text-sev-media">{results.mediumCount}</p>
            <p className="text-xl text-dim mt-1">Médias</p>
          </div>
        )}
        {results.lowCount > 0 && (
          <div className={`border rounded-xl p-5 ${sevCardClass.low}`}>
            <p className="text-4xl font-bold text-sev-baixa">{results.lowCount}</p>
            <p className="text-xl text-dim mt-1">Baixas</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {vulns.map((v) => (
        <li key={v.cveId} className={`border rounded-xl p-5 flex flex-col gap-3 ${sevCardClass[v.severity] ?? sevCardClass.low}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1 text-lg font-semibold rounded-full ${sevBadgeClass[v.severity] ?? sevBadgeClass.low}`}>
              {sevLabel[v.severity] ?? v.severity}
            </span>
            <span className="text-xl font-mono font-medium text-text">
              {v.cveId.startsWith("CVE-") ? (
                <a
                  href={`https://nvd.nist.gov/vuln/detail/${v.cveId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {v.cveId}
                </a>
              ) : (
                v.cveId
              )}
            </span>
            {v.cvssScore > 0 && (
              <span className="text-lg text-dim">CVSS {v.cvssScore.toFixed(1)}</span>
            )}
          </div>
          <p className="text-lg text-dim leading-relaxed">{v.description}</p>
          <p className="text-lg text-dim">{v.affectedService}</p>
          {((v.nis2Articles?.length ?? 0) > 0 || (v.cisControls?.length ?? 0) > 0 || (v.iso27001Controls?.length ?? 0) > 0 || (v.nistCsfControls?.length ?? 0) > 0) && (
            <div className="flex items-center flex-wrap gap-2">
              {v.nis2Articles?.map((a) => (
                <span key={a} className="text-lg text-dim">{a}</span>
              ))}
              <FrameworkTags cis={v.cisControls} iso={v.iso27001Controls} nist={v.nistCsfControls} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// DarkWebSection
// ---------------------------------------------------------------------------

interface BreachRecord { name: string; dataClasses: string[]; hasPasswords: boolean; }
interface BlacklistItem { name: string; listed: boolean; detail: string; }
interface DarkWeb {
  hibpEnabled: boolean;
  breachesFound: number;
  breaches: BreachRecord[];
  hasPasswordExposure: boolean;
  blacklists: BlacklistItem[];
}

function DarkWebSection({ darkWeb }: { darkWeb: DarkWeb }) {
  return (
    <div className="space-y-6">
      {darkWeb.hibpEnabled ? (
        <div>
          <p className="text-lg font-semibold text-dim uppercase tracking-wide mb-3">
            Credenciais expostas (Have I Been Pwned)
          </p>
          {darkWeb.breachesFound === 0 ? (
            <div className="flex items-center gap-3 text-xl text-ok">
              <Badge tone="ok" className="text-lg">Sem fugas</Badge>
              <span>Nenhuma fuga de credenciais detectada para este domínio.</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <Badge tone="bad" className="text-lg">
                  {darkWeb.breachesFound} breach{darkWeb.breachesFound !== 1 ? "es" : ""}
                </Badge>
                {darkWeb.hasPasswordExposure && (
                  <span className="text-xl font-medium text-bad">inclui passwords expostas — risco crítico</span>
                )}
              </div>
              <ul className="space-y-3">
                {darkWeb.breaches.map((b) => (
                  <li key={b.name} className="flex items-start gap-4 border border-line rounded-lg px-4 py-3 bg-surface-2">
                    <Badge tone={b.hasPasswords ? "bad" : "warn"} className="text-lg shrink-0 mt-0.5">
                      {b.hasPasswords ? "Crítico" : "Alto"}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-xl font-medium text-text">{b.name}</p>
                      <p className="text-lg text-dim mt-0.5">{b.dataClasses.join(" · ")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="text-lg text-dim italic">
          Verificação HIBP não configurada (HIBP_API_KEY ausente) — contacta o suporte para activar.
        </div>
      )}

      <div>
        <p className="text-lg font-semibold text-dim uppercase tracking-wide mb-3">
          Listas negras DNS (Spamhaus / SpamCop)
        </p>
        <ul className="space-y-3">
          {darkWeb.blacklists.map((bl) => (
            <li key={bl.name} className="flex items-start gap-4 bg-surface-2 border border-line rounded-lg px-4 py-3">
              <Badge tone={bl.listed ? "bad" : "ok"} className="text-lg shrink-0 mt-0.5">
                {bl.listed ? "Listado" : "Limpo"}
              </Badge>
              <div className="min-w-0">
                <p className="text-xl font-medium text-text">{bl.name}</p>
                <p className="text-lg text-dim mt-0.5">{bl.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TlsSection
// ---------------------------------------------------------------------------

interface DirectCert {
  subject: string; issuer: string; validFrom: string; validTo: string;
  daysUntilExpiry: number; isExpired: boolean; isSelfSigned: boolean;
  isWildcard: boolean; tlsVersion: string; cipher: string; sans: string[];
}
interface DirectTlsData {
  accessible: boolean;
  certificate: DirectCert | null;
  tlsIssues: Array<{ issue: string; severity: string; nis2Article: string }>;
  ports: Array<{ port: number; open: boolean; service: string }>;
  cdn: { detected: boolean; provider: string | null; isProtected: boolean };
}

function TlsSection({ directTls }: { directTls: DirectTlsData }) {
  const cert = directTls.certificate;
  const cdn  = directTls.cdn;

  return (
    <div className="space-y-5">
      {cdn.detected && (
        <div className="flex items-start gap-4 p-4 bg-accent/10 border border-accent/30 rounded-lg">
          <Icon as={Shield} className="text-accent mt-0.5 shrink-0" size={22} />
          <div>
            <p className="text-xl font-semibold text-accent">Protegido por {cdn.provider}</p>
            <p className="text-lg text-accent mt-1">
              O servidor está atrás de um CDN/proxy. Portas internas não são expostas directamente — é uma boa prática de segurança.
              A análise TLS foi feita directamente ao domínio.
            </p>
          </div>
        </div>
      )}

      {cert ? (
        <div className="border border-line rounded-lg overflow-hidden">
          <div className="bg-surface-2 px-5 py-3 border-b border-line">
            <p className="text-lg font-semibold text-dim uppercase tracking-wide">Certificado TLS</p>
          </div>
          <div className="divide-y divide-line">
            {[
              { label: "Emitido para",  value: cert.subject },
              { label: "Emissor (CA)",  value: cert.issuer },
              { label: "Versão TLS",    value: cert.tlsVersion },
              { label: "Cifra",         value: cert.cipher },
              { label: "Válido até",
                value: cert.isExpired ? (
                  <>{new Date(cert.validTo).toLocaleDateString("pt-PT")} — <Icon as={AlertTriangle} size={15} className="inline mr-1 text-bad" />EXPIRADO</>
                ) : cert.daysUntilExpiry < 30 ? (
                  <>{new Date(cert.validTo).toLocaleDateString("pt-PT")} — <Icon as={AlertTriangle} size={15} className="inline mr-1 text-warn" />Expira em {cert.daysUntilExpiry} dias</>
                ) : (
                  <>{new Date(cert.validTo).toLocaleDateString("pt-PT")} — <Icon as={Check} size={15} className="inline mr-1 text-ok" />{cert.daysUntilExpiry} dias restantes</>
                ),
                highlight: cert.isExpired ? "text-bad" : cert.daysUntilExpiry < 30 ? "text-warn" : "text-ok",
              },
              { label: "Wildcard",      value: cert.isWildcard ? "Sim" : "Não" },
              { label: "Auto-assinado",
                value: cert.isSelfSigned ? (
                  <><Icon as={AlertTriangle} size={15} className="inline mr-1 text-warn" />Sim</>
                ) : (
                  <><Icon as={Check} size={15} className="inline mr-1 text-ok" />Não</>
                ),
              },
            ].map((row) => (
              <div key={row.label} className="flex gap-4 px-5 py-3">
                <span className="text-lg text-dim w-36 shrink-0">{row.label}</span>
                <span className={`text-lg font-mono ${(row as any).highlight ?? "text-text"} break-all`}>
                  {row.value}
                </span>
              </div>
            ))}
            {cert.sans.length > 0 && (
              <div className="flex gap-4 px-5 py-3">
                <span className="text-lg text-dim w-36 shrink-0">SANs</span>
                <span className="text-lg font-mono text-dim break-all">
                  {cert.sans.slice(0, 6).join(", ")}{cert.sans.length > 6 ? ` (+${cert.sans.length - 6})` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xl text-dim italic">
          {directTls.accessible ? "Certificado não obtido." : "Servidor HTTPS não acessível."}
        </div>
      )}

      {directTls.tlsIssues.length > 0 && (
        <div>
          <p className="text-lg font-semibold text-dim uppercase tracking-wide mb-3">Problemas TLS detectados</p>
          <ul className="space-y-3">
            {directTls.tlsIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-4 bg-surface-2 border border-line rounded-lg p-4">
                <span className={`px-3 py-1 text-lg font-semibold rounded-full shrink-0 mt-0.5 ${
                  issue.severity === "critical" ? "bg-sev-critica/20 text-sev-critica border border-sev-critica/40"
                  : issue.severity === "high"   ? "bg-sev-alta/20 text-sev-alta border border-sev-alta/40"
                  : "bg-warn/20 text-warn border border-warn/40"
                }`}>
                  {issue.severity === "critical" ? "Crítico" : issue.severity === "high" ? "Alto" : "Aviso"}
                </span>
                <div>
                  <p className="text-xl text-text">{issue.issue}</p>
                  <p className="text-lg text-dim">{issue.nis2Article}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cert && directTls.tlsIssues.length === 0 && (
        <div className="flex items-center gap-3 text-xl text-ok">
          <Badge tone="ok" className="text-lg">OK</Badge>
          <span>TLS configurado correctamente. Sem problemas detectados.</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PortsSection
// ---------------------------------------------------------------------------

interface PortEntry { port: number; protocol: string; service: string; product?: string; version?: string; cves?: string[]; }

function PortsSection({ ports, cdn }: { ports: PortEntry[]; cdn?: { detected: boolean; provider: string | null } }) {
  return (
    <div className="space-y-4">
      {cdn?.detected && (
        <p className="text-lg text-dim italic">
          Domínio atrás de {cdn.provider} — apenas portas 80/443 expostas publicamente.
        </p>
      )}
      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-4 bg-surface-2 px-5 py-3 border-b border-line">
          {["Porta", "Protocolo", "Serviço", "CVEs"].map((h) => (
            <p key={h} className="text-lg font-semibold text-dim uppercase tracking-wide">{h}</p>
          ))}
        </div>
        {ports.map((p) => (
          <div key={p.port} className="grid grid-cols-4 px-5 py-3 border-b border-line last:border-0 hover:bg-surface-2 transition-colors">
            <span className="text-xl font-mono font-semibold text-text">{p.port}</span>
            <span className="text-lg text-dim uppercase">{p.protocol ?? "tcp"}</span>
            <span className="text-lg text-dim">{p.product ? `${p.service} (${p.product}${p.version ? " " + p.version : ""})` : p.service}</span>
            <span className="text-lg">
              {p.cves && p.cves.length > 0
                ? <span className="text-bad font-medium">{p.cves.length} CVE{p.cves.length > 1 ? "s" : ""}</span>
                : <span className="text-ok">—</span>
              }
            </span>
          </div>
        ))}
      </div>
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
