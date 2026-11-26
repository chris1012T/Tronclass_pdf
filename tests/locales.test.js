const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const localesDir = path.join(repoRoot, "src", "_locales");
const manifestsDir = path.join(repoRoot, "manifests");

const LOCALES = ["en", "zh_TW"];

const KEYS = [
    "extDescription", "actionTitle", "menuReadme", "menuChangelog", "menuDownload", "menuGitHub",
    "whatsNewMessage", "whatsNewTitle", "closeLabel", "errorNotMaterial", "errorStreamingVideo",
    "errorStreamingAudio", "errorNotFound", "fallbackFilename", "readmePage", "changelogPage"
];

// The description and toolbar title from manifests/base.json on master before translation.
const ORIGINAL_DESCRIPTION = "本擴充套件可下載Tronclass(iClass)上大多數教材，包括影片、音訊、PDF及PPT(以PDF格式下載)。";
const ORIGINAL_TITLE = "請先開啟教材頁面再點我";

// Chrome Web Store rejects a description longer than this.
const DESCRIPTION_LIMIT = 132;

function readMessages(locale) {
    return JSON.parse(fs.readFileSync(path.join(localesDir, locale, "messages.json"), "utf8"));
}

test("the locales directory holds exactly en and zh_TW", () => {
    assert.deepStrictEqual(fs.readdirSync(localesDir).sort(), LOCALES);
});

for (const locale of LOCALES) {
    test(`${locale} messages.json has exactly the agreed keys with non-empty messages`, () => {
        const messages = readMessages(locale);
        assert.deepStrictEqual(Object.keys(messages).sort(), [...KEYS].sort());
        for (const [key, entry] of Object.entries(messages)) {
            assert.strictEqual(typeof entry.message, "string", `${locale} ${key}`);
            assert.ok(entry.message.trim() !== "", `${locale} ${key} is empty`);
        }
    });

    test(`${locale} extDescription fits the store limit`, () => {
        const length = [...readMessages(locale).extDescription.message].length;
        assert.ok(length <= DESCRIPTION_LIMIT, `${locale} description is ${length} characters`);
    });
}

test("both locales have the same keys", () => {
    assert.deepStrictEqual(Object.keys(readMessages("en")).sort(), Object.keys(readMessages("zh_TW")).sort());
});

test("every __MSG_x__ in the manifests exists in both locales", () => {
    const used = [];
    for (const file of fs.readdirSync(manifestsDir).filter((name) => name.endsWith(".json"))) {
        const text = fs.readFileSync(path.join(manifestsDir, file), "utf8");
        used.push(...[...text.matchAll(/__MSG_(\w+?)__/g)].map((match) => match[1]));
    }
    assert.ok(used.length >= 2, `only ${used.length} message references found`);
    for (const locale of LOCALES) {
        const messages = readMessages(locale);
        for (const key of used) {
            assert.ok(key in messages, `${locale} lacks ${key}`);
        }
    }
});

test("zh_TW keeps the original Chinese text", () => {
    const messages = readMessages("zh_TW");
    assert.strictEqual(messages.extDescription.message, ORIGINAL_DESCRIPTION);
    assert.strictEqual(messages.actionTitle.message, ORIGINAL_TITLE);
    const expected = {
        menuReadme: "使用說明",
        menuChangelog: "更新紀錄",
        menuDownload: "下載此教材 (Tronclass)",
        menuGitHub: "GitHub Page",
        whatsNewMessage: "Tronclass PDF 更新：現在也能下載音訊教材了。",
        whatsNewTitle: "Tronclass PDF：新增音訊下載，按一下圖示即可下載教材",
        closeLabel: "關閉",
        errorNotMaterial: "請先開啟教材!",
        errorStreamingVideo: "這部影片是串流格式，無法直接下載。",
        errorStreamingAudio: "這個音訊是串流格式，無法直接下載。",
        errorNotFound: "這個頁面找不到可下載的教材。",
        fallbackFilename: "Tronclass教材",
        readmePage: "pages/readme.html",
        changelogPage: "pages/changelog.html"
    };
    for (const [key, message] of Object.entries(expected)) {
        assert.strictEqual(messages[key].message, message, key);
    }
});

test("en messages contain no Han characters", () => {
    for (const [key, entry] of Object.entries(readMessages("en"))) {
        assert.ok(!/\p{Script=Han}/u.test(entry.message), `en ${key}: ${entry.message}`);
    }
});

test("en has the agreed fixed values", () => {
    const messages = readMessages("en");
    assert.strictEqual(messages.menuGitHub.message, "GitHub Page");
    assert.strictEqual(messages.fallbackFilename.message, "Tronclass material");
    assert.strictEqual(messages.readmePage.message, "pages/readme.en.html");
    assert.strictEqual(messages.changelogPage.message, "pages/changelog.en.html");
});

test("the base manifest localizes the description and title but not the name", () => {
    const base = JSON.parse(fs.readFileSync(path.join(manifestsDir, "base.json"), "utf8"));
    assert.strictEqual(base.default_locale, "en");
    assert.strictEqual(base.description, "__MSG_extDescription__");
    assert.strictEqual(base.action.default_title, "__MSG_actionTitle__");
    assert.strictEqual(base.name, "Tronclass pdf");
});
