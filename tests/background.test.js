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

function makeEvent() {
    const listeners = [];
    return {
        addListener: (listener) => listeners.push(listener),
        fire: (...args) => Promise.all(listeners.map((listener) => listener(...args)))
    };
}

function makeChrome(options = {}) {
    const calls = [];
    const record = (name, result) => (...args) => {
        // Clone into this realm so deepStrictEqual does not trip over the vm context prototypes.
        calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
        return typeof result === "function" ? result(...args) : result;
    };
    const chrome = {
        calls,
        runtime: {
            id: EXTENSION_ID,
            getManifest: () => ({ version: options.version || "3.0.0" }),
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
        action: { onClicked: makeEvent() },
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
    return { chrome, warnings };
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
    assert.deepStrictEqual(names, ["removeAll", "create", "create", "create"]);
    assert.deepStrictEqual(
        callsOf(chrome, "create").map((call) => call.args[0]),
        [
            { id: "instructionPage", title: "使用說明", contexts: ["action"] },
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

test("onStartup removes old menus then creates three", async () => {
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

test("onInstalled update opens the changelog only for a minor or major bump", async () => {
    const bumped = load({ version: "3.0.0" });
    await bumped.chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "2.3.2" });
    await flush();
    assert.deepStrictEqual(callsOf(bumped.chrome, "tabs.create").map((call) => call.args[0]), [{ url: "pages/changelog.html" }]);

    const patched = load({ version: "3.0.1" });
    await patched.chrome.runtime.onInstalled.fire({ reason: "update", previousVersion: "3.0.0" });
    await flush();
    assert.strictEqual(callsOf(patched.chrome, "tabs.create").length, 0);
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
    assert.deepStrictEqual(chrome.calls.map((call) => call.name), ["removeAll"]);
    releaseFirst();
    await flush();
    const names = chrome.calls.filter((call) => call.name === "removeAll" || call.name === "create").map((call) => call.name);
    assert.deepStrictEqual(names, ["removeAll", "create", "create", "create", "removeAll", "create", "create", "create"]);
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
    assert.strictEqual(callsOf(chrome, "create").length, 3);
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
