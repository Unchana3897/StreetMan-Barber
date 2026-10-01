-- Phones (and POS / owner browsers) that turned on notifications.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    barber_id TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (barber_id) REFERENCES barbers(id)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_barber ON push_subscriptions(barber_id);
