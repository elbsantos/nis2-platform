import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import Nis2ScoreChart from "../components/Nis2ScoreChart";
import VulnerabilityList from "../components/VulnerabilityList";

const POLL_INTERVAL = 4_000;

// Dark theme tokens
const CARD  = "bg-[#152744] border border-[#1e3a5f] rounded-xl";
const CARD2 = "bg-[#0f1e38] border border-[#1e3a5f] rounded-lg";

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

  if (isNaN(id)) {
    navigate("/scan/history", { replace: true });
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f1e38] flex items-center justify-center">
        <div className="text-center">
          <Spinner />
          <p className="mt-4 text-slate-400 text-xl">A carregar resultados…</p>
        </div>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="min-h-screen bg-[#0f1e38] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-medium text-2xl">Scan não encontrado</p>
          <Link to="/scan/history" className="mt-4 inline-block text-xl text-amber-400 hover:underline">
            ← Ver histórico
          </Link>
        </div>
      </div>
    );
  }

  if (scan.status === "failed") {
    return (
      <div className="min-h-screen bg-[#0f1e38] flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-semibold text-white text-2xl mb-1">Scan falhou</p>
          <p className="text-xl text-slate-400 mb-6">
            Verifica que o DNS TXT record está correcto e tenta novamente.
          </p>
          <Link to="/scan/start"
            className="inline-block px-6 py-3 bg-red-700 text-white text-xl rounded-md hover:bg-red-800"
          >
            Novo scan
          </Link>
        </div>
      </div>
    );
  }

  if (scan.status === "pending" || scan.status === "running") {
    return (
      <div className="min-h-screen bg-[#0f1e38] flex items-center justify-center">
        <div className="text-center max-w-2xl px-4">
          <Spinner size="lg" />
          <p className="mt-6 text-white font-medium text-2xl">
            {scan.status === "pending" ? "Scan na fila…" : "A executar scan NIS2…"}
          </p>
          <p className="text-xl text-slate-400 mt-2">
            A analisar <span className="font-mono">{scan.target}</span> via Shodan + Censys + DNS.
            Pode demorar 1–3 minutos.
          </p>
          <div className="mt-8 flex justify-center gap-4 flex-wrap">
            {[
              "Verificação de ownership",
              "Análise Shodan",
              "Análise TLS Censys",
              "Segurança Email",
              "Headers HTTP",
              "Dark Web & Reputação",
              "Score NIS2",
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-amber-900/30 border border-amber-500/40 flex items-center justify-center animate-pulse">
                  <span className="text-amber-400 text-lg font-bold">{i + 1}</span>
                </div>
                <span className="text-lg text-slate-400 max-w-[90px] text-center">{step}</span>
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
  const critical  = results?.criticalCount ?? 0;
  const high      = results?.highCount ?? 0;
  const medium    = results?.mediumCount ?? 0;

  return (
    <div className="min-h-screen bg-[#0f1e38]">
      <div className="max-w-[100rem] mx-auto px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <Link to="/scan/history" className="text-lg text-slate-400 hover:text-slate-200 hover:underline">
              ← Histórico
            </Link>
            <h1 className="text-3xl font-bold text-white mt-1">{scan.target}</h1>
            <p className="text-xl text-slate-400">
              Scan #{scan.id} · {new Date(scan.completedAt ?? scan.createdAt).toLocaleString("pt-PT")}
            </p>
          </div>
          <div className="flex gap-3">
            <PdfButton scanId={scan.id} type="executive" label="PDF Executivo" />
            <PdfButton scanId={scan.id} type="technical" label="PDF Técnico" />
          </div>
        </div>

        {/* Summary cards — 5 colunas: total + 3 severidades + duração */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <SummaryCard label="Vulnerabilidades" value={String(vulnCount)} accent={vulnCount > 0} />
          <SummaryCard label="Críticas" value={String(critical)} accent={critical > 0} danger />
          <SummaryCard label="Altas"    value={String(high)}     accent={high > 0}     warn />
          <SummaryCard label="Médias"   value={String(medium)}   accent={medium > 0}   mediumSev />
          <SummaryCard label="Duração"  value={scan.completedAt ? elapsedLabel(scan.startedAt, scan.completedAt) : "—"} />
        </div>

        {/* NIS2 Score chart */}
        <section className={`${CARD} p-6`}>
          <h2 className="text-2xl font-semibold text-white mb-4">Score NIS2 por Artigo</h2>
          {results?.nis2Scores ? (
            <Nis2ScoreChart
            scores={results.nis2Scores}
            overallScore={results.overallScore ?? 0}
          />
          ) : (
            <p className="text-xl text-slate-400">Dados de score não disponíveis para este scan.</p>
          )}
        </section>

        {/* TLS & Certificates */}
        {results?.directTls && (
          <section className={`${CARD} p-6`}>
            <h2 className="text-2xl font-semibold text-white mb-4">TLS &amp; Certificados</h2>
            <TlsSection directTls={results.directTls} />
          </section>
        )}

        {/* Ports & Services */}
        {results?.openPorts && results.openPorts.length > 0 && (
          <section className={`${CARD} p-6`}>
            <h2 className="text-2xl font-semibold text-white mb-4">Portos &amp; Serviços</h2>
            <PortsSection ports={results.openPorts} cdn={results.directTls?.cdn} />
          </section>
        )}

        {/* Email security */}
        {results?.emailSecurity && (
          <section className={`${CARD} p-6`}>
            <h2 className="text-2xl font-semibold text-white mb-4">Segurança de Email</h2>
            <SecurityChecklist checks={results.emailSecurity.checks} />
          </section>
        )}

        {/* HTTP headers */}
        {results?.httpHeaders && (
          <section className={`${CARD} p-6`}>
            <h2 className="text-2xl font-semibold text-white mb-1">Headers de Segurança HTTP</h2>
            <p className="text-lg text-slate-400 mb-4">
              Analisado via <span className="font-mono">{results.httpHeaders.url}</span>
            </p>
            <SecurityChecklist checks={results.httpHeaders.checks} />
          </section>
        )}

        {/* Dark web & reputation */}
        {results?.darkWeb && (
          <section className={`${CARD} p-6`}>
            <h2 className="text-2xl font-semibold text-white mb-4">Dark Web &amp; Reputação</h2>
            <DarkWebSection darkWeb={results.darkWeb} />
          </section>
        )}

        {/* Vulnerabilities */}
        <section className={`${CARD} p-6`}>
          <h2 className="text-2xl font-semibold text-white mb-4">
            Vulnerabilidades
            {vulnCount > 0 && (
              <span className="ml-2 text-xl font-normal text-slate-400">({vulnCount})</span>
            )}
          </h2>
          <VulnerabilityListFromScan results={results} />
        </section>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link to="/scan/start"
            className="px-5 py-3 border border-[#1e3a5f] text-xl rounded-md text-slate-300 hover:bg-[#152744]"
          >
            Novo scan
          </Link>
          <Link to="/scan/history"
            className="px-5 py-3 border border-[#1e3a5f] text-xl rounded-md text-slate-300 hover:bg-[#152744]"
          >
            Ver histórico
          </Link>
          <Link to={`/remediation?scanId=${scan.id}`}
            className="px-5 py-3 bg-red-700 text-white text-xl font-medium rounded-md hover:bg-red-800"
          >
            Gerar plano de remediação IA
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
    <svg className={`${cls} animate-spin text-amber-400 mx-auto`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function SummaryCard({
  label, value, accent = false, danger = false, warn = false, mediumSev = false,
}: {
  label: string; value: string; accent?: boolean; danger?: boolean; warn?: boolean; mediumSev?: boolean;
}) {
  const color = danger && accent    ? "text-red-400"
    : warn && accent       ? "text-orange-400"
    : mediumSev && accent  ? "text-yellow-400"
    : accent               ? "text-amber-400"
    : "text-white";
  return (
    <div className="bg-[#152744] border border-[#1e3a5f] rounded-xl p-5 text-center">
      <p className={`text-4xl font-bold ${color}`}>{value}</p>
      <p className="text-lg text-slate-400 mt-1">{label}</p>
    </div>
  );
}

function PdfButton({ scanId, type, label }: { scanId: number; type: "executive" | "technical"; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const generate = trpc.report.generate.useQuery(
    { scanId, type },
    { enabled: false, retry: false }
  );

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const result = await generate.refetch();
      if (!result.data) throw new Error("Sem dados");
      const { pdfBase64, filename } = result.data;
      const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: "application/pdf" });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao gerar PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 bg-red-700 text-white text-lg font-medium rounded-md hover:bg-red-800 transition-colors disabled:opacity-50"
      >
        {loading ? "A gerar…" : `↓ ${label}`}
      </button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SecurityChecklist
// ---------------------------------------------------------------------------

interface SecurityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
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
        <span key={c} className="px-2 py-0.5 text-lg font-medium rounded bg-slate-700 text-slate-300 border border-slate-600">{c}</span>
      ))}
      {iso?.map((c) => (
        <span key={c} className="px-2 py-0.5 text-lg font-medium rounded bg-blue-900/40 text-blue-300 border border-blue-700">{c}</span>
      ))}
      {nist?.map((c) => (
        <span key={c} className="px-2 py-0.5 text-lg font-medium rounded bg-teal-900/40 text-teal-300 border border-teal-700">{c}</span>
      ))}
    </>
  );
}

function SecurityChecklist({ checks }: { checks: SecurityCheck[] }) {
  const badge = (status: "pass" | "warn" | "fail") => {
    if (status === "pass")
      return <span className="px-3 py-1 text-lg font-semibold rounded-full bg-green-900/40 text-green-400 border border-green-700">OK</span>;
    if (status === "warn")
      return <span className="px-3 py-1 text-lg font-semibold rounded-full bg-amber-900/40 text-amber-400 border border-amber-700">Aviso</span>;
    return <span className="px-3 py-1 text-lg font-semibold rounded-full bg-red-900/40 text-red-400 border border-red-700">Falha</span>;
  };

  return (
    <ul className="space-y-4">
      {checks.map((c) => (
        <li key={c.name} className="flex items-start gap-4 bg-[#0f1e38] border border-[#1e3a5f] rounded-lg p-4">
          <div className="mt-0.5 shrink-0">{badge(c.status)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <p className="text-xl font-medium text-white">{c.name}</p>
              <span className="text-lg text-slate-400">{c.nis2Article}</span>
              <FrameworkTags cis={c.cisControls} iso={c.iso27001Controls} nist={c.nistCsfControls} />
            </div>
            <p className="text-lg text-slate-300">{c.detail}</p>
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

function severityColor(s: string) {
  if (s === "critical") return "text-red-400 bg-red-900/30 border-red-700";
  if (s === "high")     return "text-orange-400 bg-orange-900/30 border-orange-700";
  if (s === "medium")   return "text-yellow-400 bg-yellow-900/30 border-yellow-700";
  return "text-blue-400 bg-blue-900/30 border-blue-700";
}

function severityBadge(s: string) {
  if (s === "critical") return "text-red-400 bg-red-900/40 border border-red-700";
  if (s === "high")     return "text-orange-400 bg-orange-900/40 border border-orange-700";
  if (s === "medium")   return "text-yellow-400 bg-yellow-900/40 border border-yellow-700";
  return "text-blue-400 bg-blue-900/40 border border-blue-700";
}

function severityLabel(s: string) {
  if (s === "critical") return "Crítica";
  if (s === "high")     return "Alta";
  if (s === "medium")   return "Média";
  return "Baixa";
}

function VulnerabilityListFromScan({ results }: { results: any }) {
  // Fonte única: results.vulnerabilities (array, pós-consolidação).
  // Fallback vulnerabilitiesFound para retrocompatibilidade com scans antigos.
  const vulns: VulnSummary[] = results?.vulnerabilities ?? [];
  const hasAnyVulns = vulns.length > 0 || (results?.vulnerabilitiesFound ?? 0) > 0;

  if (!hasAnyVulns) {
    return (
      <p className="text-xl text-slate-400 text-center py-8">
        Nenhuma vulnerabilidade registada.
      </p>
    );
  }

  if (!vulns.length) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        {results.criticalCount > 0 && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-5">
            <p className="text-4xl font-bold text-red-400">{results.criticalCount}</p>
            <p className="text-xl text-red-300 mt-1">Críticas</p>
          </div>
        )}
        {results.highCount > 0 && (
          <div className="bg-orange-900/30 border border-orange-700 rounded-xl p-5">
            <p className="text-4xl font-bold text-orange-400">{results.highCount}</p>
            <p className="text-xl text-orange-300 mt-1">Altas</p>
          </div>
        )}
        {results.mediumCount > 0 && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-5">
            <p className="text-4xl font-bold text-yellow-400">{results.mediumCount}</p>
            <p className="text-xl text-yellow-300 mt-1">Médias</p>
          </div>
        )}
        {results.lowCount > 0 && (
          <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-5">
            <p className="text-4xl font-bold text-blue-400">{results.lowCount}</p>
            <p className="text-xl text-blue-300 mt-1">Baixas</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {vulns.map((v) => (
        <li key={v.cveId} className={`border rounded-xl p-5 flex flex-col gap-3 ${severityColor(v.severity)}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1 text-lg font-semibold rounded-full ${severityBadge(v.severity)}`}>
              {severityLabel(v.severity)}
            </span>
            <span className="text-xl font-mono font-medium text-white">
              {v.cveId.startsWith("CVE-") ? (
                <a
                  href={`https://nvd.nist.gov/vuln/detail/${v.cveId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline"
                >
                  {v.cveId}
                </a>
              ) : (
                v.cveId
              )}
            </span>
            {v.cvssScore > 0 && (
              <span className="text-lg text-slate-400">CVSS {v.cvssScore.toFixed(1)}</span>
            )}
          </div>
          <p className="text-lg text-slate-300 leading-relaxed">{v.description}</p>
          <p className="text-lg text-slate-400">{v.affectedService}</p>
          {((v.nis2Articles?.length ?? 0) > 0 || (v.cisControls?.length ?? 0) > 0 || (v.iso27001Controls?.length ?? 0) > 0 || (v.nistCsfControls?.length ?? 0) > 0) && (
            <div className="flex items-center flex-wrap gap-2">
              {v.nis2Articles?.map((a) => (
                <span key={a} className="text-lg text-slate-400">{a}</span>
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
          <p className="text-lg font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Credenciais expostas (Have I Been Pwned)
          </p>
          {darkWeb.breachesFound === 0 ? (
            <div className="flex items-center gap-3 text-xl text-green-400">
              <span className="px-3 py-1 text-lg font-semibold rounded-full bg-green-900/40 text-green-400 border border-green-700">Sem fugas</span>
              <span>Nenhuma fuga de credenciais detectada para este domínio.</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 text-lg font-semibold rounded-full bg-red-900/40 text-red-400 border border-red-700">
                  {darkWeb.breachesFound} breach{darkWeb.breachesFound !== 1 ? "es" : ""}
                </span>
                {darkWeb.hasPasswordExposure && (
                  <span className="text-xl font-medium text-red-400">inclui passwords expostas — risco crítico</span>
                )}
              </div>
              <ul className="space-y-3">
                {darkWeb.breaches.map((b) => (
                  <li key={b.name} className="flex items-start gap-4 border border-[#1e3a5f] rounded-lg px-4 py-3 bg-[#0f1e38]">
                    <span className={`px-3 py-1 text-lg font-semibold rounded-full shrink-0 mt-0.5 ${
                      b.hasPasswords ? "bg-red-900/40 text-red-400 border border-red-700" : "bg-amber-900/40 text-amber-400 border border-amber-700"
                    }`}>
                      {b.hasPasswords ? "Crítico" : "Alto"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xl font-medium text-white">{b.name}</p>
                      <p className="text-lg text-slate-400 mt-0.5">{b.dataClasses.join(" · ")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="text-lg text-slate-400 italic">
          Verificação HIBP não configurada (HIBP_API_KEY ausente) — contacta o suporte para activar.
        </div>
      )}

      <div>
        <p className="text-lg font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Listas negras DNS (Spamhaus / SpamCop)
        </p>
        <ul className="space-y-3">
          {darkWeb.blacklists.map((bl) => (
            <li key={bl.name} className="flex items-start gap-4 bg-[#0f1e38] border border-[#1e3a5f] rounded-lg px-4 py-3">
              <span className={`px-3 py-1 text-lg font-semibold rounded-full shrink-0 mt-0.5 ${
                bl.listed
                  ? "bg-red-900/40 text-red-400 border border-red-700"
                  : "bg-green-900/40 text-green-400 border border-green-700"
              }`}>
                {bl.listed ? "Listado" : "Limpo"}
              </span>
              <div className="min-w-0">
                <p className="text-xl font-medium text-white">{bl.name}</p>
                <p className="text-lg text-slate-400 mt-0.5">{bl.detail}</p>
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
        <div className="flex items-start gap-4 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <span className="text-blue-400 mt-0.5 shrink-0 text-2xl">🛡️</span>
          <div>
            <p className="text-xl font-semibold text-blue-300">Protegido por {cdn.provider}</p>
            <p className="text-lg text-blue-400 mt-1">
              O servidor está atrás de um CDN/proxy. Portos internos não são expostos directamente — é uma boa prática de segurança.
              A análise TLS foi feita directamente ao domínio.
            </p>
          </div>
        </div>
      )}

      {cert ? (
        <div className="border border-[#1e3a5f] rounded-lg overflow-hidden">
          <div className="bg-[#0f1e38] px-5 py-3 border-b border-[#1e3a5f]">
            <p className="text-lg font-semibold text-slate-400 uppercase tracking-wide">Certificado TLS</p>
          </div>
          <div className="divide-y divide-[#1e3a5f]">
            {[
              { label: "Emitido para",  value: cert.subject },
              { label: "Emissor (CA)",  value: cert.issuer },
              { label: "Versão TLS",    value: cert.tlsVersion },
              { label: "Cifra",         value: cert.cipher },
              { label: "Válido até",
                value: `${new Date(cert.validTo).toLocaleDateString("pt-PT")} ${
                  cert.isExpired
                    ? "— ⚠️ EXPIRADO"
                    : cert.daysUntilExpiry < 30
                    ? `— ⚠️ Expira em ${cert.daysUntilExpiry} dias`
                    : `— ✓ ${cert.daysUntilExpiry} dias restantes`
                }`,
                highlight: cert.isExpired ? "text-red-400" : cert.daysUntilExpiry < 30 ? "text-amber-400" : "text-green-400",
              },
              { label: "Wildcard",      value: cert.isWildcard ? "Sim" : "Não" },
              { label: "Auto-assinado", value: cert.isSelfSigned ? "Sim ⚠️" : "Não ✓" },
            ].map((row) => (
              <div key={row.label} className="flex gap-4 px-5 py-3">
                <span className="text-lg text-slate-400 w-36 shrink-0">{row.label}</span>
                <span className={`text-lg font-mono ${(row as any).highlight ?? "text-white"} break-all`}>
                  {row.value}
                </span>
              </div>
            ))}
            {cert.sans.length > 0 && (
              <div className="flex gap-4 px-5 py-3">
                <span className="text-lg text-slate-400 w-36 shrink-0">SANs</span>
                <span className="text-lg font-mono text-slate-300 break-all">
                  {cert.sans.slice(0, 6).join(", ")}{cert.sans.length > 6 ? ` (+${cert.sans.length - 6})` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xl text-slate-400 italic">
          {directTls.accessible ? "Certificado não obtido." : "Servidor HTTPS não acessível."}
        </div>
      )}

      {directTls.tlsIssues.length > 0 && (
        <div>
          <p className="text-lg font-semibold text-slate-400 uppercase tracking-wide mb-3">Problemas TLS detectados</p>
          <ul className="space-y-3">
            {directTls.tlsIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-4 bg-[#0f1e38] border border-[#1e3a5f] rounded-lg p-4">
                <span className={`px-3 py-1 text-lg font-semibold rounded-full shrink-0 mt-0.5 ${
                  issue.severity === "critical" ? "bg-red-900/40 text-red-400 border border-red-700"
                  : issue.severity === "high"   ? "bg-orange-900/40 text-orange-400 border border-orange-700"
                  : "bg-amber-900/40 text-amber-400 border border-amber-700"
                }`}>
                  {issue.severity === "critical" ? "Crítico" : issue.severity === "high" ? "Alto" : "Aviso"}
                </span>
                <div>
                  <p className="text-xl text-white">{issue.issue}</p>
                  <p className="text-lg text-slate-400">{issue.nis2Article}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cert && directTls.tlsIssues.length === 0 && (
        <div className="flex items-center gap-3 text-xl text-green-400">
          <span className="px-3 py-1 text-lg font-semibold rounded-full bg-green-900/40 text-green-400 border border-green-700">OK</span>
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
        <p className="text-lg text-slate-400 italic">
          Domínio atrás de {cdn.provider} — apenas portos 80/443 expostos publicamente.
        </p>
      )}
      <div className="border border-[#1e3a5f] rounded-lg overflow-hidden">
        <div className="grid grid-cols-4 bg-[#0f1e38] px-5 py-3 border-b border-[#1e3a5f]">
          {["Porto", "Protocolo", "Serviço", "CVEs"].map((h) => (
            <p key={h} className="text-lg font-semibold text-slate-400 uppercase tracking-wide">{h}</p>
          ))}
        </div>
        {ports.map((p) => (
          <div key={p.port} className="grid grid-cols-4 px-5 py-3 border-b border-[#1e3a5f] last:border-0 hover:bg-[#152744] transition-colors">
            <span className="text-xl font-mono font-semibold text-white">{p.port}</span>
            <span className="text-lg text-slate-400 uppercase">{p.protocol ?? "tcp"}</span>
            <span className="text-lg text-slate-300">{p.product ? `${p.service} (${p.product}${p.version ? " " + p.version : ""})` : p.service}</span>
            <span className="text-lg">
              {p.cves && p.cves.length > 0
                ? <span className="text-red-400 font-medium">{p.cves.length} CVE{p.cves.length > 1 ? "s" : ""}</span>
                : <span className="text-green-400">—</span>
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
