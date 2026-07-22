/**
 * frontend/src/pages/EnquadramentoWizard.tsx
 *
 * Fluxo completo: wizard em React state → complete (cria linha already completed).
 * Nenhuma linha in_progress é criada enquanto o utilizador preenche (C-EQ7).
 * Rota: /enquadramento/new
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { NIS2_PT_TREE } from "../../../backend/utils/decision-engine";
import type { Answers } from "../../../backend/utils/decision-engine";
import DecisionWizard from "../components/DecisionWizard";

export default function EnquadramentoWizard() {
  const navigate = useNavigate();

  const [error,      setError]     = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const completeMut = trpc.enquadramento.complete.useMutation({
    onSuccess: (data) => navigate(`/enquadramento/${data.id}`, { replace: true }),
    onError:   (e)    => { setError(e.message); setCompleting(false); },
  });

  function handleWizardComplete(answers: Answers) {
    if (completing) return;
    setCompleting(true);
    completeMut.mutate({ answers });
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => navigate("/enquadramento")}
          className="text-slate-400 hover:text-white text-sm transition-colors"
        >
          ← Voltar
        </button>
      </div>
    );
  }

  if (completing || completeMut.isPending) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-400 text-sm">
        A calcular enquadramento…
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <button
          onClick={() => navigate("/enquadramento")}
          className="text-sm text-slate-400 hover:text-white transition-colors mb-4 inline-flex items-center gap-1"
        >
          ← Cancelar
        </button>
        <h1 className="text-xl font-bold text-white mb-1">Enquadramento NIS2-PT</h1>
        <p className="text-sm text-slate-400 mb-0">
          DL 125/2025 — 3 a 4 perguntas sobre o setor e dimensão da sua empresa
        </p>
      </div>

      <DecisionWizard tree={NIS2_PT_TREE} onComplete={handleWizardComplete} />
    </div>
  );
}
