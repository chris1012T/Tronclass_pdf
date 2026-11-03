import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromePathOrExit, withChromium, waitFor, PAINTED } from "./chromium.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Each .scene id in design/guide.html and the readme page image it becomes.
const SCENES = [
    { id: "chrome-unpinned", out: "src/img-chrome/unpinned.png" },
    { id: "chrome-pinned", out: "src/img-chrome/pinned.png" },
    { id: "firefox-unpinned", out: "src/img-firefox/unpinned.png" },
    { id: "firefox-pinned", out: "src/img-firefox/pinned.png" },
    { id: "downloading", out: "src/img/downloading.png" }
];

const SCALE = 2;

async function main() {
    const chromePath = chromePathOrExit("render-guide.mjs");
    await withChromium(chromePath, async (send) => {
        await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: SCALE, mobile: false });
        await send("Page.navigate", { url: pathToFileURL(path.join(repoRoot, "design", "guide.html")).href });
        // Wait for the page, its fonts and every icon image, then for paint.
        const ready = `new Promise((r) => document.readyState === "complete" ? r() : addEventListener("load", r, { once: true }))
            .then(() => document.fonts.ready)
            .then(() => Promise.all([...document.images].map((img) => img.decode())))
            .then(() => ${PAINTED})`;
        await waitFor(send, ready, "design/guide.html");
        for (const { id, out } of SCENES) {
            const rect = await send("Runtime.evaluate", {
                expression: `(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
                returnByValue: true
            });
            if (rect.exceptionDetails) {
                throw new Error(`No scene #${id} in design/guide.html`);
            }
            const shot = await send("Page.captureScreenshot", { format: "png", clip: { ...rect.result.value, scale: 1 } });
            fs.writeFileSync(path.join(repoRoot, out), Buffer.from(shot.data, "base64"));
            console.log(`Wrote ${out} from #${id}`);
        }
    });
}

main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
});
