import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePathOrExit, withChromium, waitFor, PAINTED } from "./chromium.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Each output PNG and the SVG it is rendered from.
const ICONS = [
    { svg: "icon-small.svg", size: 16 },
    { svg: "icon-small.svg", size: 24 },
    { svg: "icon-small.svg", size: 32 },
    { svg: "icon.svg", size: 48 },
    { svg: "icon.svg", size: 128 }
];

async function renderIcon(send, svgPath, size) {
    await send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    const svgUrl = "data:image/svg+xml;base64," + fs.readFileSync(svgPath).toString("base64");
    const html = `<html><body style="margin:0"><img id="icon" src="${svgUrl}" width="${size}" height="${size}" style="display:block"></body></html>`;
    await send("Page.navigate", { url: "data:text/html;base64," + Buffer.from(html).toString("base64") });
    // Wait for the SVG to decode, then for it to be painted.
    await waitFor(send, `document.getElementById('icon').decode().then(() => ${PAINTED})`, `${svgPath} at ${size}px`);
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    return Buffer.from(shot.data, "base64");
}

async function main() {
    const chromePath = chromePathOrExit("render-icons.mjs");
    await withChromium(chromePath, async (send) => {
        for (const { svg, size } of ICONS) {
            const png = await renderIcon(send, path.join(repoRoot, "design", svg), size);
            const out = path.join(repoRoot, "src", "img", `icon${size}.png`);
            fs.writeFileSync(out, png);
            console.log(`Wrote ${path.relative(repoRoot, out)} from design/${svg}`);
        }
    });
}

main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
});
