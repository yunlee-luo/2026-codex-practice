const CONFIG = {
  EXPENSE_SHEET: 'Expenses',
  SETTINGS_SHEET: 'Settings',
  DEFAULT_CURRENCY: 'TWD',
  DEFAULT_HIGH_EXPENSE_THRESHOLD: 30000,
  TIMEZONE: Session.getScriptTimeZone() || 'Asia/Taipei'
};

const EXPENSE_HEADERS = [
  '日期',
  '月份(自動)',
  '類別',
  '金額',
  '手續費',
  '付款方式',
  '銀行/卡片名稱',
  '備註',
  '建立時間'
];

function doGet(e) {
  try {
    ensureWorkbook_();
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action || 'listExpenses';
    const month = params.month ? normalizeMonth_(params.month) : currentMonth_();
    const allExpenses = readAllExpenses_();
    const expenses = filterExpensesByMonth_(allExpenses, month);

    if (action === 'health') {
      return jsonResponse_({
        ok: true,
        data: { status: 'ok' },
        meta: responseMeta_()
      });
    }

    if (action === 'allExpenses') {
      return jsonResponse_({
        ok: true,
        data: allExpenses,
        meta: responseMeta_()
      });
    }

    if (action === 'rawExpenses') {
      return jsonResponse_(allExpenses);
    }

    if (action === 'listExpenses') {
      return jsonResponse_({
        ok: true,
        data: { month, expenses },
        meta: responseMeta_()
      });
    }

    if (action === 'monthlySummary') {
      return jsonResponse_({
        ok: true,
        data: buildMonthlySummaryFromExpenses_(month, expenses),
        meta: responseMeta_()
      });
    }

    return jsonResponse_({
      ok: false,
      error: { code: 'UNKNOWN_ACTION', message: 'Unsupported GET action: ' + action },
      meta: responseMeta_()
    });
  } catch (err) {
    return errorResponse_(err);
  }
}

function doPost(e) {
  try {
    ensureWorkbook_();
    const payload = parsePostBody_(e);
    const action = payload.action || 'addExpense';

    if (action === 'addExpense') {
      const expense = addExpense_(payload.expense || payload);
      return jsonResponse_({
        ok: true,
        data: { expense },
        meta: responseMeta_()
      });
    }

    if (action === 'generateMonthlyReport') {
      const month = normalizeMonth_(payload.month || currentMonth_());
      const report = generateMonthlyReport(month);
      return jsonResponse_({
        ok: true,
        data: report,
        meta: responseMeta_()
      });
    }

    if (action === 'setup') {
      ensureWorkbook_();
      return jsonResponse_({
        ok: true,
        data: { message: 'Workbook initialized', sheets: [CONFIG.EXPENSE_SHEET, CONFIG.SETTINGS_SHEET] },
        meta: responseMeta_()
      });
    }

    return jsonResponse_({
      ok: false,
      error: { code: 'UNKNOWN_ACTION', message: 'Unsupported POST action: ' + action },
      meta: responseMeta_()
    });
  } catch (err) {
    return errorResponse_(err);
  }
}

function addExpense_(input) {
  const expense = normalizeExpense_(input);
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.EXPENSE_SHEET);
  const createdAt = nowIso_();
  const row = [
    expense.date,
    monthFromDate_(expense.date),
    expense.category,
    expense.amount,
    expense.fee,
    expense.paymentMethod,
    expense.bankCardName,
    expense.note,
    createdAt
  ];

  sheet.appendRow(row);
  SpreadsheetApp.flush();

  return rowToExpense_(row);
}

function normalizeExpense_(input) {
  if (!input || typeof input !== 'object') {
    throw apiError_('VALIDATION_ERROR', 'Expense payload is required.');
  }

  const date = normalizeDate_(input.date || today_());
  const category = String(input.category || '').trim();
  const amount = Number(input.amount);
  const fee = input.fee === '' || input.fee === undefined || input.fee === null ? '' : Number(input.fee);
  const paymentMethod = String(input.paymentMethod || '').trim();

  if (!date) throw apiError_('VALIDATION_ERROR', 'date must be YYYY-MM-DD.');
  if (!category) throw apiError_('VALIDATION_ERROR', 'category is required.');
  if (!Number.isFinite(amount) || amount <= 0) throw apiError_('VALIDATION_ERROR', 'amount must be a positive number.');
  if (fee !== '' && (!Number.isFinite(fee) || fee < 0)) throw apiError_('VALIDATION_ERROR', 'fee must be zero or a positive number.');
  if (!paymentMethod) throw apiError_('VALIDATION_ERROR', 'paymentMethod is required.');

  return {
    date,
    category,
    amount,
    fee,
    paymentMethod,
    bankCardName: String(input.bankCardName || '').trim(),
    note: String(input.note || '').trim()
  };
}

function readAllExpenses_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.EXPENSE_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const range = sheet.getRange(2, 1, lastRow - 1, EXPENSE_HEADERS.length);
  const rows = range.getValues();

  return rows
    .filter(function(row) {
      return row.some(function(cell) {
        return cell !== '' && cell !== null;
      });
    })
    .map(rowToExpense_);
}

function filterExpensesByMonth_(expenses, month) {
  return expenses.filter(function(expense) {
    const expenseMonth = expense.month || monthFromDate_(expense.date);
    return expenseMonth === month;
  });
}

function buildMonthlySummary_(month) {
  const expenses = filterExpensesByMonth_(readAllExpenses_(), month);
  return buildMonthlySummaryFromExpenses_(month, expenses);
}

function buildMonthlySummaryFromExpenses_(month, expenses) {
  const threshold = getHighExpenseThreshold_();
  const totalsByCategory = {};
  let total = 0;
  let highExpenseCount = 0;

  expenses.forEach(function(expense) {
    const amount = Number(expense.amount || 0);
    total += amount;
    totalsByCategory[expense.category] = (totalsByCategory[expense.category] || 0) + amount;
    if (amount >= threshold) highExpenseCount += 1;
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
    highExpenseThreshold: threshold,
    categories,
    updatedAt: nowIso_()
  };
}

function rowToExpense_(row) {
  const date = normalizeSheetDate_(row[0]);
  const month = String(row[1] || monthFromDate_(date));
  const amount = Number(row[3] || 0);
  const fee = row[4] === '' || row[4] === null ? '' : Number(row[4] || 0);

  return {
    date,
    month,
    category: String(row[2] || ''),
    amount,
    fee,
    paymentMethod: String(row[5] || ''),
    bankCardName: String(row[6] || ''),
    note: String(row[7] || ''),
    createdAt: normalizeSheetDateTime_(row[8]),
    isHighExpense: amount >= getHighExpenseThreshold_()
  };
}

function generateMonthlyReport(month) {
  ensureWorkbook_();
  const targetMonth = normalizeMonth_(month || currentMonth_());
  const summary = buildMonthlySummary_(targetMonth);
  const spreadsheet = SpreadsheetApp.getActive();
  const reportSheetName = targetMonth + ' 月報表';
  let reportSheet = spreadsheet.getSheetByName(reportSheetName);

  if (reportSheet) {
    reportSheet.clear();
    reportSheet.getCharts().forEach(function(chart) {
      reportSheet.removeChart(chart);
    });
  } else {
    reportSheet = spreadsheet.insertSheet(reportSheetName);
  }

  const rows = [
    ['月份', targetMonth],
    ['總支出', summary.total],
    ['紀錄筆數', summary.count],
    ['產生時間', summary.updatedAt],
    [],
    ['類別', '金額', '占比']
  ];

  summary.categories.forEach(function(item) {
    rows.push([item.category, item.total, item.percentage / 100]);
  });

  reportSheet.getRange(1, 1, rows.length, 3).setValues(rows);

  if (summary.categories.length > 0) {
    reportSheet.getRange(7, 2, summary.categories.length, 1).setNumberFormat('"NT$"#,##0');
    reportSheet.getRange(7, 3, summary.categories.length, 1).setNumberFormat('0.00%');

    const chartRange = reportSheet.getRange(6, 1, summary.categories.length + 1, 2);
    const chart = reportSheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(chartRange)
      .setPosition(2, 5, 0, 0)
      .setOption('title', targetMonth + ' 消費類別占比')
      .setOption('pieHole', 0.35)
      .build();
    reportSheet.insertChart(chart);
  }

  reportSheet.autoResizeColumns(1, 3);

  return {
    month: targetMonth,
    reportSheetName,
    total: summary.total,
    categories: summary.categories,
    updatedAt: summary.updatedAt
  };
}

function createMonthlyReportTrigger() {
  deleteExistingTriggers_('monthEndReportAutomation');
  ScriptApp.newTrigger('monthEndReportAutomation')
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();
}

function monthEndReportAutomation() {
  if (isLastDayOfMonth_(new Date())) {
    generateMonthlyReport(currentMonth_());
  }
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
    throw apiError_('INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(err) {
  return jsonResponse_({
    ok: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || String(err)
    },
    meta: responseMeta_()
  });
}

function apiError_(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function normalizeDate_(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeSheetDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return text;
}

function normalizeSheetDateTime_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return String(value || '');
}

function normalizeMonth_(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(text)) {
    throw apiError_('VALIDATION_ERROR', 'month must be YYYY-MM.');
  }
  return text;
}

function monthFromDate_(date) {
  return String(date || '').slice(0, 7);
}

function today_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function currentMonth_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM');
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
    version: '1.2.0',
    generatedAt: nowIso_()
  };
}

function isLastDayOfMonth_(date) {
  const tomorrow = new Date(date.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

function deleteExistingTriggers_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
