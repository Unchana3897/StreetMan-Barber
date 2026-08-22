(function () {
    "use strict";

    var BARBERS = {
        rim: "Rim",
        bank: "Bank",
        rick: "Rick",
        dee: "Dee"
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
        var barber = { id: username, name: BARBERS[username], username: username, role: username === "rim" ? "owner" : "barber" };
        window.sessionStorage.setItem("sm_barber_session", JSON.stringify(barber));
        return barber;
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        error.classList.add("d-none");
        var username = document.getElementById("username").value;
        var password = document.getElementById("password").value;
        try {
            if (window.StreetManStore && window.StreetManStore.login) {
                await window.StreetManStore.login(username, password);
            } else {
                localLogin(username, password);
            }
            window.location.href = "dashboard.html";
        } catch (err) {
            if (err && (err.message === "bad_login" || err.status === 401)) {
                showError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก ใช้ rim / bank / rick / dee และรหัส StreetMan2026");
                return;
            }
            try {
                localLogin(username, password);
                window.location.href = "dashboard.html";
            } catch (fallbackErr) {
                showError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก ใช้ rim / bank / rick / dee และรหัส StreetMan2026");
            }
        }
    });
})();
