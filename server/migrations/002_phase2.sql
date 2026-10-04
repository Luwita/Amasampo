-- Typo-tolerant product search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX products_name_trgm_idx ON products USING gin (name gin_trgm_ops);

-- Shipping weight per unit, buyer options (size, colour…), low-stock threshold and review counts.
ALTER TABLE products ADD COLUMN weight_kg NUMERIC(8, 2) NOT NULL DEFAULT 1 CHECK (weight_kg > 0);
ALTER TABLE products ADD COLUMN options JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN low_stock_at INT NOT NULL DEFAULT 5 CHECK (low_stock_at >= 0);
ALTER TABLE products ADD COLUMN review_count INT NOT NULL DEFAULT 0;
ALTER TABLE shops ADD COLUMN review_count INT NOT NULL DEFAULT 0;

-- What the buyer chose for each item, e.g. "Size: M, Colour: Black".
ALTER TABLE order_items ADD COLUMN options TEXT NOT NULL DEFAULT '';

-- One review per product per order, only after delivery.
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  shop_id TEXT NOT NULL REFERENCES shops(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id)
);
CREATE INDEX reviews_product_idx ON reviews (product_id, created_at DESC);
CREATE INDEX reviews_shop_idx ON reviews (shop_id, created_at DESC);
