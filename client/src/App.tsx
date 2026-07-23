import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/Admin';
import { AdminUserDetailPage } from './pages/AdminUserDetail';
import { DashboardPage } from './pages/Dashboard';
import { HomePage } from './pages/Home';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';

function RequireAuth({ children, staffOnly = false }: { children: JSX.Element; staffOnly?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (staffOnly && user.role === 'ceo') return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth staffOnly>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <RequireAuth staffOnly>
              <AdminUserDetailPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
