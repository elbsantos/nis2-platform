import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import "./Auth.css";

export default function ResetPassword() {
  const [params]   = useSearchParams();
  const token      = params.get("token");
  const navigate   = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  // Token ausente da URL — erro amigável, sem página em branco
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-layout">
          <div className="auth-form-side">
            <Link to="/" className="auth-logo">
              <span className="auth-logo-text">CISPLAN <span>PT</span></span>
            </Link>
            <div className="auth-content">
              <h1>Link inválido</h1>
              <div className="auth-error">
                Este link de recuperação está incompleto ou foi copiado incorrectamente.
              </div>
              <p className="auth-subtitle" style={{ marginTop: "1rem" }}>
                <Link to="/forgot-password">Pedir um novo link →</Link>
              </p>
              <p className="auth-page-footer">© 2026 CISPLAN PT · DL 125/2025</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password }),
      });

      if (res.ok) {
        navigate("/login", {
          state: { message: "Senha atualizada. Entra com a nova senha." },
          replace: true,
        });
      } else {
        setError("Link inválido ou expirado. Pede um novo.");
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
            <h1>Definir nova senha</h1>
            <p className="auth-subtitle">
              Escolhe uma senha segura com pelo menos 8 caracteres.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label htmlFor="reset-password">Nova senha</label>
                <input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div className="auth-field">
                <label htmlFor="reset-confirm">Confirmar senha</label>
                <input
                  id="reset-confirm"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="auth-error">
                  {error}{" "}
                  {error.includes("expirado") && (
                    <Link to="/forgot-password">Pedir novo link →</Link>
                  )}
                </div>
              )}

              <button type="submit" disabled={loading} className="auth-cta">
                {loading ? "A atualizar…" : "Atualizar senha →"}
              </button>
            </form>

            <p className="auth-page-footer">© 2026 CISPLAN PT · DL 125/2025</p>
          </div>
        </div>
      </div>
    </div>
  );
}
