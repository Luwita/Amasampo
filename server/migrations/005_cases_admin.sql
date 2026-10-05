-- Parcels can be cancelled before they are sent.
ALTER TABLE shipments DROP CONSTRAINT shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check
  CHECK (status IN ('pending', 'dispatched', 'delivered', 'cancelled'));
ALTER TABLE shipments ADD COLUMN cancelled_by TEXT CHECK (cancelled_by IN ('buyer', 'seller', 'admin'));
ALTER TABLE shipments ADD COLUMN cancel_reason TEXT;
-- When the parcel was delivered: starts the 7-day returns window.
ALTER TABLE shipments ADD COLUMN delivered_at TIMESTAMPTZ;
UPDATE shipments SET delivered_at = updated_at WHERE status = 'delivered';

-- Returns and "not received" cases between a buyer and a shop, escalated to Zed Market staff if needed.
CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  shipment_id TEXT NOT NULL REFERENCES shipments(id),
  shop_id TEXT NOT NULL REFERENCES shops(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('return', 'not_received')),
  reason TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]',
  photos JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'rejected', 'escalated', 'resolved', 'withdrawn')),
  resolution TEXT CHECK (resolution IN ('refund', 'replacement', 'repair', 'rejected')),
  refund_amount NUMERIC(12, 2),
  events JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- At most one case in progress per parcel.
CREATE UNIQUE INDEX cases_one_active_idx ON cases (shipment_id) WHERE status IN ('open', 'rejected', 'escalated');
CREATE INDEX cases_buyer_idx ON cases (buyer_id, created_at DESC);
CREATE INDEX cases_shop_idx ON cases (shop_id, status);

-- Money owed back to buyers. Paid by staff until payments are automated.
CREATE TABLE refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  shipment_id TEXT NOT NULL REFERENCES shipments(id),
  shop_id TEXT NOT NULL REFERENCES shops(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  case_id TEXT REFERENCES cases(id),
  reason TEXT NOT NULL CHECK (reason IN ('cancelled', 'return')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid')),
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX refunds_status_idx ON refunds (status, created_at);

-- Shop verification and suspension.
ALTER TABLE shops ADD COLUMN verification TEXT NOT NULL DEFAULT 'unverified'
  CHECK (verification IN ('unverified', 'pending', 'verified', 'rejected'));
ALTER TABLE shops ADD COLUMN owner_full_name TEXT;
ALTER TABLE shops ADD COLUMN nrc TEXT;
ALTER TABLE shops ADD COLUMN pacra TEXT;
ALTER TABLE shops ADD COLUMN verification_note TEXT;
ALTER TABLE shops ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE shops ADD COLUMN suspend_reason TEXT;
-- The demo shops have no owner account; treat them as checked.
UPDATE shops SET verification = 'verified' WHERE owner_id IS NULL;

-- Listings removed by staff keep the reason so the seller can see it.
ALTER TABLE products ADD COLUMN removed_reason TEXT;

ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN suspend_reason TEXT;

-- Every staff action, for accountability.
CREATE TABLE admin_actions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_actions_created_idx ON admin_actions (created_at DESC);
