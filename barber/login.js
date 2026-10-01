(function () {
    "use strict";

    var Store = window.StreetManStore;
    var views = ["login-view", "password-view", "signup-view", "signup-done"];

    function show(id) {
        views.forEach(function (view) {
            document.getElementById(view).classList.toggle("d-none", view !== id);
        });
        ["login-error", "password-error", "signup-error"].forEach(function (el) {
            document.getElementById(el).classList.add("d-none");
        });
    }

    function showError(id, message) {
        var el = document.getElementById(id);
        el.textContent = message;
        el.classList.remove("d-none");
    }

    function errorCode(err) {
        return (err && err.body && err.body.error) || (err && err.message) || "";
    }

    function errorText(err) {
        var code = errorCode(err);
        if (err && err.status === 429) {
            return code === "too_many_pending"
                ? "มีคำขอสมัครรออนุมัติเยอะแล้ว ให้ Rim อนุมัติก่อนแล้วค่อยสมัครใหม่"
                : "ลองบ่อยเกินไป รอ 15 นาทีแล้วลองใหม่";
        }
        if (code === "bad_login" || (err && err.status === 401)) {
            return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก";
        }
        if (code === "pending_approval") {
            return "บัญชีนี้ยังรอ Rim อนุมัติ";
        }
        if (code === "weak_password") {
            return "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัว ห้ามซ้ำกับรหัสเดิม ชื่อผู้ใช้ หรือรหัสเก่าของร้าน";
        }
        if (code === "username_taken") {
            return "ชื่อผู้ใช้นี้มีคนใช้แล้ว ลองชื่ออื่น";
        }
        if (code === "bad_username") {
            return "ชื่อผู้ใช้ใช้ได้แค่ a-z และ 0-9 ความยาว 2–20 ตัว";
        }
        if (code === "bad_name") {
            return "กรอกชื่อที่แสดง 2–40 ตัว";
        }
        if (code === "server_required") {
            return "ระบบช่างใช้ได้เฉพาะบนเว็บหลักของร้าน";
        }
        return "เชื่อมต่อร้านไม่สำเร็จ ลองอีกครั้ง";
    }

    function goNext(barber) {
        var cashier = barber && (barber.role === "cashier" || barber.id === "pos" || barber.username === "pos");
        var next = window.sessionStorage.getItem("sm_after_login") || (cashier ? "pos.html" : "dashboard.html");
        window.sessionStorage.removeItem("sm_after_login");
        if (cashier) {
            next = "pos.html";
        } else if (barber && barber.role === "admin" && String(next).indexOf("dashboard.html") === 0) {
            next = "manage.html"; // admins are not barbers: start on the shop management page
        } else if (String(next).indexOf("pos.html") !== -1) {
            next = "dashboard.html";
        }
        window.location.href = next;
    }

    document.querySelectorAll("[data-view]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            if (btn.getAttribute("data-view") === "password-view") {
                document.getElementById("pw-username").value = document.getElementById("username").value;
                document.getElementById("password-copy").textContent =
                    "กรอกรหัสผ่านเดิมและรหัสผ่านใหม่ เปลี่ยนแล้วเครื่องอื่นที่เคยล็อกอินไว้จะออกจากระบบ";
            }
            show(btn.getAttribute("data-view"));
        });
    });

    document.getElementById("login-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        show("login-view");
        var username = document.getElementById("username").value;
        var password = document.getElementById("password").value;
        try {
            goNext(await Store.login(username, password));
        } catch (err) {
            if (errorCode(err) === "password_change_required") {
                // Old shared or temporary password: send them straight to the change form.
                document.getElementById("pw-username").value = username;
                document.getElementById("pw-current").value = password;
                show("password-view");
                document.getElementById("password-copy").textContent =
                    "ต้องตั้งรหัสผ่านใหม่ก่อนเข้าใช้งาน (รหัสเดิมเป็นรหัสชั่วคราวหรือรหัสเก่าของร้าน)";
                document.getElementById("pw-new").focus();
                return;
            }
            showError("login-error", errorText(err));
        }
    });

    document.getElementById("password-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        var next = document.getElementById("pw-new").value;
        if (next !== document.getElementById("pw-confirm").value) {
            showError("password-error", "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
            return;
        }
        try {
            goNext(await Store.changePassword(
                document.getElementById("pw-username").value,
                document.getElementById("pw-current").value,
                next
            ));
        } catch (err) {
            showError("password-error", errorText(err));
        }
    });

    document.getElementById("signup-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        var password = document.getElementById("su-password").value;
        if (password !== document.getElementById("su-confirm").value) {
            showError("signup-error", "รหัสผ่านทั้งสองช่องไม่ตรงกัน");
            return;
        }
        try {
            await Store.register({
                name: document.getElementById("su-name").value,
                username: document.getElementById("su-username").value,
                password: password
            });
            e.target.reset();
            show("signup-done");
        } catch (err) {
            showError("signup-error", errorText(err));
        }
    });
})();
