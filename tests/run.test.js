const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const contentDir = path.resolve(__dirname, "..", "src", "content");
const extractCode = fs.readFileSync(path.join(contentDir, "extract.js"), "utf8");
const runCode = fs.readFileSync(path.join(contentDir, "run.js"), "utf8");

function fakeDocument(elements) {
    return {
        getElementById: (id) => elements["#" + id] || null,
        querySelector: (selector) => elements[selector] || null
    };
}

function makeContext() {
    const sent = [];
    const alerts = [];
    const context = vm.createContext({
        URL,
        location: { href: "https://x.edu/course/1" },
        chrome: { runtime: { sendMessage: (message) => sent.push(JSON.parse(JSON.stringify(message))) } },
        alert: (text) => alerts.push(text)
    });
    return { context, sent, alerts };
}

function inject(context, document) {
    context.document = document;
    vm.runInContext(extractCode, context, { filename: "extract.js" });
    vm.runInContext(runCode, context, { filename: "run.js" });
}

const PDF_PAGE = fakeDocument({
    "#pdf-viewer": { src: "https://x.edu/viewer.html?file=%2Fa.pdf&upload_id=1" },
    ".title span": { innerText: "講義" }
});

test("the scripts can be injected twice into the same context", () => {
    const { context, sent } = makeContext();
    inject(context, PDF_PAGE);
    assert.doesNotThrow(() => inject(context, PDF_PAGE));
    assert.strictEqual(sent.length, 2);
});

test("a material page sends a download message", () => {
    const { context, sent, alerts } = makeContext();
    inject(context, PDF_PAGE);
    assert.deepStrictEqual(sent, [{ type: "download", url: "https://x.edu/a.pdf", filename: "講義.pdf" }]);
    assert.deepStrictEqual(alerts, []);
});

test("a relative viewer src is resolved against location.href", () => {
    const { context, sent, alerts } = makeContext();
    inject(context, fakeDocument({
        "#pdf-viewer": { src: "/viewer.html?file=files/9.pdf&upload_id=1" },
        ".title span": { innerText: "講義" }
    }));
    assert.deepStrictEqual(sent, [{ type: "download", url: "https://x.edu/files/9.pdf", filename: "講義.pdf" }]);
    assert.deepStrictEqual(alerts, []);
});

test("a course page asks to open a material first", () => {
    const { context, sent, alerts } = makeContext();
    inject(context, fakeDocument({ ".course-header-container": {} }));
    assert.deepStrictEqual(alerts, ["請先開啟教材!"]);
    assert.deepStrictEqual(sent, []);
});

test("a streaming video explains it cannot be downloaded", () => {
    const { context, sent, alerts } = makeContext();
    inject(context, fakeDocument({ "video": { currentSrc: "blob:https://x.edu/1", src: "" } }));
    assert.deepStrictEqual(alerts, ["這部影片是串流格式，無法直接下載。"]);
    assert.deepStrictEqual(sent, []);
});

test("an unrelated page says nothing was found", () => {
    const { context, sent, alerts } = makeContext();
    inject(context, fakeDocument({}));
    assert.deepStrictEqual(alerts, ["這個頁面找不到可下載的教材。"]);
    assert.deepStrictEqual(sent, []);
});
