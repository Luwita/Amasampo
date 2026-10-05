import { Router } from 'express';
import { requireUser } from '../auth.js';

export const toVoucher = (v) => ({
  id: v.id,
  amount: Number(v.amount),
  minSpend: Number(v.min_spend),
  reason: v.reason,
  note: v.note ?? undefined,
  expiresAt: v.expires_at,
  usedOrderId: v.used_order_id,
  usable: !v.used_order_id && new Date(v.expires_at) > new Date(),
});

// The signed-in user's vouchers and invite code.
export function voucherRoutes(db) {
  const router = Router();
  router.use(requireUser);

  router.get('/vouchers', async (req, res) => {
    const rows = await db.query('SELECT * FROM vouchers WHERE user_id = $1 ORDER BY used_order_id IS NULL DESC, expires_at', [
      req.user.id,
    ]);
    res.json(rows.map(toVoucher));
  });

  router.get('/referral', async (req, res) => {
    const [row] = await db.query(
      `SELECT u.referral_code,
              (SELECT count(*) FROM users f WHERE f.referred_by = u.id)::int AS invited,
              (SELECT count(*) FROM vouchers v WHERE v.user_id = u.id AND v.reason = 'referral')::int AS rewarded
         FROM users u WHERE u.id = $1`,
      [req.user.id]
    );
    res.json({ code: row.referral_code, invited: row.invited, rewarded: row.rewarded });
  });

  return router;
}
