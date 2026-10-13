-- Mobile Money paid straight to the shop (until a payment provider is connected).
-- Each shop gives the Mobile Money number buyers send money to.
ALTER TABLE shops ADD COLUMN momo_network TEXT CHECK (momo_network IN ('mtn', 'airtel', 'zamtel'));
ALTER TABLE shops ADD COLUMN momo_number TEXT;
ALTER TABLE shops ADD COLUMN momo_name TEXT;

-- 'momo_direct': the buyer pays each shop's Mobile Money number; each parcel is paid separately.
ALTER TABLE orders DROP CONSTRAINT orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'cod_due', 'momo_direct'));

-- payment_sent_at / payment_ref: the buyer says they sent the money (with their transaction ID).
-- paid_at: the shop confirmed the money arrived; only then can the parcel be sent.
ALTER TABLE shipments ADD COLUMN payment_sent_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN payment_ref TEXT;
ALTER TABLE shipments ADD COLUMN paid_at TIMESTAMPTZ;
