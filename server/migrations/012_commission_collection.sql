-- Shops are paid directly by buyers, so they owe Zed Market the commission.
-- 'payout': Zed Market paid the shop. 'commission': the shop paid Zed Market what it owed.
ALTER TABLE payouts ADD COLUMN kind TEXT NOT NULL DEFAULT 'payout' CHECK (kind IN ('payout', 'commission'));

-- The Mobile Money number (or bank account) shops send their commission to. One row.
CREATE TABLE commission_account (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  network TEXT NOT NULL CHECK (network IN ('mtn', 'airtel', 'zamtel', 'bank')),
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
