(function ($) {
    "use strict";

    var spinner = function () {
        setTimeout(function () {
            if ($("#spinner").length > 0) {
                $("#spinner").removeClass("show");
            }
        }, 1);
    };
    spinner();

    if (typeof WOW !== "undefined") {
        new WOW().init();
    }

    $(window).scroll(function () {
        if ($(this).scrollTop() > 300) {
            $(".sticky-top").addClass("shadow-sm");
        } else {
            $(".sticky-top").removeClass("shadow-sm");
        }
    });

    $(window).scroll(function () {
        if ($(this).scrollTop() > 300) {
            $(".back-to-top").fadeIn("slow");
        } else {
            $(".back-to-top").fadeOut("slow");
        }
    });
    $(".back-to-top").click(function () {
        $("html, body").animate({ scrollTop: 0 }, 1500, "easeInOutExpo");
        return false;
    });

    if ($(".testimonial-carousel").length) {
        $(".testimonial-carousel").owlCarousel({
            autoplay: true,
            smartSpeed: 1000,
            loop: true,
            nav: false,
            dots: true,
            items: 1,
            dotsData: true
        });
    }

    $(document).on("click", ".lang-btn", function () {
        var lang = $(this).attr("data-lang");
        window.StreetMan.applyLang(lang);
        fillTimeSlots();
    });

    function todayISO() {
        var now = new Date();
        var month = String(now.getMonth() + 1).padStart(2, "0");
        var day = String(now.getDate()).padStart(2, "0");
        return now.getFullYear() + "-" + month + "-" + day;
    }

    function fillTimeSlots() {
        var $time = $("#time");
        if (!$time.length || !window.StreetMan) {
            return;
        }
        var service = $("#service").val();
        var last = window.StreetMan.LAST_SLOT[service] || "19:00";
        var current = $time.val();
        var lang = window.StreetMan.detectLang();
        var options = ['<option value="">' + window.StreetMan.t("opt_time", lang) + "</option>"];

        window.StreetMan.TIME_SLOTS.forEach(function (slot) {
            if (slot <= last) {
                options.push('<option value="' + slot + '">' + slot + "</option>");
            }
        });

        $time.html(options.join(""));
        if (current && current <= last) {
            $time.val(current);
        }
    }

    var $date = $("#date");
    if ($date.length) {
        $date.attr("min", todayISO());
    }

    var params = new URLSearchParams(window.location.search);
    if (params.get("service") && $("#service").length) {
        $("#service").val(params.get("service"));
    }
    if (params.get("barber") && $("#barber").length) {
        $("#barber").val(params.get("barber"));
    }

    fillTimeSlots();
    $("#service").on("change", fillTimeSlots);

    $("#booking-form").on("submit", function (e) {
        e.preventDefault();

        var name = $.trim($("#name").val());
        var phone = $.trim($("#phone").val());
        var service = $("#service").val();
        var barber = $("#barber").val() || "any";
        var date = $("#date").val();
        var time = $("#time").val();
        var note = $.trim($("#note").val());
        var lang = window.StreetMan.detectLang();

        if (!name || !service || !date || !time) {
            $("#form-alert")
                .removeClass("d-none alert-success")
                .addClass("alert-danger")
                .text(window.StreetMan.t("form_need", lang));
            return;
        }

        var text = window.StreetMan.buildBookingText({
            name: name,
            phone: phone,
            service: service,
            barber: barber,
            date: date,
            time: time,
            note: note
        }, lang);

        $("#form-alert")
            .removeClass("d-none alert-danger")
            .addClass("alert-success")
            .text(window.StreetMan.t("form_opening", lang));

        window.open(window.StreetMan.waUrl(text), "_blank");
    });
})(jQuery);
