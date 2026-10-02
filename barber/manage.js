(function () {
    "use strict";

    // ---- Separate pages: manage.html#team / #menu / #money / #shop ----
    var TABS = { team: "👥 ทีมงาน", menu: "🧾 เมนูและราคา", money: "💳 รับเงิน", shop: "🏪 ร้าน" };

    function showTab(name) {
        if (!TABS[name]) {
            name = "team";
        }
        document.querySelectorAll(".mg-tab").forEach(function (el) {
            el.hidden = el.getAttribute("data-tab") !== name;
        });
        document.querySelectorAll("[data-tab], [data-sub]").forEach(function (a) {
            if (a.tagName === "A") {
                a.classList.toggle("is-on", (a.getAttribute("data-tab") || a.getAttribute("data-sub")) === name);
            }
        });
        document.getElementById("mg-title").textContent = "จัดการร้าน · " + TABS[name].replace(/^\S+\s/, "");
        document.title = "จัดการร้าน · " + TABS[name].replace(/^\S+\s/, "") + " | StreetMan Barber Phuket";
    }

    function setTabBadge(name, count) {
        document.querySelectorAll("#tab-badge-" + name + ", [data-sub-badge='" + name + "']").forEach(function (el) {
            el.textContent = count || "";
            el.classList.toggle("d-none", !count);
        });
    }

    window.addEventListener("hashchange", function () {
        showTab(window.location.hash.slice(1));
        window.scrollTo(0, 0);
    });
    showTab(window.location.hash.slice(1));

    var listEl = document.getElementById("staff-list");
    var pendingEl = document.getElementById("pending-list");
    var pendingCountEl = document.getElementById("pending-count");
    var toastEl = document.getElementById("toast");

    function showToast(text) {
        toastEl.textContent = text;
        toastEl.classList.remove("d-none");
        setTimeout(function () {
            toastEl.classList.add("d-none");
        }, 4000);
    }

    function errorText(err) {
        var code = err && (err.body && err.body.error || err.message);
        if (code === "username_taken") {
            return "ชื่อเข้าสู่ระบบนี้มีแล้ว";
        }
        if (code === "bad_username") {
            return "ชื่อเข้าสู่ระบบใช้ได้แค่ a-z และ 0-9 ความยาว 2–20 ตัว";
        }
        if (code === "bad_password" || code === "weak_password") {
            return "รหัสผ่านต้องมีอย่างน้อย 8 ตัว ห้ามตรงกับชื่อผู้ใช้หรือรหัสเก่าของร้าน";
        }
        if (code === "bad_name") {
            return "กรอกชื่อช่างให้ครบ";
        }
        if (code === "bad_day_off") {
            return "เลือกวันหยุดไม่ถูกต้อง";
        }
        if (code === "bad_image") {
            return "ไฟล์รูปไม่ถูกต้อง ใช้ PNG, JPG หรือ WEBP";
        }
        if (code === "image_too_large") {
            return "รูปใหญ่เกินไป ลองครอปให้เหลือแค่ QR";
        }
        if (code === "has_upcoming") {
            return "ลบไม่ได้: ยังมีลูกค้าจองคิวกับคนนี้ " + ((err.body && err.body.count) || "") + " คิว ยกเลิกหรือย้ายคิวก่อน";
        }
        if (code === "cannot_delete_owner") {
            return "ลบบัญชีเจ้าของร้านไม่ได้";
        }
        if (code === "bad_price") {
            return "ราคาต้องเป็นตัวเลข 0–100,000 บาท";
        }
        if (code === "bad_minutes") {
            return "เวลาที่ใช้ต้องอยู่ระหว่าง 10–180 นาที";
        }
        if (code === "last_service") {
            return "ต้องเหลือบริการที่แสดงบนเว็บอย่างน้อย 1 อย่าง";
        }
        if (code === "bad_phone") {
            return "เบอร์โทรต้องเป็นเบอร์ไทย 9–10 หลัก เช่น 065-691-0357";
        }
        if (code === "phone_required") {
            return "ต้องมีเบอร์โทรอย่างน้อย 1 เบอร์";
        }
        if (code === "bad_promptpay") {
            return "พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลข 13 หลัก";
        }
        if (code === "server_required") {
            return "ต้องเชื่อมต่อเซิร์ฟเวอร์ร้านก่อน";
        }
        if (code === "owner_required") {
            return "หน้านี้ใช้ได้เฉพาะเจ้าของร้าน";
        }
        return "บันทึกไม่สำเร็จ ลองอีกครั้ง";
    }

    function rowHtml(barber) {
        var wrap = document.createElement("article");
        wrap.className = "manage-row" + (barber.active ? "" : " inactive");
        wrap.innerHTML =
            "<div>" +
            "<strong></strong>" +
            "<p class=\"queue-meta mb-2\"></p>" +
            "<input class=\"form-control mb-2\" data-field=\"name\">" +
            "<input class=\"form-control\" data-field=\"password\" type=\"password\" placeholder=\"ตั้งรหัสชั่วคราวให้ (ไม่บังคับ)\" autocomplete=\"new-password\">" +
            "</div>" +
            "<div class=\"manage-actions\"></div>";
        wrap.querySelector("strong").textContent = barber.name;
        wrap.querySelector(".queue-meta").textContent =
            "เข้าสู่ระบบ: " + barber.username +
            (barber.role === "owner" ? " · เจ้าของร้าน" : "") +
            (barber.role === "admin" ? " · ผู้ดูแลระบบ" : "") +
            (barber.role === "cashier" ? " · เคาน์เตอร์คิดเงิน" : "") +
            (barber.active ? "" : " · ปิดงานอยู่") +
            (barber.must_change_password ? " · ต้องตั้งรหัสใหม่ตอนเข้าระบบครั้งถัดไป" : "");
        wrap.querySelector("[data-field='name']").value = barber.name;

        if (barber.role !== "cashier" && barber.role !== "admin") {
            var dayLabel = document.createElement("label");
            dayLabel.className = "manage-dayoff-label";
            dayLabel.textContent = "วันหยุดประจำสัปดาห์";
            var daySelect = document.createElement("select");
            daySelect.className = "form-control";
            daySelect.setAttribute("data-field", "day_off");
            [
                ["", "ยังไม่กำหนด"],
                ["1", "จันทร์"],
                ["2", "อังคาร"],
                ["3", "พุธ"],
                ["4", "พฤหัสบดี"],
                ["5", "ศุกร์"],
                ["6", "เสาร์"],
                ["0", "อาทิตย์"]
            ].forEach(function (pair) {
                var opt = document.createElement("option");
                opt.value = pair[0];
                opt.textContent = pair[1];
                daySelect.appendChild(opt);
            });
            daySelect.value = barber.day_off == null || barber.day_off === "" ? "" : String(barber.day_off);
            wrap.querySelector("div").appendChild(dayLabel);
            wrap.querySelector("div").appendChild(daySelect);
        }

        var actions = wrap.querySelector(".manage-actions");
        var save = document.createElement("button");
        save.type = "button";
        save.className = "btn btn-primary";
        save.textContent = "บันทึก";
        save.addEventListener("click", function () {
            saveBarber(barber.id, wrap);
        });
        actions.appendChild(save);

        if (barber.role !== "owner" && barber.role !== "cashier" && barber.role !== "admin") {
            var toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "btn btn-outline-light";
            toggle.textContent = barber.active ? "ปิดงาน" : "เปิดงาน";
            toggle.addEventListener("click", async function () {
                try {
                    await window.StreetManStore.updateStaff(barber.id, { active: !barber.active });
                    showToast(barber.active ? "ปิดงานช่างนี้แล้ว" : "เปิดงานช่างนี้แล้ว");
                    load();
                } catch (err) {
                    showToast(errorText(err));
                }
            });
            actions.appendChild(toggle);
        }

        var me = window.StreetManStore.getSession && window.StreetManStore.getSession();
        if (barber.role !== "owner" && !(me && me.id === barber.id)) {
            var del = document.createElement("button");
            del.type = "button";
            del.className = "btn btn-outline-light manage-delete";
            del.textContent = "ลบ";
            del.addEventListener("click", async function () {
                var who = barber.name + " (" + barber.username + ")";
                if (!window.confirm("ลบบัญชี " + who + "?\n\nเข้าระบบไม่ได้อีก และไม่ขึ้นให้ลูกค้าจอง\nรายได้และบิลเก่าของคนนี้ยังเก็บไว้ตามเดิม")) {
                    return;
                }
                try {
                    await window.StreetManStore.deleteStaff(barber.id);
                    showToast("ลบบัญชี " + barber.name + " แล้ว");
                    load();
                } catch (err) {
                    showToast(errorText(err));
                }
            });
            actions.appendChild(del);
        }
        return wrap;
    }

    async function saveBarber(id, wrap) {
        var name = wrap.querySelector("[data-field='name']").value.trim();
        var password = wrap.querySelector("[data-field='password']").value;
        var payload = { name: name };
        if (password) {
            payload.password = password;
        }
        var dayOffEl = wrap.querySelector("[data-field='day_off']");
        if (dayOffEl) {
            payload.day_off = dayOffEl.value === "" ? null : Number(dayOffEl.value);
        }
        try {
            await window.StreetManStore.updateStaff(id, payload);
            showToast("บันทึกแล้ว");
            load();
        } catch (err) {
            showToast(errorText(err));
        }
    }

    async function loadShop() {
        if (!window.StreetManStore.getShop) {
            return;
        }
        var shop = await window.StreetManStore.getShop();
        renderPaymentQr(shop);
        var copy = document.getElementById("shop-status-copy");
        var btn = document.getElementById("shop-close-btn");
        copy.textContent = shop.closed
            ? "ร้านปิดรับจองออนไลน์อยู่ ลูกค้าจองคิวใหม่ไม่ได้"
            : "ร้านเปิดรับจองออนไลน์อยู่";
        btn.textContent = shop.closed ? "เปิดรับจอง" : "ปิดร้าน";
        btn.className = shop.closed ? "btn btn-primary" : "btn btn-outline-light";
        btn.onclick = async function () {
            if (!shop.closed && !window.confirm("ปิดร้านแล้วลูกค้าจะจองออนไลน์ไม่ได้ จนกว่าจะกดเปิดรับจอง")) {
                return;
            }
            try {
                await window.StreetManStore.setShop({ closed: !shop.closed });
                showToast(shop.closed ? "เปิดรับจองแล้ว" : "ปิดร้านแล้ว");
                loadShop();
            } catch (err) {
                showToast(errorText(err));
            }
        };
    }

    var qrPreview = document.getElementById("payment-qr-preview");
    var qrStatus = document.getElementById("payment-qr-status");
    var qrFile = document.getElementById("payment-qr-file");
    var qrUploadBtn = document.getElementById("payment-qr-upload");
    var qrRemoveBtn = document.getElementById("payment-qr-remove");

    function renderPaymentQr(shop) {
        var version = shop && shop.payment_qr;
        qrPreview.src = version ? window.StreetManStore.paymentQrUrl(version) : "../img/qr-promptpay.png";
        qrStatus.textContent = version
            ? "ใช้ QR ที่อัปโหลดเมื่อ " + new Date(Number(version)).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
            : "ยังใช้ QR เดิมของร้านอยู่";
        qrRemoveBtn.classList.toggle("d-none", !version);
    }

    // Shrink the photo in the browser so the upload stays small; QR codes stay sharp at this size.
    function imageToDataUrl(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                var max = 1000;
                var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
                var canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                var ctx = canvas.getContext("2d");
                ctx.fillStyle = "#fff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                var data = canvas.toDataURL("image/png");
                if (data.length > 1300000) {
                    data = canvas.toDataURL("image/jpeg", 0.9);
                }
                resolve(data);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error("bad_image"));
            };
            img.src = url;
        });
    }

    var promptpayInput = document.getElementById("promptpay-id");
    var promptpayStatus = document.getElementById("promptpay-status");

    function renderPromptPay(id) {
        promptpayInput.value = id ? window.PromptPay.format(id) : "";
        promptpayStatus.textContent = id
            ? "เปิดใช้ QR พร้อมยอดแล้ว · เงินเข้าพร้อมเพย์ " + window.PromptPay.format(id)
            : "ยังไม่ได้ใส่พร้อมเพย์";
    }

    async function loadPromptPay() {
        try {
            renderPromptPay(await window.StreetManStore.getPromptPay());
        } catch (err) {
            promptpayStatus.textContent = errorText(err);
        }
    }

    document.getElementById("promptpay-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        var raw = promptpayInput.value.trim();
        if (raw && !window.PromptPay.normalize(raw)) {
            showToast(errorText({ message: "bad_promptpay" }));
            return;
        }
        if (raw && !window.confirm("ยืนยันพร้อมเพย์ " + window.PromptPay.format(raw) + "\nเงินโอนจากลูกค้าจะเข้าบัญชีนี้ ตรวจเลขให้ถูกก่อนบันทึก")) {
            return;
        }
        try {
            var saved = await window.StreetManStore.setPromptPay(raw);
            renderPromptPay(saved);
            showToast(saved ? "บันทึกพร้อมเพย์แล้ว" : "ลบพร้อมเพย์แล้ว");
        } catch (err) {
            showToast(errorText(err));
        }
    });

    // ---- Shop contact numbers ----
    var contactForm = document.getElementById("contact-form");
    var contactStatus = document.getElementById("contact-status");

    function renderContact(c) {
        document.getElementById("contact-phone1").value = c.phone1_display || "";
        document.getElementById("contact-phone2").value = c.phone2_display || "";
        document.getElementById("contact-whatsapp").value = c.whatsapp_display || "";
        var calls = [c.phone1_display, c.phone2_display].filter(Boolean).join(" / ");
        contactStatus.textContent = "บนเว็บตอนนี้ · โทร " + (calls || "-") + " · WhatsApp " + (c.whatsapp_display || "-");
    }

    async function loadContact() {
        try {
            renderContact(await window.StreetManStore.getContact());
        } catch (err) {
            contactStatus.textContent = errorText(err);
        }
    }

    contactForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var payload = {
            phone1: document.getElementById("contact-phone1").value.trim(),
            phone2: document.getElementById("contact-phone2").value.trim(),
            whatsapp: document.getElementById("contact-whatsapp").value.trim()
        };
        var btn = contactForm.querySelector("button[type=submit]");
        btn.disabled = true;
        try {
            renderContact(await window.StreetManStore.setContact(payload));
            showToast("บันทึกเบอร์ติดต่อแล้ว หน้าเว็บจะเปลี่ยนภายใน 1 นาที");
        } catch (err) {
            showToast(errorText(err));
        } finally {
            btn.disabled = false;
        }
    });

    // ---- Menu & prices ----
    var MINUTES = [10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180];

    function minuteOptions(select, value) {
        var list = MINUTES.indexOf(Number(value)) === -1 && value ? MINUTES.concat(Number(value)).sort(function (a, b) { return a - b; }) : MINUTES;
        select.innerHTML = "";
        list.forEach(function (m) {
            var opt = document.createElement("option");
            opt.value = m;
            var h = Math.floor(m / 60), r = m % 60;
            opt.textContent = (h ? h + " ชม." : "") + (h && r ? " " : "") + (r ? r + " นาที" : "");
            select.appendChild(opt);
        });
        select.value = String(value || 30);
    }

    function serviceRow(svc, index, count) {
        var row = document.createElement("form");
        row.className = "svc-row" + (svc.active ? "" : " is-hidden");
        row.innerHTML =
            "<div class=\"svc-top\"><strong></strong><span class=\"svc-badge\"></span></div>" +
            "<div class=\"svc-grid\">" +
            "<label>ชื่อ (ไทย)<input class=\"form-control\" name=\"name\" required maxlength=\"60\"></label>" +
            "<label>ชื่อ (อังกฤษ)<input class=\"form-control\" name=\"name_en\" maxlength=\"60\"></label>" +
            "<label>ราคา (บาท)<input class=\"form-control\" name=\"price\" type=\"number\" min=\"0\" max=\"100000\" required inputmode=\"numeric\"></label>" +
            "<label>ใช้เวลา<select class=\"form-control\" name=\"minutes\"></select></label>" +
            "<label class=\"svc-wide\">รายละเอียดสั้นๆ (ไทย)<input class=\"form-control\" name=\"note\" maxlength=\"120\"></label>" +
            "<label class=\"svc-wide\">รายละเอียดสั้นๆ (อังกฤษ)<input class=\"form-control\" name=\"note_en\" maxlength=\"120\"></label>" +
            "</div>" +
            "<div class=\"svc-actions\">" +
            "<button type=\"button\" class=\"btn btn-outline-light btn-sm\" data-act=\"up\" aria-label=\"เลื่อนขึ้น\">▲</button>" +
            "<button type=\"button\" class=\"btn btn-outline-light btn-sm\" data-act=\"down\" aria-label=\"เลื่อนลง\">▼</button>" +
            "<button type=\"button\" class=\"btn btn-outline-light btn-sm\" data-act=\"toggle\"></button>" +
            "<button type=\"button\" class=\"btn btn-outline-light btn-sm svc-delete\" data-act=\"delete\">ลบ</button>" +
            "<button type=\"submit\" class=\"btn btn-primary btn-sm\">บันทึก</button>" +
            "</div>";
        row.querySelector("strong").textContent = svc.name + " · ฿" + Number(svc.price).toLocaleString("th-TH");
        row.querySelector(".svc-badge").textContent = svc.active ? "แสดงบนเว็บ" : "ซ่อนอยู่";
        ["name", "name_en", "price", "note", "note_en"].forEach(function (k) {
            row.elements[k].value = svc[k] == null ? "" : svc[k];
        });
        minuteOptions(row.elements.minutes, svc.minutes);
        row.querySelector("[data-act=up]").disabled = index === 0;
        row.querySelector("[data-act=down]").disabled = index === count - 1;
        row.querySelector("[data-act=toggle]").textContent = svc.active ? "ซ่อน" : "แสดง";
        row.addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await window.StreetManStore.saveService(svc.id, formValues(row));
                showToast("บันทึก " + row.elements.name.value + " แล้ว");
                loadServices();
            } catch (err) {
                showToast(errorText(err));
            }
        });
        row.querySelector(".svc-actions").addEventListener("click", async function (e) {
            var act = e.target.getAttribute("data-act");
            if (!act) {
                return;
            }
            try {
                if (act === "up" || act === "down") {
                    await window.StreetManStore.moveService(svc.id, act);
                } else if (act === "toggle") {
                    await window.StreetManStore.saveService(svc.id, { active: !svc.active });
                    showToast(svc.active ? "ซ่อน " + svc.name + " จากหน้าเว็บแล้ว" : "แสดง " + svc.name + " บนหน้าเว็บแล้ว");
                } else if (act === "delete") {
                    var msg = svc.used
                        ? "ลบ " + svc.name + "?\nบริการนี้เคยมีในบิลแล้ว ระบบจะซ่อนไว้แทน เพื่อให้บิลเก่ายังแสดงชื่อได้"
                        : "ลบ " + svc.name + " ถาวร?";
                    if (!window.confirm(msg)) {
                        return;
                    }
                    var res = await window.StreetManStore.deleteService(svc.id);
                    showToast(res.removed === "hidden" ? "ซ่อน " + svc.name + " แล้ว (มีในบิลเก่า)" : "ลบ " + svc.name + " แล้ว");
                }
                loadServices();
            } catch (err) {
                showToast(errorText(err));
            }
        });
        return row;
    }

    function formValues(form) {
        return {
            name: form.elements.name.value,
            name_en: form.elements.name_en.value,
            price: Number(form.elements.price.value),
            minutes: Number(form.elements.minutes.value),
            note: form.elements.note.value,
            note_en: form.elements.note_en.value
        };
    }

    async function loadServices() {
        var list = document.getElementById("svc-list");
        try {
            var rows = await window.StreetManStore.ownerServices();
            list.innerHTML = "";
            rows.forEach(function (svc, i) {
                list.appendChild(serviceRow(svc, i, rows.length));
            });
        } catch (err) {
            list.textContent = errorText(err);
        }
    }

    var addForm = document.getElementById("svc-add");
    minuteOptions(addForm.elements.minutes, 30);
    addForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        try {
            await window.StreetManStore.saveService(null, formValues(addForm));
            showToast("เพิ่ม " + addForm.elements.name.value + " แล้ว");
            addForm.reset();
            minuteOptions(addForm.elements.minutes, 30);
            loadServices();
        } catch (err) {
            showToast(errorText(err));
        }
    });

    var PAY_NAMES = { cash: "เงินสด", transfer: "โอน / QR" };
    var SERVICE_NAMES = { haircut: "ตัดผม", beard: "ตกแต่งเครา", shave: "โกนหนวด", dye: "ย้อมผม", mustache: "ตกแต่งหนวด", stacking: "เซ็ตทรง" };
    var approvalTimer = null;

    function bahtText(n) {
        return "฿" + Number(n || 0).toLocaleString("th-TH");
    }

    function billLine(snap) {
        var names = snap.items ? snap.items.map(function (item) {
            return item.id === "other" ? "อื่นๆ " + bahtText(item.price) : item.name;
        }) : [SERVICE_NAMES[snap.service] || snap.service].concat((snap.extras || []).map(function (item) {
            return item && typeof item === "object" ? "อื่นๆ " + bahtText(item.amount) : (SERVICE_NAMES[item] || item);
        }));
        return names.join(" + ") + " · " + (PAY_NAMES[snap.method] || snap.method) + " " + bahtText(snap.amount);
    }

    async function loadBillEdits() {
        var listEl = document.getElementById("bill-edit-list");
        try {
            var rows = await window.StreetManStore.listBillEdits();
            listEl.innerHTML = "";
            if (!rows.length) {
                listEl.innerHTML = "<p class=\"queue-meta mb-0\">ยังไม่มีการแก้ไขบิล</p>";
                return;
            }
            var pendingCount = rows.filter(function (row) { return row.status === "pending"; }).length;
            var countEl = document.getElementById("bill-review-count");
            countEl.textContent = pendingCount ? "รอตรวจ " + pendingCount : "";
            countEl.classList.toggle("d-none", !pendingCount);
            setTabBadge("money", pendingCount);
            rows.forEach(function (row) {
                var item = document.createElement("article");
                item.className = "bill-edit-row" + (row.status === "pending" ? " is-pending" : "");
                item.innerHTML = "<strong></strong><p class=\"queue-meta mb-1\"></p><p class=\"bill-edit-change mb-1\"></p><p class=\"queue-meta mb-0\"></p>";
                item.querySelector("strong").textContent = "SM-" + row.booking_id + " · " + row.customer_name + (row.barber_name ? " · ช่าง " + row.barber_name : "");
                var status = document.createElement("span");
                var STATUS_TEXT = { pending: "รอตรวจ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ · คืนยอดเดิมแล้ว" };
                status.className = "bill-edit-status is-" + row.status;
                status.textContent = STATUS_TEXT[row.status] || row.status;
                item.querySelector("strong").appendChild(status);
                item.querySelector(".queue-meta").textContent = "แก้เมื่อ " + new Date(row.edited_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) +
                    (row.code ? " · รหัสอ้างอิง " + row.code : " · ไม่มีรหัส (ติดต่อเจ้าของไม่ได้)");
                item.querySelector(".bill-edit-change").textContent = "เดิม: " + billLine(row.before) + "\nใหม่: " + billLine(row.after);
                item.querySelectorAll(".queue-meta")[1].textContent = row.reason ? "เหตุผล: " + row.reason : "";
                if (row.status === "pending") {
                    var actions = document.createElement("div");
                    actions.className = "manage-actions mt-2";
                    [["approve", "อนุมัติ", "btn btn-primary"], ["reject", "ไม่อนุมัติ · คืนยอดเดิม", "btn btn-outline-light"]].forEach(function (spec) {
                        var btn = document.createElement("button");
                        btn.type = "button";
                        btn.className = spec[2];
                        btn.textContent = spec[1];
                        btn.addEventListener("click", async function () {
                            if (spec[0] === "reject" && !window.confirm("ไม่อนุมัติ? บิล SM-" + row.booking_id + " จะกลับเป็น " + billLine(row.before))) {
                                return;
                            }
                            try {
                                await window.StreetManStore.reviewBillEdit(row.id, spec[0]);
                                showToast(spec[0] === "approve" ? "อนุมัติการแก้ไขแล้ว" : "คืนบิลเป็นยอดเดิมแล้ว");
                                loadBillEdits();
                            } catch (err) {
                                showToast(errorText(err));
                            }
                        });
                        actions.appendChild(btn);
                    });
                    item.appendChild(actions);
                }
                listEl.appendChild(item);
            });
        } catch (err) {
            listEl.innerHTML = "";
        }
    }

    document.getElementById("approval-code-btn").addEventListener("click", async function () {
        var btn = this;
        btn.disabled = true;
        try {
            var data = await window.StreetManStore.createApprovalCode();
            var box = document.getElementById("approval-code-box");
            var expiryEl = document.getElementById("approval-code-expiry");
            document.getElementById("approval-code").textContent = data.code.slice(0, 3) + " " + data.code.slice(3);
            box.classList.remove("d-none", "is-expired");
            window.clearInterval(approvalTimer);
            function tick() {
                var left = Math.max(0, Math.round((data.expires_at - Date.now()) / 1000));
                if (!left) {
                    window.clearInterval(approvalTimer);
                    box.classList.add("is-expired");
                    expiryEl.textContent = "รหัสนี้หมดอายุแล้ว สร้างรหัสใหม่ถ้ายังต้องใช้";
                    return;
                }
                expiryEl.textContent = "บอกรหัสนี้ให้เคาน์เตอร์ · ใช้ได้ครั้งเดียว · หมดอายุใน " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0") + " นาที";
            }
            tick();
            approvalTimer = window.setInterval(tick, 1000);
        } catch (err) {
            showToast(errorText(err));
        } finally {
            btn.disabled = false;
        }
    });

    qrUploadBtn.addEventListener("click", function () {
        qrFile.click();
    });

    qrFile.addEventListener("change", async function () {
        var file = qrFile.files && qrFile.files[0];
        qrFile.value = "";
        if (!file) {
            return;
        }
        qrUploadBtn.disabled = true;
        qrUploadBtn.textContent = "กำลังอัปโหลด…";
        try {
            var dataUrl = await imageToDataUrl(file);
            renderPaymentQr(await window.StreetManStore.setPaymentQr(dataUrl));
            showToast("อัปโหลด QR แล้ว ใบเสร็จต่อไปจะใช้ QR นี้");
        } catch (err) {
            showToast(errorText(err));
        } finally {
            qrUploadBtn.disabled = false;
            qrUploadBtn.textContent = "อัปโหลด QR ใหม่";
        }
    });

    qrRemoveBtn.addEventListener("click", async function () {
        if (!window.confirm("ลบ QR ที่อัปโหลด แล้วกลับไปใช้ QR เดิมของร้าน?")) {
            return;
        }
        try {
            renderPaymentQr(await window.StreetManStore.removePaymentQr());
            showToast("กลับไปใช้ QR เดิมแล้ว");
        } catch (err) {
            showToast(errorText(err));
        }
    });

    function pendingHtml(barber) {
        var wrap = document.createElement("article");
        wrap.className = "manage-row";
        wrap.innerHTML =
            "<div><strong></strong><p class=\"queue-meta mb-0\"></p></div>" +
            "<div class=\"manage-actions\"></div>";
        wrap.querySelector("strong").textContent = barber.name;
        wrap.querySelector(".queue-meta").textContent = "ชื่อผู้ใช้: " + barber.username;
        var actions = wrap.querySelector(".manage-actions");
        [["approve", "อนุมัติ", "btn btn-primary"], ["reject", "ปฏิเสธ", "btn btn-outline-light"]].forEach(function (spec) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = spec[2];
            btn.textContent = spec[1];
            btn.addEventListener("click", async function () {
                if (spec[0] === "reject" && !window.confirm("ปฏิเสธคำขอของ " + barber.name + "? คำขอนี้จะถูกลบ")) {
                    return;
                }
                try {
                    await window.StreetManStore.reviewStaff(barber.id, spec[0]);
                    showToast(spec[0] === "approve" ? "อนุมัติ " + barber.name + " แล้ว" : "ปฏิเสธคำขอแล้ว");
                    load();
                } catch (err) {
                    showToast(errorText(err));
                }
            });
            actions.appendChild(btn);
        });
        return wrap;
    }

    async function load() {
        var rows = await window.StreetManStore.listStaff();
        var pending = rows.filter(function (barber) { return barber.status === "pending"; });
        listEl.innerHTML = "";
        pendingEl.innerHTML = "";
        rows.forEach(function (barber) {
            if (barber.status !== "pending") {
                listEl.appendChild(rowHtml(barber));
            }
        });
        pending.forEach(function (barber) {
            pendingEl.appendChild(pendingHtml(barber));
        });
        if (!pending.length) {
            var empty = document.createElement("p");
            empty.className = "queue-meta mb-0";
            empty.textContent = "ยังไม่มีคำขอใหม่";
            pendingEl.appendChild(empty);
        }
        pendingCountEl.textContent = pending.length;
        setTabBadge("team", pending.length);
        pendingCountEl.classList.toggle("d-none", !pending.length);
        return loadShop();
    }

    document.getElementById("add-pos-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        try {
            await window.StreetManStore.createStaff({
                name: document.getElementById("pos-name").value,
                username: document.getElementById("pos-username").value,
                password: document.getElementById("pos-password").value,
                role: "cashier"
            });
            e.target.reset();
            document.getElementById("pos-name").value = "เคาน์เตอร์";
            showToast("สร้างบัญชี POS แล้ว");
            load();
        } catch (err) {
            showToast(errorText(err));
        }
    });

    document.getElementById("logout-btn").addEventListener("click", async function () {
        await window.StreetManStore.logout();
        window.location.href = "login.html";
    });

    window.StreetManStore.me().then(function (barber) {
        if (!barber || (barber.role !== "owner" && barber.role !== "admin" && barber.id !== "rim")) {
            window.location.href = "dashboard.html";
            return;
        }
        loadPromptPay();
        loadContact();
        loadBillEdits();
        loadServices();
        return load();
    }).catch(function () {
        window.location.href = "login.html";
    });
})();
