-- Staff accounts added in the admin panel (owners come from ADMIN_PHONES). Staff accounts never own a shop.
ALTER TABLE users ADD COLUMN is_staff BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN staff_since TIMESTAMPTZ;

-- Platform settings staff can change (commission rate, voucher amounts…). Missing keys use the defaults in code.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value NUMERIC(12, 4) NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The commission rate is fixed when the order is placed, so changing the rate never rewrites past statements.
ALTER TABLE shipments ADD COLUMN commission_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.05;
