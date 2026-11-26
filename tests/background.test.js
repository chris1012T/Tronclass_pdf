const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { makeI18n, readMessages } = require("./fake-i18n.js");

const srcDir = path.resolve(__dirname, "..", "src");
const helpersCode = fs.readFileSync(path.join(srcDir, "lib", "helpers.js"), "utf8");
const backgroundCode = fs.readFileSync(path.join(srcDir, "background.js"), "utf8");

const EXTENSION_ID = "ext-id";
const VALID_MESSAGE = { type: "download", url: "https://x.edu/a.pdf", filename: "a.pdf" };
const WHATS_NEW_MESSAGE = "Tronclass PDF 更新：現在也能下載音訊教材了。";
const WHATS_NEW_TITLE = "Tronclass PDF：新增音訊下載，按一下圖示即可下載教材";
const TAB_SENDER = { id: EXTENSION_ID, tab: { id: 9 } };

function makeEvent() {
    const listeners = [];
    return {
        addListener: (listener) => listeners.push(listener),
        fire: (...args) => Promise.all(listeners.map((listener) => listener(...args)))
    };
}

// The zh_TW actionTitle; the fake manifest only holds the placeholder, like the real one.
const DEFAULT_TITLE = "請先開啟教材頁面再點我";
const EN = readMessages("en");

function makeChrome(options = {}) {
    const calls = [];
    const store = { ...(options.storage || {}) };
    const readStore = (key) => Promise.resolve(key in store ? { [key]: store[key] } : {});
    const record = (name, result) => (...args) => {
        // Clone into this realm for deepStrictEqual; raw keeps the originals for === checks.
        calls.push({ name, args: JSON.parse(JSON.stringify(args)), raw: args });
        return typeof result === "function" ? result(...args) : result;
    };
    const chrome = {
        calls,
        store,
        runtime: {
            id: EXTENSION_ID,
            getManifest: () => ({ version: options.version || "3.1.0", action: { default_title: "__MSG_actionTitle__" } }),
            onInstalled: makeEvent(),
            onStartup: makeEvent(),
            onMessage: makeEvent()
        },
        i18n: makeI18n(options.locale || "zh_TW", options.messages),
        contextMenus: {
            removeAll: record("removeAll", options.removeAll || (() => Promise.resolve())),
            create: record("create"),
            onClicked: makeEvent()
        },
        tabs: { create: record("tabs.create", () => Promise.resolve()) },
        action: {
            onClicked: makeEvent(),
            setBadgeText: record("setBadgeText", options.setBadgeText || (() => Promise.resolve())),
            setBadgeBackgroundColor: record("setBadgeBackgroundColor", options.setBadgeBackgroundColor || (() => Promise.resolve())),
            setTitle: record("setTitle", options.setTitle || (() => Promise.resolve()))
        },
        storage: {
            local: {
                get: record("storage.get", options.storageGet || readStore),
                set: record("storage.set", options.storageSet || ((items) => {
                    Object.assign(store, items);
                    return Promise.resolve();
                }))
            }
        },
        scripting: { executeScript: record("executeScript", options.executeScript || (() => Promise.resolve())) },
        downloads: { download: record("download", options.download || (() => Promise.resolve(1))) }
    };
    return chrome;
}

const BADGE_LINE = "const SHOW_UPDATE_BADGE = false;";
const POPUP_LINE = "const SHOW_UPDATE_POPUP = true;";

function replaceLine(code, from, to) {
    assert.ok(code.includes(from), `helpers.js must contain ${from}`);
    const replaced = code.replace(from, to);
    assert.ok(replaced.includes(to), `${to} must be in place of ${from}`);
    return replaced;
}

// load() forces both switches to false unless told otherwise; load({ shipped: true }) keeps the source values.
function withSwitches(options) {
    if (options.shipped) {
        return helpersCode;
    }
    const helpers = replaceLine(helpersCode, BADGE_LINE, `const SHOW_UPDATE_BADGE = ${Boolean(options.badge)};`);
    return replaceLine(helpers, POPUP_LINE, `const SHOW_UPDATE_POPUP = ${Boolean(options.popup)};`);
}

function load(options = {}) {
    const helpers = withSwitches(options);
    const chrome = makeChrome(options);
    const warnings = [];
    const context = vm.createContext({
        chrome,
        URL,
        console: { warn: (...args) => warnings.push(args), log: () => {} }
    });
    if (options.importScripts) {
        context.importScripts = (...args) => {
            chrome.calls.push({ name: "importScripts", args });
            vm.runInContext(helpers, context);
        };
    } else {
        vm.runInContext(helpers, context);
    }
    vm.runInContext(backgroundCode, context);
    return { chrome, warnings, context };
}

function callsOf(chrome, name) {
    return chrome.calls.filter((call) => call.name === name);
}

async function flush() {
    for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function assertMenusCreated(chrome) {
    const names = chrome.calls.filter((call) => call.name === "removeAll" || call.name === "create").map((call) => call.name);
    assert.deepStrictEqual(names, ["removeAll", "create", "create", "create", "create"]);
    assert.deepStrictEqual(
        callsOf(chrome, "create").map((call) => call.args[0]),
        [
            { id: "instructionPage", title: "使用說明", contexts: ["action"] },
            { id: "changelogPage", title: "更新紀錄", contexts: ["action"] },
            { id: "contextmenu_download", title: "下載此教材 (Tronclass)", contexts: ["all"] },
            { id: "GitHubPage", title: "GitHub Page", contexts: ["action"] }
        ]
    );
}

test("loading the script does not create menus", async () => {
    const { chrome } = load();
    await flush();
    assert.strictEqual(callsOf(chrome, "create").length, 0);
});

test("onStartup removes old menus then creates four", async () => {
    const { chrome } = load();
    await chrome.runtime.onStartup.fire();
    await flush();
    assertMenusCreated(chrome);
});

test("importScripts loads lib/helpers.js when available", async () => {
    const { chrome } = load({ importScripts: true });
    assert.deepStrictEqual(callsOf(chrome, "importScripts").map((call) => call.args), [["lib/helpers.js"]]);
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: EXTENSION_ID });
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
});

test("loading without importScripts does not throw", () => {
    assert.doesNotThrow(() => load());
});

test("onInstalled install creates menus and opens the readme", async () => {
    const { chrome } = load();
    await chrome.runtime.onInstalled.fire({ reason: "install" });
    await flush();
    assertMenusCreated(chrome);
    assert.deepStrictEqual(callsOf(chrome, "tabs.create").map((call) => call.args[0]), [{ url: "pages/readme.html" }]);
});

test("onInstalled install opens the readme without touching storage or the badge", async () => {
    const { chrome } = load();
    await chrome.runtime.onInstalled.fire({ reason: "install" });
    await flush();
    assert.deepStrictEqual(callsOf(chrome, "tabs.create").map((call) => call.args[0]), [{ url: "pages/readme.html" }]);
    assert.strictEqual(callsOf(chrome, "storage.set").length, 0);
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 0);
});

test("with both switches on, onInstalled update after a minor bump sets the NEW badge instead of opening a tab", async () => {
    const { chrome } = load({ version: "3.1.0", badge: true, popup: true });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.0.0" });
    await flush();
    assert.strictEqual(callsOf(chrome, "tabs.create").length, 0);
    assert.deepStrictEqual(callsOf(chrome, "storage.set").map((call) => call.args[0]), [{ whatsNewPending: true }]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").map((call) => call.args[0]), [{ text: "NEW" }]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeBackgroundColor").map((call) => call.args[0]), [{ color: "#1aa99b" }]);
    assert.deepStrictEqual(callsOf(chrome, "setTitle").map((call) => call.args[0]), [{ title: WHATS_NEW_TITLE }]);
});

test("with both switches on, onInstalled update after a patch bump leaves storage and the badge alone", async () => {
    const { chrome } = load({ version: "3.1.1", badge: true, popup: true });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" });
    await flush();
    assert.strictEqual(callsOf(chrome, "tabs.create").length, 0);
    assert.strictEqual(callsOf(chrome, "storage.set").length, 0);
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 0);
    assert.strictEqual(callsOf(chrome, "setBadgeBackgroundColor").length, 0);
    assert.strictEqual(callsOf(chrome, "setTitle").length, 0);
});

test("menu setups run one after another", async () => {
    let releaseFirst;
    let removeAllCount = 0;
    const { chrome } = load({
        removeAll: () => {
            removeAllCount++;
            if (removeAllCount === 1) {
                return new Promise((resolve) => {
                    releaseFirst = resolve;
                });
            }
            return Promise.resolve();
        }
    });
    chrome.runtime.onInstalled.fire({ reason: "chrome_update" });
    chrome.runtime.onStartup.fire();
    await flush();
    const menuNames = () => chrome.calls.map((call) => call.name).filter((name) => name === "removeAll" || name === "create");
    assert.deepStrictEqual(menuNames(), ["removeAll"]);
    releaseFirst();
    await flush();
    const oneSetup = ["removeAll", "create", "create", "create", "create"];
    assert.deepStrictEqual(menuNames(), [...oneSetup, ...oneSetup]);
});

test("a failed menu setup does not block the next one", async (t) => {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    t.after(() => process.off("unhandledRejection", onRejection));
    let removeAllCount = 0;
    const { chrome } = load({
        removeAll: () => {
            removeAllCount++;
            return removeAllCount === 1 ? Promise.reject(new Error("boom")) : Promise.resolve();
        }
    });
    await chrome.runtime.onStartup.fire();
    await flush();
    await chrome.runtime.onStartup.fire();
    await flush();
    assert.strictEqual(callsOf(chrome, "create").length, 4);
    assert.deepStrictEqual(rejections, []);
});

const EXPECTED_INJECTION = { target: { tabId: 7 }, files: ["content/extract.js", "content/run.js"] };

test("toolbar click and context menu inject the same scripts", async () => {
    const { chrome } = load();
    await chrome.action.onClicked.fire({ id: 7 });
    await chrome.contextMenus.onClicked.fire({ menuItemId: "contextmenu_download" }, { id: 7 });
    await flush();
    const injections = callsOf(chrome, "executeScript").map((call) => call.args[0]);
    assert.deepStrictEqual(injections, [EXPECTED_INJECTION, EXPECTED_INJECTION]);
});

test("menu items open the readme and GitHub", async () => {
    const { chrome } = load();
    await chrome.contextMenus.onClicked.fire({ menuItemId: "instructionPage" }, { id: 1 });
    await chrome.contextMenus.onClicked.fire({ menuItemId: "GitHubPage" }, { id: 1 });
    assert.deepStrictEqual(
        callsOf(chrome, "tabs.create").map((call) => call.args[0]),
        [{ url: "pages/readme.html" }, { url: "https://github.com/chris1012T/Tronclass_pdf" }]
    );
});

test("a failed injection does not leave an unhandled rejection", async (t) => {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    t.after(() => process.off("unhandledRejection", onRejection));
    const { chrome, warnings } = load({ executeScript: () => Promise.reject(new Error("Cannot access chrome:// URL")) });
    chrome.action.onClicked.fire({ id: 7 });
    chrome.contextMenus.onClicked.fire({ menuItemId: "contextmenu_download" }, { id: 7 });
    await flush();
    assert.strictEqual(callsOf(chrome, "executeScript").length, 2);
    assert.deepStrictEqual(rejections, []);
    assert.strictEqual(warnings.length, 2);
});

test("messages from another sender are ignored", async () => {
    const { chrome } = load();
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: "someone-else" });
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 0);
});

test("invalid messages are ignored", async () => {
    const { chrome } = load();
    await chrome.runtime.onMessage.fire({ ...VALID_MESSAGE, url: "javascript:alert(1)" }, { id: EXTENSION_ID });
    await chrome.runtime.onMessage.fire({ src: "https://x.edu/a.pdf", filename: "a.pdf" }, { id: EXTENSION_ID });
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 0);
});

test("a valid message downloads with uniquify", async () => {
    const { chrome } = load();
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: EXTENSION_ID });
    await flush();
    const downloads = callsOf(chrome, "download").map((call) => call.args[0]);
    assert.deepStrictEqual(downloads, [{ url: "https://x.edu/a.pdf", filename: "a.pdf", conflictAction: "uniquify" }]);
});

test("a rejected download retries once without filename", async () => {
    let count = 0;
    const { chrome } = load({
        download: () => {
            count++;
            return count === 1 ? Promise.reject(new Error("Invalid filename")) : Promise.resolve(1);
        }
    });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: EXTENSION_ID });
    await flush();
    const downloads = callsOf(chrome, "download").map((call) => call.args[0]);
    assert.strictEqual(downloads.length, 2);
    assert.deepStrictEqual(downloads[1], { url: "https://x.edu/a.pdf", conflictAction: "uniquify" });
    assert.strictEqual("filename" in downloads[1], false);
});

test("two rejected downloads stop after the retry without throwing", async (t) => {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    t.after(() => process.off("unhandledRejection", onRejection));
    const { chrome, warnings } = load({ download: () => Promise.reject(new Error("nope")) });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: EXTENSION_ID });
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 2);
    assert.deepStrictEqual(rejections, []);
    assert.strictEqual(warnings.length, 2);
});

test("the changelog menu item opens the changelog", async () => {
    const { chrome } = load();
    await chrome.contextMenus.onClicked.fire({ menuItemId: "changelogPage" }, { id: 1 });
    assert.deepStrictEqual(callsOf(chrome, "tabs.create").map((call) => call.args[0]), [{ url: "pages/changelog.html" }]);
});

function trackRejections(t) {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    t.after(() => process.off("unhandledRejection", onRejection));
    return rejections;
}

function whatsNewInjections(chrome) {
    return callsOf(chrome, "executeScript").filter((call) => call.raw[0].func !== undefined);
}

test("with both switches on, loading the script restores the NEW badge when the notice is pending", async () => {
    const { chrome } = load({ storage: { whatsNewPending: true }, badge: true, popup: true });
    await flush();
    assert.deepStrictEqual(callsOf(chrome, "storage.get").map((call) => call.args[0]), ["whatsNewPending"]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").map((call) => call.args[0]), [{ text: "NEW" }]);
    assert.deepStrictEqual(callsOf(chrome, "setTitle").map((call) => call.args[0]), [{ title: WHATS_NEW_TITLE }]);
});

test("loading the script leaves the badge alone when nothing is pending", async () => {
    const { chrome } = load({ storage: {} });
    await flush();
    assert.strictEqual(callsOf(chrome, "storage.get").length, 1);
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 0);
});

test("a failed storage read on load only warns", async (t) => {
    const rejections = trackRejections(t);
    const { chrome, warnings } = load({ storageGet: () => Promise.reject(new Error("no storage")) });
    await flush();
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 0);
    assert.strictEqual(warnings.length, 1);
    assert.deepStrictEqual(rejections, []);
});

test("with both switches on, the first download after an update shows the notice and clears the badge", async () => {
    const { chrome, context } = load({ storage: { whatsNewPending: true }, badge: true, popup: true });
    await flush();
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    const injections = callsOf(chrome, "executeScript");
    assert.strictEqual(injections.length, 1);
    const options = injections[0].raw[0];
    assert.deepStrictEqual(injections[0].args[0].target, { tabId: 9 });
    assert.strictEqual(options.func, vm.runInContext("showWhatsNew", context));
    assert.strictEqual(typeof options.func, "function");
    assert.deepStrictEqual([...options.args], [WHATS_NEW_MESSAGE, "關閉"]);
    assert.deepStrictEqual(Object.keys(options).sort(), ["args", "func", "target"]);
    const downloadIndex = chrome.calls.indexOf(callsOf(chrome, "download")[0]);
    assert.ok(downloadIndex < chrome.calls.indexOf(injections[0]), "download happens before the notice");
    assert.deepStrictEqual(callsOf(chrome, "storage.set").map((call) => call.args[0]), [{ whatsNewPending: false }]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").map((call) => call.args[0]), [{ text: "NEW" }, { text: "" }]);
    const titles = callsOf(chrome, "setTitle").map((call) => call.args[0]);
    assert.deepStrictEqual(titles, [{ title: WHATS_NEW_TITLE }, { title: DEFAULT_TITLE }]);
    assert.strictEqual(chrome.store.whatsNewPending, false);

    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 2);
    assert.strictEqual(callsOf(chrome, "executeScript").length, 1);
});

test("a download without a pending notice does not inject or touch the badge", async () => {
    const { chrome } = load({ storage: { whatsNewPending: false } });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    assert.strictEqual(callsOf(chrome, "executeScript").length, 0);
    assert.strictEqual(callsOf(chrome, "storage.set").length, 0);
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 0);
    assert.strictEqual(callsOf(chrome, "setTitle").length, 0);
});

test("an invalid message neither downloads nor shows the notice", async () => {
    const { chrome } = load({ storage: { whatsNewPending: true }, badge: true, popup: true });
    await chrome.runtime.onMessage.fire({ ...VALID_MESSAGE, url: "javascript:alert(1)" }, TAB_SENDER);
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: "someone-else", tab: { id: 9 } });
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 0);
    assert.strictEqual(callsOf(chrome, "executeScript").length, 0);
    assert.strictEqual(callsOf(chrome, "storage.set").length, 0);
    assert.strictEqual(chrome.store.whatsNewPending, true);
});

test("toolbar clicks and the download menu only inject files and leave the notice pending", async () => {
    const { chrome } = load({ storage: { whatsNewPending: true }, badge: true, popup: true });
    await flush();
    const readsAfterLoad = callsOf(chrome, "storage.get").length;
    await chrome.action.onClicked.fire({ id: 7 });
    await chrome.contextMenus.onClicked.fire({ menuItemId: "contextmenu_download" }, { id: 7 });
    await flush();
    assert.deepStrictEqual(callsOf(chrome, "executeScript").map((call) => call.args[0]), [EXPECTED_INJECTION, EXPECTED_INJECTION]);
    assert.strictEqual(whatsNewInjections(chrome).length, 0);
    assert.strictEqual(callsOf(chrome, "storage.get").length, readsAfterLoad);
    assert.strictEqual(callsOf(chrome, "storage.set").length, 0);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").map((call) => call.args[0]), [{ text: "NEW" }]);
});

test("with both switches on, a failed notice injection keeps the notice pending", async (t) => {
    const rejections = trackRejections(t);
    const { chrome, warnings } = load({
        badge: true, popup: true,
        storage: { whatsNewPending: true },
        executeScript: () => Promise.reject(new Error("Cannot access this page"))
    });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    assert.strictEqual(callsOf(chrome, "executeScript").length, 1);
    assert.strictEqual(callsOf(chrome, "storage.set").length, 0);
    assert.strictEqual(chrome.store.whatsNewPending, true);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").map((call) => call.args[0]), [{ text: "NEW" }]);
    assert.strictEqual(warnings.length, 1);
    assert.deepStrictEqual(rejections, []);
});

test("a failed pending write still clears the badge", async (t) => {
    const rejections = trackRejections(t);
    const { chrome, warnings } = load({
        badge: true, popup: true,
        storage: { whatsNewPending: true },
        storageSet: () => Promise.reject(new Error("quota"))
    });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.deepStrictEqual(callsOf(chrome, "storage.set").map((call) => call.args[0]), [{ whatsNewPending: false }]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").map((call) => call.args[0]), [{ text: "NEW" }, { text: "" }]);
    assert.deepStrictEqual(callsOf(chrome, "setTitle").at(-1).args[0], { title: DEFAULT_TITLE });
    assert.strictEqual(warnings.length, 1);
    assert.deepStrictEqual(rejections, []);
});

test("a failed pending write on update still sets the badge", async (t) => {
    const rejections = trackRejections(t);
    const { chrome, warnings } = load({
        version: "3.1.0",
        badge: true, popup: true,
        storageSet: () => Promise.reject(new Error("quota"))
    });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.0.0" });
    await flush();
    assert.deepStrictEqual(callsOf(chrome, "storage.set").map((call) => call.args[0]), [{ whatsNewPending: true }]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").map((call) => call.args[0]), [{ text: "NEW" }]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeBackgroundColor").map((call) => call.args[0]), [{ color: "#1aa99b" }]);
    assert.deepStrictEqual(callsOf(chrome, "setTitle").map((call) => call.args[0]), [{ title: WHATS_NEW_TITLE }]);
    assert.strictEqual(warnings.length, 1);
    assert.deepStrictEqual(rejections, []);
});

test("a rejected badge color on update only warns and still sets the text and title", async (t) => {
    const rejections = trackRejections(t);
    const { chrome, warnings } = load({
        version: "3.1.0",
        badge: true, popup: true,
        setBadgeBackgroundColor: () => Promise.reject(new Error("no color"))
    });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.0.0" });
    await flush();
    assert.deepStrictEqual(callsOf(chrome, "setBadgeBackgroundColor").map((call) => call.args[0]), [{ color: "#1aa99b" }]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").map((call) => call.args[0]), [{ text: "NEW" }]);
    assert.deepStrictEqual(callsOf(chrome, "setTitle").map((call) => call.args[0]), [{ title: WHATS_NEW_TITLE }]);
    assert.strictEqual(warnings.length, 1);
    assert.strictEqual(warnings[0][0], "Cannot set the badge color:");
    assert.deepStrictEqual(rejections, []);
});

test("rejected badge and title updates only warn", async (t) => {
    const rejections = trackRejections(t);
    const fail = () => Promise.reject(new Error("no action"));
    const { chrome, warnings } = load({
        version: "3.1.0",
        badge: true, popup: true,
        storage: { whatsNewPending: true },
        setBadgeText: fail,
        setTitle: fail
    });
    await flush();
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.0.0" });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 3);
    assert.strictEqual(callsOf(chrome, "setTitle").length, 3);
    assert.strictEqual(warnings.length, 6);
    assert.deepStrictEqual(rejections, []);
});

test("a valid message without a tab downloads but shows no notice", async () => {
    const { chrome } = load({ storage: { whatsNewPending: true }, badge: true, popup: true });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: EXTENSION_ID });
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    assert.strictEqual(callsOf(chrome, "executeScript").length, 0);
    assert.strictEqual(chrome.store.whatsNewPending, true);
});

test("the notice still shows after both download attempts fail", async (t) => {
    const rejections = trackRejections(t);
    const { chrome } = load({
        storage: { whatsNewPending: true },
        badge: true, popup: true,
        download: () => Promise.reject(new Error("nope"))
    });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 2);
    assert.strictEqual(whatsNewInjections(chrome).length, 1);
    assert.deepStrictEqual(callsOf(chrome, "storage.set").map((call) => call.args[0]), [{ whatsNewPending: false }]);
    assert.strictEqual(chrome.store.whatsNewPending, false);
    assert.deepStrictEqual(rejections, []);
});

test("with both switches on, a slow badge restore cannot set NEW again after the notice clears it", async () => {
    let releaseFirstRead;
    let reads = 0;
    const { chrome } = load({
        badge: true, popup: true,
        storageGet: () => {
            reads++;
            if (reads === 1) {
                return new Promise((resolve) => {
                    releaseFirstRead = () => resolve({ whatsNewPending: true });
                });
            }
            return Promise.resolve({ whatsNewPending: true });
        }
    });
    const delivered = chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    releaseFirstRead();
    await delivered;
    await flush();
    const badges = callsOf(chrome, "setBadgeText").map((call) => call.args[0]);
    assert.deepStrictEqual(badges.at(-1), { text: "" });
    assert.ok(badges.length >= 2);
});

test("en menus use the en messages", async () => {
    const { chrome } = load({ locale: "en" });
    await chrome.runtime.onStartup.fire();
    await flush();
    assert.deepStrictEqual(
        callsOf(chrome, "create").map((call) => call.args[0]),
        [
            { id: "instructionPage", title: EN.menuReadme, contexts: ["action"] },
            { id: "changelogPage", title: EN.menuChangelog, contexts: ["action"] },
            { id: "contextmenu_download", title: EN.menuDownload, contexts: ["all"] },
            { id: "GitHubPage", title: EN.menuGitHub, contexts: ["action"] }
        ]
    );
});

test("en install and the page menus open the en pages", async () => {
    const { chrome } = load({ locale: "en" });
    await chrome.runtime.onInstalled.fire({ reason: "install" });
    await chrome.contextMenus.onClicked.fire({ menuItemId: "instructionPage" }, { id: 1 });
    await chrome.contextMenus.onClicked.fire({ menuItemId: "changelogPage" }, { id: 1 });
    await flush();
    assert.deepStrictEqual(
        callsOf(chrome, "tabs.create").map((call) => call.args[0]),
        [{ url: "pages/readme.en.html" }, { url: "pages/readme.en.html" }, { url: "pages/changelog.en.html" }]
    );
});

test("zh_TW install and the page menus open the Chinese pages", async () => {
    const { chrome } = load({ locale: "zh_TW" });
    await chrome.runtime.onInstalled.fire({ reason: "install" });
    await chrome.contextMenus.onClicked.fire({ menuItemId: "instructionPage" }, { id: 1 });
    await chrome.contextMenus.onClicked.fire({ menuItemId: "changelogPage" }, { id: 1 });
    await flush();
    assert.deepStrictEqual(
        callsOf(chrome, "tabs.create").map((call) => call.args[0]),
        [{ url: "pages/readme.html" }, { url: "pages/readme.html" }, { url: "pages/changelog.html" }]
    );
});

test("missing page messages fall back to the Chinese pages", async () => {
    const { chrome } = load({ locale: "en", messages: { readmePage: "", changelogPage: "" } });
    await chrome.runtime.onInstalled.fire({ reason: "install" });
    await chrome.contextMenus.onClicked.fire({ menuItemId: "instructionPage" }, { id: 1 });
    await chrome.contextMenus.onClicked.fire({ menuItemId: "changelogPage" }, { id: 1 });
    await flush();
    assert.deepStrictEqual(
        callsOf(chrome, "tabs.create").map((call) => call.args[0]),
        [{ url: "pages/readme.html" }, { url: "pages/readme.html" }, { url: "pages/changelog.html" }]
    );
});

test("en update notice, badge title and reset title use the en messages", async () => {
    const { chrome } = load({ locale: "en", storage: { whatsNewPending: true }, badge: true, popup: true });
    await flush();
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    const injections = whatsNewInjections(chrome);
    assert.strictEqual(injections.length, 1);
    assert.deepStrictEqual([...injections[0].raw[0].args], [EN.whatsNewMessage, EN.closeLabel]);
    assert.deepStrictEqual(
        callsOf(chrome, "setTitle").map((call) => call.args[0]),
        [{ title: EN.whatsNewTitle }, { title: EN.actionTitle }]
    );
});

test("helpers.js declares each switch on exactly one line: SHOW_UPDATE_BADGE false, SHOW_UPDATE_POPUP true", () => {
    const lines = helpersCode.split("\n");
    assert.strictEqual(lines.filter((line) => line.startsWith("const SHOW_UPDATE_BADGE")).length, 1);
    assert.strictEqual(lines.filter((line) => line.startsWith("const SHOW_UPDATE_POPUP")).length, 1);
    assert.strictEqual(lines.filter((line) => line === BADGE_LINE).length, 1);
    assert.strictEqual(lines.filter((line) => line === POPUP_LINE).length, 1);
    const shipped = load({ shipped: true }).context;
    assert.strictEqual(vm.runInContext("SHOW_UPDATE_BADGE", shipped), false);
    assert.strictEqual(vm.runInContext("SHOW_UPDATE_POPUP", shipped), true);
    const off = load().context;
    assert.strictEqual(vm.runInContext("SHOW_UPDATE_BADGE", off), false);
    assert.strictEqual(vm.runInContext("SHOW_UPDATE_POPUP", off), false);
    const on = load({ badge: true, popup: true }).context;
    assert.strictEqual(vm.runInContext("SHOW_UPDATE_BADGE", on), true);
    assert.strictEqual(vm.runInContext("SHOW_UPDATE_POPUP", on), true);
});

test("with both switches off a minor bump never shows NEW", async () => {
    const { chrome } = load({ version: "3.2.0" });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" });
    await flush();
    const writes = callsOf(chrome, "storage.set").map((call) => call.args[0]);
    assert.ok(!writes.some((items) => items.whatsNewPending === true), JSON.stringify(writes));
    assert.notStrictEqual(chrome.store.whatsNewPending, true);
    const badges = callsOf(chrome, "setBadgeText").map((call) => call.args[0].text);
    assert.ok(!badges.includes("NEW"), JSON.stringify(badges));
    assert.strictEqual(callsOf(chrome, "tabs.create").length, 0);
});

// T23: the restore also clears a leftover NEW, so every write is a clear and none brings the notice back.
function assertOnlyClearWrites(chrome) {
    const writes = callsOf(chrome, "storage.set").map((call) => call.args[0]);
    assert.ok(writes.length >= 1, "the leftover NEW is cleared in storage");
    for (const items of writes) {
        assert.deepStrictEqual(items, { whatsNewPending: false });
    }
}

for (const [kind, version, previousVersion] of [["patch", "3.1.1", "3.1.0"], ["minor", "3.2.0", "3.1.0"]]) {
    test(`with both switches off a ${kind} update clears a leftover NEW`, async () => {
        const { chrome } = load({ version, storage: { whatsNewPending: true } });
        await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion });
        await flush();
        assert.strictEqual(chrome.store.whatsNewPending, false);
        assertOnlyClearWrites(chrome);
        assert.deepStrictEqual(callsOf(chrome, "setBadgeText").at(-1).args[0], { text: "" });
        assert.deepStrictEqual(callsOf(chrome, "setTitle").at(-1).args[0], { title: DEFAULT_TITLE });
    });
}

test("with both switches off a late restore plus the update clear ends with no NEW and only false writes", async () => {
    let releaseRead;
    const { chrome } = load({
        version: "3.2.0",
        storageGet: () => new Promise((resolve) => {
            releaseRead = () => resolve({ whatsNewPending: true });
        }),
        // The read resolves only once a write happens, so the restore can finish late; both paths only clear, so the result is idempotent.
        storageSet: () => {
            releaseRead();
            return Promise.resolve();
        }
    });
    const installed = chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" });
    await flush();
    releaseRead();
    await installed;
    await flush();
    assertOnlyClearWrites(chrome);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").at(-1).args[0], { text: "" });
});

// Warnings: set and setBadgeText fail once in the restore's clear and once in the update's clear; get fails once on load.
const failingApis = {
    "storage.local.set": [{ storageSet: () => { throw new Error("quota"); } }, 2],
    setBadgeText: [{ setBadgeText: () => { throw new Error("no action"); } }, 2],
    "storage.local.get": [{ storageGet: () => { throw new Error("no storage"); } }, 1]
};

for (const [api, [failure, warningCount]] of Object.entries(failingApis)) {
    test(`with both switches off a throwing ${api} does not reject the update handler`, async (t) => {
        const rejections = trackRejections(t);
        const { chrome, warnings } = load({ version: "3.2.0", storage: { whatsNewPending: true }, ...failure });
        await assert.doesNotReject(chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" }));
        await flush();
        assert.strictEqual(warnings.length, warningCount);
        assert.deepStrictEqual(rejections, []);
    });
}

test("with both switches off a leftover NEW found on startup is cleared, not restored", async () => {
    const { chrome } = load({ storage: { whatsNewPending: true } });
    await flush();
    const badges = callsOf(chrome, "setBadgeText").map((call) => call.args[0]);
    assert.ok(!badges.some((badge) => badge.text === "NEW"), JSON.stringify(badges));
    assert.strictEqual(chrome.store.whatsNewPending, false);
    assert.deepStrictEqual(badges.at(-1), { text: "" });
    assert.deepStrictEqual(callsOf(chrome, "setTitle").at(-1).args[0], { title: DEFAULT_TITLE });
});

test("with both switches off a startup with nothing pending writes nothing", async () => {
    const { chrome } = load({ storage: { whatsNewPending: false } });
    await flush();
    assert.strictEqual(callsOf(chrome, "storage.get").length, 1);
    assert.strictEqual(callsOf(chrome, "storage.set").length, 0);
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 0);
    assert.strictEqual(callsOf(chrome, "setTitle").length, 0);
});

test("with both switches off a download never shows the notice, even if the clear was not saved", async () => {
    // Every read reports a pending notice, as if the clear never reached storage.
    const { chrome } = load({ storageGet: () => Promise.resolve({ whatsNewPending: true }) });
    await flush();
    const readsBefore = callsOf(chrome, "storage.get").length;
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    assert.strictEqual(whatsNewInjections(chrome).length, 0);
    assert.strictEqual(callsOf(chrome, "storage.get").length, readsBefore);
});

const failingStartupClears = {
    "storage.local.set": { storageSet: () => Promise.reject(new Error("quota")) },
    setBadgeText: { setBadgeText: () => Promise.reject(new Error("no action")) }
};

for (const [api, failure] of Object.entries(failingStartupClears)) {
    test(`with both switches off a rejected ${api} while clearing on startup only warns`, async (t) => {
        const rejections = trackRejections(t);
        const { chrome, warnings } = load({ storage: { whatsNewPending: true }, ...failure });
        await flush();
        assert.strictEqual(callsOf(chrome, api === "setBadgeText" ? "setBadgeText" : "storage.set").length, 1);
        assert.strictEqual(warnings.length, 1);
        assert.deepStrictEqual(rejections, []);
    });
}

// Switch combinations. "both on" matches the old single-switch release behavior, "both off" the old silent one.
const COMBOS = {
    "both on": { badge: true, popup: true },
    "popup only": { badge: false, popup: true },
    "badge only": { badge: true, popup: false },
    "both off": { badge: false, popup: false }
};

function badgeTexts(chrome) {
    return callsOf(chrome, "setBadgeText").map((call) => call.args[0].text);
}

function titlesOf(chrome) {
    return callsOf(chrome, "setTitle").map((call) => call.args[0].title);
}

function pendingWrites(chrome) {
    return callsOf(chrome, "storage.set").map((call) => call.args[0]);
}

function assertNoNewBadge(chrome) {
    assert.ok(!badgeTexts(chrome).includes("NEW"), JSON.stringify(badgeTexts(chrome)));
    assert.strictEqual(callsOf(chrome, "setBadgeBackgroundColor").length, 0);
    assert.ok(!titlesOf(chrome).includes(WHATS_NEW_TITLE), JSON.stringify(titlesOf(chrome)));
}

// ---- popup only (badge off, popup on): the shipped setting ----

test("popup only: a minor update stores pending without NEW and removes any leftover NEW", async () => {
    const { chrome } = load({ ...COMBOS["popup only"], version: "3.2.0" });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" });
    await flush();
    assert.deepStrictEqual(pendingWrites(chrome), [{ whatsNewPending: true }]);
    assert.strictEqual(chrome.store.whatsNewPending, true);
    assertNoNewBadge(chrome);
    assert.strictEqual(badgeTexts(chrome).at(-1), "");
    assert.strictEqual(titlesOf(chrome).at(-1), DEFAULT_TITLE);
    assert.strictEqual(callsOf(chrome, "tabs.create").length, 0);
});

test("popup only: a patch update leaves pending alone and removes any leftover NEW", async () => {
    const { chrome } = load({ ...COMBOS["popup only"], version: "3.2.1", storage: { whatsNewPending: true } });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.2.0" });
    await flush();
    assert.deepStrictEqual(pendingWrites(chrome), []);
    assert.strictEqual(chrome.store.whatsNewPending, true);
    assertNoNewBadge(chrome);
    assert.strictEqual(badgeTexts(chrome).at(-1), "");
});

test("popup only: a patch update with nothing pending writes no pending state", async () => {
    const { chrome } = load({ ...COMBOS["popup only"], version: "3.2.1" });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.2.0" });
    await flush();
    assert.deepStrictEqual(pendingWrites(chrome), []);
    assert.notStrictEqual(chrome.store.whatsNewPending, true);
    assertNoNewBadge(chrome);
    assert.deepStrictEqual(badgeTexts(chrome), [""]);
    assert.strictEqual(titlesOf(chrome).at(-1), DEFAULT_TITLE);
});

test("popup only: startup with a pending notice removes the NEW and keeps pending", async () => {
    const { chrome } = load({ ...COMBOS["popup only"], storage: { whatsNewPending: true } });
    await flush();
    assert.deepStrictEqual(pendingWrites(chrome), []);
    assert.strictEqual(chrome.store.whatsNewPending, true);
    assertNoNewBadge(chrome);
    assert.deepStrictEqual(badgeTexts(chrome), [""]);
    assert.strictEqual(titlesOf(chrome).at(-1), DEFAULT_TITLE);
});

test("popup only: startup with nothing pending touches nothing", async () => {
    const { chrome } = load({ ...COMBOS["popup only"], storage: { whatsNewPending: false } });
    await flush();
    assert.strictEqual(pendingWrites(chrome).length, 0);
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 0);
    assert.strictEqual(callsOf(chrome, "setTitle").length, 0);
});

test("popup only: upgrading from 3.1.0 removes the NEW at startup, shows the notice once, then pending is false", async () => {
    // 3.1.0 left pending true with NEW on the toolbar.
    const { chrome, context } = load({ ...COMBOS["popup only"], storage: { whatsNewPending: true } });
    await flush();
    assert.strictEqual(chrome.store.whatsNewPending, true);
    assert.strictEqual(badgeTexts(chrome).at(-1), "");

    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    const injections = whatsNewInjections(chrome);
    assert.strictEqual(injections.length, 1);
    assert.strictEqual(injections[0].raw[0].func, vm.runInContext("showWhatsNew", context));
    assert.deepStrictEqual([...injections[0].raw[0].args], [WHATS_NEW_MESSAGE, "關閉"]);
    assert.strictEqual(chrome.store.whatsNewPending, false);

    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 2);
    assert.strictEqual(whatsNewInjections(chrome).length, 1);
    assertNoNewBadge(chrome);
});

test("popup only: a later download does not read storage or show anything", async () => {
    const { chrome } = load({ ...COMBOS["popup only"], storage: { whatsNewPending: true } });
    await flush();
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    const calmed = chrome.calls.length;
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(whatsNewInjections(chrome).length, 1);
    assert.deepStrictEqual(chrome.calls.slice(calmed).map((call) => call.name).filter((name) => name !== "download"), ["storage.get"]);
});

test("popup only: a failed notice injection keeps pending and the next download retries and clears it", async (t) => {
    const rejections = trackRejections(t);
    let attempts = 0;
    const { chrome, warnings } = load({
        ...COMBOS["popup only"],
        storage: { whatsNewPending: true },
        executeScript: () => (++attempts === 1 ? Promise.reject(new Error("Cannot access this page")) : Promise.resolve())
    });
    await flush();
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(whatsNewInjections(chrome).length, 1);
    assert.strictEqual(chrome.store.whatsNewPending, true);
    assert.deepStrictEqual(pendingWrites(chrome), []);
    assert.strictEqual(warnings.length, 1);

    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(whatsNewInjections(chrome).length, 2);
    assert.strictEqual(chrome.store.whatsNewPending, false);
    assertNoNewBadge(chrome);
    assert.deepStrictEqual(rejections, []);
});

test("popup only: a failed pending write on a minor update still removes NEW and only warns", async (t) => {
    const rejections = trackRejections(t);
    const { chrome, warnings } = load({
        ...COMBOS["popup only"],
        version: "3.2.0",
        storageSet: () => Promise.reject(new Error("quota"))
    });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" });
    await flush();
    assert.strictEqual(warnings.length, 1);
    assert.strictEqual(badgeTexts(chrome).at(-1), "");
    assert.deepStrictEqual(rejections, []);
});

// ---- badge only (badge on, popup off) ----

test("badge only: a minor update stores pending and sets NEW", async () => {
    const { chrome } = load({ ...COMBOS["badge only"], version: "3.2.0" });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" });
    await flush();
    assert.deepStrictEqual(pendingWrites(chrome), [{ whatsNewPending: true }]);
    assert.deepStrictEqual(badgeTexts(chrome), ["NEW"]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeBackgroundColor").map((call) => call.args[0]), [{ color: "#1aa99b" }]);
    assert.deepStrictEqual(titlesOf(chrome), [WHATS_NEW_TITLE]);
});

test("badge only: a patch update leaves storage and the badge alone", async () => {
    const { chrome } = load({ ...COMBOS["badge only"], version: "3.2.1" });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.2.0" });
    await flush();
    assert.strictEqual(pendingWrites(chrome).length, 0);
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 0);
    assert.strictEqual(callsOf(chrome, "setBadgeBackgroundColor").length, 0);
    assert.strictEqual(callsOf(chrome, "setTitle").length, 0);
});

test("badge only: startup with a pending notice restores NEW and keeps pending", async () => {
    const { chrome } = load({ ...COMBOS["badge only"], storage: { whatsNewPending: true } });
    await flush();
    assert.deepStrictEqual(badgeTexts(chrome), ["NEW"]);
    assert.deepStrictEqual(titlesOf(chrome), [WHATS_NEW_TITLE]);
    assert.strictEqual(pendingWrites(chrome).length, 0);
    assert.strictEqual(chrome.store.whatsNewPending, true);
});

test("badge only: startup with nothing pending touches nothing", async () => {
    const { chrome } = load({ ...COMBOS["badge only"], storage: {} });
    await flush();
    assert.strictEqual(callsOf(chrome, "setBadgeText").length, 0);
    assert.strictEqual(pendingWrites(chrome).length, 0);
});

test("badge only: the first download injects nothing, clears pending and removes NEW; the second does nothing", async () => {
    const { chrome } = load({ ...COMBOS["badge only"], version: "3.2.0" });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" });
    await flush();
    assert.deepStrictEqual(badgeTexts(chrome), ["NEW"]);

    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    assert.strictEqual(callsOf(chrome, "executeScript").length, 0);
    assert.strictEqual(chrome.store.whatsNewPending, false);
    assert.deepStrictEqual(badgeTexts(chrome), ["NEW", ""]);
    assert.deepStrictEqual(titlesOf(chrome), [WHATS_NEW_TITLE, DEFAULT_TITLE]);

    const writesAfterFirst = pendingWrites(chrome).length;
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 2);
    assert.strictEqual(callsOf(chrome, "executeScript").length, 0);
    assert.strictEqual(pendingWrites(chrome).length, writesAfterFirst);
    assert.deepStrictEqual(badgeTexts(chrome), ["NEW", ""]);
});

test("badge only: a download without a tab leaves pending and NEW in place", async () => {
    const { chrome } = load({ ...COMBOS["badge only"], storage: { whatsNewPending: true } });
    await flush();
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: EXTENSION_ID });
    await flush();
    assert.strictEqual(chrome.store.whatsNewPending, true);
    assert.deepStrictEqual(badgeTexts(chrome), ["NEW"]);
});

test("badge only: a slow restore cannot set NEW again after the first download clears it", async () => {
    let releaseFirstRead;
    let reads = 0;
    const { chrome } = load({
        ...COMBOS["badge only"],
        storageGet: () => {
            reads++;
            if (reads === 1) {
                return new Promise((resolve) => {
                    releaseFirstRead = () => resolve({ whatsNewPending: true });
                });
            }
            return Promise.resolve({ whatsNewPending: true });
        }
    });
    const delivered = chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    releaseFirstRead();
    await delivered;
    await flush();
    assert.strictEqual(callsOf(chrome, "executeScript").length, 0);
    assert.deepStrictEqual(badgeTexts(chrome).at(-1), "");
    assert.ok(badgeTexts(chrome).length >= 2);
    assert.strictEqual(chrome.store.whatsNewPending, false);
});

test("badge only: a failed pending write still removes NEW on the first download", async (t) => {
    const rejections = trackRejections(t);
    const { chrome, warnings } = load({
        ...COMBOS["badge only"],
        storage: { whatsNewPending: true },
        storageSet: () => Promise.reject(new Error("quota"))
    });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "executeScript").length, 0);
    assert.strictEqual(badgeTexts(chrome).at(-1), "");
    assert.strictEqual(warnings.length, 1);
    assert.deepStrictEqual(rejections, []);
});

// ---- the same story under every combination ----

// Pending stays true, the background starts, a patch update arrives, then two downloads.
const STORY_EXPECTATIONS = {
    "both on": { newAfterStartup: true, injections: 1, newAfterFirstDownload: false },
    "popup only": { newAfterStartup: false, injections: 1, newAfterFirstDownload: false },
    "badge only": { newAfterStartup: true, injections: 0, newAfterFirstDownload: false },
    "both off": { newAfterStartup: false, injections: 0, newAfterFirstDownload: false }
};

for (const [name, expected] of Object.entries(STORY_EXPECTATIONS)) {
    test(`${name}: pending left over, startup, patch update, then two downloads`, async () => {
        const { chrome } = load({ ...COMBOS[name], version: "3.2.1", storage: { whatsNewPending: true } });
        await flush();
        assert.strictEqual(badgeTexts(chrome).at(-1) === "NEW", expected.newAfterStartup);
        if (name === "both off") {
            assert.strictEqual(chrome.store.whatsNewPending, false);
        }

        await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.2.0" });
        await flush();
        assert.strictEqual(badgeTexts(chrome).at(-1) === "NEW", expected.newAfterStartup);

        await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
        await flush();
        assert.strictEqual(whatsNewInjections(chrome).length, expected.injections);
        assert.strictEqual(badgeTexts(chrome).at(-1) === "NEW", expected.newAfterFirstDownload);
        assert.strictEqual(chrome.store.whatsNewPending, false);

        await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
        await flush();
        assert.strictEqual(callsOf(chrome, "download").length, 2);
        assert.strictEqual(whatsNewInjections(chrome).length, expected.injections);
        if (!COMBOS[name].badge) {
            assertNoNewBadge(chrome);
        }
    });
}

test("shipped settings: no NEW badge, the notice on the first download only", async () => {
    const { chrome, context } = load({ shipped: true, version: "3.2.0", storage: { whatsNewPending: true } });
    await flush();
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" });
    await flush();
    assert.strictEqual(chrome.store.whatsNewPending, true);
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(whatsNewInjections(chrome).length, 1);
    assert.strictEqual(whatsNewInjections(chrome)[0].raw[0].func, vm.runInContext("showWhatsNew", context));
    assert.deepStrictEqual([...whatsNewInjections(chrome)[0].raw[0].args], [WHATS_NEW_MESSAGE, "關閉"]);
    assert.strictEqual(chrome.store.whatsNewPending, false);
    assertNoNewBadge(chrome);
});

// A 3.1.0 user who already saw the notice has pending false or no value at all; 3.2.0 still shows it once.
for (const [label, storage] of [["pending false", { whatsNewPending: false }], ["no pending value", {}]]) {
    test(`shipped settings: upgrading from 3.1.0 with ${label} shows the notice once and no NEW`, async () => {
        const { chrome } = load({ shipped: true, version: "3.2.0", storage });
        await flush();
        await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.1.0" });
        await flush();
        assert.strictEqual(chrome.store.whatsNewPending, true);
        await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
        await flush();
        await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
        await flush();
        assert.strictEqual(whatsNewInjections(chrome).length, 1);
        assert.deepStrictEqual([...whatsNewInjections(chrome)[0].raw[0].args], [WHATS_NEW_MESSAGE, "關閉"]);
        assert.strictEqual(chrome.store.whatsNewPending, false);
        assertNoNewBadge(chrome);
    });
}
