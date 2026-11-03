import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

// Shared by the render scripts: start headless Chromium, talk to one page over CDP, clean up.

const STARTUP_TIMEOUT_MS = 15000;
const CALL_TIMEOUT_MS = 15000;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reads the CHROME env variable, or prints usage and exits 1.
export function chromePathOrExit(scriptName) {
    const chromePath = process.env.CHROME;
    if (!chromePath) {
        process.stderr.write(`Usage: CHROME=<path to Chromium> node scripts/${scriptName}\n`);
        process.exit(1);
    }
    return chromePath;
}

async function waitForDevToolsPort(profile, chrome) {
    const portFile = path.join(profile, "DevToolsActivePort");
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (chrome.exitCode !== null) {
            throw new Error(`Chromium exited early with code ${chrome.exitCode}`);
        }
        if (fs.existsSync(portFile)) {
            const [port] = fs.readFileSync(portFile, "utf8").split("\n");
            if (port) {
                return port;
            }
        }
        await delay(100);
    }
    throw new Error("Timed out waiting for Chromium to open its DevTools port");
}

function connect(url) {
    const ws = new WebSocket(url);
    const pending = new Map();
    let nextId = 0;
    ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        const entry = pending.get(message.id);
        if (!entry) {
            return;
        }
        pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) {
            entry.reject(new Error(`${entry.method}: ${message.error.message}`));
        } else {
            entry.resolve(message.result);
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`${method}: timed out`));
        }, CALL_TIMEOUT_MS);
        pending.set(id, { method, resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const opened = new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve, { once: true });
        ws.addEventListener("error", () => reject(new Error("Cannot connect to Chromium")), { once: true });
    });
    return { ws, send, opened };
}

// Runs task(send) against a fresh headless page with a transparent background.
export async function withChromium(chromePath, task) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tronclass-render-"));
    const chrome = spawn(chromePath, [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--no-first-run",
        "--hide-scrollbars",
        `--user-data-dir=${profile}`,
        "--remote-debugging-port=0",
        "about:blank"
    ], { stdio: "ignore" });
    let client = null;
    try {
        await new Promise((resolve, reject) => {
            chrome.once("spawn", resolve);
            chrome.once("error", reject);
        });
        const port = await waitForDevToolsPort(profile, chrome);
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = targets.find((target) => target.type === "page");
        if (!page) {
            throw new Error("Chromium has no page target");
        }
        client = connect(page.webSocketDebuggerUrl);
        await client.opened;
        await client.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
        return await task(client.send);
    } finally {
        if (client) {
            client.ws.close();
        }
        if (chrome.pid !== undefined && chrome.exitCode === null) {
            const exited = new Promise((resolve) => chrome.once("exit", resolve));
            chrome.kill();
            await Promise.race([exited, delay(5000)]);
        }
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
}

// Resolves once the expression's promise settles to true, or throws with the label.
export async function waitFor(send, expression, label) {
    const waited = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (waited.exceptionDetails || waited.result.value !== true) {
        throw new Error(`Cannot render ${label}`);
    }
}

// Two animation frames, so the last change is painted before a capture.
export const PAINTED = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))";
