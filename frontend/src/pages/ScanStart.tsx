import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export default function ScanStart() {
  const navigate = useNavigate();
  const [domain, setDomain]       = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified]   = useState(false);
  const [token, setToken]         = useState("");
  const [isIp, setIsIp]           = useState(false);
  const [wellKnownUrl, setWellKnownUrl] = useState<string | null>(null);
  const [error, setError]         = useState("");

  const isIpInput = IPV4_RE.test(domain.trim());

  const verifyMutation = trpc.scan.verifyOwnership.useMutation();
  const startMutation  = trpc.scan.start.useMutation();

  const handleVerify = async () => {
    setVerifying(true);
    setError("");
    try {
      const result = await verifyMutation.mutateAsync({ domain });
      setVerified(result.verified);
      setToken(result.token);
      setIsIp(result.isIp);
      setWellKnownUrl(result.wellKnownUrl ?? null);
    } catch (err: any) {
      setError(err.message ?? "Erro ao verificar ownership");
    } finally {
      setVerifying(false);
    }
  };

  const handleStart = async () => {
    setError("");
    try {
      const result = await startMutation.mutateAsync({ target: domain, mode: "sme" });
      navigate(`/scan/results/${result.scanId}`);
    } catch (err: any) {
      setError(err.message ?? "Erro ao iniciar scan");
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Iniciar Scan NIS2</h1>
      <p className="text-gray-500 text-sm mb-8">
        Verifica a conformidade NIS2 do teu domínio ou endereço IP público.
      </p>

      {/* Target input */}
      <div className="mb-1">
        <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
          Domínio ou IP
        </label>
        <input
          id="domain"
          type="text"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setVerified(false);
            setToken("");
            setError("");
          }}
          placeholder="exemplo.pt ou 185.1.2.3"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Hint below input */}
      {domain && (
        <p className="text-xs text-gray-400 mb-4 mt-1">
          {isIpInput
            ? "Verificação via ficheiro HTTP — precisas de acesso ao servidor."
            : "Verificação via DNS TXT record — precisas de acesso às DNS do domínio."}
        </p>
      )}
      {!domain && <div className="mb-4" />}

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {!verified ? (
        <>
          <button
            onClick={handleVerify}
            disabled={!domain || verifying}
            className="w-full py-2.5 px-4 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {verifying ? "A verificar…" : "Verificar ownership"}
          </button>

          {token && !verified && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-md space-y-2">
              <p className="text-sm font-medium text-amber-800">Ownership não verificado</p>

              {isIp ? (
                <>
                  <p className="text-xs text-amber-700">
                    Cria o ficheiro abaixo no servidor e tenta novamente:
                  </p>
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
                  <p className="text-xs text-amber-600">
                    O ficheiro deve ser acessível via HTTP (não HTTPS) e conter apenas o token acima.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-amber-700">
                    Adiciona este DNS TXT record ao domínio e tenta novamente:
                  </p>
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
                  <p className="text-xs text-amber-600">
                    A propagação DNS pode demorar até 5 minutos.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-sm text-green-800">
            <span>✓</span>
            <span>
              <strong>Ownership verificado</strong> via {isIp ? "ficheiro HTTP" : "DNS TXT"}.
              Podes iniciar o scan.
            </span>
          </div>

          <button
            onClick={handleStart}
            disabled={startMutation.isPending}
            className="w-full py-2.5 px-4 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {startMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                A iniciar scan…
              </>
            ) : (
              "Iniciar Scan NIS2 →"
            )}
          </button>
        </>
      )}
    </div>
  );
}
