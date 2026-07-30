import { useEffect, useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";

// ---------------------------------------------------------------------------
// Opções de dropdown (espelham as constantes do router)
// ---------------------------------------------------------------------------

const SECTOR_OPTIONS = [
  { value: "",                    label: "— Seleccionar setor —" },
  { value: "tld_dns_confianca",   label: "Registos TLD, DNS autoritativos ou Serviços de Confiança Qualificados" },
  { value: "telecom",             label: "Redes ou serviços de comunicações eletrónicas" },
  { value: "cloud_ixp_datacenter",label: "Cloud computing, centros de dados, CDN ou IXP" },
  { value: "gestao_tic",          label: "Gestão de serviços TIC B2B (MSP / MSSP)" },
  { value: "energia",             label: "Energia (eletricidade, gás, petróleo, hidrogénio)" },
  { value: "transportes",         label: "Transportes (aéreo, ferroviário, aquático, rodoviário)" },
  { value: "banca_financeiro",    label: "Banca ou infraestruturas de mercados financeiros" },
  { value: "saude",               label: "Saúde (prestadores, laboratórios, I&D, farmácias)" },
  { value: "agua",                label: "Água potável e/ou residual" },
  { value: "espaco",              label: "Espaço (operadores de infraestruturas terrestres)" },
  { value: "postais_residuos",    label: "Serviços postais/estafetas ou gestão de resíduos" },
  { value: "quimicos_alimentar",  label: "Químicos ou setor alimentar (distribuição a grande escala)" },
  { value: "industria",           label: "Indústria e manufatura" },
  { value: "digital_b2c",         label: "Mercados online, motores de busca ou redes sociais" },
  { value: "admin_publica",       label: "Administração Pública" },
  { value: "outro",               label: "Outro setor" },
];

const SIZE_OPTIONS = [
  { value: "",        label: "— Seleccionar dimensão —" },
  { value: "micro",   label: "Micro (< 10 trabalhadores)" },
  { value: "pequena", label: "Pequena (10–49 trabalhadores)" },
  { value: "media",   label: "Média (50–249 trabalhadores)" },
  { value: "grande",  label: "Grande (≥ 250 trabalhadores)" },
];

const TAX_TYPE_OPTIONS = [
  { value: "NIPC",  label: "NIPC (Portugal — empresas)" },
  { value: "NIF",   label: "NIF (Portugal — singulares)" },
  { value: "NIT",   label: "NIT (Brasil)" },
  { value: "EIN",   label: "EIN (EUA)" },
  { value: "VAT",   label: "VAT / IVA (UE)" },
  { value: "OTHER", label: "Outro" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
};

function Field({ id, label, required, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT_CLS =
  "w-full px-3 py-2 bg-[#0b1526] border border-slate-600 rounded-lg text-sm text-white " +
  "placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const SELECT_CLS =
  "w-full px-3 py-2 bg-[#0b1526] border border-slate-600 rounded-lg text-sm text-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OrgProfile() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.organization.getProfile.useQuery();

  const updateMut = trpc.organization.updateProfile.useMutation({
    onSuccess: () => {
      setToast("Perfil guardado com sucesso.");
      utils.organization.getProfile.invalidate();
    },
    onError: (err) => setError(err.message ?? "Erro ao guardar."),
  });

  // Form state
  const [legalName,            setLegalName]            = useState("");
  const [taxId,                setTaxId]                = useState("");
  const [taxIdType,            setTaxIdType]            = useState("NIPC");
  const [address,              setAddress]              = useState("");
  const [sector,               setSector]               = useState("");
  const [size,                 setSize]                 = useState("");
  const [contactPhone,         setContactPhone]         = useState("");
  const [securityOfficerName,  setSecurityOfficerName]  = useState("");
  const [securityOfficerEmail, setSecurityOfficerEmail] = useState("");
  const [legalRepresentative,  setLegalRepresentative]  = useState("");
  const [domain,               setDomain]               = useState("");

  const [error,  setError]  = useState("");
  const [toast,  setToast]  = useState("");

  // Pré-preencher quando o perfil carregar
  useEffect(() => {
    if (!profile) return;
    setLegalName(profile.legalName            ?? "");
    setTaxId(profile.taxId                    ?? "");
    setTaxIdType(profile.taxIdType            ?? "NIPC");
    setAddress(profile.address                ?? "");
    setSector(profile.sector                  ?? "");
    setSize(profile.size                      ?? "");
    setContactPhone(profile.contactPhone      ?? "");
    setSecurityOfficerName(profile.securityOfficerName  ?? "");
    setSecurityOfficerEmail(profile.securityOfficerEmail ?? "");
    setLegalRepresentative(profile.legalRepresentative  ?? "");
    setDomain(profile.domain                  ?? "");
  }, [profile]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function validate(): boolean {
    if (securityOfficerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(securityOfficerEmail)) {
      setError("Email do CISO inválido.");
      return false;
    }
    setError("");
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    updateMut.mutate({
      legalName:            legalName            || null,
      taxId:                taxId                || null,
      taxIdType:            (taxIdType as any)   || null,
      address:              address              || null,
      sector:               sector               || null,
      size:                 size                 || null,
      contactPhone:         contactPhone         || null,
      securityOfficerName:  securityOfficerName  || null,
      securityOfficerEmail: securityOfficerEmail || "",
      legalRepresentative:  legalRepresentative  || null,
      domain:               domain               || null,
    });
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-700 rounded w-48" />
          <div className="h-4 bg-slate-700 rounded w-72" />
          <div className="h-40 bg-slate-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Perfil da Entidade</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Dados de identidade reutilizados automaticamente em todos os documentos NIS2 gerados
          pela plataforma (Carta CISO, IRP, Notificação CNCS, etc.).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* ── Secção A: Identificação ── */}
        <section className="bg-[#0f1e38] border border-slate-700 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            A — Identificação da Empresa
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="legalName" label="Denominação social (nome legal)">
              <input
                id="legalName" type="text" value={legalName}
                onChange={e => setLegalName(e.target.value)}
                placeholder="Empresa Exemplo, Lda."
                className={INPUT_CLS}
              />
            </Field>

            <Field id="domain" label="Domínio web">
              <input
                id="domain" type="text" value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="empresa.pt"
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id="taxIdType" label="Tipo de NIF">
              <select
                id="taxIdType" value={taxIdType}
                onChange={e => setTaxIdType(e.target.value)}
                className={SELECT_CLS}
              >
                {TAX_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field id="taxId" label="NIF / NIPC">
              <input
                id="taxId" type="text" value={taxId}
                onChange={e => setTaxId(e.target.value)}
                placeholder="509000000"
                maxLength={20}
                className={INPUT_CLS}
              />
            </Field>

            <Field id="contactPhone" label="Telefone de contacto">
              <input
                id="contactPhone" type="tel" value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="+351 210 000 000"
                maxLength={50}
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <Field id="address" label="Sede social (morada completa)">
            <input
              id="address" type="text" value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Rua Exemplo 1, 1000-001 Lisboa"
              maxLength={500}
              className={INPUT_CLS}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="sector" label="Setor de atividade (NIS2)">
              <select
                id="sector" value={sector}
                onChange={e => setSector(e.target.value)}
                className={SELECT_CLS}
              >
                {SECTOR_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field id="size" label="Dimensão da empresa">
              <select
                id="size" value={size}
                onChange={e => setSize(e.target.value)}
                className={SELECT_CLS}
              >
                {SIZE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field id="legalRepresentative" label="Representante legal (nome e cargo)">
            <input
              id="legalRepresentative" type="text" value={legalRepresentative}
              onChange={e => setLegalRepresentative(e.target.value)}
              placeholder="João Silva — Administrador-Delegado"
              maxLength={255}
              className={INPUT_CLS}
            />
          </Field>
        </section>

        {/* ── Secção B: CISO ── */}
        <section className="bg-[#0f1e38] border border-slate-700 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            B — Responsável de Segurança (CISO)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="ciso-name" label="Nome completo do CISO">
              <input
                id="ciso-name" type="text" value={securityOfficerName}
                onChange={e => setSecurityOfficerName(e.target.value)}
                placeholder="Ana Costa"
                maxLength={255}
                className={INPUT_CLS}
              />
            </Field>

            <Field id="ciso-email" label="Email institucional do CISO">
              <input
                id="ciso-email" type="email" value={securityOfficerEmail}
                onChange={e => setSecurityOfficerEmail(e.target.value)}
                placeholder="ciso@empresa.pt"
                maxLength={255}
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <p className="text-xs text-slate-500">
            Estes dados são usados na Carta de Nomeação do CISO e no IRP. O CISO tem reporte
            directo ao órgão de gestão nos termos do Art. 20.º NIS2.
          </p>
        </section>

        {/* Erros e submit */}
        {error && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updateMut.isPending}
            className="px-6 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {updateMut.isPending ? "A guardar…" : "Guardar perfil"}
          </button>
        </div>

      </form>
    </div>
  );
}
