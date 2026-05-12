import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminSettingsProvider } from '@/context/AdminSettingsContext';
import { AppShell } from '@/components/AppShell';
import { AdminDashboardPage } from '@/app/AdminDashboardPage';
import { LogsViewerPage } from '@/app/LogsViewerPage';

export default function App() {
  return (
    <AdminSettingsProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="logs" element={<LogsViewerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AdminSettingsProvider>
  );
}
