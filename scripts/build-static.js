"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildLanguagePages } = require("./i18n-pages");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const directories = ["barber", "css", "img", "js", "lib"];
const files = ["favicon.ico", "manifest-book.json", "robots.txt", "sitemap.xml", "llms.txt", "site.webmanifest"];
const extensions = new Set([
    ".html", ".css", ".js", ".json", ".xml", ".txt", ".webmanifest", ".ico",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif",
    ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp3", ".wav"
]);
const assets = [];


function collect(relative) {
    const source = path.join(root, relative);
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error(`Refusing asset symlink: ${relative}`);
    if (stat.isDirectory()) {
        for (const name of fs.readdirSync(source)) {
            if (!name.startsWith(".")) collect(path.join(relative, name));
        }
    } else if (extensions.has(path.extname(relative).toLowerCase()) || files.includes(relative)) {
        if (stat.size > 25 * 1024 * 1024) throw new Error(`Asset exceeds 25 MiB: ${relative}`);
        assets.push(relative);
    }
}

for (const entry of fs.readdirSync(root)) {
    if (entry.endsWith(".html")) collect(entry);
}
for (const entry of [...directories, ...files]) collect(entry);

// Update dist/ in place instead of deleting it first: a running `wrangler dev`
// serves from this folder and breaks (Safari then offers to "download" pages)
// if the folder disappears, even for a moment.
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw new Error("Refusing to replace a symlink at dist");
}
fs.mkdirSync(output, { recursive: true });
for (const relative of assets) {
    const source = path.join(root, relative);
    const target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const same = fs.existsSync(target) && fs.statSync(target).size === fs.statSync(source).size &&
        fs.readFileSync(target).equals(fs.readFileSync(source));
    if (!same) {
        // Write to a temp name and rename, so a request never sees a half-written file.
        const temp = target + ".tmp-build";
        fs.copyFileSync(source, temp);
        fs.renameSync(temp, target);
    }
}
const languagePages = buildLanguagePages(root, output);
// Remove files that are no longer part of the site.
const keep = new Set(assets.map((a) => path.join(output, a))
    .concat(languagePages.flatMap((p) => [path.join(output, p), path.join(output, "en", p)])));
(function prune(dir) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.lstatSync(full).isDirectory()) {
            prune(full);
            if (!fs.readdirSync(full).length) fs.rmdirSync(full);
        } else if (!keep.has(full)) {
            fs.rmSync(full);
        }
    }
})(output);
console.log(`Built ${assets.length} public assets in dist/ (+${languagePages.length} English pages in dist/en/)`);
