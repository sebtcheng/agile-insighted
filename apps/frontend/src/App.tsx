import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./auth";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { OstPage } from "./pages/OstPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { ProjectPage } from "./pages/ProjectPage";
import { KanoPage } from "./pages/KanoPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RaidPage } from "./pages/RaidPage";
import { StoryMapPage } from "./pages/StoryMapPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SprintPage } from "./pages/SprintPage";
import { WorkloadPage } from "./pages/WorkloadPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <AuthGate>
            <Layout />
          </AuthGate>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        <Route path="workload" element={<WorkloadPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="projects/:projectId/sprints/:sprintId" element={<SprintPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="ost" element={<OstPage />} />
        <Route path="usm" element={<StoryMapPage />} />
        <Route path="kano" element={<KanoPage />} />
        <Route path="raid" element={<RaidPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
