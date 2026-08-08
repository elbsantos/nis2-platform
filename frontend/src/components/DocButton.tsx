import { useState } from "react";

export function triggerDownload(base64: string, filename: string, contentType: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob  = new Blob([bytes], { type: contentType });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Botão de download de um documento NIS2 gerado no servidor. `onDownload`
 * chama o endpoint tRPC (via .refetch(), enabled:false) e devolve o
 * ficheiro; se a precondição do documento não estiver cumprida, o erro
 * lançado aqui é a mensagem real do servidor (ex.: "Complete primeiro o
 * questionário de autoavaliação"), nunca um texto genérico inventado.
 *
 * `disabled` serve para secções com seletor (scan/enquadramento) quando
 * ainda não há nenhuma fonte disponível — o botão fica visível mas
 * inativo, em vez de desaparecer.
 */
export function DocButton({
  label,
  onDownload,
  disabled = false,
}: {
  label: string;
  onDownload: () => Promise<{ fileBase64: string; filename: string; contentType: string }>;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleClick() {
    if (disabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onDownload();
      triggerDownload(result.fileBase64, result.filename, result.contentType);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao gerar documento");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading || disabled}
        className="px-4 py-2 bg-teal-700 text-white text-lg font-medium rounded-md hover:bg-teal-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {loading ? "A gerar…" : `↓ ${label}`}
      </button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
