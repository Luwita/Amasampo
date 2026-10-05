-- Homepage banners managed by Zed Market staff.
CREATE TABLE banners (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT 'Shop now',
  link TEXT NOT NULL,
  image TEXT,
  theme TEXT NOT NULL DEFAULT 'orange',
  position INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Voucher campaigns paid for by Zed Market, e.g. "K30 off for everyone in Southern Province".
CREATE TABLE voucher_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  min_spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  audience TEXT NOT NULL CHECK (audience IN ('all', 'buyers', 'sellers', 'province', 'phone')),
  province TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  issued INT NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vouchers DROP CONSTRAINT vouchers_reason_check;
ALTER TABLE vouchers ADD CONSTRAINT vouchers_reason_check CHECK (reason IN ('welcome', 'referral', 'campaign'));
ALTER TABLE vouchers ADD COLUMN campaign_id TEXT REFERENCES voucher_campaigns(id);
ALTER TABLE vouchers ADD COLUMN note TEXT;
CREATE INDEX vouchers_campaign_idx ON vouchers (campaign_id);

-- Messages from Zed Market to many users at once, delivered to the bell.
CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  audience TEXT NOT NULL CHECK (audience IN ('all', 'buyers', 'sellers', 'province')),
  province TEXT,
  sent INT NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Money paid out to shops for delivered orders (Mobile Money or bank transfer).
CREATE TABLE payouts (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('mtn', 'airtel', 'zamtel', 'bank')),
  reference TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payouts_shop_idx ON payouts (shop_id, created_at DESC);

-- Staff can take down spam or prohibited buying requests.
ALTER TABLE buying_requests ADD COLUMN removed_at TIMESTAMPTZ;
ALTER TABLE buying_requests ADD COLUMN removed_reason TEXT;
