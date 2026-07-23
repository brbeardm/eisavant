import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';

interface ProfileData {
  email: string;
  role: string;
  status: string;
  first_name: string;
  last_name: string;
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
  referral_source: string;
  cv_filename: string | null;
  has_photo: boolean;
  selected_plan: string | null;
}

const STATUS_COPY: Record<string, string> = {
  pending_payment: 'Enrollment pending — our team will contact you to complete payment.',
  active: 'Your membership is active.',
  suspended: 'Your account is suspended. Contact support.',
};

export function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);

  const load = () => api.get('/api/profile').then(setProfile).catch(() => setProfile(null));
  useEffect(() => {
    void load();
  }, []);

  const set = (name: keyof ProfileData) => (e: { target: { value: string } }) =>
    setProfile((p) => (p ? { ...p, [name]: e.target.value } : p));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.put('/api/profile', {
        firstName: profile.first_name,
        lastName: profile.last_name,
        title: profile.title,
        company: profile.company,
        industry: profile.industry,
        companySize: profile.company_size,
        country: profile.country,
        phone: profile.phone,
        linkedinUrl: profile.linkedin_url,
        website: profile.website,
        bio: profile.bio,
        coachingGoals: profile.coaching_goals,
      });
      setNotice({ kind: 'success', text: 'Profile saved.' });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Save failed — please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (endpoint: 'cv' | 'photo', file: File) => {
    setBusy(true);
    setNotice(null);
    try {
      const data = new FormData();
      data.append('file', file);
      await api.putForm(`/api/profile/${endpoint}`, data);
      setNotice({ kind: 'success', text: `${endpoint === 'cv' ? 'CV' : 'Photo'} uploaded.` });
      setPhotoVersion((v) => v + 1);
      await load();
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Upload failed — please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!profile) return <div className="loading">Loading your profile…</div>;

  return (
    <div className="page">
      <div className="container form-shell">
        <div className="page-head">
          <div>
            <div className="eyebrow">Member profile</div>
            <h2>
              {profile.first_name} {profile.last_name}
            </h2>
            <span className={`badge badge-${profile.status}`}>{profile.status.replace('_', ' ')}</span>{' '}
            <span className={`badge badge-${profile.role}`}>{profile.role}</span>
          </div>
          {profile.has_photo && (
            <span className="avatar" style={{ width: 84, height: 84 }}>
              <img src={`/api/profile/photo?v=${photoVersion}`} alt="Profile" />
            </span>
          )}
        </div>

        <div className="alert alert-info">{STATUS_COPY[profile.status] ?? profile.status}</div>
        {notice && <div className={`alert alert-${notice.kind === 'success' ? 'success' : 'error'}`}>{notice.text}</div>}

        <form className="card" onSubmit={save}>
          <h3>Profile details</h3>
          <div className="form-grid">
            <label className="field">First name<input value={profile.first_name ?? ''} onChange={set('first_name')} /></label>
            <label className="field">Last name<input value={profile.last_name ?? ''} onChange={set('last_name')} /></label>
            <label className="field">Title<input value={profile.title ?? ''} onChange={set('title')} /></label>
            <label className="field">Company<input value={profile.company ?? ''} onChange={set('company')} /></label>
            <label className="field">Industry<input value={profile.industry ?? ''} onChange={set('industry')} /></label>
            <label className="field">Company size<input value={profile.company_size ?? ''} onChange={set('company_size')} /></label>
            <label className="field">Country<input value={profile.country ?? ''} onChange={set('country')} /></label>
            <label className="field">Phone<input value={profile.phone ?? ''} onChange={set('phone')} /></label>
            <label className="field">LinkedIn<input value={profile.linkedin_url ?? ''} onChange={set('linkedin_url')} /></label>
            <label className="field">Website<input value={profile.website ?? ''} onChange={set('website')} /></label>
            <label className="field full">Bio<textarea value={profile.bio ?? ''} onChange={set('bio')} /></label>
            <label className="field full">Coaching goals<textarea value={profile.coaching_goals ?? ''} onChange={set('coaching_goals')} /></label>
          </div>
          <button type="submit" className="btn btn-gold mt-3" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <div className="card mt-3">
          <h3>Documents</h3>
          <div className="form-grid">
            <label className="field">
              CV / résumé
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => e.target.files?.[0] && uploadFile('cv', e.target.files[0])}
              />
              <div className="hint">
                {profile.cv_filename ? (
                  <>On file: <a href="/api/profile/cv">{profile.cv_filename}</a></>
                ) : (
                  'No CV uploaded yet.'
                )}
              </div>
            </label>
            <label className="field">
              Profile photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => e.target.files?.[0] && uploadFile('photo', e.target.files[0])}
              />
              <div className="hint">{profile.has_photo ? 'Photo on file.' : 'No photo uploaded yet.'}</div>
            </label>
          </div>
        </div>

        {user?.role === 'ceo' && (
          <div className="card mt-3">
            <h3>Membership</h3>
            <p className="muted">
              {profile.selected_plan
                ? `Selected plan: ${profile.selected_plan === 'one_time' ? 'Executive Intensive (one-time)' : 'Ongoing Mentorship (monthly)'} — payment processing is in preview, so our team will reach out to complete enrollment.`
                : 'No plan selected yet. You can choose one from the registration flow or wait for our team to contact you.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
