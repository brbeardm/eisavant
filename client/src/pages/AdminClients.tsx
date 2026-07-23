import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api';

interface Company {
  id: string;
  name: string;
  contact_email: string;
  position_count: number;
  user_count: number;
}

interface Candidate {
  id: string;
  candidate_user_id: string;
  disclosure_level: string;
  stage: string;
  summary: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

interface Position {
  id: string;
  title: string;
  status: string;
  client_company_id: string;
  company_name: string;
  candidates: Candidate[];
}

interface MemberOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
}

const DISCLOSURES = ['anonymous', 'identified', 'full'];
const STAGES = ['sourced', 'screening', 'interviewing', 'finalist', 'placed'];

export function AdminClientsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [posCompany, setPosCompany] = useState('');
  const [posTitle, setPosTitle] = useState('');
  const [posDescription, setPosDescription] = useState('');
  const [assignPosition, setAssignPosition] = useState('');
  const [assignMember, setAssignMember] = useState('');
  const [assignDisclosure, setAssignDisclosure] = useState('anonymous');
  const [assignSummary, setAssignSummary] = useState('');

  const load = async () => {
    const [c, p, u] = await Promise.all([
      api.get('/api/admin/companies'),
      api.get('/api/admin/positions'),
      api.get('/api/admin/users'),
    ]);
    setCompanies(c);
    setPositions(p);
    setMembers((u as MemberOption[]).filter((m) => m.role === 'ceo'));
  };
  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ kind: 'success', text: success });
      await load();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Request failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="container form-shell">
        <p><Link to="/admin">← All members</Link></p>
        <div className="eyebrow">Administration</div>
        <h2>Clients &amp; Positions</h2>
        {notice && <div className={`alert alert-${notice.kind === 'success' ? 'success' : 'error'}`}>{notice.text}</div>}

        <div className="card mt-2">
          <h3>Client companies</h3>
          {companies.length > 0 && (
            <table className="data">
              <thead>
                <tr><th>Name</th><th>Contact</th><th>Positions</th><th>Portal users</th></tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.contact_email || '—'}</td>
                    <td>{c.position_count}</td>
                    <td>{c.user_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="form-grid mt-2">
            <label className="field">
              Company name
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </label>
            <label className="field">
              Contact email
              <input value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
            </label>
          </div>
          <button
            className="btn btn-outline-dark btn-sm mt-2"
            disabled={busy || !companyName.trim()}
            onClick={() =>
              run(
                () => api.post('/api/admin/companies', { name: companyName, contactEmail: companyEmail }),
                'Company created.',
              ).then(() => {
                setCompanyName('');
                setCompanyEmail('');
              })
            }
          >
            Add company
          </button>
          <p className="hint mt-1">
            To give a company portal access: open a member on the Members page, set their role
            to <strong>client</strong>, and assign this company.
          </p>
        </div>

        <div className="card mt-3">
          <h3>Open positions</h3>
          {positions.map((p) => (
            <div key={p.id} style={{ borderTop: '1px solid var(--line)', padding: '0.9rem 0' }}>
              <div className="row spread">
                <strong>{p.title}</strong>
                <span className="muted">{p.company_name}</span>
              </div>
              {p.candidates.length === 0 ? (
                <p className="hint">No candidates assigned.</p>
              ) : (
                p.candidates.map((c) => (
                  <div key={c.id} className="row spread mt-1" style={{ fontSize: '0.9rem' }}>
                    <span>
                      {c.first_name} {c.last_name} <span className="muted">({c.company || '—'})</span>
                    </span>
                    <span className="row" style={{ gap: '0.4rem' }}>
                      <select
                        value={c.stage}
                        disabled={busy}
                        onChange={(e) =>
                          run(
                            () => api.patch(`/api/admin/candidates/${c.id}`, { stage: e.target.value }),
                            'Stage updated.',
                          )
                        }
                      >
                        {STAGES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                      <select
                        value={c.disclosure_level}
                        disabled={busy}
                        onChange={(e) =>
                          run(
                            () => api.patch(`/api/admin/candidates/${c.id}`, { disclosureLevel: e.target.value }),
                            'Disclosure updated.',
                          )
                        }
                      >
                        {DISCLOSURES.map((d) => <option key={d}>{d}</option>)}
                      </select>
                    </span>
                  </div>
                ))
              )}
            </div>
          ))}
          <div className="form-grid mt-2">
            <label className="field">
              Company
              <select value={posCompany} onChange={(e) => setPosCompany(e.target.value)}>
                <option value="">Select…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field">
              Position title
              <input value={posTitle} onChange={(e) => setPosTitle(e.target.value)} placeholder="Chief Executive Officer" />
            </label>
            <label className="field full">
              Description
              <textarea value={posDescription} onChange={(e) => setPosDescription(e.target.value)} />
            </label>
          </div>
          <button
            className="btn btn-outline-dark btn-sm mt-2"
            disabled={busy || !posCompany || !posTitle.trim()}
            onClick={() =>
              run(
                () =>
                  api.post('/api/admin/positions', {
                    clientCompanyId: posCompany,
                    title: posTitle,
                    description: posDescription,
                  }),
                'Position created.',
              ).then(() => {
                setPosTitle('');
                setPosDescription('');
              })
            }
          >
            Add position
          </button>
        </div>

        <div className="card mt-3">
          <h3>Assign a candidate</h3>
          <p className="hint">
            Candidates start <strong>anonymous</strong>: the client sees only your summary.
            Raise disclosure to <strong>identified</strong> (name + profile) or{' '}
            <strong>full</strong> (adds CV) as the search advances.
          </p>
          <div className="form-grid">
            <label className="field">
              Position
              <select value={assignPosition} onChange={(e) => setAssignPosition(e.target.value)}>
                <option value="">Select…</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.company_name} — {p.title}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Member
              <select value={assignMember} onChange={(e) => setAssignMember(e.target.value)}>
                <option value="">Select…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.first_name} {m.last_name} ({m.email})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Initial disclosure
              <select value={assignDisclosure} onChange={(e) => setAssignDisclosure(e.target.value)}>
                {DISCLOSURES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <label className="field full">
              Anonymous summary (what the client sees before disclosure)
              <textarea
                value={assignSummary}
                onChange={(e) => setAssignSummary(e.target.value)}
                placeholder="Sitting CEO of a $200M logistics firm; 15 years operating experience…"
              />
            </label>
          </div>
          <button
            className="btn btn-gold btn-sm mt-2"
            disabled={busy || !assignPosition || !assignMember}
            onClick={() =>
              run(
                () =>
                  api.post(`/api/admin/positions/${assignPosition}/candidates`, {
                    candidateUserId: assignMember,
                    disclosureLevel: assignDisclosure,
                    summary: assignSummary,
                  }),
                'Candidate assigned.',
              ).then(() => {
                setAssignMember('');
                setAssignSummary('');
              })
            }
          >
            Assign candidate
          </button>
        </div>
      </div>
    </div>
  );
}
