import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/auth";
import { ExplainerPanel } from "../components/ExplainerPanel";
import { ENABLE_PRICING } from "../lib/featureFlags";
import { Card } from "../components/ui/Card";

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
// Copy-to-clipboard — primeiro uso desta funcionalidade no projeto.
// navigator.clipboard exige contexto seguro (https/localhost); fora disso,
// ou se a API falhar, cai para um <textarea> temporário + execCommand("copy").
// ---------------------------------------------------------------------------

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("Clipboard API indisponível neste contexto");
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    setStatus(ok ? "copied" : "failed");
    setTimeout(() => setStatus("idle"), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`shrink-0 px-3 py-2.5 text-xs font-semibold rounded-lg border transition-colors ${
        status === "copied"
          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
          : status === "failed"
          ? "bg-amber-50 border-amber-300 text-amber-700"
          : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
      }`}
    >
      {status === "copied" ? "✓ Copiado!" : status === "failed" ? "Selecione e copie" : "Copiar"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bloco permanente do código de verificação — visível assim que se entra no
// scanner, antes de escrever qualquer domínio (o orgId já está disponível
// via useAuth, que só renderiza depois de RequireAuth confirmar a sessão).
// ---------------------------------------------------------------------------

function VerificationCodeCard() {
  const { user } = useAuth();
  const orgId = user?.org?.id;
  if (!orgId) return null;

  const token = `nis2pt-verify=${orgId}`;

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/50 p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1.5">O seu código de verificação de domínio</p>
        <p className="text-xs text-gray-400 mb-3">
          Vai precisar deste valor para confirmar que é dono do domínio antes de o analisar. Copie-o já — vai levá-lo ao painel de DNS do seu domínio.
        </p>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 block text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 font-mono break-all text-blue-700">
            {token}
          </code>
          <CopyButton value={token} />
        </div>
      </div>
      <ExplainerPanel resourceKey="ownership-help" title="Como confirmo que este domínio é meu?">
        <p>Antes de analisar um site, precisamos de confirmar que ele lhe pertence. É uma medida de segurança: impede que alguém use a CISPLAN para analisar sites de terceiros sem autorização. Faz-se uma vez por domínio, e demora poucos minutos.</p>
        <p>Vai adicionar uma pequena "etiqueta de confirmação" ao registo do seu domínio — como carimbar um documento para provar que é seu. Essa etiqueta é um registo TXT, e o valor a colocar é o seu código de verificação (mostrado acima, com o botão Copiar).</p>
        <p><strong className="text-white">Passo 1.</strong> Entre no painel onde gere o seu domínio. É o site onde comprou o domínio (onde paga a renovação anual). Se não sabe qual é, procure nos seus emails por "renovação de domínio".</p>
        <p><strong className="text-white">Passo 2.</strong> Procure a secção de "DNS" ou "Registos DNS". Pode chamar-se "Gestão de DNS", "Zona DNS" ou "Advanced DNS".</p>
        <p><strong className="text-white">Passo 3.</strong> Adicione um novo registo do tipo "TXT". No campo Nome (ou "Host"): deixe em branco ou coloque @. No campo Valor (ou "Content"): cole o seu código de verificação. Guarde.</p>
        <p><strong className="text-white">Passo 4.</strong> Volte aqui e clique em Verificar. As alterações de DNS podem demorar alguns minutos a ficar ativas. Se não funcionar logo, aguarde um pouco e tente de novo.</p>
        <p>Não consegue fazer isto? É normal — nem toda a gente gere o seu próprio domínio. Peça a quem trata do seu site (o seu informático ou a agência que o criou): envie-lhe o seu código de verificação e peça para adicionar um registo DNS TXT com esse valor. Ou fale connosco — podemos ajudá-lo.</p>
      </ExplainerPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature flags — colocar true para reactivar quando o tab estiver pronto
// ---------------------------------------------------------------------------

const ENABLE_BATCH_SCAN     = true;   // DEMO: limite de 3 alvos — ver DEMO_MAX_TARGETS em scan.router.ts
const ENABLE_SUBDOMAIN_SCAN = true;   // feat/subdomain-scan — testado em backend/integrations/subdomain-discovery.test.ts

// ---------------------------------------------------------------------------
// Tab selector — oculta tabs desactivados; omite o bar quando só há um tab
// ---------------------------------------------------------------------------

type Tab = "único" | "lote" | "subdomínios";

const ALL_TABS: { id: Tab; label: string; icon: string; enabled: boolean }[] = [
  { id: "único",       label: "Scan único",   icon: "🔍", enabled: true               },
  { id: "lote",        label: "Scan em lote", icon: "📋", enabled: ENABLE_BATCH_SCAN  },
  { id: "subdomínios", label: "Subdomínios",  icon: "🌐", enabled: ENABLE_SUBDOMAIN_SCAN },
];

const VISIBLE_TABS = ALL_TABS.filter((t) => t.enabled);

function TabBar({ active, setTab }: { active: Tab; setTab: (t: Tab) => void }) {
  // Com apenas um tab visível não há escolha — não renderizar a barra
  if (VISIBLE_TABS.length <= 1) return null;

  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
      {VISIBLE_TABS.map((t) => (
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
  const nomeLabel = isIp ? "URL do ficheiro" : "Nome do registo";
  const nomeValor = isIp ? (wellKnownUrl ?? "") : `@  (ou ${domain})`;
  const propagacao = isIp
    ? "O ficheiro deve ficar acessível via HTTP."
    : "A propagação de DNS pode demorar até 5 minutos.";

  return (
    <Card className="mt-4 p-4 space-y-4">
      {/* estado */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border text-warn border-warn/40 bg-warn/10">
          Propriedade não verificada
        </span>
      </div>

      <p className="text-sm text-dim">
        {isIp
          ? "Crie o ficheiro abaixo no servidor e verifique de novo."
          : "Adicione este registo DNS ao seu domínio e verifique de novo."}
      </p>

      {/* registo: Nome/URL (contexto) */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-1">{nomeLabel}</p>
        <code className="block text-xs bg-field border border-line rounded-lg p-2.5 font-mono break-all text-text">
          {nomeValor}
        </code>
      </div>

      {/* VALOR — o herói: monospace, destacado, copiável */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-accent font-mono mb-1">Valor a colar</p>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 block text-sm bg-field border border-accent/40 rounded-lg p-2.5 font-mono break-all text-text">
            {token}
          </code>
          <CopyButton value={token} />
        </div>
      </div>

      <p className="text-xs text-faint">{propagacao}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TAB 1 — Scan único
// ---------------------------------------------------------------------------

function SingleScanTab() {
  const navigate = useNavigate();
  const [domain,           setDomain]           = useState("");
  const [normalizedDomain, setNormalizedDomain] = useState("");
  const [verifying,        setVerifying]        = useState(false);
  const [verified,         setVerified]         = useState(false);
  const [token,            setToken]            = useState("");
  const [isIp,             setIsIp]             = useState(false);
  const [wellKnownUrl,     setWellKnownUrl]     = useState<string | null>(null);
  const [error,            setError]            = useState("");

  const isIpInput = IPV4_RE.test(domain.trim());
  const verifyMutation = trpc.scan.verifyOwnership.useMutation();
  const startMutation  = trpc.scan.start.useMutation();

  const handleVerify = async () => {
    setVerifying(true); setError("");
    try {
      const r = await verifyMutation.mutateAsync({ domain });
      setVerified(r.verified); setToken(r.token);
      setIsIp(r.isIp); setWellKnownUrl(r.wellKnownUrl ?? null);
      // Use normalized domain from backend (strips https://, path, port, etc.)
      setNormalizedDomain(r.dnsName ?? domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]);
    } catch (err: any) {
      setError(err.message ?? "Erro ao verificar a propriedade");
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
          onChange={(e) => { setDomain(e.target.value); setVerified(false); setToken(""); setNormalizedDomain(""); setError(""); }}
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
            {verifying ? <><Spinner />A verificar…</> : "Verificar propriedade →"}
          </button>
          {token && !verified && (
            <OwnershipBox token={token} isIp={isIp} domain={normalizedDomain || domain} wellKnownUrl={wellKnownUrl} />
          )}
        </>
      ) : (
        <>
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2.5 text-sm text-green-800">
            <span className="text-green-600 text-base">✓</span>
            <span><strong>Propriedade verificada</strong> via {isIp ? "ficheiro HTTP" : "DNS TXT"}.</span>
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

  // DEMO: limite global temporário, alinhado com DEMO_MAX_TARGETS em
  // scan.router.ts. Pós-MVP, volta a refletir o limite por plano (Pro=15,
  // MSSP=50) — não esquecer de reverter os dois lados juntos.
  const DEMO_MAX_TARGETS = 3;

  const { data: sub } = trpc.billing.getSubscription.useQuery();
  const plan = sub?.plan ?? "free";
  const maxTargets = plan === "free" ? 0 : DEMO_MAX_TARGETS;

  const startBulkMut = trpc.scan.startBulk.useMutation({
    onSuccess: (data) => {
      if (data.failed.length > 0) {
        setWarning(`${data.started.length} de ${data.started.length + data.failed.length} targets iniciados. ${data.failed.length} sem propriedade verificada foram ignorados.`);
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
          Scana múltiplos domínios de uma vez. Até {DEMO_MAX_TARGETS} alvos por batch nesta fase.
        </p>
        {ENABLE_PRICING && (
          <Link to="/billing" className="inline-block px-6 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm">
            Ver planos →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Os scans em lote podem demorar um pouco mais, devido a limites de APIs externas de análise.
      </p>
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
              <p className="text-xs text-red-600 font-medium">Máximo {maxTargets} alvos nesta fase (demo)</p>
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

interface DiscoveredSub { name: string; ip?: string; isInternal?: boolean; }

function SubdomainScanTab() {
  const navigate = useNavigate();
  const [domain,           setDomain]           = useState("");
  const [normalizedDomain, setNormalizedDomain] = useState("");
  const [verified,         setVerified]         = useState(false);
  const [token,            setToken]            = useState("");
  const [discovered,       setDiscovered]       = useState<DiscoveredSub[]>([]);
  const [selected,         setSelected]         = useState<Set<string>>(new Set());
  const [error,            setError]            = useState("");

  const { data: sub } = trpc.billing.getSubscription.useQuery();
  const plan = sub?.plan ?? "free";

  const verifyMut    = trpc.scan.verifyOwnership.useMutation();
  const discoverMut  = trpc.scan.discoverSubdomains.useMutation({
    onSuccess: (data) => {
      setDiscovered(data.subdomains);
      // Só os públicos são selecionáveis para scan — os internos não são alcançáveis.
      setSelected(new Set(data.subdomains.filter((s) => !s.isInternal).map((s) => s.name)));
    },
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
        {ENABLE_PRICING && (
          <Link to="/billing" className="inline-block px-6 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm">
            Ver planos →
          </Link>
        )}
      </div>
    );
  }

  const maxSubs = plan === "mssp" ? 200 : 50;
  const publicSubs   = discovered.filter((s) => !s.isInternal);
  const internalSubs = discovered.filter((s) => s.isInternal);

  const handleVerify = async () => {
    setError(""); setVerified(false); setDiscovered([]); setSelected(new Set());
    try {
      const r = await verifyMut.mutateAsync({ domain });
      setToken(r.token);
      setVerified(r.verified);
      setNormalizedDomain(r.dnsName ?? domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]);
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

      {token && !verified && <OwnershipBox token={token} isIp={false} domain={normalizedDomain || domain} />}
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

      {publicSubs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">{publicSubs.length} subdomínio{publicSubs.length !== 1 ? "s" : ""} acessível{publicSubs.length !== 1 ? "eis" : ""}</p>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={selected.size === publicSubs.length} onChange={(e) => setSelected(e.target.checked ? new Set(publicSubs.map((d) => d.name)) : new Set())} className="rounded" />
              Todos
            </label>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
            {publicSubs.map((s) => (
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

      {internalSubs.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            {internalSubs.length} subdomínio{internalSubs.length !== 1 ? "s" : ""} interno{internalSubs.length !== 1 ? "s" : ""} detetado{internalSubs.length !== 1 ? "s" : ""}
          </p>
          <div className="border border-amber-200 bg-amber-50 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
            {internalSubs.map((s) => (
              <div key={s.name} className="px-4 py-2.5 border-b border-amber-100 last:border-0 text-sm font-mono text-gray-700">
                {s.name}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            Estes subdomínios apontam para a rede interna da organização e não são acessíveis a
            partir da internet, pelo que não podem ser analisados por este scan externo. A sua
            verificação de segurança requer uma análise interna dedicada.{" "}
            <a href="mailto:hello@cisplan.pt?subject=Auditoria%20interna%20de%20rede" className="text-blue-600 hover:underline">
              Fale connosco sobre uma auditoria interna →
            </a>
          </p>
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
    tagColor: "bg-red-900/50 text-red-300 border border-red-800/40",
  },
  {
    icon: "🐛",
    title: "Vulnerabilidades (CVE)",
    desc: "CVEs públicos associados a versões de software detectadas",
    tag: "NVD + Shodan",
    tagColor: "bg-orange-900/50 text-orange-300 border border-orange-800/40",
  },
  {
    icon: "🔒",
    title: "TLS & Certificados",
    desc: "Expiração, algoritmos fracos, self-signed, protocolos obsoletos (SSLv3, TLS 1.0)",
    tag: "Censys",
    tagColor: "bg-blue-900/50 text-blue-300 border border-blue-800/40",
  },
  {
    icon: "📧",
    title: "Segurança de Email",
    desc: "SPF, DKIM (10 selectores), DMARC — conformidade Art. 21(2)(j)",
    tag: "DNS",
    tagColor: "bg-purple-900/50 text-purple-300 border border-purple-800/40",
  },
  {
    icon: "🛡️",
    title: "Headers de Segurança HTTP",
    desc: "HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy",
    tag: "HTTP",
    tagColor: "bg-indigo-900/50 text-indigo-300 border border-indigo-800/40",
  },
  {
    icon: "🌑",
    title: "Dark Web & Reputação",
    desc: "Breaches de credenciais (HIBP), blacklists DNS (Spamhaus, SpamCop)",
    tag: "HIBP + DNS",
    tagColor: "bg-slate-700/60 text-slate-300 border border-slate-600/40",
  },
];

function CapabilitiesPanel() {
  return (
    <div className="bg-slate-900 rounded-2xl p-6 border border-slate-700/60 h-full flex flex-col">
      <div className="mb-5">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-1.5">O que o scanner analisa</p>
        <h3 className="text-white text-xl font-bold mb-1">6 camadas de análise NIS2</h3>
        <p className="text-slate-400 text-sm">Mapeadas ao Art. 21 da Directiva NIS2 (EU 2022/2555)</p>
      </div>

      <div className="space-y-2.5 flex-1">
        {CAPABILITIES.map((c) => (
          <div
            key={c.title}
            className="flex items-start gap-3.5 p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-800 transition-all"
          >
            <div className="text-xl shrink-0 mt-0.5">{c.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-sm font-semibold text-white">{c.title}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${c.tagColor}`}>{c.tag}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{c.desc}</p>
            </div>
            <div className="shrink-0 mt-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-700/50">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { value: "Art. 21", label: "NIS2 focus" },
            { value: "< 5min",  label: "Tempo médio" },
            { value: "100%",    label: "Agentless" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/50 rounded-lg py-2.5 px-2">
              <p className="text-white font-bold text-sm">{s.value}</p>
              <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
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
  const [tab, setTab] = useState<Tab>(VISIBLE_TABS[0]?.id ?? "único");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #0f172a 0%, #0c1a3a 50%, #0f172a 100%)" }}>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden">
        {/* Decorative glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 pt-14 pb-10 text-center">
          {/* Status badge */}
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Sistema online · Análise em tempo real
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-5 leading-tight tracking-tight">
            Scanner de Conformidade{" "}
            <span className="text-blue-400">NIS2</span>
          </h1>

          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            Analise a superfície de ataque do seu domínio ou IP em 6 camadas —{" "}
            <span className="text-slate-300">sem instalar software</span>. Mapeamento automático ao Art.&nbsp;21.º da Directiva NIS2 (EU&nbsp;2022/2555).
          </p>

          {/* Stats row */}
          <div className="flex justify-center gap-8 sm:gap-16">
            {[
              { value: "6",       label: "Camadas de análise" },
              { value: "< 5min",  label: "Tempo médio" },
              { value: "Art. 21", label: "NIS2 EU 2022/2555" },
              { value: "100%",    label: "Agentless" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-slate-500 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Divider glow */}
        <div className="h-px bg-gradient-to-r from-transparent via-blue-700/30 to-transparent" />
      </div>

      {/* ── Main content — two columns ── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 pb-14">
        <ExplainerPanel resourceKey="scanner">
          <p><strong className="text-white">O que é.</strong> Uma análise da presença digital da sua empresa — o seu site, os seus domínios e subdomínios — feita a partir da internet, sem instalar nada e sem aceder à sua rede interna. Vê o que qualquer pessoa (ou atacante) consegue ver da sua empresa de fora.</p>
          <p><strong className="text-white">Porque existe.</strong> Muitas vulnerabilidades estão à vista de quem sabe procurar: um certificado de segurança expirado, um serviço desatualizado, a falta de proteção contra falsificação de email. O scanner encontra estes problemas antes que um atacante o faça.</p>
          <p><strong className="text-white">Quando fazer.</strong> Depois do questionário, para que o seu score combine as duas fontes (o que declarou no questionário e o que a análise técnica encontrou).</p>
          <p><strong className="text-white">O que NÃO faz.</strong> O scanner é externo — analisa o que está exposto na internet. Não vê o interior da sua rede (os computadores internos, servidores privados). Para isso seria necessária uma análise interna dedicada.</p>
        </ExplainerPanel>
        <ExplainerPanel resourceKey="scanner-como-usar" title="Como usar o scanner (passo importante antes de começar)">
          <p>Antes de analisar um domínio, precisa de confirmar que ele lhe pertence. É uma medida de segurança: impede que alguém use a CISPLAN para analisar sites de terceiros sem autorização.</p>
          <p><strong className="text-white">Como confirmar (uma vez por domínio):</strong></p>
          <p><strong className="text-white">1.</strong> Precisa de adicionar uma "etiqueta de confirmação" ao registo do seu domínio — um registo DNS TXT. O valor a colocar é: nis2pt-verify= seguido do número da sua conta (por exemplo, nis2pt-verify=1).</p>
          <p><strong className="text-white">2.</strong> Entre no painel onde gere o seu domínio (o site onde o comprou / paga a renovação). Procure a secção "DNS" ou "Registos DNS".</p>
          <p><strong className="text-white">3.</strong> Adicione um novo registo do tipo TXT. No campo Nome/Host, deixe em branco ou coloque @. No campo Valor/Content, cole o seu código de verificação. Guarde.</p>
          <p><strong className="text-white">4.</strong> Volte ao scanner, escreva o domínio e clique em Verificar. As alterações de DNS podem demorar alguns minutos a ficar ativas.</p>
          <p>Não consegue fazer isto? É normal — nem toda a gente gere o seu próprio domínio. Peça a quem trata do seu site para adicionar um registo DNS TXT com o seu código de verificação, ou fale connosco.</p>
        </ExplainerPanel>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* Left — form panel */}
          <div className="lg:col-span-2 space-y-4">
            {/* VerificationCodeCard desativado temporariamente — não estava a renderizar em
                produção (causa de deploy/build por confirmar). Instruções de ownership movidas
                para o ExplainerPanel "scanner-como-usar" acima, que já é o mecanismo provado
                em produção. Reativar aqui quando a causa raiz estiver resolvida. */}
            {/* <VerificationCodeCard /> */}

            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/50 p-6">
              <TabBar active={tab} setTab={setTab} />
              {tab === "único"       && <SingleScanTab />}
              {tab === "lote"        && <BulkScanTab />}
              {tab === "subdomínios" && <SubdomainScanTab />}
            </div>

            {/* Info note — dark themed */}
            <div className="p-4 bg-blue-950/60 border border-blue-700/30 rounded-xl flex items-start gap-3">
              <span className="text-blue-400 text-sm shrink-0 mt-0.5 font-bold">ℹ</span>
              <div>
                <p className="text-xs font-semibold text-blue-300 mb-0.5">Verificação de propriedade</p>
                <p className="text-xs text-blue-400/80 leading-relaxed">
                  Antes de iniciar o scan, verificamos que é o proprietário do target via DNS TXT record ou ficheiro HTTP. Isto protege terceiros de scans não autorizados.
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
