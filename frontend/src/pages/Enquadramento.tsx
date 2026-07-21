/**
 * frontend/src/pages/Enquadramento.tsx
 *
 * Lista de assessments de enquadramento NIS2-PT da organização.
 * Rota: /enquadramento
 */

import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

const CLASS_BADGE: Record<string, string> = {
  essencial:              "bg-green-900/40 text-green-300 border-green-700",
  importante:             "bg-blue-900/40  text-blue-300  border-blue-700",
  a_confirmar:            "bg-amber-900/40 text-amber-300 border-amber-700",
  a_confirmar_contratual: "bg-amber-900/40 text-amber-300 border-amber-700",
  fora_condicional:       "bg-slate-800    text-slate-400 border-slate-600",
  fora_mvp:               "bg-red-900/40   text-red-300   border-red-700",
};

const CLASS_PT: Record<string, string> = {
  essencial:              "Essencial",
  importante:             "Importante",
  a_confirmar:            "A confirmar",
  a_confirmar_contratual: "A confirmar (contratual)",
  fora_condicional:       "Provavelmente fora",
  fora_mvp:               "Fora (Adm. Pública)",
};

export default function Enquadramento() {
  const navigate = useNavigate();
  const { data: items, isLoading } = trpc.enquadramento.list.useQuery();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Enquadramento NIS2</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Classificação ao abrigo do DL 125/2025 (entidade essencial, importante ou fora)
          </p>
        </div>
        <button
          onClick={() => navigate("/enquadramento/new")}
          className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 transition-colors"
        >
          + Novo enquadramento
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-slate-400 text-sm">A carregar…</div>
      )}

      {!isLoading && items?.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">⚖️</div>
          <p className="text-slate-300 font-medium mb-2">Nenhum enquadramento realizado</p>
          <p className="text-sm text-slate-400 mb-6">
            O assistente faz-lhe 3 a 4 perguntas e classifica a sua empresa ao abrigo do DL 125/2025.
            Demora menos de 5 minutos.
          </p>
          <button
            onClick={() => navigate("/enquadramento/new")}
            className="px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 transition-colors"
          >
            Iniciar enquadramento
          </button>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => {
            const done = item.status === "completed";
            const cls  = item.classification ?? null;
            return (
              <div
                key={item.id}
                className="bg-[#0f1e38] border border-[#1e3a5f] rounded-xl p-4 hover:border-blue-700 transition-colors cursor-pointer"
                onClick={() => navigate(`/enquadramento/${item.id}`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        done
                          ? "bg-green-900/40 text-green-300"
                          : "bg-slate-800 text-slate-400"
                      }`}>
                        {done ? "Concluído" : "Em curso"}
                      </span>
                      <span className="text-xs text-slate-500">#{item.id}</span>
                    </div>

                    {cls && done && (
                      <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded border ${
                        CLASS_BADGE[cls] ?? "bg-slate-800 text-slate-400 border-slate-600"
                      }`}>
                        {CLASS_PT[cls] ?? cls}
                      </span>
                    )}

                    {!done && (
                      <p className="text-xs text-slate-500 mt-1">Wizard não concluído</p>
                    )}

                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(item.createdAt).toLocaleDateString("pt-PT")}
                    </p>
                  </div>

                  {done && (
                    <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
