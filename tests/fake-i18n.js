const fs = require("node:fs");
const path = require("node:path");

const localesDir = path.resolve(__dirname, "..", "src", "_locales");

// Reads the real messages.json of a locale.
function readMessages(locale) {
    const messages = JSON.parse(fs.readFileSync(path.join(localesDir, locale, "messages.json"), "utf8"));
    return Object.fromEntries(Object.entries(messages).map(([key, entry]) => [key, entry.message]));
}

// A chrome.i18n stand-in backed by the real messages. Like the browser, an unknown key gives "".
// overrides replaces single messages, for example { readmePage: "" } to simulate a missing key.
function makeI18n(locale = "zh_TW", overrides = {}) {
    const messages = { ...readMessages(locale), ...overrides };
    return {
        getMessage: (key) => (Object.hasOwn(messages, key) ? messages[key] : "")
    };
}

module.exports = { makeI18n, readMessages };
