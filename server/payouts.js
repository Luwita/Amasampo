import { round2 } from '../src/data/fees.js';
import { RETURN_DAYS } from './routes/cases.js';

// What Zed Market owes each shop, using the same rules as the monthly statement:
// - a delivered parcel paid online earns the shop goods + delivery − commission;
// - a cash-on-delivery parcel: the shop already collected the cash, so it only gets the Zed Market voucher
//   back (the part of the price the buyer didn't pay) and owes the commission;
// - refunds after a return come out of the shop's money, with the commission on refunded goods given back;
// - payouts already made are subtracted, and commission the shop has paid to Zed Market is added back.
// A negative `available` is commission the shop owes; it is also given as the positive `owed`.
// Money from a parcel is "on hold" until the return window has passed and no return case is open.
export async function shopBalances(q, shopId = null) {
  const parcels = await q.query(
    `SELECT s.id, s.shop_id, s.subtotal, s.discount, s.fee, s.voucher_discount, s.delivered_at, s.commission_rate,
            o.payment_status,
            EXISTS (SELECT 1 FROM cases c WHERE c.shipment_id = s.id
                     AND c.status IN ('open', 'rejected', 'escalated')) AS disputed
       FROM shipments s JOIN orders o ON o.id = s.order_id
      WHERE s.status = 'delivered' AND ($1::text IS NULL OR s.shop_id = $1)`,
    [shopId],
  );
  const refunds = await q.query(
    `SELECT r.shop_id, r.amount, s.subtotal - s.discount AS goods, s.commission_rate,
            COALESCE((SELECT sum(e.amount) FROM refunds e
                       WHERE e.shipment_id = r.shipment_id AND e.reason = 'return'
                         AND (e.created_at, e.id) < (r.created_at, r.id)), 0) AS earlier
       FROM refunds r JOIN shipments s ON s.id = r.shipment_id
      WHERE r.reason = 'return' AND ($1::text IS NULL OR r.shop_id = $1)`,
    [shopId],
  );
  const paid = await q.query(
    `SELECT shop_id,
            COALESCE(sum(amount) FILTER (WHERE kind = 'payout'), 0) AS total,
            COALESCE(sum(amount) FILTER (WHERE kind = 'commission'), 0) AS commission_paid,
            max(created_at) FILTER (WHERE kind = 'payout') AS last_at
       FROM payouts WHERE ($1::text IS NULL OR shop_id = $1) GROUP BY shop_id`,
    [shopId],
  );

  const balances = {};
  const of = (id) =>
    (balances[id] ??= {
      shopId: id,
      earned: 0,
      onHold: 0,
      refunds: 0,
      paidOut: 0,
      commissionPaid: 0,
      lastPayoutAt: null,
      parcels: 0,
    });
  const holdUntil = Date.now() - RETURN_DAYS * 864e5;
  if (shopId) of(shopId);

  for (const p of parcels) {
    const goods = Number(p.subtotal) - Number(p.discount);
    const commission = round2(goods * Number(p.commission_rate));
    const net =
      p.payment_status !== 'paid'
        ? Number(p.voucher_discount) - commission
        : goods + Number(p.fee) - commission;
    const b = of(p.shop_id);
    b.parcels += 1;
    if (p.disputed || new Date(p.delivered_at).getTime() > holdUntil) b.onHold += net;
    else b.earned += net;
  }
  for (const r of refunds) {
    const amount = Number(r.amount);
    const goods = Number(r.goods);
    const earlier = Number(r.earlier);
    const goodsRefunded = Math.max(0, Math.min(earlier + amount, goods) - Math.min(earlier, goods));
    of(r.shop_id).refunds += amount - round2(goodsRefunded * Number(r.commission_rate));
  }
  for (const p of paid) {
    const b = of(p.shop_id);
    b.paidOut = Number(p.total);
    b.commissionPaid = Number(p.commission_paid);
    b.lastPayoutAt = p.last_at;
  }
  for (const b of Object.values(balances)) {
    for (const k of ['earned', 'onHold', 'refunds', 'paidOut', 'commissionPaid']) b[k] = round2(b[k]);
    // Available now: cleared earnings minus refunds and payouts, plus commission already paid in.
    // Negative when the shop, which was paid directly by its buyers, owes commission.
    b.available = round2(b.earned - b.refunds - b.paidOut + b.commissionPaid);
    b.owed = Math.max(0, round2(-b.available));
  }
  return shopId ? balances[shopId] : Object.values(balances);
}

// Where shops send the commission they owe, or null until staff have set it.
export async function commissionAccount(q) {
  const [row] = await q.query('SELECT network, number, name FROM commission_account');
  return row ?? null;
}

export const toPayout = (p) => ({
  id: p.id,
  kind: p.kind ?? 'payout',
  shopId: p.shop_id,
  shopName: p.shop_name,
  amount: Number(p.amount),
  method: p.method,
  reference: p.reference,
  note: p.note,
  date: p.created_at,
});
