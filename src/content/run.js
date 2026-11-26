(function () {
    // Kept inside the IIFE because this file is injected again on every click.
    const messageKeys = {
        "not-material": "errorNotMaterial",
        "streaming-video": "errorStreamingVideo",
        "streaming-audio": "errorStreamingAudio",
        "not-found": "errorNotFound"
    };
    const result = extractMaterial(document, location.href, chrome.i18n.getMessage("fallbackFilename"));
    if (result.ok) {
        chrome.runtime.sendMessage({ type: "download", url: result.url, filename: result.filename });
        return;
    }
    alert(chrome.i18n.getMessage(messageKeys[result.reason]));
})();
