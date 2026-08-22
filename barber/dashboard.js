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

    var STATUS = {
        pending: "รอรับ",
        confirmed: "ยืนยันแล้ว",
        done: "เสร็จแล้ว",
        cancelled: "ยกเลิก"
    };

    var DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

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
        hint.textContent = "กดเปิดแจ้งเตือนมือถือหนึ่งครั้ง เครื่องนี้จะได้รับคิวใหม่แม้ปิดหน้าเว็บไว้";
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
        showToast("เปิดแจ้งเตือนมือถือแล้ว คิวใหม่จะขึ้นแม้ปิดหน้านี้ไว้");
    }

    function beep() {
        try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.frequency.value = 880;
            gain.gain.value = 0.05;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.18);
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
        var res = await fetch(url, Object.assign({ credentials: "same-origin" }, options || {}));
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

    function renderStats(stats) {
        stats = stats || {};
        document.getElementById("stat-pending").textContent = stats.pending || 0;
        document.getElementById("stat-confirmed").textContent = stats.confirmed || 0;
        document.getElementById("stat-done").textContent = stats.done || 0;
        document.getElementById("stat-total").textContent = stats.total || 0;
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
        nextEl.querySelector(".queue-time").textContent = booking.time;
        nextEl.querySelector("h2").textContent = booking.customer_name;
        nextEl.querySelector(".queue-meta").textContent =
            (SERVICES[booking.service] || booking.service) +
            " · " + booking.phone +
            (booking.note ? " · " + booking.note : "");
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
            card.querySelector(".queue-time").textContent = row.time;
            card.querySelector("strong").textContent = row.customer_name;
            card.querySelector(".queue-meta").textContent =
                (SERVICES[row.service] || row.service) +
                (row.note ? " · " + row.note : "");
            card.querySelector(".queue-status").textContent = STATUS[row.status] || row.status;

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
        renderWeek(data.upcoming, data.date);
        renderNext(data.next);
        renderList(data.bookings || []);
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

    function onNewBooking(booking) {
        if (!booking || knownIds.has(booking.id)) {
            return;
        }
        if (booking.date !== dateEl.value) {
            showToast("มีคิวใหม่วันที่ " + booking.date + " เวลา " + booking.time);
        } else {
            showToast("คิวใหม่ " + booking.time + " · " + booking.customer_name);
        }
        beep();
        if (window.Notification && Notification.permission === "granted") {
            new Notification("StreetMan Barber Phuket — คิวใหม่", {
                body: booking.customer_name + " · " + booking.time + " · " + (SERVICES[booking.service] || booking.service)
            });
        }
        load();
    }

    async function boot() {
        await window.StreetManStore.me();
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
            enablePush();
        });

        window.StreetManStore.listen(onNewBooking);

        setInterval(load, 15000);
    }

    boot().catch(function () {
        window.location.href = "login.html";
    });
})();
