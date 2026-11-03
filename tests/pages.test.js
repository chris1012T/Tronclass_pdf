const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const buildScript = path.resolve(__dirname, "..", "scripts", "build.mjs");
const pagesSrc = path.resolve(__dirname, "..", "src", "pages");

async function buildInto(t, browser) {
    const { build } = await import(buildScript);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tronclass-pages-"));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    return build(browser, { outDir: tmp });
}

function readPage(target, name) {
    return fs.readFileSync(path.join(target, "pages", name), "utf8");
}

const STORE_CHECKS = {
    chrome: { has: ["addons.mozilla.org", "firefox_addons_icon.png", "Firefox 版"], lacks: ["chromewebstore", "Chrome 版"] },
    firefox: { has: ["chromewebstore.google.com", "chrome_extension_icon.svg", "Chrome 版"], lacks: ["addons.mozilla.org", "Firefox 版"] }
};

const TERMS = [
    "請尊重智慧財產權。",
    "本擴充功能僅供學生下載教材，於考試前複習使用，避免考前學校系統過載而無法閱讀教材。",
    "未經教材作者同意而散布教材內容，所造成的直接或間接損失或損害，本擴充功能及其作者不負任何法律或其他責任，由侵權人自行承擔。",
    "安裝本擴充功能即表示同意以上條款。"
];

const RELEASE_ORDER = [
    "2026-11-04", "v3.1.0",
    "2026-11-03", "v3.0.0",
    "2024-10-14", "v1.1.0",
    "2024-06-05", "v2.3.1",
    "2023-02-09", "v2.0.0"
];

function assertInOrder(html, texts) {
    let last = -1;
    for (const text of texts) {
        const index = html.indexOf(text, last + 1);
        assert.ok(index > last, `${text} missing or out of order`);
        last = index;
    }
}

for (const browser of ["chrome", "firefox"]) {
    for (const page of ["readme.html", "changelog.html"]) {
        test(`${browser} ${page} links to the other store and the merged repository`, async (t) => {
            const html = readPage(await buildInto(t, browser), page);
            for (const text of [...STORE_CHECKS[browser].has, "https://github.com/chris1012T/Tronclass_pdf\""]) {
                assert.ok(html.includes(text), `missing ${text}`);
            }
            const badgesStart = html.indexOf("<div class=\"badges\">");
            const badges = html.slice(badgesStart, html.indexOf("</div>", badgesStart));
            for (const text of [...STORE_CHECKS[browser].lacks, "Tronclass_pdf_Firefox", "Tronclass_pdf_firefox", "{{"]) {
                // The v3.0.0 entry says "Chrome 與 Firefox 版本合併", so store names are only checked in the badge links there.
                const scope = page === "changelog.html" && text.endsWith(" 版") ? badges : html;
                assert.ok(!scope.includes(text), `unexpected ${text}`);
            }
            assert.ok(badges.includes(STORE_CHECKS[browser].has[2]), "badge link text");
        });
    }

    test(`${browser} readme.html explains how to pin in that browser`, async (t) => {
        const html = readPage(await buildInto(t, browser), "readme.html");
        const pinWords = { chrome: "旁按<span class=\"mark\">圖釘</span>", firefox: "旁按<span class=\"mark\">齒輪</span>，選<span class=\"mark\">「釘選至工具列」</span>" };
        const other = browser === "chrome" ? "firefox" : "chrome";
        assert.ok(html.includes(pinWords[browser]), "pin steps for this browser");
        assert.ok(!html.includes(pinWords[other]), "pin steps for the other browser");
    });

    test(`${browser} pages only reference files that exist`, async (t) => {
        const target = await buildInto(t, browser);
        const pagesDir = path.join(target, "pages");
        const pages = fs.readdirSync(pagesDir).filter((name) => name.endsWith(".html"));
        assert.deepStrictEqual(pages.sort(), ["changelog.html", "readme.html"]);
        let checked = 0;
        for (const page of pages) {
            const html = readPage(target, page);
            for (const match of html.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
                const reference = match[1];
                if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("//") || reference.startsWith("#")) {
                    continue;
                }
                const resolved = path.resolve(pagesDir, reference.split(/[?#]/)[0]);
                assert.ok(resolved.startsWith(target + path.sep), `${page}: ${reference} points outside the build`);
                assert.ok(fs.existsSync(resolved) && fs.statSync(resolved).isFile(), `${page}: ${reference} does not exist`);
                checked++;
            }
        }
        assert.ok(checked >= 10, `only ${checked} references checked`);
    });

    test(`${browser} changelog lists every release in order`, async (t) => {
        const html = readPage(await buildInto(t, browser), "changelog.html");
        assertInOrder(html, RELEASE_ORDER);
        assert.ok(html.includes("下載音訊教材"), "missing 下載音訊教材");
    });
}

test("the readme shows the terms of use before the first step, word for word", () => {
    const html = fs.readFileSync(path.join(pagesSrc, "readme.html"), "utf8");
    assert.ok(html.indexOf("使用條款") !== -1);
    assert.ok(html.indexOf("使用條款") < html.indexOf("釘選擴充功能"));
    const items = [...html.slice(html.indexOf("使用條款")).matchAll(/<li>([^<]*)<\/li>/g)].map((match) => match[1]);
    assert.deepStrictEqual(items.slice(0, 4), TERMS);
});

test("the changelog lists the new icon under v3.1.0", () => {
    const html = fs.readFileSync(path.join(pagesSrc, "changelog.html"), "utf8");
    const start = html.indexOf("v3.1.0");
    const end = html.indexOf("v3.0.0");
    const entry = "<li><span class=\"kind add\">新增</span>新的擴充功能圖示。</li>";
    assert.ok(start !== -1 && end > start, "missing v3.1.0 or v3.0.0");
    const at = html.indexOf(entry, start);
    assert.ok(at > start && at < end, "new icon entry is not between v3.1.0 and v3.0.0");
    const list = html.slice(html.indexOf("<ul>", start), html.indexOf("</ul>", start));
    assert.ok(list.includes(entry), "new icon entry is not in the v3.1.0 list");
});

test("pages declare the title, language, icon and stylesheet", () => {
    const titles = { "readme.html": "Tronclass PDF 使用說明", "changelog.html": "Tronclass PDF 更新紀錄" };
    for (const [page, title] of Object.entries(titles)) {
        const html = fs.readFileSync(path.join(pagesSrc, page), "utf8");
        assert.ok(html.includes(`<title>${title}</title>`), `${page} title`);
        assert.ok(html.includes("<html lang=\"zh-Hant\">"), `${page} lang`);
        assert.ok(html.includes("<link rel=\"icon\" href=\"../img/icon128.png\">"), `${page} icon`);
        assert.ok(html.includes("<link rel=\"stylesheet\" href=\"style.css\">"), `${page} stylesheet`);
    }
});

test("pages have no inline styles or scripts", () => {
    for (const page of ["readme.html", "changelog.html"]) {
        const html = fs.readFileSync(path.join(pagesSrc, page), "utf8");
        for (const text of ["style=\"", "<script", "<style"]) {
            assert.ok(!html.includes(text), `${page} contains ${text}`);
        }
    }
});

const css = fs.readFileSync(path.join(pagesSrc, "style.css"), "utf8");

function declarationsOf(selector) {
    const selectorsOf = (match) => match[1].split(",").map((part) => part.trim());
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => selectorsOf(match).includes(selector));
    assert.ok(blocks.length > 0, `no rule for ${selector}`);
    return blocks.map((match) => match[2]).join(";");
}

function rotations(declarations) {
    return [...declarations.matchAll(/rotate\(\s*(-?[\d.]+)deg\s*\)/g)].map((match) => Number(match[1]));
}

test("style.css only carries the notebook and changelog rules", () => {
    const forbidden = [
        ".picker", ".tab", ".icon-pick", "icons-ink", "--d-ink-bright", "--d-ink-invert", "--shell-", "body::before",
        ".v1", ".v2", ".v3", ".v5", "--a-", "--b-", "--c-", "--e-", "data-theme"
    ];
    for (const text of forbidden) {
        assert.ok(!css.includes(text), `unexpected ${text}`);
    }
    for (const text of ["--d-ink:", "prefers-color-scheme: dark", ".v4.icons-sticker .badges img", ".v6 .entry", "min-height: 100vh"]) {
        assert.ok(css.includes(text), `missing ${text}`);
    }
});

test("screenshots and sticker icons tilt by at most 0.6 degrees", () => {
    for (const selector of [".v4 .pol.l", ".v4 .pol.r", ".v4 .badges a:nth-child(1) img", ".v4 .badges a:nth-child(2) img"]) {
        const angles = rotations(declarationsOf(selector));
        assert.ok(angles.length > 0, `${selector} has no rotate`);
        for (const angle of angles) {
            assert.ok(Math.abs(angle) <= 0.6, `${selector} rotates ${angle}deg`);
        }
    }
    assert.deepStrictEqual(rotations(declarationsOf(".v4 .pol::before")), [-2]);
});
