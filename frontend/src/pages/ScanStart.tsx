import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

// ---------------------------------------------------------------------------
// Tab selector
// ---------------------------------------------------------------------------

type Tab = "único" | "lote" | "subdomínios";

function TabBar({ active, setTab }: { active: Tab; setTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "único",       label: "Scan único",       icon: "🔍" },
    { id: "lote",        label: "Scan em lote",      icon: "📋" },
    { id: "subdomínios", label: "Subdomínios",       icon: "🌐" },
  ];
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-8">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
            active === t.id
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="mr-1">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ownership instructions box (shared between tabs)
// ---------------------------------------------------------------------------

function OwnershipBox({
  token, isIp, domain, wellKnownUrl,
}: {
  token: string; isIp: boolean; domain: string; wellKnownUrl?: string | null;
}) {
  return (
    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-md space-y-2">
      <p className="text-sm font-medium text-amber-800">Ownership não verificado</p>
      {isIp ? (
        <>
          <p className="text-xs text-amber-700">Cria o ficheiro abaixo no servidor e tenta novamente:</p>
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-medium">URL do ficheiro:</p>
            <code className="block text-xs bg-white border border-gray-200 rounded p-2 font-mono break-all">
              {wellKnownUrl}
            </code>
            <p className="text-xs text-gray-500 font-medium mt-2">Conteúdo do ficheiro:</p>
            <code className="block text-xs bg-white border border-gray-200 rounded p-2 font-mono break-all">
              {token}
            </code>
          </div>
          <p className="text-xs text-amber-600">O ficheiro deve ser acessível via HTTP e conter apenas o token acima.</p>
        </>
      ) : (
        <>
          <p className="text-xs text-amber-700">Adiciona este DNS TXT record ao domínio e tenta novamente:</p>
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-medium">Nome:</p>
            <code className="block text-xs bg-white border border-gray-200 rounded p-2 font-mono">
              @ (ou {domain})
            </code>
            <p className="text-xs text-gray-500 font-medium mt-2">Valor:</p>
            <code className="block text-xs bg-white border border-gray-200 rounded p-2 font-mono break-all">
              {token}
            </code>
          </div>
          <p className="text-xs text-amber-600">A propagação DNS pode demorar até 5 minutos.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 1 — Scan único (existing flow, unchanged)
// ---------------------------------------------------------------------------

function SingleScanTab() {
  const navigate = useNavigate();
  const [domain,      setDomain]      = useState("");
  const [verifying,   setVerifying]   = useState(false);
  const [verified,    setVerified]    = useState(false);
  const [token,       setToken]       = useState("");
  const [isIp,        setIsIp]        = useState(false);
  const [wellKnownUrl, setWellKnownUrl] = useState<string | null>(null);
  const [error,       setError]       = useState("");

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
    <>
      <div className="mb-1">
        <label htmlFor="domain-single" className="block text-sm font-medium text-gray-700 mb-1">
          Domínio ou IP
        </label>
        <input
          id="domain-single"
          type="text"
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setVerified(false); setToken(""); setError(""); }}
          placeholder="exemplo.pt ou 185.1.2.3"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {domain && (
        <p className="text-xs text-gray-400 mb-4 mt-1">
          {isIpInput
            ? "Verificação via ficheiro HTTP — precisas de acesso ao servidor."
            : "Verificação via DNS TXT record — precisas de acesso às DNS do domínio."}
        </p>
      )}
      {!domain && <div className="mb-4" />}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
      )}
      {!verified ? (
        <>
          <button
            onClick={handleVerify}
            disabled={!domain || verifying}
            className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifying ? "A verificar…" : "Verificar ownership"}
          </button>
          {token && !verified && (
            <OwnershipBox token={token} isIp={isIp} domain={domain} wellKnownUrl={wellKnownUrl} />
          )}
        </>
      ) : (
        <>
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-sm text-green-800">
            <span>✓</span>
            <span><strong>Ownership verificado</strong> via {isIp ? "ficheiro HTTP" : "DNS TXT"}.</span>
          </div>
          <button
            onClick={handleStart}
            disabled={startMutation.isPending}
            className="w-full py-2.5 px-4 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {startMutation.isPending ? (
              <><Spinner />A iniciar scan…</>
            ) : "Iniciar Scan NIS2 →"}
          </button>
        </>
      )}
    </>
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
  const maxTargets = plan === "mssp" ? 50 : plan === "pro" ? 10 : 0;

  const startBulkMut = trpc.scan.startBulk.useMutation({
    onSuccess: (data) => {
      if (data.failed.length > 0) {
        setWarning(
          `${data.started.length} de ${data.started.length + data.failed.length} targets iniciados. ` +
          `${data.failed.length} sem ownership verificado foram ignorados.`
        );
      }
      navigate(`/scan/bulk/${data.batchId}`);
    },
    onError: (err) => setError(err.message),
  });

  const targets = text
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  const handleStart = () => {
    setError(""); setWarning("");
    startBulkMut.mutate({ targets, mode: "sme" });
  };

  if (plan === "free") {
    return (
      <div className="text-center py-8">
        <p className="text-2xl mb-3">📋</p>
        <p className="font-semibold text-gray-800 mb-2">Scan em lote — Plano Pro</p>
        <p className="text-sm text-gray-500 mb-6">
          Scana múltiplos domínios ou IPs em paralelo. Disponível a partir do plano Pro.
        </p>
        <Link
          to="/billing"
          className="px-6 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800"
        >
          Ver planos →
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-gray-500 mb-3">
        Um target por linha (domínios ou IPs públicos). Máximo {maxTargets} por batch.
        Cada target deve ter o DNS TXT <code className="bg-gray-100 px-1 rounded">nis2pt-verify=...</code> configurado.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"empresa1.pt\nempresa2.pt\nsubdominio.empresa3.com\n185.1.2.3"}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      {targets.length > 0 && (
        <div className="flex items-center justify-between mt-2 mb-4">
          <p className="text-xs text-gray-400">
            {targets.length} target{targets.length !== 1 ? "s" : ""} detectado{targets.length !== 1 ? "s" : ""}
          </p>
          {targets.length > maxTargets && (
            <p className="text-xs text-red-600 font-medium">
              Máximo {maxTargets} para o teu plano — os excedentes serão ignorados.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
      )}
      {warning && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">{warning}</div>
      )}

      <button
        onClick={handleStart}
        disabled={targets.length === 0 || startBulkMut.isPending}
        className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {startBulkMut.isPending ? (
          <><Spinner />A preparar batch…</>
        ) : (
          `Iniciar ${Math.min(targets.length, maxTargets)} scan${Math.min(targets.length, maxTargets) !== 1 ? "s" : ""} em lote →`
        )}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// TAB 3 — Descoberta de subdomínios
// ---------------------------------------------------------------------------

interface DiscoveredSub {
  name: string;
  ip?: string;
}

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
    onSuccess: (data) => {
      setDiscovered(data.subdomains);
      setSelected(new Set(data.subdomains.map((s) => s.name)));
    },
    onError: (err) => setError(err.message),
  });
  const startBulkMut = trpc.scan.startBulk.useMutation({
    onSuccess: (data) => navigate(`/scan/bulk/${data.batchId}`),
    onError:   (err)  => setError(err.message),
  });

  if (plan === "free") {
    return (
      <div className="text-center py-8">
        <p className="text-2xl mb-3">🌐</p>
        <p className="font-semibold text-gray-800 mb-2">Descoberta de subdomínios — Plano Pro</p>
        <p className="text-sm text-gray-500 mb-6">
          Descobre automaticamente subdomínios via Certificate Transparency e DNS, e scana todos de uma vez.
        </p>
        <Link to="/billing" className="px-6 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800">
          Ver planos →
        </Link>
      </div>
    );
  }

  const maxSubs = plan === "mssp" ? 100 : 20;

  const handleVerify = async () => {
    setError(""); setVerified(false); setDiscovered([]); setSelected(new Set());
    try {
      const r = await verifyMut.mutateAsync({ domain });
      setToken(r.token);
      setVerified(r.verified);
      if (!r.verified) setError("");
    } catch (err: any) { setError(err.message ?? "Erro ao verificar"); }
  };

  const handleDiscover = () => {
    setError(""); setDiscovered([]); setSelected(new Set());
    discoverMut.mutate({ domain });
  };

  const handleStart = () => {
    setError("");
    const targets = [...selected];
    if (!targets.length) return;
    startBulkMut.mutate({ targets, mode: "sme", rootDomain: domain });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(discovered.map((d) => d.name)) : new Set());
  };

  return (
    <>
      {/* Step 1 — domain input + verify */}
      <div className="mb-1">
        <label htmlFor="domain-sub" className="block text-sm font-medium text-gray-700 mb-1">
          Domínio raiz
        </label>
        <div className="flex gap-2">
          <input
            id="domain-sub"
            type="text"
            value={domain}
            onChange={(e) => { setDomain(e.target.value); setVerified(false); setDiscovered([]); setError(""); }}
            placeholder="empresa.pt"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleVerify}
            disabled={!domain || verifyMut.isPending}
            className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50 shrink-0"
          >
            {verifyMut.isPending ? "…" : "Verificar"}
          </button>
        </div>
      </div>

      {/* Ownership state */}
      {token && !verified && (
        <OwnershipBox token={token} isIp={false} domain={domain} />
      )}
      {verified && (
        <div className="mt-3 p-2.5 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-sm text-green-800">
          <span>✓</span>
          <span><strong>{domain}</strong> verificado</span>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
      )}

      {/* Step 2 — discover button */}
      {verified && discovered.length === 0 && !discoverMut.isPending && (
        <button
          onClick={handleDiscover}
          className="mt-4 w-full py-2.5 px-4 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 flex items-center justify-center gap-2"
        >
          🌐 Descobrir subdomínios (até {maxSubs})
        </button>
      )}

      {discoverMut.isPending && (
        <div className="mt-4 text-center py-6">
          <div className="h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-3">A consultar CT logs e a resolver DNS…</p>
          <p className="text-xs text-gray-400 mt-1">Pode demorar 10–30 segundos</p>
        </div>
      )}

      {/* Step 3 — discovered list */}
      {discovered.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              {discovered.length} subdomínio{discovered.length !== 1 ? "s" : ""} descoberto{discovered.length !== 1 ? "s" : ""}
            </p>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === discovered.length}
                onChange={(e) => toggleAll(e.target.checked)}
                className="rounded"
              />
              Seleccionar todos
            </label>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            {discovered.map((sub) => (
              <label
                key={sub.name}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
              >
                <input
                  type="checkbox"
                  checked={selected.has(sub.name)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    e.target.checked ? next.add(sub.name) : next.delete(sub.name);
                    setSelected(next);
                  }}
                  className="rounded shrink-0"
                />
                <span className="text-sm font-mono text-gray-800 flex-1 truncate">{sub.name}</span>
                {sub.ip && <span className="text-xs text-gray-400 shrink-0">{sub.ip}</span>}
              </label>
            ))}
          </div>

          <button
            onClick={handleStart}
            disabled={selected.size === 0 || startBulkMut.isPending}
            className="mt-4 w-full py-2.5 px-4 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {startBulkMut.isPending ? (
              <><Spinner />A iniciar scans…</>
            ) : (
              `Iniciar scan para ${selected.size} subdomínio${selected.size !== 1 ? "s" : ""} →`
            )}
          </button>
        </div>
      )}

      {discoverMut.isSuccess && discovered.length === 0 && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-500 text-center">
          Nenhum subdomínio activo encontrado para <strong>{domain}</strong>.
        </div>
      )}
    </>
  );
}

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
// Root page
// ---------------------------------------------------------------------------

export default function ScanStart() {
  const [tab, setTab] = useState<Tab>("único");

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Iniciar Scan NIS2</h1>
      <p className="text-gray-500 text-sm mb-6">
        Analisa a superfície de ataque e conformidade NIS2 do teu target.
      </p>
      <TabBar active={tab} setTab={setTab} />
      {tab === "único"       && <SingleScanTab />}
      {tab === "lote"        && <BulkScanTab />}
      {tab === "subdomínios" && <SubdomainScanTab />}
    </div>
  );
}
