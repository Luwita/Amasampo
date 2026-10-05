import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { HttpError, parse } from '../http.js';
import { round2 } from '../../src/data/fees.js';
import { getSettings } from '../settings.js';
import { toProduct, toReview } from '../mappers.js';
import { myShopOrFail } from '../queries.js';
import { shopBalances, toPayout } from '../payouts.js';
import { verificationSchema } from '../schemas.js';

// Tools for the signed-in shop owner.
export function sellerRoutes(db) {
  const router = Router();
  router.use(requireUser);

  // Sales summary for the last `days` days. Cancelled parcels don't count as sales.
  router.get('/report', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
    const inPeriod = `s.shop_id = $1 AND s.status <> 'cancelled' AND o.created_at > now() - make_interval(days => $2)`;

    const [summary] = await db.query(
      `SELECT count(*)::int AS orders,
              COALESCE(sum(s.subtotal), 0) AS revenue,
              COALESCE(sum(s.subtotal) FILTER (WHERE s.status = 'delivered'), 0) AS delivered_revenue,
              count(*) FILTER (WHERE s.status = 'pending')::int AS to_dispatch,
              count(*) FILTER (WHERE s.status = 'dispatched')::int AS in_transit,
              COALESCE((SELECT sum(i.qty) FROM order_items i JOIN shipments s ON s.id = i.shipment_id
                         JOIN orders o ON o.id = s.order_id WHERE ${inPeriod}), 0)::int AS units
         FROM shipments s JOIN orders o ON o.id = s.order_id
        WHERE ${inPeriod}`,
      [shop.id, days],
    );
    const top = await db.query(
      `SELECT i.product_id, i.name, sum(i.qty)::int AS units, sum(i.qty * i.unit_price) AS revenue
         FROM order_items i JOIN shipments s ON s.id = i.shipment_id JOIN orders o ON o.id = s.order_id
        WHERE ${inPeriod}
        GROUP BY i.product_id, i.name ORDER BY revenue DESC LIMIT 10`,
      [shop.id, days],
    );
    const daily = await db.query(
      `SELECT to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD') AS day, sum(s.subtotal) AS revenue
         FROM shipments s JOIN orders o ON o.id = s.order_id
        WHERE ${inPeriod}
        GROUP BY 1 ORDER BY 1`,
      [shop.id, days],
    );
    const lowStock = await db.query(
      `SELECT * FROM products WHERE shop_id = $1 AND deleted_at IS NULL AND stock <= low_stock_at ORDER BY stock, name`,
      [shop.id],
    );
    const [rating] = await db.query('SELECT rating, review_count FROM shops WHERE id = $1', [shop.id]);

    res.json({
      days,
      orders: summary.orders,
      units: summary.units,
      revenue: Number(summary.revenue),
      deliveredRevenue: Number(summary.delivered_revenue),
      toDispatch: summary.to_dispatch,
      inTransit: summary.in_transit,
      rating: Number(rating.rating),
      reviewCount: rating.review_count,
      topProducts: top.map((t) => ({ id: t.product_id, name: t.name, units: t.units, revenue: Number(t.revenue) })),
      daily: daily.map((d) => ({ day: d.day, revenue: Number(d.revenue) })),
      lowStock: lowStock.map(toProduct),
    });
  });

  // Monthly statement: parcels delivered in the month, return refunds made in the month,
  // Zed Market's commission and what the shop is paid. Months are counted in Zambian time (UTC+2).
  // Money Zed Market owes the shop, and payouts already made.
  router.get('/payouts', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const history = await db.query('SELECT * FROM payouts WHERE shop_id = $1 ORDER BY created_at DESC LIMIT 50', [shop.id]);
    res.json({ ...(await shopBalances(db, shop.id)), history: history.map(toPayout) });
  });

  router.get('/statement', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const { month } = parse(
      z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-09') }),
      req.query,
    );
    const inMonth = (col) =>
      `${col} >= ($2 || '-01T00:00:00+02:00')::timestamptz
       AND ${col} < ($2 || '-01T00:00:00+02:00')::timestamptz + interval '1 month'`;

    const rows = await db.query(
      `SELECT o.id AS order_id, s.delivered_at, s.subtotal, s.discount, s.fee, s.courier_name, s.coupon_code, s.commission_rate,
              s.voucher_discount, o.payment_status
         FROM shipments s JOIN orders o ON o.id = s.order_id
        WHERE s.shop_id = $1 AND s.status = 'delivered' AND ${inMonth('s.delivered_at')}
        ORDER BY s.delivered_at`,
      [shop.id, month],
    );
    const lines = rows.map((r) => {
      const goods = Number(r.subtotal) - Number(r.discount);
      const commission = round2(goods * Number(r.commission_rate));
      const voucher = Number(r.voucher_discount);
      // Cash on delivery: the shop already has the buyer's cash, so Zed Market only pays back the voucher
      // (the part the buyer didn't pay) and the commission is owed. Same rule as the payouts balance.
      const cashOnDelivery = r.payment_status !== 'paid';
      const cashCollected = cashOnDelivery ? round2(goods - voucher + Number(r.fee)) : 0;
      return {
        orderId: r.order_id,
        deliveredAt: r.delivered_at,
        subtotal: Number(r.subtotal),
        discount: Number(r.discount),
        couponCode: r.coupon_code,
        delivery: Number(r.fee),
        courier: r.courier_name,
        commissionRate: Number(r.commission_rate),
        commission,
        voucher,
        cashOnDelivery,
        cashCollected,
        payout: cashOnDelivery ? round2(voucher - commission) : round2(goods + Number(r.fee) - commission),
      };
    });

    // Refunds after a return come out of the shop's payout; the commission on the refunded goods is given back.
    // Refunds count against the goods first (commission was charged on goods only), so each refund is placed
    // after any earlier refunds on the same parcel.
    const refundRows = await db.query(
      `SELECT r.order_id, r.amount, r.created_at, s.subtotal - s.discount AS goods, s.commission_rate,
              COALESCE((SELECT sum(e.amount) FROM refunds e
                         WHERE e.shipment_id = r.shipment_id AND e.reason = 'return'
                           AND (e.created_at, e.id) < (r.created_at, r.id)), 0) AS earlier
         FROM refunds r JOIN shipments s ON s.id = r.shipment_id
        WHERE r.shop_id = $1 AND r.reason = 'return' AND ${inMonth('r.created_at')}
        ORDER BY r.created_at`,
      [shop.id, month],
    );
    const refunds = refundRows.map((r) => {
      const amount = Number(r.amount);
      const goods = Number(r.goods);
      const earlier = Number(r.earlier);
      const goodsRefunded = Math.max(0, Math.min(earlier + amount, goods) - Math.min(earlier, goods));
      const commissionBack = round2(goodsRefunded * Number(r.commission_rate));
      return { orderId: r.order_id, date: r.created_at, amount, commissionBack, net: round2(commissionBack - amount) };
    });

    const sum = (list, k) => round2(list.reduce((n, l) => n + l[k], 0));
    res.json({
      month,
      commissionRate: (await getSettings(db)).commissionRate,
      shop: { name: shop.name, area: shop.area, town: shop.town, phone: shop.phone, tpin: shop.tpin },
      lines,
      refunds,
      totals: {
        subtotal: sum(lines, 'subtotal'),
        discount: sum(lines, 'discount'),
        delivery: sum(lines, 'delivery'),
        cashCollected: sum(lines, 'cashCollected'),
        commission: round2(sum(lines, 'commission') - sum(refunds, 'commissionBack')),
        refunds: sum(refunds, 'amount'),
        payout: round2(sum(lines, 'payout') + sum(refunds, 'net')),
      },
    });
  });

  router.get('/reviews', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const rows = await db.query(
      `SELECT r.*, p.name AS product_name FROM reviews r JOIN products p ON p.id = r.product_id
        WHERE r.shop_id = $1 ORDER BY (r.reply IS NULL) DESC, r.created_at DESC LIMIT 100`,
      [shop.id],
    );
    res.json(rows.map(toReview));
  });

  // Verification status, including notes from staff (private to the owner).
  router.get('/verification', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    res.json({
      status: shop.verification,
      note: shop.verification_note,
      ownerFullName: shop.owner_full_name,
      nrc: shop.nrc,
      pacra: shop.pacra,
      suspended: !!shop.suspended_at,
      suspendReason: shop.suspend_reason,
    });
  });

  router.post('/verification', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    if (shop.verification === 'verified') throw new HttpError(409, 'Your shop is already verified');
    const v = parse(verificationSchema, req.body);
    await db.query(
      `UPDATE shops SET owner_full_name = $2, nrc = $3, pacra = $4, verification = 'pending', verification_note = NULL
        WHERE id = $1`,
      [shop.id, v.ownerFullName, v.nrc, v.pacra || null],
    );
    res.json({ status: 'pending' });
  });

  // Listings taken down by staff, with the reason.
  router.get('/removed-products', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const rows = await db.query(
      `SELECT * FROM products WHERE shop_id = $1 AND removed_reason IS NOT NULL AND deleted_at IS NOT NULL
        ORDER BY deleted_at DESC`,
      [shop.id],
    );
    res.json(rows.map((r) => ({ ...toProduct(r), removedReason: r.removed_reason })));
  });

  return router;
}
