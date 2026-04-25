import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

export default function ScanStart() {
  const navigate = useNavigate();
  const [domain, setDomain]     = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified]   = useState(false);
  const [token, setToken]         = useState("");
  const [error, setError]         = useState("");

  const verifyMutation = trpc.scan.verifyOwnership.useMutation();
  const startMutation  = trpc.scan.start.useMutation();

  const handleVerify = async () => {
    setVerifying(true);
    setError("");
    try {
      const result = await verifyMutation.mutateAsync({ domain });
      setVerified(result.verified);
      setToken(result.token);
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
        Verifica a conformidade NIS2 do teu domínio ou endereço IP.
      </p>

      {/* Domain input */}
      <div className="mb-4">
        <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
          Domínio ou IP
        </label>
        <input
          id="domain"
          type="text"
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setVerified(false); setToken(""); }}
          placeholder="exemplo.pt ou 1.2.3.4"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

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

          {token && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm font-medium text-amber-800 mb-1">Ownership não verificado</p>
              <p className="text-xs text-amber-700 mb-2">
                Adiciona este DNS TXT record ao domínio e tenta novamente:
              </p>
              <code className="block text-xs bg-white border border-gray-200 rounded p-2 font-mono break-all">
                {token}
              </code>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-sm text-green-800">
            <span>✓</span>
            <span><strong>Ownership verificado!</strong> Podes iniciar o scan.</span>
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
