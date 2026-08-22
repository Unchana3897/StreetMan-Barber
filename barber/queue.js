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

    var listEl = document.getElementById("queue-list");
    var emptyEl = document.getElementById("empty");
    var dateEl = document.getElementById("queue-date");
    var toastEl = document.getElementById("toast");
    var knownIds = new Set();

    function todayISO() {
        var now = new Date();
        return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
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

    function render(bookings) {
        listEl.innerHTML = "";
        emptyEl.classList.toggle("d-none", bookings.length > 0);
        bookings.forEach(function (row) {
            knownIds.add(row.id);
            var card = document.createElement("article");
            card.className = "queue-card" + (row.status === "pending" ? " is-new" : "");
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
                (SERVICES[row.service] || row.service) + " · " + row.phone + (row.note ? " · " + row.note : "");
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

    async function updateStatus(id, status) {
        await api("/api/barber/bookings/" + id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: status })
        });
        load();
    }

    async function load() {
        var data = await api("/api/barber/bookings?date=" + encodeURIComponent(dateEl.value));
        render(data.bookings || []);
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
        if (booking.date === dateEl.value) {
            load();
        }
    }

    async function boot() {
        var me = await api("/api/me");
        document.getElementById("barber-name").textContent = "คิวของ " + me.barber.name;
        dateEl.value = todayISO();
        await load();

        dateEl.addEventListener("change", load);
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
