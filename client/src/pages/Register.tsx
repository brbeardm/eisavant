import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';

const INDUSTRIES = [
  'Technology', 'Financial Services', 'Healthcare', 'Manufacturing', 'Retail & Consumer',
  'Energy', 'Logistics & Transportation', 'Media & Entertainment', 'Professional Services',
  'Real Estate', 'Non-profit', 'Other',
];

const COMPANY_SIZES = ['1–10', '11–50', '51–200', '201–1,000', '1,001–5,000', '5,000+'];

interface Plan {
  id: 'one_time' | 'subscription';
  label: string;
  amountCents: number;
}

const STEPS = ['Account', 'Executive Profile', 'Documents', 'Membership'];

export function RegisterPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    firstName: '', lastName: '', title: '', company: '', industry: '',
    companySize: '', country: '', phone: '', linkedinUrl: '', website: '',
    bio: '', coachingGoals: '', referralSource: '',
  });
  const [cv, setCv] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan['id'] | null>(null);
  const [stubNotice, setStubNotice] = useState<string | null>(null);

  const set = (name: string) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [name]: e.target.value }));

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!form.email || !form.password) return 'Email and password are required.';
      if (form.password.length < 10) return 'Password must be at least 10 characters.';
      if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/[0-9]/.test(form.password))
        return 'Password must include upper case, lower case, and a digit.';
      if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    }
    if (step === 1) {
      if (!form.firstName.trim() || !form.lastName.trim())
        return 'First and last name are required.';
    }
    return null;
  };

  const next = () => {
    const problem = validateStep();
    if (problem) return setError(problem);
    setError(null);
    setStep((s) => s + 1);
  };

  // Step 3 → create the account (multipart: fields + CV + photo), sign the
  // member in via the auth cookie, then load plans for the membership step.
  const submitRegistration = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const data = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (key !== 'confirmPassword') data.append(key, value);
      }
      if (cv) data.append('cv', cv);
      if (photo) data.append('photo', photo);
      await api.postForm('/api/auth/register', data);
      await refresh();
      setPlans(await api.get('/api/payments/plans'));
      setStep(3);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details) {
          setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        }
      } else {
        setError('Something went wrong — please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  // PAYMENT STUB — records the selected plan, then intentionally stops.
  // No card fields, no processor call; the returned notice explains that.
  const handlePay = async () => {
    if (!selectedPlan) return setError('Please choose a membership plan.');
    setBusy(true);
    setError(null);
    try {
      const result = await api.post('/api/payments/intent', { plan: selectedPlan });
      setStubNotice(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  };

  const money = (cents: number) =>
    (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="page">
      <div className="container form-shell">
        <div className="eyebrow">Membership application</div>
        <h2>Join Eisavant</h2>
        <p className="muted">
          Already a member? <Link to="/login">Sign in</Link>
        </p>

        <div className="steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              {i + 1}. {label}
            </div>
          ))}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {step === 0 && (
          <div className="card">
            <h3>Your account</h3>
            <div className="form-grid">
              <label className="field full">
                Work email <span className="req">*</span>
                <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
                {fieldErrors.email && <div className="error-text">{fieldErrors.email}</div>}
              </label>
              <label className="field">
                Password <span className="req">*</span>
                <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
                <div className="hint">10+ characters with upper, lower, and a digit.</div>
                {fieldErrors.password && <div className="error-text">{fieldErrors.password}</div>}
              </label>
              <label className="field">
                Confirm password <span className="req">*</span>
                <input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
              </label>
            </div>
            <div className="row spread mt-3">
              <span />
              <button className="btn btn-gold" onClick={next}>Continue</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="card">
            <h3>Executive profile</h3>
            <div className="form-grid">
              <label className="field">
                First name <span className="req">*</span>
                <input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
              </label>
              <label className="field">
                Last name <span className="req">*</span>
                <input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
              </label>
              <label className="field">
                Title
                <input value={form.title} onChange={set('title')} placeholder="Chief Executive Officer" />
              </label>
              <label className="field">
                Company
                <input value={form.company} onChange={set('company')} autoComplete="organization" />
              </label>
              <label className="field">
                Industry
                <select value={form.industry} onChange={set('industry')}>
                  <option value="">Select…</option>
                  {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                </select>
              </label>
              <label className="field">
                Company size
                <select value={form.companySize} onChange={set('companySize')}>
                  <option value="">Select…</option>
                  {COMPANY_SIZES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="field">
                Country
                <input value={form.country} onChange={set('country')} autoComplete="country-name" />
              </label>
              <label className="field">
                Phone
                <input value={form.phone} onChange={set('phone')} autoComplete="tel" />
              </label>
              <label className="field">
                LinkedIn URL
                <input value={form.linkedinUrl} onChange={set('linkedinUrl')} placeholder="https://linkedin.com/in/…" />
                {fieldErrors.linkedinUrl && <div className="error-text">{fieldErrors.linkedinUrl}</div>}
              </label>
              <label className="field">
                Company website
                <input value={form.website} onChange={set('website')} placeholder="https://…" />
                {fieldErrors.website && <div className="error-text">{fieldErrors.website}</div>}
              </label>
              <label className="field full">
                Bio
                <textarea value={form.bio} onChange={set('bio')} placeholder="A short professional biography…" />
              </label>
              <label className="field full">
                What do you want from coaching?
                <textarea value={form.coachingGoals} onChange={set('coachingGoals')} placeholder="Goals, challenges, the decisions ahead of you…" />
              </label>
              <label className="field full">
                How did you hear about us?
                <input value={form.referralSource} onChange={set('referralSource')} />
              </label>
            </div>
            <div className="row spread mt-3">
              <button className="btn btn-outline-dark" onClick={() => setStep(0)}>Back</button>
              <button className="btn btn-gold" onClick={next}>Continue</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form className="card" onSubmit={submitRegistration}>
            <h3>Documents</h3>
            <p className="muted">
              Optional, but they help us match you with the right mentor. Your files are
              stored with the same row-level security as the rest of your profile.
            </p>
            <div className="form-grid">
              <label className="field full">
                CV / résumé
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setCv(e.target.files?.[0] ?? null)}
                />
                <div className="hint">PDF or Word, up to 5 MB.{cv ? ` Selected: ${cv.name}` : ''}</div>
              </label>
              <label className="field full">
                Profile photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
                <div className="hint">JPEG, PNG, or WebP, up to 2 MB.{photo ? ` Selected: ${photo.name}` : ''}</div>
              </label>
            </div>
            <div className="row spread mt-3">
              <button type="button" className="btn btn-outline-dark" onClick={() => setStep(1)}>Back</button>
              <button type="submit" className="btn btn-gold" disabled={busy}>
                {busy ? 'Creating account…' : 'Create account & continue'}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="card">
            <h3>Choose your membership</h3>
            <div className="alert alert-success">
              Your account has been created. Select a plan to complete enrollment.
            </div>
            <div className="plan-grid">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className={`plan ${selectedPlan === p.id ? 'selected' : ''}`}
                  onClick={() => setSelectedPlan(p.id)}
                  role="radio"
                  aria-checked={selectedPlan === p.id}
                >
                  <strong>{p.label}</strong>
                  <div className="price">{money(p.amountCents)}</div>
                  <div className="cadence">
                    {p.id === 'subscription' ? 'per month, cancel anytime' : 'single payment, 12-month program'}
                  </div>
                </div>
              ))}
            </div>

            {stubNotice ? (
              <>
                <div className="alert alert-info">{stubNotice}</div>
                <button className="btn btn-gold btn-block" onClick={() => navigate('/dashboard')}>
                  Go to my profile
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-gold btn-block" onClick={handlePay} disabled={busy || !selectedPlan}>
                  {busy ? 'Processing…' : selectedPlan
                    ? `Pay ${money(plans.find((p) => p.id === selectedPlan)!.amountCents)}`
                    : 'Select a plan to continue'}
                </button>
                <p className="hint center mt-1">
                  Payment processing is in preview — no card will be charged today.
                </p>
              </>
            )}
            <div className="center mt-2">
              <button className="read-more" onClick={() => navigate('/dashboard')}>
                Skip for now — decide later from my profile
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
