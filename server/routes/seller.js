import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { parse } from '../http.js';
import { COMMISSION_RATE, round2 } from '../../src/data/fees.js';
import { toProduct, toReview } from '../mappers.js';
import { myShopOrFail } from '../queries.js';

// Tools for the signed-in shop owner.
export function sellerRoutes(db) {
  const router = Router();
  router.use(requireUser);

  // Sales summary for the last `days` days.
  router.get('/report', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);

    const [summary] = await db.query(
      `SELECT count(*)::int AS orders,
              COALESCE(sum(s.subtotal), 0) AS revenue,
              COALESCE(sum(s.subtotal) FILTER (WHERE s.status = 'delivered'), 0) AS delivered_revenue,
              count(*) FILTER (WHERE s.status = 'pending')::int AS to_dispatch,
              count(*) FILTER (WHERE s.status = 'dispatched')::int AS in_transit,
              COALESCE((SELECT sum(i.qty) FROM order_items i JOIN shipments s2 ON s2.id = i.shipment_id
                         JOIN orders o2 ON o2.id = s2.order_id
                        WHERE s2.shop_id = $1 AND o2.created_at > now() - make_interval(days => $2)), 0)::int AS units
         FROM shipments s JOIN orders o ON o.id = s.order_id
        WHERE s.shop_id = $1 AND o.created_at > now() - make_interval(days => $2)`,
      [shop.id, days],
    );
    const top = await db.query(
      `SELECT i.product_id, i.name, sum(i.qty)::int AS units, sum(i.qty * i.unit_price) AS revenue
         FROM order_items i JOIN shipments s ON s.id = i.shipment_id JOIN orders o ON o.id = s.order_id
        WHERE s.shop_id = $1 AND o.created_at > now() - make_interval(days => $2)
        GROUP BY i.product_id, i.name ORDER BY revenue DESC LIMIT 10`,
      [shop.id, days],
    );
    const daily = await db.query(
      `SELECT to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD') AS day, sum(s.subtotal) AS revenue
         FROM shipments s JOIN orders o ON o.id = s.order_id
        WHERE s.shop_id = $1 AND o.created_at > now() - make_interval(days => $2)
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

  // Monthly statement: parcels delivered in the month, Amasampo's commission and what the shop is paid.
  router.get('/statement', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const { month } = parse(
      z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-09') }),
      req.query,
    );
    // Months are counted in Zambian time (UTC+2).
    const rows = await db.query(
      `SELECT o.id AS order_id, s.updated_at AS delivered_at, s.subtotal, s.discount, s.fee, s.courier_name, s.coupon_code
         FROM shipments s JOIN orders o ON o.id = s.order_id
        WHERE s.shop_id = $1 AND s.status = 'delivered'
          AND s.updated_at >= ($2 || '-01T00:00:00+02:00')::timestamptz
          AND s.updated_at < ($2 || '-01T00:00:00+02:00')::timestamptz + interval '1 month'
        ORDER BY s.updated_at`,
      [shop.id, month],
    );
    const lines = rows.map((r) => {
      const goods = Number(r.subtotal) - Number(r.discount);
      const commission = round2(goods * COMMISSION_RATE);
      return {
        orderId: r.order_id,
        deliveredAt: r.delivered_at,
        subtotal: Number(r.subtotal),
        discount: Number(r.discount),
        couponCode: r.coupon_code,
        delivery: Number(r.fee),
        courier: r.courier_name,
        commission,
        payout: round2(goods + Number(r.fee) - commission),
      };
    });
    const sum = (k) => round2(lines.reduce((n, l) => n + l[k], 0));
    res.json({
      month,
      commissionRate: COMMISSION_RATE,
      shop: { name: shop.name, area: shop.area, town: shop.town, phone: shop.phone, tpin: shop.tpin },
      lines,
      totals: {
        subtotal: sum('subtotal'),
        discount: sum('discount'),
        delivery: sum('delivery'),
        commission: sum('commission'),
        payout: sum('payout'),
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

  return router;
}
