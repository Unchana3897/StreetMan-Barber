import { workbook as xlsxWorkbook, s as xs, n as xn, h as xh } from "./worker-xlsx.js";
import { pushConfigured, sendPush } from "./worker-push.js";

// Services and prices live in the D1 table `services` (owner edits them on
// "จัดการช่าง"). DEFAULT_SERVICES is only used before migration 0006 is applied.
const DEFAULT_SERVICES = [
  { id: "haircut", name: "ตัดผม", name_en: "Haircut", note: "รวมสระ", note_en: "Wash included", price: 300, minutes: 60, active: 1, sort: 1 },
  { id: "beard", name: "ตกแต่งเครา", name_en: "Beard Trim", note: "", note_en: "", price: 200, minutes: 20, active: 1, sort: 2 },
  { id: "shave", name: "โกนหนวด", name_en: "Men's Shave", note: "", note_en: "", price: 200, minutes: 20, active: 1, sort: 3 },
  { id: "dye", name: "ย้อมผม", name_en: "Hair Dyeing", note: "ส่วนเสริมคู่กับตัดผม", note_en: "Add-on with a haircut", price: 150, minutes: 20, active: 1, sort: 4 },
  { id: "mustache", name: "ตกแต่งหนวด", name_en: "Mustache", note: "", note_en: "", price: 500, minutes: 30, active: 1, sort: 5 },
  { id: "stacking", name: "เซ็ตทรง / Stacking", name_en: "Stacking / Restyle", note: "จัดทรงเต็ม", note_en: "Full restyle", price: 1000, minutes: 90, active: 1, sort: 6 }
];
// id -> { name, price, slots, last, active, ... }; refreshed from D1 at the start of every API request.
let SERVICES = {};

const TIME_SLOTS = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
];
function serviceMap(rows) {
  const map = {};
  rows.forEach((r) => {
    const slots = Math.min(6, Math.max(1, Math.ceil((Number(r.minutes) || 30) / 30)));
    // Last start time so the service still ends by closing (20:00).
    const last = TIME_SLOTS[Math.max(0, TIME_SLOTS.length - slots)];
    map[r.id] = { ...r, price: Number(r.price) || 0, minutes: Number(r.minutes) || 30, slots, last, active: Number(r.active) === 1 };
  });
  return map;
}
SERVICES = serviceMap(DEFAULT_SERVICES);

async function loadServices(env) {
  try {
    const rows = (await env.DB.prepare("SELECT * FROM services ORDER BY sort,created_at").all()).results || [];
    if (rows.length) SERVICES = serviceMap(rows);
  } catch (_) { SERVICES = serviceMap(DEFAULT_SERVICES); }
}

function publicService(s) {
  return { id: s.id, name: s.name, name_en: s.name_en || s.name, note: s.note || "", note_en: s.note_en || "", price: s.price, minutes: s.minutes, slots: s.slots, last: s.last, active: s.active, sort: s.sort };
}

const isBookable = (id) => Boolean(SERVICES[id] && SERVICES[id].active);
const svcName = (id) => (SERVICES[id] && SERVICES[id].name) || id;

// Prices this bill is charged at, frozen into bookings.prices.
function priceSnapshot(service, extras = []) {
  const out = {};
  [service].concat(extras.filter((x) => typeof x === "string")).forEach((id) => { if (SERVICES[id]) out[id] = SERVICES[id].price; });
  return JSON.stringify(out);
}

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

// Workers caps PBKDF2 at 100,000 iterations.
const PBKDF2_ITERATIONS = 100000;
// The old shared default password was published in the source; never accept it as a new one.
const LEAKED_PASSWORDS = new Set(["streetman2026"]);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT_PER_USER = 5;
const LOGIN_LIMIT_PER_IP = 20;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_LIMIT_PER_IP = 5;
const MAX_PENDING_SIGNUPS = 20;

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return hex(new Uint8Array(bits));
}

function unhex(text) {
  return new Uint8Array((text.match(/../g) || []).map((pair) => parseInt(pair, 16)));
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function passwordHash(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${hex(salt)}$${await pbkdf2(password, salt, PBKDF2_ITERATIONS)}`;
}

// Returns { ok, legacy } — legacy hashes are upgraded after a successful login.
async function verifyPassword(password, stored) {
  stored = String(stored || "");
  if (stored.startsWith("pbkdf2$")) {
    const [, iterations, salt, expected] = stored.split("$");
    return { ok: sameText(await pbkdf2(password, unhex(salt), Number(iterations)), expected), legacy: false };
  }
  if (stored.startsWith("sha256:")) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    return { ok: sameText(`sha256:${hex(new Uint8Array(digest))}`, stored), legacy: true };
  }
  return { ok: false, legacy: false };
}

function passwordProblem(password, username, current = "") {
  if (password.length < 8 || password.length > 72) return "weak_password";
  const lower = password.toLowerCase();
  if (LEAKED_PASSWORDS.has(lower) || lower === String(username || "").toLowerCase() || (current && password === current)) return "weak_password";
  return null;
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "local";
}

async function overLimit(env, key, limit, windowMs) {
  const row = await first(env, "SELECT count,window_start FROM login_attempts WHERE key=?", key);
  return Boolean(row && row.window_start > Date.now() - windowMs && row.count >= limit);
}

async function countAttempt(env, key, windowMs) {
  const now = Date.now(), stale = now - windowMs;
  await env.DB.prepare(`INSERT INTO login_attempts (key,count,window_start) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END`).bind(key, now, stale, stale, now).run();
}

async function clearAttempts(env, key) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE key=?").bind(key).run();
}

function loginKeys(request, username) {
  return { user: `login:user:${username}`, ip: `login:ip:${clientIp(request)}` };
}

async function loginBlocked(env, keys) {
  return (await overLimit(env, keys.user, LOGIN_LIMIT_PER_USER, LOGIN_WINDOW_MS)) || (await overLimit(env, keys.ip, LOGIN_LIMIT_PER_IP, LOGIN_WINDOW_MS));
}

async function loginFailed(env, keys) {
  await countAttempt(env, keys.user, LOGIN_WINDOW_MS);
  await countAttempt(env, keys.ip, LOGIN_WINDOW_MS);
}

// Checks username + password with rate limiting. Returns { barber } or { response }.
async function checkCredentials(env, request, username, password) {
  const keys = loginKeys(request, username);
  if (await loginBlocked(env, keys)) return { response: json({ error: "too_many_attempts" }, 429) };
  const barber = await first(env, "SELECT * FROM barbers WHERE username=?", username);
  // Hash even when the user is missing so response time does not reveal which usernames exist.
  const check = await verifyPassword(password, barber ? barber.password_hash : `pbkdf2$${PBKDF2_ITERATIONS}$00$00`);
  if (!barber || !check.ok) {
    await loginFailed(env, keys);
    return { response: json({ error: "bad_login" }, 401) };
  }
  await clearAttempts(env, keys.user);
  if (barber.status === "pending") return { response: json({ error: "pending_approval" }, 403) };
  if (Number(barber.active) !== 1) return { response: json({ error: "bad_login" }, 401) };
  if (check.legacy) {
    barber.password_hash = await passwordHash(password);
    await env.DB.prepare("UPDATE barbers SET password_hash=? WHERE id=?").bind(barber.password_hash, barber.id).run();
  }
  return { barber };
}

async function startSession(env, barber) {
  const token = randomToken(32), expires = Date.now() + SESSION_MS;
  await env.DB.prepare("INSERT INTO sessions (token,barber_id,expires_at) VALUES (?,?,?)").bind(token, barber.id, expires).run();
  const output = { id: barber.id, name: barber.name, username: barber.username, role: barber.role || "barber", day_off: parseDayOff(barber.day_off), token };
  return json({ ok: true, token, barber: output }, 200, { "Set-Cookie": `sm_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=34560000` });
}

async function ensureSeed(env) {
  if (!seedPromise) {
    seedPromise = (async () => {
      // Fill end_time on bookings created before the column existed.
      const rows = await all(env, "SELECT id,time,service,extras FROM bookings WHERE end_time IS NULL");
      if (rows.length) {
        await env.DB.batch(rows.map((row) => env.DB.prepare("UPDATE bookings SET end_time=? WHERE id=?")
          .bind(endTime(row.time, slotsCount(row.service, parseExtras(row.extras, row.service))), row.id)));
      }
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
  return { id: row.id, name: row.name, username: row.username, role: row.role || "barber", active: Number(row.active) === 1, status: row.status || "approved", must_change_password: Number(row.must_change_password) === 1, day_off: parseDayOff(row.day_off) };
}

// Deleted barbers (status 'deleted') keep their history but are left out of lists,
// except income/payroll (includeDeleted) where they show only if they have bookings.
async function listBarbers(env, activeOnly = false, chairsOnly = false, includeDeleted = false) {
  let where = [];
  if (!includeDeleted) where.push("status != 'deleted'");
  if (activeOnly) where.push("active = 1", "status = 'approved'");
  // Chairs = people customers can book. Cashiers and system admins are not barbers.
  if (chairsOnly) where.push("role NOT IN ('cashier','admin')");
  const sql = `SELECT id,name,username,role,active,status,must_change_password,day_off FROM barbers${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE WHEN role IN ('owner','admin') THEN 0 WHEN role='cashier' THEN 2 ELSE 1 END,name`;
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

function snapshotOf(row) {
  try { return row && row.prices ? JSON.parse(row.prices) : {}; } catch (_) { return {}; }
}
function priceIn(snapshot, id) { return Object.prototype.hasOwnProperty.call(snapshot, id) ? Number(snapshot[id]) || 0 : (SERVICES[id]?.price || 0); }
function extraAmount(item, snapshot = {}) { return item && typeof item === "object" ? Number(item.amount) || 0 : priceIn(snapshot, item); }
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
  const snap = snapshotOf(row);
  const output = { ...row, extras, extra_total: extras.reduce((sum, item) => sum + extraAmount(item, snap), 0), slots, end_time: endTime(row.time, slots) };
  output.amount = priceIn(snap, row.service) + output.extra_total;
  // Line items as charged, so screens and receipts never re-price an old bill.
  output.items = [{ id: row.service, name: svcName(row.service), price: priceIn(snap, row.service) }].concat(extras.map((item) =>
    item && typeof item === "object" ? { id: "other", name: "อื่นๆ", price: Number(item.amount) || 0 } : { id: item, name: svcName(item), price: priceIn(snap, item) }));
  output.service_name = svcName(row.service);
  output.payment_method ||= null; output.paid_at ||= null;
  if (!includeToken) delete output.cancel_token;
  return output;
}

const PAYMENT_QR_MAX_BYTES = 1024 * 1024;
const PAYMENT_QR_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

function base64Bytes(text) {
  const raw = atob(text), out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Accepts "data:image/png|jpeg|webp;base64,..." and checks the file signature matches.
function parsePaymentQr(value) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ""));
  if (!match) return { error: "bad_image" };
  let bytes;
  try { bytes = base64Bytes(match[2]); } catch (_) { return { error: "bad_image" }; }
  if (!bytes.length) return { error: "bad_image" };
  if (bytes.length > PAYMENT_QR_MAX_BYTES) return { error: "image_too_large" };
  const sig = (offset, list) => list.every((b, i) => bytes[offset + i] === b);
  const ok = match[1] === "png" ? sig(0, [0x89, 0x50, 0x4e, 0x47])
    : match[1] === "jpeg" ? sig(0, [0xff, 0xd8, 0xff])
    : sig(0, [0x52, 0x49, 0x46, 0x46]) && sig(8, [0x57, 0x45, 0x42, 0x50]);
  if (!ok) return { error: "bad_image" };
  return { type: PAYMENT_QR_TYPES[match[1]], bytes, dataUrl: match[0] };
}

function normalizePromptPay(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^0\d{9}$/.test(digits) || /^\d{13}$/.test(digits) || /^\d{15}$/.test(digits) ? digits : "";
}

async function promptPayId(env) {
  const row = await first(env, "SELECT value FROM shop_settings WHERE key='promptpay_id'");
  return row ? normalizePromptPay(row.value) : "";
}

const APPROVAL_CODE_MS = 15 * 60 * 1000;
const EDIT_CODE_FAIL_LIMIT = 5;
const EDIT_CODE_WINDOW_MS = 15 * 60 * 1000;
const PENDING_EDITS_PER_DAY = 3;

function sixDigitCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

function billSnapshot(row) {
  const d = decorate(row);
  return { service: d.service, extras: d.extras, method: d.payment_method, amount: d.amount, prices: d.prices || null, items: d.items };
}

// Latest edit per booking for these rows; empty if the edit tables are not migrated yet.
async function lastEdits(env, ids) {
  if (!ids.length) return {};
  try {
    const rows = await all(env, `SELECT id,booking_id,code,edited_at,status FROM bill_edits WHERE booking_id IN (${ids.map(() => "?").join(",")}) AND status!='rejected' ORDER BY id`, ...ids);
    return Object.fromEntries(rows.map((r) => [r.booking_id, { id: r.id, code: r.code, edited_at: r.edited_at, status: r.status }]));
  } catch (_) { return {}; }
}

const PAY_NAMES = { cash: "เงินสด", transfer: "โอน / QR" };
const isWalkinRow = (r) => r.note === "walk-in" || r.note === "Walk in" || r.phone === "walkin" || r.customer_name === "วอล์กอิน";

function prettyPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : (phone || "");
}

function serviceLine(row) {
  return (row.items || []).map((item) => item.id === "other" ? `อื่นๆ ${item.price}` : item.name).join(" + ");
}

// Payroll workbook: one summary sheet plus one sheet per barber (finished work in the range).
async function payrollWorkbook(env, from, to) {
  const details = (await all(env, `SELECT b.*,br.name AS barber_name FROM bookings b JOIN barbers br ON br.id=b.barber_id
    WHERE b.status='done' AND b.date>=? AND b.date<=? ORDER BY br.name,b.date,b.time,b.id`, from, to)).map((r) => decorate(r));
  const chairs = await listBarbers(env, false, true, true);
  const sheetName = (name) => String(name || "ช่าง").replace(/[:\\/?*[\]]/g, "").slice(0, 31) || "ช่าง";
  const when = (r) => { const [y, m, d] = r.date.split("-"); return `${d}/${m}/${y} ${String(r.time).slice(0, 5)}`; };
  const sum = (rows) => rows.reduce((t, r) => t + r.amount, 0);
  const summary = chairs.map((b) => { const rows = details.filter((r) => r.barber_id === b.id); return { b, rows }; })
    .filter(({ b, rows }) => b.status !== "deleted" || rows.length);
  const walkins = details.filter(isWalkinRow), online = details.filter((r) => !isWalkinRow(r));
  const bold = (v) => ({ v, h: true, n: typeof v === "number" });
  const blank = () => xs("");
  // One channel block: heading, cash, transfer, (not yet charged), subtotal.
  const channel = (title, rows) => {
    const cash = rows.filter((r) => r.payment_method === "cash");
    const transfer = rows.filter((r) => r.payment_method === "transfer");
    const unpaid = rows.filter((r) => !r.payment_method);
    return [
      [bold(title), blank(), blank(), blank()],
      [xs("      เงินสด"), blank(), xn(cash.length), xn(sum(cash))],
      [xs("      เงินโอน"), blank(), xn(transfer.length), xn(sum(transfer))],
      ...(unpaid.length ? [[xs("      ยังไม่ได้คิดเงิน"), blank(), xn(unpaid.length), xn(sum(unpaid))]] : []),
      [bold("รวม" + title), blank(), bold(rows.length), bold(sum(rows))]
    ];
  };
  const cashAll = details.filter((r) => r.payment_method === "cash");
  const transferAll = details.filter((r) => r.payment_method === "transfer");
  return xlsxWorkbook([
    {
      name: "สรุปจ่ายเงินเดือน",
      widths: [30, 16, 12, 16, 20],
      rows: [
        // Table 1: per barber (for payroll)
        [xh("ช่าง"), xh("ชื่อเข้าสู่ระบบ"), xh("จำนวนหัว"), xh("ยอดร้าน (บาท)"), xh("ยอดจ่ายช่าง")],
        ...summary.map(({ b, rows }) => [xs(b.name), xs(b.username), xn(rows.length), xn(sum(rows)), xs("")]),
        [bold("รวมทุกช่าง"), blank(), bold(details.length), bold(sum(details)), blank()],
        [blank()],
        // Table 2: by channel, then by how the money came in
        [xh("ช่องทาง / วิธีจ่าย"), blank(), xh("จำนวนหัว"), xh("ยอด (บาท)")],
        ...channel("หน้าร้าน (Walk-in)", walkins),
        [blank()],
        ...channel("จองออนไลน์", online),
        [blank()],
        [bold("รวมทั้งร้าน"), blank(), bold(details.length), bold(sum(details))],
        [xs("      เงินสดรวม (ตรวจกับเงินในลิ้นชัก)"), blank(), xn(cashAll.length), xn(sum(cashAll))],
        [xs("      เงินโอนรวม (ตรวจกับยอดเข้าบัญชี)"), blank(), xn(transferAll.length), xn(sum(transferAll))]
      ]
    },
    ...summary.map(({ b, rows }) => ({
      name: sheetName(b.name),
      widths: [16, 16, 16, 28, 12, 14, 14, 18],
      rows: [
        [xh("วันเวลา"), xh("ลูกค้า"), xh("เบอร์"), xh("บริการ"), xh("ยอด"), xh("ช่องทาง"), xh("วิธีจ่าย"), xh("หมายเหตุ")],
        ...rows.map((r) => [xs(when(r)), xs(isWalkinRow(r) ? "Walk in" : r.customer_name), xs(isWalkinRow(r) ? "" : prettyPhone(r.phone)),
          { v: serviceLine(r), w: true }, xn(r.amount), xs(isWalkinRow(r) ? "หน้าร้าน" : "ออนไลน์"),
          xs(PAY_NAMES[r.payment_method] || "ยังไม่ได้คิดเงิน"), { v: isWalkinRow(r) ? "Walk in" : (r.note || ""), w: true }]),
        [xs("รวม " + b.name), xs(""), xs(""), xs(rows.length + " คน"), xn(sum(rows)), xs(""), xs(""), xs("")]
      ]
    }))
  ]);
}

// Notifications. Never blocks or fails the request that triggered it.
async function notify(env, ctx, barberIds, message) {
  if (!pushConfigured(env) || !barberIds.length) return;
  const job = (async () => {
    try {
      const subs = await all(env, `SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE barber_id IN (${barberIds.map(() => "?").join(",")})`, ...barberIds);
      await Promise.all(subs.map(async (sub) => {
        try {
          const status = await sendPush(env, sub, { tag: "streetman-" + (message.kind || "queue"), ...message });
          if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(sub.endpoint).run();
        } catch (error) { console.error("push", error); }
      }));
    } catch (error) { console.error("push", error); }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
}

async function ownerIds(env) {
  return (await all(env, "SELECT id FROM barbers WHERE (role IN ('owner','admin') OR id='rim') AND active=1")).map((r) => r.id);
}

async function cashierIds(env) {
  return (await all(env, "SELECT id FROM barbers WHERE role='cashier' AND active=1")).map((r) => r.id);
}

function shortDate(iso) {
  const [, m, d] = String(iso).split("-");
  return `${d}/${m}`;
}

function cleanService(data) {
  const name = String(data.name || "").trim().slice(0, 60);
  const nameEn = String(data.name_en || "").trim().slice(0, 60);
  const price = Math.round(Number(data.price));
  const minutes = Math.round(Number(data.minutes));
  if (name.length < 2) return { error: "bad_name" };
  if (!(price >= 0 && price <= 100000)) return { error: "bad_price" };
  if (!(minutes >= 10 && minutes <= 180)) return { error: "bad_minutes" };
  return { name, name_en: nameEn, note: String(data.note || "").trim().slice(0, 120), note_en: String(data.note_en || "").trim().slice(0, 120), price, minutes };
}

async function shopState(env) {
  const rows = await all(env, "SELECT key,value FROM shop_settings WHERE key IN ('closed','closed_note','payment_qr_updated')");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { closed: map.closed === "1", note: map.closed_note || "", payment_qr: map.payment_qr_updated || "" };
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

// Inserts only if nothing overlaps [time, end) for that barber, in one statement,
// so two customers booking at the same moment cannot both get the chair.
async function insertIfFree(env, columns, values, barberId, date, time, end) {
  const result = await env.DB.prepare(`INSERT INTO bookings (${columns.join(",")},end_time)
    SELECT ${columns.map(() => "?").join(",")},?
    WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE barber_id=? AND date=? AND status!='cancelled' AND time<? AND COALESCE(end_time,time)>?)
      AND NOT EXISTS (SELECT 1 FROM barber_blocks WHERE barber_id=? AND date=? AND slot>=? AND slot<?)`)
    .bind(...values, end, barberId, date, end, time, barberId, date, time, end).run();
  return result.meta.changes ? result.meta.last_row_id : null;
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
  const spec = isBookable(service) ? SERVICES[service] : null;
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

function isOwnerAuth(auth) {
  return Boolean(auth && (auth.role === "owner" || auth.role === "admin" || auth.barber_id === "rim"));
}

function requireRole(auth, role) {
  if (!auth) return json({ error: "login_required" }, 401);
  if (role === "chair" && auth.role === "cashier") return json({ error: "chair_required" }, 403);
  // "admin" (ผู้ดูแลระบบ) has the owner's rights but is not a barber.
  if (role === "owner" && !isOwnerAuth(auth)) return json({ error: "owner_required" }, 403);
  if (role === "pos" && auth.role !== "cashier" && !isOwnerAuth(auth) && auth.barber_id !== "pos") return json({ error: "pos_required" }, 403);
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
    // revenue = work finished (used for barber pay). collected = money actually taken at the POS.
    revenue: done.reduce((sum, r) => sum + decorate(r).amount, 0),
    collected: done.filter((r) => r.payment_method).reduce((sum, r) => sum + decorate(r).amount, 0),
    cash: done.filter((r) => r.payment_method === "cash").reduce((sum, r) => sum + decorate(r).amount, 0),
    transfer: done.filter((r) => r.payment_method === "transfer").reduce((sum, r) => sum + decorate(r).amount, 0),
    uncollected: done.filter((r) => !r.payment_method).reduce((sum, r) => sum + decorate(r).amount, 0),
    uncollected_count: done.filter((r) => !r.payment_method).length,
    cash_count: done.filter((r) => r.payment_method === "cash").length,
    transfer_count: done.filter((r) => r.payment_method === "transfer").length
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
  const chairs = await listBarbers(env, false, true, true);
  return {
    day: summarize(await bookingsBetween(env, null, date, date)),
    month: { key: month.key, ...summarize(await bookingsBetween(env, null, month.from, month.to)) },
    barbers: (await Promise.all(chairs.map(async (barber) => ({
      id: barber.id, name: barber.name, username: barber.username, active: barber.active, deleted: barber.status === "deleted",
      day: summarize(await bookingsBetween(env, barber.id, date, date)),
      month: { key: month.key, ...summarize(await bookingsBetween(env, barber.id, month.from, month.to)) }
    })))).filter((b) => !b.deleted || b.month.total)
  };
}

async function handleApi(request, env, url, ctx) {
  const path = url.pathname, method = request.method;
  if (path === "/api/health" && method === "GET") return json({ ok: true });
  await loadServices(env);
  if (path === "/api/services" && method === "GET") {
    const list = Object.values(SERVICES).sort((a, b) => a.sort - b.sort).map(publicService);
    return json({ services: url.searchParams.get("all") === "1" ? list : list.filter((s) => s.active) });
  }
  await ensureSeed(env);

  if (path === "/api/shop" && method === "GET") return json(await shopState(env));
  if (path === "/api/shop/payment-qr" && method === "GET") {
    const row = await first(env, "SELECT value FROM shop_settings WHERE key='payment_qr'");
    const qr = row && row.value ? parsePaymentQr(row.value) : null;
    if (!qr || qr.error) return Response.redirect(`${url.origin}/img/qr-promptpay.png`, 302);
    return new Response(qr.bytes, { headers: { "Content-Type": qr.type, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" } });
  }
  if (path === "/api/barbers" && method === "GET") {
    const rows = await listBarbers(env, true, true);
    return json({ barbers: rows.map(({ id, name, day_off }) => ({ id, name, day_off })) });
  }
  if (path === "/api/slots" && method === "GET") {
    const service = url.searchParams.get("service") || "haircut";
    const date = url.searchParams.get("date") || bangkokNow().date;
    const barber = url.searchParams.get("barber") || "any";
    if (!isBookable(service)) return json({ error: "bad_service" }, 400);
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
    if (!isBookable(service)) return json({ error: "bad_service" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < bangkokNow().date) return json({ error: "bad_date" }, 400);
    if (!slotsFor(service).includes(time) || isPast(date, time)) return json({ error: "bad_time" }, 400);
    const future = await all(env, "SELECT phone,date,time,service FROM bookings WHERE status IN ('pending','confirmed') AND (date>? OR (date=? AND time>=?))", bangkokNow().date, bangkokNow().date, bangkokNow().time);
    const existing = future.find((r) => phoneKey(r.phone) === phoneKey(phone));
    if (existing) return json({ error: "already_booked", booking: { date: existing.date, time: existing.time, service: existing.service } }, 409);
    const picked = await pickBarber(env, String(data.barber || "any"), date, time, service);
    if (picked.error) return json({ error: picked.error }, 409);
    const createdAt = new Date().toISOString(), cancelToken = randomToken(8);
    try {
      const id = await insertIfFree(env,
        ["customer_name", "phone", "service", "barber_id", "date", "time", "note", "status", "created_at", "cancel_token", "prices"],
        [name, phone, service, picked.barber.id, date, time, String(data.note || "").trim().slice(0, 300) || null, "pending", createdAt, cancelToken, priceSnapshot(service)],
        picked.barber.id, date, time, endTime(time, slotsCount(service)));
      if (!id) return json({ error: "slot_taken" }, 409);
      const row = await first(env, "SELECT b.*,br.name AS barber_name FROM bookings b JOIN barbers br ON br.id=b.barber_id WHERE b.id=?", id);
      await notify(env, ctx, [row.barber_id], { kind: "booking", title: "คิวใหม่ " + shortDate(row.date) + " " + row.time,
        body: `${row.customer_name} · ${svcName(row.service)}`, url: "dashboard.html" });
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
    await notify(env, ctx, [row.barber_id], { kind: "cancel", title: "ลูกค้ายกเลิกคิว " + shortDate(row.date) + " " + row.time,
      body: `${row.customer_name} · ${svcName(row.service)}`, url: "dashboard.html" });
    return json({ ok: true, booking: decorate({ ...row, status: "cancelled" }) });
  }
  if (path === "/api/login" && method === "POST") {
    const data = await body(request), username = String(data.username || "").trim().toLowerCase(), password = String(data.password || "");
    const checked = await checkCredentials(env, request, username, password);
    if (checked.response) return checked.response;
    if (Number(checked.barber.must_change_password) === 1) return json({ error: "password_change_required" }, 403);
    return startSession(env, checked.barber);
  }
  if (path === "/api/password" && method === "POST") {
    const data = await body(request), username = String(data.username || "").trim().toLowerCase();
    const current = String(data.current_password || ""), next = String(data.new_password || "");
    const checked = await checkCredentials(env, request, username, current);
    if (checked.response) return checked.response;
    const problem = passwordProblem(next, username, current);
    if (problem) return json({ error: problem }, 400);
    await env.DB.batch([
      env.DB.prepare("UPDATE barbers SET password_hash=?,must_change_password=0 WHERE id=?").bind(await passwordHash(next), checked.barber.id),
      env.DB.prepare("DELETE FROM sessions WHERE barber_id=?").bind(checked.barber.id)
    ]);
    return startSession(env, checked.barber);
  }
  if (path === "/api/register" && method === "POST") {
    const ipKey = `signup:ip:${clientIp(request)}`;
    if (await overLimit(env, ipKey, SIGNUP_LIMIT_PER_IP, SIGNUP_WINDOW_MS)) return json({ error: "too_many_attempts" }, 429);
    const data = await body(request), name = String(data.name || "").trim(), password = String(data.password || "");
    const username = String(data.username || "").trim().toLowerCase();
    if (name.length < 2 || name.length > 40) return json({ error: "bad_name" }, 400);
    if (!/^[a-z0-9]{2,20}$/.test(username)) return json({ error: "bad_username" }, 400);
    const problem = passwordProblem(password, username);
    if (problem) return json({ error: problem }, 400);
    if ((await first(env, "SELECT COUNT(*) AS n FROM barbers WHERE status='pending'")).n >= MAX_PENDING_SIGNUPS) return json({ error: "too_many_pending" }, 429);
    if (await first(env, "SELECT id FROM barbers WHERE id=? OR username=?", username, username)) return json({ error: "username_taken" }, 409);
    await countAttempt(env, ipKey, SIGNUP_WINDOW_MS);
    await env.DB.prepare("INSERT INTO barbers (id,name,username,password_hash,role,active,status,must_change_password) VALUES (?,?,?,?,'barber',0,'pending',0)")
      .bind(username, name, username, await passwordHash(password)).run();
    await notify(env, ctx, await ownerIds(env), { kind: "signup", title: "ช่างใหม่สมัครเข้ามา", body: `${name} (${username}) รออนุมัติ`, url: "manage.html#team" });
    return json({ ok: true, status: "pending" }, 201);
  }

  const auth = await session(env, request);
  if (path === "/api/logout" && method === "POST") {
    const token = cookieToken(request); if (token) await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
    return json({ ok: true }, 200, { "Set-Cookie": "sm_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
  }
  if (path === "/api/me" && method === "GET") return auth ? json({ barber: meObject(auth) }) : json({ error: "login_required" }, 401);
  if (path === "/api/barber/push-key" && method === "GET") return requireRole(auth) || json({ publicKey: pushConfigured(env) ? env.VAPID_PUBLIC_KEY : "" });
  if (path === "/api/barber/push-subscribe" && method === "POST") {
    const denied = requireRole(auth); if (denied) return denied;
    const data = await body(request), sub = data.subscription || data;
    const endpoint = String(sub.endpoint || ""), p256dh = String(sub.keys?.p256dh || ""), authKey = String(sub.keys?.auth || "");
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(authKey)) return json({ error: "bad_subscription" }, 400);
    await env.DB.prepare(`INSERT INTO push_subscriptions (endpoint,barber_id,p256dh,auth,created_at) VALUES (?,?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET barber_id=excluded.barber_id,p256dh=excluded.p256dh,auth=excluded.auth`).bind(endpoint, auth.barber_id, p256dh, authKey, new Date().toISOString()).run();
    return json({ ok: true, enabled: pushConfigured(env) });
  }
  if (path === "/api/barber/push-unsubscribe" && method === "POST") {
    const denied = requireRole(auth); if (denied) return denied;
    const data = await body(request);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=? AND barber_id=?").bind(String((data.subscription || data).endpoint || ""), auth.barber_id).run();
    return json({ ok: true });
  }
  if (path === "/api/barber/push-test" && method === "POST") {
    const denied = requireRole(auth); if (denied) return denied;
    if (!pushConfigured(env)) return json({ error: "push_not_configured" }, 503);
    const count = (await first(env, "SELECT COUNT(*) AS n FROM push_subscriptions WHERE barber_id=?", auth.barber_id)).n;
    if (!count) return json({ error: "no_subscription" }, 404);
    await notify(env, null, [auth.barber_id], { kind: "test", title: "ทดสอบแจ้งเตือน StreetMan", body: "ถ้าเห็นข้อความนี้ แจ้งเตือนใช้งานได้แล้ว", url: "dashboard.html" });
    return json({ ok: true, devices: count });
  }
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
    return json({ barber: meObject(auth), date, now, stats, next: date === now.date ? active.find((r) => r.time >= now.time) || null : active[0] || null, bookings: rows, upcoming, summary: { day: mine.day, month: mine.month }, shop: isOwnerAuth(auth) ? await shopSummary(env, date) : null, shop_status: await shopState(env), hours: { date, slots: TIME_SLOTS, blocked }, day_off: parseDayOff(auth.day_off) });
  }
  if (path === "/api/barber/income" && method === "GET") {
    const denied = requireRole(auth, "chair"); if (denied) return denied;
    const date = url.searchParams.get("date") || bangkokNow().date, mine = await incomeFor(env, auth.barber_id, date);
    let shop = null;
    if (isOwnerAuth(auth)) {
      shop = await incomeFor(env, null, date);
      const chairs = await listBarbers(env, false, true, true);
      shop.barbers = (await Promise.all(chairs.map(async (b) => ({ id: b.id, name: b.name, username: b.username, active: b.active, deleted: b.status === "deleted", ...(await incomeFor(env, b.id, date)) }))))
        .filter((b) => !b.deleted || b.month.total || b.week.total);
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
      if (data.status === "done" && existing.status !== "done") {
        // A booking can't be finished before its booked date and time.
        const now = bangkokNow();
        if (existing.date > now.date || (existing.date === now.date && existing.time > now.time)) return json({ error: "too_early", date: existing.date, time: existing.time }, 403);
      }
      await env.DB.prepare("UPDATE bookings SET status=? WHERE id=?").bind(data.status, id).run(); changed = true;
      if (data.status === "done" && existing.status !== "done" && !existing.payment_method) {
        await notify(env, ctx, await cashierIds(env), { kind: "ready", title: `${existing.customer_name} ตัดเสร็จ รอคิดเงิน`,
          body: `${svcName(existing.service)} · ช่าง ${auth.name}`, url: "pos.html" });
      }
    }
    if (Array.isArray(data.extras) || data.add_extra || data.remove_extra) {
      if (Array.isArray(data.extras)) extras = parseExtras(data.extras, existing.service);
      if (data.add_extra) extras = parseExtras(extras.concat(String(data.add_extra)), existing.service);
      if (data.remove_extra) extras = extras.filter((x) => x !== String(data.remove_extra));
      const place = await placement(env, existing.barber_id, existing.date, existing.time, existing.service, extras, id);
      if (place.error) return json({ error: place.error }, 409);
      await env.DB.prepare("UPDATE bookings SET extras=?,end_time=?,prices=? WHERE id=?").bind(JSON.stringify(extras), endTime(existing.time, slotsCount(existing.service, extras)), priceSnapshot(existing.service, extras), id).run(); changed = true;
    }
    if (!changed) return json({ error: "bad_update" }, 400);
    return json({ ok: true, booking: decorate(await first(env, "SELECT * FROM bookings WHERE id=?", id)) });
  }
  if (path === "/api/barber/pos" && method === "GET") {
    const denied = requireRole(auth, "pos"); if (denied) return denied;
    // `date` picks which day's paid bills to show. The open list is always today's
    // queue plus anything finished in the last 30 days that nobody has charged yet.
    const today = bangkokNow().date;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") || "") ? url.searchParams.get("date") : today;
    const live = (await bookingsBetween(env, null, today, today)).filter((r) => ["pending", "confirmed"].includes(r.status));
    const unpaid = await all(env, `SELECT b.*,br.name AS barber_name FROM bookings b JOIN barbers br ON br.id=b.barber_id
      WHERE b.status='done' AND (b.payment_method IS NULL OR b.payment_method='') AND b.date>=? AND b.date<=? ORDER BY b.date,b.time,b.id`, addDays(today, -30), today);
    const paid = (await bookingsBetween(env, null, date, date)).filter((r) => r.status === "done" && r.payment_method).map(decorate);
    const edits = await lastEdits(env, paid.map((r) => r.id));
    paid.forEach((r) => { if (edits[r.id]) r.last_edit = edits[r.id]; });
    return json({ barber: meObject(auth), date, today, barbers: await listBarbers(env, true, true), open: unpaid.concat(live).map(decorate), paid, promptpay: await promptPayId(env) });
  }
  const billEdit = path.match(/^\/api\/barber\/bookings\/(\d+)\/edit$/);
  if (billEdit && method === "POST") {
    const denied = requireRole(auth, "pos"); if (denied) return denied;
    const limitKey = `billedit:${auth.barber_id}`;
    if (await overLimit(env, limitKey, EDIT_CODE_FAIL_LIMIT, EDIT_CODE_WINDOW_MS)) return json({ error: "too_many_attempts" }, 429);
    const id = Number(billEdit[1]), existing = await first(env, "SELECT * FROM bookings WHERE id=?", id);
    if (!existing) return json({ error: "not_found" }, 404);
    if (existing.status !== "done" || !existing.payment_method) return json({ error: "not_paid" }, 409);
    const data = await body(request);
    const service = String(data.service || existing.service), methodName = String(data.method || existing.payment_method);
    if (!isBookable(service) && service !== existing.service) return json({ error: "bad_service" }, 400);
    if (!["cash", "transfer"].includes(methodName)) return json({ error: "bad_method" }, 400);
    const extras = Array.isArray(data.extras) ? parseExtras(data.extras, service) : parseExtras(existing.extras, service);
    if (await first(env, "SELECT id FROM bill_edits WHERE booking_id=? AND status='pending'", id)) return json({ error: "edit_pending" }, 409);
    const code = String(data.code || "").replace(/\D/g, "");
    const reason = String(data.reason || "").trim().slice(0, 200);
    const now = Date.now();
    const editedAt = new Date(now).toISOString();
    const before = billSnapshot(existing);
    const apply = async (status, ref) => {
      const oldSnap = snapshotOf(existing), newSnap = JSON.parse(priceSnapshot(service, extras));
      Object.keys(newSnap).forEach((k) => { if (Object.prototype.hasOwnProperty.call(oldSnap, k)) newSnap[k] = oldSnap[k]; });
      await env.DB.prepare("UPDATE bookings SET service=?,extras=?,end_time=?,payment_method=?,prices=? WHERE id=?")
        .bind(service, JSON.stringify(extras), endTime(existing.time, slotsCount(service, extras)), methodName, JSON.stringify(newSnap), id).run();
      const updated = await first(env, "SELECT b.*,br.name AS barber_name FROM bookings b JOIN barbers br ON br.id=b.barber_id WHERE b.id=?", id);
      const result = await env.DB.prepare("INSERT INTO bill_edits (booking_id,code,edited_by,edited_at,reason,before_json,after_json,status) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, ref, auth.barber_id, editedAt, reason, JSON.stringify(before), JSON.stringify(billSnapshot(updated)), status).run();
      return json({ ok: true, booking: { ...decorate(updated), last_edit: { id: result.meta.last_row_id, code: ref, edited_at: editedAt, status } } });
    };
    if (!code) {
      // Owner unreachable: save now, owner approves or rejects later.
      if (reason.length < 3) return json({ error: "reason_required" }, 400);
      // At most a few code-less edits per Bangkok day (rejected ones count too).
      const dayStart = new Date(`${bangkokNow().date}T00:00:00+07:00`).toISOString();
      const today = await first(env, "SELECT COUNT(*) AS n FROM bill_edits WHERE code='' AND edited_at>=?", dayStart);
      if (today.n >= PENDING_EDITS_PER_DAY) return json({ error: "pending_limit" }, 429);
      const response = await apply("pending", "");
      await notify(env, ctx, await ownerIds(env), { kind: "billedit", title: "มีบิลรอตรวจ SM-" + id,
        body: `${billSnapshot(existing).amount} → ${decorate({ ...existing, service, extras: JSON.stringify(extras) }).amount} บาท · ${reason}`, url: "manage.html#money" });
      return response;
    }
    if (code.length !== 6) return json({ error: "bad_code" }, 400);
    const used = await env.DB.prepare("UPDATE approval_codes SET used_at=?,used_by=?,booking_id=? WHERE id=(SELECT id FROM approval_codes WHERE code=? AND used_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1)")
      .bind(now, auth.barber_id, id, code, now).run();
    if (!used.meta.changes) {
      await countAttempt(env, limitKey, EDIT_CODE_WINDOW_MS);
      return json({ error: "bad_code" }, 403);
    }
    return apply("approved", code);
  }
  const pay = path.match(/^\/api\/barber\/bookings\/(\d+)\/pay$/);
  if (pay && method === "POST") {
    const denied = requireRole(auth, "pos"); if (denied) return denied;
    const id = Number(pay[1]), existing = await first(env, "SELECT * FROM bookings WHERE id=?", id);
    if (!existing) return json({ error: "not_found" }, 404);
    const data = await body(request), methodName = String(data.method || "");
    if (!["cash", "transfer"].includes(methodName)) return json({ error: "bad_method" }, 400);
    if (existing.status === "cancelled") return json({ error: "already_cancelled" }, 409);
    // Another POS (or a stale screen) already took the money: never record it twice.
    if (existing.status === "done" && existing.payment_method) return json({ error: "already_paid", booking: decorate(existing) }, 409);
    const extras = Array.isArray(data.extras) ? parseExtras(data.extras, existing.service) : parseExtras(existing.extras, existing.service);
    const paidAt = new Date().toISOString();
    // Charged at today's prices.
    await env.DB.prepare("UPDATE bookings SET extras=?,end_time=?,status='done',payment_method=?,paid_at=?,prices=? WHERE id=?").bind(JSON.stringify(extras), endTime(existing.time, slotsCount(existing.service, extras)), methodName, paidAt, priceSnapshot(existing.service, extras), id).run();
    return json({ ok: true, booking: decorate(await first(env, "SELECT * FROM bookings WHERE id=?", id)) });
  }
  if (path === "/api/barber/pos/walkin" && method === "POST") {
    const denied = requireRole(auth, "pos"); if (denied) return denied;
    const data = await body(request), service = String(data.service || ""), methodName = String(data.method || "");
    if (!isBookable(service)) return json({ error: "bad_service" }, 400);
    if (!["cash", "transfer"].includes(methodName)) return json({ error: "bad_method" }, 400);
    const chairs = await listBarbers(env, true, true), barber = chairs.find((b) => b.id === data.barber_id) || chairs[0];
    if (!barber) return json({ error: "bad_barber" }, 400);
    const date = bangkokNow().date, extras = parseExtras(data.extras, service);
    let time = null;
    const current = bangkokNow().time;
    const ordered = TIME_SLOTS.filter((s) => s >= current).concat(TIME_SLOTS.filter((s) => s < current).reverse());
    for (const slot of ordered) if (!(await placement(env, barber.id, date, slot, service, extras)).error) { time = slot; break; }
    const createdAt = new Date().toISOString(), name = String(data.customer_name || data.name || "").trim().slice(0, 80) || "วอล์กอิน", phone = String(data.phone || "").replace(/\s+/g, "") || "walkin";
    const columns = ["customer_name", "phone", "service", "extras", "barber_id", "date", "time", "note", "status", "created_at", "cancel_token", "payment_method", "paid_at", "prices"];
    const valuesAt = (at) => [name, phone, service, JSON.stringify(extras), barber.id, date, at, "Walk in", "done", createdAt, randomToken(8), methodName, createdAt, priceSnapshot(service, extras)];
    let id = time ? await insertIfFree(env, columns, valuesAt(time), barber.id, date, time, endTime(time, slotsCount(service, extras))) : null;
    if (!id) {
      // The barber's day is full: still take the money. Record it at the actual time
      // (HH:MM:SS is never a booking slot, so it blocks no online bookings).
      const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
      for (let attempt = 0; attempt < 5 && !id; attempt++) {
        const at = attempt ? `${clock}.${attempt}` : clock;
        try {
          const result = await env.DB.prepare(`INSERT INTO bookings (${columns.join(",")},end_time) VALUES (${columns.map(() => "?").join(",")},?)`).bind(...valuesAt(at), at).run();
          id = result.meta.last_row_id;
        } catch (_) { /* same barber, same second: try the next suffix */ }
      }
    }
    if (!id) return json({ error: "slot_taken" }, 409);
    return json({ ok: true, booking: decorate(await first(env, "SELECT b.*,br.name AS barber_name FROM bookings b JOIN barbers br ON br.id=b.barber_id WHERE b.id=?", id)) });
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
  if (path === "/api/owner/approval-codes" && method === "POST") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const now = Date.now();
    let code = sixDigitCode();
    for (let i = 0; i < 5 && await first(env, "SELECT id FROM approval_codes WHERE code=? AND used_at IS NULL AND expires_at>?", code, now); i++) code = sixDigitCode();
    const expiresAt = now + APPROVAL_CODE_MS;
    await env.DB.prepare("INSERT INTO approval_codes (code,created_by,created_at,expires_at) VALUES (?,?,?,?)").bind(code, auth.barber_id, now, expiresAt).run();
    return json({ ok: true, code, expires_at: expiresAt }, 201);
  }
  if (path === "/api/owner/bill-edits" && method === "GET") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const rows = await all(env, `SELECT e.*,b.customer_name,b.date,b.time,br.name AS barber_name FROM bill_edits e
      JOIN bookings b ON b.id=e.booking_id LEFT JOIN barbers br ON br.id=b.barber_id ORDER BY CASE WHEN e.status='pending' THEN 0 ELSE 1 END, e.id DESC LIMIT 50`);
    return json({ edits: rows.map((r) => ({ id: r.id, booking_id: r.booking_id, code: r.code, edited_by: r.edited_by, edited_at: r.edited_at, reason: r.reason || "",
      status: r.status || "approved", reviewed_by: r.reviewed_by || "", reviewed_at: r.reviewed_at || "",
      customer_name: r.customer_name, date: r.date, time: r.time, barber_name: r.barber_name || "", before: JSON.parse(r.before_json), after: JSON.parse(r.after_json) })) });
  }
  const review = path.match(/^\/api\/owner\/bill-edits\/(\d+)\/(approve|reject)$/);
  if (review && method === "POST") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const editId = Number(review[1]), action = review[2];
    const row = await first(env, "SELECT * FROM bill_edits WHERE id=?", editId);
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status !== "pending") return json({ error: "already_reviewed" }, 409);
    const at = new Date().toISOString();
    if (action === "reject") {
      // Put the bill back the way it was before this edit.
      const before = JSON.parse(row.before_json), booking = await first(env, "SELECT time FROM bookings WHERE id=?", row.booking_id);
      const extras = parseExtras(before.extras, before.service);
      await env.DB.batch([
        env.DB.prepare("UPDATE bookings SET service=?,extras=?,end_time=?,payment_method=?,prices=COALESCE(?,prices) WHERE id=?")
          .bind(before.service, JSON.stringify(extras), endTime(booking.time, slotsCount(before.service, extras)), before.method, before.prices || null, row.booking_id),
        env.DB.prepare("UPDATE bill_edits SET status='rejected',reviewed_by=?,reviewed_at=? WHERE id=?").bind(auth.barber_id, at, editId)
      ]);
    } else {
      await env.DB.prepare("UPDATE bill_edits SET status='approved',reviewed_by=?,reviewed_at=? WHERE id=?").bind(auth.barber_id, at, editId).run();
    }
    return json({ ok: true, id: editId, status: action === "reject" ? "rejected" : "approved" });
  }
  if (path === "/api/owner/services" && method === "GET") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const used = Object.fromEntries((await all(env, "SELECT service AS id, COUNT(*) AS n FROM bookings GROUP BY service")).map((r) => [r.id, r.n]));
    return json({ services: Object.values(SERVICES).sort((a, b) => a.sort - b.sort).map((s) => ({ ...publicService(s), used: used[s.id] || 0 })) });
  }
  if (path === "/api/owner/services" && method === "POST") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const clean = cleanService(await body(request));
    if (clean.error) return json({ error: clean.error }, 400);
    const base = (clean.name_en || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "svc";
    let id = base;
    while (SERVICES[id]) id = `${base}-${randomToken(2)}`;
    const sort = Math.max(0, ...Object.values(SERVICES).map((s) => Number(s.sort) || 0)) + 1;
    await env.DB.prepare("INSERT INTO services (id,name,name_en,note,note_en,price,minutes,active,sort,created_at) VALUES (?,?,?,?,?,?,?,1,?,?)")
      .bind(id, clean.name, clean.name_en, clean.note, clean.note_en, clean.price, clean.minutes, sort, new Date().toISOString()).run();
    await loadServices(env);
    return json({ ok: true, service: publicService(SERVICES[id]) }, 201);
  }
  const svcMatch = path.match(/^\/api\/owner\/services\/([a-z0-9-]+)(\/move)?$/);
  if (svcMatch && (method === "PATCH" || method === "DELETE" || method === "POST")) {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const id = svcMatch[1], existing = SERVICES[id];
    if (!existing) return json({ error: "not_found" }, 404);
    if (svcMatch[2] && method === "POST") {
      // Move up/down: swap sort with the neighbour.
      const dir = (await body(request)).dir === "up" ? -1 : 1;
      const list = Object.values(SERVICES).sort((a, b) => a.sort - b.sort);
      const i = list.findIndex((s) => s.id === id), j = i + dir;
      if (j >= 0 && j < list.length) {
        await env.DB.batch(list.map((s, k) => env.DB.prepare("UPDATE services SET sort=? WHERE id=?")
          .bind(k === i ? j + 1 : k === j ? i + 1 : k + 1, s.id)));
      }
      await loadServices(env);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      // Services already used on a bill are hidden instead of deleted, so old bills keep their names.
      const used = await first(env, "SELECT id FROM bookings WHERE service=? OR extras LIKE ? LIMIT 1", id, `%"${id}"%`);
      if (used) await env.DB.prepare("UPDATE services SET active=0 WHERE id=?").bind(id).run();
      else await env.DB.prepare("DELETE FROM services WHERE id=?").bind(id).run();
      await loadServices(env);
      return json({ ok: true, removed: used ? "hidden" : "deleted" });
    }
    const data = await body(request);
    const clean = cleanService({ ...existing, ...data });
    if (clean.error) return json({ error: clean.error }, 400);
    const active = Object.prototype.hasOwnProperty.call(data, "active") ? (data.active ? 1 : 0) : (existing.active ? 1 : 0);
    if (!active && Object.values(SERVICES).filter((s) => s.active && s.id !== id).length === 0) return json({ error: "last_service" }, 400);
    await env.DB.prepare("UPDATE services SET name=?,name_en=?,note=?,note_en=?,price=?,minutes=?,active=? WHERE id=?")
      .bind(clean.name, clean.name_en, clean.note, clean.note_en, clean.price, clean.minutes, active, id).run();
    await loadServices(env);
    return json({ ok: true, service: publicService(SERVICES[id]) });
  }
  if (path === "/api/owner/promptpay" && method === "GET") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    return json({ promptpay: await promptPayId(env) });
  }
  if (path === "/api/owner/promptpay" && (method === "PUT" || method === "POST")) {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const raw = String((await body(request)).promptpay || "").trim();
    if (!raw) {
      await env.DB.prepare("DELETE FROM shop_settings WHERE key='promptpay_id'").run();
      return json({ ok: true, promptpay: "" });
    }
    const id = normalizePromptPay(raw);
    if (!id) return json({ error: "bad_promptpay" }, 400);
    await env.DB.prepare("INSERT INTO shop_settings (key,value) VALUES ('promptpay_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(id).run();
    return json({ ok: true, promptpay: id });
  }
  if (path === "/api/owner/payment-qr" && (method === "PUT" || method === "POST")) {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const qr = parsePaymentQr((await body(request)).image);
    if (qr.error) return json({ error: qr.error }, qr.error === "image_too_large" ? 413 : 400);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO shop_settings (key,value) VALUES ('payment_qr',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(qr.dataUrl),
      env.DB.prepare("INSERT INTO shop_settings (key,value) VALUES ('payment_qr_updated',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(Date.now()))
    ]);
    return json({ ok: true, shop: await shopState(env) });
  }
  if (path === "/api/owner/payment-qr" && method === "DELETE") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    await env.DB.prepare("DELETE FROM shop_settings WHERE key IN ('payment_qr','payment_qr_updated')").run();
    return json({ ok: true, shop: await shopState(env) });
  }
  if (path === "/api/owner/payroll.xlsx" && method === "GET") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const date = url.searchParams.get("date") || bangkokNow().date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "bad_date" }, 400);
    const range = url.searchParams.get("period") === "week" ? weekRange(date) : monthRange(date);
    const bytes = await payrollWorkbook(env, range.from, range.to);
    return new Response(bytes, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="StreetMan-payroll-${range.from}-${range.to}.xlsx"`,
      "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"
    } });
  }
  if (path === "/api/owner/barbers" && method === "GET") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    return json({ barbers: await listBarbers(env, false, false) });
  }
  if (path === "/api/owner/barbers" && method === "POST") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    // Barbers sign up themselves and wait for approval; Rim only creates POS (cashier) accounts here.
    const data = await body(request);
    if (data.role !== "cashier") return json({ error: "use_signup" }, 400);
    const id = String(data.username || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""), name = String(data.name || "").trim(), password = String(data.password || "");
    if (name.length < 2 || !/^[a-z0-9]{2,20}$/.test(id)) return json({ error: "bad_input" }, 400);
    if (passwordProblem(password, id)) return json({ error: "weak_password" }, 400);
    if (await first(env, "SELECT id FROM barbers WHERE id=? OR username=?", id, id)) return json({ error: "username_taken" }, 409);
    await env.DB.prepare("INSERT INTO barbers (id,name,username,password_hash,role,active) VALUES (?,?,?,?,'cashier',1)").bind(id, name.slice(0, 40), id, await passwordHash(password)).run();
    return json({ ok: true, barber: publicBarber(await first(env, "SELECT * FROM barbers WHERE id=?", id)) }, 201);
  }
  const staffAction = path.match(/^\/api\/owner\/barbers\/([a-z0-9]+)\/(approve|reject)$/);
  if (staffAction && method === "POST") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const [, id, action] = staffAction;
    const result = action === "approve"
      ? await env.DB.prepare("UPDATE barbers SET status='approved',active=1 WHERE id=? AND status='pending'").bind(id).run()
      : await env.DB.prepare("DELETE FROM barbers WHERE id=? AND status='pending'").bind(id).run();
    if (!result.meta.changes) return json({ error: "not_found" }, 404);
    return json({ ok: true, id, action });
  }
  const staffPatch = path.match(/^\/api\/owner\/barbers\/([a-z0-9]+)$/);
  if (staffPatch && method === "DELETE") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const id = staffPatch[1], existing = await first(env, "SELECT * FROM barbers WHERE id=? AND status!='deleted'", id);
    if (!existing) return json({ error: "not_found" }, 404);
    if (id === auth.barber_id || existing.role === "owner") return json({ error: "cannot_delete_owner" }, 400);
    // Customers still booked with this barber would turn up to nobody.
    const upcoming = await first(env, "SELECT COUNT(*) AS n FROM bookings WHERE barber_id=? AND status IN ('pending','confirmed') AND date>=?", id, bangkokNow().date);
    if (upcoming.n) return json({ error: "has_upcoming", count: upcoming.n }, 409);
    const used = await first(env, "SELECT id FROM bookings WHERE barber_id=? LIMIT 1", id);
    const cleanup = [
      env.DB.prepare("DELETE FROM sessions WHERE barber_id=?").bind(id),
      env.DB.prepare("DELETE FROM barber_blocks WHERE barber_id=?").bind(id)
    ];
    try { await env.DB.prepare("DELETE FROM push_subscriptions WHERE barber_id=?").bind(id).run(); } catch (_) { /* table not migrated yet */ }
    if (used) {
      // Has history: keep the row so past bills and income still show the name, but it can't log in or be booked.
      cleanup.push(env.DB.prepare("UPDATE barbers SET active=0,status='deleted' WHERE id=?").bind(id));
    } else {
      cleanup.push(env.DB.prepare("DELETE FROM barbers WHERE id=?").bind(id));
    }
    await env.DB.batch(cleanup);
    return json({ ok: true, removed: used ? "archived" : "deleted" });
  }
  if (staffPatch && method === "PATCH") {
    const denied = requireRole(auth, "owner"); if (denied) return denied;
    const id = staffPatch[1], existing = await first(env, "SELECT * FROM barbers WHERE id=?", id); if (!existing) return json({ error: "not_found" }, 404);
    if (existing.status === "pending") return json({ error: "pending_approval" }, 409);
    const data = await body(request), name = data.name != null ? String(data.name).trim().slice(0, 40) : existing.name;
    let active = data.active == null ? Number(existing.active) : (data.active === true || data.active === 1 || data.active === "1" ? 1 : 0);
    if (["owner", "admin", "cashier"].includes(existing.role)) active = 1;
    let dayOff = parseDayOff(existing.day_off);
    if (Object.prototype.hasOwnProperty.call(data, "day_off")) { dayOff = ["cashier", "admin"].includes(existing.role) ? null : parseDayOff(data.day_off); if (dayOff === undefined) return json({ error: "bad_day_off" }, 400); }
    const password = data.password ? String(data.password) : "";
    if (password && passwordProblem(password, existing.username)) return json({ error: "weak_password" }, 400);
    const hash = password ? await passwordHash(password) : existing.password_hash;
    // A password Rim sets for someone else is temporary: they must replace it at their next login.
    const mustChange = password ? (id === auth.barber_id ? 0 : 1) : Number(existing.must_change_password) || 0;
    await env.DB.prepare("UPDATE barbers SET name=?,active=?,day_off=?,password_hash=?,must_change_password=? WHERE id=?").bind(name, active, dayOff, hash, mustChange, id).run();
    if (password || active === 0) await env.DB.prepare("DELETE FROM sessions WHERE barber_id=?").bind(id).run();
    return json({ ok: true, barber: publicBarber(await first(env, "SELECT * FROM barbers WHERE id=?", id)) });
  }
  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
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
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url, ctx);
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
      return url.pathname.startsWith("/api/") ? json({ error: "server_error" }, 500) : new Response("Server error", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }
};
