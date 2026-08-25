"use strict";

const path = require("path");
const Database = require("better-sqlite3");
const { ensureDataDir } = require("./paths");

const dataDir = ensureDataDir();

const db = new Database(path.join(dataDir, "streetman.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS barbers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'barber',
    active INTEGER NOT NULL DEFAULT 1
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
    FOREIGN KEY (barber_id) REFERENCES barbers(id)
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    barber_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot
    ON bookings(barber_id, date, time)
    WHERE status != 'cancelled';

CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    barber_id TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (barber_id) REFERENCES barbers(id)
);
`);

function hasColumn(table, column) {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

if (!hasColumn("barbers", "role")) {
    db.exec("ALTER TABLE barbers ADD COLUMN role TEXT NOT NULL DEFAULT 'barber'");
}
if (!hasColumn("barbers", "active")) {
    db.exec("ALTER TABLE barbers ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
}
db.prepare("UPDATE barbers SET role = 'owner' WHERE id = 'rim'").run();

if (!hasColumn("bookings", "extras")) {
    db.exec("ALTER TABLE bookings ADD COLUMN extras TEXT NOT NULL DEFAULT '[]'");
}
if (!hasColumn("bookings", "reminded_at")) {
    db.exec("ALTER TABLE bookings ADD COLUMN reminded_at TEXT");
}
if (!hasColumn("bookings", "cancel_token")) {
    db.exec("ALTER TABLE bookings ADD COLUMN cancel_token TEXT");
}
if (!hasColumn("bookings", "payment_method")) {
    db.exec("ALTER TABLE bookings ADD COLUMN payment_method TEXT");
}
if (!hasColumn("bookings", "paid_at")) {
    db.exec("ALTER TABLE bookings ADD COLUMN paid_at TEXT");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_cancel_token ON bookings(cancel_token) WHERE cancel_token IS NOT NULL AND cancel_token != ''");

const crypto = require("crypto");
const missingTokens = db.prepare("SELECT id FROM bookings WHERE cancel_token IS NULL OR cancel_token = ''").all();
const fillToken = db.prepare("UPDATE bookings SET cancel_token = ? WHERE id = ?");
missingTokens.forEach((row) => {
    fillToken.run(crypto.randomBytes(8).toString("hex"), row.id);
});

db.exec(`
CREATE TABLE IF NOT EXISTS shop_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`);
db.prepare("INSERT OR IGNORE INTO shop_settings (key, value) VALUES ('closed', '0')").run();
db.prepare("INSERT OR IGNORE INTO shop_settings (key, value) VALUES ('closed_note', '')").run();

module.exports = db;
