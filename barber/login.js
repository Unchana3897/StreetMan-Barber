(function () {
    "use strict";

    var BARBERS = {
        rim: "Rim",
        bank: "Bank",
        rick: "Rick",
        dee: "Dee",
        pos: "เคาน์เตอร์"
    };
    var PASSWORD = "StreetMan2026";
    var form = document.getElementById("login-form");
    var error = document.getElementById("login-error");

    function showError(message) {
        error.textContent = message;
        error.classList.remove("d-none");
    }

    function localLogin(username, password) {
        username = String(username || "").trim().toLowerCase();
        password = String(password || "").trim();
        if (!BARBERS[username] || password !== PASSWORD) {
            throw new Error("bad_login");
        }
        var barber = {
            id: username,
            name: BARBERS[username],
            username: username,
            role: username === "rim" ? "owner" : (username === "pos" ? "cashier" : "barber")
        };
        window.sessionStorage.setItem("sm_barber_session", JSON.stringify(barber));
        window.localStorage.setItem("sm_barber_session", JSON.stringify(barber));
        return barber;
    }

    function goNext(barber) {
        var cashier = barber && (barber.role === "cashier" || barber.id === "pos" || barber.username === "pos");
        var next = window.sessionStorage.getItem("sm_after_login") || (cashier ? "pos.html" : "dashboard.html");
        window.sessionStorage.removeItem("sm_after_login");
        if (cashier) {
            next = "pos.html";
        } else if (String(next).indexOf("pos.html") !== -1) {
            next = "dashboard.html";
        }
        window.location.href = next;
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        error.classList.add("d-none");
        var username = document.getElementById("username").value;
        var password = document.getElementById("password").value;
        try {
            var barber;
            if (window.StreetManStore && window.StreetManStore.login) {
                barber = await window.StreetManStore.login(username, password);
            } else {
                barber = localLogin(username, password);
            }
            goNext(barber);
        } catch (err) {
            if (err && err.status === 429) {
                showError("ลองบ่อยเกินไป รอสักครู่แล้วเข้าใหม่");
                return;
            }
            if (err && (err.message === "bad_login" || err.status === 401)) {
                showError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก");
                return;
            }
            if (/\.github\.io$/i.test(window.location.hostname)) {
                try {
                    goNext(localLogin(username, password));
                } catch (fallbackErr) {
                    showError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก");
                }
                return;
            }
            showError("เชื่อมต่อร้านไม่สำเร็จ ลองอีกครั้ง");
        }
    });
})();
