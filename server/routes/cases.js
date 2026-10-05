import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { notify, notifyShopOwner } from '../notify.js';
import { refundableLeft } from '../queries.js';
import { caseResponseSchema, caseSchema } from '../schemas.js';

export const RETURN_DAYS = 7;
export const SHOP_REPLY_DAYS = 3; // after this the buyer can escalate an unanswered case

export const toCase = (row) => ({
  id: row.id,
  orderId: row.order_id,
  shopId: row.shop_id,
  shopName: row.shop_name,
  buyerName: row.buyer_name,
  buyerPhone: row.buyer_phone,
  kind: row.kind,
  reason: row.reason,
  description: row.description,
  items: row.items,
  photos: row.photos,
  status: row.status,
  resolution: row.resolution,
  refundAmount: row.refund_amount == null ? null : Number(row.refund_amount),
  events: row.events,
  canEscalate:
    row.status === 'rejected' ||
    (row.status === 'open' && new Date(row.created_at) < new Date(Date.now() - SHOP_REPLY_DAYS * 864e5)),
  date: row.created_at,
  updatedAt: row.updated_at,
});

export const CASE_SELECT = `SELECT c.*, sh.name AS shop_name, o.buyer_name, o.buyer_phone
                              FROM cases c JOIN shops sh ON sh.id = c.shop_id JOIN orders o ON o.id = c.order_id`;

const event = (by, action, note = '') => JSON.stringify([{ at: new Date().toISOString(), by, action, note }]);

// Adds a timeline entry and changes the case. `set` is SQL assignments using $3 onwards.
export async function updateCase(q, id, by, action, note, set = '', params = []) {
  const [row] = await q.query(
    `UPDATE cases SET events = events || $2::jsonb, updated_at = now()${set ? `, ${set}` : ''} WHERE id = $1 RETURNING *`,
    [id, event(by, action, note), ...params],
  );
  return row;
}

// Records a refund the buyer is owed, capped at what is left to refund on the parcel.
export async function addReturnRefund(q, c, amount) {
  const left = await refundableLeft(q, c.shipment_id);
  const value = Math.min(amount, left);
  if (value <= 0) throw new HttpError(409, 'This parcel has already been fully refunded');
  await q.query(
    `INSERT INTO refunds (id, order_id, shipment_id, shop_id, buyer_id, case_id, reason, amount)
     VALUES ($1, $2, $3, $4, $5, $6, 'return', $7)`,
    [newId('rfd'), c.order_id, c.shipment_id, c.shop_id, c.buyer_id, c.id, value],
  );
  return value;
}

// Returns and "not received" cases between buyer and shop.
export function caseRoutes(db) {
  const router = Router();
  router.use(requireUser);

  async function loadFor(user, id) {
    const [row] = await db.query(`${CASE_SELECT} WHERE c.id = $1`, [id]);
    if (!row) throw new HttpError(404, 'Case not found');
    const role =
      row.buyer_id === user.id ? 'buyer' : row.shop_id === user.shopId ? 'shop' : user.isAdmin ? 'staff' : null;
    if (!role) throw new HttpError(404, 'Case not found');
    return { row, role };
  }

  router.post('/', async (req, res) => {
    const body = parse(caseSchema, req.body);
    const [s] = await db.query(
      `SELECT s.*, o.buyer_id FROM shipments s JOIN orders o ON o.id = s.order_id
        WHERE s.order_id = $1 AND s.shop_id = $2`,
      [body.orderId, body.shopId],
    );
    if (!s || s.buyer_id !== req.user.id) throw new HttpError(404, 'Order not found');

    const withinWindow = s.delivered_at && new Date(s.delivered_at) > new Date(Date.now() - RETURN_DAYS * 864e5);
    if (body.kind === 'return') {
      if (s.status !== 'delivered') throw new HttpError(409, 'You can ask for a return once the parcel is delivered');
      if (!withinWindow) throw new HttpError(409, `Returns must be requested within ${RETURN_DAYS} days of delivery`);
      const bought = await db.query('SELECT product_id, name, qty FROM order_items WHERE shipment_id = $1', [s.id]);
      for (const item of body.items) {
        const qty = bought.filter((b) => b.product_id === item.productId).reduce((n, b) => n + b.qty, 0);
        if (!qty) throw new HttpError(400, 'That item is not in this parcel');
        if (item.qty > qty) throw new HttpError(400, `You bought only ${qty} of that item`);
      }
      body.items = body.items.map((i) => ({ ...i, name: bought.find((b) => b.product_id === i.productId).name }));
    } else if (!(s.status === 'dispatched' || (s.status === 'delivered' && withinWindow))) {
      throw new HttpError(409, 'You can report a missing parcel once it has been sent');
    }

    const id = newId('case');
    try {
      await db.query(
        `INSERT INTO cases (id, order_id, shipment_id, shop_id, buyer_id, kind, reason, description, items, photos, events)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          body.orderId,
          s.id,
          body.shopId,
          req.user.id,
          body.kind,
          body.reason,
          body.description,
          JSON.stringify(body.items),
          JSON.stringify(body.photos),
          event('buyer', 'opened', body.description),
        ],
      );
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'There is already an open case for this parcel');
      throw err;
    }
    const [row] = await db.query(`${CASE_SELECT} WHERE c.id = $1`, [id]);
    await notifyShopOwner(db, body.shopId, {
      kind: 'case',
      title: body.kind === 'return' ? `Return request for order ${body.orderId}` : `Missing parcel reported: ${body.orderId}`,
      body: `${body.description} Please reply within ${SHOP_REPLY_DAYS} days.`,
      link: `/cases/${id}`,
    });
    res.status(201).json(toCase(row));
  });

  router.get('/mine', async (req, res) => {
    const rows = await db.query(`${CASE_SELECT} WHERE c.buyer_id = $1 ORDER BY c.updated_at DESC`, [req.user.id]);
    res.json(rows.map(toCase));
  });

  router.get('/shop', async (req, res) => {
    if (!req.user.shopId) throw new HttpError(403, 'Open a shop first');
    const rows = await db.query(
      `${CASE_SELECT} WHERE c.shop_id = $1 ORDER BY (c.status = 'open') DESC, c.updated_at DESC`,
      [req.user.shopId],
    );
    res.json(rows.map(toCase));
  });

  router.get('/:id', async (req, res) => {
    const { row, role } = await loadFor(req.user, req.params.id);
    res.json({ ...toCase(row), viewerRole: role });
  });

  // The shop accepts (refund, replacement or repair) or rejects.
  router.patch('/:id/respond', async (req, res) => {
    const { row, role } = await loadFor(req.user, req.params.id);
    if (role !== 'shop') throw new HttpError(403, 'Only the shop can answer this');
    if (row.status !== 'open') throw new HttpError(409, 'This case has already been answered');
    const body = parse(caseResponseSchema, req.body);
    const updated = await db.tx(async (t) => {
      if (!body.accept) {
        return updateCase(t, row.id, 'shop', 'rejected', body.note, `status = 'rejected', resolution = 'rejected'`);
      }
      let refund = null;
      if (body.resolution === 'refund') {
        refund = await addReturnRefund(t, row, body.refundAmount ?? (await refundableLeft(t, row.shipment_id)));
      }
      return updateCase(
        t,
        row.id,
        'shop',
        `accepted: ${body.resolution}`,
        body.note,
        `status = 'accepted', resolution = $3, refund_amount = $4`,
        [body.resolution, refund],
      );
    });
    const [full] = await db.query(`${CASE_SELECT} WHERE c.id = $1`, [updated.id]);
    await notify(db, row.buyer_id, {
      kind: 'case',
      title: body.accept ? `${full.shop_name} accepted your request (${body.resolution})` : `${full.shop_name} rejected your request`,
      body: body.note,
      link: `/cases/${row.id}`,
    });
    res.json(toCase(full));
  });

  // The buyer asks Zed Market staff to decide.
  router.patch('/:id/escalate', async (req, res) => {
    const { row, role } = await loadFor(req.user, req.params.id);
    if (role !== 'buyer') throw new HttpError(403, 'Only the buyer can escalate');
    if (!toCase(row).canEscalate) {
      throw new HttpError(
        409,
        row.status === 'open'
          ? `The shop has ${SHOP_REPLY_DAYS} days to answer before you can ask Zed Market to step in`
          : 'This case cannot be escalated',
      );
    }
    const { note } = parse(z.object({ note: z.string().trim().max(1000).default('') }), req.body);
    await updateCase(db, row.id, 'buyer', 'escalated', note, `status = 'escalated'`);
    const [full] = await db.query(`${CASE_SELECT} WHERE c.id = $1`, [row.id]);
    res.json(toCase(full));
  });

  router.patch('/:id/withdraw', async (req, res) => {
    const { row, role } = await loadFor(req.user, req.params.id);
    if (role !== 'buyer') throw new HttpError(403, 'Only the buyer can withdraw');
    if (!['open', 'rejected', 'escalated'].includes(row.status))
      throw new HttpError(409, 'This case is already closed');
    await updateCase(db, row.id, 'buyer', 'withdrawn', '', `status = 'withdrawn'`);
    const [full] = await db.query(`${CASE_SELECT} WHERE c.id = $1`, [row.id]);
    res.json(toCase(full));
  });

  return router;
}
