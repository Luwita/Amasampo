-- Map positions, used to price Yango deliveries by distance (like Yango's own app).
-- A shop's position is where it is; an order's is where the buyer wants it delivered. Both optional.
ALTER TABLE shops ADD COLUMN lat DOUBLE PRECISION;
ALTER TABLE shops ADD COLUMN lng DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN lat DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN lng DOUBLE PRECISION;
