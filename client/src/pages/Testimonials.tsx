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

export function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get('/api/testimonials')
      .then(setTestimonials)
      .catch(() => setTestimonials([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="loading">Loading member voices…</div>;

  const [featured, ...rest] = testimonials;

  return (
    <>
      <section className="voices-hero">
        <div className="container center">
          <div className="kicker">Member Voices</div>
          <h1>Testimonials</h1>
          <p className="lede">
            Chief executives on what changes when you stop carrying the seat alone.
          </p>
        </div>
      </section>

      {featured && (
        <section className="section">
          <div className="container">
            <article className="featured-voice">
              <div className="featured-photo">
                {featured.photo_url ? (
                  <img src={featured.photo_url} alt={featured.ceo_name} />
                ) : (
                  <Avatar name={featured.ceo_name} size={220} />
                )}
                <div className="featured-photo-plate">
                  <strong>{featured.ceo_name}</strong>
                  <span>
                    {featured.ceo_title}
                    <br />
                    {featured.company}
                  </span>
                </div>
              </div>
              <div className="featured-body">
                <div className="eyebrow">Featured member</div>
                <h2>{featured.headline}</h2>
                <blockquote className="featured-pull">{featured.quote_short}</blockquote>
                <p className="featured-full">{featured.quote_full}</p>
              </div>
            </article>
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="eyebrow">More voices</div>
            <h2>In their words</h2>
            <div className="testimonial-grid">
              {rest.map((t) => (
                <article className="testimonial-card" key={t.id}>
                  <blockquote>{t.quote_short}</blockquote>
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
            </div>
          </div>
        </section>
      )}

      <section className="section section-dark">
        <div className="container center">
          <h2>Your chapter starts here.</h2>
          <p className="section-intro" style={{ margin: '0 auto 1.5rem' }}>
            Join the executives above and find the mentor who has already navigated what
            comes next for you.
          </p>
          <Link to="/register" className="btn btn-gold">
            Apply for membership
          </Link>
        </div>
      </section>
    </>
  );
}
