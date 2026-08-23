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
        return barber && (barber.role === "owner" || barber.id === "rim");
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
        el.querySelector(".day-rev").textContent = "ตัดเสร็จ " + (period.done || 0) + " คน";
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

    function renderShop(data) {
        var el = document.getElementById("shop-income");
        var link = document.getElementById("manage-link");
        var owner = isOwner(data.barber);
        if (link) {
            link.classList.toggle("d-none", !owner);
        }
        document.getElementById("export-week").classList.toggle("d-none", !owner);
        document.getElementById("export-month").classList.toggle("d-none", !owner);
        if (!owner || !data.shop) {
            el.className = "shop-panel d-none";
            el.innerHTML = "";
            return;
        }
        var shop = data.shop;
        var rows = (shop.barbers || []).map(function () {
            return "<tr><td><strong></strong><span></span></td><td></td><td></td><td></td></tr>";
        }).join("");
        el.className = "shop-panel";
        el.innerHTML =
            "<h2>ยอดทั้งร้าน</h2>" +
            "<div class=\"summary-grid is-3\" id=\"shop-cards\"></div>" +
            "<h2 class=\"mt-4\">เปรียบเทียบช่าง · เดือนนี้</h2>" +
            "<div class=\"chart-bars is-people\" id=\"shop-chart\"></div>" +
            "<table class=\"shop-table\"><thead><tr><th>ช่าง</th><th>วันนี้</th><th>สัปดาห์</th><th>เดือน</th></tr></thead><tbody>" +
            rows + "</tbody></table>";
        var cards = el.querySelector("#shop-cards");
        cards.innerHTML =
            "<article class=\"summary-card\"><span>วันนี้ทั้งร้าน</span><strong></strong><span class=\"day-rev\"></span></article>" +
            "<article class=\"summary-card\"><span>สัปดาห์นี้ทั้งร้าน</span><strong></strong><span class=\"day-rev\"></span></article>" +
            "<article class=\"summary-card\"><span>เดือนนี้ทั้งร้าน</span><strong></strong><span class=\"day-rev\"></span></article>";
        var shopCards = cards.querySelectorAll(".summary-card");
        fillCard(shopCards[0], "วันนี้ทั้งร้าน", shop.day);
        fillCard(shopCards[1], "สัปดาห์นี้ทั้งร้าน", shop.week);
        fillCard(shopCards[2], monthLabel((shop.month && shop.month.key) || data.date) + " ทั้งร้าน", shop.month);
        renderBars(el.querySelector("#shop-chart"), (shop.barbers || []).map(function (row) {
            return {
                key: row.id,
                label: row.name,
                value: (row.month && row.month.revenue) || 0
            };
        }), data.barber.id);
        var bodyRows = el.querySelectorAll("tbody tr");
        (shop.barbers || []).forEach(function (row, index) {
            var tr = bodyRows[index];
            if (!tr) {
                return;
            }
            tr.querySelector("strong").textContent = row.name;
            tr.querySelector("span").textContent = (row.active ? "" : "ปิดงาน · ") + row.username;
            tr.children[1].innerHTML = (row.day.done || 0) + " คน<br><span>" + baht(row.day.revenue) + "</span>";
            tr.children[2].innerHTML = (row.week.done || 0) + " คน<br><span>" + baht(row.week.revenue) + "</span>";
            tr.children[3].innerHTML = (row.month.done || 0) + " คน<br><span>" + baht(row.month.revenue) + "</span>";
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

    window.StreetManStore.me().then(function () {
        return load();
    }).catch(function () {
        window.location.href = "login.html";
    });
})();
