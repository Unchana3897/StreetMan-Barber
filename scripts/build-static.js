"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const directories = ["barber", "css", "img", "js", "lib"];
const files = ["favicon.ico", "manifest-book.json", "robots.txt", "site.webmanifest"];
const extensions = new Set([
    ".html", ".css", ".js", ".json", ".webmanifest", ".ico",
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

// Only clear the generated directory at this fixed path inside the project.
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw new Error("Refusing to replace a symlink at dist");
}
fs.rmSync(output, { recursive: true, force: true });
for (const relative of assets) {
    const target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
}
console.log(`Built ${assets.length} public assets in dist/`);
