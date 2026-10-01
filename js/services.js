// Public pages: bring the menu and prices in from the server (the owner edits
// them on "จัดการช่าง"). The HTML keeps the old static menu as a fallback.
//  - fills the i18n keys svc_<id>, svc_<id>_p and meta_<id>, so every text that
//    already uses them (booking form, confirmation, slip, cancel page) follows;
//  - booking page: rebuilds the service list;
//  - price page: rebuilds the price list (#price-list);
//  - service cards: updates prices, hides removed services, adds new ones.
(function (window, document) {
    "use strict";

    var SM = window.StreetMan;
    if (!SM || !window.fetch) {
        return;
    }

    function lang() {
        return SM.detectLang() === "th" ? "th" : "en";
    }

    function metaText(svc, l) {
        var parts = [];
        var note = l === "th" ? svc.note : svc.note_en;
        if (note) {
            parts.push(note);
        }
        parts.push(l === "th" ? "ประมาณ " + svc.minutes + " นาที" : "about " + svc.minutes + " min");
        if (svc.last && svc.last !== "19:30") {
            parts.push(l === "th" ? "คิวสุดท้าย " + svc.last : "last slot " + svc.last);
        }
        var text = parts.join(" · ");
        return l === "en" ? text.charAt(0).toUpperCase() + text.slice(1) : text;
    }

    function priceText(price) {
        return Number(price).toLocaleString("en-US") + " B";
    }

    function fillI18n(list) {
        list.forEach(function (svc) {
            SM.I18N.th["svc_" + svc.id] = svc.name;
            SM.I18N.en["svc_" + svc.id] = svc.name_en || svc.name;
            SM.I18N.th["meta_" + svc.id] = metaText(svc, "th");
            SM.I18N.en["meta_" + svc.id] = metaText(svc, "en");
            if (!SM.I18N.th["svc_" + svc.id + "_p"]) {
                SM.I18N.th["svc_" + svc.id + "_p"] = svc.note || "";
                SM.I18N.en["svc_" + svc.id + "_p"] = svc.note_en || svc.note || "";
            }
        });
        var haircut = list.filter(function (s) { return s.id === "haircut"; })[0] || list[0];
        if (haircut) {
            SM.I18N.th.local_price = haircut.name + " " + haircut.price + " บาท";
            SM.I18N.en.local_price = (haircut.name_en || haircut.name) + " " + haircut.price + " THB";
        }
    }

    function fillSelect(list) {
        var select = document.getElementById("service");
        if (!select || select.tagName !== "SELECT") {
            return;
        }
        // A link like book?service=<id> may name a service the static list didn't have yet.
        var wanted = new URLSearchParams(window.location.search).get("service") || "";
        var current = select.value || wanted;
        var placeholder = select.querySelector("option[value='']");
        select.innerHTML = "";
        if (placeholder) {
            select.appendChild(placeholder);
        }
        list.forEach(function (svc) {
            var opt = document.createElement("option");
            opt.value = svc.id;
            opt.setAttribute("data-i18n", "svc_" + svc.id);
            opt.textContent = SM.t("svc_" + svc.id);
            select.appendChild(opt);
        });
        var keep = list.some(function (s) { return s.id === current; });
        var before = select.value;
        select.value = keep ? current : "";
        if (select.value !== before || (keep && current === wanted && wanted)) {
            select.dispatchEvent(new Event("change"));
        }
    }

    function fillPriceList(list) {
        var box = document.getElementById("price-list");
        if (!box) {
            return;
        }
        box.innerHTML = "";
        list.forEach(function (svc, i) {
            var row = document.createElement("div");
            row.className = "d-flex justify-content-between py-2" + (i < list.length - 1 ? " border-bottom" : "");
            row.innerHTML = "<div><h6 class=\"text-uppercase mb-0\"></h6><span class=\"price-meta\"></span></div>" +
                "<span class=\"text-uppercase text-primary\"></span>";
            row.querySelector("h6").setAttribute("data-i18n", "svc_" + svc.id);
            row.querySelector("h6").textContent = SM.t("svc_" + svc.id);
            row.querySelector(".price-meta").setAttribute("data-i18n", "meta_" + svc.id);
            row.querySelector(".price-meta").textContent = SM.t("meta_" + svc.id);
            row.querySelector(".text-primary").textContent = priceText(svc.price);
            box.appendChild(row);
        });
    }

    function cardId(card) {
        var link = card.querySelector("a[href*='service=']");
        var match = link && /service=([a-z0-9-]+)/.exec(link.getAttribute("href"));
        return match ? match[1] : "";
    }

    function fillCards(list) {
        var cards = Array.prototype.slice.call(document.querySelectorAll(".service-item"));
        if (!cards.length) {
            return;
        }
        var byId = {};
        list.forEach(function (svc) { byId[svc.id] = svc; });
        var seen = {};
        var template = null;
        cards.forEach(function (card) {
            var id = cardId(card);
            var col = card.parentElement;
            if (!id) {
                return;
            }
            template = template || col;
            seen[id] = true;
            if (!byId[id]) {
                col.style.display = "none";
                return;
            }
            col.style.display = "";
            var price = card.querySelector(".text-primary:not(i)");
            if (price && price.tagName === "SPAN") {
                price.textContent = priceText(byId[id].price);
            }
        });
        if (!template) {
            return;
        }
        // New services get a card too (with the shop logo as the icon).
        list.forEach(function (svc) {
            if (seen[svc.id]) {
                return;
            }
            var col = template.cloneNode(true);
            col.style.display = "";
            col.classList.remove("wow");
            col.style.visibility = "visible";
            var card = col.querySelector(".service-item");
            var img = card.querySelector("img");
            if (img) {
                img.setAttribute("src", img.getAttribute("src").replace(/[^/]+$/, "favicon-192.png"));
            }
            card.querySelector("h3").setAttribute("data-i18n", "svc_" + svc.id);
            var p = card.querySelector("p");
            if (p) {
                p.setAttribute("data-i18n", "svc_" + svc.id + "_p");
            }
            var meta = card.querySelector(".service-meta");
            if (meta) {
                meta.setAttribute("data-i18n", "meta_" + svc.id);
            }
            var price = card.querySelector("span.text-primary");
            if (price) {
                price.textContent = priceText(svc.price);
            }
            card.querySelectorAll("a[href*='service=']").forEach(function (a) {
                a.setAttribute("href", a.getAttribute("href").replace(/service=[a-z0-9-]+/, "service=" + svc.id));
            });
            template.parentElement.appendChild(col);
        });
    }

    fetch("/api/services", { credentials: "same-origin" })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
        .then(function (data) {
            var list = (data.services || []).filter(function (s) { return s.active; });
            if (!list.length) {
                return;
            }
            window.StreetManMenu = list;
            fillI18n(list);
            fillSelect(list);
            fillPriceList(list);
            fillCards(list);
            SM.applyLang(lang());
            document.dispatchEvent(new CustomEvent("streetman:menu", { detail: list }));
        })
        .catch(function () { /* keep the static menu */ });
})(window, document);
