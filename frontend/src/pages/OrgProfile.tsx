import { useEffect, useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";
import {
  SECTOR_OPTIONS,
  SIZE_OPTIONS,
  TAX_ID_TYPE_OPTIONS,
} from "../../../backend/utils/org-options";
import { toIntegerDigits } from "../lib/formatMilhares";
import { MoneyInput } from "../components/MoneyInput";
import { ExplainerPanel } from "../components/ExplainerPanel";

// ---------------------------------------------------------------------------
// Campos essenciais para geração de documentos
// ---------------------------------------------------------------------------

const ESSENTIAL_FIELDS: { key: string; label: string }[] = [
  { key: "legalName",           label: "Denominação social" },
  { key: "taxId",               label: "NIF / NIPC" },
  { key: "sector",              label: "Setor de atividade NIS2" },
  { key: "legalRepresentative", label: "Representante legal" },
  { key: "securityOfficerName", label: "Nome do CISO" },
];

// Nota: os 10 campos novos (Carta CISO, Notificação CNCS) não entram no banner de
// essenciais — os documentos que os usam ainda aceitam "[A PREENCHER]" como fallback
// (mesmo padrão da PSI), para não bloquear quem já usa os documentos existentes hoje.

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

  // Perfil da Entidade completo (6 documentos)
  const [caeCode,                  setCaeCode]                  = useState("");
  const [employeeCount,            setEmployeeCount]            = useState("");
  const [annualTurnover,           setAnnualTurnover]           = useState("");
  const [annualBalance,            setAnnualBalance]            = useState("");
  const [legalRepresentativeRole,  setLegalRepresentativeRole]  = useState("");
  const [ceoName,                  setCeoName]                  = useState("");
  const [securityOfficerRole,      setSecurityOfficerRole]      = useState("");
  const [securityOfficerPhone,     setSecurityOfficerPhone]     = useState("");
  const [securityOfficerTaxId,     setSecurityOfficerTaxId]     = useState("");
  const [securityOfficerStartDate, setSecurityOfficerStartDate] = useState("");
  const [city,                     setCity]                     = useState("");
  const [ceoContact,               setCeoContact]               = useState("");
  const [countriesOfOperation,     setCountriesOfOperation]     = useState("");

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
    setCaeCode(profile.caeCode                                 ?? "");
    setEmployeeCount(profile.employeeCount != null ? String(profile.employeeCount) : "");
    setAnnualTurnover(toIntegerDigits(profile.annualTurnover));
    setAnnualBalance(toIntegerDigits(profile.annualBalance));
    setLegalRepresentativeRole(profile.legalRepresentativeRole ?? "");
    setCeoName(profile.ceoName                                 ?? "");
    setSecurityOfficerRole(profile.securityOfficerRole         ?? "");
    setSecurityOfficerPhone(profile.securityOfficerPhone       ?? "");
    setSecurityOfficerTaxId(profile.securityOfficerTaxId       ?? "");
    setSecurityOfficerStartDate(profile.securityOfficerStartDate ?? "");
    setCity(profile.city ?? "");
    setCeoContact(profile.ceoContact ?? "");
    setCountriesOfOperation(
      Array.isArray(profile.countriesOfOperation) ? profile.countriesOfOperation.join(", ") : ""
    );
  }, [profile]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Campos essenciais em falta (calculados a partir dos valores actuais do formulário)
  const formValues: Record<string, string> = {
    legalName, taxId, sector, legalRepresentative, securityOfficerName,
  };
  const missingEssential = !isLoading
    ? ESSENTIAL_FIELDS.filter((f) => !formValues[f.key]?.trim())
    : [];

  function validate(): boolean {
    if (securityOfficerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(securityOfficerEmail)) {
      setError("Email do CISO inválido.");
      return false;
    }
    if (ceoContact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ceoContact)) {
      setError("Email de contacto do CEO/gestão de topo inválido.");
      return false;
    }
    if (taxId && (taxIdType === "NIPC" || taxIdType === "NIF")) {
      if (!/^\d{9}$/.test(taxId.replace(/\s/g, ""))) {
        setError("NIF/NIPC português deve ter exactamente 9 dígitos (apenas números).");
        return false;
      }
    }
    if (employeeCount.trim() && (!/^\d+$/.test(employeeCount.trim()) || Number(employeeCount) < 0)) {
      setError("Número de colaboradores deve ser um inteiro ≥ 0.");
      return false;
    }
    if (securityOfficerStartDate && isNaN(new Date(`${securityOfficerStartDate}T00:00:00Z`).getTime())) {
      setError("Data de início do CISO inválida.");
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
      caeCode:                  caeCode                  || null,
      employeeCount:            employeeCount.trim()     ? Number(employeeCount) : null,
      annualTurnover:           annualTurnover.trim()     || null,
      annualBalance:            annualBalance.trim()      || null,
      legalRepresentativeRole:  legalRepresentativeRole   || null,
      ceoName:                  ceoName                  || null,
      securityOfficerRole:      securityOfficerRole       || null,
      securityOfficerPhone:     securityOfficerPhone      || null,
      securityOfficerTaxId:     securityOfficerTaxId      || null,
      securityOfficerStartDate: securityOfficerStartDate  || null,
      city:                     city                     || null,
      ceoContact:               ceoContact               || "",
      countriesOfOperation:     countriesOfOperation.trim()
        ? countriesOfOperation.split(",").map(s => s.trim()).filter(Boolean)
        : null,
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

      <ExplainerPanel resourceKey="perfil">
        <p><strong className="text-white">O que é.</strong> Os dados de identificação da sua empresa: nome legal, NIF, morada, e os responsáveis (o gestor de topo e o responsável de segurança).</p>
        <p><strong className="text-white">Porque existe.</strong> Os documentos de conformidade que a plataforma gera — a Carta de Nomeação do responsável de segurança, o Plano de Resposta a Incidentes, e outros — precisam destes dados para saírem completos e prontos a assinar. Sem o perfil preenchido, os documentos saem com espaços por completar.</p>
        <p><strong className="text-white">Quando fazer.</strong> Primeiro. É a base de tudo o resto.</p>
      </ExplainerPanel>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Perfil da Entidade</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Dados de identidade reutilizados automaticamente em todos os documentos NIS2 gerados
          pela plataforma (Carta CISO, IRP, Notificação CNCS, etc.).
        </p>
      </div>

      {/* Banner — campos essenciais em falta */}
      {missingEssential.length > 0 && (
        <div className="mb-6 bg-amber-950/40 border border-amber-700 rounded-xl px-5 py-4">
          <p className="text-sm font-semibold text-amber-300 mb-2">
            Complete o perfil para gerar documentos NIS2
          </p>
          <ul className="space-y-1">
            {missingEssential.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-xs text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                {f.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-500">
            {missingEssential.length} de {ESSENTIAL_FIELDS.length} campos essenciais por preencher.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* ── Secção A: Identificação ── */}
        <section className="bg-[#0f1e38] border border-slate-700 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            A — Identificação da Empresa
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="legalName" label="Denominação social (nome legal)" required>
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
                {TAX_ID_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field id="taxId" label="NIF / NIPC" required>
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
                placeholder="+351 910 000 000"
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

          <Field id="city" label="Localidade">
            <input
              id="city" type="text" value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="Lisboa"
              maxLength={120}
              className={INPUT_CLS}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="sector" label="Setor de atividade (NIS2)" required>
              <select
                id="sector" value={sector}
                onChange={e => setSector(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">— Seleccionar setor —</option>
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
                <option value="">— Seleccionar dimensão —</option>
                {SIZE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="caeCode" label="Código CAE">
              <input
                id="caeCode" type="text" value={caeCode}
                onChange={e => setCaeCode(e.target.value)}
                placeholder="62010"
                maxLength={20}
                className={INPUT_CLS}
              />
            </Field>

            <Field id="employeeCount" label="Nº de colaboradores">
              <input
                id="employeeCount" type="number" min={0} step={1} value={employeeCount}
                onChange={e => setEmployeeCount(e.target.value)}
                placeholder="230"
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="annualTurnover" label="Volume de negócios anual (€)">
              <MoneyInput
                id="annualTurnover" value={annualTurnover}
                onChange={setAnnualTurnover}
                placeholder="990000"
                className={INPUT_CLS}
              />
            </Field>

            <Field id="annualBalance" label="Balanço total anual (€)">
              <MoneyInput
                id="annualBalance" value={annualBalance}
                onChange={setAnnualBalance}
                placeholder="430000"
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <Field id="countriesOfOperation" label="País(es) de operação, além de Portugal">
            <input
              id="countriesOfOperation" type="text" value={countriesOfOperation}
              onChange={e => setCountriesOfOperation(e.target.value)}
              placeholder="Espanha, França (deixar vazio se só opera em Portugal)"
              className={INPUT_CLS}
            />
          </Field>
        </section>

        {/* ── Secção B: Órgão de Gestão ── */}
        <section className="bg-[#0f1e38] border border-slate-700 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            B — Órgão de Gestão
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="legalRepresentative" label="Representante legal (nome)" required>
              <input
                id="legalRepresentative" type="text" value={legalRepresentative}
                onChange={e => setLegalRepresentative(e.target.value)}
                placeholder="João Silva"
                maxLength={255}
                className={INPUT_CLS}
              />
            </Field>

            <Field id="legalRepresentativeRole" label="Cargo do representante legal">
              <input
                id="legalRepresentativeRole" type="text" value={legalRepresentativeRole}
                onChange={e => setLegalRepresentativeRole(e.target.value)}
                placeholder="Administrador-Delegado"
                maxLength={120}
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="ceoName" label="Nome do CEO / gestão de topo">
              <input
                id="ceoName" type="text" value={ceoName}
                onChange={e => setCeoName(e.target.value)}
                placeholder="Maria Santos (se distinto do representante legal)"
                maxLength={255}
                className={INPUT_CLS}
              />
            </Field>

            <Field id="ceoContact" label="Email de contacto (CEO/gestão de topo)">
              <input
                id="ceoContact" type="email" value={ceoContact}
                onChange={e => setCeoContact(e.target.value)}
                placeholder="ceo@empresa.pt"
                maxLength={120}
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </section>

        {/* ── Secção C: CISO ── */}
        <section className="bg-[#0f1e38] border border-slate-700 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            C — Responsável de Segurança (CISO)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="ciso-name" label="Nome completo do CISO" required>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="securityOfficerRole" label="Cargo actual do CISO">
              <input
                id="securityOfficerRole" type="text" value={securityOfficerRole}
                onChange={e => setSecurityOfficerRole(e.target.value)}
                placeholder="Diretor de TI"
                maxLength={120}
                className={INPUT_CLS}
              />
            </Field>

            <Field id="securityOfficerPhone" label="Telemóvel do CISO">
              <input
                id="securityOfficerPhone" type="tel" value={securityOfficerPhone}
                onChange={e => setSecurityOfficerPhone(e.target.value)}
                placeholder="+351 910 000 000"
                maxLength={30}
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="securityOfficerTaxId" label="NIF pessoal do CISO">
              <input
                id="securityOfficerTaxId" type="text" value={securityOfficerTaxId}
                onChange={e => setSecurityOfficerTaxId(e.target.value)}
                placeholder="123456789"
                maxLength={20}
                className={INPUT_CLS}
              />
            </Field>

            <Field id="securityOfficerStartDate" label="Data de início no cargo">
              <input
                id="securityOfficerStartDate" type="date" value={securityOfficerStartDate}
                onChange={e => setSecurityOfficerStartDate(e.target.value)}
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
