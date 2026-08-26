(function (window) {
    "use strict";

    var lastCanvas = null;
    var lastCode = "SM";
    var lastToken = "";

    function t(key) {
        return window.StreetMan ? window.StreetMan.t(key) : key;
    }

    function lang() {
        return window.StreetMan ? window.StreetMan.detectLang() : "th";
    }

    function formatToken(token) {
        return String(token || "").toLowerCase().replace(/[^a-f0-9]/g, "").replace(/(.{4})/g, "$1-").replace(/-$/, "");
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
        return wrapParagraph(ctx, text, maxWidth, 3);
    }

    function wrapParagraph(ctx, text, maxWidth, maxLines) {
        maxLines = maxLines || 6;
        var lines = [];
        String(text || "").split(/\n/).forEach(function (para) {
            if (lines.length >= maxLines) {
                return;
            }
            var chars = Array.from(para);
            if (!chars.length) {
                lines.push("");
                return;
            }
            var current = "";
            chars.forEach(function (ch) {
                if (lines.length >= maxLines) {
                    return;
                }
                var test = current + ch;
                if (ctx.measureText(test).width > maxWidth && current) {
                    lines.push(current);
                    current = ch;
                } else {
                    current = test;
                }
            });
            if (current && lines.length < maxLines) {
                lines.push(current);
            }
        });
        return lines.slice(0, maxLines);
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

    function cancelPayload(token) {
        return "streetman-cancel:" + String(token || "").toLowerCase().replace(/[^a-f0-9]/g, "");
    }

    function loadImage(src) {
        return new Promise(function (resolve) {
            var image = new Image();
            image.onload = function () {
                resolve(image);
            };
            image.onerror = function () {
                resolve(null);
            };
            image.src = src;
        });
    }

    function makeQr(text) {
        return new Promise(function (resolve) {
            if (!text || !window.QRCode || !window.QRCode.toDataURL) {
                resolve(null);
                return;
            }
            window.QRCode.toDataURL(text, {
                width: 220,
                margin: 1,
                errorCorrectionLevel: "M",
                color: { dark: "#000000", light: "#ffffff" }
            }, function (err, url) {
                resolve(err ? null : url);
            });
        });
    }

    async function drawSlip(booking) {
        var canvas = document.createElement("canvas");
        var scale = 2;
        var width = 720;
        var height = 1980;
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
        var title = t("slip_title");
        var titleSize = 48;
        ctx.font = "700 " + titleSize + "px Oswald, 'Noto Sans Thai', sans-serif";
        while (titleSize > 28 && ctx.measureText(title).width > width - 128) {
            titleSize -= 2;
            ctx.font = "700 " + titleSize + "px Oswald, 'Noto Sans Thai', sans-serif";
        }
        ctx.fillText(title, 64, 128);

        lastToken = booking.cancel_token || "";
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
        var when = formatDate(booking.date) + "  ·  " + (booking.time || "-");
        if (booking.time && booking.end_time) {
            when = formatDate(booking.date) + "  ·  " + booking.time + "–" + booking.end_time;
        }
        y = row(ctx, t("slip_when"), when, y, width);
        if (booking.note) {
            y = row(ctx, t("label_note"), booking.note, y, width);
        }
        if (booking.cancel_token) {
            y = row(ctx, t("slip_cancel_code"), formatToken(booking.cancel_token), y, width);
            var qrUrl = await makeQr(cancelPayload(booking.cancel_token));
            var qrImage = qrUrl ? await loadImage(qrUrl) : null;
            if (qrImage) {
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(width - 236, y, 172, 172);
                ctx.drawImage(qrImage, width - 228, y + 8, 156, 156);
                ctx.fillStyle = "#8A8FA8";
                ctx.font = "20px 'Noto Sans Thai', sans-serif";
                ctx.fillText(t("cancel_upload"), 64, y + 40);
                y += 188;
            }
        }

        ctx.fillStyle = "#191C24";
        ctx.fillRect(48, height - 620, width - 96, 556);
        ctx.fillStyle = "#EB1616";
        ctx.font = "600 24px 'Noto Sans Thai', sans-serif";
        ctx.fillText(t("slip_show"), 72, height - 570);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "700 22px 'Noto Sans Thai', sans-serif";
        ctx.fillText(t("slip_wait_title"), 72, height - 528);
        ctx.fillStyle = "#C7CAD8";
        ctx.font = "italic 18px 'Noto Sans Thai', sans-serif";
        var noteY = height - 492;
        wrapParagraph(ctx, t("slip_wait_note"), width - 160, 12).forEach(function (line) {
            ctx.fillText(line, 72, noteY);
            noteY += 26;
        });
        ctx.font = "22px 'Noto Sans Thai', sans-serif";
        ctx.fillText("19/82 หมู่ 2 ต.วิชิต อ.เมือง จ.ภูเก็ต", 72, height - 158);
        ctx.fillText("062-525-8941  ·  11:00–20:00", 72, height - 122);
        ctx.fillText(t("slip_keep"), 72, height - 86);

        lastCanvas = canvas;
        return canvas;
    }

    async function paintSlip(booking) {
        var img = document.getElementById("slip-image");
        if (!img) {
            return;
        }
        var canvas = await drawSlip(booking);
        img.src = canvas.toDataURL("image/png");
    }

    function showSlip(booking) {
        var panel = document.getElementById("slip-panel");
        var form = document.getElementById("book-form");
        if (!panel) {
            return;
        }
        paintSlip(booking);
        var cancel = document.getElementById("slip-cancel");
        if (cancel) {
            cancel.href = booking.cancel_token
                ? "cancel.html?t=" + encodeURIComponent(booking.cancel_token)
                : "cancel.html";
        }
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
        save: saveSlip,
        token: function () {
            return lastToken;
        }
    };
})(window);
