-- Barber self-signup (pending until Rim approves) and forced password change.
ALTER TABLE barbers ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE barbers ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

-- Accounts still on the old shared default password ("StreetMan2026", which
-- was published in the source) must pick a new one on their next login.
UPDATE barbers
SET must_change_password = 1
WHERE password_hash = 'sha256:a854b41c0bb1f3658441aecc0f575dba70259d688c15c2b06b6fae30042a7be5';

-- Anyone who knew the published password may already hold a session; sign those accounts out everywhere.
DELETE FROM sessions
WHERE barber_id IN (SELECT id FROM barbers WHERE must_change_password = 1);

-- Failed login / signup counters for rate limiting.
CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    window_start INTEGER NOT NULL
);

-- End of the occupied range, so a booking can be inserted with one atomic
-- overlap check. Older rows are backfilled by the Worker on first request.
ALTER TABLE bookings ADD COLUMN end_time TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_barber_date ON bookings(barber_id, date);
