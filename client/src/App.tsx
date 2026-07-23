import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, type SessionUser } from './auth';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/Admin';
import { AdminClientsPage } from './pages/AdminClients';
import { AdminUserDetailPage } from './pages/AdminUserDetail';
import { ClientPage } from './pages/Client';
import { DashboardPage } from './pages/Dashboard';
import { HomePage } from './pages/Home';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { TestimonialsPage } from './pages/Testimonials';

export function homeFor(role: SessionUser['role']): string {
  if (role === 'client') return '/client';
  if (role === 'admin' || role === 'support') return '/admin';
  return '/dashboard';
}

function RequireAuth({
  children,
  allow,
}: {
  children: JSX.Element;
  allow?: SessionUser['role'][];
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (allow && !allow.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/testimonials" element={<TestimonialsPage />} />
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
          path="/client"
          element={
            <RequireAuth allow={['client']}>
              <ClientPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth allow={['admin', 'support']}>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/clients"
          element={
            <RequireAuth allow={['admin']}>
              <AdminClientsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <RequireAuth allow={['admin', 'support']}>
              <AdminUserDetailPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
