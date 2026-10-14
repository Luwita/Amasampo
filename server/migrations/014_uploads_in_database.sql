-- Photos are kept in the database, so they survive on hosts whose disk is wiped on every restart or deploy
-- (e.g. Render's free plan), and every server shares them. Photos saved to disk before this still work.
CREATE TABLE uploads (
  name TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  size INT NOT NULL,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
