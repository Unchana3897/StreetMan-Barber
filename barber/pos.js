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
    var PRICES = {
        haircut: 300,
        beard: 200,
        shave: 200,
        dye: 150,
        mustache: 500,
        stacking: 1000
    };
    var SERVICE_ORDER = ["haircut", "beard", "shave", "dye", "mustache", "stacking"];
    var PAY = { cash: "เงินสด", transfer: "โอน / QR" };

    var toastEl = document.getElementById("toast");
    var openList = document.getElementById("open-list");
    var paidList = document.getElementById("paid-list");
    var openEmpty = document.getElementById("open-empty");
    var checkoutEl = document.getElementById("checkout");
    var receiptEl = document.getElementById("receipt");
    var latest = { barber: {}, barbers: [], open: [], paid: [], date: "" };
    var mode = "idle";
    var selected = null;
    var extras = [];
    var walkin = {
        service: "haircut",
        barber_id: ""
    };

    function todayISO() {
        var parts = {};
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Bangkok",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date()).forEach(function (part) {
            parts[part.type] = part.value;
        });
        return parts.year + "-" + parts.month + "-" + parts.day;
    }

    function baht(value) {
        return "฿" + Number(value || 0).toLocaleString("th-TH");
    }

    function showToast(message) {
        toastEl.textContent = message;
        toastEl.classList.remove("d-none");
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(function () {
            toastEl.classList.add("d-none");
        }, 2800);
    }

    function totalFor(service, extraIds) {
        return (PRICES[service] || 0) + (extraIds || []).reduce(function (sum, item) {
            return sum + (PRICES[item] || 0);
        }, 0);
    }

    function isOwner(barber) {
        return barber && (barber.role === "owner" || barber.id === "rim" || barber.username === "rim");
    }

    function ticketCard(row, paid) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pos-ticket" + (selected && selected.id === row.id ? " is-on" : "");
        btn.innerHTML =
            "<strong></strong>" +
            "<span class=\"pos-ticket-meta\"></span>" +
            "<span class=\"pos-ticket-pay\"></span>";
        btn.querySelector("strong").textContent = row.customer_name;
        btn.querySelector(".pos-ticket-meta").textContent =
            (row.time || "") + " · " + (SERVICES[row.service] || row.service) +
            (row.barber_name ? " · " + row.barber_name : "");
        btn.querySelector(".pos-ticket-pay").textContent = paid
            ? (PAY[row.payment_method] || "จ่ายแล้ว") + " " + baht(row.amount)
            : baht(row.amount);
        btn.addEventListener("click", function () {
            mode = paid ? "paid" : "queue";
            selected = row;
            extras = (row.extras || []).slice();
            renderCheckout();
            renderLists();
        });
        return btn;
    }

    function renderLists() {
        openList.innerHTML = "";
        latest.open.forEach(function (row) {
            openList.appendChild(ticketCard(row, false));
        });
        openEmpty.classList.toggle("d-none", latest.open.length > 0);
        paidList.innerHTML = "";
        latest.paid.slice().reverse().forEach(function (row) {
            paidList.appendChild(ticketCard(row, true));
        });
    }

    function extraButtons(service, wrap) {
        SERVICE_ORDER.forEach(function (item) {
            if (item === service) {
                return;
            }
            var on = extras.indexOf(item) !== -1;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "pos-chip" + (on ? " is-on" : "");
            btn.textContent = (on ? "✓ " : "+ ") + SERVICES[item] + " " + baht(PRICES[item]);
            btn.addEventListener("click", function () {
                if (on) {
                    extras = extras.filter(function (extra) { return extra !== item; });
                } else {
                    extras = extras.concat(item);
                }
                renderCheckout();
            });
            wrap.appendChild(btn);
        });
    }

    function payButtons(wrap, onPay) {
        var cash = document.createElement("button");
        cash.type = "button";
        cash.className = "btn btn-primary pos-pay";
        cash.textContent = "รับเงินสด " + baht(onPay.total);
        cash.addEventListener("click", function () { onPay("cash"); });
        var transfer = document.createElement("button");
        transfer.type = "button";
        transfer.className = "btn btn-outline-light pos-pay";
        transfer.textContent = "โอน / QR " + baht(onPay.total);
        transfer.addEventListener("click", function () { onPay("transfer"); });
        wrap.appendChild(cash);
        wrap.appendChild(transfer);
    }

    function renderCheckout() {
        checkoutEl.innerHTML = "";
        if (mode === "idle") {
            checkoutEl.innerHTML = "<p class=\"staff-copy mb-0\">เลือกคิวซ้ายมือ หรือกดวอล์กอิน</p>";
            return;
        }
        if (mode === "walkin") {
            var walk = document.createElement("div");
            walk.innerHTML = "<h2>วอล์กอิน</h2>";
            checkoutEl.appendChild(walk);
            if (isOwner(latest.barber) && latest.barbers.length > 1) {
                var barberLabel = document.createElement("label");
                barberLabel.textContent = "ช่าง";
                var barberSel = document.createElement("select");
                barberSel.className = "form-control pos-input";
                latest.barbers.forEach(function (row) {
                    var opt = document.createElement("option");
                    opt.value = row.id;
                    opt.textContent = row.name;
                    barberSel.appendChild(opt);
                });
                barberSel.value = walkin.barber_id || latest.barber.id;
                walkin.barber_id = barberSel.value;
                barberSel.addEventListener("change", function () {
                    walkin.barber_id = barberSel.value;
                });
                checkoutEl.appendChild(barberLabel);
                checkoutEl.appendChild(barberSel);
            }
            var svcLabel = document.createElement("label");
            svcLabel.textContent = "บริการหลัก";
            checkoutEl.appendChild(svcLabel);
            var svcWrap = document.createElement("div");
            SERVICE_ORDER.forEach(function (item) {
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "pos-chip" + (walkin.service === item ? " is-on" : "");
                btn.textContent = SERVICES[item] + " " + baht(PRICES[item]);
                btn.addEventListener("click", function () {
                    walkin.service = item;
                    extras = extras.filter(function (extra) { return extra !== item; });
                    renderCheckout();
                });
                svcWrap.appendChild(btn);
            });
            checkoutEl.appendChild(svcWrap);
            var extraLabel = document.createElement("p");
            extraLabel.className = "staff-copy mt-3 mb-2";
            extraLabel.textContent = "บวกบริการเพิ่ม";
            checkoutEl.appendChild(extraLabel);
            var extraWrap = document.createElement("div");
            extraButtons(walkin.service, extraWrap);
            checkoutEl.appendChild(extraWrap);
            var sum = document.createElement("p");
            sum.className = "pos-total";
            sum.textContent = "ยอด " + baht(totalFor(walkin.service, extras));
            checkoutEl.appendChild(sum);
            var actions = document.createElement("div");
            actions.className = "pos-pay-row";
            payButtons(actions, function (method) {
                submitWalkin(method);
            });
            checkoutEl.appendChild(actions);
            return;
        }

        var row = selected;
        if (!row) {
            checkoutEl.innerHTML = "<p class=\"staff-copy mb-0\">เลือกคิวซ้ายมือ หรือกดวอล์กอิน</p>";
            return;
        }
        var box = document.createElement("div");
        box.innerHTML =
            "<p class=\"staff-kicker mb-1\">" + (row.time || "") + (row.barber_name ? " · " + row.barber_name : "") + "</p>" +
            "<h2></h2>" +
            "<p class=\"queue-meta\"></p>";
        box.querySelector("h2").textContent = row.customer_name;
        box.querySelector(".queue-meta").textContent =
            (SERVICES[row.service] || row.service) + " · " + (row.phone || "");
        checkoutEl.appendChild(box);
        if (mode === "paid") {
            var paid = document.createElement("p");
            paid.className = "pos-total";
            paid.textContent = (PAY[row.payment_method] || "จ่ายแล้ว") + " " + baht(row.amount);
            checkoutEl.appendChild(paid);
            var reprint = document.createElement("button");
            reprint.type = "button";
            reprint.className = "btn btn-primary pos-pay";
            reprint.textContent = "ดูใบเสร็จอีกครั้ง";
            reprint.addEventListener("click", function () {
                showReceipt(row);
            });
            checkoutEl.appendChild(reprint);
            return;
        }
        var extraLabel = document.createElement("p");
        extraLabel.className = "staff-copy mt-3 mb-2";
        extraLabel.textContent = "บวกบริการตอนตัด";
        checkoutEl.appendChild(extraLabel);
        var extraWrap = document.createElement("div");
        extraButtons(row.service, extraWrap);
        checkoutEl.appendChild(extraWrap);
        var sum = document.createElement("p");
        sum.className = "pos-total";
        sum.textContent = "ยอด " + baht(totalFor(row.service, extras));
        checkoutEl.appendChild(sum);
        var actions = document.createElement("div");
        actions.className = "pos-pay-row";
        payButtons(actions, function (method) {
            submitPay(row.id, method);
        });
        checkoutEl.appendChild(actions);
    }

    function errorText(err) {
        var code = err && (err.body && err.body.error || err.message);
        if (code === "extra_overlap" || code === "slot_taken") {
            return "คิดเงินไม่ได้ คิวนี้จะชนกับคิวอื่น";
        }
        if (code === "bad_name") {
            return "ใส่ชื่อลูกค้าก่อน";
        }
        if (code === "bad_phone") {
            return "เบอร์โทรไม่ถูกต้อง";
        }
        return "คิดเงินไม่สำเร็จ ลองอีกครั้ง";
    }

    async function submitPay(id, method) {
        try {
            var data = await window.StreetManStore.payBooking(id, { method: method, extras: extras });
            showToast("รับเงินแล้ว");
            showReceipt(data.booking);
            mode = "idle";
            selected = null;
            extras = [];
            await load();
        } catch (err) {
            showToast(errorText(err));
        }
    }

    async function submitWalkin(method) {
        try {
            var data = await window.StreetManStore.walkinPay({
                customer_name: "วอล์กอิน",
                phone: "",
                service: walkin.service,
                extras: extras,
                method: method,
                barber_id: walkin.barber_id || latest.barber.id
            });
            showToast("รับเงินวอล์กอินแล้ว");
            showReceipt(data.booking);
            walkin = { service: "haircut", barber_id: latest.barber.id };
            extras = [];
            mode = "idle";
            selected = null;
            await load();
        } catch (err) {
            showToast(errorText(err));
        }
    }

    function showReceipt(row) {
        var extraText = (row.extras || []).map(function (item) {
            return SERVICES[item] || item;
        }).join(" + ");
        var lines = [
            SERVICES[row.service] || row.service,
            extraText ? "+ " + extraText : ""
        ].filter(Boolean);
        receiptEl.className = "pos-receipt";
        receiptEl.innerHTML =
            "<div class=\"pos-receipt-card\">" +
            "<p class=\"staff-kicker\">STREETMAN BARBER PHUKET</p>" +
            "<h2>ใบเสร็จ</h2>" +
            "<p>" + (row.customer_name || "-") + "</p>" +
            "<p class=\"queue-meta\">" + (row.phone && row.phone !== "walkin" ? row.phone : "วอล์กอิน") + "</p>" +
            "<p>" + (row.date || "") + " · " + (row.time || "") + "</p>" +
            "<p>" + (row.barber_name || "") + "</p>" +
            "<p>" + lines.join("<br>") + "</p>" +
            "<p class=\"pos-total\">" + baht(row.amount) + "</p>" +
            "<p>" + (PAY[row.payment_method] || "") + "</p>" +
            "<button type=\"button\" class=\"btn btn-primary pos-pay\" id=\"receipt-print\">พิมพ์ / เซฟ</button>" +
            "<button type=\"button\" class=\"btn btn-outline-light pos-pay\" id=\"receipt-close\">ปิด</button>" +
            "</div>";
        document.getElementById("receipt-close").addEventListener("click", function () {
            receiptEl.className = "pos-receipt d-none";
            receiptEl.innerHTML = "";
        });
        document.getElementById("receipt-print").addEventListener("click", function () {
            document.body.classList.add("pos-printing");
            window.setTimeout(function () {
                window.print();
            }, 50);
        });
    }

    async function load() {
        var data = await window.StreetManStore.pos(todayISO());
        latest = data;
        document.getElementById("barber-name").textContent = "POS ของ " + data.barber.name;
        if (!walkin.barber_id) {
            walkin.barber_id = data.barber.id;
        }
        renderLists();
        renderCheckout();
    }

    async function boot() {
        var me = await window.StreetManStore.me();
        if (!isOwner(me)) {
            window.location.replace("dashboard.html");
            return;
        }
        document.getElementById("refresh-btn").addEventListener("click", function () {
            load();
            showToast("รีเฟรชแล้ว");
        });
        document.getElementById("logout-btn").addEventListener("click", async function () {
            await window.StreetManStore.logout();
            window.location.href = "login.html";
        });
        document.getElementById("walkin-btn").addEventListener("click", function () {
            mode = "walkin";
            selected = null;
            extras = [];
            renderLists();
            renderCheckout();
        });
        window.addEventListener("afterprint", function () {
            document.body.classList.remove("pos-printing");
        });
        if (window.matchMedia) {
            window.matchMedia("print").addEventListener("change", function (event) {
                if (!event.matches) {
                    document.body.classList.remove("pos-printing");
                }
            });
        }
        await load();
        setInterval(load, 20000);
    }

    boot().catch(function (err) {
        if (err && err.status === 401) {
            window.sessionStorage.setItem("sm_after_login", "pos.html");
            window.location.href = "login.html";
            return;
        }
        if (err && err.status === 403) {
            window.location.replace("dashboard.html");
            return;
        }
        showToast("เชื่อมต่อร้านไม่สำเร็จ เปิดใหม่อีกครั้ง");
    });
})();
