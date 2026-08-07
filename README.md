# APINK K-WAVE 2026 應援網站

GitHub Pages 靜態應援網站。根目錄首頁使用扇面展示 UI，並在同一頁整合 Lucky Draw Mission 問卷抽獎。粉絲完成任務後，前端會把問卷送到 Google Apps Script，Apps Script 產生抽獎序號並寫入 Google Sheet。活動結束後可在中獎結果頁抽出 10 位中獎序號。

## 檔案

- `index.html`：主視覺首頁與抽獎任務
- `merch.html`：應援物展示頁
- `support-pool.html`：匿名應援大眾池
- `stats.html`：匿名統計排行頁
- `winners.html`：中獎抽選與結果公布頁
- `lightstick.html`：手燈電量查詢頁
- `styles.css`：頁面樣式
- `script.js`：翻扇互動、問卷流程、表單送出、序號顯示
- `stats.js`：讀取匿名統計排行並顯示前三組排行榜
- `draw.js`：中獎結果讀取、固定名單建立與結果表格
- `merch.js`：應援物展示互動
- `lightstick.js`：用 Web Bluetooth 讀取手燈電量
- `assets/`：主視覺與應援物圖片
- `config.js`：Apps Script Web App URL 設定
- `apps-script/Code.gs`：貼到 Google Apps Script 的後端程式

## Google Sheet 與 Apps Script

詳細建置步驟請看 `docs/google-sheet-setup.md`。

1. 建立一個 Google Sheet。
2. 在 Sheet 中開啟 `Extensions > Apps Script`。
3. 把 `apps-script/Code.gs` 的內容貼進 Apps Script。
4. 執行 `setup()`，授權後會建立 `Responses` 欄位與 `Settings` 開關。
5. 選擇 `Deploy > New deployment > Web app`。
6. 設定 `Execute as: Me`，`Who has access: Anyone`。
7. 複製 Web App URL，貼到 `config.js` 的 `appsScriptUrl`。

## 上線

在 GitHub repository 的 `Settings > Pages` 啟用 GitHub Pages，來源選擇主要分支與 `/root`。部署後即可開啟靜態頁。

## 抽獎

活動結束後，先到 Google Sheet 的 `Settings` 工作表把 `winner_draw_open` 改成 `TRUE`，再開啟 `winners.html`。頁面會從 `Responses` 裡 `status` 為 `eligible` 的資料隨機抽出 10 筆，建立 `Winners` 工作表，並直接顯示中獎結果表格。`winner_draw_open` 是 `FALSE` 時，頁面會顯示「尚未開放中獎名單」。`Winners` 已有資料時，頁面會直接顯示同一批中獎序號，不會重新抽選。

若需要在 Apps Script 編輯器手動執行，也可以執行 `drawWinners()`；同樣會優先回傳既有 `Winners` 名單。

同一個聯絡方式只會取得一組序號。若粉絲重複送出，網頁會重新顯示原本的序號。

## 手燈電量

`lightstick.html` 用 Web Bluetooth API 直接連上 APINK 手燈，讀取標準藍牙電池服務（`0x180F` / `0x2A19`）的電量百分比，並訂閱通知自動更新。整個過程只發生在使用者的瀏覽器裡，不經過任何伺服器，也不會上傳資料。最後一次讀到的數值存在瀏覽器的 `localStorage`，下次開啟頁面會先顯示上次紀錄。

限制：

- 只有電腦版 Chrome、Edge 和 Android 版 Chrome 支援 Web Bluetooth。**Safari 與 iPhone、iPad 上的所有瀏覽器都不支援**，因為 iOS 沒有開放這個 API。
- 必須透過 HTTPS 開啟，GitHub Pages 已符合。本機測試用 `http://localhost` 也可以。
- macOS 需要到「系統設定 → 隱私權與安全性 → 藍牙」允許瀏覽器使用藍牙。
- 手燈要先開機並長按按鈕進入藍牙模式才掃得到。

手燈只有電池服務可以讀。控制燈光顏色的私有指令通道（`87011111-ffcc-2222-0000-000000008888`）目前尚未破解，相關的探測工具在 `scripts/apink_lightstick_probe.py`。

## 統計排行

`stats.html` 會讀取 Apps Script 的 `action=stats`，只顯示聚合後的匿名排行榜：`favorite_song`、`entry_time`、`support_moment`。頁面不公開聯絡方式、序號或單筆回覆。
