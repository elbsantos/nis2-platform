import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tab selector
// ---------------------------------------------------------------------------

type Tab = "único" | "lote" | "subdomínios";

function TabBar({ active, setTab }: { active: Tab; setTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "único",       label: "Scan único",   icon: "🔍" },
    { id: "lote",        label: "Scan em lote", icon: "📋" },
    { id: "subdomínios", label: "Subdomínios",  icon: "🌐" },
  ];
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`flex-1 py-2.5 px-3 text-sm font-medium rounded-lg transition-all ${
            active === t.id
              ? "bg-white text-blue-700 shadow-sm border border-gray-200"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="mr-1.5">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ownership instructions
// ---------------------------------------------------------------------------

function OwnershipBox({ token, isIp, domain, wellKnownUrl }: {
  token: string; isIp: boolean; domain: string; wellKnownUrl?: string | null;
}) {
  return (
    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-600 text-lg">⚠️</span>
        <p className="text-sm font-semibold text-amber-800">Ownership não verificado</p>
      </div>
      {isIp ? (
        <div className="space-y-2">
          <p className="text-xs text-amber-700">Cria o ficheiro abaixo no servidor e tenta novamente:</p>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">URL do ficheiro:</p>
            <code className="block text-xs bg-white border border-gray-200 rounded-lg p-2.5 font-mono break-all text-gray-800">
              {wellKnownUrl}
            </code>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">Conteúdo:</p>
            <code className="block text-xs bg-white border border-gray-200 rounded-lg p-2.5 font-mono break-all text-blue-700">
              {token}
            </code>
          </div>
          <p className="text-xs text-amber-600">O ficheiro deve ser acessível via HTTP.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-amber-700">Adiciona este DNS TXT record e tenta novamente:</p>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">Nome do registo:</p>
            <code className="block text-xs bg-white border border-gray-200 rounded-lg p-2.5 font-mono text-gray-800">
              @ (ou {domain})
            </code>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">Valor:</p>
            <code className="block text-xs bg-white border border-gray-200 rounded-lg p-2.5 font-mono break-all text-blue-700">
              {token}
            </code>
          </div>
          <p className="text-xs text-amber-600">Propagação DNS pode demorar até 5 minutos.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 1 — Scan único
// ---------------------------------------------------------------------------

function SingleScanTab() {
  const navigate = useNavigate();
  const [domain,       setDomain]       = useState("");
  const [verifying,    setVerifying]    = useState(false);
  const [verified,     setVerified]     = useState(false);
  const [token,        setToken]        = useState("");
  const [isIp,         setIsIp]         = useState(false);
  const [wellKnownUrl, setWellKnownUrl] = useState<string | null>(null);
  const [error,        setError]        = useState("");

  const isIpInput = IPV4_RE.test(domain.trim());
  const verifyMutation = trpc.scan.verifyOwnership.useMutation();
  const startMutation  = trpc.scan.start.useMutation();

  const handleVerify = async () => {
    setVerifying(true); setError("");
    try {
      const r = await verifyMutation.mutateAsync({ domain });
      setVerified(r.verified); setToken(r.token);
      setIsIp(r.isIp); setWellKnownUrl(r.wellKnownUrl ?? null);
    } catch (err: any) {
      setError(err.message ?? "Erro ao verificar ownership");
    } finally { setVerifying(false); }
  };

  const handleStart = async () => {
    setError("");
    try {
      const r = await startMutation.mutateAsync({ target: domain, mode: "sme" });
      navigate(`/scan/results/${r.scanId}`);
    } catch (err: any) { setError(err.message ?? "Erro ao iniciar scan"); }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="domain-single" className="block text-sm font-semibold text-gray-700 mb-1.5">
          Domínio ou endereço IP
        </label>
        <input
          id="domain-single"
          type="text"
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setVerified(false); setToken(""); setError(""); }}
          placeholder="exemplo.pt ou 185.1.2.3"
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white"
        />
        {domain && (
          <p className="text-xs text-gray-400 mt-1.5">
            {isIpInput
              ? "Verificação via ficheiro HTTP — precisas de acesso ao servidor."
              : "Verificação via DNS TXT record — precisas de acesso às DNS do domínio."}
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">❌</span>
          <span>{error}</span>
        </div>
      )}

      {!verified ? (
        <>
          <button
            onClick={handleVerify}
            disabled={!domain || verifying}
            className="w-full py-3 px-4 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {verifying ? <><Spinner />A verificar…</> : "Verificar ownership →"}
          </button>
          {token && !verified && (
            <OwnershipBox token={token} isIp={isIp} domain={domain} wellKnownUrl={wellKnownUrl} />
          )}
        </>
      ) : (
        <>
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2.5 text-sm text-green-800">
            <span className="text-green-600 text-base">✓</span>
            <span><strong>Ownership verificado</strong> via {isIp ? "ficheiro HTTP" : "DNS TXT"}.</span>
          </div>
          <button
            onClick={handleStart}
            disabled={startMutation.isPending}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold rounded-xl hover:from-emerald-700 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            {startMutation.isPending ? <><Spinner />A iniciar scan…</> : "Iniciar Scan NIS2 →"}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 2 — Scan em lote
// ---------------------------------------------------------------------------

function BulkScanTab() {
  const navigate = useNavigate();
  const [text,    setText]    = useState("");
  const [error,   setError]   = useState("");
  const [warning, setWarning] = useState("");

  const { data: sub } = trpc.billing.getSubscription.useQuery();
  const plan = sub?.plan ?? "free";
  const maxTargets = plan === "mssp" || plan === "enterprise" ? 50 : plan === "pro" ? 15 : 0;

  const startBulkMut = trpc.scan.startBulk.useMutation({
    onSuccess: (data) => {
      if (data.failed.length > 0) {
        setWarning(`${data.started.length} de ${data.started.length + data.failed.length} targets iniciados. ${data.failed.length} sem ownership verificado foram ignorados.`);
      }
      navigate(`/scan/bulk/${data.batchId}`);
    },
    onError: (err) => setError(err.message),
  });

  const targets = text.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

  if (plan === "free") {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">📋</div>
        <p className="font-bold text-gray-900 mb-2">Scan em lote — Plano Pro</p>
        <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
          Scana múltiplos domínios em paralelo. Até 15 targets por batch no plano Pro.
        </p>
        <Link to="/billing" className="inline-block px-6 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm">
          Ver planos →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Targets <span className="font-normal text-gray-400">(um por linha)</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={"empresa1.pt\nempresa2.pt\n185.1.2.3"}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-gray-50 focus:bg-white transition-all"
        />
        {targets.length > 0 && (
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-gray-400">{targets.length} target{targets.length !== 1 ? "s" : ""} detectado{targets.length !== 1 ? "s" : ""}</p>
            {targets.length > maxTargets && (
              <p className="text-xs text-red-600 font-medium">Máximo {maxTargets} para o teu plano</p>
            )}
          </div>
        )}
      </div>
      {error   && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
      {warning && <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">{warning}</div>}
      <button
        onClick={() => { setError(""); setWarning(""); startBulkMut.mutate({ targets: targets.slice(0, maxTargets), mode: "sme" }); }}
        disabled={targets.length === 0 || startBulkMut.isPending}
        className="w-full py-3 px-4 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm"
      >
        {startBulkMut.isPending ? <><Spinner />A preparar batch…</> : `Iniciar ${Math.min(targets.length, maxTargets)} scan${Math.min(targets.length, maxTargets) !== 1 ? "s" : ""} em lote →`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 3 — Subdomínios
// ---------------------------------------------------------------------------

interface DiscoveredSub { name: string; ip?: string; }

function SubdomainScanTab() {
  const navigate = useNavigate();
  const [domain,     setDomain]     = useState("");
  const [verified,   setVerified]   = useState(false);
  const [token,      setToken]      = useState("");
  const [discovered, setDiscovered] = useState<DiscoveredSub[]>([]);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [error,      setError]      = useState("");

  const { data: sub } = trpc.billing.getSubscription.useQuery();
  const plan = sub?.plan ?? "free";

  const verifyMut    = trpc.scan.verifyOwnership.useMutation();
  const discoverMut  = trpc.scan.discoverSubdomains.useMutation({
    onSuccess: (data) => { setDiscovered(data.subdomains); setSelected(new Set(data.subdomains.map((s) => s.name))); },
    onError:   (err)  => setError(err.message),
  });
  const startBulkMut = trpc.scan.startBulk.useMutation({
    onSuccess: (data) => navigate(`/scan/bulk/${data.batchId}`),
    onError:   (err)  => setError(err.message),
  });

  if (plan === "free") {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">🌐</div>
        <p className="font-bold text-gray-900 mb-2">Descoberta de subdomínios — Plano Pro</p>
        <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
          Descobre automaticamente subdomínios via CT logs e DNS, e scana todos de uma vez.
        </p>
        <Link to="/billing" className="inline-block px-6 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm">
          Ver planos →
        </Link>
      </div>
    );
  }

  const maxSubs = plan === "mssp" || plan === "enterprise" ? 200 : 50;

  const handleVerify = async () => {
    setError(""); setVerified(false); setDiscovered([]); setSelected(new Set());
    try {
      const r = await verifyMut.mutateAsync({ domain });
      setToken(r.token);
      setVerified(r.verified);
    } catch (err: any) { setError(err.message ?? "Erro ao verificar"); }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Domínio raiz</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={domain}
            onChange={(e) => { setDomain(e.target.value); setVerified(false); setDiscovered([]); setError(""); }}
            placeholder="empresa.pt"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-all"
          />
          <button
            onClick={handleVerify}
            disabled={!domain || verifyMut.isPending}
            className="px-5 py-3 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 disabled:opacity-50 shrink-0 transition-colors shadow-sm"
          >
            {verifyMut.isPending ? <Spinner /> : "Verificar"}
          </button>
        </div>
      </div>

      {token && !verified && <OwnershipBox token={token} isIp={false} domain={domain} />}
      {verified && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-sm text-green-800">
          <span className="text-green-600">✓</span>
          <span><strong>{domain}</strong> verificado</span>
        </div>
      )}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

      {verified && discovered.length === 0 && !discoverMut.isPending && (
        <button
          onClick={() => { setError(""); setDiscovered([]); setSelected(new Set()); discoverMut.mutate({ domain }); }}
          className="w-full py-3 px-4 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          🌐 Descobrir subdomínios (até {maxSubs})
        </button>
      )}

      {discoverMut.isPending && (
        <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
          <div className="h-8 w-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-700 mt-3">A consultar CT logs e a resolver DNS…</p>
          <p className="text-xs text-gray-400 mt-1">Pode demorar 10–30 segundos</p>
        </div>
      )}

      {discovered.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">{discovered.length} subdomínio{discovered.length !== 1 ? "s" : ""} descoberto{discovered.length !== 1 ? "s" : ""}</p>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={selected.size === discovered.length} onChange={(e) => setSelected(e.target.checked ? new Set(discovered.map((d) => d.name)) : new Set())} className="rounded" />
              Todos
            </label>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
            {discovered.map((s) => (
              <label key={s.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors">
                <input type="checkbox" checked={selected.has(s.name)} onChange={(e) => { const n = new Set(selected); e.target.checked ? n.add(s.name) : n.delete(s.name); setSelected(n); }} className="rounded shrink-0" />
                <span className="text-sm font-mono text-gray-800 flex-1 truncate">{s.name}</span>
                {s.ip && <span className="text-xs text-gray-400 shrink-0 font-mono">{s.ip}</span>}
              </label>
            ))}
          </div>
          <button
            onClick={() => { setError(""); startBulkMut.mutate({ targets: [...selected], mode: "sme", rootDomain: domain }); }}
            disabled={selected.size === 0 || startBulkMut.isPending}
            className="mt-3 w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold rounded-xl hover:from-emerald-700 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            {startBulkMut.isPending ? <><Spinner />A iniciar scans…</> : `Iniciar scan para ${selected.size} subdomínio${selected.size !== 1 ? "s" : ""} →`}
          </button>
        </div>
      )}

      {discoverMut.isSuccess && discovered.length === 0 && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 text-center">
          Nenhum subdomínio activo encontrado para <strong>{domain}</strong>.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capabilities panel — right side
// ---------------------------------------------------------------------------

const CAPABILITIES = [
  {
    icon: "🔌",
    title: "Portos & Serviços",
    desc: "Portos TCP/UDP abertos, serviços expostos, banners de versão",
    tag: "Shodan",
    tagColor: "bg-red-100 text-red-700",
  },
  {
    icon: "🐛",
    title: "Vulnerabilidades (CVE)",
    desc: "CVEs públicos associados a versões de software detectadas",
    tag: "NVD + Shodan",
    tagColor: "bg-orange-100 text-orange-700",
  },
  {
    icon: "🔒",
    title: "TLS & Certificados",
    desc: "Expiração, algoritmos fracos, self-signed, protocolos obsoletos (SSLv3, TLS 1.0)",
    tag: "Censys",
    tagColor: "bg-blue-100 text-blue-700",
  },
  {
    icon: "📧",
    title: "Segurança de Email",
    desc: "SPF, DKIM (10 selectores), DMARC — conformidade Art. 21(2)(j)",
    tag: "DNS",
    tagColor: "bg-purple-100 text-purple-700",
  },
  {
    icon: "🛡️",
    title: "Headers de Segurança HTTP",
    desc: "HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy",
    tag: "HTTP",
    tagColor: "bg-indigo-100 text-indigo-700",
  },
  {
    icon: "🌑",
    title: "Dark Web & Reputação",
    desc: "Breaches de credenciais (HIBP), blacklists DNS (Spamhaus, SpamCop)",
    tag: "HIBP + DNS",
    tagColor: "bg-gray-200 text-gray-700",
  },
];

function CapabilitiesPanel() {
  return (
    <div className="bg-gray-950 rounded-2xl p-6 h-full flex flex-col">
      <div className="mb-5">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-1">O que o scanner analisa</p>
        <h3 className="text-white text-lg font-bold">6 camadas de análise NIS2</h3>
        <p className="text-gray-400 text-sm mt-1">Mapeadas ao Art. 21 da Directiva NIS2 (EU 2022/2555)</p>
      </div>

      <div className="space-y-3 flex-1">
        {CAPABILITIES.map((c) => (
          <div key={c.title} className="flex items-start gap-3 p-3 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
            <div className="text-xl shrink-0 mt-0.5">{c.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-sm font-semibold text-white">{c.title}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${c.tagColor}`}>{c.tag}</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{c.desc}</p>
            </div>
            <div className="shrink-0 mt-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-gray-800">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { value: "Art. 21", label: "NIS2 focus" },
            { value: "< 5min",  label: "Tempo médio" },
            { value: "100%",    label: "Agentless" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-white font-bold text-base">{s.value}</p>
              <p className="text-gray-500 text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------

export default function ScanStart() {
  const [tab, setTab] = useState<Tab>("único");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero header */}
      <div className="bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">🔍</div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">Scanner NIS2</h1>
              <p className="text-blue-300 text-xs font-medium">Agentless · Sem instalação · Resultado em minutos</p>
            </div>
          </div>
          <p className="text-gray-400 text-sm max-w-xl">
            Analisa a superfície de ataque e conformidade NIS2 do teu domínio ou IP. Mapeamento automático ao Art. 21.º da Directiva NIS2.
          </p>
        </div>
      </div>

      {/* Main content — two columns */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* Left — form panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <TabBar active={tab} setTab={setTab} />
              {tab === "único"       && <SingleScanTab />}
              {tab === "lote"        && <BulkScanTab />}
              {tab === "subdomínios" && <SubdomainScanTab />}
            </div>

            {/* Info note */}
            <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
              <span className="text-blue-500 text-base shrink-0 mt-0.5">ℹ️</span>
              <div>
                <p className="text-xs font-semibold text-blue-800 mb-0.5">Verificação de ownership</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  Antes de iniciar o scan, verificamos que és o proprietário do target via DNS TXT record ou ficheiro HTTP. Isto protege terceiros de scans não autorizados.
                </p>
              </div>
            </div>
          </div>

          {/* Right — capabilities panel */}
          <div className="lg:col-span-3">
            <CapabilitiesPanel />
          </div>

        </div>
      </div>
    </div>
  );
}
