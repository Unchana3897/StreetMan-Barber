// Prints a new VAPID key pair for Web Push and the commands to store it.
// Run once: npm run push:keys
"use strict";
const crypto = require("node:crypto");

const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
const b64u = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const publicKey = b64u(ecdh.getPublicKey());
const privateKey = b64u(Buffer.concat([Buffer.alloc(32), ecdh.getPrivateKey()]).slice(-32));

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("");
console.log("Production (run each, paste the value when asked):");
console.log("  npx wrangler secret put VAPID_PUBLIC_KEY");
console.log("  npx wrangler secret put VAPID_PRIVATE_KEY");
console.log("Local dev: put the two lines above in .dev.vars (never commit it).");
console.log("Keep the same keys afterwards: new keys sign everyone out of notifications.");
