document.getElementById("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var error = document.getElementById("login-error");
    error.classList.add("d-none");
    try {
        await window.StreetManStore.login(
            document.getElementById("username").value,
            document.getElementById("password").value
        );
        window.location.href = "dashboard.html";
    } catch (err) {
        error.textContent = err.message === "bad_login" || err.status === 401
            ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก"
            : (err.message || "เข้าสู่ระบบไม่สำเร็จ");
        error.classList.remove("d-none");
    }
});
