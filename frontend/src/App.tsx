import { useState } from "react";
import { Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import {
  User, Compass, ClipboardList, Search, Wrench, FileText,
  GraduationCap, History, CreditCard, BookOpen, type LucideIcon,
} from "lucide-react";
import { Icon } from "./components/ui/Icon";
import { useAuth } from "./lib/auth";
import { ENABLE_PRICING, ENABLE_COURSE } from "./lib/featureFlags";
import Landing        from "./pages/Landing";
import Login          from "./pages/Login";
import Register       from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword  from "./pages/ResetPassword";
import ScanStart       from "./pages/ScanStart";
import ScanResults     from "./pages/ScanResults";
import ScanHistory     from "./pages/ScanHistory";
import BulkScanResults from "./pages/BulkScanResults";
import Questionnaire       from "./pages/Questionnaire";
import QuestionnaireReport from "./pages/QuestionnaireReport";
import Enquadramento        from "./pages/Enquadramento";
import EnquadramentoWizard from "./pages/EnquadramentoWizard";
import EnquadramentoResult from "./pages/EnquadramentoResult";
import Remediation   from "./pages/Remediation";
import Billing       from "./pages/Billing";
import Course        from "./pages/Course";
import Lesson        from "./pages/Lesson";
import OrgProfile    from "./pages/OrgProfile";
import Documentos    from "./pages/Documentos";
import GuiaDocumentos from "./pages/GuiaDocumentos";
import BemVindo      from "./pages/BemVindo";
import Privacidade   from "./pages/Privacidade";
import Termos        from "./pages/Termos";
import Faq           from "./pages/Faq";
import Sobre         from "./pages/Sobre";

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1526] flex items-center justify-center">
        <div className="text-slate-400 text-sm">A carregar…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />;
  }

  return <Outlet />;
}

// ── Sidebar (authenticated) ─────────────────────────────────────────────────
// Ordem da jornada: Perfil → Enquadramento → Questionário → Scanner →
// Remediação → Documentos. Secundários (Curso/Histórico/Planos) separados
// visualmente por baixo, sem ordem de fluxo entre si.

type NavItem = { to: string; label: string; icon: LucideIcon };

const MAIN_ITEMS: NavItem[] = [
  { to: "/perfil",        label: "Perfil",        icon: User },
  { to: "/enquadramento", label: "Enquadramento", icon: Compass },
  { to: "/questionnaire", label: "Questionário",  icon: ClipboardList },
  { to: "/scan/start",    label: "Scanner",       icon: Search },
  { to: "/remediation",   label: "Remediação",    icon: Wrench },
  { to: "/documentos",    label: "Documentos",    icon: FileText },
];

const SECONDARY_ITEMS: NavItem[] = [
  { to: "/guia-documentos", label: "Guia dos Documentos", icon: BookOpen },
  ...(ENABLE_COURSE ? [{ to: "/course", label: "Curso", icon: GraduationCap }] : []),
  { to: "/scan/history",  label: "Histórico", icon: History },
  { to: "/billing",       label: ENABLE_PRICING ? "Planos" : "Conta", icon: CreditCard },
];

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const base     = "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors";
  const active   = `${base} bg-[#1f3864] text-white`;
  const inactive = `${base} text-slate-300 hover:bg-[#152744] hover:text-white`;

  return (
    <>
      {/* Overlay — só em ecrã pequeno, com a sidebar aberta */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 shrink-0 bg-[#0f1e38]
          border-r border-[#1e3a5f] flex flex-col transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="h-14 flex items-center px-4 border-b border-[#1e3a5f] shrink-0">
          <NavLink to="/" className="font-bold text-white text-lg hover:text-[#f0c040] transition-colors">
            CISPLAN
          </NavLink>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {MAIN_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) => isActive ? active : inactive}
            >
              <Icon as={item.icon} />
              {item.label}
            </NavLink>
          ))}

          <div className="pt-4 mt-4 border-t border-[#1e3a5f] space-y-1">
            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Mais
            </p>
            {SECONDARY_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) => isActive ? active : inactive}
              >
                <Icon as={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="px-4 py-3 border-t border-[#1e3a5f] shrink-0">
          <p className="text-xs text-slate-400 truncate mb-2">{user?.email}</p>
          <button
            onClick={() => logout().then(() => window.location.href = "/")}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 -mx-2 rounded hover:bg-[#152744] transition-colors w-[calc(100%+16px)] text-left"
          >
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

// Topbar só visível em ecrã pequeno (< lg) — abre a sidebar como painel deslizante.
function MobileTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <div className="lg:hidden h-14 flex items-center justify-between px-4 bg-[#0f1e38] border-b-2 border-[#b8860b] sticky top-0 z-20">
      <button
        onClick={onMenuClick}
        className="text-white p-2 -ml-2"
        aria-label="Abrir menu"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>
      <NavLink to="/" className="font-bold text-white text-sm">CISPLAN</NavLink>
      <div className="w-[26px]" aria-hidden="true" />
    </div>
  );
}

// ── Authenticated layout ──────────────────────────────────────────────────────
function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0b1526] lg:flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0">
        <MobileTopBar onMenuClick={() => setSidebarOpen(true)} />
        <Outlet />
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/"                 element={<Landing />} />
      <Route path="/login"            element={<Login />} />
      <Route path="/register"         element={<Register />} />
      <Route path="/forgot-password"  element={<ForgotPassword />} />
      <Route path="/reset-password"   element={<ResetPassword />} />
      <Route path="/privacidade"      element={<Privacidade />} />
      <Route path="/termos"           element={<Termos />} />
      <Route path="/faq"              element={<Faq />} />
      <Route path="/sobre"            element={<Sobre />} />

      {/* Protected routes */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/bem-vindo"                element={<BemVindo />} />
          <Route path="/scan/start"               element={<ScanStart />} />
          <Route path="/scan/results/:scanId"     element={<ScanResults />} />
          <Route path="/scan/bulk/:batchId"       element={<BulkScanResults />} />
          <Route path="/scan/history"             element={<ScanHistory />} />
          <Route path="/questionnaire"                        element={<Questionnaire />} />
          <Route path="/questionnaire/:sessionId"           element={<Questionnaire />} />
          <Route path="/questionnaire/:sessionId/report"    element={<QuestionnaireReport />} />
          <Route path="/enquadramento"                      element={<Enquadramento />} />
          <Route path="/enquadramento/new"                  element={<EnquadramentoWizard />} />
          <Route path="/enquadramento/:id"                  element={<EnquadramentoResult />} />
          <Route path="/remediation"                        element={<Remediation />} />
          <Route path="/documentos"               element={<Documentos />} />
          <Route path="/guia-documentos"           element={<GuiaDocumentos />} />
          <Route path="/billing"                  element={<Billing />} />
          <Route path="/perfil"                   element={<OrgProfile />} />
          <Route path="/course"                   element={<Course />} />
          <Route path="/course/:lessonId"         element={<Lesson />} />
          <Route path="*"                         element={<Navigate to="/bem-vindo" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
