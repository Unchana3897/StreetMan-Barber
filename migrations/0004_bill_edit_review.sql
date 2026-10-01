-- Edits saved without an owner code (owner unreachable) wait for review.
-- status: 'approved' (made with a code, or approved later), 'pending', 'rejected' (bill restored).
ALTER TABLE bill_edits ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE bill_edits ADD COLUMN reviewed_by TEXT;
ALTER TABLE bill_edits ADD COLUMN reviewed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_bill_edits_status ON bill_edits(status);
