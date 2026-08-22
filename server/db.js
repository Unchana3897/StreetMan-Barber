"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

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

module.exports = db;
