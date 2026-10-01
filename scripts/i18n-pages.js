"use strict";

// Build-time language pages for SEO. Each public Thai page is copied to dist/
// with hreflang links and FAQ structured data, and an English twin is written
// to dist/en/ by applying the EN strings from js/i18n.js to the same markup —
// the same keys the browser uses when someone presses the EN button.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ORIGIN = "https://streeetmanbarberphuket.shop";
const LAST_UPDATED = "2026-10-01";
// Pages that have an English twin under /en/. cancel switches language in place instead.
const SLUGS = ["about", "service", "price", "team", "open", "contact", "testimonial", "book"];

// file -> clean path and English SEO text (Thai SEO text lives in the HTML, see update-seo.js).
const PAGES = {
    "index.html": {
        path: "/",
        title: "Barbershop in Phuket, Wichit | StreetMan Barber Phuket",
        description: "Men's barbershop in Wichit, Phuket. Haircuts, fades, beard trims and shaves from 200 THB. Open daily 11:00–20:00. Walk-ins welcome, book online."
    },
    "about.html": {
        path: "/about",
        title: "About Our Phuket Barbershop | StreetMan Barber Wichit",
        description: "Meet StreetMan Barber Phuket, a local men's barbershop in Wichit since 2021, cutting hair for Phuket locals, expats and visitors."
    },
    "service.html": {
        path: "/service",
        title: "Men's Haircut, Fade & Beard Services in Phuket | StreetMan",
        description: "Men's haircuts and fades in Phuket, beard trims, shaves, hair dye and Stacking restyles, with clear prices and service times in Wichit."
    },
    "price.html": {
        path: "/price",
        title: "Men's Haircut Prices in Phuket from 300 THB | StreetMan Barber",
        description: "Haircut 300 THB, beard trim and shave 200 THB, hair dye 150 THB. Clear barbershop prices in Wichit, Phuket. Pay cash or bank transfer."
    },
    "team.html": {
        path: "/team",
        title: "Our Barbers in Phuket | StreetMan Barber Wichit",
        description: "Choose your barber at StreetMan Barber in Wichit, Phuket: Rim, Bank, Rick or Dee. See the team and book a free time online."
    },
    "open.html": {
        path: "/open",
        title: "Opening Hours: Open Daily 11:00–20:00 | StreetMan Barber Phuket",
        description: "StreetMan Barber Phuket is open every day 11:00–20:00 in Wichit. Last haircut 19:00. Check free times and book online."
    },
    "contact.html": {
        path: "/contact",
        title: "Barber Near Me in Wichit, Phuket | Map & Contact",
        description: "Map and contact for StreetMan Barber Phuket at 19/82 Moo 2, Wichit, Mueang Phuket. Call, WhatsApp or book online."
    },
    "testimonial.html": {
        path: "/testimonial",
        title: "Reviews of Our Phuket Barbershop | StreetMan Barber",
        description: "What Thai and international customers say about StreetMan Barber Phuket, a men's barbershop in Wichit."
    },
    "book.html": {
        path: "/book",
        title: "Book a Haircut Online in Phuket | StreetMan Barber",
        description: "Book a haircut in Phuket online. Choose your service, barber, day and time. StreetMan Barber Wichit, open daily 11:00–20:00."
    }
};

function loadI18n(root) {
    const sandbox = {
        window: { localStorage: { getItem() { return null; }, setItem() {} } },
        navigator: { language: "th" },
        document: {
            documentElement: { lang: "th", setAttribute() {}, getAttribute() { return null; } },
            querySelectorAll() { return []; },
            body: null
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/i18n.js"), "utf8"), sandbox);
    return sandbox.window.StreetMan.I18N;
}

function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function enPath(cleanPath) {
    return cleanPath === "/" ? "/en/" : `/en${cleanPath}`;
}

function alternates(cleanPath) {
    return [
        `<link rel="alternate" hreflang="th" href="${ORIGIN}${cleanPath}">`,
        `<link rel="alternate" hreflang="en" href="${ORIGIN}${enPath(cleanPath)}">`,
        `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${cleanPath}">`
    ].join("\n    ");
}

// FAQ questions shown on the page, read from the data-i18n keys so the
// structured data always matches the visible text in that language.
function faqSchema(html, table) {
    const keys = [...html.matchAll(/data-i18n="(faq_(?:[a-z]+_)?q\d+)"/g)].map((m) => m[1]);
    if (!keys.length) return "";
    const data = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: keys.map((q) => ({
            "@type": "Question",
            name: table[q],
            acceptedAnswer: { "@type": "Answer", text: table[q.replace(/q(\d+)$/, "a$1")] }
        }))
    };
    return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n    </script>`;
}

function webPageSchema(url, lang) {
    const data = { "@context": "https://schema.org", "@type": "WebPage", url, inLanguage: lang, dateModified: LAST_UPDATED };
    return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n    </script>`;
}

// Replace the hand-written FAQPage block (if any) and add generated schema after the last JSON-LD block.
function withSchema(html, blocks) {
    html = html.replace(/\s*<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "FAQPage"[\s\S]*?<\/script>/, "");
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)];
    const at = scripts.length ? scripts[scripts.length - 1].index + scripts[scripts.length - 1][0].length : html.indexOf("</head>");
    return html.slice(0, at) + blocks.filter(Boolean).map((b) => `\n    ${b}`).join("") + html.slice(at);
}

function addHead(html, cleanPath, lang) {
    html = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}" data-page-lang="${lang}"`);
    return html.replace(/(<link rel="canonical" href="[^"]*">)/, `$1\n    ${alternates(cleanPath)}`);
}

function thaiPage(html, page, th) {
    html = addHead(html, page.path, "th");
    return withSchema(html, [faqSchema(html, th), webPageSchema(ORIGIN + page.path, "th")]);
}

function englishPage(html, page, en) {
    const url = ORIGIN + enPath(page.path);
    html = addHead(html, page.path, "en");

    html = html.replace(/(<([a-z0-9]+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
        (all, open, tag, key, inner, close) => (en[key] ? open + escapeHtml(en[key]) + close : all));
    html = html.replace(/(data-i18n-placeholder="([^"]+)"[^>]*?placeholder=")[^"]*"/g, (all, head, key) => (en[key] ? `${head}${escapeHtml(en[key])}"` : all));
    html = html.replace(/(placeholder=")[^"]*("[^>]*?data-i18n-placeholder="([^"]+)")/g, (all, head, tail, key) => (en[key] ? `${head}${escapeHtml(en[key])}${tail}` : all));
    html = html.replace(/(data-i18n-aria="([^"]+)"[^>]*?aria-label=")[^"]*"/g, (all, head, key) => (en[key] ? `${head}${escapeHtml(en[key])}"` : all));
    html = html.replace(/(aria-label=")[^"]*("[^>]*?data-i18n-aria="([^"]+)")/g, (all, head, tail, key) => (en[key] ? `${head}${escapeHtml(en[key])}${tail}` : all));

    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
    html = html.replace(/(<meta name="description" content=")[^"]*"/, `$1${escapeHtml(page.description)}"`);
    html = html.replace(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]*"/g, `$1${escapeHtml(page.title)}"`);
    html = html.replace(/(<meta (?:property|name)="(?:og|twitter):description" content=")[^"]*"/g, `$1${escapeHtml(page.description)}"`);
    html = html.replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`);
    html = html.replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`);
    html = html.replace('<meta property="og:locale" content="th_TH">', '<meta property="og:locale" content="en_US">');
    html = html.replace('<meta property="og:locale:alternate" content="en_US">', '<meta property="og:locale:alternate" content="th_TH">');

    // Assets are relative in the Thai pages; /en/ is one folder deeper.
    html = html.replace(/((?:src|href)=")(?!\/|https?:|#|mailto:|tel:|data:)((?:css|js|lib|img)\/|[\w-]+\.(?:json|webmanifest|ico)")/g, "$1/$2");
    // Internal page links stay in English.
    html = html.replace(/href="\/(?=[?#"])/g, 'href="/en/');
    for (const slug of SLUGS) html = html.replace(new RegExp(`href="/?${slug}(?=[?#"])`, "g"), `href="/en/${slug}`);
    html = html.replace(/href="\/?cancel(?=[?#"])/g, 'href="/cancel');
    html = html.replace(/href="barber\//g, 'href="/barber/');

    html = html.replace(/("@type": "BarberShop",[\s\S]*?"description": ")[^"]*"/, `$1${PAGES["index.html"].description}"`);
    html = html.replace(/("target": ")https:\/\/streeetmanbarberphuket\.shop\/book"/, `$1${ORIGIN}/en/book"`);
    return withSchema(html, [faqSchema(html, en), webPageSchema(url, "en")]);
}

function buildLanguagePages(root, output) {
    const i18n = loadI18n(root);
    const written = [];
    for (const [file, page] of Object.entries(PAGES)) {
        const source = fs.readFileSync(path.join(root, file), "utf8");
        fs.writeFileSync(path.join(output, file), thaiPage(source, page, i18n.th));
        const target = path.join(output, "en", file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, englishPage(source, page, i18n.en));
        written.push(file);
    }
    return written;
}

module.exports = { buildLanguagePages, PAGES, ORIGIN, enPath };
