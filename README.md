<p align="center"><img src="src/img/icon128.png" alt="Tronclass PDF icon" width="96" height="96"></p>

# Tronclass PDF

Tronclass PDF is a browser extension for Chrome and Firefox that downloads course materials from Tronclass (iClass), including PDFs, slides, videos and audio, and names each file after the material's title.

- [Chrome Web Store](https://chromewebstore.google.com/detail/tronclass-pdf/hfnbdhdncoploidiifmbpenakollmggg)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tronclass-pdf/)

## Features

| Material | Downloaded as | Notes |
|---|---|---|
| PDF | PDF | Read from the Tronclass PDF viewer. |
| PPT | PDF | Tronclass shows slides in the same PDF viewer, so they are saved as PDF. |
| Video | Original video file (usually MP4) | Streaming videos cannot be downloaded. |
| Audio | Original audio file (MP3, M4A, AAC, WAV, OGG, OPUS, FLAC, WEBM and similar) | Streaming audio cannot be downloaded. The extension is taken from the file URL and falls back to MP3. |

- The file name is taken from the material's title on the page. Characters that are not allowed in file names are replaced, and a default name is used when the page has no title.
- Start a download in either of two ways: click the extension icon in the toolbar, or right-click the page and choose "下載此教材 (Tronclass)".
- After a minor or major update, the toolbar icon shows a NEW badge instead of opening a new tab. The first time the extension starts a download after the update, a small notice appears in the bottom right corner of the page and the badge goes away. The notice appears even if that download then fails, while an alert such as 請先開啟教材! does not count as a download. Later downloads do not show it again.
- Right-click the extension icon to open "使用說明" (the instructions page), "更新紀錄" (the changelog) or "GitHub Page".

## Installation

Install from the store for your browser:

- Chrome and other Chromium browsers: [Chrome Web Store](https://chromewebstore.google.com/detail/tronclass-pdf/hfnbdhdncoploidiifmbpenakollmggg)
- Firefox: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tronclass-pdf/)

To load the extension from source instead, see [Development](#development).

## Usage

1. Pin the extension: open the extensions menu (the puzzle piece icon) in the toolbar and pin Tronclass PDF so its icon stays visible.
2. Open a material on Tronclass, so that the PDF, slides, video or audio is shown on the page.
3. Click the Tronclass PDF icon in the toolbar, or right-click the page and choose "下載此教材 (Tronclass)". The browser saves the file to your usual download folder.

On pages where extensions are not allowed to run scripts, such as `chrome://extensions`, Firefox's `about:addons`, the Chrome Web Store or the Firefox Add-ons site, clicking the icon does nothing. On other pages, when the extension cannot start a download, it shows one of these messages (a download that the browser itself refuses is not reported here):

| Message | Meaning |
|---|---|
| 請先開啟教材! | You are on a Tronclass course page, but no material is open. Open the material first, then try again. |
| 這個頁面找不到可下載的教材。 | The page has nothing the extension can download, for example a page outside Tronclass or a material type it does not support. |
| 這部影片是串流格式，無法直接下載。 | The video is streamed in pieces rather than served as one file, so it cannot be downloaded. |
| 這個音訊是串流格式，無法直接下載。 | The audio is streamed in pieces rather than served as one file, so it cannot be downloaded. |

## Troubleshooting

### The file is named with random characters or a name like `ch05.pdf` instead of the material's title

Another extension that renames downloads, such as Adobe Acrobat or a download manager, is overriding the name this extension sets. Disable those extensions, or test in a clean browser profile with only Tronclass PDF installed, to confirm.

### The file opens in another program right after it is downloaded

This is a browser setting for PDF files, not something this extension does. In Chrome, open Settings, then Downloads, and clear "Open certain file types automatically" (or right-click a finished PDF in the download bubble and turn off "Always open files of this type"). In Firefox, open Settings, find "Applications" under General, and set "Portable Document Format (PDF)" to "Save File" or "Open in Firefox".

### A video or audio material cannot be downloaded

Some materials are streamed in small pieces instead of being served as a single file. The extension shows "這部影片是串流格式，無法直接下載。" or "這個音訊是串流格式，無法直接下載。" for these, and there is no single file it can save.

## Terms of Use

1. Please respect intellectual property rights.
2. This extension is intended only for students to download course materials for review before exams, so that the materials stay readable when the school system is overloaded before an exam.
3. If anyone distributes course materials without the consent of their author, this extension and its author accept no legal or other liability for any direct or indirect loss or damage that results. The infringer alone bears that responsibility.
4. Installing this extension means you agree to the terms above.

## Development

Requires Node 22 or later (tested on Node 24). There are no dependencies to install.

- `npm test` runs the tests.
- `npm run build` builds both browsers into `dist/chrome/` and `dist/firefox/`.
- `npm run build -- chrome` (or `npm run build -- firefox`) builds only one browser.

Chrome and Firefox are built from the same source in `src/`. The manifest is merged from `manifests/base.json` and `manifests/chrome.json` or `manifests/firefox.json`.

To load the extension for testing:

- Chrome: open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and select `dist/chrome/`.
- Firefox: open `about:debugging`, choose "This Firefox", click "Load Temporary Add-on..." and select `dist/firefox/manifest.json`.

### Project structure

| Path | Purpose |
|---|---|
| `src/background.js` | Background script: context menus, downloads, the NEW badge and the update notice. |
| `src/lib/helpers.js` | Pure helpers shared with the background script, the update notice texts and the in-page notice. |
| `src/content/extract.js` | Finds the material on the page and builds its download URL and file name. |
| `src/content/run.js` | Runs the extractor in the page, then sends the download request or shows a message. |
| `src/pages/` | The instructions page, the changelog page and their shared stylesheet. |
| `src/img/` | Icons and screenshots shared by both browsers. |
| `src/img-chrome/` | Screenshots used only in the Chrome build. |
| `src/img-firefox/` | Screenshots used only in the Firefox build. |
| `manifests/` | The shared `manifests/base.json` and the per browser `manifests/chrome.json` and `manifests/firefox.json`. |
| `scripts/build.mjs` | Merges the manifests, copies the sources and fills in the store links for each browser. |
| `scripts/render-icons.mjs` | Renders the icon PNGs in `src/img/` from the SVG sources in `design/`. |
| `design/` | Icon sources: `design/icon.svg` for 48 and 128px, `design/icon-small.svg` (a bolder version) for 16, 24 and 32px. |
| `tests/` | Tests run with `node --test`, using small hand-written fakes for the DOM and the `chrome` API. |

### Adding a material type

1. In `src/content/extract.js`, add an extractor function that returns `{ ok: true, url, filename }` or `{ ok: false, reason }`.
2. Call it from `extractMaterial`, in the right place in the detection order (currently PDF, then video, then audio, then the check for course pages).
3. If it introduces a new `reason`, add the message for it to `src/content/run.js`.
4. Add tests to `tests/extract.test.js` and `tests/run.test.js`.

Content scripts are injected again on every click into the same page, so `src/content/*.js` must not declare `let`, `const` or `class` at the top level.

### Changing the icon or the guide images

The icon sources are the SVG files in `design/`. After editing them, regenerate `src/img/icon16.png`, `icon24.png`, `icon32.png`, `icon48.png` and `icon128.png` with `CHROME=<path to Chromium> npm run icons`, which renders them in headless Chromium.

The illustrations on the usage page are drawn in `design/guide.html`, which also uses the icon SVG. Regenerate them with `CHROME=<path to Chromium> npm run guide`, which writes `src/img-chrome/{unpinned,pinned}.png`, `src/img-firefox/{unpinned,pinned}.png` and `src/img/downloading.png`. Re-run it after an icon change too.

The Chrome Web Store screenshots are drawn in `design/store.html`. Regenerate them with `CHROME=<path to Chromium> npm run store`, which writes `store/screenshot-1.png` to `store/screenshot-3.png` as 1280x800 RGB PNGs. They are only for the store listing and are not shipped in the extension.

Neither `npm test` nor `npm run build` runs these steps, so commit the regenerated PNGs.

## Releasing

1. Change the version number in `manifests/base.json`. It is the only place the version lives.
2. If the release has a user-facing change, update `WHATS_NEW_MESSAGE` (the in-page notice) and `WHATS_NEW_TITLE` (the toolbar tooltip while the NEW badge shows) in `src/lib/helpers.js`.
3. Add the release to `src/pages/changelog.html`.
4. Run `npm test` and `npm run build`.

The NEW badge and the update notice only appear when the minor or major version number goes up. A patch release, such as 3.1.0 to 3.1.1, updates silently.

To package, zip each browser from the repository root:

```
(cd dist/chrome && zip -r ../tronclass-pdf-chrome.zip .)
(cd dist/firefox && zip -r ../tronclass-pdf-firefox.zip .)
```

`dist/chrome/manifest.json` contains `key` to pin the extension ID for local development. If the Chrome Web Store rejects the upload, remove `key` before packaging.

## Contributing

Pull requests are welcome. Please run `npm test` before you submit one and make sure every test passes.

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See [LICENSE](LICENSE).
