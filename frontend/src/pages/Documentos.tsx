import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { DocButton } from "../components/DocButton";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { InfoNote } from "../components/ui/InfoNote";
import { Alert } from "../components/ui/Alert";

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
    <Card as="section" className="p-6">
      <h2 className="text-2xl font-semibold text-text mb-1">Documentos Gerais</h2>
      <p className="text-dim text-lg mb-5">
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
    </Card>
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
    <Card as="section" className="p-6">
      <h2 className="text-2xl font-semibold text-text mb-1">Documentos do Scan</h2>
      <p className="text-dim text-lg mb-4">
        Documentos que analisam um scan específico — escolha o scan acima dos botões.
      </p>

      {isLoading && <p className="text-dim text-lg">A carregar scans…</p>}

      {!isLoading && !hasScan && (
        <Alert tone="info" className="mb-4 text-lg">
          Ainda não tem nenhum scan concluído.{" "}
          <Link to="/scan/start" className="text-accent hover:underline">Faça um scan primeiro →</Link>
        </Alert>
      )}

      {hasScan && (
        <div className="mb-4">
          <label className="block text-sm text-dim mb-1">Scan selecionado</label>
          <Select
            value={effectiveScanId ?? ""}
            onChange={(e) => setScanIdOverride(Number(e.target.value))}
            className="min-w-[320px]"
          >
            {completedScans.map((s) => (
              <option key={s.id} value={s.id}>
                {s.target} — {new Date(s.completedAt ?? s.createdAt).toLocaleDateString("pt-PT")}
              </option>
            ))}
          </Select>
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
    </Card>
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
    <Card as="section" className="p-6">
      <h2 className="text-2xl font-semibold text-text mb-1">Documento do Enquadramento</h2>
      <p className="text-dim text-lg mb-4">
        Relatório do enquadramento NIS2 — escolha qual avaliação, se tiver feito mais do que uma.
      </p>

      {isLoading && <p className="text-dim text-lg">A carregar enquadramentos…</p>}

      {!isLoading && !hasAssessment && (
        <Alert tone="info" className="mb-4 text-lg">
          Ainda não fez nenhum enquadramento.{" "}
          <Link to="/enquadramento/new" className="text-accent hover:underline">Fazer o enquadramento →</Link>
        </Alert>
      )}

      {hasAssessment && (
        <div className="mb-4">
          <label className="block text-sm text-dim mb-1">Enquadramento selecionado</label>
          <Select
            value={effectiveAssessmentId ?? ""}
            onChange={(e) => setAssessmentIdOverride(Number(e.target.value))}
            className="min-w-[320px]"
          >
            {sorted.map((a) => (
              <option key={a.id} value={a.id}>
                {CLASSIFICATION_LABEL[a.classification ?? ""] ?? a.classification ?? "—"} —{" "}
                {new Date(a.completedAt ?? a.createdAt).toLocaleDateString("pt-PT")}
              </option>
            ))}
          </Select>
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
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function Documentos() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-text">Documentos NIS2</h1>
          <p className="text-xl text-dim mt-1">
            Todos os documentos de conformidade gerados automaticamente, num único sítio.
          </p>
          <Link to="/guia-documentos" className="inline-block text-sm text-accent hover:underline mt-2">
            Como preencher estes documentos →
          </Link>
        </div>

        <InfoNote>
          <p><strong className="text-text">O que é.</strong> O centro dos seus documentos de conformidade. A plataforma gera aqui os documentos técnicos e de governança que a NIS2 exige — preenchidos com os seus dados reais.</p>
          <p><strong className="text-text">Porque existe.</strong> A conformidade NIS2 exige um conjunto de documentos (políticas, planos, registos). Muitos são técnicos ou jurídicos e difíceis de produzir sozinho. A plataforma gera-os por si, a partir do que já preencheu.</p>
          <div>
            <p className="font-semibold text-text mb-1">Como está organizado:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-text">Documentos gerais</strong> — gerados a partir do seu perfil, enquadramento e questionário. Aparecem sempre.</li>
              <li><strong className="text-text">Documentos do scan</strong> — analisam um scan específico (escolha qual acima). Precisam de um scan feito.</li>
              <li><strong className="text-text">Documento do enquadramento</strong> — o relatório da sua classificação NIS2.</li>
            </ul>
          </div>
          <p><strong className="text-text">O que a plataforma não gera.</strong> Alguns documentos dependem de atos da sua empresa — uma ata de reunião, um registo de formação, um contrato com um fornecedor. A plataforma não os inventa (isso seria falsificar evidência), mas o Dossier de Conformidade indica-lhe quais são, a obrigação legal de cada um, e como os deve produzir.</p>
        </InfoNote>

        <SeccaoGeral />
        <SeccaoScan />
        <SeccaoEnquadramento />
      </div>
    </div>
  );
}
