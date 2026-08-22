"use strict";

const fs = require("fs");
const path = require("path");

function dataDir() {
    const fromEnv = String(process.env.DATA_DIR || "").trim();
    if (fromEnv) {
        return fromEnv;
    }
    return path.join(__dirname, "..", "data");
}

function ensureDataDir() {
    const dir = dataDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

module.exports = {
    dataDir,
    ensureDataDir
};
