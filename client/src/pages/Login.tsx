import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api';
import { homeFor } from '../App';
import { useAuth } from '../auth';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post('/api/auth/login', { email, password });
      await refresh();
      navigate(location.state?.from ?? homeFor(result.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 440 }}>
        <div className="eyebrow">Members</div>
        <h2>Sign in</h2>
        <form className="card mt-2" onSubmit={submit}>
          {error && <div className="alert alert-error">{error}</div>}
          <label className="field">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="field mt-2">
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <button type="submit" className="btn btn-gold btn-block mt-3" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="center muted mt-2" style={{ fontSize: '0.9rem' }}>
            New to Eisavant? <Link to="/register">Apply for membership</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
