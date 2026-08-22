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
            new Notification("StreetMan Barber — คิวใหม่", {
                body: booking.customer_name + " · " + booking.time + " · " + (SERVICES[booking.service] || booking.service)
            });
        }
        load();
    }

    async function boot() {
        tickClock();
        setInterval(tickClock, 15000);
        dateEl.value = todayISO();
        await load();

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
            await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
            window.location.href = "login.html";
        });
        document.getElementById("notify-btn").addEventListener("click", function () {
            if (!window.Notification) {
                return;
            }
            Notification.requestPermission();
        });

        if (window.EventSource) {
            var source = new EventSource("/api/barber/events");
            source.onmessage = function (event) {
                try {
                    var payload = JSON.parse(event.data);
                    if (payload.type === "new_booking") {
                        onNewBooking(payload.booking);
                    }
                } catch (err) {}
            };
        }

        setInterval(load, 15000);
    }

    boot().catch(function () {
        window.location.href = "login.html";
    });
})();
