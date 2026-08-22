"use strict";

const bcrypt = require("bcryptjs");
const db = require("./db");

const DEFAULT_PASSWORD = process.env.BARBER_DEFAULT_PASSWORD || "StreetMan2026";

const BARBERS = [
    { id: "rim", name: "Rim", username: "rim" },
    { id: "bank", name: "Bank", username: "bank" },
    { id: "rick", name: "Rick", username: "rick" },
    { id: "dee", name: "Dee", username: "dee" }
];

function seed() {
    const count = db.prepare("SELECT COUNT(*) AS c FROM barbers").get().c;
    if (count > 0) {
        return;
    }
    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    const insert = db.prepare(`
        INSERT INTO barbers (id, name, username, password_hash)
        VALUES (@id, @name, @username, @password_hash)
    `);
    const tx = db.transaction(() => {
        BARBERS.forEach((barber) => {
            insert.run({
                id: barber.id,
                name: barber.name,
                username: barber.username,
                password_hash: hash
            });
        });
    });
    tx();
    console.log("Barbers ready. Login at /barber/login.html");
    console.log("Usernames: rim, bank, rick, dee");
    console.log("Default password:", DEFAULT_PASSWORD);
}

if (require.main === module) {
    seed();
}

module.exports = { seed, BARBERS, DEFAULT_PASSWORD };
