// Runs the local dev server open to the LAN so phones on the same Wi-Fi can use it.
// Usage: npm run dev:lan   (optional: PORT=8787)
"use strict";
const os = require("node:os");
const { spawn } = require("node:child_process");

const port = process.env.PORT || "8787";
const addresses = Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);

console.log("");
console.log("StreetMan dev server (LAN)");
console.log(`  This computer : http://localhost:${port}`);
addresses.forEach((ip) => {
    console.log(`  Phones (Wi-Fi): http://${ip}:${port}/barber/login   POS: http://${ip}:${port}/barber/pos`);
});
if (!addresses.length) console.log("  No LAN address found. Is Wi-Fi connected?");
console.log("  Notifications and 'add to Home Screen' need HTTPS, so they only work on localhost here.");
console.log("");

const child = spawn("npx", ["wrangler", "dev", "--ip", "0.0.0.0", "--port", port], { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
