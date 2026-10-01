(function () {
    "use strict";

    var dateEl = document.getElementById("income-date");
    var toastEl = document.getElementById("toast");
    var DAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

    function bangkokParts() {
        var parts = {};
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Bangkok",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date()).forEach(function (part) {
            parts[part.type] = part.value;
        });
        return parts;
    }

    function todayISO() {
        var parts = bangkokParts();
        return parts.year + "-" + parts.month + "-" + parts.day;
    }

    function addDays(iso, n) {
        var bits = String(iso).split("-").map(Number);
        var next = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2] + n));
        return next.toISOString().slice(0, 10);
    }

    function baht(value) {
        return "฿" + Number(value || 0).toLocaleString("th-TH");
    }

    function monthLabel(key) {
        var bits = String(key || "").split("-").map(Number);
        if (!bits[0] || !bits[1]) {
            return "เดือนนี้";
        }
        return new Date(bits[0], bits[1] - 1, 1).toLocaleDateString("th-TH", {
            month: "long",
            year: "numeric"
        });
    }

    function weekday(iso) {
        var bits = String(iso).split("-").map(Number);
        return DAY_TH[new Date(Date.UTC(bits[0], bits[1] - 1, bits[2])).getUTCDay()];
    }

    function shortDay(iso) {
        return String(iso || "").slice(8, 10);
    }

    function thaiDate(iso) {
        var bits = String(iso || "").split("-");
        if (bits.length !== 3) {
            return iso || "—";
        }
        return bits[2] + "/" + bits[1] + "/" + bits[0];
    }

    function isOwner(barber) {
        return barber && (barber.role === "owner" || barber.role === "admin" || barber.id === "rim");
    }

    function showToast(text) {
        toastEl.textContent = text;
        toastEl.classList.remove("d-none");
        window.setTimeout(function () {
            toastEl.classList.add("d-none");
        }, 3000);
    }

    function fillCard(el, title, period) {
        el.querySelector("span").textContent = title;
        el.querySelector("strong").textContent = baht(period.revenue);
        el.querySelector(".day-rev").textContent = "ตัดเสร็จ " + (period.done || 0) + " คน" +
            (period.uncollected ? " · ยังไม่ได้คิดเงิน " + (period.uncollected_count || 0) + " คิว " + baht(period.uncollected) : "");
    }


    function sourcesOf(period) {
        return (period && period.sources) || {
            shop: { done: 0, revenue: 0 },
            online: { done: 0, revenue: 0 }
        };
    }


    function renderCards(data) {
        var wrap = document.getElementById("income-cards");
        wrap.innerHTML =
            "<article class=\"summary-card\"><span>วันนี้</span><strong></strong><span class=\"day-rev\"></span></article>" +
            "<article class=\"summary-card\"><span>สัปดาห์นี้</span><strong></strong><span class=\"day-rev\"></span></article>" +
            "<article class=\"summary-card\"><span>เดือนนี้</span><strong></strong><span class=\"day-rev\"></span></article>";
        var cards = wrap.querySelectorAll(".summary-card");
        fillCard(cards[0], "วันนี้ · " + thaiDate(data.date), data.day);
        fillCard(cards[1], "สัปดาห์นี้", data.week);
        fillCard(cards[2], monthLabel((data.month && data.month.key) || data.date), data.month);
    }

    function renderBars(el, points, selected) {
        var max = 1;
        points.forEach(function (point) {
            if (point.value > max) {
                max = point.value;
            }
        });
        el.innerHTML = points.map(function (point) {
            var height = Math.max(4, Math.round((point.value / max) * 100));
            var on = selected && point.key === selected ? " is-on" : "";
            return "<div class=\"chart-col" + on + "\">" +
                "<em>" + (point.value ? baht(point.value) : "") + "</em>" +
                "<div class=\"chart-bar\" style=\"height:" + height + "%\"></div>" +
                "<span>" + point.label + "</span>" +
                "</div>";
        }).join("");
    }

    function renderCharts(data) {
        document.getElementById("week-range").textContent =
            thaiDate(data.week.from) + " – " + thaiDate(data.week.to);
        renderBars(document.getElementById("week-chart"), (data.week.series || []).map(function (row) {
            return {
                key: row.date,
                label: weekday(row.date) + " " + shortDay(row.date),
                value: row.revenue || 0
            };
        }), data.date);
        document.getElementById("month-chart-title").textContent =
            "กราฟ " + monthLabel((data.month && data.month.key) || data.date);
        renderBars(document.getElementById("month-chart"), (data.month.series || []).map(function (row) {
            return {
                key: row.date,
                label: shortDay(row.date),
                value: row.revenue || 0
            };
        }), data.date);
    }

    var shopPeriod = "day";
    var lastShopData = null;

    function renderShop(data) {
        var el = document.getElementById("shop-income");
        var link = document.getElementById("manage-link");
        var pos = document.getElementById("pos-link");
        var owner = isOwner(data.barber);
        if (link) {
            link.classList.toggle("d-none", !owner);
        }
        if (pos) {
            pos.classList.add("d-none");
        }
        document.getElementById("export-week").classList.toggle("d-none", !owner);
        document.getElementById("export-month").classList.toggle("d-none", !owner);
        if (!owner || !data.shop) {
            el.className = "shop-panel d-none";
            el.innerHTML = "";
            return;
        }
        lastShopData = data;
        el.className = "shop-panel inc";
        var shop = data.shop;
        var period = shop[shopPeriod] || {};
        var src = sourcesOf(period);
        var PERIODS = [["day", "วันนี้"], ["week", "สัปดาห์"], ["month", "เดือน"]];
        var periodLabel = shopPeriod === "day"
            ? "วันที่ " + thaiDate(data.date)
            : shopPeriod === "week"
                ? shortDay(shop.week.from) + " – " + shortDay(shop.week.to)
                : monthLabel((shop.month && shop.month.key) || data.date);

        var tabs = PERIODS.map(function (p) {
            return "<button type=\"button\" class=\"inc-tab" + (p[0] === shopPeriod ? " is-on" : "") + "\" data-period=\"" + p[0] + "\">" + p[1] + "</button>";
        }).join("");

        // Money in: cash / transfer / not yet charged, as one stacked bar plus tiles.
        var cash = period.cash || 0, transfer = period.transfer || 0, unpaid = period.uncollected || 0;
        var moneyTotal = cash + transfer + unpaid || 1;
        var seg = function (cls, value) {
            return value ? "<i class=\"" + cls + "\" style=\"width:" + (value / moneyTotal * 100).toFixed(1) + "%\"></i>" : "";
        };
        var tile = function (cls, emoji, label, amount, note) {
            return "<div class=\"inc-tile " + cls + "\"><span class=\"inc-tile-label\">" + emoji + " " + label + "</span>" +
                "<strong>" + baht(amount) + "</strong><span class=\"inc-tile-note\">" + note + "</span></div>";
        };
        var money =
            "<div class=\"inc-bar\">" + seg("is-cash", cash) + seg("is-transfer", transfer) + seg("is-unpaid", unpaid) + "</div>" +
            "<div class=\"inc-tiles\">" +
            tile("is-cash", "💵", "เงินสด", cash, (period.cash_count || 0) + " บิล") +
            tile("is-transfer", "📲", "โอน / QR", transfer, (period.transfer_count || 0) + " บิล") +
            (unpaid ? tile("is-unpaid", "⏳", "ค้างเก็บ", unpaid, (period.uncollected_count || 0) + " คิว") : "") +
            "</div>";

        var walkin = src.shop || {}, online = src.online || {};
        var channelTotal = (walkin.revenue || 0) + (online.revenue || 0) || 1;
        var channels =
            "<div class=\"inc-bar\">" +
            ((walkin.revenue || 0) ? "<i class=\"is-walkin\" style=\"width:" + ((walkin.revenue || 0) / channelTotal * 100).toFixed(1) + "%\"></i>" : "") +
            ((online.revenue || 0) ? "<i class=\"is-online\" style=\"width:" + ((online.revenue || 0) / channelTotal * 100).toFixed(1) + "%\"></i>" : "") +
            "</div>" +
            "<div class=\"inc-tiles\">" +
            tile("is-walkin", "🚶", "หน้าร้าน", walkin.revenue || 0, (walkin.done || 0) + " หัว") +
            tile("is-online", "🌐", "จองออนไลน์", online.revenue || 0, (online.done || 0) + " หัว") +
            "</div>";

        // Barbers ranked by takings for the chosen period.
        var barbers = (shop.barbers || []).map(function (b) {
            return { name: b.name, active: b.active, deleted: b.deleted, me: b.id === data.barber.id, p: b[shopPeriod] || {} };
        }).sort(function (a, b) { return (b.p.revenue || 0) - (a.p.revenue || 0); });
        var top = (barbers[0] && barbers[0].p.revenue) || 1;
        var MEDALS = ["🥇", "🥈", "🥉"];
        var rank = barbers.map(function (b, i) {
            var rev = b.p.revenue || 0;
            return "<li class=\"inc-rank-row" + (b.active ? "" : " is-off") + "\">" +
                "<span class=\"inc-rank-pos\">" + (rev && MEDALS[i] ? MEDALS[i] : (i + 1)) + "</span>" +
                "<div class=\"inc-rank-body\"><div class=\"inc-rank-top\"><b></b><strong>" + baht(rev) + "</strong></div>" +
                "<div class=\"inc-rank-track\"><i style=\"width:" + (rev / top * 100).toFixed(1) + "%\"></i></div>" +
                "<span class=\"inc-rank-note\">✂️ " + (b.p.done || 0) + " หัว" +
                (b.p.uncollected ? " · ⏳ ค้าง " + baht(b.p.uncollected) : "") + (b.deleted ? " · ลบบัญชีแล้ว" : b.active ? "" : " · ปิดงาน") + "</span></div></li>";
        }).join("");

        el.innerHTML =
            "<div class=\"inc-head\"><h2>🏪 ยอดทั้งร้าน</h2><div class=\"inc-tabs\">" + tabs + "</div></div>" +
            "<div class=\"inc-hero\"><span>" + periodLabel + "</span><strong>" + baht(period.revenue || 0) + "</strong>" +
            "<em>✂️ " + (period.done || 0) + " หัว</em></div>" +
            "<h3 class=\"inc-h\">💰 เงินเข้า</h3>" + money +
            "<h3 class=\"inc-h\">🧭 ช่องทาง</h3>" + channels +
            "<h3 class=\"inc-h\">💈 ช่าง</h3><ol class=\"inc-rank\">" + rank + "</ol>";
        el.querySelectorAll(".inc-rank-row b").forEach(function (nameEl, i) {
            nameEl.textContent = barbers[i].name + (barbers[i].me ? " (คุณ)" : "");
        });
        el.querySelectorAll(".inc-tab").forEach(function (btn) {
            btn.addEventListener("click", function () {
                shopPeriod = btn.getAttribute("data-period");
                renderShop(lastShopData);
            });
        });
    }

    function render(data) {
        document.getElementById("barber-name").textContent = "รายได้ของ " + data.barber.name;
        renderCards(data);
        renderCharts(data);
        renderShop(data);
    }

    async function load() {
        var data = await window.StreetManStore.income(dateEl.value || todayISO());
        render(data);
    }

    dateEl.value = todayISO();
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
    function saveBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    async function exportExcel(period) {
        try {
            var file = await window.StreetManStore.payrollFile(dateEl.value || todayISO(), period);
            saveBlob(file.blob, file.filename);
            showToast("ส่งออก Excel แล้ว เปิดไฟล์แล้วกรอกช่องยอดจ่ายช่างได้");
        } catch (err) {
            if (err && err.status === 401) {
                window.location.href = "login.html";
                return;
            }
            showToast(err && err.status === 403 ? "ส่งออกได้เฉพาะ Rim" : "ส่งออกไม่สำเร็จ ลองอีกครั้ง");
        }
    }

    document.getElementById("export-week").addEventListener("click", function () {
        exportExcel("week");
    });
    document.getElementById("export-month").addEventListener("click", function () {
        exportExcel("month");
    });
    document.getElementById("logout-btn").addEventListener("click", async function () {
        await window.StreetManStore.logout();
        window.location.href = "login.html";
    });

    window.StreetManStore.me().then(function (me) {
        if (me && (me.role === "cashier" || me.id === "pos")) {
            window.location.replace("pos.html");
            return;
        }
        return load();
    }).catch(function () {
        window.location.href = "login.html";
    });
})();
