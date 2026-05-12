import { useParams, useNavigate, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import Nis2ScoreChart from "../components/Nis2ScoreChart";
import VulnerabilityList from "../components/VulnerabilityList";

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
          A analisar <span className="font-mono">{scan.target}</span> via Shodan + Censys + DNS.
          Pode demorar 1–3 minutos.
        </p>
        <div className="mt-8 flex justify-center gap-3 flex-wrap">
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
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
                <span className="text-blue-700 text-xs font-bold">{i + 1}</span>
              </div>
              <span className="text-xs text-gray-400 max-w-[70px] text-center">{step}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Completed ────────────────────────────────────────────────────────────
  const results  = scan.results as any;
  const vulnCount = results?.vulnerabilitiesFound ?? 0;
  const critical  = results?.criticalCount ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
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
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Score NIS2 por Artigo</h2>
        {results?.nis2Scores ? (
          <Nis2ScoreChart scores={results.nis2Scores} />
        ) : (
          <p className="text-sm text-gray-400">Dados de score não disponíveis para este scan.</p>
        )}
      </section>

      {/* TLS & Certificates section */}
      {results?.directTls && (
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">TLS &amp; Certificados</h2>
          <TlsSection directTls={results.directTls} />
        </section>
      )}

      {/* Ports & Services section */}
      {results?.openPorts && results.openPorts.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Portos &amp; Serviços</h2>
          <PortsSection ports={results.openPorts} cdn={results.directTls?.cdn} />
        </section>
      )}

      {/* Email security section */}
      {results?.emailSecurity && (
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Segurança de Email</h2>
          <SecurityChecklist checks={results.emailSecurity.checks} />
        </section>
      )}

      {/* HTTP headers section */}
      {results?.httpHeaders && (
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Headers de Segurança HTTP
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Analisado via{" "}
            <span className="font-mono">{results.httpHeaders.url}</span>
          </p>
          <SecurityChecklist checks={results.httpHeaders.checks} />
        </section>
      )}

      {/* Dark web & reputation section */}
      {results?.darkWeb && (
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Dark Web &amp; Reputação
          </h2>
          <DarkWebSection darkWeb={results.darkWeb} />
        </section>
      )}

      {/* Vulnerability list */}
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Vulnerabilidades
          {vulnCount > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">({vulnCount})</span>
          )}
        </h2>
        <VulnerabilityListFromScan results={results} />
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
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
      <p className={`text-2xl font-bold ${danger && accent ? "text-red-600" : accent ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
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

// ---------------------------------------------------------------------------
// SecurityChecklist — pass/warn/fail badges for email & header checks
// ---------------------------------------------------------------------------

interface SecurityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  nis2Article: string;
}

function SecurityChecklist({ checks }: { checks: SecurityCheck[] }) {
  const badge = (status: "pass" | "warn" | "fail") => {
    if (status === "pass")
      return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">Pass</span>;
    if (status === "warn")
      return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">Aviso</span>;
    return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">Falha</span>;
  };

  return (
    <ul className="space-y-3">
      {checks.map((c) => (
        <li key={c.name} className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">{badge(c.status)}</div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">
              {c.name}
              <span className="ml-2 text-xs font-normal text-gray-400">{c.nis2Article}</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// VulnerabilityListFromScan — reads from pre-fetched results JSON
// ---------------------------------------------------------------------------

interface VulnSummary {
  cveId: string;
  severity: string;
  cvssScore: number;
  description: string;
  affectedService: string;
  nis2Articles: string[];
}

function severityColor(s: string) {
  if (s === "critical") return "text-red-700 bg-red-50";
  if (s === "high")     return "text-orange-700 bg-orange-50";
  if (s === "medium")   return "text-yellow-700 bg-yellow-50";
  return "text-blue-700 bg-blue-50";
}

function severityLabel(s: string) {
  if (s === "critical") return "Crítica";
  if (s === "high")     return "Alta";
  if (s === "medium")   return "Média";
  return "Baixa";
}

function VulnerabilityListFromScan({ results }: { results: any }) {
  if (!results?.vulnerabilitiesFound) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">
        Nenhuma vulnerabilidade registada.
      </p>
    );
  }

  const vulns: VulnSummary[] = results.vulnerabilities ?? [];

  if (!vulns.length) {
    return (
      <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {results.criticalCount > 0 && (
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xl font-bold text-red-700">{results.criticalCount}</p>
              <p className="text-xs text-red-600 mt-0.5">Críticas</p>
            </div>
          )}
          {results.highCount > 0 && (
            <div className="bg-orange-50 rounded-lg p-3">
              <p className="text-xl font-bold text-orange-700">{results.highCount}</p>
              <p className="text-xs text-orange-600 mt-0.5">Altas</p>
            </div>
          )}
          {results.mediumCount > 0 && (
            <div className="bg-yellow-50 rounded-lg p-3">
              <p className="text-xl font-bold text-yellow-700">{results.mediumCount}</p>
              <p className="text-xs text-yellow-600 mt-0.5">Médias</p>
            </div>
          )}
          {results.lowCount > 0 && (
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xl font-bold text-blue-700">{results.lowCount}</p>
              <p className="text-xs text-blue-600 mt-0.5">Baixas</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {vulns.map((v) => (
        <li key={v.cveId} className="border border-gray-100 rounded-lg p-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${severityColor(v.severity)}`}>
                {severityLabel(v.severity)}
              </span>
              <span className="text-sm font-mono font-medium text-gray-800">
                {v.cveId.startsWith("CVE-") ? (
                  <a
                    href={`https://nvd.nist.gov/vuln/detail/${v.cveId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 hover:underline"
                  >
                    {v.cveId}
                  </a>
                ) : (
                  v.cveId
                )}
              </span>
              {v.cvssScore > 0 && (
                <span className="text-xs text-gray-400">CVSS {v.cvssScore.toFixed(1)}</span>
              )}
            </div>
            <span className="text-xs text-gray-400">{v.affectedService}</span>
          </div>
          <p className="text-xs text-gray-600 mt-2">{v.description}</p>
          {v.nis2Articles?.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">{v.nis2Articles.join(" · ")}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// DarkWebSection — breaches + DNS blacklists
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
    <div className="space-y-5">
      {/* HIBP credential breaches */}
      {darkWeb.hibpEnabled ? (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Credenciais expostas (Have I Been Pwned)
          </p>
          {darkWeb.breachesFound === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">Limpo</span>
              <span>Nenhum breach de credenciais detectado para este domínio.</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                  {darkWeb.breachesFound} breach{darkWeb.breachesFound !== 1 ? "es" : ""}
                </span>
                {darkWeb.hasPasswordExposure && (
                  <span className="text-xs font-medium text-red-600">inclui passwords expostas — risco crítico</span>
                )}
              </div>
              <ul className="space-y-2">
                {darkWeb.breaches.map((b) => (
                  <li key={b.name} className="flex items-start gap-3 border border-gray-100 rounded-lg px-3 py-2">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full shrink-0 mt-0.5 ${
                      b.hasPasswords ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {b.hasPasswords ? "Crítico" : "Alto"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{b.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{b.dataClasses.join(" · ")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-400 italic">
          Verificação HIBP não configurada (HIBP_API_KEY ausente) — contacta o suporte para activar.
        </div>
      )}

      {/* DNS Blacklists */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Listas negras DNS (Spamhaus / SpamCop)
        </p>
        <ul className="space-y-2">
          {darkWeb.blacklists.map((bl) => (
            <li key={bl.name} className="flex items-start gap-3">
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full shrink-0 mt-0.5 ${
                bl.listed
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}>
                {bl.listed ? "Listado" : "Limpo"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{bl.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{bl.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TlsSection — direct TLS certificate + CDN detection
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
    <div className="space-y-4">
      {/* CDN/Proxy detection */}
      {cdn.detected && (
        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <span className="text-blue-500 mt-0.5 shrink-0">🛡️</span>
          <div>
            <p className="text-sm font-semibold text-blue-800">
              Protegido por {cdn.provider}
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              O servidor está atrás de um CDN/proxy. Portos internos não são expostos directamente — é uma boa prática de segurança.
              A análise TLS foi feita directamente ao domínio.
            </p>
          </div>
        </div>
      )}

      {/* Certificate info */}
      {cert ? (
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Certificado TLS</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { label: "Emitido para",   value: cert.subject },
              { label: "Emissor (CA)",   value: cert.issuer },
              { label: "Versão TLS",     value: cert.tlsVersion },
              { label: "Cifra",          value: cert.cipher },
              { label: "Válido até",
                value: `${new Date(cert.validTo).toLocaleDateString("pt-PT")} ${
                  cert.isExpired
                    ? "— ⚠️ EXPIRADO"
                    : cert.daysUntilExpiry < 30
                    ? `— ⚠️ Expira em ${cert.daysUntilExpiry} dias`
                    : `— ✓ ${cert.daysUntilExpiry} dias restantes`
                }`,
                highlight: cert.isExpired ? "text-red-600" : cert.daysUntilExpiry < 30 ? "text-amber-600" : "text-green-700",
              },
              { label: "Wildcard",       value: cert.isWildcard ? "Sim" : "Não" },
              { label: "Auto-assinado",  value: cert.isSelfSigned ? "Sim ⚠️" : "Não ✓" },
            ].map((row) => (
              <div key={row.label} className="flex gap-3 px-4 py-2.5">
                <span className="text-xs text-gray-400 w-32 shrink-0">{row.label}</span>
                <span className={`text-xs font-mono ${(row as any).highlight ?? "text-gray-800"} break-all`}>
                  {row.value}
                </span>
              </div>
            ))}
            {cert.sans.length > 0 && (
              <div className="flex gap-3 px-4 py-2.5">
                <span className="text-xs text-gray-400 w-32 shrink-0">SANs</span>
                <span className="text-xs font-mono text-gray-700 break-all">{cert.sans.slice(0, 6).join(", ")}{cert.sans.length > 6 ? ` (+${cert.sans.length - 6})` : ""}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic">
          {directTls.accessible ? "Certificado não obtido." : "Servidor HTTPS não acessível."}
        </div>
      )}

      {/* TLS issues */}
      {directTls.tlsIssues.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Problemas TLS detectados</p>
          <ul className="space-y-2">
            {directTls.tlsIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full shrink-0 mt-0.5 ${
                  issue.severity === "critical" ? "bg-red-100 text-red-700"
                  : issue.severity === "high"   ? "bg-orange-100 text-orange-700"
                  : "bg-amber-100 text-amber-700"
                }`}>
                  {issue.severity === "critical" ? "Crítico" : issue.severity === "high" ? "Alto" : "Aviso"}
                </span>
                <div>
                  <p className="text-sm text-gray-700">{issue.issue}</p>
                  <p className="text-xs text-gray-400">{issue.nis2Article}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No issues = pass */}
      {cert && directTls.tlsIssues.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">Pass</span>
          <span>TLS configurado correctamente. Sem problemas detectados.</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PortsSection — open ports list (80/443 from direct check + Shodan extras)
// ---------------------------------------------------------------------------

interface PortEntry { port: number; protocol: string; service: string; product?: string; version?: string; cves?: string[]; }

function PortsSection({ ports, cdn }: { ports: PortEntry[]; cdn?: { detected: boolean; provider: string | null } }) {
  return (
    <div className="space-y-3">
      {cdn?.detected && (
        <p className="text-xs text-gray-400 italic">
          Domínio atrás de {cdn.provider} — apenas portos 80/443 expostos publicamente. Portos internos não são visíveis.
        </p>
      )}
      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <div className="grid grid-cols-4 bg-gray-50 px-4 py-2 border-b border-gray-100">
          {["Porto", "Protocolo", "Serviço", "CVEs"].map((h) => (
            <p key={h} className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</p>
          ))}
        </div>
        {ports.map((p) => (
          <div key={p.port} className="grid grid-cols-4 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
            <span className="text-sm font-mono font-semibold text-gray-900">{p.port}</span>
            <span className="text-xs text-gray-500 uppercase">{p.protocol ?? "tcp"}</span>
            <span className="text-xs text-gray-700">{p.product ? `${p.service} (${p.product}${p.version ? " " + p.version : ""})` : p.service}</span>
            <span className="text-xs">
              {p.cves && p.cves.length > 0
                ? <span className="text-red-600 font-medium">{p.cves.length} CVE{p.cves.length > 1 ? "s" : ""}</span>
                : <span className="text-green-600">—</span>
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
