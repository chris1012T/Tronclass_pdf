const test = require("node:test");
const assert = require("node:assert");
const { shouldShowChangelog, isDownloadMessage } = require("../src/lib/helpers.js");

test("shouldShowChangelog compares major.minor numerically", () => {
    const cases = [
        ["2.3.2", "3.0.0", true],
        ["1.1.1", "3.0.0", true],
        ["3.0.0", "3.1.0", true],
        ["3.0.0", "3.0.1", false],
        ["3.0.1", "3.0.1", false],
        [undefined, "3.0.0", false],
        ["abc", "3.0.0", false],
        ["3.1.0", "3.0.0", false],
        ["2.10.0", "2.9.0", false],
        ["2.9.0", "2.10.0", true],
        ["3.0.0", undefined, false],
        ["3.0.0", "4.0", false],
        ["3.0.0", "4.0.0.1", false],
        ["4.0.0", "3.9.0", false],
        [["2.0.0"], "3.0.0", false]
    ];
    for (const [previous, current, expected] of cases) {
        assert.strictEqual(shouldShowChangelog(previous, current), expected, `${previous} -> ${current}`);
    }
});

const EXTENSION_ID = "ext-id";
const SENDER = { id: EXTENSION_ID };

function message(overrides) {
    return { type: "download", url: "https://x.edu/a.pdf", filename: "a.pdf", ...overrides };
}

test("isDownloadMessage accepts a valid message", () => {
    assert.strictEqual(isDownloadMessage(message({}), SENDER, EXTENSION_ID), true);
    assert.strictEqual(isDownloadMessage(message({ url: "http://x.edu/a.pdf" }), SENDER, EXTENSION_ID), true);
});

test("isDownloadMessage rejects other senders", () => {
    assert.strictEqual(isDownloadMessage(message({}), { id: "other" }, EXTENSION_ID), false);
    assert.strictEqual(isDownloadMessage(message({}), undefined, EXTENSION_ID), false);
});

test("isDownloadMessage rejects other types", () => {
    assert.strictEqual(isDownloadMessage(message({ type: "upload" }), SENDER, EXTENSION_ID), false);
    assert.strictEqual(isDownloadMessage(message({ type: undefined }), SENDER, EXTENSION_ID), false);
});

test("isDownloadMessage rejects non http urls", () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "blob:https://x/y", "not a url", 42, undefined, new URL("https://x.edu/a.pdf")]) {
        assert.strictEqual(isDownloadMessage(message({ url }), SENDER, EXTENSION_ID), false, String(url));
    }
});

test("isDownloadMessage rejects empty or missing filenames", () => {
    assert.strictEqual(isDownloadMessage(message({ filename: "" }), SENDER, EXTENSION_ID), false);
    assert.strictEqual(isDownloadMessage(message({ filename: undefined }), SENDER, EXTENSION_ID), false);
    assert.strictEqual(isDownloadMessage(message({ filename: 5 }), SENDER, EXTENSION_ID), false);
});

test("isDownloadMessage never throws on non objects", () => {
    for (const value of [null, undefined, "download", 7]) {
        assert.doesNotThrow(() => {
            assert.strictEqual(isDownloadMessage(value, SENDER, EXTENSION_ID), false);
        });
    }
});

test("the update notice texts are exact", () => {
    const { WHATS_NEW_MESSAGE, WHATS_NEW_TITLE } = require("../src/lib/helpers.js");
    assert.strictEqual(WHATS_NEW_MESSAGE, "Tronclass PDF 更新：現在也能下載音訊教材了。");
    assert.strictEqual(WHATS_NEW_TITLE, "Tronclass PDF：新增音訊下載，按一下圖示即可下載教材");
});
