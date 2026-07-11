import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import "./Auth.css";

const PLAN_LABELS: Record<string, string> = {
  pro:  "Pro — €49/mês",
  mssp: "MSSP — €119/mês",
};

const ARTICLES = [
  { label: "Art. 21 — Segurança",    pct: 78, color: "#4a9eff" },
  { label: "Art. 23 — Incidentes",   pct: 65, color: "#f0c040" },
  { label: "Art. 20 — Governance",   pct: 82, color: "#10b981" },
  { label: "Art. 24 — Continuidade", pct: 54, color: "#a78bfa" },
];

export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [params]     = useSearchParams();
  const plan         = params.get("plan") ?? "";

  const [name,     setName]     = useState("");
  const [orgName,  setOrgName]  = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("A password deve ter pelo menos 8 caracteres");
      return;
    }

    setLoading(true);
    try {
      await register({ email, password, name, orgName });
      if (plan === "pro" || plan === "mssp") {
        navigate(`/billing?plan=${plan}`, { replace: true });
      } else {
        navigate("/scan/start", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-layout">

        {/* ── Form side ─────────────────────────────────── */}
        <div className="auth-form-side">
          <Link to="/" className="auth-logo">
            <span className="auth-logo-text">
              CISPLAN
            </span>
          </Link>

          <div className="auth-content">
            <h1>Criar conta gratuita</h1>
            <p className="auth-subtitle">
              Já tens conta?{" "}
              <Link to="/login">Entrar</Link>
            </p>

            {plan && PLAN_LABELS[plan] && (
              <div className="auth-plan-banner">
                ✦ Seleccionaste o plano {PLAN_LABELS[plan]} — preenche os dados para continuar
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-form-row">
                <div className="auth-field">
                  <label htmlFor="reg-name">Nome</label>
                  <input
                    id="reg-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="Ana Costa"
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-org">Empresa</label>
                  <input
                    id="reg-org"
                    type="text"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    required
                    placeholder="Empresa Lda."
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="reg-email">Email</label>
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="ana@empresa.pt"
                />
              </div>

              <div className="auth-field">
                <label htmlFor="reg-password">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" disabled={loading} className="auth-cta">
                {loading
                  ? "A criar conta…"
                  : plan
                  ? "Criar conta e continuar →"
                  : "Criar conta gratuita →"}
              </button>
            </form>

            <p className="auth-legal">
              Ao registar aceitas os{" "}
              <a href="#">termos de serviço</a>
              {" "}e a{" "}
              <a href="#">política de privacidade</a>.
            </p>

            <div className="auth-trust">
              <span className="trust-item">
                <span className="trust-icon">✓</span> Sem cartão de crédito
              </span>
              <span className="trust-item">
                <span className="trust-icon">✓</span> RGPD compliant
              </span>
              <span className="trust-item">
                <span className="trust-icon">✓</span> Dados em Portugal
              </span>
            </div>

            <p className="auth-page-footer">
              © 2026 CISPLAN · DL 125/2025
            </p>
          </div>
        </div>

        {/* ── Showcase side ─────────────────────────────── */}
        <div className="auth-showcase">
          <div className="showcase-inner">
            <span className="showcase-eyebrow">Conformidade NIS2 simplificada</span>
            <div className="showcase-header">
              <h2>O teu score NIS2 em menos de 5 minutos</h2>
              <p>
                Scanner agentless, análise por artigo e remediação guiada por IA —
                tudo em português, feito para PMEs portuguesas.
              </p>
            </div>

            {/* Dashboard mockup */}
            <div className="showcase-mockup">
              <div className="mockup-topbar">
                <span className="mockup-title">Score de Conformidade NIS2</span>
                <span className="mockup-score-badge">Score: 72/100</span>
              </div>
              <div className="mockup-articles">
                {ARTICLES.map(a => (
                  <div key={a.label} className="mockup-article-row">
                    <span className="mockup-article-label">{a.label}</span>
                    <div className="mockup-bar-track">
                      <div
                        className="mockup-bar-fill"
                        style={{ width: `${a.pct}%`, background: a.color }}
                      />
                    </div>
                    <span className="mockup-article-pct">{a.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Benefits */}
            <div className="showcase-benefits">
              <div className="benefit-card">
                <span className="benefit-icon">🔍</span>
                <h4>Scanner agentless</h4>
                <p>Analisa a tua superfície de ataque sem instalar nada</p>
              </div>
              <div className="benefit-card">
                <span className="benefit-icon">🤖</span>
                <h4>Remediação IA</h4>
                <p>Claude sugere prioridades adaptadas ao teu sector</p>
              </div>
              <div className="benefit-card">
                <span className="benefit-icon">📚</span>
                <h4>Curso integrado</h4>
                <p>Formação NIS2/DL 125/2025 em português europeu</p>
              </div>
              <div className="benefit-card">
                <span className="benefit-icon">📄</span>
                <h4>Templates CNCS</h4>
                <p>Relatórios prontos para auditoria e regulador</p>
              </div>
            </div>

            {/* Stats */}
            <div className="showcase-stats">
              <div className="stat-item">
                <span className="stat-value">47</span>
                <span className="stat-label">Controlos NIS2</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">89%</span>
                <span className="stat-label">PMEs expostas</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">€10M</span>
                <span className="stat-label">Coima máxima</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
