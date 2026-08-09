import { useState, type ReactNode } from "react";

const STORAGE_PREFIX = "explainer:";

/**
 * Lê o estado guardado em sessionStorage (não localStorage — morre com o
 * separador, não persiste entre dias/dispositivos). Nunca rebenta: modo
 * privado ou sessionStorage indisponível apenas faz o painel abrir sempre
 * por omissão (falha graciosa, não é crítico).
 */
function readInitialClosed(key: string): boolean {
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${key}:closed`) === "1";
  } catch {
    return false;
  }
}

function persistClosed(key: string, closed: boolean) {
  try {
    if (closed) sessionStorage.setItem(`${STORAGE_PREFIX}${key}:closed`, "1");
    else sessionStorage.removeItem(`${STORAGE_PREFIX}${key}:closed`);
  } catch {
    // sessionStorage indisponível — o painel só não lembra nesta sessão
  }
}

/**
 * Painel "O que é isto? ▾" no topo de uma página de recurso. Aberto por
 * omissão (mostra a explicação a quem ainda não a viu); uma vez fechado
 * pelo utilizador, fica fechado — lembrado via sessionStorage, uma chave
 * por `resourceKey`, pelo resto da sessão (sobrevive a navegação e a
 * reload da página; não sobrevive a fechar o separador nem a outro
 * dispositivo).
 */
export function ExplainerPanel({
  resourceKey,
  title = "O que é isto?",
  children,
}: {
  resourceKey: string;
  title?: string;
  children: ReactNode;
}) {
  const [closed, setClosed] = useState(() => readInitialClosed(resourceKey));

  function toggle() {
    setClosed((prev) => {
      const next = !prev;
      persistClosed(resourceKey, next);
      return next;
    });
  }

  return (
    <div className="bg-[#152744] border border-[#1e3a5f] rounded-xl mb-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3 text-left text-slate-300 hover:text-white hover:bg-[#1a2e52] transition-colors"
        aria-expanded={!closed}
      >
        <span className="text-sm font-semibold flex items-center gap-2">
          <span className="text-[#f0c040]" aria-hidden="true">💡</span> {title}
        </span>
        <span
          className={`text-slate-400 transition-transform duration-150 ${closed ? "" : "rotate-180"}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {!closed && (
        <div className="px-5 pb-5 pt-1 text-slate-300 text-sm leading-relaxed space-y-3 border-t border-[#1e3a5f]">
          {children}
        </div>
      )}
    </div>
  );
}
