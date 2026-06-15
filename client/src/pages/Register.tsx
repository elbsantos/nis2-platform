import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";

const PLAN_LABELS: Record<string, string> = {
  pro:  "Pro — €29/mês",
  mssp: "MSSP — €199/mês",
};

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
      // If a paid plan was requested, go to billing so user can subscribe
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
    <div style={{
      minHeight: "100vh",
      background: "#0f1e38",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Source Sans 3', sans-serif",
      padding: "24px",
    }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Source+Sans+3:wght@400;600;700&display=swap"
      />

      {/* Logo */}
      <Link to="/" style={{ textDecoration: "none", marginBottom: 40 }}>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "1.4rem",
          fontWeight: 700,
          color: "#ffffff",
        }}>
          NIS2 para <span style={{ color: "#f0c040" }}>PMEs</span> em Portugal
        </div>
      </Link>

      {/* Plan banner */}
      {plan && PLAN_LABELS[plan] && (
        <div style={{
          background: "rgba(184,134,11,0.15)",
          border: "1px solid rgba(184,134,11,0.3)",
          color: "#f0c040",
          padding: "10px 20px",
          fontSize: "0.85rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          marginBottom: 24,
          maxWidth: 460,
          width: "100%",
          textAlign: "center",
        }}>
          ✦ Seleccionaste o plano {PLAN_LABELS[plan]} — preenche os dados para continuar
        </div>
      )}

      {/* Card */}
      <div style={{
        background: "#152744",
        border: "1px solid #1e3a5f",
        borderTop: "3px solid #b8860b",
        padding: "40px 44px",
        width: "100%",
        maxWidth: 460,
      }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "1.6rem",
          color: "#ffffff",
          marginBottom: 8,
          fontWeight: 700,
        }}>
          Criar conta gratuita
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: 32 }}>
          Já tens conta?{" "}
          <Link to="/login" style={{ color: "#f0c040", textDecoration: "none", fontWeight: 600 }}>
            Entrar
          </Link>
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Nome</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Ana Costa"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Empresa</label>
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                required
                placeholder="Empresa Lda."
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="ana@empresa.pt"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Mínimo 8 caracteres"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(155,0,0,0.15)",
              border: "1px solid rgba(155,0,0,0.4)",
              color: "#ff8a80",
              padding: "10px 14px",
              fontSize: "0.875rem",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? "#6b1a1a" : "#9b0000",
              color: "#ffffff",
              padding: "14px",
              border: "none",
              fontFamily: "'Source Sans 3', sans-serif",
              fontWeight: 700,
              fontSize: "1rem",
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "0.03em",
              transition: "background 0.2s",
              marginTop: 4,
            }}
          >
            {loading ? "A criar conta…" : plan ? "Criar conta e continuar →" : "Criar conta gratuita →"}
          </button>

          <p style={{ color: "#334155", fontSize: "0.78rem", textAlign: "center", margin: 0 }}>
            Ao registar aceitas os{" "}
            <a href="#" style={{ color: "#475569" }}>termos de serviço</a>
            {" "}e a{" "}
            <a href="#" style={{ color: "#475569" }}>política de privacidade</a>.
          </p>
        </form>
      </div>

      <p style={{ color: "#334155", fontSize: "0.78rem", marginTop: 24, textAlign: "center" }}>
        © 2026 NIS2 PT · DL 125/2025 · Plano gratuito — sem cartão de crédito
      </p>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: "0.8rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontWeight: 700,
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  background: "#0f1e38",
  border: "1px solid #1e3a5f",
  color: "#ffffff",
  fontSize: "0.95rem",
  fontFamily: "'Source Sans 3', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};
