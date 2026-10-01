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
        var current = window.StreetMan.pageLang();
        if (current && lang !== current) {
            // Built pages have a twin per language: /price <-> /en/price.
            try { window.localStorage.setItem("streetman-lang", lang); } catch (err) {}
            var path = window.location.pathname;
            var target = lang === "en"
                ? "/en" + (path === "/" ? "/" : path)
                : (path.replace(/^\/en(?=\/|$)/, "") || "/");
            window.location.href = target + window.location.search + window.location.hash;
            return;
        }
        window.StreetMan.applyLang(lang);
    });
})(jQuery);
