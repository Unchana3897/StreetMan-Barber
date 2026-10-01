"use strict";

// Makes resized WebP copies of the large photos used on the public pages.
// The original JPGs stay: og:image and structured data still point at them.
// Re-run after replacing a photo: node scripts/optimize-images.js

const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const img = path.resolve(__dirname, "..", "img");

// width = about 2x the largest size the image is shown at on the site.
const IMAGES = {
    // carousel-1/2.jpg are left out: already ~60 KB, and WebP came out larger.
    "about2.jpg": 900,
    "Price2.jpg": 1000,
    "Timework.jpg": 1000,
    "BB1.jpg": 720,
    "BB2.jpg": 720,
    "BB3.jpg": 720,
    "BB4.jpg": 720,
    // Testimonial thumbnails are shown at 60–100 px.
    "Cus1.jpg": 300,
    "cus2.jpg": 300,
    "cus3.jpg": 300
};

(async () => {
    let before = 0, after = 0;
    for (const [file, width] of Object.entries(IMAGES)) {
        const source = path.join(img, file);
        const target = source.replace(/\.(jpe?g|png)$/i, ".webp");
        const info = await sharp(source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(target);
        const was = fs.statSync(source).size;
        before += was;
        after += info.size;
        console.log(`${file.padEnd(16)} ${Math.round(was / 1024)} KB -> ${path.basename(target)} ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
    }
    console.log(`Total ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
})();
