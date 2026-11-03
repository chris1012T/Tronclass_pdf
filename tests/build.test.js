const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const buildScript = path.join(repoRoot, "scripts", "build.mjs");
const manifestsDir = path.join(repoRoot, "manifests");

const CHROME_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA44Losvkn4Co57nyW1pEHme3CaGfmtmNeqGFu7t4VZoIsCk7xAa4SR/x4ZAF0LdKF9f5XzveJ6zie6hWLO3KNXNUXnLEsqj5FTd95EQLjUnlcXkzEBrbfoAWepywnnKXbMdsmQ6HEap0GaemXi3FrgJjf11+V0y0OJp2PNlFwO74TFGo6vGnGRu/oluUtljA3zOh2aXfOG+HOoB6nX+OaxYvcBQbEEyCu36IniHNFYXtOZBM0hrPBk58491gTsAN/paGEbW+7BJTY921CL0ZaK57/0rM3wIMRZfjOQTp9hA4SExRlwKAJIGy35qYZC5JaP2c1+mGfN5kkFdDs0BeuTwIDAQAB";
const GECKO_ID = "{afc3b4df-eca4-4958-da29-ed83a9c8f74d}";

const ICONS = {
    "16": "/img/icon16.png",
    "24": "/img/icon24.png",
    "32": "/img/icon32.png",
    "48": "/img/icon48.png",
    "128": "/img/icon128.png"
};

const COMMON = {
    name: "Tronclass pdf",
    description: "本擴充套件可下載Tronclass(iClass)上大多數教材，包括影片、PDF及PPT(以PDF格式下載)。 #Tronclass pdf下載 #iClass pdf下載 #Tronclass教材下載",
    version: "3.0.0",
    manifest_version: 3,
    action: {
        default_icon: ICONS,
        default_title: "請先開啟教材頁面再點我"
    },
    icons: ICONS,
    permissions: ["scripting", "activeTab", "contextMenus", "downloads"]
};

const EXPECTED_CHROME = {
    ...COMMON,
    key: CHROME_KEY,
    background: { service_worker: "background.js" }
};

const EXPECTED_FIREFOX = {
    ...COMMON,
    browser_specific_settings: {
        gecko: {
            id: GECKO_ID,
            strict_min_version: "140.0",
            data_collection_permissions: { required: ["none"] }
        }
    },
    background: { scripts: ["lib/helpers.js", "background.js"] }
};

let lib;
test.before(async () => {
    lib = await import(buildScript);
});

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function makeTmp(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tronclass-build-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

function md5(file) {
    return crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
}

function writeManifests(dir, base) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "base.json"), JSON.stringify(base));
    fs.writeFileSync(path.join(dir, "chrome.json"), "{}");
    fs.writeFileSync(path.join(dir, "firefox.json"), "{}");
}

function writeSrc(dir, html) {
    fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
    fs.writeFileSync(path.join(dir, "pages", "x.html"), html);
}

test("mergeManifest produces the full Chrome manifest", () => {
    const base = readJson(path.join(manifestsDir, "base.json"));
    const chrome = readJson(path.join(manifestsDir, "chrome.json"));
    assert.deepStrictEqual(lib.mergeManifest(base, chrome), EXPECTED_CHROME);
});

test("mergeManifest produces the full Firefox manifest", () => {
    const base = readJson(path.join(manifestsDir, "base.json"));
    const firefox = readJson(path.join(manifestsDir, "firefox.json"));
    assert.deepStrictEqual(lib.mergeManifest(base, firefox), EXPECTED_FIREFOX);
});

test("mergeManifest deep merges objects and replaces arrays", () => {
    const merged = lib.mergeManifest(
        { a: { b: 1, c: 2 }, list: [1, 2, 3] },
        { a: { c: 3 }, list: [9] }
    );
    assert.deepStrictEqual(merged, { a: { b: 1, c: 3 }, list: [9] });
});

test("fillPlaceholders fills Chrome and Firefox values", () => {
    const html = "<a href=\"{{OTHER_STORE_URL}}\"><img src=\"{{OTHER_STORE_ICON}}\" alt=\"{{OTHER_STORE_ALT}}\"></a><a href=\"{{GITHUB_URL}}\"></a>";
    assert.strictEqual(
        lib.fillPlaceholders(html, lib.PLACEHOLDER_VALUES.chrome),
        "<a href=\"https://addons.mozilla.org/en-US/firefox/addon/tronclass-pdf/\"><img src=\"../img/firefox_addons_icon.png\" alt=\"firefox\"></a><a href=\"https://github.com/chris1012T/Tronclass_pdf\"></a>"
    );
    assert.strictEqual(
        lib.fillPlaceholders(html, lib.PLACEHOLDER_VALUES.firefox),
        "<a href=\"https://chromewebstore.google.com/detail/tronclass-pdf/hfnbdhdncoploidiifmbpenakollmggg\"><img src=\"../img/chrome_extension_icon.svg\" alt=\"chrome\"></a><a href=\"https://github.com/chris1012T/Tronclass_pdf\"></a>"
    );
});

test("findPlaceholders returns leftover placeholders", () => {
    assert.deepStrictEqual(lib.findPlaceholders("a {{FOO}} b"), ["{{FOO}}"]);
    assert.deepStrictEqual(lib.findPlaceholders("nothing here"), []);
});

test("findPlaceholders returns every fragment that starts with {{", () => {
    assert.deepStrictEqual(lib.findPlaceholders("<a href=\"{{OTHER_STORE_URL}\">"), ["{{OTHER_STORE_URL}"]);
    assert.deepStrictEqual(lib.findPlaceholders("x {{ FOO"), ["{{ FOO"]);
    assert.deepStrictEqual(lib.findPlaceholders("<p>{{FOO</p>"), ["{{FOO"]);
    assert.deepStrictEqual(lib.findPlaceholders("{{FOO\n}}"), ["{{FOO"]);
    assert.deepStrictEqual(lib.findPlaceholders("{{A}} {{B"), ["{{A}}", "{{B"]);
});

test("build throws when an html file keeps a placeholder", (t) => {
    const tmp = makeTmp(t);
    const srcDir = path.join(tmp, "src");
    writeSrc(srcDir, "<p>{{FOO}}</p>");
    assert.throws(
        () => lib.build("chrome", { srcDir, manifestsDir, outDir: path.join(tmp, "out") }),
        (error) => error instanceof Error && error.message.includes("x.html") && error.message.includes("{{FOO}}")
    );
});

for (const [html, fragment] of [["<a href=\"{{OTHER_STORE_URL}\">", "{{OTHER_STORE_URL}"], ["x {{ FOO", "{{ FOO"]]) {
    test(`build throws when an html file keeps the broken placeholder ${fragment}`, (t) => {
        const tmp = makeTmp(t);
        const srcDir = path.join(tmp, "src");
        writeSrc(srcDir, html);
        assert.throws(
            () => lib.build("chrome", { srcDir, manifestsDir, outDir: path.join(tmp, "out") }),
            (error) => error instanceof Error && error.message.includes("x.html") && error.message.includes(fragment)
        );
    });
}

test("build only scans html files for placeholders", (t) => {
    const tmp = makeTmp(t);
    const srcDir = path.join(tmp, "src");
    writeSrc(srcDir, "<p>{{GITHUB_URL}}</p>");
    fs.writeFileSync(path.join(srcDir, "data.bin"), "{{NOT_HTML}}");
    const target = lib.build("chrome", { srcDir, manifestsDir, outDir: path.join(tmp, "out") });
    assert.strictEqual(fs.readFileSync(path.join(target, "pages", "x.html"), "utf8"), "<p>https://github.com/chris1012T/Tronclass_pdf</p>");
});

test("build throws when the manifest version is missing or malformed", (t) => {
    const tmp = makeTmp(t);
    const srcDir = path.join(tmp, "src");
    writeSrc(srcDir, "<p></p>");
    const missingDir = path.join(tmp, "missing");
    writeManifests(missingDir, { name: "x" });
    assert.throws(() => lib.build("chrome", { srcDir, manifestsDir: missingDir, outDir: path.join(tmp, "out") }), Error);
    const shortDir = path.join(tmp, "short");
    writeManifests(shortDir, { name: "x", version: "3.0" });
    assert.throws(() => lib.build("chrome", { srcDir, manifestsDir: shortDir, outDir: path.join(tmp, "out") }), Error);
    const arrayDir = path.join(tmp, "array");
    writeManifests(arrayDir, { name: "x", version: ["3.0.0"] });
    assert.throws(() => lib.build("chrome", { srcDir, manifestsDir: arrayDir, outDir: path.join(tmp, "out") }), Error);
    const longDir = path.join(tmp, "long");
    writeManifests(longDir, { name: "x", version: "3.0.0.1" });
    assert.throws(() => lib.build("chrome", { srcDir, manifestsDir: longDir, outDir: path.join(tmp, "out") }), Error);
    const prefixedDir = path.join(tmp, "prefixed");
    writeManifests(prefixedDir, { name: "x", version: "v3.0.0" });
    assert.throws(() => lib.build("chrome", { srcDir, manifestsDir: prefixedDir, outDir: path.join(tmp, "out") }), Error);
    const okDir = path.join(tmp, "ok");
    writeManifests(okDir, { name: "x", version: "3.0.0" });
    assert.doesNotThrow(() => lib.build("chrome", { srcDir, manifestsDir: okDir, outDir: path.join(tmp, "out") }));
});

test("build rejects unknown browsers", (t) => {
    const tmp = makeTmp(t);
    assert.throws(() => lib.build("safari", { outDir: tmp }), Error);
    assert.deepStrictEqual(fs.readdirSync(tmp), []);
    const fakeManifests = path.join(tmp, "manifests");
    writeManifests(fakeManifests, { name: "x", version: "3.0.0" });
    fs.writeFileSync(path.join(fakeManifests, "safari.json"), "{}");
    const outDir = path.join(tmp, "out");
    assert.throws(() => lib.build("safari", { manifestsDir: fakeManifests, outDir }), /Unknown browser/);
    assert.strictEqual(fs.existsSync(outDir), false);
});

test("CLI exits 1 for an unknown browser", () => {
    const result = spawnSync(process.execPath, [buildScript, "safari"], { cwd: repoRoot, encoding: "utf8" });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /safari/);
});

test("build of one browser only writes that browser", (t) => {
    const tmp = makeTmp(t);
    lib.build("chrome", { outDir: tmp });
    assert.deepStrictEqual(fs.readdirSync(tmp), ["chrome"]);
});

test("build removes stale files from the previous output", (t) => {
    const tmp = makeTmp(t);
    fs.mkdirSync(path.join(tmp, "chrome"));
    fs.writeFileSync(path.join(tmp, "chrome", "stale.txt"), "old");
    lib.build("chrome", { outDir: tmp });
    assert.strictEqual(fs.existsSync(path.join(tmp, "chrome", "stale.txt")), false);
    assert.strictEqual(fs.existsSync(path.join(tmp, "chrome", "manifest.json")), true);
});

for (const browser of ["chrome", "firefox"]) {
    test(`build output for ${browser} has the expected files and screenshots`, (t) => {
        const tmp = makeTmp(t);
        const target = lib.build(browser, { outDir: tmp });
        for (const file of ["manifest.json", "background.js", "content/run.js", "pages/readme.html", "pages/changelog.html", "pages/style.css", "img/icon128.png"]) {
            assert.ok(fs.existsSync(path.join(target, file)), `${file} missing`);
        }
        assert.strictEqual(fs.existsSync(path.join(target, "img-chrome")), false);
        assert.strictEqual(fs.existsSync(path.join(target, "img-firefox")), false);
        for (const image of ["pinned.png", "unpinned.png"]) {
            assert.strictEqual(md5(path.join(target, "img", image)), md5(path.join(repoRoot, "src", `img-${browser}`, image)));
        }
        const manifest = readJson(path.join(target, "manifest.json"));
        assert.deepStrictEqual(manifest, browser === "chrome" ? EXPECTED_CHROME : EXPECTED_FIREFOX);
        assert.strictEqual(fs.readFileSync(path.join(target, "manifest.json"), "utf8"), JSON.stringify(manifest, null, 4) + "\n");
    });
}
