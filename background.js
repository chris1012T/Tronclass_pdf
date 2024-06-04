chrome.runtime.onInstalled.addListener(async(detail) => {
    switch (detail.reason) {
        case "install":
            await chrome.tabs.create({ url: "readme.html" });
            break;
        case "update":
            if (chrome.runtime.getManifest().version == '2.3.0') {
                await chrome.tabs.create({ url: "update_readme.html" });
            }
            break;
    }
});

a = chrome.runtime.getManifest();

chrome.contextMenus.create({
    id: "instructionPage",
    title: "使用說明",
    contexts: ['action']
});

chrome.contextMenus.create({
    id: "contextmenu_download",
    title: "下載此教材 (Tronclass)",
    contexts: ['all']
});

chrome.contextMenus.create({
    id: "GitHubPage",
    title: "GitHub Page",
    contexts: ['action']
});

chrome.contextMenus.onClicked.addListener(async(info, tab) => {
    switch (info.menuItemId) {
        case "instructionPage":
            await chrome.tabs.create({ url: "readme.html" });
            break;
        case "contextmenu_download":
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['fetch.js']
            });
            break;
        case "GitHubPage":
            await chrome.tabs.create({ url: "https://github.com/chris1012T/Tronclass_pdf" });
            break;
    }
});

chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['fetch.js']
    });
});

chrome.runtime.onMessage.addListener((data) => {
    chrome.downloads.download({
        conflictAction: "uniquify",
        url: data.src,
        filename: data.filename
    });
});