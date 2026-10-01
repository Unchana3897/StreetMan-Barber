// Prints SQL that adds a system admin (ผู้ดูแลระบบ): owner rights, not a barber.
// The password given here is temporary: the first login must set a new one.
//   node scripts/create-admin.js <username> "<display name>" "<temporary password>" > .wrangler/admin.sql
//   npx wrangler d1 execute streetman-barber-db --remote --file .wrangler/admin.sql
// Keep the .sql file out of git (.wrangler/ is ignored) and delete it afterwards.
"use strict";
const crypto = require("node:crypto");

const [username, name, password] = process.argv.slice(2);
if (!/^[a-z0-9]{2,20}$/.test(username || "") || !name || !password) {
    console.error('Usage: node scripts/create-admin.js <username a-z0-9> "<display name>" "<temporary password>"');
    process.exit(1);
}
const ITERATIONS = 100000; // same as PBKDF2_ITERATIONS in worker.js
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256").toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
console.log(`INSERT INTO barbers (id,name,username,password_hash,role,active,status,must_change_password) VALUES (${[
    username, name, username, `pbkdf2$${ITERATIONS}$${salt.toString("hex")}$${hash}`, "admin", 1, "approved", 1].map((v, i) => (i >= 5 && i !== 6 ? v : q(v))).join(",")});`);
