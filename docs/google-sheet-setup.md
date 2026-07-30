# Google Sheet 建置文件

這份文件用來建立 APINK K-WAVE 2026 應援任務的資料庫與抽獎後台。

## 1. 建立 Google Sheet

1. 到 Google Drive 建立新的 Google Sheet。
2. 檔名建議：`APINK K-WAVE 2026 Raffle Responses`。
3. 第一個工作表命名為 `Responses`。
4. 第一列填入下列欄位，順序不要改：

```text
created_at
serial
nickname
contact
favorite_song
entry_time
support_moment
message
support_energy
consent
status
user_agent
fan_type
support_group
apink_member_card
discovery_stage
discovery_song
```

也可以直接參考 `docs/responses-template.csv` 的欄位。

## 2. 建立 Apps Script

1. 在 Google Sheet 上方選單點 `Extensions > Apps Script`。
2. 刪掉預設內容。
3. 把 repository 裡的 `apps-script/Code.gs` 全部貼進去。
4. 儲存專案，專案名稱可用：`APINK K-WAVE Raffle API`。
5. 在 Apps Script 編輯器上方的 function 下拉選單選 `setup`。
6. 點執行，第一次會要求授權。
7. 授權完成後，回到 Sheet 檢查 `Responses` 是否有正確欄位，並確認有 `Settings` 工作表。

## 3. 部署 Web App

1. 在 Apps Script 編輯器右上角點 `Deploy > New deployment`。
2. `Select type` 選 `Web app`。
3. Description 可填：`Production raffle API`。
4. `Execute as` 選 `Me`。
5. `Who has access` 選 `Anyone`。
6. 點 `Deploy`。
7. 複製產生的 Web App URL。

URL 會長得像這樣：

```text
https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
```

## 4. 連接 GitHub Pages

打開 repository 的 `config.js`，把 `appsScriptUrl` 改成剛才的 Web App URL：

```javascript
window.KWAVE_CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec'
};
```

更新後 commit 並推上 GitHub Pages 使用的分支。

## 5. 測試送出

1. 開啟 GitHub Pages 網址。
2. 用測試 IG 或 Threads 帳號完成問卷。
3. 完成後頁面應顯示序號，例如：

```text
APINK-KWAVE-000001-A1B2C3
```

4. 回到 Google Sheet，確認新資料已寫入 `Responses`。
5. 用同一個聯絡方式再送一次，頁面應顯示相同序號，不會建立第二筆抽獎資格。

## 6. 測試應援大眾池

獨立頁面的「應援大眾池」會讀取 Panda 路線的匿名展示資料，只公開：

- `favorite_song`
- `support_moment`
- `message`

不會公開 `contact` 或抽獎序號。

部署 Web App 後，可以在瀏覽器打開：

```text
https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec?action=pool
```

如果有 Panda 路線資料，應看到類似：

```json
{
  "source": "apink-kwave",
  "ok": true,
  "entries": [
    {
      "song": "Love Me More（RE:LOVE）",
      "reason": "歌曲好聽",
      "message": "謝謝 APINK 一直用歌曲陪著我們。"
    }
  ]
}
```

如果更新 `apps-script/Code.gs` 之後沒有重新部署，大眾池頁面仍會顯示「Mission 回答累積中」，但不會影響抽獎送出。

## 7. 測試統計排行

「統計排行」頁面會讀取有效抽獎資料的匿名聚合結果，只公開：

- `favorite_song`
- `entry_time`
- `support_moment`

不會公開 `contact`、抽獎序號或單筆回覆內容。部署 Web App 後，可以在瀏覽器打開：

```text
https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec?action=stats
```

如果有有效資料，應看到類似：

```json
{
  "source": "apink-kwave",
  "ok": true,
  "stats": {
    "totalEligible": 12,
    "sections": [
      {
        "key": "favoriteSong",
        "title": "最多人喜愛的歌曲",
        "items": [
          {
            "rank": 1,
            "label": "Dumhdurum",
            "count": 4,
            "percent": 33.3
          }
        ]
      }
    ]
  }
}
```

如果更新 `apps-script/Code.gs` 之後沒有重新部署，統計頁面會顯示無法讀取統計排行。

## 8. 欄位說明

| 欄位 | 用途 |
| --- | --- |
| `created_at` | 送出時間 |
| `serial` | 抽獎序號，由 Apps Script 產生 |
| `nickname` | 保留欄位，可留空 |
| `contact` | Threads 或 IG 帳號，中獎聯繫用 |
| `favorite_song` | Panda 路線的主打歌 / 喜歡的歌答案，非 Panda 路線留空 |
| `entry_time` | Panda 路線的入坑時間答案，非 Panda 路線留空 |
| `support_moment` | Panda 路線的入坑原因答案，非 Panda 路線留空 |
| `message` | Panda 路線應援訊息，非 Panda 路線留空 |
| `support_energy` | 1 到 5 的應援能量 |
| `consent` | 是否勾選粉絲自製趣味調查與資料使用聲明 |
| `status` | 抽獎資格，預設 `eligible` |
| `user_agent` | 基本瀏覽器資訊，用於除錯 |
| `fan_type` | 是否為 Panda，`yes` 或 `no` |
| `support_group` | 非 Panda 路線填寫的支持團體 |
| `apink_member_card` | 舊版非 Panda 路線抽到的 APINK 代表色色卡，現行路線可留空 |
| `discovery_stage` | 非 Panda 路線參考推坑網站 / 專輯後的想法 |
| `discovery_song` | 非 Panda 路線試聽後選擇的 APINK 推薦主打歌 |

## 8. 管理抽獎資格

`status` 預設是 `eligible`。

如果某筆資料不符合資格，可以人工把 `status` 改成：

```text
invalid
```

執行抽獎時，只有 `status` 是 `eligible` 的資料會進入抽獎池。

## 8.5 中獎頁開關

`setup()` 會建立 `Settings` 工作表，其中：

| key | value | 用途 |
| --- | --- | --- |
| `winner_draw_open` | `FALSE` | 控制中獎頁是否開放 |

`winner_draw_open` 預設為未勾選，也就是 `FALSE`。此時 `winners.html` 只會顯示「尚未開放中獎名單」，不會抽獎也不會公開既有中獎結果。

活動要開放抽獎或公布結果時，勾選 `value` 欄的 checkbox，讓值變成：

```text
TRUE
```

這個開關讀取 Google Sheet 內容，切換時不需要重新部署 Web App。

## 9. 抽出 10 位中獎者

活動結束後：

1. 確認 `apps-script/Code.gs` 已重新部署成最新 Web App 版本。
2. 到 Google Sheet 的 `Settings` 工作表，把 `winner_draw_open` 改成 `TRUE`。
3. 開啟網站的 `winners.html`。
4. 頁面會直接顯示中獎結果表格，共抽出 10 位。
5. 回到 Google Sheet，會看到新的 `Winners` 工作表。
6. `Winners` 會保存固定的 10 筆中獎序號，並附上聯絡帳號與 Panda / 路人粉路線的主要問卷答案，方便管理者核對。

`Winners` 已有資料時，`winners.html` 會直接顯示同一批序號，不會重新抽選。若需要重抽，請先由管理者確認後手動清空 `Winners` 工作表。

## 10. 公布中獎名單

公開結果頁只會顯示 `serial`，不會顯示 `contact`。

可公布格式：

```text
APINK-KWAVE-000001-A1B2C3
APINK-KWAVE-000018-F7G8H9
APINK-KWAVE-000042-Z4Y5X6
```

中獎者再用自己的序號核對結果。

## 11. 注意事項

- 不要把 Google Sheet 設成公開編輯。
- 不要把 Apps Script 原始碼中的邏輯改成前端產生序號。
- 如果更新 Apps Script 程式碼，記得重新部署 Web App。
- 如果要重新測試正式活動，請先清空測試資料或另開測試用 Sheet。
- 建議活動開始前至少用手機與桌機各送出一次測試資料。

## 12. 疑難排解

### 網頁一直停在「送出中」

這通常代表前端已送出表單，但沒有收到 Apps Script 回傳的序號訊息。

請確認：

1. Google Apps Script 裡的 `Code.gs` 已貼上 repository 最新版本。
2. 更新 Apps Script 後，有重新部署 Web App。
3. 重新部署時請到 `Deploy > Manage deployments`，選目前的 Web App，點鉛筆圖示，版本選 `New version`，再按 `Deploy`。
4. `config.js` 裡的 `appsScriptUrl` 仍是目前部署中的 Web App URL。
