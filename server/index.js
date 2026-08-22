"use strict";

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");

const db = require("./db");
const { seed } = require("./seed");
const push = require("./push");
const { ensureDataDir } = require("./paths");

seed();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "streetman-local-secret";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE = "sm_session";
app.set("trust proxy", 1);

const SERVICES = {
    haircut: { last: "19:00", price: 300 },
    beard: { last: "19:30", price: 200 },
    shave: { last: "19:30", price: 200 },
    dye: { last: "19:30", price: 150 },
    mustache: { last: "19:30", price: 500 },
    stacking: { last: "18:30", price: 1000 }
};

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
        `User-agent: *\nAllow: /\nDisallow: /barber\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`
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
    return Object.assign({}, row, {
        extras,
        extra_total: extraTotal,
        amount: base + extraTotal
    });
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
    return TIME_SLOTS.filter((slot) => slot <= last);
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
        maxAge: SESSION_MS,
        path: "/"
    };
}

function readSession(req) {
    const token = req.cookies[COOKIE];
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
    const remaining = Number(session.expires_at) - Date.now();
    if (remaining > SESSION_MS / 2) {
        return;
    }
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
    if (!req.barber || req.barber.role !== "owner") {
        return res.status(403).json({ error: "owner_required" });
    }
    next();
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

function takenSlots(barberId, date) {
    return db.prepare(`
        SELECT time FROM bookings
        WHERE barber_id = ? AND date = ? AND status != 'cancelled'
    `).all(barberId, date).map((row) => row.time);
}

function pickBarber(barberId, date, time) {
    const ids = activeIds();
    if (barberId && barberId !== "any") {
        if (!ids.includes(barberId)) {
            return null;
        }
        if (takenSlots(barberId, date).includes(time)) {
            return { error: "slot_taken" };
        }
        return { barberId };
    }
    for (const id of ids) {
        if (!takenSlots(id, date).includes(time)) {
            return { barberId: id };
        }
    }
    return { error: "shop_full" };
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
    const possible = slotsFor(service).filter((slot) => !isPastSlot(date, slot));
    let blocked = [];
    if (barberId !== "any" && activeIds().includes(barberId)) {
        blocked = takenSlots(barberId, date);
    } else {
        const ids = activeIds();
        blocked = possible.filter((slot) => ids.length > 0 && ids.every((id) => takenSlots(id, date).includes(slot)));
    }
    res.json({
        date,
        slots: possible.filter((slot) => !blocked.includes(slot))
    });
});

app.post("/api/bookings", (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (tooMany(ip)) {
        return res.status(429).json({ error: "too_many" });
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

    const chosen = pickBarber(requestedBarber, date, time);
    if (!chosen || chosen.error) {
        return res.status(409).json({ error: (chosen && chosen.error) || "slot_taken" });
    }

    const createdAt = new Date().toISOString();
    let info;
    try {
        info = db.prepare(`
            INSERT INTO bookings (customer_name, phone, service, barber_id, date, time, note, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).run(name, phone, service, chosen.barberId, date, time, note || null, createdAt);
    } catch (err) {
        if (err && String(err.code || "").startsWith("SQLITE_CONSTRAINT")) {
            return res.status(409).json({ error: "slot_taken" });
        }
        throw err;
    }

    const booking = decorateBooking(db.prepare(`
        SELECT b.*, br.name AS barber_name
        FROM bookings b
        JOIN barbers br ON br.id = b.barber_id
        WHERE b.id = ?
    `).get(info.lastInsertRowid));

    notify(chosen.barberId, { type: "new_booking", booking });
    push.notifyPush(chosen.barberId, booking);
    res.status(201).json({ ok: true, booking });
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
    res.json({ ok: true, barber: { id: barber.id, name: barber.name, username: barber.username, role: barber.role || "barber" } });
});

app.post("/api/logout", (req, res) => {
    const token = req.cookies[COOKIE];
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
            role: req.barber.role || "barber"
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
        shop: req.barber.role === "owner" ? shopSummary(date) : null
    });
});

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
        db.prepare("UPDATE bookings SET extras = ? WHERE id = ?").run(JSON.stringify(extras), id);
    }

    if (!req.body.status && !req.body.add_extra && !req.body.remove_extra && !req.body.extras) {
        return res.status(400).json({ error: "bad_update" });
    }

    const booking = decorateBooking(db.prepare("SELECT * FROM bookings WHERE id = ?").get(id));
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

app.listen(PORT, () => {
    console.log(`StreetMan Barber Phuket running at http://localhost:${PORT}`);
    console.log("Data directory:", ensureDataDir());
    console.log("Customer booking: /book.html");
    console.log("Barber login: /barber/login.html");
    console.log("Barber dashboard: /barber/dashboard.html");
    setTimeout(sendDayReminders, 8000);
    setInterval(sendDayReminders, 60 * 1000);
});
