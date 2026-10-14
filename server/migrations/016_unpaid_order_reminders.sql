-- Unpaid Mobile Money orders: when the buyer was reminded to pay, and when the shop was reminded to confirm a
-- payment the buyer says they sent. Each reminder goes out once.
ALTER TABLE shipments ADD COLUMN payment_reminded_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN shop_reminded_at TIMESTAMPTZ;
