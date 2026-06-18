const API_URL = 'https://script.google.com/macros/s/AKfycbxq6nVaVZ74Loi4crbCkO5j8jg_gJYWfvYgI6ilJHxXGA_v7RP8fcZF-2lVEcp9GUzKuw/exec';

const CATEGORY_EMOJIS = {
  '食品': '🍔',
  '交通': '🚗',
  '雜支': '🛒',
  '書籍': '📚',
  '用品': '🧻',
  '房租': '🏠',
  '水電': '⚡',
  '通信': '📱',
  '衣物': '👕',
  '學費': '🎓',
  '儲蓄': '💰',
  '娛樂': '🎵',
  '旅遊': '✈️',
  '其他': '✨'
};

const state = {
  month: '',
  summary: null,
  expenses: [],
  loading: false,
  editingRowId: null
};

const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0
});

const elements = {
  monthInput: document.querySelector('#monthInput'),
  totalAmount: document.querySelector('#totalAmount'),
  expenseCount: document.querySelector('#expenseCount'),
  highExpenseCount: document.querySelector('#highExpenseCount'),
  thresholdText: document.querySelector('#thresholdText'),
  categoryBreakdown: document.querySelector('#categoryBreakdown'),
  expenseRows: document.querySelector('#expenseRows'),
  expenseForm: document.querySelector('#expenseForm'),
  formStatus: document.querySelector('#formStatus'),
  refreshButton: document.querySelector('#refreshButton'),
  lastUpdated: document.querySelector('#lastUpdated'),
  categorySelect: document.querySelector('#categorySelect'),
  paymentMethodSelect: document.querySelector('#paymentMethodSelect'),
  transferFeeField: document.querySelector('#transferFeeField'),
  transferBankField: document.querySelector('#transferBankField'),
  cardNameField: document.querySelector('#cardNameField'),
  submitButton: document.querySelector('#submitButton'),
  cancelEditButton: document.querySelector('#cancelEditButton')
};

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  state.month = formatMonth(today);
  elements.monthInput.value = state.month;
  elements.expenseForm.elements.date.value = formatDate(today);

  renderCategoryOptions();
  updatePaymentFields();

  elements.monthInput.addEventListener('change', () => {
    state.month = elements.monthInput.value;
    loadDashboard();
  });

  elements.paymentMethodSelect.addEventListener('change', updatePaymentFields);
  elements.refreshButton.addEventListener('click', loadDashboard);
  elements.expenseForm.addEventListener('submit', addExpense);
  elements.cancelEditButton.addEventListener('click', resetFormMode);
  elements.expenseRows.addEventListener('click', handleRowAction);

  loadDashboard();
});

function renderCategoryOptions() {
  elements.categorySelect.innerHTML = '<option value="">選擇類別</option>';
  const options = Object.entries(CATEGORY_EMOJIS)
    .map(([category, emoji]) => `<option value="${escapeHtml(category)}">${emoji} ${escapeHtml(category)}</option>`)
    .join('');
  elements.categorySelect.insertAdjacentHTML('beforeend', options);
}

function updatePaymentFields() {
  const method = elements.paymentMethodSelect.value;
  const isTransfer = method === '轉帳';
  const isCreditCard = method === '信用卡';

  toggleField(elements.transferFeeField, isTransfer);
  toggleField(elements.transferBankField, isTransfer);
  toggleField(elements.cardNameField, isCreditCard);

  elements.expenseForm.elements.fee.required = false;
  elements.expenseForm.elements.transferBank.required = isTransfer;
  elements.expenseForm.elements.cardName.required = isCreditCard;

  if (!isTransfer) {
    elements.expenseForm.elements.fee.value = '';
    elements.expenseForm.elements.transferBank.value = '';
  }

  if (!isCreditCard) {
    elements.expenseForm.elements.cardName.value = '';
  }
}

function toggleField(field, shouldShow) {
  field.classList.toggle('is-hidden', !shouldShow);
}

function getExpenseFromForm() {
  const form = new FormData(elements.expenseForm);
  const paymentMethod = form.get('paymentMethod');
  const bankCardName = paymentMethod === '轉帳'
    ? form.get('transferBank')
    : paymentMethod === '信用卡'
      ? form.get('cardName')
      : '';

  return {
    date: form.get('date'),
    category: form.get('category'),
    amount: Number(form.get('amount')),
    fee: form.get('fee') ? Number(form.get('fee')) : '',
    paymentMethod,
    bankCardName,
    note: form.get('note') || ''
  };
}

function enterEditMode(expense) {
  state.editingRowId = Number(expense.rowId);
  elements.expenseForm.elements.date.value = expense.date || '';
  elements.expenseForm.elements.category.value = expense.category || '';
  elements.expenseForm.elements.amount.value = expense.amount || '';
  elements.expenseForm.elements.paymentMethod.value = expense.paymentMethod || '';
  elements.expenseForm.elements.note.value = expense.note || '';

  updatePaymentFields();

  if (expense.paymentMethod === '轉帳') {
    elements.expenseForm.elements.fee.value = expense.fee || '';
    elements.expenseForm.elements.transferBank.value = expense.bankCardName || '';
  }

  if (expense.paymentMethod === '信用卡') {
    elements.expenseForm.elements.cardName.value = expense.bankCardName || '';
  }

  elements.submitButton.textContent = '儲存修改';
  elements.cancelEditButton.classList.remove('is-hidden');
  setStatus(`正在編輯第 ${expense.rowId} 列`);
  elements.expenseForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetFormMode() {
  state.editingRowId = null;
  elements.expenseForm.reset();
  elements.expenseForm.elements.date.value = formatDate(new Date());
  updatePaymentFields();
  elements.submitButton.textContent = '加入支出';
  elements.cancelEditButton.classList.add('is-hidden');
}

async function loadDashboard() {
  try {
    assertConfigured();
    state.loading = true;
    setStatus('資料載入中...');
    elements.refreshButton.disabled = true;

    const dashboardData = await fetchDashboardData(state.month);
    applyDashboardData(dashboardData);
    setStatus('');
    return dashboardData;
  } catch (error) {
    console.error('[ExpenseApp] loadDashboard failed:', error);
    showError(error.message || '資料載入失敗');
    return null;
  } finally {
    state.loading = false;
    elements.refreshButton.disabled = false;
  }
}

async function addExpense(event) {
  event.preventDefault();

  try {
    assertConfigured();
    const expense = getExpenseFromForm();
    const wasEditing = Boolean(state.editingRowId);
    const payload = {
      action: wasEditing ? 'updateExpense' : 'addExpense',
      expense
    };

    if (wasEditing) {
      payload.rowId = state.editingRowId;
    }

    console.log('[ExpenseApp] POST save expense payload:', payload);
    setStatus(wasEditing ? '儲存修改中...' : '新增中...');

    const postResponse = await requestApi('', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    console.log('[ExpenseApp] POST save expense success response:', postResponse);

    state.month = String(expense.date).slice(0, 7);
    elements.monthInput.value = state.month;
    resetFormMode();

    setStatus('已寫入，正在更新畫面...');
    await refreshUntilExpenseVisible(postResponse.data?.expense || expense);
    setStatus(wasEditing ? '已儲存並更新畫面' : '已新增並更新畫面');
  } catch (error) {
    console.error('[ExpenseApp] addExpense failed:', error);
    showError(error.message || '儲存失敗');
  }
}

async function handleRowAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const rowId = Number(button.dataset.rowId);
  const expense = state.expenses.find(item => Number(item.rowId) === rowId);
  if (!expense) {
    showError('找不到這筆資料，請重新整理後再試。');
    return;
  }

  if (button.dataset.action === 'edit') {
    enterEditMode(expense);
    return;
  }

  if (button.dataset.action === 'delete') {
    await deleteExpense(expense);
  }
}

async function deleteExpense(expense) {
  const confirmed = window.confirm(`確定要刪除 ${expense.date} 的 ${formatCategory(expense.category)} ${money.format(expense.amount || 0)} 嗎？`);
  if (!confirmed) return;

  try {
    const payload = {
      action: 'deleteExpense',
      rowId: expense.rowId
    };
    console.log('[ExpenseApp] POST deleteExpense payload:', payload);
    setStatus('刪除中...');

    const response = await requestApi('', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    console.log('[ExpenseApp] POST deleteExpense success response:', response);

    if (state.editingRowId === expense.rowId) {
      resetFormMode();
    }
    await loadDashboard();
    setStatus('已刪除並更新畫面');
  } catch (error) {
    console.error('[ExpenseApp] deleteExpense failed:', error);
    showError(error.message || '刪除失敗');
  }
}

async function refreshUntilExpenseVisible(expectedExpense) {
  const maxAttempts = 5;
  const waitMs = 700;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`[ExpenseApp] Refresh attempt ${attempt}/${maxAttempts}`, {
      month: state.month,
      expectedExpense
    });

    const dashboardData = await fetchDashboardData(state.month);
    applyDashboardData(dashboardData);

    if (!expectedExpense || hasMatchingExpense(dashboardData.expenses, expectedExpense)) {
      console.log('[ExpenseApp] Latest expense is visible after refresh:', {
        attempt,
        expenses: dashboardData.expenses
      });
      return true;
    }

    await delay(waitMs);
  }

  console.warn('[ExpenseApp] Latest expense was not found after retries. Rendered the newest data returned by API.');
  return false;
}

async function fetchDashboardData(month) {
  const encodedMonth = encodeURIComponent(month);
  const expensesPath = addCacheBust(`?action=listExpenses&month=${encodedMonth}`);

  console.log('[ExpenseApp] GET dashboard request paths:', {
    expensesPath
  });

  const expensesResponse = await requestApi(expensesPath);
  console.log('[ExpenseApp] GET listExpenses full JSON data:', expensesResponse);

  const expenses = normalizeExpensesResponse(expensesResponse);
  const highExpenseThreshold = Number(expensesResponse.data?.highExpenseThreshold || 0);
  const summary = buildClientSummary(month, expenses, expensesResponse.meta?.generatedAt, highExpenseThreshold);

  console.log('[ExpenseApp] Parsed expenses array:', expenses);
  console.log('[ExpenseApp] Client-side summary:', summary);

  return {
    summary,
    expenses
  };
}

function normalizeExpensesResponse(responseJson) {
  if (Array.isArray(responseJson)) return responseJson;
  if (Array.isArray(responseJson.data)) return responseJson.data;
  if (Array.isArray(responseJson.data?.expenses)) return responseJson.data.expenses;
  console.warn('[ExpenseApp] Unknown expenses response shape:', responseJson);
  return [];
}

function buildClientSummary(month, expenses, generatedAt, highExpenseThreshold) {
  const totalsByCategory = {};
  let total = 0;
  let highExpenseCount = 0;
  const threshold = Number(highExpenseThreshold || 0);

  expenses.forEach(expense => {
    const amount = Number(expense.amount || 0);
    total += amount;
    totalsByCategory[expense.category] = (totalsByCategory[expense.category] || 0) + amount;
    if (expense.isHighExpense === true || (threshold > 0 && amount >= threshold)) highExpenseCount += 1;
  });

  const categories = Object.entries(totalsByCategory)
    .sort(([a], [b]) => a.localeCompare(b, 'zh-Hant'))
    .map(([category, categoryTotal]) => ({
      category,
      total: categoryTotal,
      percentage: total ? Math.round((categoryTotal / total) * 10000) / 100 : 0
    }));

  return {
    month,
    total,
    currency: 'TWD',
    count: expenses.length,
    highExpenseCount,
    highExpenseThreshold: threshold,
    categories,
    updatedAt: generatedAt || new Date().toISOString()
  };
}

function applyDashboardData({ summary, expenses }) {
  state.summary = summary;
  state.expenses = expenses;
  renderDashboard();
}

async function requestApi(path, options = {}) {
  const url = `${API_URL}${path}`;
  console.log('[ExpenseApp] Fetch start:', {
    url,
    method: options.method || 'GET'
  });

  const response = await fetch(url, {
    cache: 'no-store',
    ...options
  });

  const json = await response.json();
  console.log('[ExpenseApp] Raw JSON data:', json);
  console.log('[ExpenseApp] Fetch response:', {
    url,
    status: response.status,
    ok: response.ok,
    json
  });

  if (!response.ok || json.ok === false) {
    const message = json.error?.message || `API 錯誤：${response.status}`;
    throw new Error(message);
  }

  return json;
}

function addCacheBust(path) {
  const separator = path.includes('?') ? '&' : '?';
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${path}${separator}t=${encodeURIComponent(nonce)}`;
}

function renderDashboard() {
  const summary = state.summary || emptySummary();
  elements.totalAmount.textContent = money.format(summary.total || 0);
  elements.expenseCount.textContent = `${summary.count || 0} 筆紀錄`;
  elements.highExpenseCount.textContent = String(summary.highExpenseCount || 0);
  elements.thresholdText.textContent = `門檻 ${money.format(summary.highExpenseThreshold || 0)}`;
  elements.lastUpdated.textContent = summary.updatedAt ? `更新 ${formatTaipeiDateTime(summary.updatedAt)}` : '';

  renderCategories(summary.categories || []);
  renderRows(state.expenses || []);
}

function renderCategories(categories) {
  elements.categoryBreakdown.innerHTML = '';

  if (!categories.length) {
    elements.categoryBreakdown.innerHTML = '<p class="empty-state">這個月份還沒有支出資料</p>';
    return;
  }

  elements.categoryBreakdown.innerHTML = categories
    .slice()
    .sort((a, b) => b.total - a.total)
    .map(item => {
      const label = formatCategory(item.category);
      const percentage = Math.min(Number(item.percentage) || 0, 100);
      return `
        <div class="category-item">
          <strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill" style="width: ${percentage}%"></div>
          </div>
          <span class="category-total">${money.format(item.total || 0)} · ${item.percentage || 0}%</span>
        </div>
      `;
    })
    .join('');
}

function renderRows(expenses) {
  elements.expenseRows.innerHTML = '';

  if (!expenses.length) {
    elements.expenseRows.innerHTML = '<tr><td colspan="7" class="empty-state">尚無紀錄</td></tr>';
    return;
  }

  elements.expenseRows.innerHTML = expenses
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map(expense => `
      <tr class="${expense.isHighExpense ? 'high-expense' : ''}">
        <td>${escapeHtml(expense.date)}</td>
        <td>${escapeHtml(formatCategory(expense.category))}</td>
        <td class="amount">${money.format(expense.amount || 0)}</td>
        <td>${escapeHtml(expense.paymentMethod || '')}</td>
        <td>${escapeHtml(expense.bankCardName || '')}</td>
        <td>${escapeHtml(expense.note || '')}</td>
        <td>
          <div class="row-actions">
            <button class="row-action" type="button" data-action="edit" data-row-id="${escapeHtml(expense.rowId)}">編輯</button>
            <button class="row-action danger" type="button" data-action="delete" data-row-id="${escapeHtml(expense.rowId)}">刪除</button>
          </div>
        </td>
      </tr>
    `)
    .join('');
}

function hasMatchingExpense(expenses, expectedExpense) {
  return expenses.some(expense => (
    String(expense.date || '') === String(expectedExpense.date || '') &&
    String(expense.category || '') === String(expectedExpense.category || '') &&
    Number(expense.amount || 0) === Number(expectedExpense.amount || 0) &&
    String(expense.paymentMethod || '') === String(expectedExpense.paymentMethod || '') &&
    String(expense.bankCardName || '') === String(expectedExpense.bankCardName || '') &&
    String(expense.note || '') === String(expectedExpense.note || '')
  ));
}

function setStatus(message) {
  elements.formStatus.textContent = message;
}

function showError(message) {
  setStatus(message);
  console.error('[ExpenseApp]', message);
}

function emptySummary() {
  return {
    month: state.month,
    total: 0,
    count: 0,
    highExpenseCount: 0,
    highExpenseThreshold: 0,
    categories: []
  };
}

function assertConfigured() {
  if (!API_URL || API_URL.includes('PASTE_YOUR')) {
    throw new Error('請先在 app.js 填入 Google Apps Script Web App URL');
  }
}

function formatCategory(category) {
  return CATEGORY_EMOJIS[category] ? `${CATEGORY_EMOJIS[category]} ${category}` : category;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatTaipeiDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return String(value || '');

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

function delay(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
