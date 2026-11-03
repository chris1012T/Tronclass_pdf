// Injected again on every click into the same isolated world, so the top level only uses function declarations.

function utf8Length(character) {
    const codePoint = character.codePointAt(0);
    if (codePoint < 0x80) {
        return 1;
    }
    if (codePoint < 0x800) {
        return 2;
    }
    return codePoint < 0x10000 ? 3 : 4;
}

function trimFilenameEnd(name) {
    return name.replace(/[.\s]+$/, "");
}

function sanitizeFilename(name, extension) {
    // Trim first so leading and trailing newlines are dropped instead of becoming "_".
    const cleaned = name.trim().replace(/[/<>:"\\|?*\x00-\x1f]/g, "_");
    let bytes = 0;
    let truncated = "";
    for (const character of cleaned) {
        bytes += utf8Length(character);
        if (bytes > 200) {
            break;
        }
        truncated += character;
    }
    // Trailing dots and spaces are only stripped here, which covers both the original end and the cut point.
    const base = trimFilenameEnd(truncated);
    return `${base || "Tronclass教材"}.${extension}`;
}

function textOf(element) {
    return element ? element.innerText : "";
}

function pdfFileParam(src, viewerUrl) {
    if (src.includes("?file=") && src.includes("&upload_id")) {
        const raw = src.split("?file=")[1].split("&upload_id")[0];
        try {
            return decodeURIComponent(raw);
        } catch {
            // Fall through to the standard query parser.
        }
    }
    return viewerUrl.searchParams.get("file");
}

function extractPdf(doc, viewer, pageUrl) {
    const src = viewer.src;
    let url;
    try {
        const viewerUrl = new URL(src, pageUrl);
        const file = pdfFileParam(src, viewerUrl);
        if (!file) {
            return { ok: false, reason: "not-found" };
        }
        url = new URL(file, viewerUrl).href;
    } catch {
        return { ok: false, reason: "not-found" };
    }
    return { ok: true, url, filename: sanitizeFilename(textOf(doc.querySelector(".title span")), "pdf") };
}

function extractVideo(doc, video) {
    const url = video.currentSrc || video.src;
    if (url.startsWith("blob:")) {
        return { ok: false, reason: "streaming-video" };
    }
    if (url === "") {
        return { ok: false, reason: "not-found" };
    }
    return { ok: true, url, filename: sanitizeFilename(textOf(doc.querySelector("span.title")), "mp4") };
}

function extractMaterial(doc, pageUrl) {
    const viewer = doc.getElementById("pdf-viewer");
    if (viewer) {
        return extractPdf(doc, viewer, pageUrl);
    }
    const video = doc.querySelector("video");
    if (video) {
        return extractVideo(doc, video);
    }
    if (doc.querySelector(".course-header-container") || doc.querySelector(".activity-title-wrapper")) {
        return { ok: false, reason: "not-material" };
    }
    return { ok: false, reason: "not-found" };
}

if (typeof module !== "undefined") {
    module.exports = { sanitizeFilename, extractMaterial };
}
