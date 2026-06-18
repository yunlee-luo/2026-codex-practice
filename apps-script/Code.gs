const CONFIG = {
  EXPENSE_SHEET: 'Expenses',
  SETTINGS_SHEET: 'Settings',
  SUMMARY_PREFIX: 'Summary_',
  DEFAULT_CURRENCY: 'TWD',
  DEFAULT_HIGH_EXPENSE_THRESHOLD: 5000,
  TIMEZONE: Session.getScriptTimeZone() || 'Asia/Taipei'
};

const EXPENSE_HEADERS = [
  'id',
  'date',
  'amount',
  'currency',
  'category',
  'note',
  'paymentMethod',
  'vendor',
  'month',
  'isHighExpense',
  'createdAt',
  'updatedAt'
];

function doGet(e) {
  return handleRequest_('GET', e);
}

function doPost(e) {
  return handleRequest_('POST', e);
}

function handleRequest_(method, e) {
  try {
    ensureWorkbook_();
    const payload = method === 'POST' ? parsePostBody_(e) : {};
    const params = Object.assign({}, e && e.parameter ? e.parameter : {}, payload);
    const action = params.action || (method === 'GET' ? 'monthlySummary' : 'addExpense');

    if (method === 'GET' && action === 'health') {
      return jsonResponse_({ ok: true, data: { status: 'ok' } });
    }

    if (method === 'GET' && action === 'listExpenses') {
      const month = normalizeMonth_(params.month || currentMonth_());
      return jsonResponse_({
        ok: true,
        data: { month, expenses: listExpenses_(month) },
        meta: responseMeta_()
      });
    }

    if (method === 'GET' && action === 'monthlySummary') {
      const month = normalizeMonth_(params.month || currentMonth_());
      return jsonResponse_({
        ok: true,
        data: buildMonthlySummary_(month),
        meta: responseMeta_()
      });
    }

    if (method === 'POST' && action === 'addExpense') {
      const expense = addExpense_(payload.expense || payload);
      return jsonResponse_({
        ok: true,
        data: { expense },
        meta: responseMeta_()
      });
    }

    if (method === 'POST' && action === 'runMonthlyAutomation') {
      const month = normalizeMonth_(params.month || previousMonth_());
      const summary = runMonthlyAutomation_(month);
      return jsonResponse_({
        ok: true,
        data: summary,
        meta: responseMeta_()
      });
    }

    if (method === 'POST' && action === 'setup') {
      ensureWorkbook_();
      return jsonResponse_({
        ok: true,
        data: { message: 'Workbook initialized', sheets: [CONFIG.EXPENSE_SHEET, CONFIG.SETTINGS_SHEET] },
        meta: responseMeta_()
      });
    }

    return jsonResponse_({ ok: false, error: { code: 'UNKNOWN_ACTION', message: 'Unsupported action: ' + action } }, 400);
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || String(err)
      },
      meta: responseMeta_()
    }, err.status || 500);
  }
}

function addExpense_(input) {
  const expense = normalizeExpense_(input);
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.EXPENSE_SHEET);
  const now = nowIso_();
  const row = [
    expense.id || Utilities.getUuid(),
    expense.date,
    expense.amount,
    expense.currency || CONFIG.DEFAULT_CURRENCY,
    expense.category,
    expense.note || '',
    expense.paymentMethod || '',
    expense.vendor || '',
    monthFromDate_(expense.date),
    expense.amount >= getHighExpenseThreshold_(),
    now,
    now
  ];
  sheet.appendRow(row);
  return rowToExpense_(row);
}

function normalizeExpense_(input) {
  if (!input || typeof input !== 'object') {
    throw apiError_('VALIDATION_ERROR', 'Expense payload is required.', 400);
  }

  const amount = Number(input.amount);
  const date = normalizeDate_(input.date || today_());
  const category = String(input.category || '').trim();

  if (!date) throw apiError_('VALIDATION_ERROR', 'date must be YYYY-MM-DD.', 400);
  if (!Number.isFinite(amount) || amount <= 0) throw apiError_('VALIDATION_ERROR', 'amount must be a positive number.', 400);
  if (!category) throw apiError_('VALIDATION_ERROR', 'category is required.', 400);

  return {
    id: input.id ? String(input.id) : '',
    date,
    amount,
    currency: String(input.currency || CONFIG.DEFAULT_CURRENCY).trim(),
    category,
    note: String(input.note || '').trim(),
    paymentMethod: String(input.paymentMethod || '').trim(),
    vendor: String(input.vendor || '').trim()
  };
}

function listExpenses_(month) {
  const rows = getExpenseRows_();
  return rows.map(rowToExpense_).filter(function(expense) {
    return expense.month === month;
  });
}

function buildMonthlySummary_(month) {
  const expenses = listExpenses_(month);
  const totalsByCategory = {};
  let total = 0;
  let highExpenseCount = 0;

  expenses.forEach(function(expense) {
    total += expense.amount;
    totalsByCategory[expense.category] = (totalsByCategory[expense.category] || 0) + expense.amount;
    if (expense.isHighExpense) highExpenseCount += 1;
  });

  const categories = Object.keys(totalsByCategory)
    .sort()
    .map(function(category) {
      const categoryTotal = totalsByCategory[category];
      return {
        category,
        total: roundMoney_(categoryTotal),
        percentage: total ? roundPercent_(categoryTotal / total) : 0
      };
    });

  return {
    month,
    total: roundMoney_(total),
    currency: CONFIG.DEFAULT_CURRENCY,
    count: expenses.length,
    highExpenseCount,
    highExpenseThreshold: getHighExpenseThreshold_(),
    categories,
    updatedAt: nowIso_()
  };
}

function runMonthlyAutomation_(month) {
  const summary = buildMonthlySummary_(month);
  writeSummarySheet_(summary);
  refreshHighExpenseFlags_();
  return summary;
}

function createMonthEndTrigger() {
  deleteExistingTriggers_('monthEndAutomation');
  ScriptApp.newTrigger('monthEndAutomation')
    .timeBased()
    .onMonthDay(1)
    .atHour(1)
    .create();
}

function monthEndAutomation() {
  runMonthlyAutomation_(previousMonth_());
}

function writeSummarySheet_(summary) {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheetName = CONFIG.SUMMARY_PREFIX + summary.month;
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  sheet.clear();

  const rows = [
    ['month', summary.month],
    ['total', summary.total],
    ['currency', summary.currency],
    ['expenseCount', summary.count],
    ['highExpenseThreshold', summary.highExpenseThreshold],
    ['highExpenseCount', summary.highExpenseCount],
    ['updatedAt', summary.updatedAt],
    [],
    ['category', 'total', 'percentage']
  ];

  summary.categories.forEach(function(item) {
    rows.push([item.category, item.total, item.percentage]);
  });

  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  sheet.autoResizeColumns(1, 3);
}

function refreshHighExpenseFlags_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.EXPENSE_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const amountColumn = EXPENSE_HEADERS.indexOf('amount') + 1;
  const highColumn = EXPENSE_HEADERS.indexOf('isHighExpense') + 1;
  const threshold = getHighExpenseThreshold_();
  const amounts = sheet.getRange(2, amountColumn, lastRow - 1, 1).getValues();
  const flags = amounts.map(function(row) {
    return [Number(row[0]) >= threshold];
  });
  sheet.getRange(2, highColumn, flags.length, 1).setValues(flags);
}

function ensureWorkbook_() {
  const spreadsheet = SpreadsheetApp.getActive();
  let expenseSheet = spreadsheet.getSheetByName(CONFIG.EXPENSE_SHEET);
  if (!expenseSheet) expenseSheet = spreadsheet.insertSheet(CONFIG.EXPENSE_SHEET);
  ensureHeaders_(expenseSheet, EXPENSE_HEADERS);

  let settingsSheet = spreadsheet.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!settingsSheet) settingsSheet = spreadsheet.insertSheet(CONFIG.SETTINGS_SHEET);
  if (settingsSheet.getLastRow() === 0) {
    settingsSheet.getRange(1, 1, 3, 2).setValues([
      ['key', 'value'],
      ['defaultCurrency', CONFIG.DEFAULT_CURRENCY],
      ['highExpenseThreshold', CONFIG.DEFAULT_HIGH_EXPENSE_THRESHOLD]
    ]);
  }
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = headers.some(function(header, index) {
    return current[index] !== header;
  });
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function getExpenseRows_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.EXPENSE_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, EXPENSE_HEADERS.length).getValues();
}

function rowToExpense_(row) {
  const expense = {};
  EXPENSE_HEADERS.forEach(function(header, index) {
    expense[header] = row[index];
  });
  expense.amount = Number(expense.amount || 0);
  expense.isHighExpense = expense.isHighExpense === true || expense.isHighExpense === 'TRUE';
  return expense;
}

function getHighExpenseThreshold_() {
  const settings = SpreadsheetApp.getActive().getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!settings || settings.getLastRow() < 2) return CONFIG.DEFAULT_HIGH_EXPENSE_THRESHOLD;
  const rows = settings.getRange(2, 1, settings.getLastRow() - 1, 2).getValues();
  const found = rows.find(function(row) {
    return row[0] === 'highExpenseThreshold';
  });
  const value = found ? Number(found[1]) : CONFIG.DEFAULT_HIGH_EXPENSE_THRESHOLD;
  return Number.isFinite(value) && value > 0 ? value : CONFIG.DEFAULT_HIGH_EXPENSE_THRESHOLD;
}

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw apiError_('INVALID_JSON', 'Request body must be valid JSON.', 400);
  }
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiError_(code, message, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function normalizeDate_(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeMonth_(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(text)) {
    throw apiError_('VALIDATION_ERROR', 'month must be YYYY-MM.', 400);
  }
  return text;
}

function monthFromDate_(date) {
  return String(date).slice(0, 7);
}

function today_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function currentMonth_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM');
}

function previousMonth_() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyy-MM');
}

function nowIso_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function roundMoney_(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundPercent_(value) {
  return Math.round(Number(value || 0) * 10000) / 100;
}

function responseMeta_() {
  return {
    version: '1.0.0',
    generatedAt: nowIso_()
  };
}

function deleteExistingTriggers_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
