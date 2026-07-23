import { Router } from 'express';
import { ANON, withContext } from '../db/pool.js';

export const testimonialsRouter = Router();

// Public: the homepage reads published testimonials as anon — the RLS policy
// on testimonials only exposes published rows to that role.
testimonialsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await withContext(ANON, async (client) => {
      const { rows } = await client.query(
        `SELECT id, ceo_name, ceo_title, company, headline, quote_short, quote_full, photo_url
         FROM testimonials
         ORDER BY display_order, created_at`,
      );
      return rows;
    });
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});
