(function (window) {
    "use strict";

    var STORAGE_KEY = "streetman-lang";
    var WA_NUMBER = "66625258941";
    var MAPS_URL = "https://www.google.com/maps/dir/?api=1&destination=7.858419,98.361948";

    var I18N = {
        th: {
            nav_home: "หน้าแรก",
            nav_about: "เกี่ยวกับเรา",
            nav_service: "บริการ",
            nav_price: "ราคา",
            nav_team: "ช่าง",
            nav_hours: "เวลาเปิด",
            nav_contact: "ติดต่อ",
            nav_book: "จองคิว",
            crumb_home: "หน้าแรก",
            btn_call: "โทร",
            btn_wa: "WhatsApp",
            btn_email: "อีเมล",
            btn_directions: "แผนที่",
            book_this: "จองคิวนี้",
            book_wa: "จองทาง WhatsApp",
            wa_float: "คุยทาง WhatsApp",
            wa_quick: "สวัสดีครับ ขอจองคิว StreetMan Barber",
            hero1_title: "ตัดให้ดูดีทุกครั้ง",
            hero2_title: "ตัดสวย ราคาชัดเจน",
            hero_hours: "เปิดทุกวัน 11:00–20:00",
            about_badge: "เกี่ยวกับเรา",
            about_title: "มากกว่าแค่ตัดผม",
            about_title_page: "ร้านตัดผมภูเก็ต สำหรับลูกค้าประจำ",
            about_p1: "StreetMan Barber เป็นร้านในย่านวิชิต อ.เมืองภูเก็ต ตัดเนี๊ยบ บรรยากาศสบาย ไม่รีบ ไม่ยัดเยียดบริการ — สำหรับคนท้องถิ่น ชาวต่างชาติ และนักท่องเที่ยว",
            about_p2: "วอล์กอินได้ หรือจองผ่านฟอร์มแล้วส่ง WhatsApp เปิดทุกวัน 11:00–20:00",
            about_p2_page: "ทีมนำโดยริม มีแบงค์ ริค และดี วอล์กอินได้ หรือจองผ่านฟอร์ม เปิดทุกวัน 11:00–20:00",
            about_stat: "เปิดร้าน",
            about_stat_sub: "ตั้งแต่ 2021",
            about_since: "ตั้งแต่ 2021",
            about_since_p: "ร้านท้องถิ่นภูเก็ต เน้นเฟดสะอาด ราคาชัดเจน",
            about_clients: "ลูกค้า 1,000+",
            about_clients_p: "ทั้งคนที่อยู่ที่นี่และคนที่อยากได้ทรงที่ไว้ใจได้",
            svc_badge: "บริการ",
            svc_title: "บริการของร้าน",
            svc_haircut: "ตัดผม",
            svc_haircut_p: "ทรงคลาสสิกและโมเดิร์น รวมสระและจัดทรง บอกสไตล์มาได้เลย",
            svc_beard: "ตกแต่งเครา",
            svc_beard_p: "เก็บขอบให้เข้ากับรูปหน้าและทรงผม",
            svc_shave: "โกนหนวด",
            svc_shave_p: "โกนเนียน สบาย เมื่ออยากได้ลุคสะอาด",
            svc_dye: "ย้อมผม",
            svc_dye_p: "ปิดผมขาว หรือรีเฟรชสี ให้ดูเป็นธรรมชาติ",
            svc_mustache: "ตกแต่งหนวด",
            svc_mustache_p: "เก็บรายละเอียดให้คม เรียบร้อย",
            svc_stacking: "เซ็ตทรง / Stacking",
            svc_stacking_p: "จัดทรงเต็มรูปแบบ เมื่ออยากได้ลุคใหม่ทั้งหัว",
            meta_haircut: "รวมสระ · ประมาณ 45 นาที · คิวสุดท้าย 19:00",
            meta_beard: "ประมาณ 20 นาที",
            meta_shave: "ประมาณ 20 นาที",
            meta_dye: "ส่วนเสริมคู่กับตัดผม · ประมาณ 20 นาที",
            meta_mustache: "ประมาณ 30 นาที",
            meta_stacking: "จัดทรงเต็ม · ประมาณ 90 นาที · คิวสุดท้าย 18:30",
            price_badge: "ราคา",
            price_title: "บริการและราคา",
            team_badge: "ช่างของเรา",
            team_title: "ทีมช่าง",
            role_owner: "เจ้าของร้าน",
            role_barber: "ช่างตัดผม",
            book_rim: "จองกับริม",
            book_bank: "จองกับแบงค์",
            book_rick: "จองกับริค",
            book_dee: "จองกับดี",
            hours_badge: "เวลาเปิด",
            hours_title: "เปิดทุกวัน",
            hours_everyday: "ทุกวัน 11:00–20:00",
            hours_last: "คิวตัดผมสุดท้าย 19:00 · Stacking สุดท้าย 18:30",
            day_mon: "จันทร์",
            day_tue: "อังคาร",
            day_wed: "พุธ",
            day_thu: "พฤหัสบดี",
            day_fri: "ศุกร์",
            day_sat: "เสาร์",
            day_sun: "อาทิตย์",
            reviews_badge: "รีวิว",
            reviews_title: "ลูกค้าพูดถึงเรา",
            rev_mark_role: "แขกจากอังกฤษ",
            rev_mark: "เฟดที่ดีที่สุดที่ได้ในภูเก็ต ร้านสบาย ริมทำอย่างตั้งใจ ราคาแฟร์",
            rev_natt_role: "ลูกค้าประจำ",
            rev_natt: "มาทุกเดือน จำทรงที่ชอบได้ และไม่รีบตัด",
            rev_james_role: "ชาวต่างชาติที่ย่านวิชิต",
            rev_james: "เดินเข้ามา จองคิวถัดไปทาง WhatsApp แล้วออกไปอย่างมั่นใจ",
            footer_touch: "ติดต่อร้าน",
            footer_links: "ลิงก์ด่วน",
            footer_book: "จองคิว",
            footer_walkin: "วอล์กอินได้ ช่วงร้านหนาแน่น โทรหรือ WhatsApp จะเร็วกว่า",
            footer_copy: "สงวนลิขสิทธิ์",
            contact_badge: "ติดต่อเรา",
            contact_title: "จองคิว หรือสอบถาม",
            contact_p: "วอล์กอินได้ ถ้าอยากล็อกเก้าอี้ กรอกฟอร์มแล้วส่งเข้า WhatsApp ข้อความจะครบให้ช่างอ่านเลย",
            label_name: "ชื่อ",
            label_phone: "เบอร์โทร",
            label_service: "บริการ",
            label_barber: "ช่าง",
            label_date: "วันที่",
            label_time: "เวลา",
            label_note: "รายละเอียดเพิ่ม (ไม่บังคับ)",
            note_placeholder: "เช่น อยากได้เฟดสั้น / มาเป็นคู่",
            opt_service: "เลือกบริการ",
            opt_time: "เลือกเวลา",
            opt_any: "ใครก็ได้ที่ว่าง",
            barber_rim: "คุณริม",
            barber_bank: "คุณแบงค์",
            barber_rick: "คุณริค",
            barber_dee: "คุณดี",
            submit_wa: "ส่งจองทาง WhatsApp",
            form_need: "กรุณากรอกชื่อ บริการ วัน และเวลา",
            form_opening: "กำลังเปิด WhatsApp พร้อมข้อความจอง...",
            hours_hint: "เปิด 11:00–20:00 · ตัดผมคิวสุดท้าย 19:00 · Stacking คิวสุดท้าย 18:30",
            page_contact: "ติดต่อ",
            page_about: "เกี่ยวกับเรา",
            page_service: "บริการ",
            page_price: "ราคา",
            page_team: "ช่างของเรา",
            page_hours: "เวลาเปิด",
            page_reviews: "รีวิว",
            err_404_title: "ไม่พบหน้านี้",
            err_404_p: "ไม่มีหน้านี้ในเว็บ StreetMan Barber กลับหน้าแรกหรือจองคิวจากที่นั่น",
            err_404_btn: "กลับหน้าแรก",
            title_home: "StreetMan Barber | ภูเก็ต",
            title_about: "เกี่ยวกับเรา | StreetMan Barber ภูเก็ต",
            title_service: "บริการ | StreetMan Barber ภูเก็ต",
            title_price: "ราคา | StreetMan Barber ภูเก็ต",
            title_team: "ช่าง | StreetMan Barber ภูเก็ต",
            title_hours: "เวลาเปิด | StreetMan Barber ภูเก็ต",
            title_contact: "จองคิว | StreetMan Barber ภูเก็ต",
            title_reviews: "รีวิว | StreetMan Barber ภูเก็ต",
            title_404: "ไม่พบหน้า | StreetMan Barber"
        },
        en: {
            nav_home: "Home",
            nav_about: "About",
            nav_service: "Services",
            nav_price: "Prices",
            nav_team: "Barbers",
            nav_hours: "Hours",
            nav_contact: "Contact",
            nav_book: "Book",
            crumb_home: "Home",
            btn_call: "Call",
            btn_wa: "WhatsApp",
            btn_email: "Email",
            btn_directions: "Directions",
            book_this: "Book this",
            book_wa: "Book on WhatsApp",
            wa_float: "Chat on WhatsApp",
            wa_quick: "Hi StreetMan Barber, I would like to book a cut.",
            hero1_title: "We Will Keep You An Awesome Look",
            hero2_title: "Luxury Haircut at Affordable Price",
            hero_hours: "Open every day 11:00–20:00",
            about_badge: "About Us",
            about_title: "More Than Just A Haircut",
            about_title_page: "A Phuket Barbershop Built For Regulars",
            about_p1: "StreetMan Barber is a neighborhood shop in Wichit, Mueang Phuket. We keep the cut clean and the vibe easy — no rush, no upsell, just a proper barbershop for locals, expats, and travelers.",
            about_p2: "Walk in or book on the form — it opens WhatsApp. Open every day from 11:00 AM to 8:00 PM.",
            about_p2_page: "The team is led by Rim, with Bank, Rick, and Dee on the chairs. Walk in or book through the form. We are open every day from 11:00 AM to 8:00 PM.",
            about_stat: "Open since",
            about_stat_sub: "2021",
            about_since: "Since 2021",
            about_since_p: "A local Phuket shop built around regulars, clean fades, and a straightforward price list.",
            about_clients: "1000+ clients",
            about_clients_p: "Trusted by people who live here and guests who want a reliable cut.",
            svc_badge: "Services",
            svc_title: "What We Provide",
            svc_haircut: "Haircut",
            svc_haircut_p: "Classic and modern cuts with wash and finish. Tell us the style — we will match it.",
            svc_beard: "Beard Trim",
            svc_beard_p: "Clean lines and a shape that fits your face and haircut.",
            svc_shave: "Men's Shave",
            svc_shave_p: "A close, comfortable shave when you want a clean finish.",
            svc_dye: "Hair Dyeing",
            svc_dye_p: "Cover gray or refresh your color with a natural result.",
            svc_mustache: "Mustache",
            svc_mustache_p: "Precision trim and style so the details stay sharp.",
            svc_stacking: "Stacking / Restyle",
            svc_stacking_p: "Full stacking and style work when you want a complete look.",
            meta_haircut: "Wash included · about 45 min · last slot 19:00",
            meta_beard: "About 20 min",
            meta_shave: "About 20 min",
            meta_dye: "Add-on with a haircut · about 20 min",
            meta_mustache: "About 30 min",
            meta_stacking: "Full restyle · about 90 min · last slot 18:30",
            price_badge: "Prices",
            price_title: "Barber Services And Prices",
            team_badge: "Our Barbers",
            team_title: "Meet The Team",
            role_owner: "Owner",
            role_barber: "Barber",
            book_rim: "Book Rim",
            book_bank: "Book Bank",
            book_rick: "Book Rick",
            book_dee: "Book Dee",
            hours_badge: "Working Hours",
            hours_title: "Open Every Day",
            hours_everyday: "Every day 11:00–20:00",
            hours_last: "Last haircut 19:00 · Last stacking 18:30",
            day_mon: "Monday",
            day_tue: "Tuesday",
            day_wed: "Wednesday",
            day_thu: "Thursday",
            day_fri: "Friday",
            day_sat: "Saturday",
            day_sun: "Sunday",
            reviews_badge: "Reviews",
            reviews_title: "What Our Clients Say",
            rev_mark_role: "Guest from the UK",
            rev_mark: "Best fade I have had in Phuket. The shop is relaxed, Rim took his time, and the price is fair.",
            rev_natt_role: "Regular",
            rev_natt: "I come every month. They remember how I like it and never rush the cut.",
            rev_james_role: "Expat in Wichit",
            rev_james: "Walked in, booked the next slot on WhatsApp, and left looking sharp. Easy shop to come back to.",
            footer_touch: "Get In Touch",
            footer_links: "Quick Links",
            footer_book: "Book A Cut",
            footer_walkin: "Walk-ins welcome. Phone or WhatsApp is faster during peak hours.",
            footer_copy: "All Rights Reserved",
            contact_badge: "Contact Us",
            contact_title: "Book A Cut Or Ask A Question",
            contact_p: "Walk-ins are welcome. To reserve a chair, fill the form — it opens WhatsApp with every detail the barber needs.",
            label_name: "Your name",
            label_phone: "Phone",
            label_service: "Service",
            label_barber: "Barber",
            label_date: "Date",
            label_time: "Time",
            label_note: "Extra detail (optional)",
            note_placeholder: "e.g. short fade / coming as a pair",
            opt_service: "Choose a service",
            opt_time: "Choose a time",
            opt_any: "Anyone available",
            barber_rim: "Rim",
            barber_bank: "Bank",
            barber_rick: "Rick",
            barber_dee: "Dee",
            submit_wa: "Send on WhatsApp",
            form_need: "Please enter your name, service, date, and time.",
            form_opening: "Opening WhatsApp with your booking...",
            hours_hint: "Open 11:00–20:00 · last haircut 19:00 · last stacking 18:30",
            page_contact: "Contact",
            page_about: "About",
            page_service: "Services",
            page_price: "Prices",
            page_team: "Our Barbers",
            page_hours: "Working Hours",
            page_reviews: "Reviews",
            err_404_title: "Page Not Found",
            err_404_p: "This page is not on the StreetMan Barber site. Head home or book a cut from there.",
            err_404_btn: "Go Back To Home",
            title_home: "StreetMan Barber | Phuket",
            title_about: "About | StreetMan Barber Phuket",
            title_service: "Services | StreetMan Barber Phuket",
            title_price: "Prices | StreetMan Barber Phuket",
            title_team: "Barbers | StreetMan Barber Phuket",
            title_hours: "Hours | StreetMan Barber Phuket",
            title_contact: "Book | StreetMan Barber Phuket",
            title_reviews: "Reviews | StreetMan Barber Phuket",
            title_404: "Page not found | StreetMan Barber"
        }
    };

    var LAST_SLOT = {
        haircut: "19:00",
        beard: "19:30",
        shave: "19:30",
        dye: "19:30",
        mustache: "19:30",
        stacking: "18:30"
    };

    var TIME_SLOTS = [
        "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
        "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
        "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
    ];

    function detectLang() {
        var stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === "th" || stored === "en") {
            return stored;
        }
        var nav = (navigator.language || navigator.userLanguage || "en").toLowerCase();
        return nav.indexOf("th") === 0 ? "th" : "en";
    }

    function t(key, lang) {
        lang = lang || detectLang();
        var table = I18N[lang] || I18N.en;
        return table[key] || (I18N.en[key] || key);
    }

    function waUrl(text) {
        return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(text);
    }

    function applyLang(lang) {
        lang = lang || detectLang();
        if (lang !== "th" && lang !== "en") {
            lang = "en";
        }
        window.localStorage.setItem(STORAGE_KEY, lang);
        document.documentElement.lang = lang;
        document.documentElement.setAttribute("data-lang", lang);

        var page = document.body ? document.body.getAttribute("data-page") : "";
        if (page) {
            var titleKey = "title_" + page;
            if (I18N[lang][titleKey]) {
                document.title = I18N[lang][titleKey];
            }
        }

        document.querySelectorAll("[data-i18n]").forEach(function (el) {
            var key = el.getAttribute("data-i18n");
            if (key && t(key, lang)) {
                el.textContent = t(key, lang);
            }
        });

        document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
            var key = el.getAttribute("data-i18n-placeholder");
            if (key) {
                el.setAttribute("placeholder", t(key, lang));
            }
        });

        document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
            var key = el.getAttribute("data-i18n-aria");
            if (key) {
                el.setAttribute("aria-label", t(key, lang));
            }
        });

        document.querySelectorAll(".js-wa-quick").forEach(function (el) {
            el.setAttribute("href", waUrl(t("wa_quick", lang)));
        });

        document.querySelectorAll(".lang-btn").forEach(function (btn) {
            btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
        });
    }

    function buildBookingText(data, lang) {
        lang = lang || detectLang();
        var serviceLabel = t("svc_" + data.service, lang);
        var barberLabel = data.barber === "any" || !data.barber
            ? t("opt_any", lang)
            : t("barber_" + data.barber, lang);

        var lines;
        if (lang === "th") {
            lines = [
                "สวัสดีครับ ขอจองคิว StreetMan Barber",
                "ชื่อ: " + data.name,
                "บริการ: " + serviceLabel,
                "ช่าง: " + barberLabel,
                "วันที่: " + data.date,
                "เวลา: " + data.time
            ];
            if (data.phone) {
                lines.push("เบอร์: " + data.phone);
            }
            if (data.note) {
                lines.push("หมายเหตุ: " + data.note);
            }
        } else {
            lines = [
                "Hi StreetMan Barber, I would like to book.",
                "Name: " + data.name,
                "Service: " + serviceLabel,
                "Barber: " + barberLabel,
                "Date: " + data.date,
                "Time: " + data.time
            ];
            if (data.phone) {
                lines.push("Phone: " + data.phone);
            }
            if (data.note) {
                lines.push("Note: " + data.note);
            }
        }
        return lines.join("\n");
    }

    window.StreetMan = {
        I18N: I18N,
        LAST_SLOT: LAST_SLOT,
        TIME_SLOTS: TIME_SLOTS,
        MAPS_URL: MAPS_URL,
        detectLang: detectLang,
        t: t,
        waUrl: waUrl,
        applyLang: applyLang,
        buildBookingText: buildBookingText
    };

    applyLang(detectLang());
})(window);
