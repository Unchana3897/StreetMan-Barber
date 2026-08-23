(function () {
    "use strict";

    var form = document.getElementById("cancel-form");
    var tokenEl = document.getElementById("cancel-token");
    var resultEl = document.getElementById("cancel-result");
    var alertEl = document.getElementById("cancel-alert");
    var confirmBtn = document.getElementById("cancel-confirm");
    var currentToken = "";

    function t(key) {
        return window.StreetMan ? window.StreetMan.t(key) : key;
    }

    function showAlert(ok, message) {
        alertEl.classList.remove("d-none", "alert-success", "alert-danger");
        alertEl.classList.add(ok ? "alert-success" : "alert-danger");
        alertEl.textContent = message;
    }

    function errorMessage(err) {
        var code = err && ((err.body && err.body.error) || err.message);
        if (code === "too_late") {
            return t("cancel_too_late");
        }
        if (code === "already_cancelled") {
            return t("cancel_already");
        }
        if (code === "already_done") {
            return t("cancel_done");
        }
        if (code === "not_found") {
            return t("cancel_not_found");
        }
        return t("cancel_not_found");
    }

    function serviceName(service) {
        var key = "svc_" + service;
        var label = t(key);
        return label === key ? service : label;
    }

    function renderBooking(booking) {
        resultEl.classList.remove("d-none");
        resultEl.querySelector("[data-field='name']").textContent = booking.customer_name || "-";
        resultEl.querySelector("[data-field='phone']").textContent = booking.phone || "-";
        resultEl.querySelector("[data-field='service']").textContent = serviceName(booking.service);
        resultEl.querySelector("[data-field='barber']").textContent = booking.barber_name || booking.barber_id || "-";
        resultEl.querySelector("[data-field='when']").textContent =
            booking.date + " · " + booking.time + (booking.end_time ? "–" + booking.end_time : "");
        confirmBtn.classList.toggle("d-none", !booking.can_cancel);
        if (booking.status === "cancelled") {
            showAlert(true, t("cancel_already"));
        } else if (!booking.can_cancel && booking.cancel_error) {
            showAlert(false, errorMessage({ message: booking.cancel_error }));
        }
    }

    async function lookup(token) {
        currentToken = String(token || "").trim();
        resultEl.classList.add("d-none");
        confirmBtn.classList.add("d-none");
        try {
            var data = await window.StreetManStore.lookupBooking(currentToken);
            renderBooking(data.booking);
            if (data.booking.can_cancel) {
                alertEl.classList.add("d-none");
            }
        } catch (err) {
            showAlert(false, errorMessage(err));
        }
    }

    function extractToken(text) {
        var raw = String(text || "");
        var marked = raw.match(/streetman-cancel:([a-f0-9]{16})/i);
        if (marked) {
            return marked[1].toLowerCase();
        }
        var query = raw.match(/[?&]t=([a-f0-9-]{16,40})/i);
        if (query) {
            return query[1].toLowerCase().replace(/[^a-f0-9]/g, "");
        }
        var dashed = raw.match(/[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}/i);
        if (dashed) {
            return dashed[0].toLowerCase().replace(/[^a-f0-9]/g, "");
        }
        var hex = raw.toLowerCase().replace(/[^a-f0-9]/g, "");
        if (hex.length >= 16 && hex.length <= 24) {
            return hex.slice(0, 16);
        }
        return "";
    }

    function drawFile(file, max) {
        return new Promise(function (resolve, reject) {
            var image = new Image();
            image.onload = function () {
                var scale = Math.min(1, max / Math.max(image.width, image.height));
                var canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                var ctx = canvas.getContext("2d");
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(image.src);
                resolve(canvas);
            };
            image.onerror = function () {
                URL.revokeObjectURL(image.src);
                reject(new Error("bad_image"));
            };
            image.src = URL.createObjectURL(file);
        });
    }

    function invertCanvas(source) {
        var canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(source, 0, 0);
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (var i = 0; i < data.data.length; i += 4) {
            data.data[i] = 255 - data.data[i];
            data.data[i + 1] = 255 - data.data[i + 1];
            data.data[i + 2] = 255 - data.data[i + 2];
        }
        ctx.putImageData(data, 0, 0);
        return canvas;
    }

    function readQr(canvas) {
        if (!window.jsQR) {
            return "";
        }
        var ctx = canvas.getContext("2d");
        var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = window.jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
        return code && code.data ? extractToken(code.data) : "";
    }

    async function readOcr(canvas) {
        if (!window.Tesseract || !window.Tesseract.recognize) {
            return "";
        }
        try {
            var result = await window.Tesseract.recognize(canvas, "eng", {
                logger: function () {}
            });
            return extractToken(result && result.data && result.data.text);
        } catch (err) {
            return "";
        }
    }

    async function readSlip(file) {
        showAlert(true, t("cancel_reading"));
        alertEl.classList.remove("alert-danger");
        alertEl.classList.add("alert-success");
        var canvas = await drawFile(file, 1400);
        var token = readQr(canvas) || readQr(invertCanvas(canvas));
        if (!token) {
            token = await readOcr(canvas);
        }
        if (!token) {
            showAlert(false, t("cancel_read_fail"));
            return;
        }
        tokenEl.value = token;
        lookup(token);
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        lookup(tokenEl.value);
    });

    var uploadEl = document.getElementById("slip-upload");
    if (uploadEl) {
        uploadEl.addEventListener("change", function () {
            var file = uploadEl.files && uploadEl.files[0];
            if (!file) {
                return;
            }
            readSlip(file).catch(function () {
                showAlert(false, t("cancel_read_fail"));
            });
            uploadEl.value = "";
        });
    }

    confirmBtn.addEventListener("click", async function () {
        if (!currentToken) {
            return;
        }
        if (!window.confirm(t("cancel_confirm"))) {
            return;
        }
        try {
            await window.StreetManStore.cancelBooking(currentToken);
            showAlert(true, t("cancel_ok"));
            confirmBtn.classList.add("d-none");
        } catch (err) {
            showAlert(false, errorMessage(err));
        }
    });

    var params = new URLSearchParams(window.location.search);
    if (params.get("t")) {
        tokenEl.value = params.get("t");
        lookup(params.get("t"));
    }
})();
