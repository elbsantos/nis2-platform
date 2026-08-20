/**
 * frontend/src/components/PublicChrome.tsx
 *
 * Nav + footer partilhados pelas páginas públicas institucionais
 * (/privacidade, /termos, /faq, /sobre). Reutiliza as classes CSS
 * já definidas em Landing.css (nav, footer, tokens de cor) para que
 * estas páginas pareçam parte do mesmo site da landing, sem repetir
 * as âncoras de secção (#scanner, #precos, …) que só existem lá.
 */
import { Link } from "react-router-dom";
import { ENABLE_PRICING, ENABLE_COURSE } from "../lib/featureFlags";

export function PublicNav() {
  return (
    <nav>
      <Link to="/" className="nav-logo" style={{ textDecoration: "none" }}>
        CISPLAN <span>PT</span>
      </Link>
      <ul className="nav-links-inline">
        <li><Link to="/sobre">Sobre</Link></li>
        <li><Link to="/faq">FAQ</Link></li>
        <li><Link to="/login" className="nav-link-ghost">Entrar</Link></li>
      </ul>
      <Link to="/register" className="nav-cta">Começar Grátis →</Link>
    </nav>
  );
}

export function PublicFooter() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="footer-logo">CISPLAN <span>PT</span></span>
          <p>A plataforma NIS2 para PMEs portuguesas.</p>
          <p style={{ marginTop: 8 }}>Conformidade com o DL 125/2025 — scanner, curso e remediação IA.</p>
        </div>
        <div className="footer-col">
          <h4>Plataforma</h4>
          <Link to="/#scanner">Scanner NIS2</Link>
          {ENABLE_COURSE && <Link to="/#curso">Curso NIS2</Link>}
          <Link to="/#dossier">Dossier de Conformidade</Link>
          {ENABLE_PRICING && <Link to="/#precos">Preços</Link>}
        </div>
        <div className="footer-col">
          <h4>Empresa</h4>
          <Link to="/sobre">Sobre nós</Link>
          <Link to="/faq">Perguntas frequentes</Link>
          <a href="mailto:geral@cisplan.com?subject=Plano Enterprise CISPLAN">Enterprise</a>
        </div>
        <div className="footer-col">
          <h4>Legal</h4>
          <Link to="/termos">Termos de Serviço</Link>
          <Link to="/privacidade">Política de Privacidade</Link>
          <a href="mailto:geral@cisplan.com">Suporte</a>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© 2026 CISPLAN · DL 125/2025 · Todos os direitos reservados</p>
        <div className="footer-links">
          <Link to="/termos">Termos</Link>
          <Link to="/privacidade">Privacidade</Link>
          <a href="mailto:geral@cisplan.com">Suporte</a>
        </div>
      </div>
    </footer>
  );
}
