const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const buildScript = path.resolve(__dirname, "..", "scripts", "build.mjs");

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
    chrome: { has: ["addons.mozilla.org", "firefox_addons_icon.png"], lacks: ["chromewebstore"] },
    firefox: { has: ["chromewebstore.google.com", "chrome_extension_icon.svg"], lacks: ["addons.mozilla.org"] }
};

for (const browser of ["chrome", "firefox"]) {
    test(`${browser} readme links to the other store and the merged repository`, async (t) => {
        const html = readPage(await buildInto(t, browser), "readme.html");
        for (const text of [...STORE_CHECKS[browser].has, "https://github.com/chris1012T/Tronclass_pdf\""]) {
            assert.ok(html.includes(text), `missing ${text}`);
        }
        for (const text of [...STORE_CHECKS[browser].lacks, "Tronclass_pdf_Firefox", "Tronclass_pdf_firefox", "{{"]) {
            assert.ok(!html.includes(text), `unexpected ${text}`);
        }
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

    test(`${browser} changelog lists every release`, async (t) => {
        const html = readPage(await buildInto(t, browser), "changelog.html");
        for (const text of ["v3.0.0", "2026-11-03", "v1.1.0 (Firefox)", "v2.3.1 (Chrome)", "v2.0.0"]) {
            assert.ok(html.includes(text), `missing ${text}`);
        }
    });
}
