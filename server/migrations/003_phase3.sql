-- Buyer ↔ shop messages: one conversation per buyer per shop.
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT REFERENCES products(id),
  last_message TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  buyer_unread INT NOT NULL DEFAULT 0,
  seller_unread INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, buyer_id)
);
CREATE INDEX conversations_buyer_idx ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX conversations_shop_idx ON conversations (shop_id, last_message_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('buyer', 'seller')),
  body TEXT NOT NULL,
  product_id TEXT REFERENCES products(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);

-- Shop discount codes.
CREATE TABLE coupons (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'amount')),
  value NUMERIC(12, 2) NOT NULL CHECK (value > 0),
  min_spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_uses INT CHECK (max_uses > 0),
  uses INT NOT NULL DEFAULT 0,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, code)
);
ALTER TABLE shipments ADD COLUMN discount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN coupon_code TEXT;
ALTER TABLE orders ADD COLUMN discount NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Featured listings shown on the home page.
ALTER TABLE products ADD COLUMN featured_until TIMESTAMPTZ;

-- Wholesale price requests ("request a quote").
CREATE TABLE price_requests (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  shop_id TEXT NOT NULL REFERENCES shops(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  qty INT NOT NULL CHECK (qty > 0),
  options JSONB NOT NULL DEFAULT '{}',
  target_price NUMERIC(12, 2),
  note TEXT NOT NULL DEFAULT '',
  province TEXT NOT NULL,
  town TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'quoted', 'declined', 'accepted', 'ordered')),
  quoted_price NUMERIC(12, 2),
  seller_note TEXT,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX price_requests_buyer_idx ON price_requests (buyer_id, created_at DESC);
CREATE INDEX price_requests_shop_idx ON price_requests (shop_id, status, created_at DESC);
ALTER TABLE order_items ADD COLUMN price_request_id TEXT REFERENCES price_requests(id);

-- Tax details printed on receipts.
ALTER TABLE shops ADD COLUMN tpin TEXT;
ALTER TABLE shops ADD COLUMN vat_registered BOOLEAN NOT NULL DEFAULT false;

-- Account deletion (personal data is removed; the row stays so past orders keep their references).
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
