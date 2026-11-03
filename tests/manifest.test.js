const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const buildScript = path.resolve(__dirname, "..", "scripts", "build.mjs");

function referencedPaths(manifest) {
    const paths = [];
    if (manifest.background.service_worker) {
        paths.push(manifest.background.service_worker);
    }
    paths.push(...(manifest.background.scripts || []));
    paths.push(...Object.values(manifest.icons));
    paths.push(...Object.values(manifest.action.default_icon));
    return paths.map((file) => file.replace(/^\//, ""));
}

for (const browser of ["chrome", "firefox"]) {
    test(`every path in the ${browser} manifest exists in the build`, async (t) => {
        const { build } = await import(buildScript);
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tronclass-manifest-"));
        t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
        const target = build(browser, { outDir: tmp });
        const manifest = JSON.parse(fs.readFileSync(path.join(target, "manifest.json"), "utf8"));
        const paths = referencedPaths(manifest);
        assert.ok(paths.length >= 11);
        for (const file of paths) {
            assert.ok(fs.existsSync(path.join(target, file)) && fs.statSync(path.join(target, file)).isFile(), `${file} missing in ${browser}`);
        }
    });
}
