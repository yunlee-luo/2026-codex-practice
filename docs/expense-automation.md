# 每月支出自動整理

這個專案新增一套以 Google Sheets 作為資料庫的每月支出整理網站，包含：

- Google Apps Script Web App API
- 靜態前端網站
- 月底自動統計與高額支出標記
- 可重複部署的 Skill 模組與 OpenAPI 規格

## 1. Google Sheets 與 Apps Script

在 Google Sheets 建立試算表，新增 `Expenses` 工作表，第一列欄位如下：

```text
id,date,amount,currency,category,note,paymentMethod,vendor,month,isHighExpense,createdAt,updatedAt
```

另新增 `Settings` 工作表：

```text
key,value
defaultCurrency,TWD
highExpenseThreshold,5000
```

接著到「擴充功能」→「Apps Script」，貼上 `apps-script/Code.gs`，並可加入 `apps-script/appsscript.json` 的設定。

部署方式：

1. 在 Apps Script 執行 `setup` 或任一 API 前會自動初始化工作表。
2. 點「部署」→「新增部署作業」。
3. 類型選「網頁應用程式」。
4. 執行身分選「我」。
5. 存取權選「任何人」。
6. 複製 Web App URL。

## 2. 自動化觸發器

在 Apps Script 編輯器中執行一次：

```javascript
createMonthEndTrigger();
```

這會建立每月 1 日凌晨 1 點的時間驅動觸發器，自動整理前一個月份：

- 加總該月總支出
- 統計各類別金額與占比
- 依 `Settings.highExpenseThreshold` 標記高額支出
- 建立或更新 `Summary_YYYY-MM` 工作表

也可以手動測試：

```javascript
runMonthlyAutomation_("2026-06");
```

## 3. 前端網站

打開 `frontend/app.js`，把：

```javascript
const API_URL = 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';
```

替換成 Apps Script Web App URL。

前端是純靜態網站，可直接部署到 GitHub Pages。功能包含：

- 快速新增支出
- 本月總支出
- 高額支出數量
- 各類別占比
- 本月支出明細

## 4. API 格式

新增支出：

```json
{
  "action": "addExpense",
  "expense": {
    "date": "2026-06-18",
    "amount": 120,
    "currency": "TWD",
    "category": "餐飲",
    "note": "午餐",
    "paymentMethod": "信用卡",
    "vendor": "便當店"
  }
}
```

查詢月統計：

```text
GET /exec?action=monthlySummary&month=2026-06
```

標準回應：

```json
{
  "ok": true,
  "data": {
    "month": "2026-06",
    "total": 120,
    "currency": "TWD",
    "count": 1,
    "highExpenseCount": 0,
    "categories": [
      { "category": "餐飲", "total": 120, "percentage": 100 }
    ]
  },
  "meta": {
    "version": "1.0.0",
    "generatedAt": "2026-06-18T10:00:00+08:00"
  }
}
```

## 5. Skill 封裝

Skill 位於：

```text
skill/automate-monthly-expenses/
```

主要檔案：

- `SKILL.md`：技能使用流程與規範
- `agents/openai.yaml`：Agent UI metadata
- `openapi.yaml`：API 對接規格
- `skill.json`：結構化輸入與輸出描述

其他 Agent 或平台可讀取 `openapi.yaml` 串接 API，也可讀取 `SKILL.md` 了解部署流程。
