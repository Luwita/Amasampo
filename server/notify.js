import { newId } from './http.js';

// Notifications people must not miss also go out as a text message: orders, payments, cancellations, returns,
// refunds, payouts, price quotes and offers, and decisions about a shop. Vouchers, announcements, listings and
// support replies stay in the app only, so a campaign to everyone never sends thousands of texts.
const SMS_KINDS = new Set(['order', 'payment', 'cancelled', 'case', 'refund', 'payout', 'quote', 'offer', 'shop']);
const SMS_MAX = 160; // one text message

let sms = null;
// Called once when the API starts. Without it (or with `null`) notifications stay in the app only.
export function sendNotificationsBySms(sender) {
  sms = sender;
}

// Plain text that fits one SMS: phones bill emoji and special characters as several messages.
export function smsText(title, body = '') {
  const text = `Zed Market: ${[title, body].filter(Boolean).join('. ')}`
    .replace(/[·–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, 'x')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/([.!?])\./g, '$1')
    .trim();
  return text.length > SMS_MAX ? `${text.slice(0, SMS_MAX - 3).trimEnd()}...` : text;
}

// In-app notifications (the bell), with a text message for the important ones.
// `q` is the database or the current transaction.
export async function notify(q, userId, { kind, title, body = '', link = null }) {
  if (!userId) return;
  await q.query('INSERT INTO notifications (id, user_id, kind, title, body, link) VALUES ($1, $2, $3, $4, $5, $6)', [
    newId('ntf'),
    userId,
    kind,
    title,
    body.slice(0, 300),
    link,
  ]);
  if (!sms || !SMS_KINDS.has(kind)) return;
  const [user] = await q.query('SELECT phone FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  if (!user?.phone) return;
  // A text that can't be sent never fails the order or payment it belongs to; the bell still has it.
  const send = () =>
    Promise.resolve()
      .then(() => sms.send(user.phone, smsText(title, body)))
      .catch((err) => console.error(`[sms] notification not sent to 0${user.phone}: ${err.message}`));
  if (q.afterCommit) q.afterCommit(send);
  else send();
}

export async function notifyShopOwner(q, shopId, message) {
  const [shop] = await q.query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);
  if (shop?.owner_id) await notify(q, shop.owner_id, message);
}

export async function notifyBuyerOfOrder(q, orderId, message) {
  const [order] = await q.query('SELECT buyer_id FROM orders WHERE id = $1', [orderId]);
  if (order) await notify(q, order.buyer_id, message);
}
