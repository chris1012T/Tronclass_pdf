import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromePathOrExit, withChromium, waitFor, PAINTED } from "./chromium.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Each .scene id in design/store.html and the store listing screenshot it becomes.
const SCENES = [
    { id: "store-1", out: "store/screenshot-1.png" },
    { id: "store-2", out: "store/screenshot-2.png" },
    { id: "store-3", out: "store/screenshot-3.png" }
];

// The Chrome Web Store wants exactly this size, with no alpha channel.
const WIDTH = 1280;
const HEIGHT = 800;

async function main() {
    const chromePath = chromePathOrExit("render-store.mjs");
    fs.mkdirSync(path.join(repoRoot, "store"), { recursive: true });
    await withChromium(chromePath, async (send) => {
        // An opaque default background makes Chromium encode RGB PNGs instead of RGBA.
        await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 255, g: 255, b: 255, a: 1 } });
        await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
        await send("Page.navigate", { url: pathToFileURL(path.join(repoRoot, "design", "store.html")).href });
        // Wait for the page, its fonts and every icon image, then for paint.
        const ready = `new Promise((r) => document.readyState === "complete" ? r() : addEventListener("load", r, { once: true }))
            .then(() => document.fonts.ready)
            .then(() => Promise.all([...document.images].map((img) => img.decode())))
            .then(() => ${PAINTED})`;
        await waitFor(send, ready, "design/store.html");
        for (const { id, out } of SCENES) {
            const rect = await send("Runtime.evaluate", {
                expression: `(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`,
                returnByValue: true
            });
            if (rect.exceptionDetails) {
                throw new Error(`No scene #${id} in design/store.html`);
            }
            const { x, y, width, height } = rect.result.value;
            if (width !== WIDTH || height !== HEIGHT) {
                throw new Error(`#${id} is ${width}x${height}, expected ${WIDTH}x${HEIGHT}`);
            }
            const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x, y, width, height, scale: 1 } });
            fs.writeFileSync(path.join(repoRoot, out), Buffer.from(shot.data, "base64"));
            console.log(`Wrote ${out} from #${id}`);
        }
    });
}

main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
});
