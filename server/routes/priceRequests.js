import { Router } from 'express';
import { checkChoice } from '../../src/data/options.js';
import { requireUser } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { toProduct } from '../mappers.js';
import { notify, notifyShopOwner } from '../notify.js';
import { LIVE_SHOP, myShopOrFail } from '../queries.js';
import { priceRequestSchema, priceResponseSchema } from '../schemas.js';

// Status shown to people: a quoted or accepted price past its date has expired.
const effectiveStatus = (row) =>
  ['quoted', 'accepted'].includes(row.status) && row.valid_until && new Date(row.valid_until) < new Date()
    ? 'expired'
    : row.status;

const toRequest = (row) => ({
  id: row.id,
  productId: row.product_id,
  productName: row.product_name,
  productPrice: row.product_price == null ? null : Number(row.product_price),
  shopId: row.shop_id,
  shopName: row.shop_name,
  buyerName: row.buyer_name,
  buyerPhone: row.buyer_phone ? `0${row.buyer_phone}` : null,
  qty: row.qty,
  options: row.options,
  targetPrice: row.target_price == null ? null : Number(row.target_price),
  note: row.note,
  province: row.province,
  town: row.town,
  status: effectiveStatus(row),
  quotedPrice: row.quoted_price == null ? null : Number(row.quoted_price),
  sellerNote: row.seller_note,
  validUntil: row.valid_until,
  date: row.created_at,
});

const SELECT = `SELECT r.*, p.name AS product_name, p.price AS product_price, sh.name AS shop_name,
                       u.name AS buyer_name, u.phone AS buyer_phone
                  FROM price_requests r JOIN products p ON p.id = r.product_id JOIN shops sh ON sh.id = r.shop_id
                  JOIN users u ON u.id = r.buyer_id`;

// Wholesale price requests: the buyer asks, the shop quotes, the buyer accepts and checks out at that price.
export function priceRequestRoutes(db) {
  const router = Router();
  router.use(requireUser);

  router.post('/', async (req, res) => {
    const body = parse(priceRequestSchema, req.body);
    const [row] = await db.query(
      `SELECT p.* FROM products p JOIN shops sh ON sh.id = p.shop_id
        WHERE p.id = $1 AND p.deleted_at IS NULL AND ${LIVE_SHOP}`,
      [body.productId],
    );
    if (!row) throw new HttpError(404, 'Product not found');
    const product = toProduct(row);
    if (product.shopId === req.user.shopId) throw new HttpError(400, "You can't request a price from your own shop");
    const problem = checkChoice(product, body.options);
    if (problem) throw new HttpError(400, problem);
    const [open] = await db.query(
      `SELECT 1 FROM price_requests WHERE buyer_id = $1 AND product_id = $2 AND status = 'open'`,
      [req.user.id, product.id],
    );
    if (open) throw new HttpError(409, 'You already have an open price request for this product');

    const id = newId('prq');
    await db.query(
      `INSERT INTO price_requests (id, product_id, shop_id, buyer_id, qty, options, target_price, note, province, town)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        product.id,
        product.shopId,
        req.user.id,
        body.qty,
        JSON.stringify(body.options),
        body.targetPrice || null,
        body.note,
        body.province,
        body.town,
      ],
    );
    const [created] = await db.query(`${SELECT} WHERE r.id = $1`, [id]);
    await notifyShopOwner(db, product.shopId, {
      kind: 'quote',
      title: `Price request: ${body.qty} × ${product.name}`,
      body: body.note,
      link: '/seller?tab=quotes',
    });
    res.status(201).json(toRequest(created));
  });

  router.get('/mine', async (req, res) => {
    const rows = await db.query(`${SELECT} WHERE r.buyer_id = $1 ORDER BY r.updated_at DESC`, [req.user.id]);
    res.json(rows.map(toRequest));
  });

  router.get('/shop', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const rows = await db.query(`${SELECT} WHERE r.shop_id = $1 ORDER BY (r.status = 'open') DESC, r.updated_at DESC`, [
      shop.id,
    ]);
    res.json(rows.map(toRequest));
  });

  // The shop answers with a price (valid for some days) or declines.
  router.patch('/:id/respond', async (req, res) => {
    const shop = await myShopOrFail(db, req.user);
    const body = parse(priceResponseSchema, req.body);
    const rows = body.decline
      ? await db.query(
          `UPDATE price_requests SET status = 'declined', seller_note = $3, updated_at = now()
            WHERE id = $1 AND shop_id = $2 AND status = 'open' RETURNING id`,
          [req.params.id, shop.id, body.note],
        )
      : await db.query(
          `UPDATE price_requests SET status = 'quoted', quoted_price = $3, seller_note = $4,
                  valid_until = now() + make_interval(days => $5), updated_at = now()
            WHERE id = $1 AND shop_id = $2 AND status = 'open' RETURNING id`,
          [req.params.id, shop.id, body.price, body.note, body.validDays],
        );
    if (!rows.length) throw new HttpError(409, 'This request has already been answered');
    const [row] = await db.query(`${SELECT} WHERE r.id = $1`, [req.params.id]);
    await notify(db, row.buyer_id, {
      kind: 'quote',
      title: body.decline ? `${shop.name} can't offer a price` : `${shop.name} offered K${body.price} each`,
      body: `For ${row.qty} × ${row.product_name}. ${body.note ?? ''}`.trim(),
      link: '/account?tab=quotes',
    });
    res.json(toRequest(row));
  });

  // The buyer accepts a quoted price; it can then be used once at checkout before it expires.
  router.patch('/:id/accept', async (req, res) => {
    const [current] = await db.query(`${SELECT} WHERE r.id = $1 AND r.buyer_id = $2`, [req.params.id, req.user.id]);
    if (!current) throw new HttpError(404, 'Price request not found');
    const status = effectiveStatus(current);
    if (status === 'expired') throw new HttpError(409, 'This price has expired. Ask the shop for a new one.');
    if (status !== 'quoted') throw new HttpError(409, 'There is no price to accept yet');
    await db.query(`UPDATE price_requests SET status = 'accepted', updated_at = now() WHERE id = $1`, [current.id]);
    const [row] = await db.query(`${SELECT} WHERE r.id = $1`, [current.id]);
    res.json(toRequest(row));
  });

  return router;
}
