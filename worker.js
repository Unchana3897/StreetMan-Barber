const SERVICES = {
  haircut: { last: "19:00", price: 300, slots: 2 },
  beard: { last: "19:30", price: 200, slots: 1 },
  shave: { last: "19:30", price: 200, slots: 1 },
  dye: { last: "19:30", price: 150, slots: 1 },
  mustache: { last: "19:30", price: 500, slots: 1 },
  stacking: { last: "18:30", price: 1000, slots: 3 }
};

const TIME_SLOTS = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
];
const SESSION_MS = 10 * 365 * 24 * 60 * 60 * 1000;
let seedPromise = null;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      ...extra
    }
  });
}

async function body(request) {
  try { return await request.json(); } catch (_) { return {}; }
}

function bangkokNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addDays(iso, count) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

function weekRange(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const from = addDays(iso, dow === 0 ? -6 : 1 - dow);
  return { from, to: addDays(from, 6) };
}

function monthRange(iso) {
  const key = iso.slice(0, 7);
  const [year, month] = key.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { key, from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

function weekdayOf(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function parseDayOff(value) {
  if (value === null || value === undefined || value === "" || value === -1 || value === "-1") return null;
  const n = Number(value);
  return n >= 0 && n <= 6 ? n : undefined;
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return hex(data);
}

async function passwordHash(password) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return `sha256:${hex(new Uint8Array(digest))}`;
}

async function ensureSeed(env) {
  if (!seedPromise) {
    seedPromise = (async () => {
      const hash = await passwordHash("StreetMan2026");
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO barbers (id,name,username,password_hash,role,active) VALUES (?,?,?,?,?,1)").bind("rim", "Rim", "rim", hash, "owner"),
        env.DB.prepare("INSERT OR IGNORE INTO barbers (id,name,username,password_hash,role,active) VALUES (?,?,?,?,?,1)").bind("bank", "Bank", "bank", hash, "barber"),
        env.DB.prepare("INSERT OR IGNORE INTO barbers (id,name,username,password_hash,role,active) VALUES (?,?,?,?,?,1)").bind("rick", "Rick", "rick", hash, "barber"),
        env.DB.prepare("INSERT OR IGNORE INTO barbers (id,name,username,password_hash,role,active) VALUES (?,?,?,?,?,1)").bind("dee", "Dee", "dee", hash, "barber"),
        env.DB.prepare("INSERT OR IGNORE INTO barbers (id,name,username,password_hash,role,active) VALUES (?,?,?,?,?,1)").bind("pos", "เคาน์เตอร์", "pos", hash, "cashier"),
        env.DB.prepare("INSERT OR IGNORE INTO shop_settings (key,value) VALUES ('closed','0')"),
        env.DB.prepare("INSERT OR IGNORE INTO shop_settings (key,value) VALUES ('closed_note','')")
      ]);
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

async function all(env, sql, ...params) {
  const result = await env.DB.prepare(sql).bind(...params).all();
  return result.results || [];
}

async function first(env, sql, ...params) {
  return await env.DB.prepare(sql).bind(...params).first();
}

function publicBarber(row) {
  return { id: row.id, name: row.name, username: row.username, role: row.role || "barber", active: Number(row.active) === 1, day_off: parseDayOff(row.day_off) };
}

async function listBarbers(env, activeOnly = false, chairsOnly = false) {
  let where = [];
  if (activeOnly) where.push("active = 1");
  if (chairsOnly) where.push("role != 'cashier'");
  const sql = `SELECT id,name,username,role,active,day_off FROM barbers${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE WHEN role='owner' THEN 0 WHEN role='cashier' THEN 2 ELSE 1 END,name`;
  return (await all(env, sql)).map(publicBarber);
}

function parseExtras(raw, mainService) {
  let list = raw;
  try { if (typeof raw === "string") list = JSON.parse(raw || "[]"); } catch (_) { list = []; }
  if (!Array.isArray(list)) list = [];
  const seen = new Set();
  const output = [];
  for (const item of list) {
    if (item && typeof item === "object") {
      const amount = Math.round(Number(item.amount));
      if (amount >= 1 && amount <= 50000) output.push({ type: "other", amount });
    } else if (SERVICES[item] && item !== mainService && !seen.has(item)) {
      seen.add(item); output.push(item);
    }
  }
  return output;
}

function extraAmount(item) { return item && typeof item === "object" ? Number(item.amount) || 0 : (SERVICES[item]?.price || 0); }
function slotsCount(service, extras = []) { return (SERVICES[service]?.slots || 1) + extras.reduce((n, item) => n + (typeof item === "string" ? (SERVICES[item]?.slots || 0) : 0), 0); }
function occupyRange(time, count, clamp = false) {
  const index = TIME_SLOTS.indexOf(time);
  if (index < 0 || count < 1) return null;
  if (index + count > TIME_SLOTS.length) return clamp ? TIME_SLOTS.slice(index) : null;
  return TIME_SLOTS.slice(index, index + count);
}
function endTime(time, count) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + count * 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function decorate(row, includeToken = false) {
  if (!row) return row;
  const extras = parseExtras(row.extras, row.service);
  const slots = slotsCount(row.service, extras);
  const output = { ...row, extras, extra_total: extras.reduce((sum, item) => sum + extraAmount(item), 0), slots, end_time: endTime(row.time, slots) };
  output.amount = (SERVICES[row.service]?.price || 0) + output.extra_total;
  output.payment_method ||= null; output.paid_at ||= null;
  if (!includeToken) delete output.cancel_token;
  return output;
}

async function shopState(env) {
  const rows = await all(env, "SELECT key,value FROM shop_settings WHERE key IN ('closed','closed_note')");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { closed: map.closed === "1", note: map.closed_note || "" };
}

async function placement(env, barberId, date, time, service, extras = [], exceptId = null) {
  const count = slotsCount(service, extras);
  const range = occupyRange(time, count, Boolean(exceptId));
  if (!range) return { error: "bad_time" };
  const bookings = await all(env, "SELECT id,time,service,extras FROM bookings WHERE barber_id=? AND date=? AND status!='cancelled'", barberId, date);
  const occupied = new Set();
  bookings.forEach((row) => {
    if (exceptId && Number(row.id) === Number(exceptId)) return;
    (occupyRange(row.time, slotsCount(row.service, parseExtras(row.extras, row.service)), true) || [row.time]).forEach((slot) => occupied.add(slot));
  });
  const blocks = new Set((await all(env, "SELECT slot FROM barber_blocks WHERE barber_id=? AND date=?", barberId, date)).map((r) => r.slot));
  if (range.some((slot) => occupied.has(slot) || blocks.has(slot))) return { error: exceptId ? "extra_overlap" : "slot_taken" };
  return { ok: true, range };
}

async function pickBarber(env, requested, date, time, service, extras = []) {
  const chairs = await listBarbers(env, true, true);
  const candidates = requested && requested !== "any" ? chairs.filter((b) => b.id === requested) : chairs;
  if (!candidates.length) return { error: "bad_barber" };
  for (const barber of candidates) {
    if (barber.day_off === weekdayOf(date)) continue;
    if (!(await placement(env, barber.id, date, time, service, extras)).error) return { barber };
  }
  return { error: "slot_taken" };
}

async function availabilityContext(env, date) {
  const [chairs, bookings, blocks] = await Promise.all([
    listBarbers(env, true, true),
    all(env, "SELECT barber_id,time,service,extras FROM bookings WHERE date=? AND status!='cancelled'", date),
    all(env, "SELECT barber_id,slot FROM barber_blocks WHERE date=?", date)
  ]);
  const unavailable = new Map(chairs.map((barber) => [barber.id, new Set()]));
  bookings.forEach((row) => {
    if (!unavailable.has(row.barber_id)) unavailable.set(row.barber_id, new Set());
    (occupyRange(row.time, slotsCount(row.service, parseExtras(row.extras, row.service)), true) || [row.time])
      .forEach((slot) => unavailable.get(row.barber_id).add(slot));
  });
  blocks.forEach((row) => {
    if (!unavailable.has(row.barber_id)) unavailable.set(row.barber_id, new Set());
    unavailable.get(row.barber_id).add(row.slot);
  });
  return { chairs, unavailable };
}

function hasAvailableBarber(context, requested, date, time, service) {
  const range = occupyRange(time, slotsCount(service), false);
  if (!range) return false;
  const candidates = requested && requested !== "any"
    ? context.chairs.filter((barber) => barber.id === requested)
    : context.chairs;
  return candidates.some((barber) => {
    if (barber.day_off === weekdayOf(date)) return false;
    const unavailable = context.unavailable.get(barber.id) || new Set();
    return !range.some((slot) => unavailable.has(slot));
  });
}

function isPast(date, time) {
  const now = bangkokNow();
  return date < now.date || (date === now.date && time <= now.time);
}

function slotsFor(service) {
  const spec = SERVICES[service];
  return spec ? TIME_SLOTS.filter((slot) => slot <= spec.last && occupyRange(slot, spec.slots)) : [];
}

function cookieToken(request) {
  const header = request.headers.get("X-Session-Token") || "";
  if (/^[a-f0-9]{64}$/i.test(header)) return header;
  const match = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)sm_session=([a-f0-9]{64})/i);
  return match ? match[1] : "";
}

async function session(env, request) {
  const token = cookieToken(request);
  if (!token) return null;
  const row = await first(env, `SELECT s.token,s.barber_id,s.expires_at,b.name,b.username,b.role,b.active,b.day_off FROM sessions s JOIN barbers b ON b.id=s.barber_id WHERE s.token=? AND s.expires_at>?`, token, Date.now());
  if (!row || Number(row.active) !== 1) return null;
  await env.DB.prepare("UPDATE sessions SET expires_at=? WHERE token=?").bind(Date.now() + SESSION_MS, token).run();
  return row;
}

function meObject(auth) {
  return { id: auth.barber_id, name: auth.name, username: auth.username, role: auth.role || "barber", day_off: parseDayOff(auth.day_off), token: auth.token };
}

function requireRole(auth, role) {
  if (!auth) return json({ error: "login_required" }, 401);
  if (role === "chair" && auth.role === "cashier") return json({ error: "chair_required" }, 403);
  if (role === "owner" && auth.role !== "owner" && auth.barber_id !== "rim") return json({ error: "owner_required" }, 403);
  if (role === "pos" && auth.role !== "cashier" && auth.role !== "owner" && auth.barber_id !== "pos" && auth.barber_id !== "rim") return json({ error: "pos_required" }, 403);
  return null;
}

function phoneKey(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function summarize(rows) {
  const done = rows.filter((r) => r.status === "done");
  const remaining = rows.filter((r) => r.status === "pending" || r.status === "confirmed");
  return {
    booked: rows.filter((r) => r.status !== "cancelled").length,
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    done: done.length,
    remaining: remaining.length,
    heads: rows.filter((r) => r.status !== "cancelled").length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    revenue: done.reduce((sum, r) => sum + decorate(r).amount, 0)
  };
}

function sourceSplit(rows) {
  const done = rows.filter((r) => r.status === "done");
  const walkin = (r) => r.note === "Walk in" || r.phone === "walkin" || r.customer_name === "วอล์กอิน";
  const part = (list) => ({ done: list.length, revenue: list.reduce((sum, r) => sum + decorate(r).amount, 0) });
  return { shop: part(done.filter(walkin)), online: part(done.filter((r) => !walkin(r))) };
}

async function bookingsBetween(env, barberId, from, to) {
  const sql = `SELECT b.*,br.name AS barber_name FROM bookings b JOIN barbers br ON br.id=b.barber_id WHERE ${barberId ? "b.barber_id=? AND " : ""}b.date>=? AND b.date<=? ORDER BY b.date,b.time,b.id`;
  return await all(env, sql, ...(barberId ? [barberId, from, to] : [from, to]));
}

async function incomeFor(env, barberId, date) {
  const week = weekRange(date), month = monthRange(date);
  const dayRows = await bookingsBetween(env, barberId, date, date);
  const weekRows = await bookingsBetween(env, barberId, week.from, week.to);
  const monthRows = await bookingsBetween(env, barberId, month.from, month.to);
  const series = (rows, from, to) => {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const sum = summarize(rows.filter((r) => r.date === d));
      out.push({ date: d, done: sum.done, revenue: sum.revenue });
    }
    return out;
  };
  return {
    date,
    day: { date, ...summarize(dayRows), sources: sourceSplit(dayRows) },
    week: { ...week, ...summarize(weekRows), series: series(weekRows, week.from, week.to), sources: sourceSplit(weekRows) },
    month: { ...month, ...summarize(monthRows), series: series(monthRows, month.from, month.to), sources: sourceSplit(monthRows) }
  };
}

async function shopSummary(env, date) {
  const month = monthRange(date);
  const chairs = await listBarbers(env, false, true);
  return {
    day: summarize(await bookingsBetween(env, null, date, date)),
    month: { key: month.key, ...summarize(await bookingsBetween(env, null, month.from, month.to)) },
    barbers: await Promise.all(chairs.map(async (barber) => ({
      id: barber.id, name: barber.name, username: barber.username, active: barber.active,
      day: summarize(await bookingsBetween(env, barber.id, date, date)),
      month: { key: month.key, ...summarize(await bookingsBetween(env, barber.id, month.from, month.to)) }
    })))
  };
}

async function handleApi(request, env, url) {
  const path = url.pathname, method = request.method;
  if (path === "/api/health" && method === "GET") return json({ ok: true });
  await ensureSeed(env);

  if (path === "/api/shop" && method === "GET") return json(await shopState(env));
  if (path === "/api/barbers" && method === "GET") {
    const rows = await listBarbers(env, true, true);
    return json({ barbers: rows.map(({ id, name, day_off }) => ({ id, name, day_off })) });
  }
  if (path === "/api/slots" && method === "GET") {
    const service = url.searchParams.get("service") || "haircut";
    const date = url.searchParams.get("date") || bangkokNow().date;
    const barber = url.searchParams.get("barber") || "any";
    if (!SERVICES[service]) return json({ error: "bad_service" }, 400);
    const [state, context] = await Promise.all([shopState(env), availabilityContext(env, date)]);
    if (state.closed) return json({ date, slots: [], closed: true, note: state.note });
    const output = slotsFor(service).filter((slot) => !isPast(date, slot) && hasAvailableBarber(context, barber, date, slot, service));
    return json({ date, slots: output, closed: false, note: state.note });
  }
  if (path === "/api/bookings" && method === "POST") {
    const data = await body(request);
    const name = String(data.customer_name || data.name || "").trim();
    const phone = String(data.phone || "").replace(/\s+/g, "");
    const service = String(data.service || ""), date = String(data.date || ""), time = String(data.time || "");
    if ((await shopState(env)).closed) return json({ error: "shop_closed" }, 403);
    if (name.length < 2 || name.length > 80) return json({ error: "bad_name" }, 400);
    if (!/^[0-9+]{8,16}$/.test(phone)) return json({ error: "bad_phone" }, 400);
    if (!SERVICES[service]) return json({ error: "bad_service" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < bangkokNow().date) return json({ error: "bad_date" }, 400);
    if (!slotsFor(service).includes(time) || isPast(date, time)) return json({ error: "bad_time" }, 400);
    const future = await all(env, "SELECT phone,date,time,service FROM bookings WHERE status IN ('pending','confirmed') AND (date>? OR (date=? AND time>=?))", bangkokNow().date, bangkokNow().date, bangkokNow().time);
    const existing = future.find((r) => phoneKey(r.phone) === phoneKey(phone));
    if (existing) return json({ error: "already_booked", booking: { date: existing.date, time: existing.time, service: existing.service } }, 409);
    const picked = await pickBarber(env, String(data.barber || "any"), date, time, service);
    if (picked.error) return json({ error: picked.error }, 409);
    const createdAt = new Date().toISOString(), cancelToken = randomToken(8);
    try {
      const result = await env.DB.prepare(`INSERT INTO bookings (customer_name,phone,service,barber_id,date,time,note,status,created_at,cancel_token) VALUES (?,?,?,?,?,?,?,'pending',?,?)`).bind(name, phone, service, picked.barber.id, date, time, String(data.note || "").trim().slice(0, 300) || null, createdAt, cancelToken).run();
      const row = await first(env, "SELECT b.*,br.name AS barber_name FROM bookings b JOIN barbers br ON br.id=b.barber_id WHERE b.id=?", result.meta.last_row_id);
      return json({ ok: true, booking: decorate(row, true) }, 201);
    } catch (_) { return json({ error: "slot_taken" }, 409); }
  }
  if (path === "/api/bookings/lookup" && method === "GET") {
    const token = String(url.searchParams.get("token") || "").toLowerCase().replace(/[^a-f0-9]/g, "");
    const row = token.length >= 12 ? await first(env, "SELECT b.*,br.name AS barber_name FROM bookings b JOIN barbers br ON br.id=b.barber_id WHERE b.cancel_token=?", token) : null;
    return row ? json({ ok: true, booking: decorate({ ...row, phone: `******${String(row.phone).slice(-4)}` }) }) : json({ error: "not_found" }, 404);
  }
  if (path === "/api/bookings/cancel" && method === "POST") {
    const data = await body(request), token = String(data.token || "").toLowerCase().replace(/[^a-f0-9]/g, "");
    const row = token.length >= 12 ? await first(env, "SELECT * FROM bookings WHERE cancel_token=?", token) : null;
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status === "done" || row.status === "cancelled") return json({ error: row.status === "done" ? "already_done" : "already_cancelled" }, 409);
    if (new Date(`${row.date}T${row.time}:00+07:00`).getTime() - Date.now() < 2 * 3600000) return json({ error: "too_late" }, 403);
    await env.DB.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").bind(row.id).run();
    return json({ ok: true, booking: decorate({ ...row, status: "cancelled" }) });
  }
  if (path === "/api/login" && method === "POST") {
    const data = await body(request), username = String(data.username || "").trim().toLowerCase(), password = String(data.password || "");
    const barber = await first(env, "SELECT * FROM barbers WHERE username=? AND active=1", username);
    if (!barber || barber.password_hash !== await passwordHash(password)) return json({ error: "bad_login" }, 401);
    const token = randomToken(32), expires = Date.now() + SESSION_MS;
    await env.DB.prepare("INSERT INTO sessions (token,barber_id,expires_at) VALUES (?,?,?)").bind(token, barber.id, expires).run();
    const output = { id: barber.id, name: barber.name, username: barber.username, role: barber.role || "barber", day_off: parseDayOff(barber.day_off), token };
    return json({ ok: true, token, barber: output }, 200, { "Set-Cookie": `sm_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=34560000` });
  }

  const auth = await session(env, request);
  if (path === "/api/logout" && method === "POST") {
    const token = cookieToken(request); if (token) await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
    return json({ ok: true }, 200, { "Set-Cookie": "sm_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
  }
  if (path === "/api/me" && method === "GET") return auth ? json({ barber: meObject(auth) }) : json({ error: "login_required" }, 401);
  if (path === "/api/barber/push-key" && method === "GET") return requireRole(auth) || json({ publicKey: "" });
  if ((path === "/api/barber/push-subscribe" || path === "/api/barber/push-unsubscribe") && method === "POST") return requireRole(auth) || json({ ok: true });
  if (path === "/api/barber/events") return auth ? new Response(null, { status: 204 }) : json({ error: "login_required" }, 401);

  if (path === "/api/barber/bookings" && method === "GET") {
    const denied = requireRole(auth, "chair"); if (denied) return denied;
    const date = url.searchParams.get("date") || bangkokNow().date;
    return json({ date, bookings: (await bookingsBetween(env, auth.barber_id, date, date)).map(decorate) });
  }
  if (path === "/api/barber/dashboard" && method === "GET") {
    const denied = requireRole(auth, "chair"); if (denied) return denied;
    const date = url.searchParams.get("date") || bangkokNow().date, now = bangkokNow();
    const rows = (await bookingsBetween(env, auth.barber_id, date, date)).map(decorate);
    const stats = summarize(rows), active = rows.filter((r) => r.status === "pending" || r.status === "confirmed");
    const upcomingRows = await all(env, "SELECT date,COUNT(*) count FROM bookings WHERE barber_id=? AND date>=? AND date<=? AND status!='cancelled' GROUP BY date", auth.barber_id, now.date, addDays(now.date, 13));
    const counts = new Map(upcomingRows.map((r) => [r.date, r.count]));
    const upcoming = Array.from({ length: 14 }, (_, i) => ({ date: addDays(now.date, i), count: counts.get(addDays(now.date, i)) || 0 }));
    const blocked = (await all(env, "SELECT slot FROM barber_blocks WHERE barber_id=? AND date=? ORDER BY slot", auth.barber_id, date)).map((r) => r.slot);
    const mine = await incomeFor(env, auth.barber_id, date);
    return json({ barber: meObject(auth), date, now, stats, next: date === now.date ? active.find((r) => r.time >= now.time) || null : active[0] || null, bookings: rows, upcoming, summary: { day: mine.day, month: mine.month }, shop: auth.role === "owner" ? await shopSummary(env, date) : null, shop_status: await shopState(env), hours: { date, slots: TIME_SLOTS, blocked }, day_off: parseDayOff(auth.day_off) });
  }
  if (path === "/api/barber/income" && method === "GET") {
    const denied = requireRole(auth, "chair"); if (denied) return denied;
    const date = url.searchParams.get("date") || bangkokNow().date, mine = await incomeFor(env, auth.barber_id, date);
    let shop = null;
    if (auth.role === "owner" || auth.barber_id === "rim") {
      shop = await incomeFor(env, null, date);
      const chairs = await listBarbers(env, false, true);
      shop.barbers = await Promise.all(chairs.map(async (b) => ({ id: b.id, name: b.name, username: b.username, active: b.active, ...(await incomeFor(env, b.id, date)) })));
    }
    return json({ barber: meObject(auth), date, day: mine.day, week: mine.week, month: mine.month, shop });
  }
  if (path === "/api/barber/hours" && method === "PUT") {
    const denied = requireRole(auth, "chair"); if (denied) return denied;
    const data = await body(request), date = String(data.date || bangkokNow().date);
    const blocked = [...new Set((Array.isArray(data.blocked) ? data.blocked : []).filter((s) => TIME_SLOTS.includes(s)))];
    await env.DB.prepare("DELETE FROM barber_blocks WHERE barber_id=? AND date=?").bind(auth.barber_id, date).run();
    if (blocked.length) await env.DB.batch(blocked.map((slot) => env.DB.prepare("INSERT INTO barber_blocks (barber_id,date,slot) VALUES (?,?,?)").bind(auth.barber_id, date, slot)));
    return json({ ok: true, hours: { date, slots: TIME_SLOTS, blocked: blocked.sort() } });
  }
  if (path === "/api/barber/day-off" && method === "PUT") {
    const denied = requireRole(auth, "chair"); if (denied) return denied;
    const data = await body(request), dayOff = parseDayOff(data.day_off);
    if (dayOff === undefined) return json({ error: "bad_day_off" }, 400);
    await env.DB.prepare("UPDATE barbers SET day_off=? WHERE id=?").bind(dayOff, auth.barber_id).run();
    return json({ ok: true, day_off: dayOff });
  }
  const bookingPatch = path.match(/^\/api\/barber\/bookings\/(\d+)$/);
  if (bookingPatch && method === "PATCH") {
    const denied = requireRole(auth, "chair"); if (denied) return denied;
    const id = Number(bookingPatch[1]), existing = await first(env, "SELECT * FROM bookings WHERE id=? AND barber_id=?", id, auth.barber_id);
    if (!existing) return json({ error: "not_found" }, 404);
    const data = await body(request); let changed = false, extras = parseExtras(existing.extras, existing.service);
    if (data.status) {
      if (!["pending", "confirmed", "done", "cancelled"].includes(data.status)) return json({ error: "bad_status" }, 400);
      await env.DB.prepare("UPDATE bookings SET status=? WHERE id=?").bind(data.status, id).run(); changed = true;
    }
    if (Array.isArray(data.extras) || data.add_extra || data.remove_extra) {
      if (Array.isArray(data.extras)) extras = parseExtras(data.extras, existing.service);
      if (data.add_extra) extras = parseExtras(extras.concat(String(data.add_extra)), existing.service);
      if (data.remove_extra) extras = extras.filter((x) => x !== String(data.remove_extra));
      const place = await placement(env, existing.barber_id, existing.date, existing.time, existing.service, extras, id);
      if (place.error) return json({ error: place.error }, 409);
      await env.DB.prepare("UPDATE bookings SET extras=? WHERE id=?").bind(JSON.stringify(extras), id).run(); changed = true;
    }
    if (!changed) return json({ error: "bad_update" }, 400);
    return json({ ok: true, booking: decorate(await first(env, "SELECT * FROM bookings WHERE id=?", id)) });
  }
  if (path === "/api/barber/pos" && method === "GET") {
    const denied = requireRole(auth, "pos"); if (denied) return denied;
    const date = url.searchParams.get("date") || bangkokNow().date;
    const rows = (await bookingsBetween(env, null, date, date)).filter((r) => r.status !== "cancelled").map(decorate);
    return json({ barber: meObject(auth), date, barbers: await listBarbers(env, true, true), open: rows.filter((r) => ["pending", "confirmed"].includes(r.status)), paid: rows.filter((r) => r.status === "done") });
  }
  const pay = path.match(/^\/api\/barber\/bookings\/(\d+)\/pay$/);
  if (pay && method === "POST") {
    const denied = requireRole(auth, "pos"); if (denied) return denied;
    const id = Number(pay[1]), existing = await first(env, "SELECT * FROM bookings WHERE id=?", id);
    if (!existing) return json({ error: "not_found" }, 404);
    const data = await body(request), methodName = String(data.method || "");
    if (!["cash", "transfer"].includes(methodName)) return json({ error: "bad_method" }, 400);
    if (existing.status === "cancelled") return json({ error: "already_cancelled" }, 409);
    const extras = Array.isArray(data.extras) ? parseExtras(data.extras, existing.service) : parseExtras(existing.extras, existing.service);
    const paidAt = new Date().toISOString();
    await env.DB.prepare("UPDATE bookings SET extras=?,status='done',payment_method=?,paid_at=? WHERE id=?").bind(JSON.stringify(extras), methodName, paidAt, id).run();
    return json({ ok: true, booking: decorate(await first(env, "SELECT * FROM bookings WHERE id=?", id)) });
  }
  if (path === "/api/barber/pos/walkin" && method === "POST") {
    const denied = requireRole(auth, "pos"); if (denied) return denied;
    const data = await body(request), service = String(data.service || ""), methodName = String(data.method || "");
    if (!SERVICES[service]) return json({ error: "bad_service" }, 400);
    if (!["cash", "transfer"].includes(methodName)) return json({ error: "bad_method" }, 400);
    const chairs = await listBarbers(env, true, true), barber = chairs.find((b) => b.id === data.barber_id) || chairs[0];
    if (!barber) return json({ error: "bad_barber" }, 400);
    const date = bangkokNow().date, extras = parseExtras(data.extras, service);
    let time = null;
    const current = bangkokNow().time;
    const ordered = TIME_SLOTS.filter((s) => s >= current).concat(TIME_SLOTS.filter((s) => s < current).reverse());
    for (const slot of ordered) if (!(await placement(env, barber.id, date, slot, service, extras)).error) { time = slot; break; }
    if (!time) return json({ error: "slot_taken" }, 409);
    const createdAt = new Date().toISOString(), name = String(data.customer_name || data.name || "").trim().slice(0, 80) || "วอล์กอิน", phone = String(data.phone || "").replace(/\s+/g, "") || "walkin";
    const result = await env.DB.prepare(`INSERT INTO bookings (customer_name,phone,service,extras,barber_id,date,time,note,status,created_at,cancel_token,payment_method,paid_at) VALUES (?,?,?,?,?,?,?,'Walk in','done',?,?,?,?)`).bind(name, phone, service, JSON.stringify(extras), barber.id, date, time, createdAt, randomToken(8), methodName, createdAt).run();
    return json({ ok: true, booking: decorate(await first(env, "SELECT b.*,br.name AS barber_name FROM bookings b JOIN barbers br ON br.id=b.barber_id WHERE b.id=?", result.meta.last_row_id)) });
  }
  if (path === "/api/owner/shop" && (method === "PATCH" || method === "POST")) {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const data = await body(request); if (data.closed == null) return json({ error: "bad_update" }, 400);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO shop_settings (key,value) VALUES ('closed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(data.closed === true || data.closed === 1 || data.closed === "1" ? "1" : "0"),
      env.DB.prepare("INSERT INTO shop_settings (key,value) VALUES ('closed_note',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(data.note || "").slice(0, 300))
    ]);
    return json({ ok: true, shop: await shopState(env) });
  }
  if (path === "/api/owner/barbers" && method === "GET") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    return json({ barbers: await listBarbers(env, false, false) });
  }
  if (path === "/api/owner/barbers" && method === "POST") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const data = await body(request), id = String(data.username || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""), name = String(data.name || "").trim(), password = String(data.password || "");
    if (name.length < 2 || !/^[a-z0-9]{2,20}$/.test(id) || password.length < 6) return json({ error: "bad_input" }, 400);
    if (await first(env, "SELECT id FROM barbers WHERE id=? OR username=?", id, id)) return json({ error: "username_taken" }, 409);
    const role = data.role === "cashier" ? "cashier" : "barber";
    await env.DB.prepare("INSERT INTO barbers (id,name,username,password_hash,role,active) VALUES (?,?,?,?,?,1)").bind(id, name.slice(0, 40), id, await passwordHash(password), role).run();
    return json({ ok: true, barber: publicBarber(await first(env, "SELECT id,name,username,role,active,day_off FROM barbers WHERE id=?", id)) }, 201);
  }
  const staffPatch = path.match(/^\/api\/owner\/barbers\/([a-z0-9]+)$/);
  if (staffPatch && method === "PATCH") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const id = staffPatch[1], existing = await first(env, "SELECT * FROM barbers WHERE id=?", id); if (!existing) return json({ error: "not_found" }, 404);
    const data = await body(request), name = data.name != null ? String(data.name).trim().slice(0, 40) : existing.name;
    let active = data.active == null ? Number(existing.active) : (data.active === true || data.active === 1 || data.active === "1" ? 1 : 0);
    if (["owner", "cashier"].includes(existing.role)) active = 1;
    let dayOff = parseDayOff(existing.day_off);
    if (Object.prototype.hasOwnProperty.call(data, "day_off")) { dayOff = existing.role === "cashier" ? null : parseDayOff(data.day_off); if (dayOff === undefined) return json({ error: "bad_day_off" }, 400); }
    if (data.password && String(data.password).length < 6) return json({ error: "bad_password" }, 400);
    const hash = data.password ? await passwordHash(String(data.password)) : existing.password_hash;
    await env.DB.prepare("UPDATE barbers SET name=?,active=?,day_off=?,password_hash=? WHERE id=?").bind(name, active, dayOff, hash, id).run();
    if (data.password || active === 0) await env.DB.prepare("DELETE FROM sessions WHERE barber_id=?").bind(id).run();
    return json({ ok: true, barber: publicBarber(await first(env, "SELECT id,name,username,role,active,day_off FROM barbers WHERE id=?", id)) });
  }
  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const host = url.hostname.toLowerCase();
      if (host === "www.streeetmanbarberphuket.shop" || host.endsWith(".workers.dev")) {
        const target = new URL(request.url);
        target.protocol = "https:";
        target.host = "streeetmanbarberphuket.shop";
        if (target.pathname === "/index.html") target.pathname = "/";
        else if (target.pathname.endsWith(".html")) target.pathname = target.pathname.slice(0, -5);
        return Response.redirect(target.toString(), 301);
      }
      if (url.pathname === "/index.html" || url.pathname.endsWith(".html")) {
        url.pathname = url.pathname === "/index.html" ? "/" : url.pathname.slice(0, -5);
        return Response.redirect(url.toString(), 301);
      }
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (url.pathname === "/barber" || url.pathname === "/barber/") return Response.redirect(`${url.origin}/barber/login.html`, 302);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Frame-Options", "DENY");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      if (url.pathname.startsWith("/barber/")) headers.set("X-Robots-Tag", "noindex, nofollow");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      console.error(error);
      return url.pathname.startsWith("/api/") ? json({ error: "server_error" }, 500) : new Response("Server error", { status: 500 });
    }
  }
};
