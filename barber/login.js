document.getElementById("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var error = document.getElementById("login-error");
    error.classList.add("d-none");
    try {
        var res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
                username: document.getElementById("username").value,
                password: document.getElementById("password").value
            })
        });
        var data = await res.json();
        if (!res.ok) {
            throw new Error(data.error === "bad_login" ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก" : "เข้าสู่ระบบไม่สำเร็จ");
        }
        window.location.href = "dashboard.html";
    } catch (err) {
        error.textContent = err.message || "เข้าสู่ระบบไม่สำเร็จ";
        error.classList.remove("d-none");
    }
});
