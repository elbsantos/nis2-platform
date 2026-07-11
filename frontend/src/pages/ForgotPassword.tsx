import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import "./Auth.css";

export default function ForgotPassword() {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setError("Ocorreu um erro. Tenta novamente.");
      }
    } catch {
      setError("Ocorreu um erro. Tenta novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-layout">
        <div className="auth-form-side">
          <Link to="/" className="auth-logo">
            <span className="auth-logo-text">CISPLAN <span>PT</span></span>
          </Link>

          <div className="auth-content">
            <h1>Recuperar senha</h1>

            {!sent ? (
              <>
                <p className="auth-subtitle">
                  Indica o teu email e enviamos um link para redefinires a senha.
                </p>

                <form className="auth-form" onSubmit={handleSubmit}>
                  <div className="auth-field">
                    <label htmlFor="forgot-email">Email</label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="empresa@exemplo.pt"
                    />
                  </div>

                  {error && <div className="auth-error">{error}</div>}

                  <button type="submit" disabled={loading} className="auth-cta">
                    {loading ? "A enviar…" : "Enviar link de recuperação →"}
                  </button>
                </form>
              </>
            ) : (
              <div>
                <p className="auth-subtitle">
                  Se o email existir na plataforma, receberás um link de reset nos próximos minutos.
                </p>
                <p className="auth-subtitle">
                  Verifica também a pasta de spam — é um domínio recente.
                </p>
              </div>
            )}

            <p className="auth-subtitle" style={{ marginTop: "1.5rem" }}>
              <Link to="/login">← Voltar ao login</Link>
            </p>

            <p className="auth-page-footer">© 2026 CISPLAN PT · DL 125/2025</p>
          </div>
        </div>
      </div>
    </div>
  );
}
