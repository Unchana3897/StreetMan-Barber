(function () {
    "use strict";

    // Menu comes from the server (owner edits it on "จัดการช่าง"). Filled in boot().
    var SERVICES = {};      // id -> name (includes hidden services, for old bills)
    var PRICES = {};        // id -> today's price
    var SERVICE_ORDER = []; // services that can be sold today, in menu order

    async function loadMenu() {
        window.StreetManStore._services = null; // always the latest menu
        var list = await window.StreetManStore.services(true);
        SERVICES = {};
        PRICES = {};
        SERVICE_ORDER = [];
        list.forEach(function (svc) {
            SERVICES[svc.id] = svc.name;
            PRICES[svc.id] = svc.price;
            if (svc.active) {
                SERVICE_ORDER.push(svc.id);
            }
        });
        if (SERVICE_ORDER.indexOf(walkin.service) === -1) {
            walkin.service = SERVICE_ORDER[0] || "";
        }
    }
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
    var edit = { service: "", method: "" };

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

    function bahtPlain(value) {
        return Number(value || 0).toLocaleString("th-TH");
    }

    function esc(text) {
        return String(text == null ? "" : text).replace(/[&<>"]/g, function (ch) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch];
        });
    }

    function thaiWhen(date, time) {
        var parts = String(date || "").split("-");
        var day = parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : (date || "");
        return day + (time ? " " + time : "");
    }

    function isWalkinRow(row) {
        return row.phone === "walkin" || row.note === "Walk in" || row.note === "walk-in" || row.customer_name === "วอล์กอิน";
    }

    function extraPrice(item) {
        if (item && typeof item === "object") {
            return Number(item.amount) || 0;
        }
        return PRICES[item] || 0;
    }

    function extraName(item) {
        if (item && typeof item === "object") {
            return "อื่นๆ";
        }
        return SERVICES[item] || item;
    }

    function isOtherExtra(item) {
        return Boolean(item && typeof item === "object");
    }

    function receiptItems(row) {
        if (row.items && row.items.length) {
            return row.items.map(function (item) { return { name: item.name, price: item.price }; });
        }
        var items = [{
            name: SERVICES[row.service] || row.service,
            price: PRICES[row.service] || 0
        }];
        (row.extras || []).forEach(function (item) {
            items.push({
                name: extraName(item),
                price: extraPrice(item)
            });
        });
        return items;
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
            return sum + extraPrice(item);
        }, 0);
    }

    function isCashier(barber) {
        return barber && (barber.role === "cashier" || barber.id === "pos" || barber.username === "pos");
    }

    function isPosUser(barber) {
        return isCashier(barber);
    }

    // Barber pressed "done" but nobody has taken the money yet.
    function readyToPay(row) {
        return row.status === "done" && !row.payment_method;
    }

    function ticketCard(row, paid) {
        var btn = document.createElement("button");
        btn.type = "button";
        var ready = !paid && readyToPay(row);
        btn.className = "pos-ticket" + (ready ? " is-ready" : "") + (selected && selected.id === row.id ? " is-on" : "");
        btn.innerHTML =
            "<strong></strong>" +
            "<span class=\"pos-ticket-meta\"></span>" +
            "<span class=\"pos-ticket-pay\"></span>";
        btn.querySelector("strong").textContent = row.customer_name;
        var otherDay = row.date && row.date !== todayISO();
        btn.querySelector(".pos-ticket-meta").textContent =
            (otherDay ? thaiWhen(row.date).slice(0, 5) + " " : "") +
            (row.time || "") + " · " + (row.service_name || SERVICES[row.service] || row.service) +
            (row.barber_name ? " · " + row.barber_name : "");
        btn.querySelector(".pos-ticket-pay").textContent = paid
            ? (PAY[row.payment_method] || "จ่ายแล้ว") + " " + baht(row.amount)
            : baht(row.amount);
        if (paid && row.last_edit && row.last_edit.status === "pending") {
            var review = document.createElement("span");
            review.className = "pos-ticket-badge is-review";
            review.textContent = "รอตรวจ";
            btn.classList.add("is-ready");
            btn.appendChild(review);
        }
        if (ready) {
            var badge = document.createElement("span");
            badge.className = "pos-ticket-badge";
            badge.textContent = "คิดเงิน";
            btn.appendChild(badge);
        }
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
        // Finished cuts waiting for payment go to the top.
        latest.open.slice().sort(function (a, b) {
            return (readyToPay(b) ? 1 : 0) - (readyToPay(a) ? 1 : 0);
        }).forEach(function (row) {
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
        var otherRow = document.createElement("div");
        otherRow.className = "pos-other";
        var input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.step = "1";
        input.inputMode = "numeric";
        input.placeholder = "ยอดอื่นๆ";
        input.className = "form-control pos-input pos-other-input";
        input.setAttribute("aria-label", "ยอดอื่นๆ");
        var add = document.createElement("button");
        add.type = "button";
        add.className = "btn btn-primary pos-other-add";
        add.textContent = "+ อื่นๆ";
        add.addEventListener("click", function () {
            var n = Math.round(Number(input.value));
            if (!(n >= 1 && n <= 50000)) {
                showToast("ใส่ยอดอื่นๆ เป็นตัวเลข");
                return;
            }
            extras = extras.concat({ type: "other", amount: n });
            renderCheckout();
        });
        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                add.click();
            }
        });
        otherRow.appendChild(input);
        otherRow.appendChild(add);
        wrap.appendChild(otherRow);
        extras.filter(isOtherExtra).forEach(function (item) {
            var chip = document.createElement("button");
            chip.type = "button";
            chip.className = "pos-chip is-on";
            chip.textContent = "✓ อื่นๆ " + baht(item.amount);
            chip.addEventListener("click", function () {
                var removed = false;
                extras = extras.filter(function (extra) {
                    if (!removed && extra === item) {
                        removed = true;
                        return false;
                    }
                    return true;
                });
                renderCheckout();
            });
            wrap.appendChild(chip);
        });
    }

    function promptPayReady() {
        return Boolean(latest.promptpay && window.PromptPay && window.QRCode && window.QRCode.toDataURL);
    }

    function qrDataUrl(text) {
        return window.QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 2, width: 560 });
    }

    // preview() returns the bill to show before payment (same shape as a booking row).
    function payButtons(wrap, total, onPay, preview) {
        var cash = document.createElement("button");
        cash.type = "button";
        cash.className = "btn btn-primary pos-pay";
        cash.textContent = "รับเงินสด " + baht(total);
        cash.addEventListener("click", function () { onPay("cash"); });
        var transfer = document.createElement("button");
        transfer.type = "button";
        transfer.className = "btn btn-outline-light pos-pay";
        transfer.textContent = "โอน / QR " + baht(total);
        transfer.addEventListener("click", function () {
            if (promptPayReady() && preview) {
                showReceipt(preview(), {
                    pending: true,
                    onConfirm: function () { return onPay("transfer", { quiet: true }); }
                });
            } else {
                onPay("transfer");
            }
        });
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
            if (latest.barbers.length > 0) {
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
            payButtons(actions, totalFor(walkin.service, extras), function (method, opts) {
                return submitWalkin(method, opts);
            }, function () {
                var chair = latest.barbers.filter(function (b) { return b.id === (walkin.barber_id || latest.barber.id); })[0];
                return {
                    customer_name: "วอล์กอิน",
                    service: walkin.service,
                    extras: extras.slice(),
                    barber_name: chair ? chair.name : "",
                    date: todayISO(),
                    time: nowTime(),
                    amount: totalFor(walkin.service, extras)
                };
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
            "<p class=\"staff-kicker mb-1\">" + (row.time || "") + (row.barber_name ? " · " + row.barber_name : "") + (readyToPay(row) ? " · ตัดเสร็จแล้ว รอคิดเงิน" : "") + "</p>" +
            "<h2></h2>" +
            "<p class=\"queue-meta\"></p>";
        box.querySelector("h2").textContent = row.customer_name;
        box.querySelector(".queue-meta").textContent =
            (row.service_name || SERVICES[row.service] || row.service) + " · " + (row.phone || "");
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
            var editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "btn btn-outline-light pos-pay mt-2";
            editBtn.textContent = "แก้ไขบิล (คิดเงินผิด)";
            editBtn.addEventListener("click", function () {
                mode = "edit";
                edit = { service: row.service, method: row.payment_method };
                extras = (row.extras || []).slice();
                renderCheckout();
            });
            checkoutEl.appendChild(editBtn);
            if (row.last_edit) {
                var edited = document.createElement("p");
                edited.className = "staff-copy mt-2 mb-0";
                edited.textContent = editNote(row.last_edit);
                checkoutEl.appendChild(edited);
                if (row.last_edit.status === "pending") {
                    editBtn.disabled = true;
                    editBtn.textContent = "แก้ไขซ้ำไม่ได้ จนกว่าเจ้าของร้านจะตรวจ";
                }
            }
            return;
        }
        if (mode === "edit") {
            renderEdit(row);
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
        payButtons(actions, totalFor(row.service, extras), function (method, opts) {
            return submitPay(row.id, method, opts);
        }, function () {
            return Object.assign({}, row, { extras: extras.slice(), amount: totalFor(row.service, extras) });
        });
        checkoutEl.appendChild(actions);
    }

    function editNote(lastEdit) {
        if (!lastEdit) {
            return "";
        }
        return lastEdit.status === "pending"
            ? "แก้ไขบิลแล้ว · รอเจ้าของร้านตรวจ"
            : "แก้ไขบิลแล้ว · อ้างอิง " + (lastEdit.code || "#" + lastEdit.id);
    }

    async function saveEdit(row, digits, button) {
        button.disabled = true;
        try {
            var data = await window.StreetManStore.editBill(row.id, {
                service: edit.service,
                extras: extras,
                method: edit.method,
                code: digits,
                reason: edit.reason || ""
            });
            showToast(digits ? "แก้ไขบิลแล้ว" : "แก้ไขบิลแล้ว รอเจ้าของร้านตรวจ");
            edit = { service: "", method: "" };
            mode = "idle";
            selected = null;
            extras = [];
            await load();
            showReceipt(data.booking);
        } catch (err) {
            button.disabled = false;
            showToast(errorText(err));
        }
    }

    // Fix a paid bill. With the owner's one-time code it is final; without it
    // (owner unreachable) it is saved and waits for the owner to review.
    function renderEdit(row) {
        var head = document.createElement("p");
        head.className = "staff-copy mt-2";
        head.textContent = "แก้ไขบิลที่จ่ายแล้ว ยอดเดิม " + baht(row.amount) + " (" + (PAY[row.payment_method] || "") + ")";
        checkoutEl.appendChild(head);

        var svcLabel = document.createElement("label");
        svcLabel.textContent = "บริการหลัก";
        checkoutEl.appendChild(svcLabel);
        var svcWrap = document.createElement("div");
        SERVICE_ORDER.forEach(function (item) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "pos-chip" + (edit.service === item ? " is-on" : "");
            btn.textContent = SERVICES[item] + " " + baht(PRICES[item]);
            btn.addEventListener("click", function () {
                edit.service = item;
                extras = extras.filter(function (extra) { return extra !== item; });
                renderCheckout();
            });
            svcWrap.appendChild(btn);
        });
        checkoutEl.appendChild(svcWrap);

        var extraLabel = document.createElement("p");
        extraLabel.className = "staff-copy mt-3 mb-2";
        extraLabel.textContent = "บริการเสริม";
        checkoutEl.appendChild(extraLabel);
        var extraWrap = document.createElement("div");
        extraButtons(edit.service, extraWrap);
        checkoutEl.appendChild(extraWrap);

        var payLabel = document.createElement("p");
        payLabel.className = "staff-copy mt-3 mb-2";
        payLabel.textContent = "วิธีจ่าย";
        checkoutEl.appendChild(payLabel);
        var payWrap = document.createElement("div");
        ["cash", "transfer"].forEach(function (key) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "pos-chip" + (edit.method === key ? " is-on" : "");
            btn.textContent = PAY[key];
            btn.addEventListener("click", function () {
                edit.method = key;
                renderCheckout();
            });
            payWrap.appendChild(btn);
        });
        checkoutEl.appendChild(payWrap);

        var newTotal = totalFor(edit.service, extras);
        var sum = document.createElement("p");
        sum.className = "pos-total";
        sum.textContent = baht(row.amount) + " → " + baht(newTotal);
        checkoutEl.appendChild(sum);
        var diff = newTotal - Number(row.amount || 0);
        if (diff) {
            var diffNote = document.createElement("p");
            diffNote.className = "staff-copy";
            diffNote.textContent = diff > 0 ? "เก็บเงินลูกค้าเพิ่ม " + baht(diff) : "คืนเงินลูกค้า " + baht(-diff);
            checkoutEl.appendChild(diffNote);
        }

        var reason = document.createElement("input");
        reason.className = "form-control pos-input mb-2";
        reason.placeholder = "เหตุผล เช่น กดบริการผิด (ไม่บังคับ)";
        reason.maxLength = 200;
        reason.value = edit.reason || "";
        reason.addEventListener("input", function () { edit.reason = reason.value; });
        checkoutEl.appendChild(reason);
        var code = document.createElement("input");
        code.className = "form-control pos-input pos-edit-code";
        code.placeholder = "รหัสอ้างอิงจากเจ้าของร้าน 6 หลัก";
        code.inputMode = "numeric";
        code.autocomplete = "one-time-code";
        code.maxLength = 7;
        code.value = edit.code || "";
        code.addEventListener("input", function () { edit.code = code.value; });
        checkoutEl.appendChild(code);

        var actions = document.createElement("div");
        actions.className = "pos-pay-row mt-3";
        var save = document.createElement("button");
        save.type = "button";
        save.className = "btn btn-primary pos-pay";
        save.textContent = "บันทึกการแก้ไข";
        save.addEventListener("click", function () {
            var digits = String(edit.code || "").replace(/\D/g, "");
            if (digits.length !== 6) {
                showToast("ใส่รหัสอ้างอิง 6 หลักจากเจ้าของร้านก่อน");
                code.focus();
                return;
            }
            saveEdit(row, digits, save);
        });
        var cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "btn btn-outline-light pos-pay";
        cancel.textContent = "ยกเลิก";
        cancel.addEventListener("click", function () {
            mode = "paid";
            edit = { service: "", method: "" };
            extras = (row.extras || []).slice();
            renderCheckout();
        });
        actions.appendChild(save);
        actions.appendChild(cancel);
        checkoutEl.appendChild(actions);

        var noOwner = document.createElement("button");
        noOwner.type = "button";
        noOwner.className = "btn btn-link pos-no-owner";
        noOwner.textContent = "ติดต่อเจ้าของร้านไม่ได้ · บันทึกให้เจ้าของตรวจทีหลัง";
        noOwner.addEventListener("click", function () {
            if (String(edit.reason || "").trim().length < 3) {
                showToast("ถ้าไม่มีรหัส ต้องใส่เหตุผลที่แก้บิล");
                reason.focus();
                return;
            }
            if (!window.confirm("บันทึกการแก้ไขโดยไม่มีรหัส?\nบิลนี้จะรอเจ้าของร้านตรวจ ถ้าไม่อนุมัติ บิลจะกลับเป็นยอดเดิม")) {
                return;
            }
            saveEdit(row, "", noOwner);
        });
        checkoutEl.appendChild(noOwner);
    }

    function errorText(err) {
        var code = err && (err.body && err.body.error || err.message);
        if (code === "extra_overlap" || code === "slot_taken") {
            return "คิดเงินไม่ได้ คิวนี้จะชนกับคิวอื่น";
        }
        if (code === "bad_name") {
            return "ใส่ชื่อลูกค้าก่อน";
        }
        if (code === "bad_code") {
            return "รหัสอ้างอิงไม่ถูกต้อง หมดอายุ หรือถูกใช้ไปแล้ว ขอรหัสใหม่จากเจ้าของร้าน";
        }
        if (code === "too_many_attempts") {
            return "ใส่รหัสผิดหลายครั้ง รอ 15 นาทีแล้วลองใหม่";
        }
        if (code === "already_paid") {
            return "บิลนี้จ่ายไปแล้ว อาจมีคนกดรับเงินจากอีกเครื่อง ห้ามเก็บเงินซ้ำ";
        }
        if (code === "reason_required") {
            return "ถ้าไม่มีรหัส ต้องใส่เหตุผลที่แก้บิล";
        }
        if (code === "pending_limit") {
            return "วันนี้แก้บิลแบบไม่มีรหัสครบ 3 ครั้งแล้ว ต้องใช้รหัสจากเจ้าของร้าน";
        }
        if (code === "edit_pending") {
            return "บิลนี้มีการแก้ไขที่รอเจ้าของร้านตรวจอยู่";
        }
        if (code === "not_paid") {
            return "บิลนี้ยังไม่ได้จ่าย แก้ไขตอนคิดเงินได้เลย";
        }
        if (code === "bad_phone") {
            return "เบอร์โทรไม่ถูกต้อง";
        }
        return "คิดเงินไม่สำเร็จ ลองอีกครั้ง";
    }

    async function submitPay(id, method, opts) {
        try {
            var data = await window.StreetManStore.payBooking(id, { method: method, extras: extras });
            showToast("รับเงินแล้ว");
            if (!(opts && opts.quiet)) {
                showReceipt(data.booking);
            }
            mode = "idle";
            selected = null;
            extras = [];
            await load();
            return true;
        } catch (err) {
            showToast(errorText(err));
            if (err && err.body && err.body.error === "already_paid") {
                mode = "idle";
                selected = null;
                extras = [];
                await load();
            }
            return false;
        }
    }

    async function submitWalkin(method, opts) {
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
            if (!(opts && opts.quiet)) {
                showReceipt(data.booking);
            }
            walkin = { service: "haircut", barber_id: (latest.barbers[0] && latest.barbers[0].id) || "" };
            extras = [];
            mode = "idle";
            selected = null;
            await load();
            return true;
        } catch (err) {
            showToast(errorText(err));
            return false;
        }
    }

    // Receipt roll width for this POS device (80mm or 58mm thermal paper).
    var PAPER_KEY = "sm_receipt_paper";

    function paperWidth() {
        try {
            return window.localStorage.getItem(PAPER_KEY) === "58" ? 58 : 80;
        } catch (err) {
            return 80;
        }
    }

    // Size the printed page to the receipt itself: roll width x measured slip height.
    function fitPrintPage() {
        var width = paperWidth();
        document.body.classList.add("pos-printing");
        document.body.classList.toggle("paper-58", width === 58);
        document.body.style.setProperty("--paper", width + "mm");
        var slip = receiptEl.querySelector(".pos-slip");
        var heightMm = slip ? Math.ceil(slip.getBoundingClientRect().height * 25.4 / 96) + 2 : 150;
        var style = document.getElementById("pos-page-size");
        if (!style) {
            style = document.createElement("style");
            style.id = "pos-page-size";
            document.head.appendChild(style);
        }
        style.textContent = "@page { size: " + width + "mm " + heightMm + "mm; margin: 0; }";
    }

    function nowTime() {
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    }

    // opts.pending: bill before payment. The QR carries the amount, and
    // "ได้รับเงินแล้ว" appears only after the bill has been printed.
    function showReceipt(row, opts) {
        opts = opts || {};
        var pending = Boolean(opts.pending);
        var items = receiptItems(row);
        var walkinRow = isWalkinRow(row);
        var customer = walkinRow ? "วอล์กอิน" : (row.customer_name || "-");
        var phone = walkinRow ? "-" : (row.phone || "-");
        var rowsHtml = items.map(function (item) {
            return "<tr><td>" + esc(item.name) + "</td><td>1</td><td>" + bahtPlain(item.price) + "</td></tr>";
        }).join("");
        receiptEl.className = "pos-receipt";
        receiptEl.innerHTML =
            "<div class=\"pos-receipt-card\">" +
            "<div class=\"pos-slip\">" +
            "<img class=\"pos-slip-logo\" src=\"../img/favicon-192.png\" alt=\"StreetMan Barber\">" +
            "<p class=\"pos-slip-shop\">STREETMAN BARBER PHUKET</p>" +
            "<h2>" + (pending ? "บิลค่าบริการ" : "ใบเสร็จรับเงิน") + "</h2>" +
            "<p class=\"pos-slip-info\">19/82 หมู่ 2 ต.วิชิต อ.เมือง จ.ภูเก็ต 83000</p>" +
            "<p class=\"pos-slip-info\">โทร 062-525-8941</p>" +
            "<div class=\"pos-slip-rule\"></div>" +
            (row.id ? "<p>เลขที่ SM-" + esc(row.id) + "</p>" : "") +
            "<p>วันที่ " + esc(thaiWhen(row.date, row.time)) + "</p>" +
            "<p>ช่าง " + esc(row.barber_name || "") + "</p>" +
            "<p>ลูกค้า " + esc(customer) + "</p>" +
            (walkinRow ? "" : ("<p>เบอร์ " + esc(phone) + "</p>")) +
            "<table class=\"pos-slip-table\">" +
            "<thead><tr><th>รายการ</th><th>จำนวน</th><th>บาท</th></tr></thead>" +
            "<tbody>" + rowsHtml + "</tbody>" +
            "</table>" +
            "<div class=\"pos-slip-box\">" + (pending ? "ยอดชำระ" : esc(PAY[row.payment_method] || "ชำระแล้ว")) + " " + bahtPlain(row.amount) + " บาท</div>" +
            (row.last_edit && !pending ? "<p class=\"pos-slip-info pos-slip-edit\">" + esc(editNote(row.last_edit)) + "</p>" : "") +
            "<img class=\"pos-slip-qr\" src=\"" + esc(window.StreetManStore.paymentQrUrl ? window.StreetManStore.paymentQrUrl() : "../img/qr-promptpay.png") + "\" alt=\"QR โอน\" onerror=\"this.onerror=null;this.src='../img/qr-promptpay.png'\">" +
            "<p class=\"pos-slip-info\">สแกนโอนเงิน</p>" +
            "<p class=\"pos-slip-info\">เปิดทุกวัน 11:00–20:00</p>" +
            "<p class=\"pos-slip-info\">streetmanbarberphuket.shop</p>" +
            "<p class=\"pos-slip-sign\">ลงชื่อ................................</p>" +
            "<p class=\"pos-slip-thanks\">ขอบคุณที่ใช้บริการ</p>" +
            "</div>" +
            "<div class=\"pos-slip-actions\">" +
            "<button type=\"button\" class=\"btn btn-primary pos-pay\" id=\"receipt-print\">" + (pending ? "พิมพ์บิล" : "พิมพ์ / เซฟ") + "</button>" +
            (pending ? "<button type=\"button\" class=\"btn btn-success pos-pay d-none\" id=\"receipt-paid\">ได้รับเงินแล้ว</button>" : "") +
            "<button type=\"button\" class=\"btn btn-outline-light pos-pay\" id=\"receipt-close\">" + (pending ? "ยกเลิก" : "ปิด") + "</button>" +
            "</div>" +
            "<label class=\"pos-paper\">🧾 กระดาษ <select id=\"receipt-paper\"><option value=\"80\">80 มม.</option><option value=\"58\">58 มม.</option></select></label>" +
            "</div>";
        var receiptQr = receiptEl.querySelector(".pos-slip-qr");
        var receiptQrReady = Promise.resolve();
        if (promptPayReady()) {
            // Only the unpaid bill carries the amount; a receipt for a paid bill must not invite a second transfer.
            receiptQr.nextElementSibling.textContent = (pending ? "สแกนจ่าย " + bahtPlain(row.amount) + " บาท · " : "สแกนโอน") + "พร้อมเพย์ " + window.PromptPay.format(latest.promptpay);
            receiptQrReady = qrDataUrl(window.PromptPay.payload(latest.promptpay, pending ? row.amount : 0)).then(function (src) {
                receiptQr.src = src;
            }).catch(function () {});
        }
        document.getElementById("receipt-close").addEventListener("click", function () {
            receiptEl.className = "pos-receipt d-none";
            receiptEl.innerHTML = "";
        });
        var paidBtn = document.getElementById("receipt-paid");
        if (paidBtn) {
            paidBtn.addEventListener("click", async function () {
                paidBtn.disabled = true;
                var ok = await opts.onConfirm();
                if (ok) {
                    receiptEl.className = "pos-receipt d-none";
                    receiptEl.innerHTML = "";
                } else {
                    paidBtn.disabled = false;
                }
            });
        }
        var paperSelect = document.getElementById("receipt-paper");
        paperSelect.value = String(paperWidth());
        paperSelect.addEventListener("change", function () {
            try { window.localStorage.setItem(PAPER_KEY, paperSelect.value); } catch (err) {}
        });
        document.getElementById("receipt-print").addEventListener("click", function () {
            document.body.classList.add("pos-printing");
            var qr = receiptEl.querySelector(".pos-slip-qr");
            var printed = false;
            function go() {
                if (printed) {
                    return;
                }
                printed = true;
                window.setTimeout(function () {
                    fitPrintPage();
                    window.print();
                    var paidBtn = document.getElementById("receipt-paid");
                    if (paidBtn) {
                        paidBtn.classList.remove("d-none");
                        document.getElementById("receipt-print").textContent = "พิมพ์บิลอีกครั้ง";
                    }
                }, 50);
            }
            // Wait for the QR so it is not blank on the printout.
            receiptQrReady.then(function () {
                if (qr && !qr.complete) {
                    qr.addEventListener("load", go);
                    qr.addEventListener("error", go);
                    window.setTimeout(go, 3000);
                } else {
                    go();
                }
            });
        });
    }

    var seenReady = null;
    var paidDateEl = document.getElementById("paid-date");

    async function load() {
        try { await loadMenu(); } catch (err) {}
        var data = await window.StreetManStore.pos(paidDateEl.value || todayISO());
        var viewingToday = !paidDateEl.value || paidDateEl.value === todayISO();
        document.getElementById("paid-title").textContent = viewingToday ? "คิดเงินแล้ววันนี้" : "คิดเงินแล้ว " + thaiWhen(paidDateEl.value);
        latest = data;
        var readyNow = (data.open || []).filter(readyToPay);
        if (seenReady) {
            var fresh = readyNow.filter(function (row) { return !seenReady[row.id]; });
            if (fresh.length) {
                showToast(fresh.map(function (row) { return row.customer_name; }).join(", ") + " ตัดเสร็จแล้ว รอคิดเงิน");
            }
        }
        seenReady = {};
        readyNow.forEach(function (row) { seenReady[row.id] = true; });
        if (selected && mode === "queue") {
            selected = (data.open || []).filter(function (row) { return row.id === selected.id; })[0] || selected;
        }
        document.getElementById("barber-name").textContent = "POS เคาน์เตอร์";
        var chairs = data.barbers || [];
        if (!walkin.barber_id || !chairs.some(function (row) { return row.id === walkin.barber_id; })) {
            walkin.barber_id = chairs[0] ? chairs[0].id : "";
        }
        renderLists();
        renderCheckout();
    }

    async function boot() {
        var me = await window.StreetManStore.me();
        if (!isPosUser(me)) {
            window.location.replace("dashboard.html");
            return;
        }
        await loadMenu();
        var dashLink = document.getElementById("dash-link");
        var incomeLink = document.getElementById("income-link");
        if (dashLink) {
            dashLink.classList.add("d-none");
        }
        if (incomeLink) {
            incomeLink.classList.add("d-none");
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
        paidDateEl.value = todayISO();
        paidDateEl.max = todayISO();
        paidDateEl.addEventListener("change", function () {
            if (mode === "paid" || mode === "edit") {
                mode = "idle";
                selected = null;
            }
            load();
        });
        window.addEventListener("afterprint", function () {
            document.body.classList.remove("pos-printing", "paper-58");
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
