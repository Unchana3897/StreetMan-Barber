(function () {
    "use strict";

    var SERVICES = {
        haircut: "ตัดผม",
        beard: "ตกแต่งเครา",
        shave: "โกนหนวด",
        dye: "ย้อมผม",
        mustache: "ตกแต่งหนวด",
        stacking: "เซ็ตทรง"
    };
    var PRICES = {
        haircut: 300,
        beard: 200,
        shave: 200,
        dye: 150,
        mustache: 500,
        stacking: 1000
    };
    var SERVICE_ORDER = ["haircut", "beard", "shave", "dye", "mustache", "stacking"];

    var STATUS = {
        pending: "รอรับ",
        confirmed: "ยืนยันแล้ว",
        done: "เสร็จแล้ว",
        cancelled: "ยกเลิก"
    };

    var DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
    var WEEKDAY_NAMES = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
    var WEEKDAY_OPTIONS = [
        ["", "ยังไม่กำหนด"],
        ["1", "จันทร์"],
        ["2", "อังคาร"],
        ["3", "พุธ"],
        ["4", "พฤหัสบดี"],
        ["5", "ศุกร์"],
        ["6", "เสาร์"],
        ["0", "อาทิตย์"]
    ];

    var listEl = document.getElementById("queue-list");
    var emptyEl = document.getElementById("empty");
    var dateEl = document.getElementById("queue-date");
    var toastEl = document.getElementById("toast");
    var weekEl = document.getElementById("week-strip");
    var nextEl = document.getElementById("next-card");
    var knownIds = new Set();
    var currentFilter = "all";
    var latest = { bookings: [], next: null, stats: {}, date: "", now: {} };

    function bangkokParts(date) {
        date = date || new Date();
        var parts = {};
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Bangkok",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            weekday: "short",
            hour12: false
        }).formatToParts(date).forEach(function (part) {
            parts[part.type] = part.value;
        });
        return parts;
    }

    function todayISO() {
        var parts = bangkokParts();
        return parts.year + "-" + parts.month + "-" + parts.day;
    }

    function addDays(iso, n) {
        var bits = iso.split("-").map(Number);
        var next = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2] + n));
        return next.toISOString().slice(0, 10);
    }

    function weekdayLabel(iso) {
        var bits = iso.split("-").map(Number);
        return DAYS[new Date(bits[0], bits[1] - 1, bits[2]).getDay()];
    }

    function waPhone(phone) {
        var digits = String(phone || "").replace(/\D/g, "");
        if (digits.charAt(0) === "0") {
            digits = "66" + digits.slice(1);
        }
        return digits;
    }

    function showToast(text) {
        toastEl.textContent = text;
        toastEl.classList.remove("d-none");
        setTimeout(function () {
            toastEl.classList.add("d-none");
        }, 6000);
    }

    function urlBase64ToUint8Array(base64String) {
        var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        var raw = atob(base64);
        var output = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i += 1) {
            output[i] = raw.charCodeAt(i);
        }
        return output;
    }

    function isIos() {
        return /iphone|ipad|ipod/i.test(navigator.userAgent);
    }

    function isStandalone() {
        return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }

    function setNotifyBtn(text, enabled) {
        var btn = document.getElementById("notify-btn");
        btn.textContent = text;
        btn.disabled = !enabled;
    }

    function renderPushHint() {
        var hint = document.getElementById("push-hint");
        if (window.StreetManStore && window.StreetManStore.onGitHubPages()) {
            hint.textContent = "เปิดหน้านี้ค้างไว้บนมือถือ คิวใหม่จะเด้งที่นี่ แนะนำให้เพิ่มไปยังหน้าจอโฮม";
            hint.classList.remove("d-none");
            return;
        }
        if (isIos() && !isStandalone()) {
            hint.textContent = "iPhone: กดแชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิดแอปคิวช่างจากไอคอน แล้วค่อยกดเปิดแจ้งเตือนมือถือ";
            hint.classList.remove("d-none");
            return;
        }
        if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window)) {
            hint.textContent = "การแจ้งเตือนมือถือใช้ได้เมื่อเปิดร้านผ่าน HTTPS (หรือ localhost) บน Chrome / Safari ที่รองรับ";
            hint.classList.remove("d-none");
            return;
        }
        hint.textContent = "กดเปิดแจ้งเตือน แล้วเปิดแอปคิวช่างค้างไว้ (อย่าปัดปิด) แตะหน้าจอหนึ่งครั้ง เสียงกีตาร์จะดังได้ตอนล็อกจอ อย่าปิดเสียงเครื่อง";
        hint.classList.remove("d-none");
    }

    async function registerWorker() {
        if (!("serviceWorker" in navigator)) {
            return null;
        }
        return navigator.serviceWorker.register("sw.js");
    }

    async function syncPushState() {
        if (window.StreetManStore && !(await window.StreetManStore.usingNode())) {
            setNotifyBtn("เปิดแจ้งเตือนบนมือถือ", true);
            return;
        }
        var btn = document.getElementById("notify-btn");
        if (isIos() && !isStandalone()) {
            setNotifyBtn("เพิ่มไปหน้าจอโฮมก่อน", false);
            return;
        }
        if (!window.isSecureContext || !("PushManager" in window)) {
            setNotifyBtn("มือถือเครื่องนี้ยังไม่รองรับ", false);
            return;
        }
        try {
            var reg = await registerWorker();
            await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (sub) {
                await api("/api/barber/push-subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(sub)
                });
                setNotifyBtn("แจ้งเตือนมือถือเปิดแล้ว", false);
            } else {
                setNotifyBtn("เปิดแจ้งเตือนมือถือ", true);
            }
        } catch (err) {
            setNotifyBtn("เปิดแจ้งเตือนมือถือ", true);
        }
        btn.disabled = btn.textContent !== "เปิดแจ้งเตือนมือถือ";
    }

    async function enablePush() {
        if (window.StreetManStore && !(await window.StreetManStore.usingNode())) {
            if (!window.Notification) {
                showToast("เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน");
                return;
            }
            var localPerm = await Notification.requestPermission();
            if (localPerm !== "granted") {
                showToast("ยังไม่ได้อนุญาตการแจ้งเตือน");
                return;
            }
            setNotifyBtn("แจ้งเตือนเปิดแล้ว เปิดหน้านี้ค้างไว้", false);
            showToast("เปิดหน้า Dashboard ค้างไว้ คิวใหม่จะเด้งบนมือถือ");
            return;
        }
        if (!window.Notification || !("PushManager" in window)) {
            showToast("เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือนเว็บ");
            return;
        }
        var perm = await Notification.requestPermission();
        if (perm !== "granted") {
            showToast("ยังไม่ได้อนุญาตการแจ้งเตือน");
            return;
        }
        var reg = await registerWorker();
        await navigator.serviceWorker.ready;
        var keyData = await api("/api/barber/push-key");
        var sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
        });
        await api("/api/barber/push-subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sub)
        });
        setNotifyBtn("แจ้งเตือนมือถือเปิดแล้ว", false);
        unlockAlert();
        showToast("เปิดแจ้งเตือนแล้ว เปิดแอปนี้ค้างไว้ เสียงกีตาร์จะดังได้ตอนล็อกจอ");
    }

    var alertAudio = null;
    var holdAudio = null;
    var alertPlaying = false;

    function setMediaSession() {
        if (!navigator.mediaSession) {
            return;
        }
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "คิวช่าง StreetMan",
                artist: "รอคิวใหม่ · อย่าปิดแอปนี้",
                artwork: [{ src: "../img/logo.PNG", sizes: "192x192", type: "image/png" }]
            });
            navigator.mediaSession.playbackState = "playing";
        } catch (err) {}
    }

    function holdAlert() {
        try {
            if (!holdAudio) {
                holdAudio = new Audio("silence.wav");
                holdAudio.loop = true;
                holdAudio.preload = "auto";
                holdAudio.playsInline = true;
            }
            holdAudio.muted = false;
            holdAudio.volume = 1;
            var play = holdAudio.play();
            if (play && play.catch) {
                play.catch(function () {});
            }
            setMediaSession();
        } catch (err) {}
    }

    function unlockAlert() {
        holdAlert();
        try {
            if (!alertAudio) {
                alertAudio = new Audio("Guitar.mp3");
                alertAudio.preload = "auto";
                alertAudio.playsInline = true;
                alertAudio.addEventListener("ended", function () {
                    alertPlaying = false;
                    holdAlert();
                });
            }
        } catch (err) {}
    }

    function buzz() {
        try {
            if (navigator.vibrate) {
                navigator.vibrate([400, 120, 400, 120, 400, 180, 700]);
            }
        } catch (err) {}
    }

    function beep() {
        buzz();
        unlockAlert();
        try {
            if (!alertAudio) {
                alertAudio = new Audio("Guitar.mp3");
                alertAudio.playsInline = true;
                alertAudio.addEventListener("ended", function () {
                    alertPlaying = false;
                    holdAlert();
                });
            }
            alertPlaying = true;
            alertAudio.muted = false;
            alertAudio.volume = 1;
            alertAudio.currentTime = 0;
            var play = alertAudio.play();
            setMediaSession();
            if (play && play.catch) {
                play.catch(function () {
                    alertPlaying = false;
                    var ctx = new (window.AudioContext || window.webkitAudioContext)();
                    if (ctx.resume) {
                        ctx.resume();
                    }
                    [0, 0.22, 0.44, 0.66].forEach(function (at, index) {
                        var osc = ctx.createOscillator();
                        var gain = ctx.createGain();
                        osc.type = "square";
                        osc.frequency.value = index % 2 ? 1320 : 880;
                        gain.gain.value = 0.28;
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.start(ctx.currentTime + at);
                        osc.stop(ctx.currentTime + at + 0.18);
                    });
                });
            }
        } catch (err) {}
    }

    function queueNotice(title, body) {
        beep();
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            return;
        }
        if (!window.Notification || Notification.permission !== "granted" || !document.hidden) {
            return;
        }
        try {
            new Notification(title, {
                body: body,
                icon: "../img/logo.PNG",
                silent: false,
                vibrate: [400, 120, 400, 120, 400, 180, 700],
                requireInteraction: true,
                tag: "streetman-queue",
                renotify: true
            });
        } catch (err) {}
    }

    async function api(url, options) {
        if (url.indexOf("/api/barber/dashboard") === 0) {
            var date = (url.split("date=")[1] || "").split("&")[0];
            return window.StreetManStore.dashboard(decodeURIComponent(date));
        }
        if (url.indexOf("/api/barber/bookings/") === 0 && options && options.method === "PATCH") {
            var id = Number(url.split("/").pop());
            var body = JSON.parse(options.body || "{}");
            if (body.add_extra || body.remove_extra || body.extras) {
                return window.StreetManStore.updateExtras(id, body);
            }
            return window.StreetManStore.updateStatus(id, body.status);
        }
        if (url === "/api/me") {
            var barber = await window.StreetManStore.me();
            return { barber: barber };
        }
        if (url === "/api/barber/push-key" || url === "/api/barber/push-subscribe") {
            if (!(await window.StreetManStore.usingNode())) {
                throw new Error("pages");
            }
        }
        options = options || {};
        var headers = Object.assign({}, options.headers || {});
        var session = window.StreetManStore && window.StreetManStore.getSession && window.StreetManStore.getSession();
        if (session && session.token) {
            headers["X-Session-Token"] = session.token;
        }
        var res = await fetch(url, Object.assign({ credentials: "same-origin" }, options, { headers: headers }));
        if (res.status === 401) {
            window.location.href = "login.html";
            throw new Error("login");
        }
        return res.json();
    }

    function tickClock() {
        var parts = bangkokParts();
        document.getElementById("clock").textContent =
            "วันนี้ " + parts.day + "/" + parts.month + "/" + parts.year + " · " + parts.hour + ":" + parts.minute + " น.";
    }

    function baht(value) {
        return "฿" + Number(value || 0).toLocaleString("th-TH");
    }

    function isOwner(barber) {
        return barber && (barber.role === "owner" || barber.id === "rim");
    }

    function timeRange(row) {
        return row && row.end_time ? row.time + "–" + row.end_time : (row && row.time) || "";
    }

    function renderStats(stats) {
        stats = stats || {};
        var heads = stats.heads != null
            ? stats.heads
            : (stats.pending || 0) + (stats.confirmed || 0) + (stats.done || 0);
        document.getElementById("stat-pending").textContent = stats.pending || 0;
        document.getElementById("stat-confirmed").textContent = stats.confirmed || 0;
        document.getElementById("stat-done").textContent = stats.done || 0;
        document.getElementById("stat-total").textContent = heads;
    }

    function renderWeek(upcoming, selected) {
        weekEl.innerHTML = "";
        (upcoming || []).forEach(function (day) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "week-day" + (day.date === selected ? " is-active" : "") + (day.count ? " has-queue" : "");
            btn.innerHTML = "<small></small><strong></strong><span></span>";
            btn.querySelector("small").textContent = weekdayLabel(day.date);
            btn.querySelector("strong").textContent = Number(day.date.slice(8, 10));
            btn.querySelector("span").textContent = day.count ? day.count + " คิว" : "ว่าง";
            btn.addEventListener("click", function () {
                dateEl.value = day.date;
                load();
            });
            weekEl.appendChild(btn);
        });
    }

    function contactButtons(row) {
        var wrap = document.createElement("div");
        wrap.className = "queue-contacts";
        var call = document.createElement("a");
        call.className = "btn btn-sm btn-outline-light";
        call.href = "tel:" + row.phone;
        call.innerHTML = '<i class="fa fa-phone-alt me-1"></i>โทร';
        wrap.appendChild(call);
        var wa = document.createElement("a");
        wa.className = "btn btn-sm btn-outline-light";
        wa.href = "https://wa.me/" + waPhone(row.phone);
        wa.target = "_blank";
        wa.rel = "noopener";
        wa.innerHTML = '<i class="fab fa-whatsapp me-1"></i>WhatsApp';
        wrap.appendChild(wa);
        return wrap;
    }

    function renderNext(booking) {
        if (!booking) {
            nextEl.className = "next-card d-none";
            nextEl.innerHTML = "";
            return;
        }
        nextEl.className = "next-card";
        nextEl.innerHTML =
            "<p class=\"staff-kicker mb-1\">คิวถัดไป</p>" +
            "<div class=\"next-main\">" +
            "<div class=\"queue-time\"></div>" +
            "<div><h2></h2><p class=\"queue-meta mb-2\"></p></div>" +
            "</div>";
        nextEl.querySelector(".queue-time").textContent = timeRange(booking);
        nextEl.querySelector("h2").textContent = booking.customer_name;
        nextEl.querySelector(".queue-meta").textContent =
            (SERVICES[booking.service] || booking.service) +
            " " + baht(PRICES[booking.service] || 0) +
            " · " + booking.phone +
            (booking.note ? " · " + booking.note : "");
        nextEl.querySelector(".queue-meta").parentNode.appendChild(extrasPanel(booking));
        var actions = document.createElement("div");
        actions.className = "queue-actions";
        if (booking.status === "pending") {
            actions.appendChild(actionBtn("รับคิว", "confirmed", booking.id));
        }
        if (booking.status === "confirmed") {
            actions.appendChild(actionBtn("เสร็จแล้ว", "done", booking.id));
        }
        actions.appendChild(contactButtons(booking));
        nextEl.appendChild(actions);
    }

    function renderList(bookings) {
        var filtered = bookings.filter(function (row) {
            return currentFilter === "all" || row.status === currentFilter;
        });
        listEl.innerHTML = "";
        emptyEl.classList.toggle("d-none", filtered.length > 0);
        emptyEl.textContent = bookings.length ? "ไม่มีคิวในสถานะนี้" : "ยังไม่มีคิววันนี้";
        filtered.forEach(function (row) {
            knownIds.add(row.id);
            var card = document.createElement("article");
            card.className = "queue-card is-" + row.status + (row.status === "pending" ? " is-new" : "");
            card.innerHTML =
                '<div class="queue-time"></div>' +
                "<div>" +
                "<strong></strong>" +
                '<p class="queue-meta mb-0"></p>' +
                '<span class="queue-status"></span>' +
                "</div>" +
                '<div class="queue-actions"></div>';
            card.querySelector(".queue-time").textContent = timeRange(row);
            card.querySelector("strong").textContent = row.customer_name;
            card.querySelector(".queue-meta").textContent =
                (SERVICES[row.service] || row.service) +
                " " + baht(PRICES[row.service] || 0) +
                (row.note ? " · " + row.note : "");
            card.querySelector(".queue-status").textContent = STATUS[row.status] || row.status;
            card.children[1].appendChild(extrasPanel(row));

            var actions = card.querySelector(".queue-actions");
            if (row.status === "pending") {
                actions.appendChild(actionBtn("รับคิว", "confirmed", row.id));
            }
            if (row.status === "confirmed") {
                actions.appendChild(actionBtn("เสร็จแล้ว", "done", row.id));
            }
            if (row.status === "pending" || row.status === "confirmed") {
                actions.appendChild(actionBtn("ยกเลิก", "cancelled", row.id));
            }
            actions.appendChild(contactButtons(row));
            listEl.appendChild(card);
        });
    }

    function extrasPanel(row) {
        var wrap = document.createElement("div");
        wrap.className = "queue-extras";
        if (row.status === "cancelled") {
            return wrap;
        }
        var extras = row.extras || [];
        var total = row.amount != null ? row.amount : (PRICES[row.service] || 0);
        var amount = document.createElement("p");
        amount.className = "queue-amount mb-2";
        amount.textContent = extras.length
            ? "จอง " + baht(PRICES[row.service] || 0) + " + เพิ่ม " + baht(row.extra_total || 0) + " = " + baht(total)
            : "ยอดจอง " + baht(total);
        wrap.appendChild(amount);
        var hint = document.createElement("p");
        hint.className = "queue-meta mb-2";
        hint.textContent = "เพิ่มบริการตอนตัด · ถ้าชนคิวถัดไป จะเพิ่มไม่ได้";
        wrap.appendChild(hint);
        SERVICE_ORDER.forEach(function (service) {
            if (service === row.service) {
                return;
            }
            var on = extras.indexOf(service) !== -1;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "extra-chip" + (on ? " is-on" : "");
            btn.textContent = (on ? "✓ " : "+ ") + (SERVICES[service] || service) + " " + baht(PRICES[service]);
            btn.addEventListener("click", function () {
                updateExtras(row.id, on ? { remove_extra: service } : { add_extra: service });
            });
            wrap.appendChild(btn);
        });
        return wrap;
    }

    function actionBtn(label, status, id) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-sm " + (status === "cancelled" ? "btn-outline-light" : "btn-primary");
        btn.textContent = label;
        btn.addEventListener("click", function () {
            updateStatus(id, status);
        });
        return btn;
    }

    function render(data) {
        latest = data;
        document.getElementById("barber-name").textContent = "คิวของ " + data.barber.name;
        renderStats(data.stats);
        var owner = isOwner(data.barber);
        var manage = document.getElementById("manage-link");
        if (manage) {
            manage.classList.toggle("d-none", !owner);
        }
        var pos = document.getElementById("pos-link");
        if (pos) {
            pos.classList.add("d-none");
        }
        renderWeek(data.upcoming, data.date);
        renderDayOff(data);
        renderHours(data.hours);
        renderShopStatus(data);
        renderNext(data.next);
        renderList(data.bookings || []);
    }

    function weekdayOf(iso) {
        var bits = String(iso || "").split("-").map(Number);
        return new Date(Date.UTC(bits[0], bits[1] - 1, bits[2])).getUTCDay();
    }

    function fillDayOffSelect(select, value) {
        if (!select) {
            return;
        }
        if (select.getAttribute("data-ready") !== "1") {
            select.innerHTML = "";
            WEEKDAY_OPTIONS.forEach(function (pair) {
                var opt = document.createElement("option");
                opt.value = pair[0];
                opt.textContent = pair[1];
                select.appendChild(opt);
            });
            select.setAttribute("data-ready", "1");
        }
        select.value = value == null || value === "" ? "" : String(value);
        if (select.value !== (value == null || value === "" ? "" : String(value))) {
            select.value = "";
        }
    }

    function renderDayOff(data) {
        var off = data && data.day_off;
        if (off == null && data && data.barber) {
            off = data.barber.day_off;
        }
        fillDayOffSelect(document.getElementById("day-off"), off);
        var banner = document.getElementById("day-off-banner");
        if (!banner) {
            return;
        }
        var isOff = off != null && off !== "" && Number(off) === weekdayOf(data && data.date);
        banner.classList.toggle("d-none", !isOff);
        if (isOff) {
            banner.textContent = "วันที่นี้ตรงกับวันหยุดประจำสัปดาห์ของฉัน (" + WEEKDAY_NAMES[Number(off)] + ") ลูกค้าจองออนไลน์กับฉันไม่ได้";
        }
    }

    async function saveDayOff() {
        var select = document.getElementById("day-off");
        var raw = select ? select.value : "";
        var weekday = raw === "" ? null : Number(raw);
        try {
            await window.StreetManStore.setDayOff(weekday);
            showToast(weekday == null ? "ล้างวันหยุดแล้ว" : "บันทึกวันหยุดวัน" + WEEKDAY_NAMES[weekday] + "แล้ว");
            load();
        } catch (err) {
            showToast(err && err.status === 401 ? "เซสชันหมด ลองออกแล้วเข้าใหม่" : "บันทึกวันหยุดไม่สำเร็จ");
        }
    }

    function renderHours(hours) {
        var panel = document.getElementById("hours-panel");
        var grid = document.getElementById("hours-grid");
        if (!panel || !grid) {
            return;
        }
        if (!hours || !hours.slots) {
            panel.classList.add("d-none");
            return;
        }
        panel.classList.remove("d-none");
        var blocked = {};
        (hours.blocked || []).forEach(function (slot) {
            blocked[slot] = true;
        });
        var booked = 0;
        (hours.blocked || []).forEach(function () { booked += 1; });
        var copy = document.getElementById("hours-copy");
        if (copy) {
            copy.textContent = booked
                ? "ปิดรับจอง " + booked + " ช่องในวันนี้ แตะช่องสว่างเพื่อเปิดอีก หรือช่องมืดเพื่อปิด"
                : "แตะช่องเวลาเพื่อปิดรับจองในวันนี้ ช่องมืดคือไม่ว่าง ลูกค้าจองช่วงนั้นไม่ได้";
        }
        grid.innerHTML = "";
        hours.slots.forEach(function (slot) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "hours-chip" + (blocked[slot] ? " is-off" : "");
            btn.textContent = slot;
            btn.setAttribute("aria-pressed", blocked[slot] ? "true" : "false");
            btn.addEventListener("click", function () {
                var next = (hours.blocked || []).slice();
                var index = next.indexOf(slot);
                if (index === -1) {
                    next.push(slot);
                } else {
                    next.splice(index, 1);
                }
                saveHours(hours.date, next);
            });
            grid.appendChild(btn);
        });
    }

    async function saveHours(date, blocked) {
        try {
            await window.StreetManStore.setHours(date, blocked);
            showToast("บันทึกเวลาว่างแล้ว");
            load();
        } catch (err) {
            showToast(err && err.status === 401 ? "เซสชันหมด ลองออกแล้วเข้าใหม่" : "บันทึกเวลาว่างไม่สำเร็จ");
        }
    }

    function renderShopStatus(data) {
        var status = (data && data.shop_status) || {};
        var banner = document.getElementById("shop-closed-banner");
        var btn = document.getElementById("shop-close-btn");
        var owner = isOwner(data && data.barber);
        if (banner) {
            banner.classList.toggle("d-none", !status.closed);
        }
        if (!btn) {
            return;
        }
        btn.className = (status.closed ? "btn btn-primary" : "btn btn-outline-light") + (owner ? "" : " d-none");
        btn.textContent = status.closed ? "เปิดรับจอง" : "ปิดร้าน";
    }

    async function toggleShop() {
        var closed = Boolean(latest.shop_status && latest.shop_status.closed);
        if (!closed && !window.confirm("ปิดร้านแล้วลูกค้าจะจองออนไลน์ไม่ได้ จนกว่าจะกดเปิดรับจอง")) {
            return;
        }
        try {
            await window.StreetManStore.setShop({ closed: !closed });
            showToast(closed ? "เปิดรับจองแล้ว" : "ปิดร้านแล้ว ลูกค้าจองออนไลน์ไม่ได้");
            load();
        } catch (err) {
            var code = err && ((err.body && err.body.error) || err.message);
            showToast(code === "login" || err && err.status === 401
                ? "เซสชันหมด ลองออกแล้วเข้าใหม่"
                : code === "owner_required"
                    ? "ปิดร้านได้เฉพาะ Rim"
                    : code === "not_found" || err && err.status === 404
                        ? "เซิร์ฟเวอร์ยังเป็นเวอร์ชันเก่า ปิดแล้วรัน npm start ใหม่"
                        : "เปลี่ยนสถานะร้านไม่สำเร็จ");
        }
    }

    async function updateExtras(id, payload) {
        try {
            await api("/api/barber/bookings/" + id, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            load();
        } catch (err) {
            var code = err && ((err.body && err.body.error) || err.message);
            showToast(code === "extra_overlap"
                ? "เพิ่มไม่ได้ คิวนี้จะชนกับคิวถัดไป"
                : "อัปเดตบริการไม่สำเร็จ");
        }
    }

    async function updateStatus(id, status) {
        await api("/api/barber/bookings/" + id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: status })
        });
        load();
    }

    async function load() {
        var data = await api("/api/barber/dashboard?date=" + encodeURIComponent(dateEl.value || todayISO()));
        render(data);
    }

    function onDayReminder(payload) {
        showToast(payload.message || "มีคิววันนี้");
        queueNotice(payload.title || "คิววันนี้", payload.message || "เปิด Dashboard เพื่อดูคิววันนี้");
        if (payload.date && dateEl.value !== payload.date) {
            dateEl.value = payload.date;
        }
        load();
    }

    function onNewBooking(booking) {
        if (!booking || knownIds.has(booking.id)) {
            return;
        }
        if (booking.date !== dateEl.value) {
            showToast("มีคิวใหม่วันที่ " + booking.date + " เวลา " + booking.time);
        } else {
            showToast("คิวใหม่ " + booking.time + " · " + booking.customer_name);
        }
        queueNotice(
            "StreetMan Barber Phuket — คิวใหม่",
            booking.customer_name + " · " + booking.time + " · " + (SERVICES[booking.service] || booking.service)
        );
        load();
    }

    var booted = false;

    async function boot() {
        var me = await window.StreetManStore.me();
        if (me && (me.role === "cashier" || me.id === "pos")) {
            window.location.replace("pos.html");
            return;
        }
        if (booted) {
            await load();
            return;
        }
        booted = true;
        tickClock();
        setInterval(tickClock, 15000);
        dateEl.value = todayISO();
        await load();
        renderPushHint();
        syncPushState();

        dateEl.addEventListener("change", load);
        document.getElementById("today-btn").addEventListener("click", function () {
            dateEl.value = todayISO();
            load();
        });
        document.getElementById("refresh-btn").addEventListener("click", function () {
            load();
            showToast("รีเฟรชคิวแล้ว");
        });
        document.getElementById("prev-day").addEventListener("click", function () {
            dateEl.value = addDays(dateEl.value || todayISO(), -1);
            load();
        });
        document.getElementById("next-day").addEventListener("click", function () {
            dateEl.value = addDays(dateEl.value || todayISO(), 1);
            load();
        });
        function setFilter(filter) {
            currentFilter = filter;
            document.querySelectorAll(".filter-btn").forEach(function (el) {
                el.classList.toggle("active", el.getAttribute("data-filter") === filter);
            });
            renderList(latest.bookings || []);
        }

        document.querySelectorAll(".filter-btn, .stat-card").forEach(function (btn) {
            btn.addEventListener("click", function () {
                setFilter(btn.getAttribute("data-filter"));
            });
        });
        document.getElementById("logout-btn").addEventListener("click", async function () {
            await window.StreetManStore.logout();
            window.location.href = "login.html";
        });
        document.getElementById("notify-btn").addEventListener("click", function () {
            unlockAlert();
            enablePush();
        });
        document.addEventListener("touchstart", unlockAlert, { once: true });
        document.addEventListener("click", unlockAlert, { once: true });
        document.addEventListener("visibilitychange", function () {
            holdAlert();
        });
        if (navigator.serviceWorker) {
            navigator.serviceWorker.addEventListener("message", function (event) {
                if (event.data && event.data.type === "queue_alert") {
                    beep();
                }
            });
        }
        document.getElementById("shop-close-btn").addEventListener("click", toggleShop);
        document.getElementById("hours-off").addEventListener("click", function () {
            var hours = latest && latest.hours;
            if (!hours) {
                return;
            }
            saveHours(hours.date, (hours.slots || []).slice());
        });
        document.getElementById("hours-on").addEventListener("click", function () {
            var hours = latest && latest.hours;
            if (!hours) {
                return;
            }
            saveHours(hours.date, []);
        });
        document.getElementById("day-off-save").addEventListener("click", saveDayOff);

        window.StreetManStore.listen(onNewBooking, onDayReminder);

        setInterval(load, 15000);
    }

    boot().catch(function (err) {
        if (err && err.status === 401) {
            window.location.href = "login.html";
            return;
        }
        showToast("ร้านกำลังเชื่อมต่อ รอสักครู่แล้วเปิดใหม่อีกครั้ง");
        window.setTimeout(function () {
            boot().catch(function (retryErr) {
                if (retryErr && retryErr.status === 401) {
                    window.location.href = "login.html";
                }
            });
        }, 2500);
    });
})();
