"use strict";

const path = require("path");
const os = require("os");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");

const db = require("./db");
const { seed } = require("./seed");
const push = require("./push");
const { ensureDataDir } = require("./paths");
const xlsx = require("./xlsx");

seed();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "streetman-local-secret";
const SESSION_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const COOKIE_MS = 400 * 24 * 60 * 60 * 1000;
const COOKIE = "sm_session";
app.set("trust proxy", 1);

const SERVICES = {
    haircut: { last: "19:00", price: 300, slots: 2, label: "ตัดผม" },
    beard: { last: "19:30", price: 200, slots: 1, label: "ตกแต่งเครา" },
    shave: { last: "19:30", price: 200, slots: 1, label: "โกนหนวด" },
    dye: { last: "19:30", price: 150, slots: 1, label: "ย้อมผม" },
    mustache: { last: "19:30", price: 500, slots: 1, label: "ตกแต่งหนวด" },
    stacking: { last: "18:30", price: 1000, slots: 3, label: "เซ็ตทรง / Stacking" }
};
const SLOT_MINUTES = 30;

const TIME_SLOTS = [
    "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
];

const live = new Map();
const rate = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser(SESSION_SECRET));
app.use("/barber", (req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
});
app.use("/api", (req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
});

app.get("/robots.txt", (req, res) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.type("text/plain").send(
        `User-agent: *\nAllow: /\nDisallow: /barber\nDisallow: /api/\nDisallow: /cancel.html\nSitemap: ${origin}/sitemap.xml\n`
    );
});

app.get("/sitemap.xml", (req, res) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    const pages = [
        "/",
        "/about.html",
        "/service.html",
        "/price.html",
        "/team.html",
        "/open.html",
        "/book.html",
        "/contact.html",
        "/testimonial.html"
    ];
    const body = pages.map((page) => `  <url><loc>${origin}${page === "/" ? "/" : page}</loc></url>`).join("\n");
    res.type("application/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
    );
});

app.get("/barber", (req, res) => {
    res.redirect("/barber/login.html");
});
app.get("/barber/", (req, res) => {
    res.redirect("/barber/login.html");
});

app.use(express.static(path.join(__dirname, ".."), {
    extensions: ["html"],
    setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}barber${path.sep}`)) {
            res.setHeader("X-Robots-Tag", "noindex, nofollow");
        }
        if (filePath.endsWith(`${path.sep}sw.js`)) {
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Service-Worker-Allowed", "/barber/");
        }
    }
}));

function monthKey(iso) {
    return String(iso || "").slice(0, 7);
}

function monthRange(iso) {
    const key = monthKey(iso);
    const [year, month] = key.split("-").map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
        key,
        from: `${key}-01`,
        to: `${key}-${String(last).padStart(2, "0")}`
    };
}

function weekRange(iso) {
    const [year, month, day] = String(iso).split("-").map(Number);
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    const from = addDays(iso, offset);
    return { from, to: addDays(from, 6) };
}

function daySeries(barberId, from, to) {
    const rows = bookingsBetween(barberId, from, to);
    const grouped = new Map();
    for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
        grouped.set(cursor, []);
    }
    rows.forEach((row) => {
        if (grouped.has(row.date)) {
            grouped.get(row.date).push(row);
        }
    });
    return Array.from(grouped.entries()).map(([date, list]) => {
        const sum = summarize(list);
        return { date, done: sum.done, revenue: sum.revenue };
    });
}

function incomeFor(barberId, date) {
    const week = weekRange(date);
    const month = monthRange(date);
    return {
        date,
        day: Object.assign({ date }, summarize(bookingsBetween(barberId, date, date))),
        week: Object.assign(
            { from: week.from, to: week.to },
            summarize(bookingsBetween(barberId, week.from, week.to)),
            { series: daySeries(barberId, week.from, week.to) }
        ),
        month: Object.assign(
            { key: month.key, from: month.from, to: month.to },
            summarize(bookingsBetween(barberId, month.from, month.to)),
            { series: daySeries(barberId, month.from, month.to) }
        )
    };
}

function listBarbers(activeOnly) {
    const sql = activeOnly
        ? "SELECT id, name, username, role, active FROM barbers WHERE active = 1 ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, name"
        : "SELECT id, name, username, role, active FROM barbers ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, name";
    return db.prepare(sql).all();
}

function activeIds() {
    return listBarbers(true).map((row) => row.id);
}

function publicBarber(row) {
    return {
        id: row.id,
        name: row.name,
        username: row.username,
        role: row.role || "barber",
        active: Number(row.active) === 1
    };
}

function parseExtras(raw, mainService) {
    let list = [];
    try {
        list = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw || []);
    } catch (err) {
        list = [];
    }
    if (!Array.isArray(list)) {
        list = [];
    }
    const seen = new Set();
    return list.filter((item) => {
        if (!SERVICES[item] || item === mainService || seen.has(item)) {
            return false;
        }
        seen.add(item);
        return true;
    });
}

function extrasTotal(extras) {
    return extras.reduce((sum, item) => sum + ((SERVICES[item] && SERVICES[item].price) || 0), 0);
}

function serviceSlots(service) {
    return (SERVICES[service] && SERVICES[service].slots) || 1;
}

function extrasSlotCount(extras) {
    return (extras || []).reduce((sum, item) => sum + serviceSlots(item), 0);
}

function bookingSlotCount(row) {
    const extras = Array.isArray(row.extras) ? row.extras : parseExtras(row.extras, row.service);
    return serviceSlots(row.service) + extrasSlotCount(extras);
}

function occupyRange(start, count, clamp) {
    const index = TIME_SLOTS.indexOf(start);
    if (index < 0 || count < 1) {
        return null;
    }
    if (index + count > TIME_SLOTS.length) {
        return clamp ? TIME_SLOTS.slice(index) : null;
    }
    return TIME_SLOTS.slice(index, index + count);
}

function slotEnd(start, count) {
    const [hour, minute] = String(start || "00:00").split(":").map(Number);
    const total = hour * 60 + minute + count * SLOT_MINUTES;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function dayRows(barberId, date) {
    return db.prepare(`
        SELECT id, service, extras, time
        FROM bookings
        WHERE barber_id = ? AND date = ? AND status != 'cancelled'
    `).all(barberId, date);
}

function occupiedSet(barberId, date, exceptId) {
    const taken = new Set();
    dayRows(barberId, date).forEach((row) => {
        if (exceptId && Number(row.id) === Number(exceptId)) {
            return;
        }
        const range = occupyRange(row.time, bookingSlotCount(row), true);
        (range || [row.time]).forEach((slot) => taken.add(slot));
    });
    return taken;
}

function canPlace(barberId, date, time, service, extras, exceptId) {
    const count = serviceSlots(service) + extrasSlotCount(extras);
    const range = occupyRange(time, count, Boolean(exceptId));
    if (!range) {
        return { error: "bad_time" };
    }
    const occupied = occupiedSet(barberId, date, exceptId);
    if (range.some((slot) => occupied.has(slot))) {
        return { error: exceptId ? "extra_overlap" : "slot_taken" };
    }
    return { ok: true, range, count };
}

function floorSlot(time) {
    const [hour, minute] = String(time || "11:00").split(":").map(Number);
    const slot = `${String(hour).padStart(2, "0")}:${minute < 30 ? "00" : "30"}`;
    if (TIME_SLOTS.includes(slot)) {
        return slot;
    }
    if (time < TIME_SLOTS[0]) {
        return TIME_SLOTS[0];
    }
    return TIME_SLOTS[TIME_SLOTS.length - 1];
}

function findWalkinSlot(barberId, date, service, extras) {
    const start = floorSlot(bangkokNow().time);
    const startIdx = Math.max(0, TIME_SLOTS.indexOf(start));
    const order = TIME_SLOTS.slice(startIdx).concat(TIME_SLOTS.slice(0, startIdx).reverse());
    for (let pass = 0; pass < 2; pass += 1) {
        const extraList = pass === 0 ? extras : [];
        for (const slot of order) {
            if (!canPlace(barberId, date, slot, service, extraList).error) {
                return slot;
            }
        }
    }
    return null;
}

function posBooking(req, id) {
    const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
    if (!row) {
        return null;
    }
    if (row.barber_id !== req.barber.barber_id && req.barber.role !== "owner" && req.barber.barber_id !== "rim") {
        return null;
    }
    return row;
}

function applyPayment(existing, extras, method) {
    const paidAt = new Date().toISOString();
    db.prepare(`
        UPDATE bookings
        SET extras = ?, status = 'done', payment_method = ?, paid_at = ?, reminded_at = COALESCE(NULLIF(reminded_at, ''), ?)
        WHERE id = ?
    `).run(JSON.stringify(extras), method, paidAt, paidAt, existing.id);
    return decorateBooking(db.prepare("SELECT * FROM bookings WHERE id = ?").get(existing.id));
}

function bookingAmount(row) {
    const extras = Array.isArray(row.extras) ? row.extras : parseExtras(row.extras, row.service);
    const base = (SERVICES[row.service] && SERVICES[row.service].price) || 0;
    return base + extrasTotal(extras);
}

function decorateBooking(row) {
    if (!row) {
        return row;
    }
    const extras = parseExtras(row.extras, row.service);
    const extraTotal = extrasTotal(extras);
    const base = (SERVICES[row.service] && SERVICES[row.service].price) || 0;
    const slots = serviceSlots(row.service) + extrasSlotCount(extras);
    const out = Object.assign({}, row, {
        extras,
        extra_total: extraTotal,
        amount: base + extraTotal,
        slots,
        end_time: slotEnd(row.time, slots),
        payment_method: row.payment_method || null,
        paid_at: row.paid_at || null
    });
    delete out.cancel_token;
    return out;
}

function makeCancelToken() {
    return crypto.randomBytes(8).toString("hex");
}

function normalizeToken(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-f0-9]/g, "");
}

function maskPhone(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length < 4) {
        return "****";
    }
    return "*".repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
}

function phoneKey(phone) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("66") && digits.length >= 11) {
        digits = "0" + digits.slice(2);
    }
    return digits;
}

function findOpenBooking(phone) {
    const key = phoneKey(phone);
    if (!key) {
        return null;
    }
    const now = bangkokNow();
    const rows = db.prepare(`
        SELECT id, customer_name, phone, service, barber_id, date, time, status
        FROM bookings
        WHERE status IN ('pending', 'confirmed')
          AND (date > ? OR (date = ? AND time >= ?))
        ORDER BY date, time, id
    `).all(now.date, now.date, now.time);
    return rows.find((row) => phoneKey(row.phone) === key) || null;
}

function slotMinutes(date, time) {
    const [year, month, day] = String(date).split("-").map(Number);
    const [hour, minute] = String(time || "00:00").split(":").map(Number);
    return Date.UTC(year, month - 1, day, hour, minute) / 60000;
}

function customerCancelCheck(row) {
    if (!row) {
        return { error: "not_found" };
    }
    if (row.status === "cancelled") {
        return { error: "already_cancelled" };
    }
    if (row.status === "done") {
        return { error: "already_done" };
    }
    const now = bangkokNow();
    const remain = slotMinutes(row.date, row.time) - slotMinutes(now.date, now.time);
    if (remain < 120) {
        return { error: "too_late" };
    }
    return { ok: true };
}

function publicBooking(row) {
    const booking = decorateBooking(row);
    const check = customerCancelCheck(row);
    return {
        id: booking.id,
        customer_name: booking.customer_name,
        phone: maskPhone(booking.phone),
        service: booking.service,
        barber_id: booking.barber_id,
        barber_name: booking.barber_name,
        date: booking.date,
        time: booking.time,
        end_time: booking.end_time,
        status: booking.status,
        can_cancel: !check.error,
        cancel_error: check.error || null
    };
}

function summarize(rows) {
    const booked = rows.filter((row) => row.status !== "cancelled");
    const done = rows.filter((row) => row.status === "done");
    const remaining = rows.filter((row) => row.status === "pending" || row.status === "confirmed");
    return {
        booked: booked.length,
        done: done.length,
        remaining: remaining.length,
        cancelled: rows.filter((row) => row.status === "cancelled").length,
        revenue: done.reduce((sum, row) => sum + bookingAmount(row), 0)
    };
}

function bookingsBetween(barberId, from, to) {
    if (barberId) {
        return db.prepare(`
            SELECT id, customer_name, phone, service, extras, barber_id, date, time, note, status, created_at
            FROM bookings
            WHERE barber_id = ? AND date >= ? AND date <= ?
            ORDER BY date, time, id
        `).all(barberId, from, to);
    }
    return db.prepare(`
        SELECT id, customer_name, phone, service, extras, barber_id, date, time, note, status, created_at
        FROM bookings
        WHERE date >= ? AND date <= ?
        ORDER BY date, time, id
    `).all(from, to);
}

function periodSummary(barberId, date) {
    const month = monthRange(date);
    return {
        day: summarize(bookingsBetween(barberId, date, date)),
        month: Object.assign({ key: month.key }, summarize(bookingsBetween(barberId, month.from, month.to)))
    };
}

function shopSummary(date) {
    const month = monthRange(date);
    const barbers = listBarbers(false);
    return {
        day: summarize(bookingsBetween(null, date, date)),
        month: Object.assign({ key: month.key }, summarize(bookingsBetween(null, month.from, month.to))),
        barbers: barbers.map((barber) => ({
            id: barber.id,
            name: barber.name,
            username: barber.username,
            active: Number(barber.active) === 1,
            day: summarize(bookingsBetween(barber.id, date, date)),
            month: Object.assign({ key: month.key }, summarize(bookingsBetween(barber.id, month.from, month.to)))
        }))
    };
}

function slugId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function bangkokNow() {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Bangkok",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).formatToParts(new Date()).map((part) => [part.type, part.value])
    );
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}`
    };
}

function todayISO() {
    return bangkokNow().date;
}

function addDays(iso, n) {
    const [year, month, day] = iso.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + n));
    return next.toISOString().slice(0, 10);
}

function slotsFor(service) {
    const last = (SERVICES[service] && SERVICES[service].last) || "19:00";
    const count = serviceSlots(service);
    return TIME_SLOTS.filter((slot) => slot <= last && occupyRange(slot, count, false));
}

function tooMany(ip) {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const list = (rate.get(ip) || []).filter((t) => now - t < windowMs);
    if (list.length >= 12) {
        rate.set(ip, list);
        return true;
    }
    list.push(now);
    rate.set(ip, list);
    return false;
}

function cookieOptions(req) {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: req.secure || req.headers["x-forwarded-proto"] === "https",
        maxAge: COOKIE_MS,
        path: "/"
    };
}

function sessionToken(req) {
    const header = String(req.headers["x-session-token"] || "").trim();
    if (/^[a-f0-9]{64}$/i.test(header)) {
        return header;
    }
    const query = String((req.query && req.query.token) || "").trim();
    if (/^[a-f0-9]{64}$/i.test(query) && req.path === "/api/barber/events") {
        return query;
    }
    return req.cookies[COOKIE] || "";
}

function readSession(req) {
    const token = sessionToken(req);
    if (!token) {
        return null;
    }
    const row = db.prepare(`
        SELECT s.token, s.barber_id, s.expires_at, b.name, b.username, b.role, b.active
        FROM sessions s
        JOIN barbers b ON b.id = s.barber_id
        WHERE s.token = ? AND s.expires_at > ?
    `).get(token, Date.now());
    if (!row || Number(row.active) !== 1) {
        return null;
    }
    return row;
}

function touchSession(req, res, session) {
    const expires = Date.now() + SESSION_MS;
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?").run(expires, session.token);
    res.cookie(COOKIE, session.token, cookieOptions(req));
}

function requireBarber(req, res, next) {
    const session = readSession(req);
    if (!session) {
        return res.status(401).json({ error: "login_required" });
    }
    req.barber = session;
    touchSession(req, res, session);
    next();
}

function requireOwner(req, res, next) {
    if (!req.barber || (req.barber.role !== "owner" && req.barber.barber_id !== "rim")) {
        return res.status(403).json({ error: "owner_required" });
    }
    next();
}

function setting(key) {
    const row = db.prepare("SELECT value FROM shop_settings WHERE key = ?").get(key);
    return row ? row.value : "";
}

function shopState() {
    return {
        closed: setting("closed") === "1",
        note: setting("closed_note") || ""
    };
}

function setShopState(closed, note) {
    db.prepare(`
        INSERT INTO shop_settings (key, value) VALUES ('closed', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(closed ? "1" : "0");
    if (note != null) {
        db.prepare(`
            INSERT INTO shop_settings (key, value) VALUES ('closed_note', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(String(note).trim().slice(0, 200));
    }
    return shopState();
}

function notify(barberId, payload) {
    const set = live.get(barberId);
    if (!set) {
        return;
    }
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    set.forEach((res) => {
        try {
            res.write(data);
        } catch (err) {
            set.delete(res);
        }
    });
}

function sendDayReminders() {
    const now = bangkokNow();
    if (now.time < "09:00") {
        return;
    }
    const rows = db.prepare(`
        SELECT id, customer_name, service, barber_id, date, time, status
        FROM bookings
        WHERE date = ? AND status IN ('pending', 'confirmed')
            AND (reminded_at IS NULL OR reminded_at = '')
        ORDER BY time ASC, id ASC
    `).all(now.date);
    if (!rows.length) {
        return;
    }
    const grouped = new Map();
    rows.forEach((row) => {
        if (!grouped.has(row.barber_id)) {
            grouped.set(row.barber_id, []);
        }
        grouped.get(row.barber_id).push(row);
    });
    const stamp = new Date().toISOString();
    const mark = db.prepare("UPDATE bookings SET reminded_at = ? WHERE id = ?");
    grouped.forEach((list, barberId) => {
        const preview = list.slice(0, 4).map((row) => `${row.time} ${row.customer_name}`).join(", ");
        const extra = list.length > 4 ? ` อีก ${list.length - 4} คิว` : "";
        const message = `วันนี้มี ${list.length} คิว · ${preview}${extra}`;
        notify(barberId, {
            type: "day_reminder",
            date: now.date,
            count: list.length,
            title: "คิววันนี้",
            message: message
        });
        push.send(barberId, "StreetMan Barber Phuket — คิววันนี้", message);
        list.forEach((row) => mark.run(stamp, row.id));
    });
}

function pickBarber(barberId, date, time, service) {
    const ids = activeIds();
    if (barberId && barberId !== "any") {
        if (!ids.includes(barberId)) {
            return null;
        }
        const place = canPlace(barberId, date, time, service, []);
        if (place.error) {
            return { error: place.error };
        }
        return { barberId };
    }
    for (const id of ids) {
        const place = canPlace(id, date, time, service, []);
        if (!place.error) {
            return { barberId: id };
        }
    }
    return { error: "slot_taken" };
}

function isPastSlot(date, time) {
    const now = bangkokNow();
    return date < now.date || (date === now.date && time <= now.time);
}

app.get("/api/slots", (req, res) => {
    const service = String(req.query.service || "haircut");
    const date = String(req.query.date || todayISO());
    const barberId = String(req.query.barber || "any");
    if (!SERVICES[service]) {
        return res.status(400).json({ error: "bad_service" });
    }
    const status = shopState();
    if (status.closed) {
        return res.json({
            date,
            slots: [],
            closed: true,
            note: status.note
        });
    }
    const possible = slotsFor(service).filter((slot) => !isPastSlot(date, slot));
    const ids = activeIds();
    const open = (id, slot) => !canPlace(id, date, slot, service, []).error;
    const slots = barberId !== "any" && ids.includes(barberId)
        ? possible.filter((slot) => open(barberId, slot))
        : possible.filter((slot) => ids.some((id) => open(id, slot)));
    res.json({
        date,
        slots,
        closed: false,
        note: status.note
    });
});

app.get("/api/shop", (req, res) => {
    res.json(shopState());
});

app.post("/api/bookings", (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (tooMany(ip)) {
        return res.status(429).json({ error: "too_many" });
    }
    if (shopState().closed) {
        return res.status(403).json({ error: "shop_closed" });
    }

    const name = String(req.body.customer_name || req.body.name || "").trim();
    const phone = String(req.body.phone || "").replace(/\s+/g, "");
    const service = String(req.body.service || "");
    const requestedBarber = String(req.body.barber || "any");
    const date = String(req.body.date || "");
    const time = String(req.body.time || "");
    const note = String(req.body.note || "").trim().slice(0, 300);

    if (name.length < 2 || name.length > 80) {
        return res.status(400).json({ error: "bad_name" });
    }
    if (!/^[0-9+]{8,16}$/.test(phone)) {
        return res.status(400).json({ error: "bad_phone" });
    }
    if (!SERVICES[service]) {
        return res.status(400).json({ error: "bad_service" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayISO()) {
        return res.status(400).json({ error: "bad_date" });
    }
    if (!slotsFor(service).includes(time) || isPastSlot(date, time)) {
        return res.status(400).json({ error: "bad_time" });
    }

    const createdAt = new Date().toISOString();
    let chosen;
    let info;
    const insertBooking = db.transaction(() => {
        if (shopState().closed) {
            return { error: "shop_closed" };
        }
        const existing = findOpenBooking(phone);
        if (existing) {
            return {
                error: "already_booked",
                existing: { date: existing.date, time: existing.time, service: existing.service }
            };
        }
        const picked = pickBarber(requestedBarber, date, time, service);
        if (!picked || picked.error) {
            return { error: (picked && picked.error) || "slot_taken" };
        }
        const now = bangkokNow();
        const remindedAt = date === now.date && now.time >= "09:00" ? createdAt : null;
        const row = db.prepare(`
            INSERT INTO bookings (customer_name, phone, service, barber_id, date, time, note, status, created_at, cancel_token, reminded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        `).run(name, phone, service, picked.barberId, date, time, note || null, createdAt, makeCancelToken(), remindedAt);
        return { picked, row };
    });
    try {
        const result = insertBooking();
        if (result.error) {
            const body = { error: result.error };
            if (result.existing) {
                body.booking = result.existing;
            }
            return res.status(result.error === "shop_closed" ? 403 : 409).json(body);
        }
        chosen = result.picked;
        info = result.row;
    } catch (err) {
        if (err && String(err.code || "").startsWith("SQLITE_CONSTRAINT")) {
            return res.status(409).json({ error: "slot_taken" });
        }
        throw err;
    }

    const created = db.prepare(`
        SELECT b.*, br.name AS barber_name
        FROM bookings b
        JOIN barbers br ON br.id = b.barber_id
        WHERE b.id = ?
    `).get(info.lastInsertRowid);
    const booking = decorateBooking(created);
    notify(chosen.barberId, { type: "new_booking", booking: booking });
    push.notifyPush(chosen.barberId, booking);
    res.status(201).json({
        ok: true,
        booking: Object.assign({}, booking, { cancel_token: created.cancel_token })
    });
});

function bookingByToken(token) {
    const clean = normalizeToken(token);
    if (clean.length < 12) {
        return null;
    }
    return db.prepare(`
        SELECT b.*, br.name AS barber_name
        FROM bookings b
        JOIN barbers br ON br.id = b.barber_id
        WHERE b.cancel_token = ?
    `).get(clean);
}

app.get("/api/bookings/lookup", (req, res) => {
    if (tooMany(req.ip || req.socket.remoteAddress || "unknown")) {
        return res.status(429).json({ error: "too_many" });
    }
    const row = bookingByToken(req.query.token);
    if (!row) {
        return res.status(404).json({ error: "not_found" });
    }
    res.json({ ok: true, booking: publicBooking(row) });
});

app.post("/api/bookings/cancel", (req, res) => {
    if (tooMany(req.ip || req.socket.remoteAddress || "unknown")) {
        return res.status(429).json({ error: "too_many" });
    }
    const row = bookingByToken(req.body && req.body.token);
    if (!row) {
        return res.status(404).json({ error: "not_found" });
    }
    const check = customerCancelCheck(row);
    if (check.error) {
        return res.status(check.error === "too_late" ? 403 : 409).json({ error: check.error });
    }
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'confirmed')").run(row.id);
    const updated = decorateBooking(db.prepare(`
        SELECT b.*, br.name AS barber_name
        FROM bookings b
        JOIN barbers br ON br.id = b.barber_id
        WHERE b.id = ?
    `).get(row.id));
    notify(row.barber_id, { type: "booking_cancelled", booking: updated });
    push.send(row.barber_id, "StreetMan Barber Phuket — ลูกค้ายกเลิกคิว", `${row.customer_name} · ${row.date} ${row.time}`);
    res.json({ ok: true, booking: publicBooking(Object.assign({}, row, { status: "cancelled" })) });
});

app.post("/api/login", (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const barber = db.prepare("SELECT * FROM barbers WHERE username = ?").get(username);
    if (!barber || Number(barber.active) !== 1 || !bcrypt.compareSync(password, barber.password_hash)) {
        return res.status(401).json({ error: "bad_login" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions (token, barber_id, expires_at) VALUES (?, ?, ?)").run(
        token,
        barber.id,
        Date.now() + SESSION_MS
    );
    res.cookie(COOKIE, token, cookieOptions(req));
    res.json({
        ok: true,
        token: token,
        barber: { id: barber.id, name: barber.name, username: barber.username, role: barber.role || "barber", token: token }
    });
});

app.post("/api/logout", (req, res) => {
    const token = sessionToken(req);
    if (token) {
        db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
    res.clearCookie(COOKIE, { path: "/" });
    res.json({ ok: true });
});

app.get("/api/me", requireBarber, (req, res) => {
    res.json({
        barber: {
            id: req.barber.barber_id,
            name: req.barber.name,
            username: req.barber.username,
            role: req.barber.role || "barber",
            token: req.barber.token
        }
    });
});

app.get("/api/barbers", (req, res) => {
    res.json({
        barbers: listBarbers(true).map((row) => ({ id: row.id, name: row.name }))
    });
});

app.get("/api/barber/bookings", requireBarber, (req, res) => {
    const date = String(req.query.date || todayISO());
    const rows = db.prepare(`
        SELECT id, customer_name, phone, service, extras, barber_id, date, time, note, status, created_at
        FROM bookings
        WHERE barber_id = ? AND date = ?
        ORDER BY time ASC, id ASC
    `).all(req.barber.barber_id, date);
    res.json({ date, bookings: rows.map(decorateBooking) });
});

app.get("/api/barber/dashboard", requireBarber, (req, res) => {
    const date = String(req.query.date || todayISO());
    const barberId = req.barber.barber_id;
    const now = bangkokNow();
    const bookings = db.prepare(`
        SELECT id, customer_name, phone, service, extras, barber_id, date, time, note, status, created_at
        FROM bookings
        WHERE barber_id = ? AND date = ?
        ORDER BY time ASC, id ASC
    `).all(barberId, date).map(decorateBooking);

    const stats = {
        total: bookings.length,
        pending: bookings.filter((row) => row.status === "pending").length,
        confirmed: bookings.filter((row) => row.status === "confirmed").length,
        done: bookings.filter((row) => row.status === "done").length,
        cancelled: bookings.filter((row) => row.status === "cancelled").length
    };
    stats.remaining = stats.pending + stats.confirmed;
    stats.heads = bookings.filter((row) => row.status !== "cancelled").length;

    const active = bookings.filter((row) => row.status === "pending" || row.status === "confirmed");
    let next = null;
    if (date === now.date) {
        next = active.find((row) => row.time >= now.time) || null;
    } else if (date > now.date) {
        next = active[0] || null;
    }

    const from = todayISO();
    const upcomingRows = db.prepare(`
        SELECT date, COUNT(*) AS count
        FROM bookings
        WHERE barber_id = ? AND date >= ? AND date <= ? AND status != 'cancelled'
        GROUP BY date
        ORDER BY date
    `).all(barberId, from, addDays(from, 13));
    const upcomingMap = new Map(upcomingRows.map((row) => [row.date, row.count]));
    const upcoming = [];
    for (let i = 0; i < 14; i += 1) {
        const day = addDays(from, i);
        upcoming.push({ date: day, count: upcomingMap.get(day) || 0 });
    }

    res.json({
        barber: {
            id: barberId,
            name: req.barber.name,
            username: req.barber.username,
            role: req.barber.role || "barber"
        },
        date,
        now,
        stats,
        next,
        bookings,
        upcoming,
        summary: periodSummary(barberId, date),
        shop: req.barber.role === "owner" ? shopSummary(date) : null,
        shop_status: shopState()
    });
});

app.get("/api/barber/income", requireBarber, (req, res) => {
    const date = String(req.query.date || todayISO());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "bad_date" });
    }
    const mine = incomeFor(req.barber.barber_id, date);
    const owner = req.barber.role === "owner" || req.barber.barber_id === "rim";
    res.json({
        barber: {
            id: req.barber.barber_id,
            name: req.barber.name,
            username: req.barber.username,
            role: req.barber.role || "barber"
        },
        date,
        day: mine.day,
        week: mine.week,
        month: mine.month,
        shop: owner
            ? Object.assign(incomeFor(null, date), {
                barbers: listBarbers(false).map((barber) => Object.assign(
                    { id: barber.id, name: barber.name, username: barber.username, active: Number(barber.active) === 1 },
                    incomeFor(barber.id, date)
                ))
            })
            : null
    });
});

function serviceLabel(service) {
    return (SERVICES[service] && SERVICES[service].label) || service;
}

function extrasLabel(row) {
    const extras = Array.isArray(row.extras) ? row.extras : parseExtras(row.extras, row.service);
    return extras.map(serviceLabel).join(", ");
}

function whenLabel(date, time) {
    const parts = String(date || "").split("-");
    if (parts.length !== 3) {
        return `${date || ""} ${time || ""}`.trim();
    }
    return `${parts[2]}/${parts[1]} ${time || ""}`.trim();
}

function prettyPhone(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length === 10) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone || "";
}

function serviceLine(row) {
    const extra = extrasLabel(row);
    const main = serviceLabel(row.service);
    return extra ? `${main} + ${extra}` : main;
}

function isWalkin(row) {
    return row.note === "walk-in" || row.note === "Walk in" || row.phone === "walkin" || row.customer_name === "วอล์กอิน";
}

function payrollNote(row) {
    return isWalkin(row) ? "Walk in" : (row.note || "");
}

function payrollPhone(row) {
    return isWalkin(row) ? "" : prettyPhone(row.phone);
}

function payrollRange(date, period) {
    if (period === "week") {
        return weekRange(date);
    }
    const month = monthRange(date);
    return { from: month.from, to: month.to };
}

function payrollRows(from, to) {
    return db.prepare(`
        SELECT b.id, b.customer_name, b.phone, b.service, b.extras, b.barber_id, b.date, b.time, b.note, b.status,
               br.name AS barber_name
        FROM bookings b
        JOIN barbers br ON br.id = b.barber_id
        WHERE b.status = 'done' AND b.date >= ? AND b.date <= ?
        ORDER BY br.name, b.date, b.time, b.id
    `).all(from, to).map(decorateBooking);
}

function sheetName(name) {
    return String(name || "ช่าง").replace(/[:\\/?*[\]]/g, "").slice(0, 31) || "ช่าง";
}

function payrollBarberSheets(details) {
    const s = xlsx.s;
    const n = xlsx.n;
    const grouped = new Map();
    details.forEach((row) => {
        if (!grouped.has(row.barber_id)) {
            grouped.set(row.barber_id, []);
        }
        grouped.get(row.barber_id).push(row);
    });
    const h = xlsx.h;
    return listBarbers(false).map((barber) => {
        const rows = grouped.get(barber.id) || [];
        const revenue = rows.reduce((sum, row) => sum + bookingAmount(row), 0);
        return {
            name: sheetName(barber.name),
            widths: [16, 16, 16, 28, 12, 18],
            rows: [
                [h("วันเวลา"), h("ลูกค้า"), h("เบอร์"), h("บริการ"), h("ยอด"), h("สถานะ")],
                ...rows.map((row) => [
                    s(whenLabel(row.date, row.time)),
                    s(isWalkin(row) ? "Walk in" : row.customer_name),
                    s(payrollPhone(row)),
                    { v: serviceLine(row), w: true },
                    n(row.amount),
                    { v: payrollNote(row), w: true }
                ]),
                [s("รวม " + barber.name), s(""), s(""), s(rows.length + " คน"), n(revenue), s("")]
            ]
        };
    });
}

function payrollWorkbook(from, to) {
    const details = payrollRows(from, to);
    const byBarber = new Map();
    details.forEach((row) => {
        const current = byBarber.get(row.barber_id) || {
            name: row.barber_name,
            done: 0,
            revenue: 0
        };
        current.done += 1;
        current.revenue += bookingAmount(row);
        byBarber.set(row.barber_id, current);
    });
    const summary = listBarbers(false).map((barber) => {
        const row = byBarber.get(barber.id) || { name: barber.name, done: 0, revenue: 0 };
        return { name: barber.name, username: barber.username, done: row.done, revenue: row.revenue };
    });
    const totalDone = summary.reduce((sum, row) => sum + row.done, 0);
    const totalRevenue = summary.reduce((sum, row) => sum + row.revenue, 0);
    const s = xlsx.s;
    const n = xlsx.n;
    const h = xlsx.h;
    return xlsx.workbook([
        {
            name: "สรุปจ่ายเงินเดือน",
            widths: [14, 16, 12, 16, 20],
            rows: [
                [h("ช่าง"), h("ชื่อเข้าสู่ระบบ"), h("จำนวนหัว"), h("ยอดร้าน (บาท)"), h("ยอดจ่ายช่าง")],
                ...summary.map((row) => [s(row.name), s(row.username), n(row.done), n(row.revenue), s("")]),
                [s("รวมทั้งร้าน"), s(""), n(totalDone), n(totalRevenue), s("")]
            ]
        },
        ...payrollBarberSheets(details)
    ]);
}

app.get("/api/owner/payroll.xlsx", requireBarber, requireOwner, (req, res) => {
    const date = String(req.query.date || todayISO());
    const period = String(req.query.period || "month") === "week" ? "week" : "month";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "bad_date" });
    }
    const range = payrollRange(date, period);
    const body = payrollWorkbook(range.from, range.to);
    const name = `StreetMan-payroll-${range.from}-${range.to}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(body);
});

function updateShop(req, res) {
    if (req.body.closed == null) {
        return res.status(400).json({ error: "bad_update" });
    }
    const closed = req.body.closed === true || req.body.closed === 1 || req.body.closed === "1";
    const note = req.body.note != null ? req.body.note : null;
    try {
        return res.json({ ok: true, shop: setShopState(closed, note) });
    } catch (err) {
        return res.status(500).json({ error: "shop_update_failed" });
    }
}

app.patch("/api/owner/shop", requireBarber, requireOwner, updateShop);
app.post("/api/owner/shop", requireBarber, requireOwner, updateShop);

app.patch("/api/barber/bookings/:id", requireBarber, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM bookings WHERE id = ? AND barber_id = ?").get(id, req.barber.barber_id);
    if (!existing) {
        return res.status(404).json({ error: "not_found" });
    }

    if (req.body.status) {
        const status = String(req.body.status || "");
        if (!["pending", "confirmed", "done", "cancelled"].includes(status)) {
            return res.status(400).json({ error: "bad_status" });
        }
        db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
    }

    if (req.body.add_extra || req.body.remove_extra || req.body.extras) {
        let extras = parseExtras(existing.extras, existing.service);
        if (Array.isArray(req.body.extras)) {
            extras = parseExtras(req.body.extras, existing.service);
        }
        if (req.body.add_extra) {
            extras = parseExtras(extras.concat(String(req.body.add_extra)), existing.service);
        }
        if (req.body.remove_extra) {
            extras = extras.filter((item) => item !== String(req.body.remove_extra));
        }
        const place = canPlace(existing.barber_id, existing.date, existing.time, existing.service, extras, existing.id);
        if (place.error) {
            return res.status(409).json({ error: place.error });
        }
        db.prepare("UPDATE bookings SET extras = ? WHERE id = ?").run(JSON.stringify(extras), id);
    }

    if (!req.body.status && !req.body.add_extra && !req.body.remove_extra && !req.body.extras) {
        return res.status(400).json({ error: "bad_update" });
    }

    const booking = decorateBooking(db.prepare("SELECT * FROM bookings WHERE id = ?").get(id));
    res.json({ ok: true, booking });
});

app.get("/api/barber/pos", requireBarber, requireOwner, (req, res) => {
    const date = String(req.query.date || todayISO());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "bad_date" });
    }
    const rows = db.prepare(`
        SELECT b.*, br.name AS barber_name
        FROM bookings b JOIN barbers br ON br.id = b.barber_id
        WHERE b.date = ? AND b.status != 'cancelled'
        ORDER BY b.time ASC, b.id ASC
    `).all(date).map(decorateBooking);
    res.json({
        barber: {
            id: req.barber.barber_id,
            name: req.barber.name,
            username: req.barber.username,
            role: req.barber.role || "barber"
        },
        date,
        barbers: listBarbers(true),
        open: rows.filter((row) => row.status === "pending" || row.status === "confirmed"),
        paid: rows.filter((row) => row.status === "done")
    });
});

app.post("/api/barber/bookings/:id/pay", requireBarber, requireOwner, (req, res) => {
    const existing = posBooking(req, Number(req.params.id));
    if (!existing) {
        return res.status(404).json({ error: "not_found" });
    }
    const method = String(req.body.method || "");
    if (method !== "cash" && method !== "transfer") {
        return res.status(400).json({ error: "bad_method" });
    }
    if (existing.status === "cancelled") {
        return res.status(409).json({ error: "already_cancelled" });
    }
    let extras = parseExtras(existing.extras, existing.service);
    if (Array.isArray(req.body.extras)) {
        extras = parseExtras(req.body.extras, existing.service);
    }
    if (existing.status !== "done") {
        const place = canPlace(existing.barber_id, existing.date, existing.time, existing.service, extras, existing.id);
        if (place.error) {
            return res.status(409).json({ error: place.error });
        }
    }
    const booking = applyPayment(existing, extras, method);
    res.json({ ok: true, booking });
});

app.post("/api/barber/pos/walkin", requireBarber, requireOwner, (req, res) => {
    const owner = req.barber.role === "owner" || req.barber.barber_id === "rim";
    let barberId = req.barber.barber_id;
    if (owner && req.body.barber_id) {
        barberId = String(req.body.barber_id);
    }
    const staff = listBarbers(true).find((row) => row.id === barberId);
    if (!staff) {
        return res.status(400).json({ error: "bad_barber" });
    }
    const name = String(req.body.customer_name || req.body.name || "").trim() || "วอล์กอิน";
    const phoneRaw = String(req.body.phone || "").replace(/\s+/g, "");
    const phone = phoneRaw || "walkin";
    const service = String(req.body.service || "");
    const method = String(req.body.method || "");
    const extras = parseExtras(req.body.extras, service);
    if (name.length > 80) {
        return res.status(400).json({ error: "bad_name" });
    }
    if (phone !== "walkin" && !/^[0-9+]{8,16}$/.test(phone)) {
        return res.status(400).json({ error: "bad_phone" });
    }
    if (!SERVICES[service]) {
        return res.status(400).json({ error: "bad_service" });
    }
    if (method !== "cash" && method !== "transfer") {
        return res.status(400).json({ error: "bad_method" });
    }
    const date = todayISO();
    const time = findWalkinSlot(barberId, date, service, extras);
    if (!time) {
        return res.status(409).json({ error: "slot_taken" });
    }
    const createdAt = new Date().toISOString();
    let info;
    try {
        info = db.prepare(`
            INSERT INTO bookings (
                customer_name, phone, service, extras, barber_id, date, time, note, status,
                created_at, cancel_token, reminded_at, payment_method, paid_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'done', ?, ?, ?, ?, ?)
        `).run(
            name,
            phone,
            service,
            JSON.stringify(extras),
            barberId,
            date,
            time,
            "Walk in",
            createdAt,
            makeCancelToken(),
            createdAt,
            method,
            createdAt
        );
    } catch (err) {
        if (err && String(err.code || "").startsWith("SQLITE_CONSTRAINT")) {
            return res.status(409).json({ error: "slot_taken" });
        }
        throw err;
    }
    const booking = decorateBooking(db.prepare(`
        SELECT b.*, br.name AS barber_name
        FROM bookings b JOIN barbers br ON br.id = b.barber_id
        WHERE b.id = ?
    `).get(info.lastInsertRowid));
    res.json({ ok: true, booking });
});

app.get("/api/barber/push-key", requireBarber, (req, res) => {
    res.json({ publicKey: push.publicKey });
});

app.post("/api/barber/push-subscribe", requireBarber, (req, res) => {
    if (!push.saveSubscription(req.barber.barber_id, req.body || {})) {
        return res.status(400).json({ error: "bad_subscription" });
    }
    res.json({ ok: true });
});

app.post("/api/barber/push-unsubscribe", requireBarber, (req, res) => {
    push.removeSubscription(req.body && req.body.endpoint);
    res.json({ ok: true });
});

app.get("/api/owner/barbers", requireBarber, requireOwner, (req, res) => {
    res.json({ barbers: listBarbers(false).map(publicBarber) });
});

app.post("/api/owner/barbers", requireBarber, requireOwner, (req, res) => {
    const name = String(req.body.name || "").trim().slice(0, 40);
    const username = slugId(req.body.username);
    const password = String(req.body.password || "");
    if (name.length < 2) {
        return res.status(400).json({ error: "bad_name" });
    }
    if (!/^[a-z0-9]{2,20}$/.test(username)) {
        return res.status(400).json({ error: "bad_username" });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: "bad_password" });
    }
    const existing = db.prepare("SELECT id FROM barbers WHERE id = ? OR username = ?").get(username, username);
    if (existing) {
        return res.status(409).json({ error: "username_taken" });
    }
    db.prepare(`
        INSERT INTO barbers (id, name, username, password_hash, role, active)
        VALUES (?, ?, ?, ?, 'barber', 1)
    `).run(username, name, username, bcrypt.hashSync(password, 10));
    const barber = db.prepare("SELECT id, name, username, role, active FROM barbers WHERE id = ?").get(username);
    res.status(201).json({ ok: true, barber: publicBarber(barber) });
});

app.patch("/api/owner/barbers/:id", requireBarber, requireOwner, (req, res) => {
    const id = slugId(req.params.id);
    const barber = db.prepare("SELECT * FROM barbers WHERE id = ?").get(id);
    if (!barber) {
        return res.status(404).json({ error: "not_found" });
    }
    const name = req.body.name != null ? String(req.body.name).trim().slice(0, 40) : barber.name;
    if (name.length < 2) {
        return res.status(400).json({ error: "bad_name" });
    }
    let active = Number(barber.active) === 1 ? 1 : 0;
    if (req.body.active != null) {
        active = req.body.active === true || req.body.active === 1 || req.body.active === "1" ? 1 : 0;
    }
    if (barber.role === "owner") {
        active = 1;
    }
    const password = req.body.password != null ? String(req.body.password) : "";
    if (password && password.length < 6) {
        return res.status(400).json({ error: "bad_password" });
    }
    if (password) {
        db.prepare("UPDATE barbers SET name = ?, active = ?, password_hash = ? WHERE id = ?")
            .run(name, active, bcrypt.hashSync(password, 10), id);
    } else {
        db.prepare("UPDATE barbers SET name = ?, active = ? WHERE id = ?").run(name, active, id);
    }
    if (active === 0) {
        db.prepare("DELETE FROM sessions WHERE barber_id = ?").run(id);
    }
    const updated = db.prepare("SELECT id, name, username, role, active FROM barbers WHERE id = ?").get(id);
    res.json({ ok: true, barber: publicBarber(updated) });
});

app.get("/api/barber/events", requireBarber, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("event: hello\ndata: {}\n\n");

    const barberId = req.barber.barber_id;
    if (!live.has(barberId)) {
        live.set(barberId, new Set());
    }
    live.get(barberId).add(res);

    const ping = setInterval(() => {
        res.write(": ping\n\n");
    }, 25000);

    req.on("close", () => {
        clearInterval(ping);
        const set = live.get(barberId);
        if (set) {
            set.delete(res);
        }
    });
});

app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "not_found" });
    }
    res.status(404).sendFile(path.join(__dirname, "..", "404.html"));
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`StreetMan Barber Phuket running at http://localhost:${PORT}`);
    console.log("Data directory:", ensureDataDir());
    console.log("Customer booking: /book.html");
    console.log("Barber login: /barber/login.html");
    console.log("Barber dashboard: /barber/dashboard.html");
    try {
        Object.values(os.networkInterfaces()).forEach((list) => {
            (list || []).forEach((net) => {
                if (net.family === "IPv4" && !net.internal) {
                    console.log(`Phone on same Wi-Fi: http://${net.address}:${PORT}`);
                    console.log(`Book on phone: http://${net.address}:${PORT}/book.html`);
                }
            });
        });
    } catch (err) {}
    setTimeout(sendDayReminders, 8000);
    setInterval(sendDayReminders, 60 * 1000);
});
