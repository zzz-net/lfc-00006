import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "@/components/ToastProvider";
import DashboardPage from "@/pages/DashboardPage";
import ImportPage from "@/pages/ImportPage";
import RulesPage from "@/pages/RulesPage";
import ReviewPage from "@/pages/ReviewPage";
import SnapshotsPage from "@/pages/SnapshotsPage";
import ExportPage from "@/pages/ExportPage";

export default function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/snapshots" element={<SnapshotsPage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}
