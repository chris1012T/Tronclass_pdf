chrome.runtime.onInstalled.addListener(async(detail) => {
    if (detail.reason == "install") {
        await chrome.tabs.create({ url: "readme.html" });
    }
});

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

chrome.contextMenus.onClicked.addListener(async(info, tab) => {
    if (info.menuItemId == "instructionPage") {
        await chrome.tabs.create({ url: "readme.html" });
    } else if (info.menuItemId == "contextmenu_download") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['fetch.js']
        });
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
        url: data.src
    });
});