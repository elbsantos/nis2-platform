import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/auth";

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

type Plan = "free" | "pro" | "mssp";

interface PlanDef {
  id: Plan;
  name: string;
  price: string;
  period: string;
  badge?: string;
  description: string;
  features: string[];
  cta: string;
  highlight: boolean;
}

const PLANS: PlanDef[] = [
  {
    id:          "free",
    name:        "Starter",
    price:       "€0",
    period:      "sempre",
    description: "Para descobrir a plataforma e fazer o primeiro diagnóstico NIS2.",
    features: [
      "1 scan NIS2/mês (1 domínio principal)",
      "Score NIS2 por artigo (visão geral)",
      "Email security check (SPF/DKIM/DMARC)",
      "Módulo 1 do curso (4 aulas)",
      "Questionário NIS2 (10 perguntas)",
      "5 templates essenciais",
    ],
    cta:       "Plano actual",
    highlight: false,
  },
  {
    id:          "pro",
    name:        "Pro",
    price:       "€89",
    period:      "mês",
    badge:       "Mais popular",
    description: "Para a empresa inteira. Scanner ilimitado, curso completo e IA de remediação.",
    features: [
      "Scans ilimitados (fair-use 50/mês)",
      "Scan em lote — até 15 targets por batch",
      "Descoberta de subdomínios — até 50",
      "Headers HTTP, Breach monitoring (HIBP), DNS Blacklists",
      "42 controlos NIS2 · 35 documentos editáveis",
      "Módulos 1 e 2 (7 aulas) · Certificado de conclusão",
      "Remediação IA (Claude) — 75 000 tokens/mês",
      "Actualizações legislativas incluídas",
    ],
    cta:       "Fazer upgrade para Pro",
    highlight: true,
  },
  {
    id:          "mssp",
    name:        "MSSP",
    price:       "€199",
    period:      "mês",
    description: "Para consultoras e MSPs que gerem NIS2 de múltiplos clientes.",
    features: [
      "Tudo do Pro",
      "Até 25 organizações geridas (€8/org adicional)",
      "Scan em lote — até 50 targets por batch",
      "Descoberta de subdomínios — até 200",
      "Dashboard multi-cliente · PDF white-label",
      "IA — 300 000 tokens/mês",
      "Onboarding dedicado (1h call)",
      "Suporte prioritário (resposta < 24h)",
    ],
    cta:       "Começar MSSP →",
    highlight: false,
  },
];

// ---------------------------------------------------------------------------
// Feature check icon
// ---------------------------------------------------------------------------

function Check() {
  return (
    <svg className="w-4 h-4 text-green-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Current subscription card
// ---------------------------------------------------------------------------

function SubscriptionCard() {
  const { data: sub, isLoading } = trpc.billing.getSubscription.useQuery();
  const utils = trpc.useUtils();

  const portalMut = trpc.billing.openPortal.useMutation({
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const cancelMut = trpc.billing.cancel.useMutation({
    onSuccess: () => utils.billing.getSubscription.invalidate(),
  });

  const [cancelConfirm, setCancelConfirm] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-32 mb-3" />
        <div className="h-6 bg-gray-100 rounded w-48" />
      </div>
    );
  }

  if (!sub || sub.plan === "free") return null;

  const planLabel = sub.plan === "pro" ? "Pro (€89/mês + IVA)" : "MSSP (€199/mês + IVA)";
  const renewDate = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("pt-PT")
    : null;
  const isCanceling = !!sub.cancelAt;

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-6 mb-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
            Subscrição activa
          </p>
          <p className="text-lg font-bold text-gray-900">{planLabel}</p>
          {renewDate && !isCanceling && (
            <p className="text-sm text-gray-500 mt-0.5">Renova a {renewDate}</p>
          )}
          {isCanceling && (
            <p className="text-sm text-amber-600 mt-0.5 font-medium">
              A cancelar — acesso até {new Date(sub.cancelAt!).toLocaleDateString("pt-PT")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => portalMut.mutate()}
            disabled={portalMut.isPending}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {portalMut.isPending ? "A abrir…" : "Gerir subscrição"}
          </button>
          {!isCanceling && (
            cancelConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Tens a certeza?</span>
                <button
                  onClick={() => { cancelMut.mutate(); setCancelConfirm(false); }}
                  disabled={cancelMut.isPending}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  Sim, cancelar
                </button>
                <button
                  onClick={() => setCancelConfirm(false)}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50"
                >
                  Não
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCancelConfirm(true)}
                className="px-4 py-2 text-sm border border-red-200 rounded-md text-red-600 hover:bg-red-50"
              >
                Cancelar
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

function PlanCard({ plan, currentPlan }: { plan: PlanDef; currentPlan: Plan }) {
  const utils = trpc.useUtils();
  const checkoutMut = trpc.billing.createCheckout.useMutation({
    onSuccess: ({ url }) => { window.location.href = url; },
  });
  const portalMut = trpc.billing.openPortal.useMutation({
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const isCurrent = plan.id === currentPlan;
  const isDowngrade =
    (currentPlan === "mssp" && plan.id !== "mssp") ||
    (currentPlan === "pro"  && plan.id === "free");

  function handleCTA() {
    if (plan.id === "free" || isCurrent || isDowngrade) return;
    if (plan.id === "mssp") {
      // For MSSP, open portal (if already subscribed) or redirect to contact
      if (currentPlan === "pro") {
        portalMut.mutate();
      } else {
        window.location.href = "mailto:hello@nis2pt.pt?subject=Plano MSSP";
      }
      return;
    }
    checkoutMut.mutate({ plan: plan.id as "pro" | "mssp" });
  }

  const isPending = checkoutMut.isPending || portalMut.isPending;

  return (
    <div
      className={`relative flex flex-col bg-white border rounded-2xl p-6 transition-shadow ${
        plan.highlight
          ? "border-blue-500 shadow-lg shadow-blue-100"
          : "border-gray-200"
      }`}
    >
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 bg-blue-700 text-white text-xs font-semibold rounded-full">
            {plan.badge}
          </span>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
          {isCurrent && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              Actual
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
          {plan.period !== "sempre" && (
            <span className="text-sm text-gray-400">/ {plan.period}</span>
          )}
          {plan.period === "sempre" && (
            <span className="text-sm text-gray-400">{plan.period}</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
      </div>

      <ul className="space-y-2 flex-1 mb-6">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
            <Check />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={handleCTA}
        disabled={isCurrent || isDowngrade || isPending}
        className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
          plan.highlight && !isCurrent
            ? "bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
            : isCurrent
            ? "bg-gray-100 text-gray-400 cursor-default"
            : isDowngrade
            ? "bg-gray-50 text-gray-400 cursor-default border border-gray-200"
            : "border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        }`}
      >
        {isPending
          ? "A redirecionar…"
          : isCurrent
          ? "Plano actual"
          : isDowngrade
          ? "Downgrade via portal"
          : plan.cta}
      </button>

      {checkoutMut.error && (
        <p className="mt-2 text-xs text-red-600 text-center">
          {checkoutMut.error.message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Posso cancelar a qualquer momento?",
    a: "Sim. O cancelamento é imediato e o acesso Pro mantém-se até ao fim do período pago. Não há penalizações.",
  },
  {
    q: "Os dados ficam guardados se fizer downgrade?",
    a: "Sim. Todos os scans, questionários e planos de remediação ficam guardados. No plano gratuito deixas de poder gerar novos relatórios AI e scans ilimitados.",
  },
  {
    q: "O plano MSSP inclui sub-contas para clientes?",
    a: "Sim. Podes criar organizações separadas para cada cliente, com dashboards e relatórios independentes.",
  },
  {
    q: "Existe desconto para pagamento anual?",
    a: "Sim — 2 meses grátis no pagamento anual. Contacta hello@nis2pt.pt para activar.",
  },
  {
    q: "As faturas são emitidas com IVA português?",
    a: "Sim. Todas as faturas são emitidas com IVA a 23% (taxa PT) e estão disponíveis no portal de subscrição Stripe.",
  },
];

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mt-16 max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-white mb-6 text-center">
        Perguntas frequentes
      </h2>
      <div className="space-y-3">
        {FAQ.map((item, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-gray-900"
              onClick={() => setOpen(open === i ? null : i)}
            >
              {item.q}
              <span className="text-gray-400 ml-2 shrink-0">{open === i ? "▲" : "▼"}</span>
            </button>
            {open === i && (
              <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete account modal
// ---------------------------------------------------------------------------

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleDelete() {
    if (!password) { setError("A senha é obrigatória."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/account", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body:    JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao eliminar conta.");
        return;
      }
      // Cookie foi limpo pelo backend; limpar estado local e redirecionar
      await logout();
      navigate("/login", {
        replace: true,
        state:   { message: "A tua conta foi eliminada. Os teus dados foram apagados conforme o RGPD, art. 17." },
      });
    } catch {
      setError("Erro de ligação. Tenta novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          Eliminar conta permanentemente
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Esta ação é <strong>irreversível</strong>. Todos os dados serão apagados: scans,
          questionários, planos de remediação e organização. A conta não pode ser recuperada.
        </p>
        <p className="text-sm text-gray-600 mb-5">
          Para confirmar, introduz a tua senha actual:
        </p>

        <div className="mb-4">
          <label htmlFor="delete-password" className="block text-sm font-medium text-gray-700 mb-1">
            Senha actual
          </label>
          <input
            id="delete-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || !password}
            className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "A eliminar…" : "Eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

function DangerZone() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="mt-16 border border-red-800/60 bg-red-950/20 rounded-2xl p-6 max-w-2xl mx-auto">
        <h2 className="text-base font-bold text-red-400 mb-1">Zona de Perigo</h2>
        <p className="text-sm text-slate-400 mb-5">
          A eliminação de conta apaga permanentemente todos os teus dados — scans, questionários,
          organização e planos de remediação — e não pode ser revertida. Tens direito ao apagamento
          dos teus dados pessoais nos termos do RGPD, art. 17.
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Eliminar a minha conta
        </button>
      </div>

      {showModal && <DeleteAccountModal onClose={() => setShowModal(false)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Billing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const { data: sub } = trpc.billing.getSubscription.useQuery();
  const currentPlan: Plan = sub?.plan ?? "free";

  // Handle Stripe redirect back
  useEffect(() => {
    const success  = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    const plan     = searchParams.get("plan");

    if (success === "1") {
      const label = plan === "mssp" ? "MSSP" : "Pro";
      setToast({ type: "success", msg: `Plano ${label} activado com sucesso! Bem-vindo.` });
      setSearchParams({}, { replace: true });
    } else if (canceled === "1") {
      setToast({ type: "error", msg: "Checkout cancelado. Podes tentar novamente quando quiseres." });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-white">Planos e Preços</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Conformidade NIS2 para PMEs portuguesas. Sem surpresas, sem contratos anuais.
        </p>
      </div>

      {/* Active subscription summary */}
      <SubscriptionCard />

      {/* Plan comparison grid — 4 colunas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "1.25rem", alignItems: "start" }}>
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} currentPlan={currentPlan} />
        ))}
        {/* Enterprise card */}
        <div className="relative flex flex-col bg-gray-900 border border-amber-500/40 rounded-2xl p-6">
          <div className="mb-4">
            <span className="px-2.5 py-0.5 bg-amber-400/20 text-amber-300 text-xs font-semibold rounded-full border border-amber-400/30">
              Enterprise
            </span>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-white">€499</span>
              <span className="text-sm text-gray-400">/ mês</span>
            </div>
            <p className="text-sm text-gray-400 mt-1">Grandes organizações e organismos públicos.</p>
          </div>
          <ul className="space-y-2 flex-1 mb-6">
            {[
              "Organizações ilimitadas",
              "IA sem limites de tokens",
              "SLA 99,9% · suporte 24/7",
              "SSO SAML / OIDC",
              "API access completa",
              "Gestor de conta dedicado",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <a
            href="mailto:hello@cisplan.pt?subject=Plano Enterprise"
            className="w-full py-2.5 rounded-lg text-sm font-bold text-center bg-amber-400 text-gray-900 hover:bg-amber-300 transition-colors block"
          >
            Falar Connosco →
          </a>
        </div>
      </div>

      {/* Trust signals */}
      <div className="mt-10 flex flex-wrap justify-center gap-6 text-xs text-slate-400">
        <span>🔒 Pagamento seguro via Stripe</span>
        <span>🇵🇹 Fatura com IVA português</span>
        <span>↩️ Cancelamento sem penalização</span>
        <span>💳 Cartão, MB Way, SEPA</span>
      </div>

      {/* FAQ */}
      <FaqSection />

      {/* Contact CTA */}
      <div className="mt-12 text-center bg-blue-50 border border-blue-100 rounded-2xl p-8">
        <h3 className="text-base font-bold text-gray-900 mb-2">
          Precisas de uma proposta personalizada?
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Para organismos públicos, contratos anuais ou volume de clientes, entra em contacto directo.
        </p>
        <a
          href="mailto:hello@nis2pt.pt?subject=Proposta CISPLAN"
          className="inline-block px-6 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800"
        >
          Falar com a equipa →
        </a>
      </div>

      {/* Danger zone */}
      <DangerZone />
    </div>
  );
}
