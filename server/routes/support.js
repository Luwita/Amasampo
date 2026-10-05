import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireUser } from '../auth.js';
import { HttpError, newId, parse } from '../http.js';
import { notify } from '../notify.js';
import { logAdmin } from '../queries.js';

const body = z.string().trim().min(2, 'Write a message').max(3000);

const toTicket = (r) => ({
  id: r.id,
  subject: r.subject,
  orderId: r.order_id,
  status: r.status,
  userName: r.user_name,
  userPhone: r.user_phone ? `0${r.user_phone}` : undefined,
  unread: r.unread,
  lastMessageAt: r.last_message_at,
  date: r.created_at,
});
const toMessage = (m) => ({ id: m.id, fromStaff: m.from_staff, author: m.author_name, body: m.body, date: m.created_at });

const SELECT = `SELECT t.*, u.name AS user_name, u.phone AS user_phone FROM support_tickets t JOIN users u ON u.id = t.user_id`;

async function addMessage(q, ticketId, fromStaff, authorName, text) {
  await q.query(
    'INSERT INTO support_messages (id, ticket_id, from_staff, author_name, body) VALUES ($1, $2, $3, $4, $5)',
    [newId('smg'), ticketId, fromStaff, authorName, text]
  );
  const counter = fromStaff ? 'user_unread' : 'staff_unread';
  await q.query(
    `UPDATE support_tickets SET ${counter} = ${counter} + 1, last_message_at = now(), status = 'open' WHERE id = $1`,
    [ticketId]
  );
}

async function thread(db, ticket, reader) {
  await db.query(`UPDATE support_tickets SET ${reader}_unread = 0 WHERE id = $1`, [ticket.id]);
  const messages = await db.query('SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at', [ticket.id]);
  return { ...toTicket(ticket), unread: 0, messages: messages.map(toMessage) };
}

// Customers (buyers and shop owners) talking to Zed Market staff.
export function supportRoutes(db) {
  const router = Router();
  router.use(requireUser);

  router.post('/', async (req, res) => {
    const b = parse(
      z.object({ subject: z.string().trim().min(3, 'Give your question a short title').max(120), body, orderId: z.string().max(40).optional() }),
      req.body
    );
    const id = newId('tkt');
    await db.tx(async (t) => {
      await t.query('INSERT INTO support_tickets (id, user_id, subject, order_id) VALUES ($1, $2, $3, $4)', [
        id,
        req.user.id,
        b.subject,
        b.orderId || null,
      ]);
      await addMessage(t, id, false, req.user.name, b.body);
    });
    res.status(201).json({ id });
  });

  router.get('/', async (req, res) => {
    const rows = await db.query(
      `${SELECT.replace('t.*,', 't.*, t.user_unread AS unread,')} WHERE t.user_id = $1 ORDER BY t.last_message_at DESC`,
      [req.user.id]
    );
    res.json(rows.map(toTicket));
  });

  router.get('/:id', async (req, res) => {
    const [ticket] = await db.query(`${SELECT} WHERE t.id = $1 AND t.user_id = $2`, [req.params.id, req.user.id]);
    if (!ticket) throw new HttpError(404, 'Conversation not found');
    res.json(await thread(db, ticket, 'user'));
  });

  router.post('/:id/messages', async (req, res) => {
    const [ticket] = await db.query('SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!ticket) throw new HttpError(404, 'Conversation not found');
    await db.tx((t) => addMessage(t, ticket.id, false, req.user.name, parse(z.object({ body }), req.body).body));
    res.status(201).json({ ok: true });
  });

  return router;
}

// Staff side, mounted under /api/admin/support.
export function supportAdminRoutes(db) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['open', 'closed']).optional() }), req.query);
    const rows = await db.query(
      `${SELECT.replace('t.*,', 't.*, t.staff_unread AS unread,')}
        WHERE ($1::text IS NULL OR t.status = $1) ORDER BY t.staff_unread > 0 DESC, t.last_message_at DESC LIMIT 100`,
      [status ?? null]
    );
    res.json(rows.map(toTicket));
  });

  router.get('/:id', async (req, res) => {
    const [ticket] = await db.query(`${SELECT} WHERE t.id = $1`, [req.params.id]);
    if (!ticket) throw new HttpError(404, 'Conversation not found');
    res.json(await thread(db, ticket, 'staff'));
  });

  router.post('/:id/messages', async (req, res) => {
    const [ticket] = await db.query('SELECT * FROM support_tickets WHERE id = $1', [req.params.id]);
    if (!ticket) throw new HttpError(404, 'Conversation not found');
    const text = parse(z.object({ body }), req.body).body;
    await db.tx(async (t) => {
      await addMessage(t, ticket.id, true, `${req.user.name} (Zed Market)`, text);
      await notify(t, ticket.user_id, {
        kind: 'support',
        title: 'Zed Market support replied',
        body: text,
        link: `/help/${ticket.id}`,
      });
    });
    res.status(201).json({ ok: true });
  });

  router.patch('/:id', async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['open', 'closed']) }), req.body);
    await db.tx(async (t) => {
      const rows = await t.query('UPDATE support_tickets SET status = $2 WHERE id = $1 RETURNING id', [req.params.id, status]);
      if (!rows.length) throw new HttpError(404, 'Conversation not found');
      await logAdmin(t, req.user.id, `support ${status}`, 'support', req.params.id);
    });
    res.json({ ok: true });
  });

  return router;
}
