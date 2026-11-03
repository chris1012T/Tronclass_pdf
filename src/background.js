if (typeof importScripts === "function") {
    importScripts("lib/helpers.js");
}

const GITHUB_URL = "https://github.com/chris1012T/Tronclass_pdf";
const CONTENT_SCRIPTS = ["content/extract.js", "content/run.js"];

let menuSetup = Promise.resolve();

async function createMenus() {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
        id: "instructionPage",
        title: "使用說明",
        contexts: ["action"]
    });
    chrome.contextMenus.create({
        id: "changelogPage",
        title: "更新紀錄",
        contexts: ["action"]
    });
    chrome.contextMenus.create({
        id: "contextmenu_download",
        title: "下載此教材 (Tronclass)",
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "GitHubPage",
        title: "GitHub Page",
        contexts: ["action"]
    });
}

function setupMenus() {
    // Chain runs so onInstalled and onStartup firing together cannot interleave and create duplicate ids.
    menuSetup = menuSetup.then(createMenus).catch((error) => {
        console.warn("Failed to create context menus:", error);
    });
    return menuSetup;
}

async function downloadMaterial(tab) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: CONTENT_SCRIPTS
        });
    } catch (error) {
        console.warn("Cannot run the download script on this tab:", error);
    }
}

async function startDownload(url, filename) {
    try {
        await chrome.downloads.download({ url, filename, conflictAction: "uniquify" });
        return;
    } catch (error) {
        console.warn("Download with filename failed, retrying without it:", error);
    }
    try {
        await chrome.downloads.download({ url, conflictAction: "uniquify" });
    } catch (error) {
        console.warn("Download failed:", error);
    }
}

// Runs the task and turns a throw or rejection into a warning.
async function quietly(label, task) {
    try {
        return await task();
    } catch (error) {
        console.warn(label, error);
        return undefined;
    }
}

async function applyBadge(pending) {
    if (pending) {
        await Promise.all([
            quietly("Cannot set the badge text:", () => chrome.action.setBadgeText({ text: "NEW" })),
            quietly("Cannot set the badge color:", () => chrome.action.setBadgeBackgroundColor({ color: "#1aa99b" })),
            quietly("Cannot set the toolbar title:", () => chrome.action.setTitle({ title: WHATS_NEW_TITLE }))
        ]);
        return;
    }
    const resetTitle = () => chrome.action.setTitle({ title: chrome.runtime.getManifest().action.default_title });
    await Promise.all([
        quietly("Cannot clear the badge text:", () => chrome.action.setBadgeText({ text: "" })),
        quietly("Cannot reset the toolbar title:", resetTitle)
    ]);
}

async function readWhatsNewPending() {
    const stored = await quietly("Cannot read the update notice state:", () => chrome.storage.local.get("whatsNewPending"));
    return Boolean(stored && stored.whatsNewPending);
}

async function restoreBadge() {
    if (await readWhatsNewPending()) {
        await applyBadge(true);
    }
}

// Every service worker or background page start restores the badge, since browsers may drop it on restart.
const badgeRestored = restoreBadge();

async function maybeShowWhatsNew(tabId) {
    // Wait for the restore so it cannot set NEW again after the clear below.
    await badgeRestored;
    if (!(await readWhatsNewPending())) {
        return;
    }
    try {
        await chrome.scripting.executeScript({ target: { tabId }, func: showWhatsNew, args: [WHATS_NEW_MESSAGE] });
    } catch (error) {
        console.warn("Cannot show the update notice, keeping it for the next download:", error);
        return;
    }
    await quietly("Cannot save the update notice state:", () => chrome.storage.local.set({ whatsNewPending: false }));
    await applyBadge(false);
}

async function handleDownload(message, sender) {
    await startDownload(message.url, message.filename);
    if (sender.tab) {
        await maybeShowWhatsNew(sender.tab.id);
    }
}

chrome.runtime.onInstalled.addListener(async (details) => {
    setupMenus();
    if (details.reason === "install") {
        await chrome.tabs.create({ url: "pages/readme.html" });
    } else if (details.reason === "update" && shouldShowChangelog(details.previousVersion, chrome.runtime.getManifest().version)) {
        await quietly("Cannot save the update notice state:", () => chrome.storage.local.set({ whatsNewPending: true }));
        await applyBadge(true);
    }
});

chrome.runtime.onStartup.addListener(() => {
    setupMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    switch (info.menuItemId) {
        case "instructionPage":
            await chrome.tabs.create({ url: "pages/readme.html" });
            break;
        case "changelogPage":
            await chrome.tabs.create({ url: "pages/changelog.html" });
            break;
        case "contextmenu_download":
            await downloadMaterial(tab);
            break;
        case "GitHubPage":
            await chrome.tabs.create({ url: GITHUB_URL });
            break;
    }
});

chrome.action.onClicked.addListener((tab) => {
    downloadMaterial(tab);
});

chrome.runtime.onMessage.addListener((message, sender) => {
    if (!isDownloadMessage(message, sender, chrome.runtime.id)) {
        return;
    }
    handleDownload(message, sender);
});
