import { useEffect, useState } from 'react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';

interface SlateCandidate {
  id: string;
  disclosure_level: 'anonymous' | 'identified' | 'full';
  stage: string;
  summary: string;
  identified: boolean;
  name: string | null;
  title: string | null;
  company: string | null;
  industry: string | null;
  country: string | null;
  bio: string | null;
  linkedin_url: string | null;
  has_cv: boolean;
}

interface Position {
  id: string;
  title: string;
  description: string;
  status: string;
  company_name: string;
  candidates: SlateCandidate[];
}

export function ClientPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get('/api/client/positions')
      .then(setPositions)
      .catch(() => setPositions([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="loading">Loading your positions…</div>;

  return (
    <div className="page">
      <div className="container">
        <div className="eyebrow">Client portal</div>
        <h2>{positions[0]?.company_name ?? 'Your'} open positions</h2>
        <p className="muted">
          Candidate identities are disclosed progressively as the search advances. Contact
          your Eisavant partner to request expanded disclosure on any candidate.
        </p>

        {positions.length === 0 && (
          <div className="card mt-3">
            <p className="muted" style={{ margin: 0 }}>
              No open positions yet. Your Eisavant partner will publish them here.
            </p>
          </div>
        )}

        {positions.map((p) => (
          <div className="card mt-3" key={p.id}>
            <div className="row spread">
              <h3 style={{ margin: 0 }}>{p.title}</h3>
              <span className={`badge badge-${p.status === 'open' ? 'active' : 'pending_payment'}`}>
                {p.status.replace('_', ' ')}
              </span>
            </div>
            {p.description && <p className="muted mt-1">{p.description}</p>}

            {p.candidates.length === 0 ? (
              <p className="muted">Candidate slate in progress.</p>
            ) : (
              p.candidates.map((c) => (
                <div key={c.id} className="slate-candidate">
                  <Avatar name={c.identified && c.name ? c.name : '? ?'} size={46} />
                  <div style={{ flex: 1 }}>
                    <div className="row spread">
                      <strong>{c.identified ? c.name : 'Confidential Candidate'}</strong>
                      <span className="row" style={{ gap: '0.4rem' }}>
                        <span className={`badge badge-stage`}>{c.stage}</span>
                        <span className={`badge badge-${c.disclosure_level}`}>{c.disclosure_level}</span>
                      </span>
                    </div>
                    {c.identified && (
                      <small className="muted">
                        {[c.title, c.company, c.country].filter(Boolean).join(' · ')}
                      </small>
                    )}
                    {c.summary && <p style={{ margin: '0.4rem 0 0' }}>{c.summary}</p>}
                    <div className="row mt-1" style={{ gap: '1rem' }}>
                      {c.identified && c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer">
                          LinkedIn
                        </a>
                      )}
                      {c.has_cv && (
                        <a href={`/api/client/candidates/${c.id}/cv`}>Download CV</a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
