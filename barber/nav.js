(function () {
    "use strict";

    // Shared staff menu: a sidebar on wide screens, a bottom tab bar + "more" sheet on phones.
    // Renders synchronously so page scripts can bind #notify-btn, #shop-close-btn and #logout-btn.
    var mount = document.getElementById("staff-nav");
    if (!mount) {
        return;
    }
    var page = mount.getAttribute("data-page") || "";
    var actions = (mount.getAttribute("data-actions") || "").split(/\s+/);
    var store = window.StreetManStore;
    var me = store && store.getSession ? store.getSession() : null;
    var owner = Boolean(me && (me.role === "owner" || me.role === "admin" || me.id === "rim"));
    var onDashboard = page === "queue";

    var ITEMS = [
        { id: "queue", href: onDashboard ? "#queue" : "dashboard.html", icon: "fa-list-ul", label: "คิววันนี้", short: "คิว" },
        { id: "hours", href: onDashboard ? "#hours" : "dashboard.html#hours", icon: "fa-clock", label: "เวลาว่างของฉัน", short: "เวลาว่าง" },
        { id: "income", href: "income.html", icon: "fa-chart-line", label: "รายได้", short: "รายได้" },
        { id: "manage", href: "manage.html", icon: "fa-users", label: "จัดการร้าน", short: "จัดการ", owner: true, badge: true }
    ].filter(function (item) {
        return !item.owner || owner;
    });

    function link(item, cls, text) {
        var a = document.createElement("a");
        a.className = cls;
        a.href = item.href;
        a.setAttribute("data-nav", item.id);
        a.innerHTML = '<i class="fa ' + item.icon + '" aria-hidden="true"></i><span></span>';
        a.querySelector("span").textContent = text;
        if (item.badge) {
            var badge = document.createElement("b");
            badge.className = "nav-badge d-none";
            badge.setAttribute("data-badge", "pending");
            a.appendChild(badge);
        }
        return a;
    }

    function button(id, icon, text, cls) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.id = id;
        btn.className = "staff-nav-link" + (cls ? " " + cls : "");
        btn.innerHTML = '<i class="fa ' + icon + '" aria-hidden="true"></i><span></span>';
        btn.querySelector("span").textContent = text;
        return btn;
    }

    // Sidebar (also the content of the phone "more" sheet).
    mount.innerHTML =
        '<div class="staff-nav-brand"><i class="fa fa-cut" aria-hidden="true"></i> StreetMan</div>' +
        '<p class="staff-nav-user"></p>' +
        '<div class="staff-nav-main"></div>' +
        '<div class="staff-nav-foot"></div>';
    mount.setAttribute("aria-label", "เมนูช่าง");
    mount.querySelector(".staff-nav-user").textContent = me ? me.name + (owner ? " · เจ้าของร้าน" : "") : "";
    var main = mount.querySelector(".staff-nav-main");
    ITEMS.forEach(function (item) {
        main.appendChild(link(item, "staff-nav-link", item.label));
        if (item.id === "manage") {
            // Sub-pages of "จัดการร้าน"
            var sub = document.createElement("div");
            sub.className = "staff-nav-sub";
            [["team", "👥 ทีมงาน"], ["menu", "🧾 เมนูและราคา"], ["money", "💳 รับเงิน"], ["shop", "🏪 ร้าน"]].forEach(function (pair) {
                var a = document.createElement("a");
                a.href = (page === "manage" ? "" : "manage.html") + "#" + pair[0];
                a.className = "staff-nav-sublink";
                a.setAttribute("data-sub", pair[0]);
                a.textContent = pair[1];
                var badge = document.createElement("b");
                badge.className = "nav-badge d-none";
                badge.setAttribute("data-sub-badge", pair[0]);
                a.appendChild(badge);
                sub.appendChild(a);
            });
            main.appendChild(sub);
        }
    });
    var foot = mount.querySelector(".staff-nav-foot");
    if (actions.indexOf("notify") !== -1) {
        foot.appendChild(button("notify-btn", "fa-bell", "เปิดแจ้งเตือนมือถือ"));
    }
    if (actions.indexOf("shop") !== -1 && owner) {
        foot.appendChild(button("shop-close-btn", "fa-store-slash", "ปิดร้าน", "is-danger"));
    }
    foot.appendChild(button("logout-btn", "fa-sign-out-alt", "ออกจากระบบ"));

    // Phone tab bar: the three most used pages + "more".
    var tabbar = document.createElement("nav");
    tabbar.className = "staff-tabbar";
    tabbar.setAttribute("aria-label", "เมนูหลัก");
    ITEMS.filter(function (item) {
        return item.id !== (owner ? "hours" : "manage");
    }).slice(0, 3).forEach(function (item) {
        tabbar.appendChild(link(item, "staff-tab", item.short));
    });
    var more = document.createElement("button");
    more.type = "button";
    more.className = "staff-tab";
    more.setAttribute("aria-expanded", "false");
    more.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i><span>เพิ่มเติม</span>';
    tabbar.appendChild(more);
    document.body.appendChild(tabbar);

    var scrim = document.createElement("div");
    scrim.className = "staff-nav-scrim";
    document.body.appendChild(scrim);

    function setSheet(open) {
        document.body.classList.toggle("nav-open", open);
        more.setAttribute("aria-expanded", open ? "true" : "false");
    }
    more.addEventListener("click", function () {
        setSheet(!document.body.classList.contains("nav-open"));
    });
    scrim.addEventListener("click", function () {
        setSheet(false);
    });
    mount.addEventListener("click", function (e) {
        if (e.target.closest("a, button")) {
            setSheet(false);
        }
    });

    function currentView() {
        if (onDashboard) {
            return window.location.hash === "#hours" ? "hours" : "queue";
        }
        return page;
    }

    function syncActive() {
        var view = currentView();
        document.body.classList.toggle("view-hours", onDashboard && view === "hours");
        document.querySelectorAll("[data-nav]").forEach(function (el) {
            var active = el.getAttribute("data-nav") === view;
            el.classList.toggle("is-active", active);
            if (active) {
                el.setAttribute("aria-current", "page");
            } else {
                el.removeAttribute("aria-current");
            }
        });
    }
    syncActive();
    window.addEventListener("hashchange", function () {
        syncActive();
        window.scrollTo(0, 0);
    });

    // Pending signups badge for Rim.
    if (owner && store && store.listStaff) {
        store.listStaff().then(function (rows) {
            var waiting = rows.filter(function (row) { return row.status === "pending"; }).length;
            document.querySelectorAll('[data-badge="pending"]').forEach(function (el) {
                el.textContent = waiting;
                el.classList.toggle("d-none", !waiting);
            });
        }).catch(function () {});
    }
})();
