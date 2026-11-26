<p align="center"><img src="src/img/icon128.png" alt="Tronclass PDF 圖示" width="96" height="96"></p>

[English](README.md) | 繁體中文

# Tronclass PDF

Tronclass PDF 是 Chrome 與 Firefox 的瀏覽器擴充功能，可以下載 Tronclass（iClass）上的教材，包括 PDF、簡報、影片與音訊，並以教材標題作為檔名。

- [Chrome 線上應用程式商店](https://chromewebstore.google.com/detail/tronclass-pdf/hfnbdhdncoploidiifmbpenakollmggg)
- [Firefox 附加元件](https://addons.mozilla.org/en-US/firefox/addon/tronclass-pdf/)

## 功能

| 教材 | 下載格式 | 說明 |
|---|---|---|
| PDF | PDF | 從 Tronclass 的 PDF 檢視器取得。 |
| PPT | PDF | Tronclass 用同一個 PDF 檢視器顯示簡報，所以會存成 PDF。 |
| 影片 | 原始影片檔（通常是 MP4） | 串流影片無法下載。 |
| 音訊 | 原始音訊檔（MP3、M4A、AAC、WAV、OGG、OPUS、FLAC、WEBM 等） | 串流音訊無法下載。副檔名取自檔案網址，取不到時用 MP3。 |

- 檔名取自頁面上的教材標題。檔名不允許的字元會被替換，頁面沒有標題時使用預設檔名。
- 有兩種方式開始下載：按工具列上的擴充功能圖示，或在頁面上按右鍵選「下載此教材 (Tronclass)」。
- 次版本或主版本更新後不會開新分頁。更新後擴充功能第一次開始下載時，頁面正上方會出現小提示。（發布時也可以讓工具列圖示顯示 NEW 徽章，徽章會在第一次下載時消失；這一版不顯示徽章。）就算那次下載後來失敗，提示也會出現；而像「請先開啟教材!」這類提示訊息不算下載。之後的下載不會再顯示。
- 在擴充功能圖示上按右鍵，可以開啟「使用說明」、「更新紀錄」或「GitHub Page」。
- 擴充功能跟著瀏覽器的語言。任何中文（繁體或簡體）的瀏覽器都顯示繁體中文，其他語言一律顯示英文，包括選單、提示訊息、使用說明頁與更新紀錄頁。擴充功能內沒有語言設定。

## 安裝

從你瀏覽器的商店安裝：

- Chrome 與其他 Chromium 瀏覽器：[Chrome 線上應用程式商店](https://chromewebstore.google.com/detail/tronclass-pdf/hfnbdhdncoploidiifmbpenakollmggg)
- Firefox：[Firefox 附加元件](https://addons.mozilla.org/en-US/firefox/addon/tronclass-pdf/)

想從原始碼載入，請見[開發](#開發)。

## 使用方式

1. 釘選擴充功能：打開工具列上的擴充功能選單（拼圖圖示），釘選 Tronclass PDF，讓圖示一直顯示。
2. 在 Tronclass 上打開教材，讓 PDF、簡報、影片或音訊顯示在頁面上。
3. 按工具列上的 Tronclass PDF 圖示，或在頁面上按右鍵選「下載此教材 (Tronclass)」。瀏覽器會把檔案存到平常的下載資料夾。

在擴充功能不能執行指令碼的頁面，例如 `chrome://extensions`、Firefox 的 `about:addons`、Chrome 線上應用程式商店或 Firefox 附加元件網站，按圖示不會有任何反應。在其他頁面，擴充功能無法開始下載時會顯示下列其中一則訊息（瀏覽器本身拒絕的下載不會在這裡提示）：

| 訊息 | 英文 | 意思 |
|---|---|---|
| 請先開啟教材! | Please open a material first! | 你在 Tronclass 的課程頁面，但沒有開啟教材。先開啟教材再試一次。 |
| 這個頁面找不到可下載的教材。 | No downloadable material was found on this page. | 頁面上沒有擴充功能能下載的東西，例如 Tronclass 以外的頁面，或不支援的教材類型。 |
| 這部影片是串流格式，無法直接下載。 | This video is streamed and cannot be downloaded directly. | 影片是分段串流，不是單一檔案，所以無法下載。 |
| 這個音訊是串流格式，無法直接下載。 | This audio is streamed and cannot be downloaded directly. | 音訊是分段串流，不是單一檔案，所以無法下載。 |

## 疑難排解

### 檔名是亂碼或像 `ch05.pdf` 這樣的名稱，而不是教材標題

有其他會改下載檔名的擴充功能（例如 Adobe Acrobat 或下載管理工具）覆蓋了本擴充功能設定的檔名。停用那些擴充功能，或在只裝了 Tronclass PDF 的乾淨瀏覽器設定檔中測試確認。

### 檔案下載完就自動用其他程式開啟

這是瀏覽器對 PDF 檔的設定，不是本擴充功能造成的。Chrome：打開「設定」→「下載」，清除「自動開啟特定類型的檔案」（或在下載泡泡中對下載好的 PDF 按右鍵，取消「一律開啟這類檔案」）。Firefox：打開「設定」，在「一般」找到「應用程式」，把「Portable Document Format (PDF)」設成「儲存檔案」或「用 Firefox 開啟」。

### 影片或音訊教材無法下載

有些教材是分成小段串流，而不是單一檔案。這時擴充功能會顯示「這部影片是串流格式，無法直接下載。」或「這個音訊是串流格式，無法直接下載。」，因為沒有單一檔案可以存。

## 使用條款

1. 請尊重智慧財產權。
2. 本擴充功能僅供學生下載教材，於考試前複習使用，避免考前學校系統過載而無法閱讀教材。
3. 未經教材作者同意而散布教材內容，所造成的直接或間接損失或損害，本擴充功能及其作者不負任何法律或其他責任，由侵權人自行承擔。
4. 安裝本擴充功能即表示同意以上條款。

## 開發

需要 Node 22 以上（在 Node 24 測試過）。沒有需要安裝的相依套件。

- `npm test` 執行測試。
- `npm run build` 把兩個瀏覽器分別建置到 `dist/chrome/` 與 `dist/firefox/`。
- `npm run build -- chrome`（或 `npm run build -- firefox`）只建置一個瀏覽器。

Chrome 與 Firefox 由 `src/` 中同一份原始碼建置。manifest 由 `manifests/base.json` 與 `manifests/chrome.json` 或 `manifests/firefox.json` 合併而成。

載入擴充功能來測試：

- Chrome：打開 `chrome://extensions`，開啟開發人員模式，按「載入未封裝項目」，選擇 `dist/chrome/`。
- Firefox：打開 `about:debugging`，選「這個 Firefox」，按「載入暫時附加元件...」，選擇 `dist/firefox/manifest.json`。

### 專案結構

| 路徑 | 用途 |
|---|---|
| `src/background.js` | 背景指令碼：右鍵選單、下載、NEW 徽章與更新提示。 |
| `src/lib/helpers.js` | 與背景指令碼共用的純函式，以及頁面內的提示。 |
| `src/content/extract.js` | 在頁面上找出教材，組出下載網址與檔名。 |
| `src/content/run.js` | 在頁面中執行擷取，接著送出下載請求或顯示訊息。 |
| `src/_locales/` | 介面文字：`src/_locales/en/messages.json` 與 `src/_locales/zh_TW/messages.json`。 |
| `src/pages/` | 使用說明頁與更新紀錄頁，各有繁體中文（`*.html`）與英文（`*.en.html`）版，以及共用的樣式表。 |
| `src/img/` | 兩個瀏覽器共用的圖示與截圖。 |
| `src/img-chrome/` | 只用在 Chrome 版的截圖。 |
| `src/img-firefox/` | 只用在 Firefox 版的截圖。 |
| `manifests/` | 共用的 `manifests/base.json`，以及各瀏覽器的 `manifests/chrome.json` 與 `manifests/firefox.json`。 |
| `scripts/build.mjs` | 合併 manifest、複製原始碼，並依瀏覽器與頁面語言填入商店連結與釘選說明。 |
| `scripts/render-icons.mjs` | 從 `design/` 的 SVG 原始檔產生 `src/img/` 的圖示 PNG。 |
| `design/` | 圖示原始檔：`design/icon.svg` 用於 48 與 128px，`design/icon-small.svg`（較粗的版本）用於 16、24 與 32px。 |
| `tests/` | 用 `node --test` 執行的測試，以手寫的小型假物件模擬 DOM 與 `chrome` API。 |

### 翻譯

擴充功能使用瀏覽器內建的 `chrome.i18n`。預設語系是 `en`，所以不是中文的瀏覽器語言都會看到英文。

- 所有介面文字都在 `src/_locales/<locale>/messages.json`，裡面只有 `en` 與 `zh_TW`。程式用 `chrome.i18n.getMessage` 讀取，manifest 用 `__MSG_extDescription__` 與 `__MSG_actionTitle__`。
- 中文只改 `zh_TW`。build 會把 `zh_TW/messages.json` 原樣複製到 `scripts/build.mjs` 中 `CHINESE_LOCALE_COPIES` 列出的每個 locale（目前是 `zh_CN`），所以簡體中文的瀏覽器也會顯示繁體中文。Chrome 已經把 zh-HK 的瀏覽器對應到 `zh_TW`，不需要複製。這些複本不要加進 `src/_locales/`。
- 新增字串時，兩份 `messages.json` 都要加，key 相同。key 不一致、訊息是空的，或英文訊息含有中文時，`tests/locales.test.js` 會失敗。
- 英文頁是 `src/pages/` 裡中文頁旁邊的 `*.en.html`。build 由檔名判斷頁面語言，檔名是 `*.en.html` 的頁面會從 `scripts/build.mjs` 填入英文的商店名稱與釘選說明。改一個語言的頁面時，另一個也要改，並保留每頁上方的語言切換連結。
- `messages.json` 裡的 `readmePage` 與 `changelogPage` 決定每種語言開啟哪一頁。

### 新增教材類型

1. 在 `src/content/extract.js` 新增擷取函式，回傳 `{ ok: true, url, filename }` 或 `{ ok: false, reason }`。
2. 在 `extractMaterial` 中依偵測順序的適當位置呼叫它（目前是 PDF、影片、音訊，最後檢查課程頁面）。
3. 如果有新的 `reason`，在 `src/_locales/en/messages.json` 與 `src/_locales/zh_TW/messages.json` 兩份都加上對應訊息，並在 `src/content/run.js` 把這個 `reason` 對應到該 key。
4. 在 `tests/extract.test.js` 與 `tests/run.test.js` 加上測試。

content script 每次點擊都會重新注入同一個頁面，所以 `src/content/*.js` 的最上層不能宣告 `let`、`const` 或 `class`。

### 更換圖示或說明圖

圖示原始檔是 `design/` 中的 SVG。修改後，用 `CHROME=<Chromium 路徑> npm run icons` 重新產生 `src/img/icon16.png`、`icon24.png`、`icon32.png`、`icon48.png` 與 `icon128.png`，這個指令會在 headless Chromium 中繪製。

使用說明頁的插圖畫在 `design/guide.html`，裡面也用到圖示 SVG。用 `CHROME=<Chromium 路徑> npm run guide` 重新產生，會寫出 `src/img-chrome/{unpinned,pinned}.png`、`src/img-firefox/{unpinned,pinned}.png` 與 `src/img/downloading.png`。它也會從 id 以 `-en` 結尾的場景寫出 `readme.en.html` 用的英文版：`src/img-chrome/{unpinned,pinned}.en.png`、`src/img-firefox/{unpinned,pinned}.en.png` 與 `src/img/downloading.en.png`。改了圖示之後也要重跑。

Chrome 線上應用程式商店的截圖畫在 `design/store.html`。用 `CHROME=<Chromium 路徑> npm run store` 重新產生，會寫出 `store/screenshot-1.png` 到 `store/screenshot-3.png`，都是 1280x800 的 RGB PNG。它們只用於商店頁面，不會包進擴充功能。

`npm test` 與 `npm run build` 都不會執行這些步驟，所以要把重新產生的 PNG 一起 commit。

## 發布

1. 修改 `manifests/base.json` 中的版本號。版本號只在這個地方。
2. 如果這一版有使用者看得到的改變，更新 `src/_locales/en/messages.json` 與 `src/_locales/zh_TW/messages.json` 兩份裡的 `whatsNewMessage`（頁面內提示）與 `whatsNewTitle`（NEW 徽章顯示時的工具列提示）。
3. 把這一版加進 `src/pages/changelog.html` 與 `src/pages/changelog.en.html` 兩頁，順序相同。
4. 執行 `npm test` 與 `npm run build`。

這一版怎麼宣布，由 `src/lib/helpers.js` 開頭的兩個開關決定。它們只對次版本或主版本號增加的更新有作用；修補版本（例如 3.1.0 到 3.1.1）會安靜地更新。

- `SHOW_UPDATE_BADGE`：`true` 會在更新後於工具列圖示顯示 NEW 徽章。`false` 永遠不顯示，並且會拿掉之前版本留下來的 NEW 徽章。徽章開、提示關時，NEW 徽章會在更新後的第一次下載時消失。
- `SHOW_UPDATE_POPUP`：`true` 會在更新後的第一次下載時顯示頁面提示，若有 NEW 徽章也會在此時消失。`false` 永遠不顯示提示。

這一版的設定是徽章關、提示開。兩個開關都是 `false` 時，更新不會顯示任何東西，並且會清掉之前版本留下來的 NEW 徽章與待顯示的提示。

打包時，從 repository 根目錄分別壓縮兩個瀏覽器：

```
(cd dist/chrome && zip -r ../tronclass-pdf-chrome.zip .)
(cd dist/firefox && zip -r ../tronclass-pdf-firefox.zip .)
```

`dist/chrome/manifest.json` 含有 `key`，用來在本機開發時固定擴充功能 ID。如果 Chrome 線上應用程式商店拒絕上傳，打包前先移除 `key`。

## 貢獻

歡迎提出 pull request。送出前請執行 `npm test`，確認每個測試都通過。

## 授權

本專案採用 GNU General Public License v3.0（GPL-3.0）授權。請見 [LICENSE](LICENSE)。
