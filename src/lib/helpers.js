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

if (typeof module !== "undefined") {
    module.exports = { shouldShowChangelog, isDownloadMessage };
}
