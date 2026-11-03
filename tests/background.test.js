const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

const DEFAULT_TITLE = "請先開啟教材頁面再點我";

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
            getManifest: () => ({ version: options.version || "3.1.0", action: { default_title: DEFAULT_TITLE } }),
            onInstalled: makeEvent(),
            onStartup: makeEvent(),
            onMessage: makeEvent()
        },
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

function load(options = {}) {
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
            vm.runInContext(helpersCode, context);
        };
    } else {
        vm.runInContext(helpersCode, context);
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

test("onInstalled update after a minor bump sets the NEW badge instead of opening a tab", async () => {
    const { chrome } = load({ version: "3.1.0" });
    await chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.0.0" });
    await flush();
    assert.strictEqual(callsOf(chrome, "tabs.create").length, 0);
    assert.deepStrictEqual(callsOf(chrome, "storage.set").map((call) => call.args[0]), [{ whatsNewPending: true }]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeText").map((call) => call.args[0]), [{ text: "NEW" }]);
    assert.deepStrictEqual(callsOf(chrome, "setBadgeBackgroundColor").map((call) => call.args[0]), [{ color: "#1aa99b" }]);
    assert.deepStrictEqual(callsOf(chrome, "setTitle").map((call) => call.args[0]), [{ title: WHATS_NEW_TITLE }]);
});

test("onInstalled update after a patch bump leaves storage and the badge alone", async () => {
    const { chrome } = load({ version: "3.1.1" });
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

test("loading the script restores the NEW badge when the notice is pending", async () => {
    const { chrome } = load({ storage: { whatsNewPending: true } });
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

test("the first download after an update shows the notice and clears the badge", async () => {
    const { chrome, context } = load({ storage: { whatsNewPending: true } });
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
    assert.deepStrictEqual([...options.args], [WHATS_NEW_MESSAGE]);
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
    const { chrome } = load({ storage: { whatsNewPending: true } });
    await chrome.runtime.onMessage.fire({ ...VALID_MESSAGE, url: "javascript:alert(1)" }, TAB_SENDER);
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: "someone-else", tab: { id: 9 } });
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 0);
    assert.strictEqual(callsOf(chrome, "executeScript").length, 0);
    assert.strictEqual(callsOf(chrome, "storage.set").length, 0);
    assert.strictEqual(chrome.store.whatsNewPending, true);
});

test("toolbar clicks and the download menu only inject files and leave the notice pending", async () => {
    const { chrome } = load({ storage: { whatsNewPending: true } });
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

test("a failed notice injection keeps the notice pending", async (t) => {
    const rejections = trackRejections(t);
    const { chrome, warnings } = load({
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
    const { chrome, warnings } = load({ version: "3.1.0", storageSet: () => Promise.reject(new Error("quota")) });
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
    const { chrome } = load({ storage: { whatsNewPending: true } });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, { id: EXTENSION_ID });
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 1);
    assert.strictEqual(callsOf(chrome, "executeScript").length, 0);
    assert.strictEqual(chrome.store.whatsNewPending, true);
});

test("the notice still shows after both download attempts fail", async (t) => {
    const rejections = trackRejections(t);
    const { chrome } = load({ storage: { whatsNewPending: true }, download: () => Promise.reject(new Error("nope")) });
    await chrome.runtime.onMessage.fire(VALID_MESSAGE, TAB_SENDER);
    await flush();
    assert.strictEqual(callsOf(chrome, "download").length, 2);
    assert.strictEqual(whatsNewInjections(chrome).length, 1);
    assert.deepStrictEqual(callsOf(chrome, "storage.set").map((call) => call.args[0]), [{ whatsNewPending: false }]);
    assert.strictEqual(chrome.store.whatsNewPending, false);
    assert.deepStrictEqual(rejections, []);
});

test("a slow badge restore cannot set NEW again after the notice clears it", async () => {
    let releaseFirstRead;
    let reads = 0;
    const { chrome } = load({
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
