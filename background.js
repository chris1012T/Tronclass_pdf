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

chrome.contextMenus.onClicked.addListener(async(info) => {
    if (info.menuItemId == "instructionPage") {
        await chrome.tabs.create({ url: "readme.html" });
    }
})

chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['fetch.js']
    });
});

chrome.runtime.onMessage.addListener((data, info) => {
    console.log(info);
    chrome.downloads.download({
        conflictAction: "uniquify",
        url: data.src
    });
});