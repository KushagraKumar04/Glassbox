import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/layouts/AppShell";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { ForgotPasswordPage } from "@/features/auth/pages/ForgotPasswordPage";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { ResetPasswordPage } from "@/features/auth/pages/ResetPasswordPage";
import { HomePage } from "@/features/chat/pages/HomePage";
import { WorkspacePage } from "@/features/chat/pages/WorkspacePage";
import { DataSourcesPage } from "@/features/datasets/pages/DataSourcesPage";
import { HistoryPage } from "@/features/history/pages/HistoryPage";
import { RunDetailPage } from "@/features/history/pages/RunDetailPage";
import { LandingPage } from "@/features/landing/pages/LandingPage";
import { MetricsPage } from "@/features/metrics/pages/MetricsPage";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { TemplatesPage } from "@/features/templates/pages/TemplatesPage";

export function Router() {
  return (
    <Routes>
      {/* ── Public: standalone landing page ───────────────── */}
      <Route path="/" element={<LandingPage />} />

      {/* ── Public: auth ──────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* ── Protected: the app shell ──────────────────────── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/sources" element={<DataSourcesPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<RunDetailPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="/app" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}