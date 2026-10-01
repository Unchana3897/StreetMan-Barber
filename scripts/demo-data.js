// LOCAL TESTING ONLY. Prints SQL that fills the local D1 with a month of fake
// queues for every barber, so the income page and Excel export have something to show.
//   npm run db:demo:local   -> add (replaces earlier demo data)
//   npm run db:demo:clear   -> remove all demo data
// Every demo row has note 'ข้อมูลทดสอบ'. Never run the output with --remote.
"use strict";

const MARK = "ข้อมูลทดสอบ";
const clearOnly = process.argv.includes("--clear");
const SERVICES = { haircut: [300, 2], beard: [200, 1], shave: [200, 1], dye: [150, 1], mustache: [500, 1], stacking: [1000, 3] };
const SLOTS = [];
for (let m = 11 * 60; m <= 19 * 60 + 30; m += 30) SLOTS.push(`${String(m / 60 | 0).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
// Same local test password as scripts/dev-seed.sql (localdev-cfd8a893).
const HASH = "pbkdf2$100000$49cfea62c8dc3717d678559038190024$338dcc979452b58cacd5928dd56a99c776b3bf29921fe736f88a441663475fb5";
const DEMO_BARBERS = [["tong", "Tong"], ["mek", "Mek"]];
// heads per day [min, max] and how often each barber works
const BARBERS = { rim: [4, 8], bank: [3, 7], dee: [2, 5], tong: [3, 6], mek: [1, 4] };
const NAMES = ["โจ้", "ต้น", "เบียร์", "บอส", "กอล์ฟ", "อาร์ม", "นัท", "ปอ", "เจมส์", "ฟลุ๊ค", "แบงค์", "ไผ่", "ตี๋", "เอก", "John", "Mike", "Leo", "Ivan", "Kenji", "Omar"];

let seed = 20261002;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const q = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const hex = (n) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("");

const out = [`DELETE FROM bill_edits WHERE booking_id IN (SELECT id FROM bookings WHERE note=${q(MARK)});`,
    `DELETE FROM bookings WHERE note=${q(MARK)};`];
if (clearOnly) {
    out.push(`DELETE FROM bookings WHERE barber_id IN (${DEMO_BARBERS.map(([id]) => q(id)).join(",")});`);
    out.push(`DELETE FROM sessions WHERE barber_id IN (${DEMO_BARBERS.map(([id]) => q(id)).join(",")});`);
    out.push(`DELETE FROM barbers WHERE id IN (${DEMO_BARBERS.map(([id]) => q(id)).join(",")});`);
    console.log(out.join("\n"));
    process.exit(0);
}
DEMO_BARBERS.forEach(([id, name]) => out.push(
    `INSERT OR IGNORE INTO barbers (id,name,username,password_hash,role,active,status,must_change_password) VALUES (${q(id)},${q(name)},${q(id)},${q(HASH)},'barber',1,'approved',0);`));

const now = new Date(Date.now() + 7 * 3600e3); // Bangkok
const today = now.toISOString().slice(0, 10);
const first = today.slice(0, 8) + "01";
// From the 1st of last month, so a full month can be checked too.
const start = new Date(Date.parse(first) - 864e5).toISOString().slice(0, 8) + "01";

for (let d = start; d <= today; d = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10)) {
    for (const [barber, [lo, hi]] of Object.entries(BARBERS)) {
        if (rand() < 0.12) continue; // day off
        let heads = between(lo, hi);
        let i = between(0, 3);
        while (heads > 0 && i < SLOTS.length) {
            const service = rand() < 0.55 ? "haircut" : pick(Object.keys(SERVICES));
            const extras = rand() < 0.2 ? [pick(["beard", "dye", "shave"].filter((x) => x !== service))] : [];
            const slots = SERVICES[service][1] + extras.reduce((n, x) => n + SERVICES[x][1], 0);
            if (i + slots > SLOTS.length) break;
            const time = SLOTS[i];
            const endIdx = i + slots;
            const end = endIdx < SLOTS.length ? SLOTS[endIdx] : "20:00";
            // Today looks like a day in progress whatever the clock says:
            // before 17:00 finished, from 17:00 still waiting in the queue.
            const past = d < today || time < "17:00";
            const walkin = rand() < 0.45;
            let status = "done", method = rand() < 0.6 ? "cash" : "transfer";
            if (!past) { status = walkin ? null : pick(["pending", "confirmed"]); method = null; }
            else if (d === today && rand() < 0.15) method = null; // finished but not charged yet
            if (status) {
                const name = walkin ? "วอล์กอิน" : pick(NAMES);
                const phone = walkin ? "walkin" : "08" + String(between(10000000, 99999999));
                const paidAt = method ? `${d}T${time}:00+07:00` : null;
                out.push(`INSERT OR IGNORE INTO bookings (customer_name,phone,service,extras,barber_id,date,time,end_time,note,status,created_at,cancel_token,payment_method,paid_at,prices) VALUES (${[
                    name, phone, service, JSON.stringify(extras), barber, d, time, end, MARK, status,
                    `${d}T08:00:00.000Z`, hex(16), method, paidAt ? new Date(paidAt).toISOString() : null,
                    JSON.stringify(Object.fromEntries([service, ...extras].map((id) => [id, SERVICES[id][0]])))].map(q).join(",")});`);
                heads -= 1;
            }
            i = endIdx + (rand() < 0.35 ? 1 : 0);
        }
    }
}
console.log(out.join("\n"));
