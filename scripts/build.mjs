import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GITHUB_URL = "https://github.com/chris1012T/Tronclass_pdf";

export const PLACEHOLDER_VALUES = {
    chrome: {
        OTHER_STORE_URL: "https://addons.mozilla.org/en-US/firefox/addon/tronclass-pdf/",
        OTHER_STORE_ICON: "../img/firefox_addons_icon.png",
        OTHER_STORE_ALT: "firefox",
        GITHUB_URL
    },
    firefox: {
        OTHER_STORE_URL: "https://chromewebstore.google.com/detail/tronclass-pdf/hfnbdhdncoploidiifmbpenakollmggg",
        OTHER_STORE_ICON: "../img/chrome_extension_icon.svg",
        OTHER_STORE_ALT: "chrome",
        GITHUB_URL
    }
};

export const BROWSERS = Object.keys(PLACEHOLDER_VALUES);

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mergeManifest(base, override) {
    const result = { ...base };
    for (const [key, value] of Object.entries(override)) {
        if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = mergeManifest(result[key], value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

export function fillPlaceholders(text, values) {
    let result = text;
    for (const [name, value] of Object.entries(values)) {
        result = result.split(`{{${name}}}`).join(value);
    }
    return result;
}

// Each fragment starts at a "{{" that is not already inside an earlier fragment and runs up to and including the first "}}", unless a quote, "<", newline or the end of the text comes first, in which case the fragment stops before it.
export function findPlaceholders(text) {
    return text.match(/\{\{(?:(?!\}\})[^"<\n])*(?:\}\})?/g) || [];
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function listFiles(dir) {
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name));
}

export function build(browser, options = {}) {
    if (!BROWSERS.includes(browser)) {
        throw new Error(`Unknown browser "${browser}". Expected one of: ${BROWSERS.join(", ")}`);
    }
    const srcDir = options.srcDir || path.join(repoRoot, "src");
    const manifestsDir = options.manifestsDir || path.join(repoRoot, "manifests");
    const outDir = options.outDir || path.join(repoRoot, "dist");

    const manifest = mergeManifest(
        readJson(path.join(manifestsDir, "base.json")),
        readJson(path.join(manifestsDir, `${browser}.json`))
    );
    if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        throw new Error(`Manifest version must match x.y.z, got ${JSON.stringify(manifest.version)}`);
    }

    const target = path.join(outDir, browser);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(srcDir, target, {
        recursive: true,
        filter: (source) => !BROWSERS.some((name) => path.relative(srcDir, source).split(path.sep)[0] === `img-${name}`)
    });
    const browserImages = path.join(srcDir, `img-${browser}`);
    if (fs.existsSync(browserImages)) {
        fs.cpSync(browserImages, path.join(target, "img"), { recursive: true });
    }

    fs.writeFileSync(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 4) + "\n");

    const leftovers = [];
    for (const file of listFiles(target).filter((name) => name.endsWith(".html"))) {
        const text = fillPlaceholders(fs.readFileSync(file, "utf8"), PLACEHOLDER_VALUES[browser]);
        fs.writeFileSync(file, text);
        const found = findPlaceholders(text);
        if (found.length > 0) {
            leftovers.push(`${path.relative(target, file)}: ${found.join(", ")}`);
        }
    }
    if (leftovers.length > 0) {
        throw new Error(`Unreplaced placeholders in ${browser} build:\n${leftovers.join("\n")}`);
    }
    return target;
}

function main(args) {
    const browsers = args.length > 0 ? args : BROWSERS;
    try {
        for (const browser of browsers) {
            console.log(`Built ${path.relative(process.cwd(), build(browser)) || "."}`);
        }
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main(process.argv.slice(2));
}
