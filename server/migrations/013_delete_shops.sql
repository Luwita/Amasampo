-- Shops deleted by an owner of Zed Market. A shop that never sold anything is removed completely.
-- A shop with past orders is kept as a hidden record (deleted_at set, owner released), so buyers keep
-- their order history and any commission still owed stays on the books.
ALTER TABLE shops ADD COLUMN deleted_at TIMESTAMPTZ;
