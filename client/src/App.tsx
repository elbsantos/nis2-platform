import { Routes, Route, Navigate } from "react-router-dom";
import ScanStart from "./pages/ScanStart";
import ScanResults from "./pages/ScanResults";
import ScanHistory from "./pages/ScanHistory";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/"                       element={<Navigate to="/scan/start" replace />} />
        <Route path="/scan/start"             element={<ScanStart />} />
        <Route path="/scan/results/:scanId"   element={<ScanResults />} />
        <Route path="/scan/history"           element={<ScanHistory />} />
        <Route path="*"                       element={<Navigate to="/scan/start" replace />} />
      </Routes>
    </div>
  );
}
