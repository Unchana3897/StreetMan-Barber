"use strict";

const bcrypt = require("bcryptjs");
const db = require("./db");

const DEFAULT_PASSWORD = process.env.BARBER_DEFAULT_PASSWORD || "StreetMan2026";

const BARBERS = [
    { id: "rim", name: "Rim", username: "rim", role: "owner" },
    { id: "bank", name: "Bank", username: "bank", role: "barber" },
    { id: "rick", name: "Rick", username: "rick", role: "barber" },
    { id: "dee", name: "Dee", username: "dee", role: "barber" }
];

function seed() {
    const count = db.prepare("SELECT COUNT(*) AS c FROM barbers").get().c;
    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    if (count === 0) {
        const insert = db.prepare(`
            INSERT INTO barbers (id, name, username, password_hash, role, active)
            VALUES (@id, @name, @username, @password_hash, @role, 1)
        `);
        const tx = db.transaction(() => {
            BARBERS.forEach((barber) => {
                insert.run({
                    id: barber.id,
                    name: barber.name,
                    username: barber.username,
                    password_hash: hash,
                    role: barber.role || "barber"
                });
            });
        });
        tx();
        console.log("Barbers ready. Login at /barber/login.html");
        console.log("Usernames: rim, bank, rick, dee, pos");
        console.log("Default password:", DEFAULT_PASSWORD);
    }
    ensureCashier(hash);
}

function ensureCashier(hash) {
    const existing = db.prepare("SELECT id FROM barbers WHERE id = 'pos' OR username = 'pos'").get();
    if (existing) {
        return;
    }
    db.prepare(`
        INSERT INTO barbers (id, name, username, password_hash, role, active)
        VALUES (?, ?, ?, ?, 'cashier', 1)
    `).run("pos", "เคาน์เตอร์", "pos", hash || bcrypt.hashSync(DEFAULT_PASSWORD, 10));
}

if (require.main === module) {
    seed();
}

module.exports = { seed, BARBERS, DEFAULT_PASSWORD };
