(function (window) {
    "use strict";

    var lastCanvas = null;
    var lastCode = "SM";

    function t(key) {
        return window.StreetMan ? window.StreetMan.t(key) : key;
    }

    function lang() {
        return window.StreetMan ? window.StreetMan.detectLang() : "th";
    }

    function pad(value, size) {
        var text = String(value);
        while (text.length < size) {
            text = "0" + text;
        }
        return text;
    }

    function slipCode(booking) {
        if (booking.id) {
            return "SM-" + pad(booking.id, 5);
        }
        var stamp = String(booking.date || "").replace(/-/g, "") + String(booking.time || "").replace(":", "");
        return "SM-" + (stamp || Date.now().toString().slice(-8));
    }

    function formatDate(iso) {
        if (!iso) {
            return "-";
        }
        var bits = iso.split("-").map(Number);
        var date = new Date(bits[0], bits[1] - 1, bits[2]);
        return date.toLocaleDateString(lang() === "th" ? "th-TH" : "en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    function wrapText(ctx, text, maxWidth) {
        var words = String(text || "").split(/\s+/);
        var lines = [];
        var line = "";
        words.forEach(function (word) {
            var test = line ? line + " " + word : word;
            if (ctx.measureText(test).width > maxWidth && line) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        });
        if (line) {
            lines.push(line);
        }
        return lines.slice(0, 3);
    }

    function row(ctx, label, value, y, width) {
        ctx.fillStyle = "#8A8FA8";
        ctx.font = "22px 'Noto Sans Thai', sans-serif";
        ctx.fillText(label, 64, y);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "600 28px 'Noto Sans Thai', sans-serif";
        wrapText(ctx, value, width - 128).forEach(function (line, index) {
            ctx.fillText(line, 64, y + 36 + index * 34);
        });
        return y + 88;
    }

    function drawSlip(booking) {
        var canvas = document.createElement("canvas");
        var scale = 2;
        var width = 720;
        var height = 1180;
        canvas.width = width * scale;
        canvas.height = height * scale;
        var ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);

        ctx.fillStyle = "#0B0D12";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#EB1616";
        ctx.fillRect(0, 0, width, 18);

        ctx.fillStyle = "#EB1616";
        ctx.font = "600 22px Oswald, 'Noto Sans Thai', sans-serif";
        ctx.fillText("STREETMAN BARBER PHUKET", 64, 72);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "700 48px Oswald, 'Noto Sans Thai', sans-serif";
        ctx.fillText(t("slip_title"), 64, 128);

        lastCode = slipCode(booking);
        ctx.fillStyle = "#EB1616";
        ctx.font = "600 32px Oswald, sans-serif";
        ctx.fillText(lastCode, 64, 176);

        ctx.strokeStyle = "#2A2E3A";
        ctx.beginPath();
        ctx.moveTo(64, 204);
        ctx.lineTo(width - 64, 204);
        ctx.stroke();

        var barberName = booking.barber_name || (booking.barber_id && booking.barber_id !== "any"
            ? t("barber_" + booking.barber_id)
            : t("opt_any"));
        var y = 250;
        y = row(ctx, t("label_name"), booking.customer_name || "-", y, width);
        y = row(ctx, t("label_phone"), booking.phone || "-", y, width);
        y = row(ctx, t("label_service"), t("svc_" + booking.service) || booking.service, y, width);
        y = row(ctx, t("label_barber"), barberName, y, width);
        y = row(ctx, t("slip_when"), formatDate(booking.date) + "  ·  " + (booking.time || "-"), y, width);
        if (booking.note) {
            y = row(ctx, t("label_note"), booking.note, y, width);
        }

        ctx.fillStyle = "#191C24";
        ctx.fillRect(48, height - 250, width - 96, 186);
        ctx.fillStyle = "#EB1616";
        ctx.font = "600 24px 'Noto Sans Thai', sans-serif";
        ctx.fillText(t("slip_show"), 72, height - 200);
        ctx.fillStyle = "#C7CAD8";
        ctx.font = "22px 'Noto Sans Thai', sans-serif";
        ctx.fillText("19/82 หมู่ 2 ต.วิชิต อ.เมือง จ.ภูเก็ต", 72, height - 158);
        ctx.fillText("062-525-8941  ·  11:00–20:00", 72, height - 122);
        ctx.fillText(t("slip_keep"), 72, height - 86);

        lastCanvas = canvas;
        return canvas;
    }

    function paintSlip(booking) {
        var img = document.getElementById("slip-image");
        if (!img) {
            return;
        }
        var canvas = drawSlip(booking);
        img.src = canvas.toDataURL("image/png");
    }

    function showSlip(booking) {
        var panel = document.getElementById("slip-panel");
        var form = document.getElementById("book-form");
        if (!panel) {
            return;
        }
        paintSlip(booking);
        if (form) {
            form.classList.add("d-none");
        }
        panel.classList.remove("d-none");
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () {
                paintSlip(booking);
            }).catch(function () {});
        }
    }

    function hideSlip() {
        var panel = document.getElementById("slip-panel");
        var form = document.getElementById("book-form");
        if (panel) {
            panel.classList.add("d-none");
        }
        if (form) {
            form.classList.remove("d-none");
        }
    }

    function saveSlip() {
        if (!lastCanvas) {
            return;
        }
        lastCanvas.toBlob(function (blob) {
            if (!blob) {
                return;
            }
            var file = new File([blob], "streetman-" + lastCode + ".png", { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: "StreetMan Barber Phuket",
                    text: t("slip_title") + " " + lastCode
                }).catch(function () {
                    downloadBlob(blob);
                });
                return;
            }
            downloadBlob(blob);
        }, "image/png");
    }

    function downloadBlob(blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "streetman-" + lastCode + ".png";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 1500);
    }

    window.StreetManSlip = {
        show: showSlip,
        hide: hideSlip,
        save: saveSlip
    };
})(window);
