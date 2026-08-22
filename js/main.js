(function ($) {
    "use strict";

    // Spinner
    var spinner = function () {
        setTimeout(function () {
            if ($('#spinner').length > 0) {
                $('#spinner').removeClass('show');
            }
        }, 1);
    };
    spinner();
    
    
    // Initiate the wowjs
    new WOW().init();


    // Sticky Navbar
    $(window).scroll(function () {
        if ($(this).scrollTop() > 300) {
            $('.sticky-top').addClass('shadow-sm').css('top', '0px');
        } else {
            $('.sticky-top').removeClass('shadow-sm').css('top', '-100px');
        }
    });
    
    
    // Back to top button
    $(window).scroll(function () {
        if ($(this).scrollTop() > 300) {
            $('.back-to-top').fadeIn('slow');
        } else {
            $('.back-to-top').fadeOut('slow');
        }
    });
    $('.back-to-top').click(function () {
        $('html, body').animate({scrollTop: 0}, 1500, 'easeInOutExpo');
        return false;
    });


    // Testimonials carousel
    if ($('.testimonial-carousel').length) {
        $('.testimonial-carousel').owlCarousel({
            autoplay: true,
            smartSpeed: 1000,
            loop: true,
            nav: false,
            dots: true,
            items: 1,
            dotsData: true,
        });
    }


    // Booking / contact form → WhatsApp
    $('#booking-form').on('submit', function (e) {
        e.preventDefault();

        var name = $.trim($('#name').val());
        var email = $.trim($('#email').val());
        var subject = $.trim($('#subject').val()) || 'Appointment';
        var message = $.trim($('#message').val());

        if (!name || !message) {
            $('#form-alert')
                .removeClass('d-none alert-success')
                .addClass('alert-danger')
                .text('Please enter your name and message.');
            return;
        }

        var text = 'Hi StreetMan Barber, I am ' + name + '.' +
            (email ? ' Email: ' + email + '.' : '') +
            ' ' + subject + ': ' + message;

        $('#form-alert')
            .removeClass('d-none alert-danger')
            .addClass('alert-success')
            .text('Opening WhatsApp with your message...');

        window.open('https://wa.me/66625258941?text=' + encodeURIComponent(text), '_blank');
    });

    
})(jQuery);

