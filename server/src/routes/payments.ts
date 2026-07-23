import { Router } from 'express';
import { logAudit } from '../db/audit.js';
import { withContext } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { paymentIntentSchema } from '../validation/schemas.js';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

export const PLANS = {
  one_time: { label: 'Executive Intensive (one-time)', amountCents: 250000 },
  subscription: { label: 'Ongoing Mentorship (monthly)', amountCents: 150000 },
} as const;

paymentsRouter.get('/plans', (_req, res) => {
  return res.json(
    Object.entries(PLANS).map(([id, p]) => ({ id, label: p.label, amountCents: p.amountCents })),
  );
});

/**
 * PAYMENT STUB — intentionally the end of the line.
 *
 * Records which plan the member selected so the registration flow can be
 * exercised end-to-end, then stops. No card data is accepted, transmitted,
 * or stored, and account status is NOT changed. When a real processor
 * (e.g. Stripe) is integrated, this endpoint becomes "create checkout
 * session" and a webhook flips users.status to 'active'.
 */
paymentsRouter.post('/intent', async (req, res, next) => {
  try {
    const { plan } = paymentIntentSchema.parse(req.body);
    const { amountCents } = PLANS[plan];

    const ctx = { userId: req.user!.id, role: req.user!.role };
    const record = await withContext(ctx, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO payments (user_id, plan, amount_cents, status)
         VALUES ($1, $2, $3, 'stub_pending')
         RETURNING id, plan, amount_cents, currency, status, created_at`,
        [req.user!.id, plan, amountCents],
      );
      await logAudit(client, {
        actorUserId: req.user!.id,
        action: 'payment.plan_selected',
        targetUserId: req.user!.id,
        details: { plan, amountCents },
      });
      return rows[0];
    });

    return res.status(202).json({
      ...record,
      message:
        'Payment processing is not yet enabled. Your plan selection has been recorded and our team will contact you to complete enrollment.',
    });
  } catch (err) {
    return next(err);
  }
});
