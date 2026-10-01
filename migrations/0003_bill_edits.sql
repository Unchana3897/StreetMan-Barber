-- Fixing a bill that was already paid needs a one-time reference code from the owner.
CREATE TABLE IF NOT EXISTS approval_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    used_by TEXT,
    booking_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_approval_codes_code ON approval_codes(code);

-- Every edit to a paid bill, with what it was before and after.
CREATE TABLE IF NOT EXISTS bill_edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    edited_by TEXT NOT NULL,
    edited_at TEXT NOT NULL,
    reason TEXT,
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
);
CREATE INDEX IF NOT EXISTS idx_bill_edits_booking ON bill_edits(booking_id);
