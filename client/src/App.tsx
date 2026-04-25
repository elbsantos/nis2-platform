import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import ScanStart       from "./pages/ScanStart";
import ScanResults     from "./pages/ScanResults";
import ScanHistory     from "./pages/ScanHistory";
import Questionnaire   from "./pages/Questionnaire";
import Remediation     from "./pages/Remediation";
import Billing         from "./pages/Billing";
import Course          from "./pages/Course";
import Lesson          from "./pages/Lesson";

function Nav() {
  const base = "px-3 py-2 text-sm font-medium rounded-md transition-colors";
  const active   = `${base} bg-blue-700 text-white`;
  const inactive = `${base} text-gray-600 hover:bg-gray-100`;

  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="max-w-5xl mx-auto flex items-center gap-1 h-12">
        <span className="font-bold text-blue-700 text-sm mr-4">NIS2 PT</span>
        <NavLink to="/scan/start"   className={({ isActive }) => isActive ? active : inactive}>Novo scan</NavLink>
        <NavLink to="/scan/history" className={({ isActive }) => isActive ? active : inactive}>Histórico</NavLink>
        <NavLink to="/questionnaire" className={({ isActive }) => isActive ? active : inactive}>Questionário</NavLink>
        <NavLink to="/remediation"   className={({ isActive }) => isActive ? active : inactive}>Remediação</NavLink>
        <NavLink to="/course"         className={({ isActive }) => isActive ? active : inactive}>Curso</NavLink>
        <NavLink to="/billing"       className={({ isActive }) => isActive ? active : inactive}>Planos</NavLink>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <Routes>
        <Route path="/"                              element={<Navigate to="/scan/start" replace />} />
        <Route path="/scan/start"                    element={<ScanStart />} />
        <Route path="/scan/results/:scanId"          element={<ScanResults />} />
        <Route path="/scan/history"                  element={<ScanHistory />} />
        <Route path="/questionnaire"                 element={<Questionnaire />} />
        <Route path="/questionnaire/:sessionId"      element={<Questionnaire />} />
        <Route path="/remediation"                   element={<Remediation />} />
        <Route path="/billing"                       element={<Billing />} />
        <Route path="*"                              element={<Navigate to="/scan/start" replace />} />
      </Routes>
    </div>
  );
}
