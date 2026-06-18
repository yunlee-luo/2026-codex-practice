---
name: automate-monthly-expenses
description: Build, deploy, and maintain a Google Sheets-backed monthly expense automation system with Google Apps Script API endpoints, a static web dashboard, month-end summaries, high-expense detection, and structured Skill/OpenAPI manifests. Use when asked to create or adapt an automated personal expense tracker using Google Sheets as the database.
---

# Monthly Expense Automation

Use this skill to create a reusable Google Sheets + Apps Script + static frontend expense tracker.

## Workflow

1. Create a Google Sheet and add the `Expenses` worksheet with these headers in this exact order:
   `日期,月份(自動),類別,金額,手續費,付款方式,銀行/卡片名稱,備註,建立時間`.
2. Add `Settings` with `key,value`, `defaultCurrency,TWD`, and `highExpenseThreshold,5000`.
3. Paste the Apps Script backend from `apps-script/Code.gs`, deploy it as a Web App, and use the deployment URL as the frontend API URL.
4. Configure the frontend `API_URL`, then deploy the root-level `index.html`, `styles.css`, and `app.js` to GitHub Pages, Netlify, Vercel, Cloudflare Pages, or another static host.
5. Run `createMonthlyReportTrigger()` once in Apps Script to install a daily trigger that only generates the monthly report on the last day of each month.
6. Validate API output shape against `openapi.yaml` before connecting another agent or platform.

## API Contract

All responses must use:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "version": "1.0.0",
    "generatedAt": "2026-06-18T10:00:00+08:00"
  }
}
```

Errors must use:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "amount must be a positive number."
  }
}
```

## Required Operations

- `GET ?action=monthlySummary&month=YYYY-MM`: Return total, category ratios, count, and high-expense count.
- `GET ?action=listExpenses&month=YYYY-MM`: Return normalized expense rows for one month.
- `POST { "action": "addExpense", "expense": {...} }`: Add one expense using `date`, `category`, `amount`, `fee`, `paymentMethod`, `bankCardName`, and `note`.
- `POST { "action": "generateMonthlyReport", "month": "YYYY-MM" }`: Generate or refresh the `YYYY-MM 月報表` sheet with category totals and a pie chart.

## Implementation Notes

- Keep Apps Script POST requests compatible with static browser clients by sending JSON as `text/plain;charset=utf-8`; this avoids unnecessary CORS preflight behavior.
- Treat Google Sheets as the source of truth. Do not keep separate local databases unless the user explicitly asks for one.
- Use deterministic month keys in `YYYY-MM` format.
- Generate `月份(自動)` from `日期` on the backend.
- Write `轉帳銀行` or `卡片名稱` into the shared `銀行/卡片名稱` sheet column via the API field `bankCardName`.
- Name monthly report worksheets as `YYYY-MM 月報表`.
