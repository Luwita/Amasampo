-- In-app notifications (the bell and its red dot).
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- Customer support conversations with Zed Market staff.
CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  user_unread INT NOT NULL DEFAULT 0,
  staff_unread INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user_idx ON support_tickets (user_id, last_message_at DESC);
CREATE INDEX support_tickets_status_idx ON support_tickets (status, last_message_at DESC);
CREATE TABLE support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  from_staff BOOLEAN NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket_idx ON support_messages (ticket_id, created_at);

-- Buying requests ("I'm looking for…") and offers from shops.
CREATE TABLE buying_requests (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT,
  qty INT NOT NULL CHECK (qty > 0),
  unit TEXT NOT NULL DEFAULT 'units',
  budget NUMERIC(12, 2),
  province TEXT NOT NULL,
  town TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  accepted_offer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX buying_requests_open_idx ON buying_requests (status, created_at DESC);
CREATE TABLE request_offers (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES buying_requests(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  note TEXT NOT NULL DEFAULT '',
  product_id TEXT REFERENCES products(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, shop_id)
);

-- Invite codes and vouchers funded by Zed Market.
ALTER TABLE users ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN referred_by TEXT REFERENCES users(id);
UPDATE users SET referral_code = 'ZM' || upper(substr(md5(id), 1, 6)) WHERE referral_code IS NULL;
CREATE TABLE vouchers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  min_spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK (reason IN ('welcome', 'referral')),
  related_user_id TEXT REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_order_id TEXT REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vouchers_user_idx ON vouchers (user_id, expires_at);
-- One referral reward per invited friend.
CREATE UNIQUE INDEX vouchers_one_referral_idx ON vouchers (user_id, related_user_id) WHERE reason = 'referral';
ALTER TABLE orders ADD COLUMN voucher_id TEXT REFERENCES vouchers(id);
ALTER TABLE orders ADD COLUMN voucher_discount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN voucher_discount NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Zed Market Points: which collection point a parcel goes to.
ALTER TABLE shipments ADD COLUMN pickup_point TEXT;

-- 1-click resell: which listing a product was copied from.
ALTER TABLE products ADD COLUMN source_product_id TEXT REFERENCES products(id);

-- Customisable shop pages.
ALTER TABLE shops ADD COLUMN banner TEXT;
ALTER TABLE shops ADD COLUMN about TEXT;
ALTER TABLE shops ADD COLUMN opening_hours TEXT;
