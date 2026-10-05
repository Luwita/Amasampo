-- From now on a shop is only visible to buyers once Zed Market staff approve it (verification = 'verified').
-- Shops that already existed were open before reviews started, so they stay open.
UPDATE shops
   SET verification = 'verified',
       verification_note = COALESCE(verification_note, 'Approved automatically: open before shop reviews started')
 WHERE verification IN ('unverified', 'pending');
