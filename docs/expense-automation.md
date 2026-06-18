# 每月支出自動整理

這個專案是一個以 Google Sheets 作為資料庫的支出自動化網站。前端檔案位於 repo 根目錄，GitHub Pages 可以直接從根目錄讀取 `index.html`。

## 1. Google Sheets 欄位

主資料表名稱：`Expenses`

第一列欄位必須依照以下順序：

```text
日期,月份(自動),類別,金額,手續費,付款方式,銀行/卡片名稱,備註,建立時間
```

欄位說明：

- `日期`：前端輸入，格式 `YYYY-MM-DD`
- `月份(自動)`：後端依日期自動擷取 `YYYY-MM`
- `類別`：前端以下拉選單送出純文字類別，例如 `食品`
- `金額`：支出金額
- `手續費`：只有付款方式為 `轉帳` 時由前端顯示，沒有則寫入空白
- `付款方式`：現金、轉帳、信用卡、行動支付、其他
- `銀行/卡片名稱`：轉帳時寫入轉帳銀行；信用卡時寫入卡片名稱；其他方式寫入空白
- `備註`：前端輸入，可空白
- `建立時間`：後端寫入 Timestamp

`Settings` 工作表：

```text
key,value
defaultCurrency,TWD
highExpenseThreshold,5000
```

## 2. Apps Script 部署

到 Google Sheet 的「擴充功能」→「Apps Script」，貼上 `apps-script/Code.gs`，並可加入 `apps-script/appsscript.json`。

部署方式：

1. 在 Apps Script 執行任一 API 前會自動初始化工作表。
2. 點「部署」→「新增部署作業」。
3. 類型選「網頁應用程式」。
4. 執行身分選「我」。
5. 存取權選「任何人」。
6. 複製 Web App URL，寫入根目錄 `app.js` 的 `API_URL`。

## 3. 前端功能

根目錄檔案：

- `index.html`
- `styles.css`
- `app.js`

支出類別由 `app.js` 的 JSON 物件產生，介面會顯示 Emoji 與文字：

```json
{
  "食品": "🍔",
  "交通": "🚗",
  "雜支": "🛒",
  "書籍": "📚",
  "用品": "🧻",
  "房租": "🏠",
  "水電": "⚡",
  "通信": "📱",
  "衣物": "👕",
  "學費": "🎓",
  "儲蓄": "💰",
  "娛樂": "🎵",
  "旅遊": "✈️",
  "其他": "✨"
}
```

付款方式動態邏輯：

- 選擇 `轉帳`：顯示 `手續費` 與 `轉帳銀行`
- 選擇 `信用卡`：顯示 `卡片名稱`
- 選擇 `現金`、`行動支付` 或 `其他`：隱藏上述欄位

送出時，`轉帳銀行` 或 `卡片名稱` 會合併成 API 參數 `bankCardName`，後端會寫入 Google Sheet 欄位 `銀行/卡片名稱`。

## 4. API 格式

新增支出：

```json
{
  "action": "addExpense",
  "expense": {
    "date": "2026-06-18",
    "category": "食品",
    "amount": 120,
    "fee": "",
    "paymentMethod": "信用卡",
    "bankCardName": "富邦 J 卡",
    "note": "午餐"
  }
}
```

查詢月統計：

```text
GET /exec?action=monthlySummary&month=2026-06
```

查詢月明細：

```text
GET /exec?action=listExpenses&month=2026-06
```

手動產生月報表：

```json
{
  "action": "generateMonthlyReport",
  "month": "2026-06"
}
```

## 5. 月報表與圓餅圖

`generateMonthlyReport(month)` 會：

1. 讀取 `Expenses` 主資料表中的所有紀錄。
2. 篩選出指定月份的所有支出。
3. 依照 `類別` 加總當月支出金額，產出消費分布表。
4. 建立或更新新工作表，名稱格式為 `YYYY-MM 月報表`，例如 `2026-06 月報表`。
5. 寫入類別、金額、占比。
6. 使用 Google Apps Script Charts 服務在該工作表建立 Pie Chart。

Apps Script 的時間驅動觸發器沒有直接的「每月最後一天」選項，因此本專案提供每日檢查月底的方式。

設定方式：

```javascript
createMonthlyReportTrigger();
```

這會建立每天 23:00 執行的觸發器。`monthEndReportAutomation()` 會判斷當天是否為該月最後一天，只有最後一天才會執行：

```javascript
generateMonthlyReport(currentMonth_());
```

## 6. Skill 封裝

Skill 位於：

```text
skill/automate-monthly-expenses/
```

主要檔案：

- `SKILL.md`：技能使用流程與規範
- `agents/openai.yaml`：Agent UI metadata
- `openapi.yaml`：API 對接規格
- `skill.json`：結構化輸入與輸出描述
