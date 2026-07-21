/**
 * frontend/src/pages/EnquadramentoResult.tsx
 *
 * Resultado do enquadramento: classificação, trilha auditável (re-corre motor
 * client-side a partir dos answers guardados) e download do Relatório .docx.
 * Rota: /enquadramento/:id
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { evaluateTree, NIS2_PT_TREE } from "../../../backend/utils/decision-engine";

// ── Helper de download ────────────────────────────────────────────────────────

function downloadFile(fileBase64: string, filename: string, contentType: string) {
  const bytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
  const blob  = new Blob([bytes], { type: contentType });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href      = url;
  a.download  = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Badge de classificação ────────────────────────────────────────────────────

const CLASS_CFG: Record<string, { label: string; cls: string }> = {
  essencial:              { label: "Entidade Essencial",        cls: "bg-green-900/40 text-green-300 border border-green-700" },
  importante:             { label: "Entidade Importante",       cls: "bg-blue-900/40  text-blue-300  border border-blue-700" },
  a_confirmar:            { label: "A Confirmar (CNCS)",        cls: "bg-amber-900/40 text-amber-300 border border-amber-700" },
  a_confirmar_contratual: { label: "A Confirmar (contratual)",  cls: "bg-amber-900/40 text-amber-300 border border-amber-700" },
  fora_condicional:       { label: "Provavelmente Fora",        cls: "bg-slate-800    text-slate-400 border border-slate-600" },
  fora_mvp:               { label: "Fora do Âmbito (Adm. Pub.)", cls: "bg-red-900/40 text-red-300   border border-red-700" },
};

// ── Botão de download do .docx ────────────────────────────────────────────────

function DocxButton({ assessmentId }: { assessmentId: number }) {
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  const query = trpc.documents.relatorioEnquadramento.useQuery(
    { assessmentId },
    { enabled: false, retry: false }
  );

  async function handleClick() {
    setLoading(true);
    setErr(null);
    try {
      const result = await query.refetch();
      if (!result.data) throw new Error("Sem dados");
      const { fileBase64, filename, contentType } = result.data;
      downloadFile(fileBase64, filename, contentType);
    } catch (e: any) {
      setErr("Erro ao gerar documento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors flex items-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            A gerar…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Descarregar Relatório .docx
          </>
        )}
      </button>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function EnquadramentoResult() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const assessmentId = id ? parseInt(id, 10) : 0;

  const { data: assessment, isLoading, error } = trpc.enquadramento.getById.useQuery(
    { id: assessmentId },
    { enabled: assessmentId > 0 }
  );

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-400 text-sm">
        A carregar…
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-red-400 text-sm">{error?.message ?? "Assessment não encontrado."}</p>
        <button onClick={() => navigate("/enquadramento")} className="text-slate-400 hover:text-white text-sm">
          ← Voltar
        </button>
      </div>
    );
  }

  if (assessment.status !== "completed") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-slate-300 text-sm">Este enquadramento não foi concluído.</p>
        <button
          onClick={() => navigate("/enquadramento/new")}
          className="px-4 py-2 bg-blue-700 text-white text-sm rounded-md hover:bg-blue-800"
        >
          Iniciar novo enquadramento
        </button>
      </div>
    );
  }

  const cls    = assessment.classification ?? "";
  const cfg    = CLASS_CFG[cls];
  const answers = (assessment.answers ?? {}) as Record<string, string>;

  // Re-corre motor client-side para obter steps legíveis
  const result = evaluateTree(NIS2_PT_TREE, answers);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate("/enquadramento")}
            className="text-sm text-slate-400 hover:text-white mb-2 inline-flex items-center gap-1 transition-colors"
          >
            ← Enquadramentos
          </button>
          <h1 className="text-xl font-bold text-white">Resultado do Enquadramento</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {new Date(assessment.createdAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}
            {" · "}v{assessment.engineVersion}
          </p>
        </div>
        <DocxButton assessmentId={assessmentId} />
      </div>

      {/* Classificação */}
      <div className="bg-[#0f1e38] border border-[#1e3a5f] rounded-xl p-6 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Classificação</p>
        <div className={`inline-block px-3 py-1 text-sm font-bold rounded-lg ${cfg?.cls ?? "bg-slate-800 text-slate-300 border border-slate-600"}`}>
          {cfg?.label ?? cls}
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          {assessment.resultLabel ?? "—"}
        </p>
      </div>

      {/* Trilha auditável */}
      <div className="bg-[#0f1e38] border border-[#1e3a5f] rounded-xl p-6 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Como chegámos aqui — trilha auditável
        </p>
        <div className="space-y-3">
          {result.steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[#1e3a5f] flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 mt-0.5">
                {step.nodeId}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 leading-snug">{step.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{step.article}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Aviso */}
      <p className="text-xs text-slate-500 leading-relaxed">
        Este enquadramento é uma orientação preliminar ao abrigo do DL 125/2025. A qualificação formal
        cabe ao CNCS (Art. 8.º). Descarregue o Relatório completo para partilhar com a administração
        ou com assessoria jurídica.
      </p>

      {/* Acções */}
      <div className="flex gap-3 flex-wrap">
        <DocxButton assessmentId={assessmentId} />
        <button
          onClick={() => navigate("/enquadramento/new")}
          className="px-4 py-2 text-sm border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700/50 transition-colors"
        >
          Novo enquadramento
        </button>
      </div>
    </div>
  );
}
