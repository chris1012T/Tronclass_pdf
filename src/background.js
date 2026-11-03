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

chrome.runtime.onInstalled.addListener(async (details) => {
    setupMenus();
    if (details.reason === "install") {
        await chrome.tabs.create({ url: "pages/readme.html" });
    } else if (details.reason === "update" && shouldShowChangelog(details.previousVersion, chrome.runtime.getManifest().version)) {
        await chrome.tabs.create({ url: "pages/changelog.html" });
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
    startDownload(message.url, message.filename);
});
