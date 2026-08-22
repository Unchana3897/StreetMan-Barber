"use strict";

const fs = require("fs");
const path = require("path");
const webpush = require("web-push");
const db = require("./db");

const dataDir = path.join(__dirname, "..", "data");
const vapidPath = path.join(dataDir, "vapid.json");

function loadVapid() {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        return {
            publicKey: process.env.VAPID_PUBLIC_KEY,
            privateKey: process.env.VAPID_PRIVATE_KEY
        };
    }
    if (fs.existsSync(vapidPath)) {
        return JSON.parse(fs.readFileSync(vapidPath, "utf8"));
    }
    const keys = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidPath, JSON.stringify(keys, null, 2));
    return keys;
}

const vapid = loadVapid();
webpush.setVapidDetails(
    "mailto:streetmanBB@gmail.com",
    vapid.publicKey,
    vapid.privateKey
);

const SERVICES = {
    haircut: "ตัดผม",
    beard: "ตกแต่งเครา",
    shave: "โกนหนวด",
    dye: "ย้อมผม",
    mustache: "ตกแต่งหนวด",
    stacking: "เซ็ตทรง"
};

function saveSubscription(barberId, sub) {
    const endpoint = String(sub.endpoint || "");
    const p256dh = String((sub.keys && sub.keys.p256dh) || "");
    const auth = String((sub.keys && sub.keys.auth) || "");
    if (!endpoint.startsWith("https://") || !p256dh || !auth) {
        return false;
    }
    db.prepare(`
        INSERT INTO push_subscriptions (endpoint, barber_id, p256dh, auth, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
            barber_id = excluded.barber_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth
    `).run(endpoint, barberId, p256dh, auth, new Date().toISOString());
    return true;
}

function removeSubscription(endpoint) {
    db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(String(endpoint || ""));
}

function notifyPush(barberId, booking) {
    const rows = db.prepare("SELECT * FROM push_subscriptions WHERE barber_id = ?").all(barberId);
    if (!rows.length) {
        return;
    }
    const payload = JSON.stringify({
        title: "StreetMan Barber — คิวใหม่",
        body: [
            booking.customer_name,
            booking.date,
            booking.time,
            SERVICES[booking.service] || booking.service
        ].join(" · "),
        url: "/barber/dashboard.html"
    });
    rows.forEach((row) => {
        webpush.sendNotification({
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth }
        }, payload).catch((err) => {
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
                removeSubscription(row.endpoint);
            }
        });
    });
}

module.exports = {
    publicKey: vapid.publicKey,
    saveSubscription,
    removeSubscription,
    notifyPush
};
