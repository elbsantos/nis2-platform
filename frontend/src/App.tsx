import { Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Landing      from "./pages/Landing";
import Login        from "./pages/Login";
import Register     from "./pages/Register";
import ScanStart       from "./pages/ScanStart";
import ScanResults     from "./pages/ScanResults";
import ScanHistory     from "./pages/ScanHistory";
import BulkScanResults from "./pages/BulkScanResults";
import Questionnaire from "./pages/Questionnaire";
import Remediation   from "./pages/Remediation";
import Billing       from "./pages/Billing";
import Course        from "./pages/Course";
import Lesson        from "./pages/Lesson";

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">A carregar…</div>
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
  const active   = `${base} bg-blue-700 text-white`;
  const inactive = `${base} text-gray-600 hover:bg-gray-100`;

  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="max-w-5xl mx-auto flex items-center gap-1 h-12">
        <NavLink to="/" className="font-bold text-blue-700 text-sm mr-4 hover:text-blue-900">
          NIS2 PT
        </NavLink>
        <NavLink to="/scan/start"    className={({ isActive }) => isActive ? active : inactive}>Novo scan</NavLink>
        <NavLink to="/scan/history"  className={({ isActive }) => isActive ? active : inactive}>Histórico</NavLink>
        <NavLink to="/questionnaire" className={({ isActive }) => isActive ? active : inactive}>Questionário</NavLink>
        <NavLink to="/remediation"   className={({ isActive }) => isActive ? active : inactive}>Remediação</NavLink>
        <NavLink to="/course"        className={({ isActive }) => isActive ? active : inactive}>Curso</NavLink>
        <NavLink to="/billing"       className={({ isActive }) => isActive ? active : inactive}>Planos</NavLink>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400 hidden sm:block">{user?.email}</span>
          <button
            onClick={() => logout().then(() => window.location.href = "/")}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
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
    <div className="min-h-screen bg-gray-50">
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
          <Route path="/questionnaire"            element={<Questionnaire />} />
          <Route path="/questionnaire/:sessionId" element={<Questionnaire />} />
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
