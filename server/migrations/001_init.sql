-- Users sign in with their phone number; `phone` holds the normalised 9 digits (e.g. 977123456).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'buyer' CHECK (account_type IN ('buyer', 'business', 'seller', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending sign-in code per phone. Only a hash of the code is stored.
CREATE TABLE otp_codes (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sign-in sessions. Only a hash of the bearer token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  owner_id TEXT UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  logo TEXT,
  category TEXT,
  province TEXT NOT NULL,
  town TEXT NOT NULL,
  area TEXT,
  phone TEXT NOT NULL,
  couriers JSONB NOT NULL DEFAULT '[]',
  own_rates JSONB,
  rating NUMERIC(2, 1) NOT NULL DEFAULT 0,
  since INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shops_location_idx ON shops (province, town);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  old_price NUMERIC(12, 2),
  tiers JSONB NOT NULL DEFAULT '[]',
  stock INT NOT NULL CHECK (stock >= 0),
  sold INT NOT NULL DEFAULT 0,
  rating NUMERIC(2, 1) NOT NULL DEFAULT 0,
  badge TEXT,
  local BOOLEAN NOT NULL DEFAULT false,
  images JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ -- soft delete keeps past orders intact
);
CREATE INDEX products_shop_idx ON products (shop_id);
CREATE INDEX products_category_idx ON products (category);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  province TEXT NOT NULL,
  town TEXT NOT NULL,
  address TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid', 'cod_due')),
  subtotal NUMERIC(12, 2) NOT NULL,
  delivery NUMERIC(12, 2) NOT NULL,
  total NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_buyer_idx ON orders (buyer_id, created_at DESC);

-- Each shop in an order sends its own parcel.
CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  courier TEXT NOT NULL,
  courier_name TEXT NOT NULL,
  fee NUMERIC(12, 2) NOT NULL,
  eta TEXT NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'delivered')),
  tracking TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, shop_id)
);
CREATE INDEX shipments_shop_idx ON shipments (shop_id, status);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(12, 2) NOT NULL
);
