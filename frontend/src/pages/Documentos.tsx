import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { DocButton } from "../components/DocButton";

const CARD = "bg-[#152744] border border-[#1e3a5f] rounded-xl";

const CLASSIFICATION_LABEL: Record<string, string> = {
  essencial:              "Entidade Essencial",
  importante:             "Entidade Importante",
  a_confirmar:            "A Confirmar (CNCS)",
  a_confirmar_contratual: "A Confirmar (contratual)",
  fora_condicional:       "Provavelmente Fora",
  fora_mvp:               "Fora do Âmbito (Adm. Pública)",
};

// ---------------------------------------------------------------------------
// Secção A — Documentos Gerais (7, sem seletor: perfil/enquadramento/questionário)
// ---------------------------------------------------------------------------

function SeccaoGeral() {
  const psi              = trpc.documents.psi.useQuery(undefined, { enabled: false, retry: false });
  const cartaCiso         = trpc.documents.cartaCiso.useQuery(undefined, { enabled: false, retry: false });
  const registoCncs       = trpc.documents.registoCncs.useQuery(undefined, { enabled: false, retry: false });
  const irp               = trpc.documents.irp.useQuery(undefined, { enabled: false, retry: false });
  const tracker10Medidas  = trpc.documents.tracker10Medidas.useQuery(undefined, { enabled: false, retry: false });
  const declaracaoMfa     = trpc.documents.declaracaoMfa.useQuery(undefined, { enabled: false, retry: false });
  const dossier           = trpc.documents.dossier.useQuery(undefined, { enabled: false, retry: false });

  return (
    <section className={`${CARD} p-6`}>
      <h2 className="text-2xl font-semibold text-white mb-1">Documentos Gerais</h2>
      <p className="text-slate-400 text-lg mb-5">
        Documentos gerados a partir do perfil, enquadramento e questionário da sua organização —
        sem depender de um scan específico. Se faltar algum dado, o botão mostra exatamente o que
        precisa de completar primeiro.
      </p>
      <div className="flex flex-wrap gap-3">
        <DocButton
          label="Política de Segurança da Informação (.docx)"
          onDownload={async () => {
            const r = await psi.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Carta de Nomeação do CISO (.docx)"
          onDownload={async () => {
            const r = await cartaCiso.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Registo Inicial CNCS (.docx)"
          onDownload={async () => {
            const r = await registoCncs.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Plano de Resposta a Incidentes (.docx)"
          onDownload={async () => {
            const r = await irp.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Tracker das 10 Medidas (.xlsx)"
          onDownload={async () => {
            const r = await tracker10Medidas.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Declaração de MFA — Autoavaliação (.docx)"
          onDownload={async () => {
            const r = await declaracaoMfa.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          label="Dossier de Conformidade — Índice Mestre (.xlsx)"
          onDownload={async () => {
            const r = await dossier.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Secção B — Documentos do Scan (4, com seletor de scan)
// ---------------------------------------------------------------------------

function SeccaoScan() {
  const { data: scans, isLoading } = trpc.scan.list.useQuery({ limit: 50, offset: 0 });
  const completedScans = useMemo(
    () => (scans ?? []).filter((s) => s.status === "completed"),
    [scans]
  );
  const [scanIdOverride, setScanIdOverride] = useState<number | null>(null);
  const effectiveScanId = scanIdOverride ?? completedScans[0]?.id ?? null;
  const hasScan = effectiveScanId !== null;

  const registoRiscos = trpc.documents.registoRiscos.useQuery(
    { scanId: effectiveScanId ?? 0 },
    { enabled: false, retry: false }
  );
  const inventarioAtivos = trpc.documents.inventarioAtivos.useQuery(
    { scanId: effectiveScanId ?? 0 },
    { enabled: false, retry: false }
  );
  const patchTracker = trpc.documents.patchTracker.useQuery(
    { scanId: effectiveScanId ?? 0 },
    { enabled: false, retry: false }
  );
  const relatorioGestao = trpc.documents.relatorioGestao.useQuery(
    { scanId: effectiveScanId ?? 0 },
    { enabled: false, retry: false }
  );

  return (
    <section className={`${CARD} p-6`}>
      <h2 className="text-2xl font-semibold text-white mb-1">Documentos do Scan</h2>
      <p className="text-slate-400 text-lg mb-4">
        Documentos que analisam um scan específico — escolha o scan acima dos botões.
      </p>

      {isLoading && <p className="text-slate-400 text-lg">A carregar scans…</p>}

      {!isLoading && !hasScan && (
        <div className="bg-[#0f1e38] border border-[#1e3a5f] rounded-lg p-4 text-lg text-slate-300 mb-4">
          Ainda não tem nenhum scan concluído.{" "}
          <Link to="/scan/start" className="text-amber-400 hover:underline">Faça um scan primeiro →</Link>
        </div>
      )}

      {hasScan && (
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1">Scan selecionado</label>
          <select
            value={effectiveScanId ?? ""}
            onChange={(e) => setScanIdOverride(Number(e.target.value))}
            className="bg-[#0f1e38] border border-[#1e3a5f] text-white text-lg rounded-md px-3 py-2 min-w-[320px] focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {completedScans.map((s) => (
              <option key={s.id} value={s.id}>
                {s.target} — {new Date(s.completedAt ?? s.createdAt).toLocaleDateString("pt-PT")}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <DocButton
          disabled={!hasScan}
          label="Registo de Riscos (.xlsx)"
          onDownload={async () => {
            const r = await registoRiscos.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          disabled={!hasScan}
          label="Inventário de Ativos (.xlsx)"
          onDownload={async () => {
            const r = await inventarioAtivos.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          disabled={!hasScan}
          label="Tracker de Patches e Vulnerabilidades (.xlsx)"
          onDownload={async () => {
            const r = await patchTracker.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
        <DocButton
          disabled={!hasScan}
          label="Relatório Executivo para a Gestão (.docx)"
          onDownload={async () => {
            const r = await relatorioGestao.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Secção C — Documento do Enquadramento (1, com seletor de enquadramento)
// ---------------------------------------------------------------------------

function SeccaoEnquadramento() {
  const { data: assessments, isLoading } = trpc.enquadramento.list.useQuery();
  const sorted = useMemo(
    () =>
      [...(assessments ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [assessments]
  );
  const [assessmentIdOverride, setAssessmentIdOverride] = useState<number | null>(null);
  const effectiveAssessmentId = assessmentIdOverride ?? sorted[0]?.id ?? null;
  const hasAssessment = effectiveAssessmentId !== null;

  const relatorioEnquadramento = trpc.documents.relatorioEnquadramento.useQuery(
    { assessmentId: effectiveAssessmentId ?? 0 },
    { enabled: false, retry: false }
  );

  return (
    <section className={`${CARD} p-6`}>
      <h2 className="text-2xl font-semibold text-white mb-1">Documento do Enquadramento</h2>
      <p className="text-slate-400 text-lg mb-4">
        Relatório do enquadramento NIS2 — escolha qual avaliação, se tiver feito mais do que uma.
      </p>

      {isLoading && <p className="text-slate-400 text-lg">A carregar enquadramentos…</p>}

      {!isLoading && !hasAssessment && (
        <div className="bg-[#0f1e38] border border-[#1e3a5f] rounded-lg p-4 text-lg text-slate-300 mb-4">
          Ainda não fez nenhum enquadramento.{" "}
          <Link to="/enquadramento/new" className="text-amber-400 hover:underline">Fazer o enquadramento →</Link>
        </div>
      )}

      {hasAssessment && (
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1">Enquadramento selecionado</label>
          <select
            value={effectiveAssessmentId ?? ""}
            onChange={(e) => setAssessmentIdOverride(Number(e.target.value))}
            className="bg-[#0f1e38] border border-[#1e3a5f] text-white text-lg rounded-md px-3 py-2 min-w-[320px] focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {sorted.map((a) => (
              <option key={a.id} value={a.id}>
                {CLASSIFICATION_LABEL[a.classification ?? ""] ?? a.classification ?? "—"} —{" "}
                {new Date(a.completedAt ?? a.createdAt).toLocaleDateString("pt-PT")}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <DocButton
          disabled={!hasAssessment}
          label="Relatório de Enquadramento NIS2 (.docx)"
          onDownload={async () => {
            const r = await relatorioEnquadramento.refetch();
            if (!r.data) throw new Error(r.error?.message ?? "Sem dados");
            return r.data;
          }}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function Documentos() {
  return (
    <div className="min-h-screen bg-[#0f1e38]">
      <div className="max-w-[100rem] mx-auto px-8 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Documentos NIS2</h1>
          <p className="text-xl text-slate-400 mt-1">
            Todos os documentos de conformidade gerados automaticamente, num único sítio.
          </p>
        </div>

        <SeccaoGeral />
        <SeccaoScan />
        <SeccaoEnquadramento />
      </div>
    </div>
  );
}
