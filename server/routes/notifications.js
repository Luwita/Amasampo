import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { parse } from '../http.js';

const toNotification = (r) => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link,
  read: !!r.read_at,
  date: r.created_at,
});

export function notificationRoutes(db) {
  const router = Router();
  router.use(requireUser);

  router.get('/', async (req, res) => {
    const rows = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60',
      [req.user.id]
    );
    res.json(rows.map(toNotification));
  });

  // Everything the header's red dots need, in one request.
  router.get('/counts', async (req, res) => {
    const [row] = await db.query(
      `SELECT
         (SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL)::int AS notifications,
         (SELECT COALESCE(sum(CASE WHEN buyer_id = $1 THEN buyer_unread ELSE 0 END)
                        + sum(CASE WHEN shop_id = $2 THEN seller_unread ELSE 0 END), 0)
            FROM conversations WHERE buyer_id = $1 OR shop_id = $2)::int AS messages,
         (SELECT COALESCE(sum(user_unread), 0) FROM support_tickets WHERE user_id = $1)::int AS support,
         (SELECT count(*) FROM shipments WHERE shop_id = $2 AND status = 'pending')::int AS to_dispatch`,
      [req.user.id, req.user.shopId]
    );
    res.json({
      notifications: row.notifications,
      messages: row.messages + row.support,
      toDispatch: row.to_dispatch,
    });
  });

  // Mark some (ids) or all notifications as read.
  router.post('/read', async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(z.string()).max(100).optional() }), req.body);
    if (ids?.length) {
      await db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2) AND read_at IS NULL', [
        req.user.id,
        ids,
      ]);
    } else {
      await db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    }
    res.json({ ok: true });
  });

  return router;
}
