import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useSyncStore } from './store/syncStore';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeDetailPage from './pages/EmployeeDetailPage';
import TransfersPage from './pages/TransfersPage';
import PerformancePage from './pages/PerformancePage';
import TrainingPage from './pages/TrainingPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import CampusesPage from './pages/CampusesPage';
import StaffGapsPage from './pages/StaffGapsPage';
import EmployeeFormPage from './pages/EmployeeFormPage';
import Layout from './components/Layout';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { setUser } = useAuthStore();
  const { setSyncStatus } = useSyncStore();
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    // Restore session on startup
    window.sakAPI.auth.getSession().then((session) => {
      if (session) {
        const user = (session as any)._user ?? {
          id: session.userId, username: session.username,
          email: '', role: { slug: session.roleSlug, name: '' },
        };
        setUser(user, session.permissions);
      }
      setInitialised(true);
    });

    // Listen for sync status updates from Electron main
    window.sakAPI.sync.onStatusChange((status) => {
      setSyncStatus(status as Parameters<typeof setSyncStatus>[0]);
    });

    // Auto-sync every 5 minutes
    const interval = setInterval(() => {
      window.sakAPI.sync.trigger();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [setUser, setSyncStatus]);

  if (!initialised) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="employees/new" element={<EmployeeFormPage />} />
          <Route path="employees/:id" element={<EmployeeDetailPage />} />
          <Route path="employees/:id/edit" element={<EmployeeFormPage />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="performance" element={<PerformancePage />} />
          <Route path="training" element={<TrainingPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="campuses" element={<CampusesPage />} />
          <Route path="staff-gaps" element={<StaffGapsPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
