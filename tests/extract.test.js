const test = require("node:test");
const assert = require("node:assert");
const { sanitizeFilename, extractMaterial } = require("../src/content/extract.js");

function stem(filename) {
    return filename.slice(0, filename.lastIndexOf("."));
}

test("sanitizeFilename replaces reserved characters", () => {
    assert.strictEqual(sanitizeFilename("a/b:c?", "pdf"), "a_b_c_.pdf");
    assert.strictEqual(sanitizeFilename("<>\"\\|*", "pdf"), "______.pdf");
    assert.strictEqual(sanitizeFilename("a\x07b\x00c\x1f", "pdf"), "a_b_c_.pdf");
});

test("sanitizeFilename trims spaces and trailing dots", () => {
    assert.strictEqual(sanitizeFilename("  講義. ", "pdf"), "講義.pdf");
    assert.strictEqual(sanitizeFilename("  a b  ", "pdf"), "a b.pdf");
});

test("sanitizeFilename trims leading and trailing newlines before replacing", () => {
    assert.strictEqual(sanitizeFilename("\n講義\n", "pdf"), "講義.pdf");
    assert.strictEqual(sanitizeFilename("a\nb", "pdf"), "a_b.pdf");
});

test("sanitizeFilename falls back when nothing is left", () => {
    assert.strictEqual(sanitizeFilename("", "mp4"), "Tronclass教材.mp4");
    assert.strictEqual(sanitizeFilename("...", "pdf"), "Tronclass教材.pdf");
});

test("sanitizeFilename truncates to 200 UTF-8 bytes by code point", () => {
    const ascii = stem(sanitizeFilename("a".repeat(300), "pdf"));
    assert.strictEqual(Buffer.byteLength(ascii), 200);

    const cjk = stem(sanitizeFilename("講".repeat(200), "pdf"));
    assert.strictEqual(cjk, "講".repeat(66));
    assert.strictEqual(Buffer.byteLength(cjk), 198);

    const emoji = stem(sanitizeFilename("😀".repeat(200), "pdf"));
    assert.strictEqual(emoji, "😀".repeat(50));
    assert.strictEqual(Buffer.byteLength(emoji), 200);
    assert.strictEqual(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(emoji), false);

    const mixed = stem(sanitizeFilename("é".repeat(150), "pdf"));
    assert.strictEqual(mixed, "é".repeat(100));
});

test("sanitizeFilename trims again after truncation", () => {
    const result = stem(sanitizeFilename("a".repeat(199) + ". b", "pdf"));
    assert.strictEqual(result, "a".repeat(199));
    assert.doesNotMatch(result, /[.\s]$/);
    assert.strictEqual(stem(sanitizeFilename("a".repeat(199) + " bc", "pdf")), "a".repeat(199));
});

function element(props) {
    return { innerText: "", src: "", currentSrc: "", ...props };
}

function fakeDocument({ viewer, title, video, videoTitle, selectors = [] } = {}) {
    const bySelector = {
        ".title span": title === undefined ? null : element({ innerText: title }),
        "video": video ? element(video) : null,
        "span.title": videoTitle === undefined ? null : element({ innerText: videoTitle })
    };
    for (const selector of selectors) {
        bySelector[selector] = element({});
    }
    return {
        getElementById: (id) => (id === "pdf-viewer" && viewer !== undefined ? element({ src: viewer }) : null),
        querySelector: (selector) => bySelector[selector] || null
    };
}

const PAGE = "https://x.edu/course/1";

function pdf(viewer, title = "講義") {
    return extractMaterial(fakeDocument({ viewer, title }), PAGE);
}

test("extractMaterial reads an encoded file parameter", () => {
    const result = extractMaterial(
        fakeDocument({ viewer: "https://x.edu/viewer.html?file=https%3A%2F%2Fx.edu%2Fa%20b.pdf&upload_id=3", title: "微積分 / 第一章" }),
        PAGE
    );
    // new URL keeps the space percent encoded.
    assert.deepStrictEqual(result, { ok: true, url: "https://x.edu/a%20b.pdf", filename: "微積分 _ 第一章.pdf" });
});

test("extractMaterial handles swapped parameter order", () => {
    const result = extractMaterial(
        fakeDocument({ viewer: "https://x.edu/viewer.html?upload_id=3&file=https%3A%2F%2Fx.edu%2Fa%20b.pdf", title: "微積分 / 第一章" }),
        PAGE
    );
    assert.deepStrictEqual(result, { ok: true, url: "https://x.edu/a%20b.pdf", filename: "微積分 _ 第一章.pdf" });
});

test("extractMaterial keeps the legacy split for raw ampersands and plus signs", () => {
    assert.strictEqual(pdf("https://x.edu/viewer.html?file=/api/9/blob?a=1&b=2&upload_id=3").url, "https://x.edu/api/9/blob?a=1&b=2");
    assert.strictEqual(pdf("https://x.edu/viewer.html?file=/f/C++.pdf&upload_id=3").url, "https://x.edu/f/C++.pdf");
});

test("extractMaterial falls back to searchParams when decoding fails", () => {
    assert.deepStrictEqual(pdf("https://x.edu/viewer.html?file=/a%E0.pdf&upload_id=3"), { ok: true, url: "https://x.edu/a%EF%BF%BD.pdf", filename: "講義.pdf" });
});

test("extractMaterial uses searchParams when the legacy markers are missing", () => {
    assert.strictEqual(pdf("https://x.edu/viewer.html?file=%2Fa.pdf&page=2").url, "https://x.edu/a.pdf");
    assert.strictEqual(pdf("https://x.edu/viewer.html?page=1&upload_id=3&file=%2Fa.pdf").url, "https://x.edu/a.pdf");
});

test("extractMaterial resolves a relative viewer src against the page", () => {
    assert.strictEqual(pdf("/viewer.html?file=%2Fa.pdf&upload_id=1").url, "https://x.edu/a.pdf");
});

test("extractMaterial resolves a relative file path", () => {
    assert.strictEqual(pdf("https://x.edu/viewer.html?file=/api/files/9.pdf&upload_id=1").url, "https://x.edu/api/files/9.pdf");
});

test("extractMaterial resolves a relative file path against the viewer, not the page", () => {
    const result = extractMaterial(fakeDocument({ viewer: "https://x.edu/static/pdfjs/viewer.html?file=files/9.pdf&upload_id=1", title: "講義" }), "https://x.edu/course/1");
    assert.strictEqual(result.url, "https://x.edu/static/pdfjs/files/9.pdf");
});

test("extractMaterial returns not-found for bad or missing files", () => {
    assert.deepStrictEqual(pdf("https://x.edu/viewer.html?file=http%3A%2F%2F%5B&upload_id=1"), { ok: false, reason: "not-found" });
    assert.deepStrictEqual(pdf("https://x.edu/viewer.html?upload_id=1&file=http%3A%2F%2F%5B"), { ok: false, reason: "not-found" });
    assert.deepStrictEqual(pdf("https://x.edu/viewer.html?file=&upload_id=1"), { ok: false, reason: "not-found" });
    assert.deepStrictEqual(pdf("https://x.edu/viewer.html?upload_id=1"), { ok: false, reason: "not-found" });
    assert.deepStrictEqual(extractMaterial(fakeDocument({ viewer: "/viewer.html?file=a.pdf&upload_id=1" }), "not a url"), { ok: false, reason: "not-found" });
});

test("extractMaterial falls back to the default PDF name without a title", () => {
    const result = extractMaterial(fakeDocument({ viewer: "https://x.edu/viewer.html?file=%2Fa.pdf&upload_id=1" }), PAGE);
    assert.deepStrictEqual(result, { ok: true, url: "https://x.edu/a.pdf", filename: "Tronclass教材.pdf" });
});

test("extractMaterial reads videos", () => {
    assert.deepStrictEqual(
        extractMaterial(fakeDocument({ video: { currentSrc: "https://x.edu/v.mp4", src: "" }, videoTitle: "第一週" }), PAGE),
        { ok: true, url: "https://x.edu/v.mp4", filename: "第一週.mp4" }
    );
    assert.deepStrictEqual(
        extractMaterial(fakeDocument({ video: { currentSrc: "", src: "https://x.edu/s.mp4" }, videoTitle: "第二週" }), PAGE),
        { ok: true, url: "https://x.edu/s.mp4", filename: "第二週.mp4" }
    );
    assert.deepStrictEqual(
        extractMaterial(fakeDocument({ video: { currentSrc: "blob:https://x.edu/1", src: "" }, videoTitle: "第一週" }), PAGE),
        { ok: false, reason: "streaming-video" }
    );
    assert.deepStrictEqual(
        extractMaterial(fakeDocument({ video: { currentSrc: "", src: "" }, videoTitle: "第一週" }), PAGE),
        { ok: false, reason: "not-found" }
    );
    assert.deepStrictEqual(
        extractMaterial(fakeDocument({ video: { currentSrc: "https://x.edu/v.mp4", src: "" } }), PAGE),
        { ok: true, url: "https://x.edu/v.mp4", filename: "Tronclass教材.mp4" }
    );
});

test("extractMaterial prefers currentSrc over src", () => {
    const result = extractMaterial(fakeDocument({ video: { currentSrc: "https://x.edu/a.mp4", src: "https://x.edu/b.mp4" }, videoTitle: "第一週" }), PAGE);
    assert.strictEqual(result.url, "https://x.edu/a.mp4");
});

test("extractMaterial prefers the PDF viewer over a video", () => {
    const doc = fakeDocument({ viewer: "https://x.edu/viewer.html?file=%2Fa.pdf&upload_id=1", title: "講義", video: { currentSrc: "https://x.edu/v.mp4" } });
    assert.strictEqual(extractMaterial(doc, PAGE).url, "https://x.edu/a.pdf");
});

test("extractMaterial tells course pages apart from unrelated pages", () => {
    assert.deepStrictEqual(extractMaterial(fakeDocument({ selectors: [".course-header-container"] }), PAGE), { ok: false, reason: "not-material" });
    assert.deepStrictEqual(extractMaterial(fakeDocument({ selectors: [".activity-title-wrapper"] }), PAGE), { ok: false, reason: "not-material" });
    assert.deepStrictEqual(extractMaterial(fakeDocument(), PAGE), { ok: false, reason: "not-found" });
});
