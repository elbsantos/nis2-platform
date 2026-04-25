/**
 * client/src/pages/ScanStart.tsx
 *
 * Simple UI to start a NIS2 scan.
 * Week 3 — functional but not polished.
 */

import { useState } from "react";
import { trpc } from "../lib/trpc";

export default function ScanStart() {
  const [domain, setDomain] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [token, setToken] = useState("");

  const verifyMutation = trpc.scan.verifyOwnership.useMutation();
  const startMutation = trpc.scan.start.useMutation();

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await verifyMutation.mutateAsync({ domain });
      setVerified(result.verified);
      setToken(result.token);
    } catch (err) {
      console.error("Verification error:", err);
    } finally {
      setVerifying(false);
    }
  };

  const handleStart = async () => {
    try {
      const result = await startMutation.mutateAsync({ target: domain, mode: "sme" });
      alert(`Scan iniciado! ID: ${result.scanId}`);
      // Redirect to scan results page (build in week 4)
    } catch (err: any) {
      alert(err.message ?? "Erro ao iniciar scan");
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Iniciar Scan NIS2</h1>

      <div style={{ marginTop: "1rem" }}>
        <label htmlFor="domain" style={{ display: "block", marginBottom: "0.5rem" }}>
          Domínio ou IP:
        </label>
        <input
          id="domain"
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="exemplo.pt ou 1.2.3.4"
          style={{
            width: "100%",
            padding: "0.5rem",
            fontSize: "1rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
        />
      </div>

      {!verified ? (
        <div style={{ marginTop: "1rem" }}>
          <button
            onClick={handleVerify}
            disabled={!domain || verifying}
            style={{
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              background: "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: domain ? "pointer" : "not-allowed",
            }}
          >
            {verifying ? "A verificar..." : "Verificar ownership"}
          </button>

          {token && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                background: "#fef3c7",
                border: "1px solid #fbbf24",
                borderRadius: "4px",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                <strong>Ownership não verificado.</strong>
              </p>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
                Adiciona este DNS TXT record ao domínio:
              </p>
              <code
                style={{
                  display: "block",
                  marginTop: "0.5rem",
                  padding: "0.5rem",
                  background: "#fff",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontFamily: "monospace",
                }}
              >
                {token}
              </code>
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              padding: "1rem",
              background: "#d1fae5",
              border: "1px solid #10b981",
              borderRadius: "4px",
              marginBottom: "1rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              ✅ <strong>Ownership verificado!</strong>
            </p>
          </div>

          <button
            onClick={handleStart}
            disabled={startMutation.isPending}
            style={{
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              background: "#10b981",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {startMutation.isPending ? "A iniciar scan..." : "Iniciar Scan NIS2 →"}
          </button>
        </div>
      )}
    </div>
  );
}
