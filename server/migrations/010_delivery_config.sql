-- Courier rates and Zed Market Points set by staff in Admin → Delivery.
-- key 'couriers': { courierId: { rates, perKg, maxKg, eta, towns, cod, disabled, description } }
-- key 'points':   [ { id, province, town, name, address, hours, active } ]
CREATE TABLE delivery_config (
  key TEXT PRIMARY KEY CHECK (key IN ('couriers', 'points')),
  value JSONB NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
