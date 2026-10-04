import { Router } from 'express';
import { z } from 'zod';
import { OrderError, priceOrder } from '../../src/data/pricing.js';
import { requireUser } from '../auth.js';
import { HttpError, newId, newOrderId, parse } from '../http.js';
import { toProduct, toShop } from '../mappers.js';
import { loadOrders, myShopOrFail } from '../queries.js';
import { orderQuoteSchema, orderSchema } from '../schemas.js';

const PAYMENT_NAMES = {
  mtn: 'MTN Mobile Money',
  airtel: 'Airtel Money',
  zamtel: 'Zamtel Kwacha',
  card: 'Visa / Mastercard',
  cod: 'Pay on Delivery',
};

const SHIPMENT_FLOW = { pending: 'dispatched', dispatched: 'delivered' };

// The buyer's discount code, checked against every shop in the cart. Returns { [shopId]: coupon }.
async function loadCoupons(q, code, shopIds, buyerId, lock) {
  if (!code) return { coupons: {}, rows: [] };
  const rows = await q.query(
    `SELECT * FROM coupons WHERE upper(code) = upper($1) AND shop_id = ANY($2) AND active ${lock ? 'FOR UPDATE' : ''}`,
    [code, shopIds],
  );
  if (!rows.length) throw new OrderError(`${code.toUpperCase()} isn't a valid code for the shops in your cart`);
  for (const c of rows) {
    if (c.ends_at && new Date(c.ends_at) < new Date()) throw new OrderError(`${c.code} has expired`);
    if (c.max_uses && c.uses >= c.max_uses) throw new OrderError(`${c.code} has been fully used`);
    const [used] = await q.query(
      `SELECT 1 FROM shipments s JOIN orders o ON o.id = s.order_id
        WHERE o.buyer_id = $1 AND s.shop_id = $2 AND upper(s.coupon_code) = upper($3) LIMIT 1`,
      [buyerId, c.shop_id, c.code],
    );
    if (used) throw new OrderError(`You have already used ${c.code}`);
  }
  const coupons = Object.fromEntries(
    rows.map((c) => [c.shop_id, { code: c.code, kind: c.kind, value: Number(c.value), minSpend: Number(c.min_spend) }]),
  );
  return { coupons, rows };
}

// Prices a cart for a buyer from the database. With `lock`, rows are locked for the order transaction.
async function priceForBuyer(q, user, body, lock) {
  const lockSql = lock ? 'FOR UPDATE' : '';
  const products = (
    await q.query(`SELECT * FROM products WHERE id = ANY($1) AND deleted_at IS NULL ${lockSql}`, [
      [...new Set(body.items.map((i) => i.productId))],
    ])
  ).map(toProduct);
  const shopIds = [...new Set(products.map((p) => p.shopId))];
  const shops = (await q.query('SELECT * FROM shops WHERE id = ANY($1)', [shopIds])).map(toShop);

  // Accepted, unexpired price requests of this buyer.
  const quoteIds = body.items.map((i) => i.quoteId).filter(Boolean);
  const quoteRows = quoteIds.length
    ? await q.query(
        `SELECT * FROM price_requests
          WHERE id = ANY($1) AND buyer_id = $2 AND status = 'accepted' AND valid_until > now() ${lockSql}`,
        [quoteIds, user.id],
      )
    : [];
  const quotes = Object.fromEntries(
    quoteRows.map((r) => [r.id, { productId: r.product_id, qty: r.qty, price: Number(r.quoted_price) }]),
  );

  try {
    const { coupons, rows: couponRows } = await loadCoupons(q, body.coupon, shopIds, user.id, lock);
    const priced = priceOrder({
      lines: body.items,
      getProduct: (id) => products.find((p) => p.id === id),
      getShop: (id) => shops.find((s) => s.id === id),
      to: { province: body.shipping.province, town: body.shipping.town },
      picks: body.couriers,
      payment: body.payment,
      coupons,
      quotes,
    });
    return { priced, couponRows };
  } catch (err) {
    if (err instanceof OrderError) throw new HttpError(409, err.message);
    throw err;
  }
}

export function orderRoutes(db) {
  const router = Router();
  router.use(requireUser);

  // Exact totals for checkout (discount codes, agreed prices, delivery) without placing the order.
  router.post('/quote', async (req, res) => {
    const { priced } = await priceForBuyer(db, req.user, parse(orderQuoteSchema, req.body), false);
    res.json(priced);
  });

  router.post('/', async (req, res) => {
    const body = parse(orderSchema, req.body);

    const order = await db.tx(async (t) => {
      // Lock products, codes and agreed prices so two buyers can't take the last item or the last code use.
      const { priced, couponRows } = await priceForBuyer(t, req.user, body, true);

      const id = newOrderId();
      // Mobile Money and card payments are not connected yet, so they are recorded as paid.
      const paymentStatus = body.payment === 'cod' ? 'cod_due' : 'paid';
      const [row] = await t.query(
        `INSERT INTO orders (id, buyer_id, buyer_name, buyer_phone, province, town, address, payment_method,
                             payment_status, subtotal, discount, delivery, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          id,
          req.user.id,
          body.shipping.name,
          body.shipping.phone,
          body.shipping.province,
          body.shipping.town,
          body.shipping.address,
          PAYMENT_NAMES[body.payment],
          paymentStatus,
          priced.subtotal,
          priced.discount,
          priced.delivery,
          priced.total,
        ],
      );
      for (const s of priced.shipments) {
        const shipmentId = newId('shp');
        await t.query(
          `INSERT INTO shipments (id, order_id, shop_id, courier, courier_name, fee, eta, subtotal, discount, coupon_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [shipmentId, id, s.shopId, s.courier, s.courierName, s.fee, s.eta, s.subtotal, s.discount, s.couponCode],
        );
        for (const item of s.items) {
          await t.query(
            `INSERT INTO order_items (id, shipment_id, product_id, name, options, qty, unit_price, price_request_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [newId('itm'), shipmentId, item.id, item.name, item.options, item.qty, item.price, item.quoteId],
          );
          await t.query('UPDATE products SET stock = stock - $2, sold = sold + $2 WHERE id = $1', [item.id, item.qty]);
          if (item.quoteId) {
            await t.query(`UPDATE price_requests SET status = 'ordered', updated_at = now() WHERE id = $1`, [
              item.quoteId,
            ]);
          }
        }
      }
      const usedCoupons = couponRows.filter((c) => priced.shipments.some((s) => s.shopId === c.shop_id));
      for (const c of usedCoupons) await t.query('UPDATE coupons SET uses = uses + 1 WHERE id = $1', [c.id]);
      return row;
    });

    const [full] = await loadOrders(db, [order]);
    res.status(201).json(full);
  });

  router.get('/mine', async (req, res) => {
    const rows = await db.query('SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(await loadOrders(db, rows));
  });

  // Orders containing a parcel from the signed-in owner's shop (only that shop's parcel is included).
  router.get('/shop', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const rows = await db.query(
      `SELECT o.* FROM orders o WHERE EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.shop_id = $1)
        ORDER BY o.created_at DESC`,
      [shop.id],
    );
    res.json(await loadOrders(db, rows, shop.id));
  });

  router.patch('/:orderId/shipments/:shopId', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    if (shop.id !== req.params.shopId) throw new HttpError(403, 'You can only update your own parcels');
    const body = parse(
      z.object({ status: z.enum(['dispatched', 'delivered']), tracking: z.string().trim().max(60).optional() }),
      req.body,
    );
    const [current] = await db.query('SELECT status FROM shipments WHERE order_id = $1 AND shop_id = $2', [
      req.params.orderId,
      shop.id,
    ]);
    if (!current) throw new HttpError(404, 'Order not found');
    if (SHIPMENT_FLOW[current.status] !== body.status) {
      throw new HttpError(409, `A ${current.status} parcel can't be marked ${body.status}`);
    }
    await db.query(
      `UPDATE shipments SET status = $3, tracking = COALESCE($4, tracking), updated_at = now()
        WHERE order_id = $1 AND shop_id = $2`,
      [req.params.orderId, shop.id, body.status, body.tracking ?? null],
    );
    const [order] = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.orderId]);
    const [full] = await loadOrders(db, [order], shop.id);
    res.json(full);
  });

  return router;
}
