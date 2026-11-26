if (typeof importScripts === "function") {
    importScripts("lib/helpers.js");
}

const GITHUB_URL = "https://github.com/chris1012T/Tronclass_pdf";
const CONTENT_SCRIPTS = ["content/extract.js", "content/run.js"];

let menuSetup = Promise.resolve();

// Page paths are messages so each locale opens its own page; an empty result means the key is missing.
function localizedPage(key, fallback) {
    return chrome.i18n.getMessage(key) || fallback;
}

async function createMenus() {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
        id: "instructionPage",
        title: chrome.i18n.getMessage("menuReadme"),
        contexts: ["action"]
    });
    chrome.contextMenus.create({
        id: "changelogPage",
        title: chrome.i18n.getMessage("menuChangelog"),
        contexts: ["action"]
    });
    chrome.contextMenus.create({
        id: "contextmenu_download",
        title: chrome.i18n.getMessage("menuDownload"),
        contexts: ["all"]
    });
    chrome.contextMenus.create({
        id: "GitHubPage",
        title: chrome.i18n.getMessage("menuGitHub"),
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
        const title = chrome.i18n.getMessage("whatsNewTitle");
        await Promise.all([
            quietly("Cannot set the badge text:", () => chrome.action.setBadgeText({ text: "NEW" })),
            quietly("Cannot set the badge color:", () => chrome.action.setBadgeBackgroundColor({ color: "#1aa99b" })),
            quietly("Cannot set the toolbar title:", () => chrome.action.setTitle({ title }))
        ]);
        return;
    }
    // The manifest only holds "__MSG_actionTitle__", so the title comes from the messages.
    const resetTitle = () => chrome.action.setTitle({ title: chrome.i18n.getMessage("actionTitle") });
    await Promise.all([
        quietly("Cannot clear the badge text:", () => chrome.action.setBadgeText({ text: "" })),
        quietly("Cannot reset the toolbar title:", resetTitle)
    ]);
}

async function readWhatsNewPending() {
    const stored = await quietly("Cannot read the update notice state:", () => chrome.storage.local.get("whatsNewPending"));
    return Boolean(stored && stored.whatsNewPending);
}

// Idempotent, so the restore and the update handler may both run it.
async function clearWhatsNew() {
    await quietly("Cannot save the update notice state:", () => chrome.storage.local.set({ whatsNewPending: false }));
    await applyBadge(false);
}

async function restoreBadge() {
    if (!(await readWhatsNewPending())) {
        return;
    }
    if (SHOW_UPDATE_BADGE) {
        await applyBadge(true);
        return;
    }
    if (SHOW_UPDATE_POPUP) {
        // The notice is still owed, so pending stays; only a NEW left over from an earlier release goes.
        await applyBadge(false);
        return;
    }
    // A NEW left over from an update that never reached onInstalled, or was cut off before the clear.
    await clearWhatsNew();
}

// Every service worker or background page start restores the badge, since browsers may drop it on restart.
const badgeRestored = restoreBadge();

async function maybeShowWhatsNew(tabId) {
    // Checked before any storage read, so a clear that never got written cannot bring the notice back.
    if (!SHOW_UPDATE_BADGE && !SHOW_UPDATE_POPUP) {
        return;
    }
    // Wait for the restore so it cannot set NEW again after the clear below.
    await badgeRestored;
    if (!(await readWhatsNewPending())) {
        return;
    }
    if (SHOW_UPDATE_POPUP) {
        try {
            const args = [chrome.i18n.getMessage("whatsNewMessage"), chrome.i18n.getMessage("closeLabel")];
            await chrome.scripting.executeScript({ target: { tabId }, func: showWhatsNew, args });
        } catch (error) {
            console.warn("Cannot show the update notice, keeping it for the next download:", error);
            return;
        }
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

async function handleUpdate(previousVersion) {
    if (!SHOW_UPDATE_BADGE && !SHOW_UPDATE_POPUP) {
        // Restore only clears here (it does nothing else while both switches are off); the await orders its clear before this one.
        // Both clears are idempotent, so the order does not change the result.
        await badgeRestored;
        await clearWhatsNew();
        return;
    }
    if (shouldShowChangelog(previousVersion, chrome.runtime.getManifest().version)) {
        await quietly("Cannot save the update notice state:", () => chrome.storage.local.set({ whatsNewPending: true }));
        // With the badge off this removes any NEW instead, so the toolbar never shows one for this release.
        await applyBadge(SHOW_UPDATE_BADGE);
    } else if (!SHOW_UPDATE_BADGE) {
        await applyBadge(false);
    }
}

chrome.runtime.onInstalled.addListener(async (details) => {
    setupMenus();
    if (details.reason === "install") {
        await chrome.tabs.create({ url: localizedPage("readmePage", "pages/readme.html") });
    } else if (details.reason === "update") {
        await handleUpdate(details.previousVersion);
    }
});

chrome.runtime.onStartup.addListener(() => {
    setupMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    switch (info.menuItemId) {
        case "instructionPage":
            await chrome.tabs.create({ url: localizedPage("readmePage", "pages/readme.html") });
            break;
        case "changelogPage":
            await chrome.tabs.create({ url: localizedPage("changelogPage", "pages/changelog.html") });
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
