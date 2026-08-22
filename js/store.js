(function (window) {
    "use strict";

    var SESSION_KEY = "sm_barber_session";
    var QUEUE_KEY = "sm_barber_queue";
    var STAFF_KEY = "sm_staff";
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
        return Object.assign({}, row, {
            extras: extras,
            extra_total: extraTotal,
            amount: (PRICES[row.service] || 0) + extraTotal
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
        var res = await fetch(url, Object.assign({ credentials: "same-origin" }, options || {}));
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
        return TIME_SLOTS.filter(function (slot) {
            return slot <= last;
        });
    }

    function takenSlots(barberId, date) {
        return readQueue().filter(function (row) {
            return row.barber_id === barberId && row.date === date && row.status !== "cancelled";
        }).map(function (row) {
            return row.time;
        });
    }

    function pickBarber(barberId, date, time) {
        var ids = activeStaff().map(function (barber) {
            return barber.id;
        });
        if (barberId && barberId !== "any") {
            if (ids.indexOf(barberId) === -1) {
                return { error: "slot_taken" };
            }
            if (takenSlots(barberId, date).indexOf(time) !== -1) {
                return { error: "slot_taken" };
            }
            return { barberId: barberId };
        }
        for (var i = 0; i < ids.length; i += 1) {
            if (takenSlots(ids[i], date).indexOf(time) === -1) {
                return { barberId: ids[i] };
            }
        }
        return { error: "shop_full" };
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
            shop: (barber.role === "owner" || barber.id === "rim") ? shopSummary(date) : null
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
            clearSession();
            if (livePeer) {
                try { livePeer.destroy(); } catch (err) {}
                livePeer = null;
            }
            if (await usingNode()) {
                try {
                    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
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
                row.extras = extras;
                updated = decorateBooking(row);
                return updated;
            });
            writeQueue(rows);
            return { ok: true, booking: updated };
        },
        availableSlots: async function (service, date, barber) {
            if (await usingNode()) {
                var data = await nodeFetch("/api/slots?service=" + encodeURIComponent(service) + "&date=" + encodeURIComponent(date) + "&barber=" + encodeURIComponent(barber || "any"));
                return data.slots || [];
            }
            var possible = Store.slots(service, date);
            if (barber && barber !== "any") {
                var taken = takenSlots(barber, date);
                return possible.filter(function (slot) {
                    return taken.indexOf(slot) === -1;
                });
            }
            var ids = activeStaff().map(function (row) {
                return row.id;
            });
            return possible.filter(function (slot) {
                return ids.some(function (id) {
                    return takenSlots(id, date).indexOf(slot) === -1;
                });
            });
        },
        createBooking: async function (payload) {
            if (await usingNode()) {
                return nodeFetch("/api/bookings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }
            var chosen = pickBarber(payload.barber, payload.date, payload.time);
            if (chosen.error) {
                var taken = new Error(chosen.error);
                taken.status = 409;
                throw taken;
            }
            var barber = BARBERS.filter(function (row) { return row.id === chosen.barberId; })[0]
                || activeStaff().filter(function (row) { return row.id === chosen.barberId; })[0];
            var booking = {
                id: Date.now(),
                customer_name: payload.customer_name,
                phone: payload.phone,
                service: payload.service,
                barber_id: chosen.barberId,
                barber_name: barber ? barber.name : chosen.barberId,
                date: payload.date,
                time: payload.time,
                note: payload.note || null,
                extras: [],
                extra_total: 0,
                amount: PRICES[payload.service] || 0,
                status: "pending",
                created_at: new Date().toISOString()
            };
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
        listen: function (onBooking, onReminder) {
            usingNode().then(function (ok) {
                if (ok) {
                    if (!window.EventSource) {
                        return;
                    }
                    var source = new EventSource("/api/barber/events");
                    source.onmessage = function (event) {
                        try {
                            var payload = JSON.parse(event.data);
                            if (payload.type === "new_booking") {
                                onBooking(payload.booking);
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
