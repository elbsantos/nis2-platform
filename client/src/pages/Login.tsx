import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

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
      {/* Google Fonts */}
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

      {/* Card */}
      <div style={{
        background: "#152744",
        border: "1px solid #1e3a5f",
        borderTop: "3px solid #b8860b",
        padding: "40px 44px",
        width: "100%",
        maxWidth: 420,
      }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "1.6rem",
          color: "#ffffff",
          marginBottom: 8,
          fontWeight: 700,
        }}>
          Entrar na plataforma
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: 32 }}>
          Não tens conta?{" "}
          <Link to="/register" style={{ color: "#f0c040", textDecoration: "none", fontWeight: 600 }}>
            Registar gratuitamente
          </Link>
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="empresa@exemplo.pt"
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "#0f1e38",
                border: "1px solid #1e3a5f",
                color: "#ffffff",
                fontSize: "0.95rem",
                fontFamily: "'Source Sans 3', sans-serif",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "#0f1e38",
                border: "1px solid #1e3a5f",
                color: "#ffffff",
                fontSize: "0.95rem",
                fontFamily: "'Source Sans 3', sans-serif",
                outline: "none",
                boxSizing: "border-box",
              }}
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
            {loading ? "A entrar…" : "Entrar →"}
          </button>
        </form>
      </div>

      <p style={{ color: "#334155", fontSize: "0.78rem", marginTop: 24, textAlign: "center" }}>
        © 2026 NIS2 PT · DL 125/2025
      </p>
    </div>
  );
}
