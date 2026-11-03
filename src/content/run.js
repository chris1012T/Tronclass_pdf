(function () {
    const messages = {
        "not-material": "請先開啟教材!",
        "streaming-video": "這部影片是串流格式，無法直接下載。",
        "streaming-audio": "這個音訊是串流格式，無法直接下載。",
        "not-found": "這個頁面找不到可下載的教材。"
    };
    const result = extractMaterial(document, location.href);
    if (result.ok) {
        chrome.runtime.sendMessage({ type: "download", url: result.url, filename: result.filename });
        return;
    }
    alert(messages[result.reason]);
})();
