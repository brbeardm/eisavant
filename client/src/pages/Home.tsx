import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';

interface Testimonial {
  id: string;
  ceo_name: string;
  ceo_title: string;
  company: string;
  headline: string;
  quote_short: string;
  quote_full: string;
  photo_url: string | null;
}

function TestimonialModal({ t, onClose }: { t: Testimonial; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>{t.headline}</h3>
        <div className="testimonial-person mt-2">
          <Avatar name={t.ceo_name} src={t.photo_url} />
          <div>
            <strong>{t.ceo_name}</strong>
            <small>
              {t.ceo_title}, {t.company}
            </small>
          </div>
        </div>
        <p className="mt-3">{t.quote_full}</p>
      </div>
    </div>
  );
}

export function HomePage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/api/testimonials')
      .then(setTestimonials)
      .catch(() => setTestimonials([]));
  }, []);

  const open = testimonials.find((t) => t.id === openId);

  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="kicker">Executive Coaching &amp; Mentoring</div>
          <h1>
            The room where CEOs
            <br />
            sharpen CEOs.
          </h1>
          <p className="lede">
            Eisavant pairs sitting chief executives with mentors who have already faced the
            decisions keeping you up at night. Confidential, candid, and built around your
            company's next chapter.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-gold">
              Apply for membership
            </Link>
            <a href="#testimonials" className="btn btn-outline">
              Hear from our members
            </a>
          </div>
        </div>
      </section>

      <section className="section" id="testimonials">
        <div className="container">
          <div className="eyebrow">Member voices</div>
          <h2>Leaders who have walked this road</h2>
          <p className="section-intro">
            Every Eisavant mentor is a current or former chief executive. Here is what members
            say about the partnership.
          </p>
          <div className="testimonial-grid">
            {testimonials.map((t) => (
              <article className="testimonial-card" key={t.id}>
                <blockquote>{t.quote_short}</blockquote>
                <button className="read-more" onClick={() => setOpenId(t.id)}>
                  Read {t.ceo_name.split(' ')[0]}'s full story →
                </button>
                <div className="testimonial-person">
                  <Avatar name={t.ceo_name} src={t.photo_url} />
                  <div>
                    <strong>{t.ceo_name}</strong>
                    <small>
                      {t.ceo_title}, {t.company}
                    </small>
                  </div>
                </div>
              </article>
            ))}
            {testimonials.length === 0 && (
              <p className="muted">Testimonials are loading or unavailable.</p>
            )}
          </div>
        </div>
      </section>

      <section className="section section-dark" id="program">
        <div className="container">
          <div className="eyebrow">The program</div>
          <h2>Built for the seat you sit in</h2>
          <p className="section-intro">
            A membership designed around the realities of the chief executive role — not
            generic leadership training.
          </p>
          <div className="feature-grid">
            <div className="feature">
              <h3>1:1 Mentorship</h3>
              <p>
                Weekly sessions with a matched mentor who has operated at your scale, in your
                seat, under board pressure.
              </p>
            </div>
            <div className="feature">
              <h3>Peer Councils</h3>
              <p>
                Small, conflict-free groups of CEOs who meet monthly to pressure-test each
                other's hardest calls.
              </p>
            </div>
            <div className="feature">
              <h3>Confidential by Design</h3>
              <p>
                Your profile, goals, and conversations are protected with bank-grade,
                row-level data security.
              </p>
            </div>
            <div className="feature">
              <h3>On-Demand Counsel</h3>
              <p>
                A crisis does not wait for the next session. Members reach their mentor when
                it matters most.
              </p>
            </div>
          </div>
          <div className="center mt-4">
            <Link to="/register" className="btn btn-gold">
              Begin your application
            </Link>
          </div>
        </div>
      </section>

      {open && <TestimonialModal t={open} onClose={() => setOpenId(null)} />}
    </>
  );
}
