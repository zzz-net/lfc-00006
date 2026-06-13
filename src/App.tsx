import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "@/components/ToastProvider";
import DashboardPage from "@/pages/DashboardPage";
import ImportPage from "@/pages/ImportPage";
import RulesPage from "@/pages/RulesPage";
import ReviewPage from "@/pages/ReviewPage";
import SnapshotsPage from "@/pages/SnapshotsPage";
import ExportPage from "@/pages/ExportPage";
import ReviewPackagesPage from "@/pages/ReviewPackagesPage";
import ReviewPackageCreatePage from "@/pages/ReviewPackageCreatePage";
import ReviewPackageDetailPage from "@/pages/ReviewPackageDetailPage";
import HandoverPackagesPage from "@/pages/HandoverPackagesPage";
import HandoverPackageCreatePage from "@/pages/HandoverPackageCreatePage";
import HandoverPackageDetailPage from "@/pages/HandoverPackageDetailPage";

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
          <Route path="/review-packages" element={<ReviewPackagesPage />} />
          <Route path="/review-packages/create" element={<ReviewPackageCreatePage />} />
          <Route path="/review-packages/:id" element={<ReviewPackageDetailPage />} />
          <Route path="/handover-packages" element={<HandoverPackagesPage />} />
          <Route path="/handover-packages/create" element={<HandoverPackageCreatePage />} />
          <Route path="/handover-packages/:id" element={<HandoverPackageDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}
