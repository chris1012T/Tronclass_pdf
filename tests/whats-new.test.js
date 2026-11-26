const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const helpersCode = fs.readFileSync(path.resolve(__dirname, "..", "src", "lib", "helpers.js"), "utf8");
const NOTICE_ID = "tronclass-pdf-whats-new";
const CLOSE = "Close";

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
    if (doc.animate) {
        element.animate = (keyframes, options) => {
            if (doc.animate === "throw") {
                throw new Error("animate failed");
            }
            // "throwOnExit" lets the entrance work and makes every later call throw.
            if (doc.animate === "throwOnExit" && doc.animations.length >= 1) {
                throw new Error("exit animate failed");
            }
            const animation = {
                target: element,
                // Cloned into this realm so deepStrictEqual compares plain objects.
                keyframes: JSON.parse(JSON.stringify(keyframes)),
                options: JSON.parse(JSON.stringify(options)),
                playState: "running",
                cancelled: false,
                cancel() {
                    this.cancelled = true;
                    this.playState = "idle";
                }
            };
            animation.finished = new Promise((resolve, reject) => {
                animation.finish = () => {
                    animation.playState = "finished";
                    resolve();
                };
                animation.fail = () => reject(new Error("animation cancelled"));
            });
            doc.animations.push(animation);
            return animation;
        };
    }
    doc.created.push(element);
    return element;
}

function makeDocument({ withBody = true, animate = false } = {}) {
    const doc = { created: [], createdTags: [], animations: [], animate };
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

// options.animate gives elements a fake animate(); options.reduce, options.linear and options.computed set the page globals.
function pageGlobals(options = {}) {
    const globals = {};
    if (options.reduce !== undefined) {
        globals.matchMedia = (query) => ({ matches: options.reduce && query.includes("prefers-reduced-motion") });
    }
    if (options.linear !== undefined) {
        globals.CSS = { supports: () => options.linear };
    }
    globals.getComputedStyle = () => options.computed || { transform: "none", opacity: "1" };
    return globals;
}

function loadNotice(options) {
    const doc = makeDocument(options);
    const clock = makeTimers();
    const context = vm.createContext({ document: doc, setTimeout: clock.setTimeout, ...pageGlobals(options) });
    vm.runInContext(helpersCode, context);
    return { doc, clock, showWhatsNew: context.showWhatsNew, context };
}

function notices(doc) {
    return doc.all().filter((node) => node.id === NOTICE_ID);
}

function textOf(node) {
    return node.textContent + node.children.map(textOf).join("");
}

// The notice is a frame holding one card; the text and the close button live in the card.
function cardOf(notice) {
    return notice.children[0];
}

function closeButton(notice) {
    return cardOf(notice).children.find((node) => node.tagName === "BUTTON");
}

async function settle() {
    for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

test("showWhatsNew adds one notice with the message as plain text", () => {
    const { doc, showWhatsNew } = loadNotice();
    showWhatsNew("更新 <b>x</b>", CLOSE);
    const found = notices(doc);
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].parent, doc.body);
    assert.ok(textOf(found[0]).includes("更新 <b>x</b>"));
    assert.ok(!doc.createdTags.includes("b"));
    assert.strictEqual(found[0].style.position, "fixed");
    assert.strictEqual(found[0].style.zIndex, "2147483647");
    assert.strictEqual(cardOf(found[0]).style.borderLeft, "4px solid #1aa99b");
});

test("the notice sits at the top center, sized to its content and never wider than the viewport allows", () => {
    const { doc, showWhatsNew } = loadNotice();
    showWhatsNew("a", CLOSE);
    const style = notices(doc)[0].style;
    assert.strictEqual(style.top, "16px");
    assert.strictEqual(style.left, "50%");
    assert.strictEqual(style.transform, "translateX(-50%)");
    assert.strictEqual(style.width, "max-content");
    assert.strictEqual(style.maxWidth, "min(392px, calc(100vw - 32px))");
    assert.strictEqual(cardOf(notices(doc)[0]).style.width, "max-content");
    assert.strictEqual(cardOf(notices(doc)[0]).style.maxWidth, "min(360px, calc(100vw - 64px))");
    assert.ok(!("right" in style), "right must not be set");
    assert.ok(!("bottom" in style), "bottom must not be set");
});

test("showWhatsNew keeps a single notice when called twice", () => {
    const { doc, showWhatsNew } = loadNotice();
    showWhatsNew("a", CLOSE);
    showWhatsNew("b", CLOSE);
    const found = notices(doc);
    assert.strictEqual(found.length, 1);
    assert.ok(textOf(found[0]).includes("b"));
});

test("the close button is labelled with the given label and removes the notice", () => {
    for (const label of ["關閉", "Close"]) {
        const { doc, showWhatsNew } = loadNotice();
        showWhatsNew("a", label);
        const button = closeButton(notices(doc)[0]);
        assert.strictEqual(button.getAttribute("aria-label"), label);
        button.click();
        assert.strictEqual(notices(doc).length, 0);
    }
});

test("the notice removes itself after 8000 ms", () => {
    const { doc, clock, showWhatsNew } = loadNotice();
    showWhatsNew("a", CLOSE);
    assert.deepStrictEqual(clock.timers.map((timer) => timer.delay), [8000]);
    assert.strictEqual(notices(doc).length, 1);
    clock.timers[0].callback();
    assert.strictEqual(notices(doc).length, 0);
});

test("the first timer does not remove the second notice", () => {
    const { doc, clock, showWhatsNew } = loadNotice();
    showWhatsNew("a", CLOSE);
    showWhatsNew("b", CLOSE);
    clock.timers[0].callback();
    assert.strictEqual(notices(doc).length, 1);
    assert.ok(textOf(notices(doc)[0]).includes("b"));
    clock.timers[1].callback();
    assert.strictEqual(notices(doc).length, 0);
});

test("showWhatsNew does nothing without a body", () => {
    const { doc, showWhatsNew } = loadNotice({ withBody: false });
    assert.doesNotThrow(() => showWhatsNew("a", CLOSE));
    assert.strictEqual(doc.createdTags.length, 0);
});

test("showWhatsNew returns undefined", () => {
    const { showWhatsNew } = loadNotice();
    assert.strictEqual(showWhatsNew("a", CLOSE), undefined);
});

test("showWhatsNew only styles through CSSOM properties", () => {
    const { doc, showWhatsNew } = loadNotice();
    // The fake throws on setAttribute("style"), style.cssText and innerHTML writes.
    assert.doesNotThrow(() => showWhatsNew("a", CLOSE));
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
    assert.strictEqual(rebuilt("a", CLOSE), undefined);
    assert.strictEqual(notices(doc).length, 1);
    assert.strictEqual(closeButton(notices(doc)[0]).getAttribute("aria-label"), CLOSE);
    clock.timers[0].callback();
    assert.strictEqual(notices(doc).length, 0);
});

// ---- slide-in and slide-out animation, through a fake element.animate ----

const HIDDEN = "translateY(calc(-100% - 28px))";
const EXIT_EASING = "cubic-bezier(0.32, 0, 0.67, 0)";

function animatedNotice(options = {}) {
    const env = loadNotice({ animate: true, ...options });
    env.showWhatsNew("a", CLOSE);
    const box = notices(env.doc)[0];
    return { ...env, box, card: cardOf(box), animations: env.doc.animations };
}

test("the entrance slides the card in with a spring, in the same task as the append", () => {
    const { card, animations, box } = animatedNotice({ linear: true });
    assert.strictEqual(animations.length, 1);
    assert.strictEqual(animations[0].target, card);
    assert.deepStrictEqual(animations[0].keyframes, [{ transform: HIDDEN }, { transform: "translateY(0)" }]);
    assert.strictEqual(animations[0].options.duration, 550);
    assert.ok(animations[0].options.easing.startsWith("linear("), animations[0].options.easing);
    assert.strictEqual(box.parent !== null, true);
});

test("without linear() support the entrance falls back to a cubic-bezier, also when CSS is missing", () => {
    for (const linear of [false, undefined]) {
        const { animations } = animatedNotice({ linear });
        assert.strictEqual(animations[0].options.easing, "cubic-bezier(0.32, 0.72, 0, 1)");
    }
});

test("the frame clips above its top edge and the card has no clip", () => {
    const { box, card } = animatedNotice();
    assert.strictEqual(box.style.clipPath, "inset(0 -40px -40px -40px)");
    assert.strictEqual(box.style.width, "max-content");
    assert.strictEqual(card.style.clipPath, undefined);
});

test("closing slides the card out and removes the frame only after finished resolves", async () => {
    const { doc, box, card, animations } = animatedNotice();
    animations[0].finish();
    closeButton(box).click();
    assert.strictEqual(animations.length, 2);
    assert.strictEqual(animations[1].target, card);
    assert.deepStrictEqual(animations[1].keyframes, [{ transform: "translateY(0)" }, { transform: HIDDEN }]);
    assert.strictEqual(animations[1].options.duration, 300);
    assert.strictEqual(animations[1].options.easing, EXIT_EASING);
    assert.strictEqual(animations[1].options.fill, "forwards");
    await settle();
    assert.strictEqual(notices(doc).length, 1, "the frame stays until the exit finishes");
    animations[1].finish();
    await settle();
    assert.strictEqual(notices(doc).length, 0);
});

test("a rejected finished also removes the frame", async () => {
    const { doc, box, animations } = animatedNotice();
    closeButton(box).click();
    animations[1].fail();
    await settle();
    assert.strictEqual(notices(doc).length, 0);
});

test("closing twice, or closing and then the 8 s timer, plays the exit once", () => {
    const first = animatedNotice();
    closeButton(first.box).click();
    closeButton(first.box).click();
    assert.strictEqual(first.animations.length, 2);
    const second = animatedNotice();
    closeButton(second.box).click();
    second.clock.timers[0].callback();
    assert.strictEqual(second.animations.length, 2);
});

test("the 8 s timer starts the exit instead of removing the frame", async () => {
    const { doc, clock, animations } = animatedNotice();
    clock.timers[0].callback();
    assert.strictEqual(animations.length, 2);
    assert.strictEqual(animations[1].options.easing, EXIT_EASING);
    assert.strictEqual(notices(doc).length, 1);
    animations[1].finish();
    await settle();
    assert.strictEqual(notices(doc).length, 0);
});

test("reduced motion fades in and out over 150 ms with no transform", () => {
    const { box, animations } = animatedNotice({ reduce: true, linear: true });
    assert.deepStrictEqual(animations[0].keyframes, [{ opacity: 0 }, { opacity: 1 }]);
    assert.strictEqual(animations[0].options.duration, 150);
    animations[0].finish();
    closeButton(box).click();
    assert.deepStrictEqual(animations[1].keyframes, [{ opacity: "1" }, { opacity: 0 }]);
    assert.strictEqual(animations[1].options.duration, 150);
    assert.strictEqual(animations[1].options.fill, "forwards");
    for (const animation of animations) {
        assert.ok(animation.keyframes.every((frame) => !("transform" in frame)));
    }
});

test("closing while the entrance runs starts from the card's current transform and cancels the entrance", () => {
    const computed = "matrix(1, 0, 0, 1, 0, -30)";
    const { box, animations } = animatedNotice({ computed: { transform: computed, opacity: "0.4" } });
    closeButton(box).click();
    assert.strictEqual(animations.length, 2);
    assert.strictEqual(animations[0].cancelled, true);
    assert.deepStrictEqual(animations[1].keyframes, [{ transform: computed }, { transform: HIDDEN }]);
});

test("reduced motion closing mid-entrance starts from the current opacity", () => {
    const { box, animations } = animatedNotice({ reduce: true, computed: { transform: "none", opacity: "0.4" } });
    closeButton(box).click();
    assert.strictEqual(animations[0].cancelled, true);
    assert.deepStrictEqual(animations[1].keyframes, [{ opacity: "0.4" }, { opacity: 0 }]);
});

test("a finished entrance is not cancelled when closing", () => {
    const { box, animations } = animatedNotice({ computed: { transform: "matrix(1, 0, 0, 1, 0, -30)", opacity: "1" } });
    animations[0].finish();
    closeButton(box).click();
    assert.strictEqual(animations[0].cancelled, false);
    assert.strictEqual(animations[1].keyframes[0].transform, "translateY(0)");
});

test("an old exit finishing after a new notice appeared does not remove the new one", async () => {
    const { doc, box, animations, showWhatsNew } = animatedNotice();
    closeButton(box).click();
    showWhatsNew("b", CLOSE);
    assert.strictEqual(notices(doc).length, 1);
    animations[1].finish();
    await settle();
    assert.strictEqual(notices(doc).length, 1);
    assert.ok(textOf(notices(doc)[0]).includes("b"));
});

test("an animate that throws leaves the notice visible and closing removes it directly", () => {
    const { doc, box, clock } = animatedNotice({ animate: "throw" });
    assert.strictEqual(notices(doc).length, 1);
    closeButton(box).click();
    assert.strictEqual(notices(doc).length, 0);
    const second = animatedNotice({ animate: "throw" });
    second.clock.timers[0].callback();
    assert.strictEqual(notices(second.doc).length, 0);
    assert.strictEqual(clock.timers.length, 1);
});

test("without animate the notice shows at once and closing or the timer remove it at once", () => {
    const first = loadNotice();
    first.showWhatsNew("a", CLOSE);
    closeButton(notices(first.doc)[0]).click();
    assert.strictEqual(notices(first.doc).length, 0);
    const second = loadNotice();
    second.showWhatsNew("a", CLOSE);
    second.clock.timers[0].callback();
    assert.strictEqual(notices(second.doc).length, 0);
});

test("closing or timing out after the page removed the notice does not throw", async () => {
    for (const animate of [true, false]) {
        const env = loadNotice({ animate });
        env.showWhatsNew("a", CLOSE);
        const box = notices(env.doc)[0];
        const button = closeButton(box);
        box.remove();
        assert.doesNotThrow(() => button.click());
        assert.doesNotThrow(() => env.clock.timers[0].callback());
        env.doc.animations.forEach((animation) => animation.finish());
        await settle();
    }
});

test("showWhatsNew rebuilt from its source runs the entrance and exit with its own constants", async () => {
    const { showWhatsNew } = loadNotice();
    const doc = makeDocument({ animate: true });
    const clock = makeTimers();
    const context = vm.createContext({
        document: doc,
        setTimeout: clock.setTimeout,
        CSS: { supports: () => true },
        matchMedia: () => ({ matches: false }),
        getComputedStyle: () => ({ transform: "none", opacity: "1" }),
        source: showWhatsNew.toString()
    });
    const rebuilt = vm.runInContext("new Function(\"return \" + source)()", context);
    rebuilt("a", CLOSE);
    assert.strictEqual(doc.animations.length, 1);
    assert.ok(doc.animations[0].options.easing.startsWith("linear("));
    assert.deepStrictEqual(doc.animations[0].keyframes, [{ transform: HIDDEN }, { transform: "translateY(0)" }]);
    closeButton(notices(doc)[0]).click();
    assert.strictEqual(doc.animations.length, 2);
    doc.animations[1].finish();
    await settle();
    assert.strictEqual(notices(doc).length, 0);
});

test("an exit animate that throws removes the frame at once, and the 8 s timer afterwards does not throw", () => {
    const { doc, box, clock, animations } = animatedNotice({ animate: "throwOnExit" });
    assert.strictEqual(animations.length, 1);
    assert.doesNotThrow(() => closeButton(box).click());
    assert.strictEqual(notices(doc).length, 0);
    assert.doesNotThrow(() => clock.timers[0].callback());
    assert.strictEqual(animations.length, 1);
});
