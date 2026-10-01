// PromptPay QR payloads (Thai QR Payment / EMVCo). With an amount, banking apps
// open with the amount already filled in.
(function (root) {
    "use strict";

    function field(id, value) {
        return id + String(value.length).padStart(2, "0") + value;
    }

    function crc16(text) {
        var crc = 0xffff;
        for (var i = 0; i < text.length; i++) {
            crc ^= text.charCodeAt(i) << 8;
            for (var bit = 0; bit < 8; bit++) {
                crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
                crc &= 0xffff;
            }
        }
        return crc.toString(16).toUpperCase().padStart(4, "0");
    }

    // Phone 0XXXXXXXXX, 13-digit citizen / tax ID, or 15-digit e-wallet ID. Returns digits or "".
    function normalize(id) {
        var digits = String(id || "").replace(/\D/g, "");
        if (/^0\d{9}$/.test(digits) || /^\d{13}$/.test(digits) || /^\d{15}$/.test(digits)) {
            return digits;
        }
        return "";
    }

    function payload(id, amount) {
        var digits = normalize(id);
        if (!digits) {
            return "";
        }
        var account = digits.length === 10
            ? field("01", ("0000000000000" + "66" + digits.slice(1)).slice(-13))
            : field(digits.length === 13 ? "02" : "03", digits);
        var value = Number(amount);
        var hasAmount = isFinite(value) && value > 0;
        var text =
            field("00", "01") +
            field("01", hasAmount ? "12" : "11") +
            field("29", field("00", "A000000677010111") + account) +
            field("58", "TH") +
            field("53", "764") +
            (hasAmount ? field("54", value.toFixed(2)) : "") +
            "6304";
        return text + crc16(text);
    }

    // "081-234-5678" / "1-2345-67890-12-3" for display.
    function format(id) {
        var d = normalize(id);
        if (d.length === 10) {
            return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
        }
        if (d.length === 13) {
            return d[0] + "-" + d.slice(1, 5) + "-" + d.slice(5, 10) + "-" + d.slice(10, 12) + "-" + d[12];
        }
        return d;
    }

    var api = { normalize: normalize, payload: payload, format: format, crc16: crc16 };
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.PromptPay = api;
    }
})(typeof window !== "undefined" ? window : this);
