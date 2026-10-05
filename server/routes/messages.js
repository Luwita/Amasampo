import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { isLive } from '../queries.js';
import { messageSchema } from '../schemas.js';

const PER_MINUTE = 20;

const toConversation = (row, role) => ({
  id: row.id,
  role, // whether the signed-in user is the buyer or the shop in this conversation
  shopId: row.shop_id,
  shopName: row.shop_name,
  buyerName: row.buyer_name,
  withName: role === 'buyer' ? row.shop_name : row.buyer_name,
  productId: row.product_id,
  productName: row.product_name,
  lastMessage: row.last_message,
  lastMessageAt: row.last_message_at,
  unread: role === 'buyer' ? row.buyer_unread : row.seller_unread,
});

const toMessage = (row) => ({
  id: row.id,
  from: row.sender_role,
  body: row.body,
  productId: row.product_id,
  date: row.created_at,
});

const SELECT = `SELECT c.*, sh.name AS shop_name, u.name AS buyer_name, p.name AS product_name
                  FROM conversations c JOIN shops sh ON sh.id = c.shop_id JOIN users u ON u.id = c.buyer_id
                  LEFT JOIN products p ON p.id = c.product_id`;

export function messageRoutes(db) {
  const router = Router();
  router.use(requireUser);

  const roleIn = (user, c) =>
    c.buyer_id === user.id ? 'buyer' : user.shopId && c.shop_id === user.shopId ? 'seller' : null;

  async function loadConversation(user, id) {
    const [row] = await db.query(`${SELECT} WHERE c.id = $1`, [id]);
    const role = row && roleIn(user, row);
    if (!role) throw new HttpError(404, 'Conversation not found');
    return { row, role };
  }

  async function checkRate(user) {
    const [{ n }] = await db.query(
      `SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE m.created_at > now() - interval '1 minute'
          AND ((m.sender_role = 'buyer' AND c.buyer_id = $1) OR (m.sender_role = 'seller' AND c.shop_id = $2))`,
      [user.id, user.shopId],
    );
    if (n >= PER_MINUTE) throw new HttpError(429, 'You are sending messages too quickly. Please wait a minute.');
  }

  async function addMessage(t, conversationId, role, body, productId) {
    await t.query(
      'INSERT INTO messages (id, conversation_id, sender_role, body, product_id) VALUES ($1, $2, $3, $4, $5)',
      [newId('msg'), conversationId, role, body, productId ?? null],
    );
    const other = role === 'buyer' ? 'seller_unread' : 'buyer_unread';
    await t.query(
      `UPDATE conversations SET last_message = left($2, 140), last_message_at = now(), ${other} = ${other} + 1
        WHERE id = $1`,
      [conversationId, body],
    );
  }

  // A buyer starts (or continues) a conversation with a shop.
  router.post('/', async (req, res) => {
    const { shopId, ...msg } = parse(messageSchema.extend({ shopId: z.string() }), req.body);
    if (shopId === req.user.shopId) throw new HttpError(400, "You can't message your own shop");
    const [shop] = await db.query('SELECT * FROM shops WHERE id = $1', [shopId]);
    if (!shop || !isLive(shop)) throw new HttpError(404, 'Shop not found');
    await checkRate(req.user);
    const id = await db.tx(async (t) => {
      const [row] = await t.query(
        `INSERT INTO conversations (id, shop_id, buyer_id, product_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (shop_id, buyer_id) DO UPDATE SET product_id = COALESCE(EXCLUDED.product_id, conversations.product_id)
         RETURNING id`,
        [newId('cnv'), shopId, req.user.id, msg.productId ?? null],
      );
      await addMessage(t, row.id, 'buyer', msg.body, msg.productId);
      return row.id;
    });
    res.status(201).json({ id });
  });

  router.get('/', async (req, res) => {
    const rows = await db.query(`${SELECT} WHERE c.buyer_id = $1 OR c.shop_id = $2 ORDER BY c.last_message_at DESC`, [
      req.user.id,
      req.user.shopId,
    ]);
    res.json(rows.map((r) => toConversation(r, roleIn(req.user, r))));
  });

  router.get('/unread', async (req, res) => {
    const [{ count }] = await db.query(
      `SELECT COALESCE(sum(CASE WHEN buyer_id = $1 THEN buyer_unread ELSE 0 END)
                     + sum(CASE WHEN shop_id = $2 THEN seller_unread ELSE 0 END), 0)::int AS count
         FROM conversations WHERE buyer_id = $1 OR shop_id = $2`,
      [req.user.id, req.user.shopId],
    );
    res.json({ count });
  });

  // Opening a conversation marks it read for the signed-in side.
  router.get('/:id', async (req, res) => {
    const { row, role } = await loadConversation(req.user, req.params.id);
    await db.query(`UPDATE conversations SET ${role}_unread = 0 WHERE id = $1`, [row.id]);
    const messages = await db.query(
      `SELECT * FROM (SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 200) m
        ORDER BY created_at`,
      [row.id],
    );
    res.json({ ...toConversation(row, role), unread: 0, messages: messages.map(toMessage) });
  });

  router.post('/:id/messages', async (req, res) => {
    const { row, role } = await loadConversation(req.user, req.params.id);
    const msg = parse(messageSchema, req.body);
    await checkRate(req.user);
    await db.tx((t) => addMessage(t, row.id, role, msg.body, msg.productId));
    res.status(201).json({ ok: true });
  });

  return router;
}
