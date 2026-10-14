-- Accounts are run by Neon Auth (sign-up with email or Google, then a phone number is linked).
-- auth_id is the Neon Auth user id; the phone number is filled in once the person has verified one.
ALTER TABLE users ADD COLUMN auth_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- Test mode only (SHOW_SIGNIN_CODES=1): the latest code sent to a phone number or email address, so it can be
-- shown on screen while SMS isn't paid for. Never used for staff or owners.
CREATE TABLE test_codes (
  sent_to TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
