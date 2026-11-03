const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const helpersCode = fs.readFileSync(path.resolve(__dirname, "..", "src", "lib", "helpers.js"), "utf8");
const NOTICE_ID = "tronclass-pdf-whats-new";

function makeElement(tagName, doc) {
    const style = {};
    // Any cssText write means the code bypassed the CSSOM properties.
    Object.defineProperty(style, "cssText", {
        get: () => "",
        set: () => {
            throw new Error("style.cssText is not allowed");
        }
    });
    const element = {
        tagName: tagName.toUpperCase(),
        id: "",
        textContent: "",
        style,
        attributes: {},
        children: [],
        parent: null,
        listeners: {},
        setAttribute(name, value) {
            if (name.toLowerCase() === "style") {
                throw new Error("setAttribute style is not allowed");
            }
            this.attributes[name] = String(value);
        },
        getAttribute(name) {
            return name in this.attributes ? this.attributes[name] : null;
        },
        appendChild(child) {
            child.parent = this;
            this.children.push(child);
            return child;
        },
        append(...nodes) {
            nodes.forEach((node) => this.appendChild(node));
        },
        remove() {
            if (this.parent) {
                this.parent.children.splice(this.parent.children.indexOf(this), 1);
                this.parent = null;
            }
        },
        addEventListener(type, listener) {
            (this.listeners[type] = this.listeners[type] || []).push(listener);
        },
        click() {
            (this.listeners.click || []).forEach((listener) => listener({ type: "click" }));
        }
    };
    Object.defineProperty(element, "innerHTML", {
        get: () => "",
        set: () => {
            throw new Error("innerHTML is not allowed");
        }
    });
    doc.created.push(element);
    return element;
}

function makeDocument({ withBody = true } = {}) {
    const doc = { created: [], createdTags: [] };
    doc.createElement = (tagName) => {
        doc.createdTags.push(tagName.toLowerCase());
        return makeElement(tagName, doc);
    };
    doc.body = withBody ? makeElement("body", doc) : null;
    const walk = (node, found) => {
        for (const child of node.children) {
            found.push(child);
            walk(child, found);
        }
        return found;
    };
    doc.all = () => (doc.body ? walk(doc.body, []) : []);
    doc.getElementById = (id) => doc.all().find((node) => node.id === id) || null;
    return doc;
}

function makeTimers() {
    const timers = [];
    return {
        timers,
        setTimeout: (callback, delay) => {
            timers.push({ callback, delay });
            return timers.length;
        }
    };
}

function loadNotice(options) {
    const doc = makeDocument(options);
    const clock = makeTimers();
    const context = vm.createContext({ document: doc, setTimeout: clock.setTimeout });
    vm.runInContext(helpersCode, context);
    return { doc, clock, showWhatsNew: context.showWhatsNew, context };
}

function notices(doc) {
    return doc.all().filter((node) => node.id === NOTICE_ID);
}

function textOf(node) {
    return node.textContent + node.children.map(textOf).join("");
}

function closeButton(notice) {
    return notice.children.find((node) => node.tagName === "BUTTON");
}

test("showWhatsNew adds one notice with the message as plain text", () => {
    const { doc, showWhatsNew } = loadNotice();
    showWhatsNew("更新 <b>x</b>");
    const found = notices(doc);
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].parent, doc.body);
    assert.ok(textOf(found[0]).includes("更新 <b>x</b>"));
    assert.ok(!doc.createdTags.includes("b"));
    assert.strictEqual(found[0].style.position, "fixed");
    assert.strictEqual(found[0].style.zIndex, "2147483647");
    assert.strictEqual(found[0].style.right, "16px");
    assert.strictEqual(found[0].style.bottom, "16px");
    assert.strictEqual(found[0].style.borderLeft, "4px solid #1aa99b");
});

test("showWhatsNew keeps a single notice when called twice", () => {
    const { doc, showWhatsNew } = loadNotice();
    showWhatsNew("a");
    showWhatsNew("b");
    const found = notices(doc);
    assert.strictEqual(found.length, 1);
    assert.ok(textOf(found[0]).includes("b"));
});

test("the close button is labelled and removes the notice", () => {
    const { doc, showWhatsNew } = loadNotice();
    showWhatsNew("a");
    const button = closeButton(notices(doc)[0]);
    assert.strictEqual(button.getAttribute("aria-label"), "關閉");
    button.click();
    assert.strictEqual(notices(doc).length, 0);
});

test("the notice removes itself after 8000 ms", () => {
    const { doc, clock, showWhatsNew } = loadNotice();
    showWhatsNew("a");
    assert.deepStrictEqual(clock.timers.map((timer) => timer.delay), [8000]);
    assert.strictEqual(notices(doc).length, 1);
    clock.timers[0].callback();
    assert.strictEqual(notices(doc).length, 0);
});

test("the first timer does not remove the second notice", () => {
    const { doc, clock, showWhatsNew } = loadNotice();
    showWhatsNew("a");
    showWhatsNew("b");
    clock.timers[0].callback();
    assert.strictEqual(notices(doc).length, 1);
    assert.ok(textOf(notices(doc)[0]).includes("b"));
    clock.timers[1].callback();
    assert.strictEqual(notices(doc).length, 0);
});

test("showWhatsNew does nothing without a body", () => {
    const { doc, showWhatsNew } = loadNotice({ withBody: false });
    assert.doesNotThrow(() => showWhatsNew("a"));
    assert.strictEqual(doc.createdTags.length, 0);
});

test("showWhatsNew returns undefined", () => {
    const { showWhatsNew } = loadNotice();
    assert.strictEqual(showWhatsNew("a"), undefined);
});

test("showWhatsNew only styles through CSSOM properties", () => {
    const { doc, showWhatsNew } = loadNotice();
    // The fake throws on setAttribute("style"), style.cssText and innerHTML writes.
    assert.doesNotThrow(() => showWhatsNew("a"));
    assert.strictEqual(notices(doc).length, 1);
    assert.ok(!doc.createdTags.includes("style"));
});

test("showWhatsNew is self contained when rebuilt from its source", () => {
    const { showWhatsNew } = loadNotice();
    const doc = makeDocument();
    const clock = makeTimers();
    // Only the page globals exist here, none of the other helpers names.
    const context = vm.createContext({ document: doc, setTimeout: clock.setTimeout, source: showWhatsNew.toString() });
    const rebuilt = vm.runInContext("new Function(\"return \" + source)()", context);
    assert.strictEqual(vm.runInContext("typeof isDownloadMessage", context), "undefined");
    assert.strictEqual(rebuilt("a"), undefined);
    assert.strictEqual(notices(doc).length, 1);
    clock.timers[0].callback();
    assert.strictEqual(notices(doc).length, 0);
});
