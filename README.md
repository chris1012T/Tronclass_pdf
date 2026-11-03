# Tronclass PDF

This extension allows you to download most files from Tronclass in PDF format.

## Links
- [Chrome Web Store - Tronclass PDF](https://chromewebstore.google.com/detail/tronclass-pdf-%E5%8E%9Ficlass-get/hfnbdhdncoploidiifmbpenakollmggg)
- [Firefox Browser ADD-ONS - Tronclass PDF](https://addons.mozilla.org/en-US/firefox/addon/tronclass-pdf/)

## Instructions
Open the materials on Tronclass, then click the icon in the extension tray directly.

Alternatively, you can right-click anywhere on the page and select "下載此教材 (Tronclass)" in the context menu.

## Development
Requires Node 22 or later (tested on Node 24). There are no dependencies to install.

- `npm test` runs the tests.
- `npm run build` builds both browsers into `dist/chrome/` and `dist/firefox/`.
- `npm run build -- chrome` (or `firefox`) builds only one browser.

Chrome and Firefox are built from the same source in `src/`. The manifest is merged from `manifests/base.json` and `manifests/chrome.json` or `manifests/firefox.json`.

To load the extension for testing:

- Chrome: open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and select `dist/chrome/`.
- Firefox: open `about:debugging`, choose "This Firefox", click "Load Temporary Add-on..." and select `dist/firefox/manifest.json`.

## Packaging
The version number lives only in `manifests/base.json`. Change it there before a release, then run `npm run build` and zip each browser from the repository root:

```
(cd dist/chrome && zip -r ../tronclass-pdf-chrome.zip .)
(cd dist/firefox && zip -r ../tronclass-pdf-firefox.zip .)
```

`dist/chrome/manifest.json` contains `key` to pin the extension ID for local development. If the Chrome Web Store rejects the upload, remove `key` before packaging.

## Contributing
Your pull requests are welcomed and greatly appreciated!
