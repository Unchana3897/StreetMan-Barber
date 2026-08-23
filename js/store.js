(function (window) {
    "use strict";

    var SESSION_KEY = "sm_barber_session";
    var QUEUE_KEY = "sm_barber_queue";
    var STAFF_KEY = "sm_staff";
    var SHOP_KEY = "sm_shop";
    var PEER_PREFIX = "streetman-phuket-";
    var DEFAULT_PASSWORD = "StreetMan2026";
    var BARBERS = [
        { id: "rim", name: "Rim", username: "rim" },
        { id: "bank", name: "Bank", username: "bank" },
        { id: "rick", name: "Rick", username: "rick" },
        { id: "dee", name: "Dee", username: "dee" }
    ];
    var LAST_SLOT = {
        haircut: "19:00",
        beard: "19:30",
        shave: "19:30",
        dye: "19:30",
        mustache: "19:30",
        stacking: "18:30"
    };
    var SLOT_COUNT = {
        haircut: 2,
        beard: 1,
        shave: 1,
        dye: 1,
        mustache: 1,
        stacking: 3
    };
    var SLOT_MINUTES = 30;
    var PRICES = {
        haircut: 300,
        beard: 200,
        shave: 200,
        dye: 150,
        mustache: 500,
        stacking: 1000
    };
    var TIME_SLOTS = [
        "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
        "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
        "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
    ];

    var nodeMode = null;
    var livePeer = null;

    function onGitHubPages() {
        return /\.github\.io$/i.test(window.location.hostname);
    }

    function bangkokNow() {
        var parts = {};
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Bangkok",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).formatToParts(new Date()).forEach(function (part) {
            parts[part.type] = part.value;
        });
        return {
            date: parts.year + "-" + parts.month + "-" + parts.day,
            time: parts.hour + ":" + parts.minute
        };
    }

    function phoneKey(phone) {
        var digits = String(phone || "").replace(/\D/g, "");
        if (digits.indexOf("66") === 0 && digits.length >= 11) {
            digits = "0" + digits.slice(2);
        }
        return digits;
    }

    function findOpenBooking(phone) {
        var key = phoneKey(phone);
        if (!key) {
            return null;
        }
        var now = bangkokNow();
        return readQueue().filter(function (row) {
            if (row.status === "cancelled" || row.status === "done") {
                return false;
            }
            if (phoneKey(row.phone) !== key) {
                return false;
            }
            return row.date > now.date || (row.date === now.date && row.time >= now.time);
        })[0] || null;
    }

    function addDays(iso, n) {
        var bits = iso.split("-").map(Number);
        var next = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2] + n));
        return next.toISOString().slice(0, 10);
    }

    function readStaff() {
        var extra = [];
        try {
            extra = JSON.parse(window.localStorage.getItem(STAFF_KEY) || "[]");
            extra = Array.isArray(extra) ? extra : [];
        } catch (err) {
            extra = [];
        }
        var byId = {};
        BARBERS.forEach(function (row) {
            byId[row.id] = {
                id: row.id,
                name: row.name,
                username: row.username,
                role: row.id === "rim" ? "owner" : "barber",
                active: true,
                password: DEFAULT_PASSWORD
            };
        });
        extra.forEach(function (row) {
            if (!row || !row.id) {
                return;
            }
            byId[row.id] = {
                id: row.id,
                name: row.name || row.id,
                username: row.username || row.id,
                role: row.id === "rim" ? "owner" : (row.role || "barber"),
                active: row.active !== false,
                password: row.password || DEFAULT_PASSWORD
            };
        });
        return Object.keys(byId).map(function (id) {
            return byId[id];
        });
    }

    function writeStaff(rows) {
        window.localStorage.setItem(STAFF_KEY, JSON.stringify(rows));
    }

    function readShop() {
        try {
            var data = JSON.parse(window.localStorage.getItem(SHOP_KEY) || "{}");
            return {
                closed: Boolean(data && data.closed),
                note: (data && data.note) || ""
            };
        } catch (err) {
            return { closed: false, note: "" };
        }
    }

    function writeShop(state) {
        window.localStorage.setItem(SHOP_KEY, JSON.stringify({
            closed: Boolean(state && state.closed),
            note: (state && state.note) || ""
        }));
        return readShop();
    }

    function activeStaff() {
        return readStaff().filter(function (row) {
            return row.active !== false;
        });
    }

    function extrasList(row) {
        var list = Array.isArray(row && row.extras) ? row.extras : [];
        var seen = {};
        return list.filter(function (item) {
            if (!PRICES[item] || item === row.service || seen[item]) {
                return false;
            }
            seen[item] = true;
            return true;
        });
    }

    function serviceSlots(service) {
        return SLOT_COUNT[service] || 1;
    }

    function extrasSlotCount(extras) {
        return (extras || []).reduce(function (sum, item) {
            return sum + serviceSlots(item);
        }, 0);
    }

    function occupyRange(start, count, clamp) {
        var index = TIME_SLOTS.indexOf(start);
        if (index < 0 || count < 1) {
            return null;
        }
        if (index + count > TIME_SLOTS.length) {
            return clamp ? TIME_SLOTS.slice(index) : null;
        }
        return TIME_SLOTS.slice(index, index + count);
    }

    function slotEnd(start, count) {
        var bits = String(start || "00:00").split(":").map(Number);
        var total = bits[0] * 60 + bits[1] + count * SLOT_MINUTES;
        return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    }

    function dayRows(barberId, date) {
        return readQueue().filter(function (row) {
            return row.barber_id === barberId && row.date === date && row.status !== "cancelled";
        });
    }

    function occupiedSet(barberId, date, exceptId) {
        var taken = {};
        dayRows(barberId, date).forEach(function (row) {
            if (exceptId && row.id === exceptId) {
                return;
            }
            var extras = extrasList(row);
            var range = occupyRange(row.time, serviceSlots(row.service) + extrasSlotCount(extras), true);
            (range || [row.time]).forEach(function (slot) {
                taken[slot] = true;
            });
        });
        return taken;
    }

    function canPlace(barberId, date, time, service, extras, exceptId) {
        var count = serviceSlots(service) + extrasSlotCount(extras);
        var range = occupyRange(time, count, Boolean(exceptId));
        if (!range) {
            return { error: "bad_time" };
        }
        var occupied = occupiedSet(barberId, date, exceptId);
        if (range.some(function (slot) { return occupied[slot]; })) {
            return { error: exceptId ? "extra_overlap" : "slot_taken" };
        }
        return { ok: true, range: range, count: count };
    }

    function bookingAmount(row) {
        var total = PRICES[row.service] || 0;
        extrasList(row).forEach(function (item) {
            total += PRICES[item] || 0;
        });
        return total;
    }

    function decorateBooking(row) {
        var extras = extrasList(row);
        var extraTotal = 0;
        extras.forEach(function (item) {
            extraTotal += PRICES[item] || 0;
        });
        var slots = serviceSlots(row.service) + extrasSlotCount(extras);
        return Object.assign({}, row, {
            extras: extras,
            extra_total: extraTotal,
            amount: (PRICES[row.service] || 0) + extraTotal,
            slots: slots,
            end_time: slotEnd(row.time, slots)
        });
    }

    function summarize(rows) {
        var booked = rows.filter(function (row) { return row.status !== "cancelled"; });
        var done = rows.filter(function (row) { return row.status === "done"; });
        var remaining = rows.filter(function (row) {
            return row.status === "pending" || row.status === "confirmed";
        });
        var revenue = 0;
        done.forEach(function (row) {
            revenue += bookingAmount(row);
        });
        return {
            booked: booked.length,
            done: done.length,
            remaining: remaining.length,
            cancelled: rows.filter(function (row) { return row.status === "cancelled"; }).length,
            revenue: revenue
        };
    }

    function monthKey(iso) {
        return String(iso || "").slice(0, 7);
    }

    function inMonth(iso, key) {
        return String(iso || "").slice(0, 7) === key;
    }

    function periodSummary(barberId, date) {
        var key = monthKey(date);
        var rows = readQueue();
        var dayRows = rows.filter(function (row) {
            return (!barberId || row.barber_id === barberId) && row.date === date;
        });
        var monthRows = rows.filter(function (row) {
            return (!barberId || row.barber_id === barberId) && inMonth(row.date, key);
        });
        return {
            day: summarize(dayRows),
            month: Object.assign({ key: key }, summarize(monthRows))
        };
    }

    function shopSummary(date) {
        var key = monthKey(date);
        return {
            day: summarize(readQueue().filter(function (row) { return row.date === date; })),
            month: Object.assign({ key: key }, summarize(readQueue().filter(function (row) {
                return inMonth(row.date, key);
            }))),
            barbers: readStaff().map(function (barber) {
                return {
                    id: barber.id,
                    name: barber.name,
                    username: barber.username,
                    active: barber.active !== false,
                    day: summarize(readQueue().filter(function (row) {
                        return row.barber_id === barber.id && row.date === date;
                    })),
                    month: Object.assign({ key: key }, summarize(readQueue().filter(function (row) {
                        return row.barber_id === barber.id && inMonth(row.date, key);
                    })))
                };
            })
        };
    }

    function readQueue() {
        try {
            var data = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]");
            return Array.isArray(data) ? data : [];
        } catch (err) {
            return [];
        }
    }

    function writeQueue(rows) {
        window.localStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
    }

    function getSession() {
        try {
            var raw = window.localStorage.getItem(SESSION_KEY) || window.sessionStorage.getItem(SESSION_KEY);
            if (raw && !window.localStorage.getItem(SESSION_KEY)) {
                window.localStorage.setItem(SESSION_KEY, raw);
            }
            return JSON.parse(raw || "null");
        } catch (err) {
            return null;
        }
    }

    function setSession(barber) {
        var text = JSON.stringify(barber);
        window.localStorage.setItem(SESSION_KEY, text);
        window.sessionStorage.removeItem(SESSION_KEY);
    }

    function clearSession() {
        window.localStorage.removeItem(SESSION_KEY);
        window.sessionStorage.removeItem(SESSION_KEY);
    }

    function authHeaders(extra) {
        var headers = Object.assign({}, extra || {});
        var session = getSession();
        if (session && session.token) {
            headers["X-Session-Token"] = session.token;
        }
        return headers;
    }

    async function usingNode() {
        if (onGitHubPages()) {
            nodeMode = false;
            return false;
        }
        if (nodeMode === true) {
            return true;
        }
        try {
            var res = await fetch("/api/slots?service=haircut&date=" + encodeURIComponent(bangkokNow().date));
            if (res.ok) {
                nodeMode = true;
                return true;
            }
        } catch (err) {}
        return true;
    }

    async function nodeFetch(url, options) {
        options = options || {};
        var next = Object.assign({ credentials: "same-origin" }, options);
        next.headers = authHeaders(options.headers);
        var res = await fetch(url, next);
        var data = {};
        try {
            data = await res.json();
        } catch (err) {}
        if (res.status === 401) {
            var error = new Error("login");
            error.status = 401;
            throw error;
        }
        if (!res.ok) {
            var fail = new Error((data && data.error) || "fail");
            fail.status = res.status;
            fail.body = data;
            throw fail;
        }
        return data;
    }

    function slotsFor(service) {
        var last = LAST_SLOT[service] || "19:00";
        var count = serviceSlots(service);
        return TIME_SLOTS.filter(function (slot) {
            return slot <= last && occupyRange(slot, count, false);
        });
    }

    function pickBarber(barberId, date, time, service) {
        var ids = activeStaff().map(function (barber) {
            return barber.id;
        });
        if (barberId && barberId !== "any") {
            if (ids.indexOf(barberId) === -1) {
                return { error: "slot_taken" };
            }
            var chosen = canPlace(barberId, date, time, service, []);
            if (chosen.error) {
                return { error: chosen.error };
            }
            return { barberId: barberId };
        }
        for (var i = 0; i < ids.length; i += 1) {
            if (!canPlace(ids[i], date, time, service, []).error) {
                return { barberId: ids[i] };
            }
        }
        return { error: "slot_taken" };
    }

    function buildDashboard(barber, date) {
        var now = bangkokNow();
        var bookings = readQueue().filter(function (row) {
            return row.barber_id === barber.id && row.date === date;
        }).sort(function (a, b) {
            return a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id;
        }).map(decorateBooking);
        var stats = {
            total: bookings.length,
            pending: bookings.filter(function (row) { return row.status === "pending"; }).length,
            confirmed: bookings.filter(function (row) { return row.status === "confirmed"; }).length,
            done: bookings.filter(function (row) { return row.status === "done"; }).length,
            cancelled: bookings.filter(function (row) { return row.status === "cancelled"; }).length
        };
        stats.remaining = stats.pending + stats.confirmed;
        stats.heads = bookings.filter(function (row) { return row.status !== "cancelled"; }).length;
        var active = bookings.filter(function (row) {
            return row.status === "pending" || row.status === "confirmed";
        });
        var next = null;
        if (date === now.date) {
            next = active.filter(function (row) { return row.time >= now.time; })[0] || null;
        } else if (date > now.date) {
            next = active[0] || null;
        }
        var from = now.date;
        var upcoming = [];
        for (var i = 0; i < 14; i += 1) {
            var day = addDays(from, i);
            upcoming.push({
                date: day,
                count: readQueue().filter(function (row) {
                    return row.barber_id === barber.id && row.date === day && row.status !== "cancelled";
                }).length
            });
        }
        return {
            barber: {
                id: barber.id,
                name: barber.name,
                username: barber.username,
                role: barber.role || (barber.id === "rim" ? "owner" : "barber")
            },
            date: date,
            now: now,
            stats: stats,
            next: next,
            bookings: bookings,
            upcoming: upcoming,
            summary: periodSummary(barber.id, date),
            shop: (barber.role === "owner" || barber.id === "rim") ? shopSummary(date) : null,
            shop_status: readShop()
        };
    }

    function saveBooking(row) {
        var rows = readQueue();
        if (rows.some(function (item) { return item.id === row.id; })) {
            return row;
        }
        rows.push(row);
        writeQueue(rows);
        return row;
    }

    function sendPeer(barberId, booking) {
        return new Promise(function (resolve, reject) {
            if (!window.Peer) {
                reject(new Error("no_peer"));
                return;
            }
            var peer = new window.Peer();
            var timer = window.setTimeout(function () {
                try { peer.destroy(); } catch (err) {}
                reject(new Error("timeout"));
            }, 4000);
            peer.on("open", function () {
                var conn = peer.connect(PEER_PREFIX + barberId, { reliable: true });
                conn.on("open", function () {
                    conn.send({ type: "new_booking", booking: booking });
                    window.clearTimeout(timer);
                    window.setTimeout(function () {
                        try { peer.destroy(); } catch (err) {}
                        resolve(true);
                    }, 250);
                });
                conn.on("error", function () {
                    window.clearTimeout(timer);
                    try { peer.destroy(); } catch (err) {}
                    reject(new Error("conn"));
                });
            });
            peer.on("error", function () {
                window.clearTimeout(timer);
                try { peer.destroy(); } catch (err) {}
                reject(new Error("peer"));
            });
        });
    }

    var Store = {
        BARBERS: BARBERS,
        onGitHubPages: onGitHubPages,
        usingNode: usingNode,
        getSession: getSession,
        slots: function (service, date) {
            var now = bangkokNow();
            return slotsFor(service).filter(function (slot) {
                return date > now.date || (date === now.date && slot > now.time);
            });
        },
        login: async function (username, password) {
            username = String(username || "").trim().toLowerCase();
            password = String(password || "").trim();
            if (await usingNode()) {
                var data = await nodeFetch("/api/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: username, password: password })
                });
                setSession(data.barber);
                return data.barber;
            }
            var barber = readStaff().filter(function (row) {
                return row.username === username && row.active !== false;
            })[0];
            if (!barber || password !== (barber.password || DEFAULT_PASSWORD)) {
                var error = new Error("bad_login");
                error.status = 401;
                throw error;
            }
            setSession({ id: barber.id, name: barber.name, username: barber.username, role: barber.role || "barber" });
            return getSession();
        },
        logout: async function () {
            var session = getSession();
            var token = session && session.token;
            clearSession();
            if (livePeer) {
                try { livePeer.destroy(); } catch (err) {}
                livePeer = null;
            }
            if (await usingNode()) {
                try {
                    var headers = {};
                    if (token) {
                        headers["X-Session-Token"] = token;
                    }
                    await fetch("/api/logout", { method: "POST", credentials: "same-origin", headers: headers });
                } catch (err) {}
            }
        },
        me: async function () {
            if (await usingNode()) {
                var data = await nodeFetch("/api/me");
                setSession(data.barber);
                return data.barber;
            }
            var session = getSession();
            if (!session) {
                var error = new Error("login");
                error.status = 401;
                throw error;
            }
            return session;
        },
        dashboard: async function (date) {
            date = date || bangkokNow().date;
            if (await usingNode()) {
                return nodeFetch("/api/barber/dashboard?date=" + encodeURIComponent(date));
            }
            var barber = await Store.me();
            return buildDashboard(barber, date);
        },
        updateStatus: async function (id, status) {
            if (await usingNode()) {
                return nodeFetch("/api/barber/bookings/" + id, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: status })
                });
            }
            var barber = await Store.me();
            var rows = readQueue().map(function (row) {
                if (row.id === id && row.barber_id === barber.id) {
                    row.status = status;
                }
                return row;
            });
            writeQueue(rows);
            return { ok: true };
        },
        updateExtras: async function (id, payload) {
            if (await usingNode()) {
                return nodeFetch("/api/barber/bookings/" + id, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }
            var barber = await Store.me();
            var updated = null;
            var rows = readQueue().map(function (row) {
                if (row.id !== id || row.barber_id !== barber.id) {
                    return row;
                }
                var extras = extrasList(row);
                if (Array.isArray(payload.extras)) {
                    extras = payload.extras;
                }
                if (payload.add_extra) {
                    extras = extras.concat(String(payload.add_extra));
                }
                if (payload.remove_extra) {
                    extras = extras.filter(function (item) {
                        return item !== String(payload.remove_extra);
                    });
                }
                var place = canPlace(row.barber_id, row.date, row.time, row.service, extras, row.id);
                if (place.error) {
                    var overlap = new Error(place.error);
                    overlap.status = 409;
                    overlap.body = { error: place.error };
                    throw overlap;
                }
                row.extras = extras;
                updated = decorateBooking(row);
                return updated;
            });
            writeQueue(rows);
            return { ok: true, booking: updated };
        },
        getShop: async function () {
            if (await usingNode()) {
                return nodeFetch("/api/shop");
            }
            return readShop();
        },
        setShop: async function (payload) {
            if (await usingNode()) {
                try {
                    var data = await nodeFetch("/api/owner/shop", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });
                    return data.shop || data;
                } catch (err) {
                    if (err && err.status === 404) {
                        var dataPost = await nodeFetch("/api/owner/shop", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload)
                        });
                        return dataPost.shop || dataPost;
                    }
                    throw err;
                }
            }
            var me = await Store.me();
            if (me.role !== "owner" && me.id !== "rim") {
                var denied = new Error("owner_required");
                denied.status = 403;
                throw denied;
            }
            return writeShop({
                closed: payload.closed,
                note: payload.note
            });
        },
        availableSlots: async function (service, date, barber) {
            if (await usingNode()) {
                var data = await nodeFetch("/api/slots?service=" + encodeURIComponent(service) + "&date=" + encodeURIComponent(date) + "&barber=" + encodeURIComponent(barber || "any"));
                return {
                    slots: data.slots || [],
                    closed: Boolean(data.closed),
                    note: data.note || ""
                };
            }
            if (readShop().closed) {
                return { slots: [], closed: true, note: readShop().note };
            }
            var possible = Store.slots(service, date);
            var slots;
            if (barber && barber !== "any") {
                slots = possible.filter(function (slot) {
                    return !canPlace(barber, date, slot, service, []).error;
                });
            } else {
                var ids = activeStaff().map(function (row) {
                    return row.id;
                });
                slots = possible.filter(function (slot) {
                    return ids.some(function (id) {
                        return !canPlace(id, date, slot, service, []).error;
                    });
                });
            }
            return { slots: slots, closed: false, note: "" };
        },
        createBooking: async function (payload) {
            if (await usingNode()) {
                return nodeFetch("/api/bookings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }
            if (readShop().closed) {
                var closed = new Error("shop_closed");
                closed.status = 403;
                closed.body = { error: "shop_closed" };
                throw closed;
            }
            var existing = findOpenBooking(payload.phone);
            if (existing) {
                var again = new Error("already_booked");
                again.status = 409;
                again.body = {
                    error: "already_booked",
                    booking: { date: existing.date, time: existing.time, service: existing.service }
                };
                throw again;
            }
            var chosen = pickBarber(payload.barber, payload.date, payload.time, payload.service);
            if (chosen.error) {
                var taken = new Error(chosen.error);
                taken.status = 409;
                throw taken;
            }
            var barber = BARBERS.filter(function (row) { return row.id === chosen.barberId; })[0]
                || activeStaff().filter(function (row) { return row.id === chosen.barberId; })[0];
            var booking = decorateBooking({
                id: Date.now(),
                customer_name: payload.customer_name,
                phone: payload.phone,
                service: payload.service,
                barber_id: chosen.barberId,
                barber_name: barber ? barber.name : chosen.barberId,
                date: payload.date,
                time: payload.time,
                note: payload.note || null,
                cancel_token: Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2),
                extras: [],
                extra_total: 0,
                amount: PRICES[payload.service] || 0,
                status: "pending",
                created_at: new Date().toISOString()
            });
            var delivered = false;
            try {
                delivered = await sendPeer(chosen.barberId, booking);
            } catch (err) {
                delivered = false;
            }
            return { ok: true, booking: booking, delivered: delivered };
        },
        listBarbers: async function () {
            if (await usingNode()) {
                var data = await nodeFetch("/api/barbers");
                return data.barbers || [];
            }
            return activeStaff().map(function (row) {
                return { id: row.id, name: row.name };
            });
        },
        listStaff: async function () {
            if (await usingNode()) {
                var data = await nodeFetch("/api/owner/barbers");
                return data.barbers || [];
            }
            var me = await Store.me();
            if (me.role !== "owner" && me.id !== "rim") {
                var denied = new Error("owner_required");
                denied.status = 403;
                throw denied;
            }
            return readStaff().map(function (row) {
                return {
                    id: row.id,
                    name: row.name,
                    username: row.username,
                    role: row.role,
                    active: row.active !== false
                };
            });
        },
        createStaff: async function (payload) {
            if (await usingNode()) {
                return nodeFetch("/api/owner/barbers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }
            await Store.me();
            var username = String(payload.username || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
            var name = String(payload.name || "").trim();
            var password = String(payload.password || "");
            if (name.length < 2 || !/^[a-z0-9]{2,20}$/.test(username) || password.length < 6) {
                var bad = new Error("bad_input");
                bad.status = 400;
                throw bad;
            }
            var rows = readStaff();
            if (rows.some(function (row) { return row.id === username || row.username === username; })) {
                var taken = new Error("username_taken");
                taken.status = 409;
                throw taken;
            }
            rows.push({
                id: username,
                name: name,
                username: username,
                role: "barber",
                active: true,
                password: password
            });
            writeStaff(rows);
            return { ok: true, barber: { id: username, name: name, username: username, role: "barber", active: true } };
        },
        updateStaff: async function (id, payload) {
            if (await usingNode()) {
                return nodeFetch("/api/owner/barbers/" + encodeURIComponent(id), {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }
            await Store.me();
            var rows = readStaff();
            var found = null;
            rows = rows.map(function (row) {
                if (row.id !== id) {
                    return row;
                }
                found = row;
                row.name = payload.name != null ? String(payload.name).trim() : row.name;
                if (payload.active != null && row.role !== "owner") {
                    row.active = payload.active !== false && payload.active !== 0 && payload.active !== "0";
                }
                if (payload.password) {
                    row.password = String(payload.password);
                }
                return row;
            });
            if (!found) {
                var missing = new Error("not_found");
                missing.status = 404;
                throw missing;
            }
            writeStaff(rows);
            return { ok: true, barber: found };
        },
        lookupBooking: async function (token) {
            token = String(token || "").trim().toLowerCase().replace(/[^a-f0-9]/g, "");
            if (await usingNode()) {
                return nodeFetch("/api/bookings/lookup?token=" + encodeURIComponent(token));
            }
            var row = readQueue().filter(function (item) {
                return String(item.cancel_token || "").toLowerCase() === token;
            })[0];
            if (!row) {
                var missing = new Error("not_found");
                missing.status = 404;
                missing.body = { error: "not_found" };
                throw missing;
            }
            return { ok: true, booking: decorateBooking(row) };
        },
        cancelBooking: async function (token) {
            token = String(token || "").trim().toLowerCase().replace(/[^a-f0-9]/g, "");
            if (await usingNode()) {
                return nodeFetch("/api/bookings/cancel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: token })
                });
            }
            var updated = null;
            var rows = readQueue().map(function (row) {
                if (String(row.cancel_token || "").toLowerCase() !== token) {
                    return row;
                }
                if (row.status === "cancelled" || row.status === "done") {
                    var late = new Error(row.status === "done" ? "already_done" : "already_cancelled");
                    late.status = 409;
                    late.body = { error: late.message };
                    throw late;
                }
                var now = bangkokNow();
                var slot = new Date(row.date + "T" + row.time + ":00+07:00").getTime();
                var current = new Date(now.date + "T" + now.time + ":00+07:00").getTime();
                if ((slot - current) / 3600000 < 2) {
                    var tooLate = new Error("too_late");
                    tooLate.status = 403;
                    tooLate.body = { error: "too_late" };
                    throw tooLate;
                }
                row.status = "cancelled";
                updated = decorateBooking(row);
                return updated;
            });
            if (!updated) {
                var missing = new Error("not_found");
                missing.status = 404;
                missing.body = { error: "not_found" };
                throw missing;
            }
            writeQueue(rows);
            return { ok: true, booking: updated };
        },
        listen: function (onBooking, onReminder) {
            usingNode().then(function (ok) {
                if (ok) {
                    if (!window.EventSource) {
                        return;
                    }
                    var liveSession = getSession();
                    var eventsUrl = "/api/barber/events";
                    if (liveSession && liveSession.token) {
                        eventsUrl += "?token=" + encodeURIComponent(liveSession.token);
                    }
                    var source = new EventSource(eventsUrl);
                    source.onmessage = function (event) {
                        try {
                            var payload = JSON.parse(event.data);
                            if (payload.type === "new_booking") {
                                onBooking(payload.booking);
                            }
                            if (payload.type === "booking_cancelled" && onReminder) {
                                onReminder({
                                    type: "booking_cancelled",
                                    title: "ลูกค้ายกเลิกคิว",
                                    message: payload.booking
                                        ? payload.booking.customer_name + " · " + payload.booking.time
                                        : "มีลูกค้ายกเลิกคิว"
                                });
                            }
                            if (payload.type === "day_reminder" && onReminder) {
                                onReminder(payload);
                            }
                        } catch (err) {}
                    };
                    return;
                }
                var session = getSession();
                if (!session || !window.Peer) {
                    return;
                }
                try {
                    livePeer = new window.Peer(PEER_PREFIX + session.id);
                    livePeer.on("connection", function (conn) {
                        conn.on("data", function (payload) {
                            if (payload && payload.type === "new_booking" && payload.booking) {
                                saveBooking(payload.booking);
                                onBooking(payload.booking);
                            }
                        });
                    });
                } catch (err) {}
            });
        }
    };

    window.StreetManStore = Store;
})(window);
