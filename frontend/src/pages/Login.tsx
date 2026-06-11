import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import "./Auth.css";

const ARTICLES = [
  { label: "Art. 21 — Segurança",    pct: 78, color: "#4a9eff" },
  { label: "Art. 23 — Incidentes",   pct: 65, color: "#f0c040" },
  { label: "Art. 20 — Governance",   pct: 82, color: "#10b981" },
  { label: "Art. 24 — Continuidade", pct: 54, color: "#a78bfa" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = (location.state as { from?: string })?.from ?? "/scan/start";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao fazer login");
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
              CISPLAN <span>PT</span>
            </span>
          </Link>

          <div className="auth-content">
            <h1>Entrar na tua conta</h1>
            <p className="auth-subtitle">
              Não tens conta?{" "}
              <Link to="/register">Registar gratuitamente</Link>
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="empresa@exemplo.pt"
                />
              </div>

              <div className="auth-field">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" disabled={loading} className="auth-cta">
                {loading ? "A entrar…" : "Entrar →"}
              </button>
            </form>

            <div className="auth-trust">
              <span className="trust-item">
                <span className="trust-icon">✓</span> Ligação segura TLS
              </span>
              <span className="trust-item">
                <span className="trust-icon">✓</span> RGPD compliant
              </span>
              <span className="trust-item">
                <span className="trust-icon">✓</span> Dados em Portugal
              </span>
            </div>

            <p className="auth-page-footer">
              © 2026 CISPLAN PT · DL 125/2025
            </p>
          </div>
        </div>

        {/* ── Showcase side ─────────────────────────────── */}
        <div className="auth-showcase">
          <div className="showcase-inner">
            <span className="showcase-eyebrow">Plataforma NIS2 para PMEs</span>
            <div className="showcase-header">
              <h2>Conformidade NIS2 ao alcance da tua empresa</h2>
              <p>
                Avalia a tua postura de segurança, identifica lacunas por artigo NIS2
                e obtém recomendações prioritizadas pela IA.
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
                <span className="benefit-icon">📊</span>
                <h4>Dashboard em tempo real</h4>
                <p>Score por artigo NIS2 actualizado após cada scan</p>
              </div>
              <div className="benefit-card">
                <span className="benefit-icon">🛡️</span>
                <h4>47 controlos auditados</h4>
                <p>Cobertura completa dos Anexos I e II da directiva</p>
              </div>
              <div className="benefit-card">
                <span className="benefit-icon">⚡</span>
                <h4>Remediação guiada</h4>
                <p>Prioridades claras para reduzir risco rapidamente</p>
              </div>
              <div className="benefit-card">
                <span className="benefit-icon">🇵🇹</span>
                <h4>Feito para Portugal</h4>
                <p>DL 125/2025, CNCS e templates em português</p>
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
