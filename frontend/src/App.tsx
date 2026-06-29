import { Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Landing      from "./pages/Landing";
import Login        from "./pages/Login";
import Register     from "./pages/Register";
import ScanStart       from "./pages/ScanStart";
import ScanResults     from "./pages/ScanResults";
import ScanHistory     from "./pages/ScanHistory";
import BulkScanResults from "./pages/BulkScanResults";
import Questionnaire       from "./pages/Questionnaire";
import QuestionnaireReport from "./pages/QuestionnaireReport";
import Remediation   from "./pages/Remediation";
import Billing       from "./pages/Billing";
import Course        from "./pages/Course";
import Lesson        from "./pages/Lesson";

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

// ── App nav (authenticated) ───────────────────────────────────────────────────
function AppNav() {
  const { user, logout } = useAuth();
  const base     = "px-3 py-2 text-sm font-medium rounded-md transition-colors";
  const active   = `${base} bg-[#1f3864] text-white`;
  const inactive = `${base} text-slate-300 hover:bg-[#152744] hover:text-white`;

  return (
    <nav className="bg-[#0f1e38] border-b-2 border-[#b8860b] px-4">
      <div className="max-w-5xl mx-auto flex items-center gap-1 h-12">
        <NavLink to="/" className="font-bold text-white text-sm mr-4 hover:text-[#f0c040] transition-colors">
          NIS2 <span className="text-[#f0c040]">PT</span>
        </NavLink>
        <NavLink to="/scan/start"    className={({ isActive }) => isActive ? active : inactive}>Novo scan</NavLink>
        <NavLink to="/scan/history"  className={({ isActive }) => isActive ? active : inactive}>Histórico</NavLink>
        <NavLink to="/questionnaire" className={({ isActive }) => isActive ? active : inactive}>Questionário</NavLink>
        <NavLink to="/remediation"   className={({ isActive }) => isActive ? active : inactive}>Remediação</NavLink>
        <NavLink to="/course"        className={({ isActive }) => isActive ? active : inactive}>Curso</NavLink>
        <NavLink to="/billing"       className={({ isActive }) => isActive ? active : inactive}>Planos</NavLink>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:block">{user?.email}</span>
          <button
            onClick={() => logout().then(() => window.location.href = "/")}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-[#152744] transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </nav>
  );
}

// ── Authenticated layout ──────────────────────────────────────────────────────
function AppLayout() {
  return (
    <div className="min-h-screen bg-[#0b1526]">
      <AppNav />
      <Outlet />
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/"         element={<Landing />} />
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected routes */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/scan/start"               element={<ScanStart />} />
          <Route path="/scan/results/:scanId"     element={<ScanResults />} />
          <Route path="/scan/bulk/:batchId"       element={<BulkScanResults />} />
          <Route path="/scan/history"             element={<ScanHistory />} />
          <Route path="/questionnaire"                        element={<Questionnaire />} />
          <Route path="/questionnaire/:sessionId"           element={<Questionnaire />} />
          <Route path="/questionnaire/:sessionId/report"    element={<QuestionnaireReport />} />
          <Route path="/remediation"              element={<Remediation />} />
          <Route path="/billing"                  element={<Billing />} />
          <Route path="/course"                   element={<Course />} />
          <Route path="/course/:lessonId"         element={<Lesson />} />
          <Route path="*"                         element={<Navigate to="/scan/start" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
