import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

interface MemberRow {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  industry: string | null;
  country: string | null;
}

export function AdminPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get('/api/admin/users')
      .then(setMembers)
      .finally(() => setLoaded(true));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? members.filter((m) =>
        [m.email, m.first_name, m.last_name, m.company, m.industry, m.country]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : members;

  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <div>
            <div className="eyebrow">{user?.role === 'admin' ? 'Administration' : 'Support'}</div>
            <h2>Members</h2>
          </div>
          <label className="field" style={{ minWidth: 260 }}>
            Search
            <input
              placeholder="Name, email, company…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Company</th>
                <th>Country</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/admin/users/${m.id}`}>
                      {m.first_name ?? '—'} {m.last_name ?? ''}
                    </Link>
                  </td>
                  <td>{m.email}</td>
                  <td>{m.company || '—'}</td>
                  <td>{m.country || '—'}</td>
                  <td><span className={`badge badge-${m.role}`}>{m.role}</span></td>
                  <td><span className={`badge badge-${m.status}`}>{m.status.replace('_', ' ')}</span></td>
                  <td>{new Date(m.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {loaded && filtered.length === 0 && (
                <tr><td colSpan={7} className="muted">No members found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
