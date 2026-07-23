import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <>
      <header className="site-header">
        <div className="container nav">
          <Link to="/" className="brand">
            Eisa<span>vant</span>
          </Link>
          <nav className="nav-links">
            <Link to="/#testimonials">Testimonials</Link>
            <Link to="/#program">The Program</Link>
            {user ? (
              <>
                <Link to="/dashboard">My Profile</Link>
                {(user.role === 'admin' || user.role === 'support') && (
                  <Link to="/admin">Members</Link>
                )}
                <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Sign in</Link>
                <Link to="/register" className="btn btn-gold btn-sm">
                  Apply now
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="container">
          <div>© {new Date().getFullYear()} Eisavant — eisavant.com</div>
          <div>Executive coaching &amp; mentoring for CEOs, by CEOs.</div>
        </div>
      </footer>
    </>
  );
}
