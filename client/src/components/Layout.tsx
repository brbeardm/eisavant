import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Avatar } from './Avatar';

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!user) return null;
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-chip"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={displayName} src={user.has_photo ? '/api/profile/photo' : null} size={34} />
        <span className="user-chip-name">{displayName}</span>
        <span className={`caret ${open ? 'caret-up' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="dropdown" role="menu">
          <Link to="/dashboard" role="menuitem" onClick={() => setOpen(false)}>
            My Profile
          </Link>
          {user.role === 'client' && (
            <Link to="/client" role="menuitem" onClick={() => setOpen(false)}>
              Client Portal
            </Link>
          )}
          {(user.role === 'admin' || user.role === 'support') && (
            <Link to="/admin" role="menuitem" onClick={() => setOpen(false)}>
              Members
            </Link>
          )}
          {user.role === 'admin' && (
            <Link to="/admin/clients" role="menuitem" onClick={() => setOpen(false)}>
              Clients &amp; Positions
            </Link>
          )}
          <hr />
          <button role="menuitem" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <>
      <header className="site-header">
        <div className="container nav">
          <Link to="/" className="brand">
            Ei<span>savant</span>
          </Link>
          <nav className="nav-links">
            <Link to="/testimonials">Testimonials</Link>
            <Link to="/#program">The Program</Link>
            {user ? (
              <UserMenu />
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
