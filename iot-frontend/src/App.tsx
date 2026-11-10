import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './components/RequireAuth';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AlertsPage from './pages/AlertsPage';
import UsersPage from './pages/UsersPage';
import HistoryPage from './pages/HistoryPage';
import EnergyPage from './pages/EnergyPage';
import DevicesPage from './pages/DevicesPage';
import CommandsPage from './pages/CommandsPage';
import RulesPage from './pages/RulesPage';
import AuditPage from './pages/AuditPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="energy" element={<EnergyPage />} />
          <Route path="commands" element={<CommandsPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="rules" element={<RulesPage />} />
          {/* Nhật ký: Admin và Operator (Viewer bị chặn) */}
          <Route element={<RequireAuth roles={['ADMIN', 'OPERATOR']} />}>
            <Route path="audit" element={<AuditPage />} />
          </Route>
          {/* Trang chỉ dành cho Admin */}
          <Route element={<RequireAuth roles={['ADMIN']} />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
