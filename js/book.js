(function () {
    "use strict";

    var form = document.getElementById("book-form");
    if (!form) {
        return;
    }

    var LAST_SLOT = {
        haircut: "19:00",
        beard: "19:30",
        shave: "19:30",
        dye: "19:30",
        mustache: "19:30",
        stacking: "18:30"
    };

    var TIME_SLOTS = [
        "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
        "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
        "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
    ];

    var serviceEl = document.getElementById("service");
    var barberEl = document.getElementById("barber");
    var dateEl = document.getElementById("date");
    var timeEl = document.getElementById("time");
    var alertEl = document.getElementById("book-alert");
    var noteEl = document.getElementById("book-host-note");
    var useServer = null;

    function todayISO() {
        var now = new Date();
        return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    }

    function nowHM() {
        var now = new Date();
        return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    }

    function t(key) {
        return window.StreetMan ? window.StreetMan.t(key) : key;
    }

    function onGitHubPages() {
        return /\.github\.io$/i.test(window.location.hostname);
    }

    function localSlots(service, date) {
        var last = LAST_SLOT[service] || "19:00";
        var today = todayISO();
        return TIME_SLOTS.filter(function (slot) {
            if (slot > last) {
                return false;
            }
            if (date === today && slot <= nowHM()) {
                return false;
            }
            return true;
        });
    }

    function fillSlots(slots) {
        var current = timeEl.value;
        timeEl.innerHTML = '<option value="">' + t("opt_time") + "</option>";
        (slots || []).forEach(function (slot) {
            var opt = document.createElement("option");
            opt.value = slot;
            opt.textContent = slot;
            timeEl.appendChild(opt);
        });
        if (current && slots.indexOf(current) !== -1) {
            timeEl.value = current;
        }
    }

    function showAlert(ok, message) {
        alertEl.classList.remove("d-none", "alert-success", "alert-danger");
        alertEl.classList.add(ok ? "alert-success" : "alert-danger");
        alertEl.textContent = message;
        alertEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function isSlotTakenError(err) {
        var code = err && ((err.body && err.body.error) || err.message);
        return (err && err.status === 409) || code === "slot_taken" || code === "shop_full";
    }

    async function loadSlots(showDone) {
        var service = serviceEl.value || "haircut";
        var date = dateEl.value || todayISO();
        var barber = barberEl.value || "any";
        try {
            var slots = window.StreetManStore
                ? await window.StreetManStore.availableSlots(service, date, barber)
                : localSlots(service, date);
            fillSlots(slots);
            if (showDone) {
                showAlert(true, t("book_slots_updated"));
            }
        } catch (err) {
            fillSlots(localSlots(service, date));
        }
    }

    function showPagesNote() {
        if (!noteEl) {
            return;
        }
        noteEl.textContent = t("book_pages_note");
        noteEl.classList.remove("d-none");
    }

    async function serverAvailable() {
        if (useServer !== null) {
            return useServer;
        }
        if (onGitHubPages()) {
            useServer = false;
            return false;
        }
        try {
            var res = await fetch("/api/slots?service=haircut&date=" + encodeURIComponent(todayISO()));
            useServer = res.ok;
        } catch (err) {
            useServer = false;
        }
        return useServer;
    }

    function showBookingSlip(booking) {
        if (window.StreetManSlip) {
            window.StreetManSlip.show(booking);
        }
    }

    function openWhatsApp() {
        var lang = window.StreetMan ? window.StreetMan.detectLang() : "th";
        var barber = barberEl.value;
        var booking = {
            customer_name: document.getElementById("name").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            service: serviceEl.value,
            barber_id: barberEl.value,
            date: dateEl.value,
            time: timeEl.value,
            note: document.getElementById("note").value.trim()
        };
        var lines = lang === "th"
            ? ["สวัสดีครับ ขอจองคิว StreetMan Barber Phuket"]
            : ["Hi StreetMan Barber Phuket, I would like to book."];
        lines.push((lang === "th" ? "ชื่อ: " : "Name: ") + booking.customer_name);
        lines.push((lang === "th" ? "เบอร์: " : "Phone: ") + booking.phone);
        if (booking.service) {
            lines.push((lang === "th" ? "บริการ: " : "Service: ") + t("svc_" + booking.service));
        }
        if (barber && barber !== "any") {
            lines.push((lang === "th" ? "ช่าง: " : "Barber: ") + t("barber_" + barber));
        } else {
            lines.push(lang === "th" ? "ช่าง: ใครก็ได้ที่ว่าง" : "Barber: anyone available");
        }
        lines.push((lang === "th" ? "วันเวลา: " : "When: ") + booking.date + " " + booking.time);
        if (booking.note) {
            lines.push((lang === "th" ? "รายละเอียด: " : "Note: ") + booking.note);
        }
        showAlert(true, t("book_ok_wa"));
        showBookingSlip(booking);
        window.setTimeout(function () {
            window.open(window.StreetMan.waUrl(lines.join("\n")), "_blank", "noopener");
        }, 400);
    }

    dateEl.min = todayISO();
    if (!dateEl.value) {
        dateEl.value = todayISO();
    }

    var params = new URLSearchParams(window.location.search);
    if (params.get("service")) {
        serviceEl.value = params.get("service");
    }

    function barberLabel(id, fallback) {
        var key = "barber_" + id;
        var label = t(key);
        return label === key ? (fallback || id) : label;
    }

    async function loadBarbers() {
        if (!window.StreetManStore || !window.StreetManStore.listBarbers) {
            return;
        }
        try {
            var list = await window.StreetManStore.listBarbers();
            if (!list.length) {
                return;
            }
            var wanted = params.get("barber") || barberEl.value || "any";
            barberEl.innerHTML = "";
            var any = document.createElement("option");
            any.value = "any";
            any.textContent = t("opt_any");
            barberEl.appendChild(any);
            list.forEach(function (row) {
                var opt = document.createElement("option");
                opt.value = row.id;
                opt.textContent = barberLabel(row.id, row.name);
                barberEl.appendChild(opt);
            });
            barberEl.value = wanted;
            if (barberEl.value !== wanted) {
                barberEl.value = "any";
            }
        } catch (err) {}
    }

    if (params.get("barber")) {
        barberEl.value = params.get("barber");
    }

    serviceEl.addEventListener("change", loadSlots);
    barberEl.addEventListener("change", loadSlots);
    dateEl.addEventListener("change", loadSlots);
    var refreshSlotsBtn = document.getElementById("refresh-slots");
    if (refreshSlotsBtn) {
        refreshSlotsBtn.addEventListener("click", function () {
            loadSlots(true);
        });
    }
    serverAvailable().then(async function (ok) {
        if (!ok) {
            showPagesNote();
        }
        await loadBarbers();
        loadSlots();
    });

    var saveBtn = document.getElementById("slip-save");
    var newBtn = document.getElementById("slip-new");
    if (saveBtn) {
        saveBtn.addEventListener("click", function () {
            if (window.StreetManSlip) {
                window.StreetManSlip.save();
            }
        });
    }
    if (newBtn) {
        newBtn.addEventListener("click", function () {
            if (window.StreetManSlip) {
                window.StreetManSlip.hide();
            }
            form.reset();
            dateEl.value = todayISO();
            loadSlots();
            alertEl.classList.add("d-none");
        });
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var payload = {
            customer_name: document.getElementById("name").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            service: serviceEl.value,
            barber: barberEl.value,
            date: dateEl.value,
            time: timeEl.value,
            note: document.getElementById("note").value.trim()
        };
        try {
            var data = await window.StreetManStore.createBooking(payload);
            if (data.delivered === false && !(await window.StreetManStore.usingNode())) {
                openWhatsApp();
                return;
            }
            showAlert(true, t("book_ok") + " · " + data.booking.date + " " + data.booking.time);
            showBookingSlip(data.booking);
        } catch (err) {
            if (isSlotTakenError(err)) {
                timeEl.value = "";
                showAlert(false, t("book_slot_taken"));
                window.alert(t("book_slot_taken"));
                loadSlots();
                return;
            }
            openWhatsApp();
        }
    });
})();
