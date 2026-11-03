const WHATS_NEW_MESSAGE = "Tronclass PDF 更新：現在也能下載音訊教材了。";
const WHATS_NEW_TITLE = "Tronclass PDF：新增音訊下載，按一下圖示即可下載教材";

function parseVersion(version) {
    if (typeof version !== "string") {
        return null;
    }
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    return match ? match.slice(1).map(Number) : null;
}

function shouldShowChangelog(previousVersion, currentVersion) {
    const previous = parseVersion(previousVersion);
    const current = parseVersion(currentVersion);
    if (!previous || !current) {
        return false;
    }
    if (current[0] !== previous[0]) {
        return current[0] > previous[0];
    }
    return current[1] > previous[1];
}

function isDownloadMessage(message, sender, extensionId) {
    if (!sender || sender.id !== extensionId) {
        return false;
    }
    if (!message || message.type !== "download") {
        return false;
    }
    if (typeof message.filename !== "string" || message.filename === "") {
        return false;
    }
    if (typeof message.url !== "string") {
        return false;
    }
    try {
        const protocol = new URL(message.url).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}

// Serialized by executeScript, so it must not reference anything outside its own body.
function showWhatsNew(message) {
    const previous = document.getElementById("tronclass-pdf-whats-new");
    if (previous) {
        previous.remove();
    }
    if (!document.body) {
        return;
    }
    // Styles go through CSSOM properties, which the page CSP style-src does not block.
    const box = document.createElement("div");
    box.id = "tronclass-pdf-whats-new";
    box.setAttribute("role", "status");
    box.style.position = "fixed";
    box.style.right = "16px";
    box.style.bottom = "16px";
    box.style.zIndex = "2147483647";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.gap = "12px";
    box.style.maxWidth = "360px";
    box.style.padding = "12px 14px";
    box.style.background = "#ffffff";
    box.style.color = "#1f2328";
    box.style.borderRadius = "8px";
    box.style.borderLeft = "4px solid #1aa99b";
    box.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.18)";
    box.style.fontFamily = "system-ui, \"Segoe UI\", \"Noto Sans TC\", \"Microsoft JhengHei\", sans-serif";
    box.style.fontSize = "14px";
    box.style.lineHeight = "1.5";

    const text = document.createElement("span");
    text.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "關閉");
    close.textContent = "\u00d7";
    close.style.border = "none";
    close.style.background = "transparent";
    close.style.color = "#57606a";
    close.style.cursor = "pointer";
    close.style.fontSize = "18px";
    close.style.lineHeight = "1";
    close.style.padding = "0 4px";
    close.addEventListener("click", () => box.remove());

    box.appendChild(text);
    box.appendChild(close);
    document.body.appendChild(box);
    // Remove this exact box so an older timer cannot remove a newer notice.
    setTimeout(() => box.remove(), 8000);
}

if (typeof module !== "undefined") {
    module.exports = {
        shouldShowChangelog,
        isDownloadMessage,
        showWhatsNew,
        WHATS_NEW_MESSAGE,
        WHATS_NEW_TITLE
    };
}
