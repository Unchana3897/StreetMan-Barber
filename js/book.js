(function () {
    "use strict";

    var form = document.getElementById("book-form");
    if (!form) {
        return;
    }

    var serviceEl = document.getElementById("service");
    var barberEl = document.getElementById("barber");
    var dateEl = document.getElementById("date");
    var timeEl = document.getElementById("time");
    var alertEl = document.getElementById("book-alert");

    function todayISO() {
        var now = new Date();
        return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    }

    function t(key) {
        return window.StreetMan ? window.StreetMan.t(key) : key;
    }

    function showAlert(ok, message) {
        alertEl.classList.remove("d-none", "alert-success", "alert-danger");
        alertEl.classList.add(ok ? "alert-success" : "alert-danger");
        alertEl.textContent = message;
    }

    async function loadSlots() {
        var service = serviceEl.value || "haircut";
        var date = dateEl.value || todayISO();
        var barber = barberEl.value || "any";
        var current = timeEl.value;
        try {
            var res = await fetch("/api/slots?service=" + encodeURIComponent(service) + "&date=" + encodeURIComponent(date) + "&barber=" + encodeURIComponent(barber));
            var data = await res.json();
            var slots = data.slots || [];
            timeEl.innerHTML = '<option value="">' + t("opt_time") + "</option>";
            slots.forEach(function (slot) {
                var opt = document.createElement("option");
                opt.value = slot;
                opt.textContent = slot;
                timeEl.appendChild(opt);
            });
            if (current && slots.indexOf(current) !== -1) {
                timeEl.value = current;
            }
        } catch (err) {
            timeEl.innerHTML = '<option value="">' + t("opt_time") + "</option>";
        }
    }

    dateEl.min = todayISO();
    if (!dateEl.value) {
        dateEl.value = todayISO();
    }

    var params = new URLSearchParams(window.location.search);
    if (params.get("service")) {
        serviceEl.value = params.get("service");
    }
    if (params.get("barber")) {
        barberEl.value = params.get("barber");
    }

    serviceEl.addEventListener("change", loadSlots);
    barberEl.addEventListener("change", loadSlots);
    dateEl.addEventListener("change", loadSlots);
    loadSlots();

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        try {
            var res = await fetch("/api/bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customer_name: document.getElementById("name").value.trim(),
                    phone: document.getElementById("phone").value.trim(),
                    service: serviceEl.value,
                    barber: barberEl.value,
                    date: dateEl.value,
                    time: timeEl.value,
                    note: document.getElementById("note").value.trim()
                })
            });
            var data = await res.json();
            if (res.status === 409) {
                showAlert(false, t("book_slot_taken"));
                loadSlots();
                return;
            }
            if (!res.ok) {
                throw new Error(data.error || "fail");
            }
            showAlert(true, t("book_ok") + " · " + data.booking.date + " " + data.booking.time);
            form.reset();
            dateEl.value = todayISO();
            loadSlots();
        } catch (err) {
            showAlert(false, t("book_fail"));
        }
    });
})();
