# APINK K-WAVE 2026 應援網站

GitHub Pages 靜態應援網站。根目錄首頁使用扇面展示 UI，並在同一頁整合 Lucky Draw Mission 問卷抽獎。粉絲完成任務後，前端會把問卷送到 Google Apps Script，Apps Script 產生抽獎序號並寫入 Google Sheet。活動結束後可在 Apps Script 手動抽出 10 位中獎序號。

## 檔案

- `index.html`：主視覺首頁與抽獎任務
- `merch.html`：應援物展示頁
- `styles.css`：頁面樣式
- `script.js`：翻扇互動、問卷流程、表單送出、序號顯示
- `merch.js`：應援物展示互動
- `assets/`：主視覺與應援物圖片
- `config.js`：Apps Script Web App URL 設定
- `apps-script/Code.gs`：貼到 Google Apps Script 的後端程式

## Google Sheet 與 Apps Script

詳細建置步驟請看 `docs/google-sheet-setup.md`。

1. 建立一個 Google Sheet。
2. 在 Sheet 中開啟 `Extensions > Apps Script`。
3. 把 `apps-script/Code.gs` 的內容貼進 Apps Script。
4. 執行 `setup()`，授權後會建立 `Responses` 欄位。
5. 選擇 `Deploy > New deployment > Web app`。
6. 設定 `Execute as: Me`，`Who has access: Anyone`。
7. 複製 Web App URL，貼到 `config.js` 的 `appsScriptUrl`。

## 上線

在 GitHub repository 的 `Settings > Pages` 啟用 GitHub Pages，來源選擇主要分支與 `/root`。部署後即可開啟靜態頁。

## 抽獎

活動結束後，在 Apps Script 編輯器手動執行 `drawWinners()`。程式會從 `Responses` 裡 `status` 為 `eligible` 的資料隨機抽出最多 10 筆，並建立 `Winners` 工作表。

同一個聯絡方式只會取得一組序號。若粉絲重複送出，網頁會重新顯示原本的序號。
