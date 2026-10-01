// "เปิดแจ้งเตือน" button for the POS and the owner's pages.
// (The barber queue page has its own copy in dashboard.js with the alarm sound.)
(function () {
    "use strict";

    function isIos() {
        return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }

    function isStandalone() {
        return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }

    function keyBytes(base64) {
        var padded = (base64 + "===".slice((base64.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
        var raw = window.atob(padded);
        var out = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i += 1) {
            out[i] = raw.charCodeAt(i);
        }
        return out;
    }

    async function api(url, options) {
        options = options || {};
        var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
        var session = window.StreetManStore && window.StreetManStore.getSession && window.StreetManStore.getSession();
        if (session && session.token) {
            headers["X-Session-Token"] = session.token;
        }
        var res = await fetch(url, Object.assign({ credentials: "same-origin" }, options, { headers: headers }));
        var data = {};
        try { data = await res.json(); } catch (err) {}
        if (!res.ok) {
            var error = new Error(data.error || "fail");
            error.status = res.status;
            throw error;
        }
        return data;
    }

    function toast(text) {
        var el = document.getElementById("toast");
        if (!el) {
            return;
        }
        el.textContent = text;
        el.classList.remove("d-none");
        window.setTimeout(function () { el.classList.add("d-none"); }, 4000);
    }

    function setButton(btn, text, mode) {
        (btn.querySelector("span") || btn).textContent = text;
        btn.dataset.mode = mode;
        btn.disabled = mode === "blocked";
    }

    async function refresh(btn) {
        if (isIos() && !isStandalone()) {
            setButton(btn, "แจ้งเตือน: เพิ่มไปหน้าจอโฮมก่อน", "ios");
            return;
        }
        if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window)) {
            setButton(btn, "เครื่องนี้ไม่รองรับแจ้งเตือน", "blocked");
            return;
        }
        try {
            var reg = await navigator.serviceWorker.register("sw.js");
            await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (sub && Notification.permission === "granted") {
                await api("/api/barber/push-subscribe", { method: "POST", body: JSON.stringify(sub) });
                setButton(btn, "แจ้งเตือนเปิดแล้ว · กดเพื่อทดสอบ", "on");
            } else {
                setButton(btn, "เปิดแจ้งเตือน", "off");
            }
        } catch (err) {
            setButton(btn, "เปิดแจ้งเตือน", "off");
        }
    }

    async function enable(btn) {
        var perm = await Notification.requestPermission();
        if (perm !== "granted") {
            toast("ยังไม่ได้อนุญาตแจ้งเตือน เปิดได้ในการตั้งค่าเบราว์เซอร์");
            return;
        }
        var key = await api("/api/barber/push-key");
        if (!key.publicKey) {
            toast("ระบบแจ้งเตือนของร้านยังไม่ได้ตั้งค่า แจ้งเจ้าของร้าน");
            return;
        }
        var reg = await navigator.serviceWorker.register("sw.js");
        await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key.publicKey) });
        await api("/api/barber/push-subscribe", { method: "POST", body: JSON.stringify(sub) });
        setButton(btn, "แจ้งเตือนเปิดแล้ว · กดเพื่อทดสอบ", "on");
        toast("เปิดแจ้งเตือนแล้ว");
    }

    async function onClick(btn) {
        try {
            if (btn.dataset.mode === "ios") {
                toast("iPhone: กดแชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิดจากไอคอนนั้น ก่อนเปิดแจ้งเตือน");
            } else if (btn.dataset.mode === "on") {
                await api("/api/barber/push-test", { method: "POST" });
                toast("ส่งแจ้งเตือนทดสอบแล้ว ถ้าไม่ขึ้นใน 1 นาที ลองปิดแล้วเปิดแจ้งเตือนใหม่");
            } else {
                await enable(btn);
            }
        } catch (err) {
            toast(err && err.message === "push_not_configured"
                ? "ระบบแจ้งเตือนของร้านยังไม่ได้ตั้งค่า แจ้งเจ้าของร้าน"
                : "เปิดแจ้งเตือนไม่สำเร็จ ลองอีกครั้ง");
        }
    }

    function init() {
        var btn = document.getElementById("notify-btn");
        if (!btn || btn.dataset.pushBound) {
            return;
        }
        btn.dataset.pushBound = "1";
        btn.addEventListener("click", function () { onClick(btn); });
        refresh(btn);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
