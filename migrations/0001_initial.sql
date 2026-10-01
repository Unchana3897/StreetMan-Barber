-- Baseline schema the Worker already expects on D1.
-- Every statement is IF NOT EXISTS / OR IGNORE, so applying this to the
-- existing production database changes nothing.

CREATE TABLE IF NOT EXISTS barbers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'barber',
    active INTEGER NOT NULL DEFAULT 1,
    day_off INTEGER
);

CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    service TEXT NOT NULL,
    barber_id TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    extras TEXT NOT NULL DEFAULT '[]',
    reminded_at TEXT,
    cancel_token TEXT,
    payment_method TEXT,
    paid_at TEXT,
    FOREIGN KEY (barber_id) REFERENCES barbers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot
    ON bookings(barber_id, date, time)
    WHERE status != 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_cancel_token
    ON bookings(cancel_token)
    WHERE cancel_token IS NOT NULL AND cancel_token != '';

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    barber_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO shop_settings (key, value) VALUES ('closed', '0');
INSERT OR IGNORE INTO shop_settings (key, value) VALUES ('closed_note', '');

CREATE TABLE IF NOT EXISTS barber_blocks (
    barber_id TEXT NOT NULL,
    date TEXT NOT NULL,
    slot TEXT NOT NULL,
    PRIMARY KEY (barber_id, date, slot),
    FOREIGN KEY (barber_id) REFERENCES barbers(id)
);
