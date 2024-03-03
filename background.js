chrome.runtime.onInstalled.addListener(async(detail) => {
    if (detail.reason == "install") {
        await chrome.tabs.create({ url: "readme.html" });
    }
});

// chrome.runtime.onInstalled.addListener(async(detail) => {
//     if (detail.reason == "update") {
//         await chrome.tabs.create({ url: "update_readme.html" });
//     }
// });

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
    id: "GithubPage",
    title: "Github Page",
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
        case "GithubPage":
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
        url: data.src
    });
});