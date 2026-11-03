const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const imgDir = path.join(repoRoot, "src", "img");
const SIZES = [16, 24, 32, 48, 128];
const TEAL = [0x00, 0xb1, 0xb3];
const ORANGE = [0xf2, 0x67, 0x4a];

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) {
        return a;
    }
    return pb <= pc ? b : c;
}

// Decodes an 8-bit RGBA, non-interlaced PNG into { width, height, bitDepth, colorType, pixels }.
function decodePng(file) {
    const buf = fs.readFileSync(file);
    assert.deepStrictEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file} is not a PNG`);
    let pos = 8;
    let header = null;
    const idat = [];
    while (pos < buf.length) {
        const length = buf.readUInt32BE(pos);
        const type = buf.toString("ascii", pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + length);
        if (type === "IHDR") {
            header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
        } else if (type === "IDAT") {
            idat.push(data);
        } else if (type === "IEND") {
            break;
        }
        pos += 12 + length;
    }
    assert.ok(header, `${file} has no IHDR`);
    if (header.bitDepth !== 8 || header.colorType !== 6 || header.interlace !== 0) {
        return { ...header, pixels: null };
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = header.width * 4;
    const pixels = Buffer.alloc(header.height * stride);
    for (let y = 0; y < header.height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x++) {
            const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
            const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
            const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
            const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
            assert.notStrictEqual(predictor, undefined, `${file} uses unknown filter ${filter}`);
            pixels[y * stride + x] = (line[x] + predictor) & 255;
        }
    }
    return { ...header, pixels };
}

function loadIcon(size) {
    return decodePng(path.join(imgDir, `icon${size}.png`));
}

function pixelAt(png, x, y) {
    const i = (y * png.width + x) * 4;
    return [...png.pixels.subarray(i, i + 4)];
}

// Samples a point given in the 128px design coordinates, scaled to this size.
function scaledPixel(png, x, y) {
    return pixelAt(png, Math.floor(x * png.width / 128), Math.floor(y * png.width / 128));
}

function near(pixel, color, tolerance) {
    return [0, 1, 2].every((k) => Math.abs(pixel[k] - color[k]) <= tolerance);
}

function colorShares(png) {
    const total = png.width * png.height;
    let teal = 0;
    let orange = 0;
    let red = 0;
    for (let i = 0; i < png.pixels.length; i += 4) {
        const [r, g, b, a] = png.pixels.subarray(i, i + 4);
        if (a === 255 && g - r >= 60 && b - r >= 60) {
            teal++;
        }
        if (a > 0 && near([r, g, b], ORANGE, 16)) {
            orange++;
        }
        if (a === 255 && r >= 240 && g <= 30 && b <= 30) {
            red++;
        }
    }
    return { teal: teal / total, orange: orange / total, red };
}

for (const size of SIZES) {
    test(`icon${size}.png is ${size}x${size} 8-bit RGBA`, () => {
        const png = loadIcon(size);
        assert.strictEqual(png.width, size);
        assert.strictEqual(png.height, size);
        assert.strictEqual(png.bitDepth, 8);
        assert.strictEqual(png.colorType, 6);
        assert.strictEqual(png.interlace, 0);
    });

    test(`icon${size}.png has a transparent background`, () => {
        const png = loadIcon(size);
        assert.ok(png.pixels, "not 8-bit RGBA");
        assert.strictEqual(pixelAt(png, 0, 0)[3], 0);
    });

    test(`icon${size}.png uses the teal and coral colours and no old pure red`, () => {
        const png = loadIcon(size);
        assert.ok(png.pixels, "not 8-bit RGBA");
        const shares = colorShares(png);
        assert.ok(shares.teal >= 0.02, `teal share ${shares.teal}`);
        assert.ok(shares.orange >= 0.01, `coral share ${shares.orange}`);
        assert.strictEqual(shares.red, 0);
    });
}

for (const size of [48, 128]) {
    test(`icon${size}.png has the cut corner of the document`, () => {
        const png = loadIcon(size);
        assert.ok(png.pixels, "not 8-bit RGBA");
        assert.strictEqual(scaledPixel(png, 90, 20)[3], 0, "outside the cut corner");
        assert.strictEqual(scaledPixel(png, 90, 32)[3], 255, "inside the cut corner");
    });
}

test("icon128.png has a hollow check", () => {
    const png = loadIcon(128);
    assert.ok(png.pixels, "not 8-bit RGBA");
    const [r, g, b] = pixelAt(png, 71, 64);
    assert.ok(r >= 240 && g >= 240 && b >= 240, `middle of the long stroke is ${[r, g, b]}`);
    for (const [x, y] of [[74, 67], [67, 60]]) {
        const pixel = pixelAt(png, x, y);
        assert.strictEqual(pixel[3], 255, `alpha at ${x},${y}`);
        assert.ok(near(pixel, TEAL, 12), `colour at ${x},${y} is ${pixel}`);
    }
});

for (const size of [16, 24, 32]) {
    test(`icon${size}.png has a solid check`, () => {
        const png = loadIcon(size);
        assert.ok(png.pixels, "not 8-bit RGBA");
        const pixel = scaledPixel(png, 71, 64);
        assert.ok(near(pixel, TEAL, 40), `middle of the long stroke is ${pixel}`);
    });
}

test("render-icons.mjs exits 1 with usage when CHROME is not set", () => {
    const env = { ...process.env };
    delete env.CHROME;
    const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "render-icons.mjs")], { env, encoding: "utf8" });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /CHROME/);
});
