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
            nav_cancel: "ยกเลิกคิว",
            crumb_home: "หน้าแรก",
            btn_call: "โทร",
            btn_wa: "WhatsApp",
            btn_facebook: "เฟซบุ๊ก",
            btn_instagram: "อินสตาแกรม",
            btn_email: "อีเมล",
            btn_directions: "แผนที่",
            book_this: "จองคิวนี้",
            book_wa: "จองทาง WhatsApp",
            wa_float: "คุยทาง WhatsApp",
            wa_quick: "สวัสดีครับ ขอจองคิว StreetMan Barber Phuket\nรบกวนช่วยนัดวันและเวลาที่สะดวกด้วยครับ",
            hero1_title: "ตัดให้ดูดีทุกครั้ง",
            hero2_title: "ตัดสวย ราคาชัดเจน",
            hero_hours: "เปิดทุกวัน 11:00–20:00",
            about_badge: "เกี่ยวกับเรา",
            about_title: "มากกว่าแค่ตัดผม",
            about_title_page: "ร้านตัดผมภูเก็ต สำหรับลูกค้าประจำ",
            about_p1: "StreetMan Barber Phuket เป็นร้านในย่านวิชิต อ.เมืองภูเก็ต ตัดเนี๊ยบ บรรยากาศสบาย ไม่รีบ ไม่ยัดเยียดบริการ — สำหรับคนท้องถิ่น ชาวต่างชาติ และนักท่องเที่ยว",
            about_p2: "วอล์กอินได้ หรือจองออนไลน์ ช่างเห็นคิวทันที เปิดทุกวัน 11:00–20:00",
            about_p2_page: "ทีมนำโดยริม มีแบงค์ ริค และดี วอล์กอินได้ หรือจองออนไลน์ เปิดทุกวัน 11:00–20:00",
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
            meta_haircut: "รวมสระ · ประมาณ 60 นาที · คิวสุดท้าย 19:00",
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
            hours_last: "ตัดผมใช้เวลา 1 ชม. · คิวสุดท้าย 19:00 · Stacking สุดท้าย 18:30",
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
            contact_title: "จองคิวหรือคุยกับร้าน",
            contact_p: "จองออนไลน์แล้วคิวขึ้นหน้าจอช่างทันที หรือทัก WhatsApp / โทรถ้ามีคำถาม",
            book_step1: "1. กรอกชื่อ บริการ วันเวลา",
            book_step2: "2. กดยืนยันจองคิว",
            book_step3: "3. ช่างเห็นคิวของตัวเองทันที",
            book_pick_service: "เลือกบริการแล้วจองเลย",
            book_pick_barber: "หรือจองกับช่างที่ต้องการ",
            wa_ask_time: "รบกวนช่วยนัดวันและเวลาที่สะดวกด้วยครับ",
            submit_wa: "เปิด WhatsApp เพื่อจอง",
            opt_any: "ใครก็ได้ที่ว่าง",
            barber_rim: "คุณริม",
            barber_bank: "คุณแบงค์",
            barber_rick: "คุณริค",
            barber_dee: "คุณดี",
            hours_hint: "เปิด 11:00–20:00 · ตัดผมใช้เวลา 1 ชม. · Stacking 1 ชม. 30 นาที",
            page_contact: "ติดต่อ",
            page_book: "จองคิว",
            book_page_title: "จองคิวออนไลน์",
            book_page_p: "เลือกบริการ ช่าง วัน และเวลา แล้วกดยืนยัน จะได้สลิปเป็นรูปให้เซฟไว้แสดงช่าง",
            book_once: "เบอร์โทรหนึ่งเบอร์จองได้ 1 คิวที่ยังไม่ถึงเวลา ถ้าจองซ้ำต้องยกเลิกคิวเดิมก่อน",
            label_name: "ชื่อ",
            label_phone: "เบอร์โทร",
            label_service: "บริการ",
            label_barber: "ช่าง",
            label_date: "วันที่",
            label_time: "เวลา",
            label_note: "รายละเอียดเพิ่ม (ไม่บังคับ)",
            opt_service: "เลือกบริการ",
            opt_time: "เลือกเวลา",
            submit_book: "ยืนยันจองคิว",
            book_ok: "จองสำเร็จแล้ว เซฟรูปสลิปไว้ แล้วแสดงให้ช่างเมื่อถึงร้าน",
            book_ok_wa: "เซฟรูปสลิปด้านล่างได้เลย แล้วค่อยกดส่งข้อความ WhatsApp",
            slip_title: "สลิปจองคิว",
            slip_when: "วันและเวลา",
            slip_show: "ยื่นสลิปนี้ให้ช่างเมื่อถึงร้าน",
            slip_keep: "บันทึกรูปนี้ไว้ในเครื่อง",
            slip_save: "บันทึกรูปเพื่อแสดงช่าง",
            slip_done: "จองสำเร็จแล้ว",
            slip_new: "จองคิวอีกครั้ง",
            slip_after: "หลังกดยืนยัน จะมีสลิปเป็นรูปให้เซฟไว้ แล้วนำไปแสดงช่างเมื่อถึงร้าน",
            slip_hint: "กดปุ่มด้านล่างเพื่อเซฟรูป หรือกดค้างที่รูปบนมือถือ",
            slip_cancel: "ยกเลิกคิวนี้",
            slip_cancel_code: "รหัสยกเลิก",
            slip_cancel_hint: "ยกเลิกได้เองถึง 2 ชั่วโมงก่อนถึงคิว ด้วยรหัสบนสลิป",
            page_cancel: "ยกเลิกคิว",
            cancel_title: "ยกเลิกคิวด้วยรหัสสลิป",
            cancel_p: "ใส่รหัสยกเลิกจากสลิป ไม่ใช้ชื่อหรือเบอร์อย่างเดียว เพื่อไม่ให้คนอื่นยกเลิกคิวคุณได้",
            cancel_lookup: "ตรวจคิว",
            cancel_upload: "อัปโหลดสลิป",
            cancel_upload_hint: "เลือกรูปสลิป ระบบจะอ่านรหัสยกเลิกจาก QR หรือตัวอักษรบนสลิป",
            cancel_reading: "กำลังอ่านสลิป...",
            cancel_read_fail: "อ่านสลิปไม่สำเร็จ ลองถ่ายใหม่ให้เห็น QR หรือรหัสยกเลิกชัดๆ",
            cancel_confirm: "ยืนยันยกเลิกคิวนี้",
            cancel_ok: "ยกเลิกคิวแล้ว ช่องเวลานี้ว่างให้คนอื่นจองได้",
            cancel_too_late: "ใกล้ถึงคิวแล้ว ยกเลิกออนไลน์ไม่ได้ โทร 062-525-8941 หรือทัก WhatsApp ให้ร้านปล่อยคิว",
            cancel_not_found: "ไม่พบคิวจากรหัสนี้ ตรวจรหัสบนสลิปอีกครั้ง",
            cancel_already: "คิวนี้ถูกยกเลิกแล้ว",
            cancel_done: "คิวนี้ตัดเสร็จแล้ว ยกเลิกไม่ได้",
            title_cancel: "ยกเลิกคิว | StreetMan Barber Phuket",
            book_pages_note: "เปิด Dashboard ช่างค้างไว้ คิวจะขึ้นทันที ถ้าช่างยังไม่เปิดหน้า จะส่งไป WhatsApp ให้ร้าน",
            book_fail: "จองไม่สำเร็จ ลองเวลาอื่น หรือโทร 062-525-8941",
            book_slot_taken: "เวลานี้มีการจองแล้ว กรุณาเลือกเวลาอื่น",
            book_barber_full: "ช่างคนนี้รับคิวเต็มแล้ววันนี้ (10 หัว) กรุณาเลือกช่างหรือวันอื่น",
            book_shop_full: "วันนี้คิวเต็มแล้ว กรุณาเลือกวันอื่น",
            book_no_slots: "ช่วงวันนี้ไม่มีเวลาว่างสำหรับบริการนี้แล้ว กรุณาเลือกช่างหรือวันอื่น",
            book_shop_closed: "ร้านปิดรับจองชั่วคราว กรุณาโทร 062-525-8941 หรือลองใหม่เมื่อร้านเปิด",
            book_already: "เบอร์นี้มีคิวอยู่แล้ว กรุณายกเลิกคิวเดิมก่อน หรือโทร 062-525-8941",
            book_slots_updated: "อัปเดตเวลาว่างแล้ว",
            btn_refresh: "รีเฟรช",
            btn_refresh_slots: "รีเฟรชเวลาว่าง",
            staff_login: "สำหรับช่าง",
            page_about: "เกี่ยวกับเรา",
            page_service: "บริการ",
            page_price: "ราคา",
            page_team: "ช่างของเรา",
            page_hours: "เวลาเปิด",
            page_reviews: "รีวิว",
            err_404_title: "ไม่พบหน้านี้",
            err_404_p: "ไม่มีหน้านี้ในเว็บ StreetMan Barber Phuket กลับหน้าแรกหรือจองคิวจากที่นั่น",
            err_404_btn: "กลับหน้าแรก",
            title_home: "ร้านตัดผม StreetMan Barber ภูเก็ต | วิชิต",
            title_about: "เกี่ยวกับเรา | StreetMan Barber ภูเก็ต",
            title_service: "บริการ | StreetMan Barber ภูเก็ต",
            title_price: "ราคา | StreetMan Barber ภูเก็ต",
            title_team: "ช่าง | StreetMan Barber ภูเก็ต",
            title_hours: "เวลาเปิด | StreetMan Barber ภูเก็ต",
            title_contact: "ติดต่อ | StreetMan Barber ภูเก็ต",
            title_book: "จองคิวออนไลน์ | StreetMan Barber ภูเก็ต",
            title_reviews: "รีวิว | StreetMan Barber ภูเก็ต",
            title_404: "ไม่พบหน้า | StreetMan Barber Phuket"
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
            nav_cancel: "Cancel",
            crumb_home: "Home",
            btn_call: "Call",
            btn_wa: "WhatsApp",
            btn_facebook: "Facebook",
            btn_instagram: "Instagram",
            btn_email: "Email",
            btn_directions: "Directions",
            book_this: "Book this",
            book_wa: "Book on WhatsApp",
            wa_float: "Chat on WhatsApp",
            wa_quick: "Hi StreetMan Barber Phuket, I would like to book a cut.\nPlease let me know a day and time that works.",
            hero1_title: "We Will Keep You An Awesome Look",
            hero2_title: "Luxury Haircut at Affordable Price",
            hero_hours: "Open every day 11:00–20:00",
            about_badge: "About Us",
            about_title: "More Than Just A Haircut",
            about_title_page: "A Phuket Barbershop Built For Regulars",
            about_p1: "StreetMan Barber Phuket is a neighborhood shop in Wichit, Mueang Phuket. We keep the cut clean and the vibe easy — no rush, no upsell, just a proper barbershop for locals, expats, and travelers.",
            about_p2: "Walk in or book online — your barber sees the queue right away. Open every day from 11:00 AM to 8:00 PM.",
            about_p2_page: "The team is led by Rim, with Bank, Rick, and Dee on the chairs. Walk in or book online. We are open every day from 11:00 AM to 8:00 PM.",
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
            meta_haircut: "Wash included · about 60 min · last slot 19:00",
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
            hours_last: "Haircut takes 1 hour · last slot 19:00 · last stacking 18:30",
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
            contact_title: "Book or message the shop",
            contact_p: "Book online and the barber sees your slot at once. WhatsApp or call if you have a question.",
            book_step1: "1. Pick service, barber, day and time",
            book_step2: "2. Confirm the booking",
            book_step3: "3. Your barber sees only their own queue",
            book_pick_service: "Pick a service and book now",
            book_pick_barber: "Or book with a barber",
            wa_ask_time: "Please let me know a day and time that works.",
            submit_wa: "Open WhatsApp to book",
            opt_any: "Anyone available",
            barber_rim: "Rim",
            barber_bank: "Bank",
            barber_rick: "Rick",
            barber_dee: "Dee",
            hours_hint: "Open 11:00–20:00 · haircut 1 hour · stacking 90 min",
            page_contact: "Contact",
            page_book: "Book",
            book_page_title: "Book online",
            book_page_p: "Pick a service, barber, day and time. After you confirm, save the slip image and show it to your barber.",
            book_once: "One phone number can hold 1 upcoming booking. Cancel the existing one before booking again.",
            label_name: "Your name",
            label_phone: "Phone",
            label_service: "Service",
            label_barber: "Barber",
            label_date: "Date",
            label_time: "Time",
            label_note: "Note (optional)",
            opt_service: "Choose a service",
            opt_time: "Choose a time",
            submit_book: "Confirm booking",
            book_ok: "Booked. Save the slip image and show it to your barber.",
            book_ok_wa: "Save the slip image below, then send the WhatsApp message.",
            slip_title: "Booking slip",
            slip_when: "Date and time",
            slip_show: "Show this slip to your barber",
            slip_keep: "Save this image on your phone",
            slip_save: "Save image to show the barber",
            slip_done: "Booking confirmed",
            slip_new: "Make another booking",
            slip_after: "After you confirm, you will get a slip image to save and show the barber.",
            slip_hint: "Tap the button below to save the image, or press and hold it on a phone.",
            slip_cancel: "Cancel this booking",
            slip_cancel_code: "Cancel code",
            slip_cancel_hint: "You can cancel yourself until 2 hours before the slot, using the code on the slip.",
            page_cancel: "Cancel booking",
            cancel_title: "Cancel with the slip code",
            cancel_p: "Enter the cancel code from your slip. Name or phone alone is not enough, so other people cannot cancel your slot.",
            cancel_lookup: "Find booking",
            cancel_upload: "Upload slip",
            cancel_upload_hint: "Choose the slip photo. The page will read the cancel code from the QR or the text on the slip.",
            cancel_reading: "Reading the slip...",
            cancel_read_fail: "Could not read the slip. Try a clearer photo of the QR or cancel code.",
            cancel_confirm: "Confirm cancellation",
            cancel_ok: "Booking cancelled. This time is free again.",
            cancel_too_late: "It is too close to the appointment. Call 062-525-8941 or WhatsApp the shop to release the slot.",
            cancel_not_found: "No booking matches this code. Check the code on your slip.",
            cancel_already: "This booking is already cancelled.",
            cancel_done: "This booking is already finished and cannot be cancelled.",
            title_cancel: "Cancel booking | StreetMan Barber Phuket",
            book_pages_note: "If the barber has Dashboard open, the queue appears at once. If not, the booking is sent on WhatsApp.",
            book_fail: "Could not book. Try another time or call 062-525-8941.",
            book_slot_taken: "This time is already booked. Please pick another time.",
            book_barber_full: "This barber is full today (10 heads). Please pick another barber or day.",
            book_shop_full: "The shop is fully booked today. Please pick another day.",
            book_no_slots: "No times left for this service today. Please pick another barber or day.",
            book_shop_closed: "The shop is not taking online bookings right now. Call 062-525-8941 or try again later.",
            book_already: "This phone already has a booking. Cancel it first or call 062-525-8941.",
            book_slots_updated: "Available times updated.",
            btn_refresh: "Refresh",
            btn_refresh_slots: "Refresh available times",
            staff_login: "Barber login",
            page_about: "About",
            page_service: "Services",
            page_price: "Prices",
            page_team: "Our Barbers",
            page_hours: "Working Hours",
            page_reviews: "Reviews",
            err_404_title: "Page Not Found",
            err_404_p: "This page is not on the StreetMan Barber Phuket site. Head home or book a cut from there.",
            err_404_btn: "Go Back To Home",
            title_home: "StreetMan Barber Phuket | Wichit barbershop",
            title_about: "About | StreetMan Barber Phuket",
            title_service: "Services | StreetMan Barber Phuket",
            title_price: "Prices | StreetMan Barber Phuket",
            title_team: "Barbers | StreetMan Barber Phuket",
            title_hours: "Hours | StreetMan Barber Phuket",
            title_contact: "Contact | StreetMan Barber Phuket",
            title_book: "Book online | StreetMan Barber Phuket",
            title_reviews: "Reviews | StreetMan Barber Phuket",
            title_404: "Page not found | StreetMan Barber Phuket"
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

        document.querySelectorAll(".js-wa-book").forEach(function (el) {
            el.setAttribute("href", waUrl(buildSimpleBookText({
                service: el.getAttribute("data-service") || "",
                barber: el.getAttribute("data-barber") || ""
            }, lang)));
        });

        document.querySelectorAll(".lang-btn").forEach(function (btn) {
            btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
        });
    }

    function buildSimpleBookText(data, lang) {
        lang = lang || detectLang();
        var lines = lang === "th"
            ? ["สวัสดีครับ ขอจองคิว StreetMan Barber Phuket"]
            : ["Hi StreetMan Barber Phuket, I would like to book."];

        if (data.service) {
            lines.push((lang === "th" ? "บริการ: " : "Service: ") + t("svc_" + data.service, lang));
        }
        if (data.barber) {
            lines.push((lang === "th" ? "ช่าง: " : "Barber: ") + t("barber_" + data.barber, lang));
        }
        lines.push(t("wa_ask_time", lang));
        return lines.join("\n");
    }

    window.StreetMan = {
        I18N: I18N,
        MAPS_URL: MAPS_URL,
        detectLang: detectLang,
        t: t,
        waUrl: waUrl,
        applyLang: applyLang,
        buildSimpleBookText: buildSimpleBookText
    };

    applyLang(detectLang());
})(window);
