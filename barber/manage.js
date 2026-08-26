(function () {
    "use strict";

    var listEl = document.getElementById("staff-list");
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
        if (code === "bad_password") {
            return "รหัสผ่านต้องมีอย่างน้อย 6 ตัว";
        }
        if (code === "bad_name") {
            return "กรอกชื่อช่างให้ครบ";
        }
        if (code === "bad_day_off") {
            return "เลือกวันหยุดไม่ถูกต้อง";
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
            "<input class=\"form-control\" data-field=\"password\" type=\"password\" placeholder=\"รหัสผ่านใหม่ (ไม่บังคับ)\">" +
            "</div>" +
            "<div class=\"manage-actions\"></div>";
        wrap.querySelector("strong").textContent = barber.name;
        wrap.querySelector(".queue-meta").textContent =
            "เข้าสู่ระบบ: " + barber.username +
            (barber.role === "owner" ? " · เจ้าของร้าน" : "") +
            (barber.role === "cashier" ? " · เคาน์เตอร์คิดเงิน" : "") +
            (barber.active ? "" : " · ปิดงานอยู่");
        wrap.querySelector("[data-field='name']").value = barber.name;

        if (barber.role !== "cashier") {
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

        if (barber.role !== "owner" && barber.role !== "cashier") {
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

    async function load() {
        var rows = await window.StreetManStore.listStaff();
        listEl.innerHTML = "";
        rows.forEach(function (barber) {
            listEl.appendChild(rowHtml(barber));
        });
        return loadShop();
    }

    document.getElementById("add-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        try {
            await window.StreetManStore.createStaff({
                name: document.getElementById("new-name").value,
                username: document.getElementById("new-username").value,
                password: document.getElementById("new-password").value
            });
            e.target.reset();
            showToast("เพิ่มช่างแล้ว");
            load();
        } catch (err) {
            showToast(errorText(err));
        }
    });

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
        if (!barber || (barber.role !== "owner" && barber.id !== "rim")) {
            window.location.href = "dashboard.html";
            return;
        }
        return load();
    }).catch(function () {
        window.location.href = "login.html";
    });
})();
