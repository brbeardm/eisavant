import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';

interface Detail {
  id: string;
  email: string;
  role: 'ceo' | 'support' | 'admin';
  status: 'pending_payment' | 'active' | 'suspended';
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  title: string;
  company: string;
  industry: string;
  company_size: string;
  country: string;
  phone: string;
  linkedin_url: string;
  website: string;
  bio: string;
  coaching_goals: string;
  cv_filename: string | null;
  notes: { id: string; note: string; created_at: string; author_first_name: string | null; author_last_name: string | null }[];
  payments: { id: string; plan: string; amount_cents: number; currency: string; status: string; created_at: string }[];
}

export function AdminUserDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/api/admin/users/${id}`).then(setDetail).catch(() => setDetail(null));
  useEffect(() => {
    void load();
  }, [id]);

  const patch = async (updates: { role?: string; status?: string }) => {
    setBusy(true);
    setNotice(null);
    try {
      await api.patch(`/api/admin/users/${id}`, updates);
      setNotice({ kind: 'success', text: 'Account updated.' });
      await load();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Update failed.' });
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/users/${id}/notes`, { note });
      setNote('');
      await load();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not add note.' });
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return <div className="loading">Loading member…</div>;

  const money = (cents: number) =>
    (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="page">
      <div className="container form-shell">
        <p><Link to="/admin">← All members</Link></p>
        <div className="page-head">
          <div>
            <div className="eyebrow">Member</div>
            <h2>{detail.first_name} {detail.last_name}</h2>
            <span className={`badge badge-${detail.role}`}>{detail.role}</span>{' '}
            <span className={`badge badge-${detail.status}`}>{detail.status.replace('_', ' ')}</span>
          </div>
        </div>

        {notice && <div className={`alert alert-${notice.kind === 'success' ? 'success' : 'error'}`}>{notice.text}</div>}

        <div className="card">
          <h3>Profile</h3>
          <div className="form-grid" style={{ fontSize: '0.93rem' }}>
            <div><strong>Email:</strong> {detail.email}</div>
            <div><strong>Phone:</strong> {detail.phone || '—'}</div>
            <div><strong>Title:</strong> {detail.title || '—'}</div>
            <div><strong>Company:</strong> {detail.company || '—'}</div>
            <div><strong>Industry:</strong> {detail.industry || '—'}</div>
            <div><strong>Size:</strong> {detail.company_size || '—'}</div>
            <div><strong>Country:</strong> {detail.country || '—'}</div>
            <div>
              <strong>CV:</strong>{' '}
              {detail.cv_filename ? <a href={`/api/admin/users/${detail.id}/cv`}>{detail.cv_filename}</a> : '—'}
            </div>
            <div className="full"><strong>Bio:</strong> {detail.bio || '—'}</div>
            <div className="full"><strong>Coaching goals:</strong> {detail.coaching_goals || '—'}</div>
          </div>
        </div>

        {isAdmin && (
          <div className="card mt-3">
            <h3>Account controls (admin)</h3>
            <div className="row">
              <label className="field">
                Role
                <select value={detail.role} disabled={busy} onChange={(e) => patch({ role: e.target.value })}>
                  <option value="ceo">ceo</option>
                  <option value="support">support</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label className="field">
                Status
                <select value={detail.status} disabled={busy} onChange={(e) => patch({ status: e.target.value })}>
                  <option value="pending_payment">pending_payment</option>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                </select>
              </label>
            </div>
          </div>
        )}

        <div className="card mt-3">
          <h3>Payments (stub records)</h3>
          {detail.payments.length === 0 ? (
            <p className="muted">No plan selected yet.</p>
          ) : (
            <table className="data">
              <thead>
                <tr><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                {detail.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.plan}</td>
                    <td>{money(p.amount_cents)}</td>
                    <td>{p.status}</td>
                    <td>{new Date(p.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card mt-3">
          <h3>Support notes</h3>
          <label className="field">
            Add a note
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal — members never see these." />
          </label>
          <button className="btn btn-outline-dark btn-sm mt-1" onClick={addNote} disabled={busy || !note.trim()}>
            Add note
          </button>
          <div className="mt-2">
            {detail.notes.map((n) => (
              <div key={n.id} style={{ borderTop: '1px solid var(--line)', padding: '0.6rem 0' }}>
                <small className="muted">
                  {n.author_first_name} {n.author_last_name} — {new Date(n.created_at).toLocaleString()}
                </small>
                <div>{n.note}</div>
              </div>
            ))}
            {detail.notes.length === 0 && <p className="muted">No notes yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
