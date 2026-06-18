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
  loading: false
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
  cardNameField: document.querySelector('#cardNameField')
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
    const form = new FormData(elements.expenseForm);
    const paymentMethod = form.get('paymentMethod');
    const bankCardName = paymentMethod === '轉帳'
      ? form.get('transferBank')
      : paymentMethod === '信用卡'
        ? form.get('cardName')
        : '';

    const expenseDate = form.get('date');
    const payload = {
      action: 'addExpense',
      expense: {
        date: expenseDate,
        category: form.get('category'),
        amount: Number(form.get('amount')),
        fee: form.get('fee') ? Number(form.get('fee')) : '',
        paymentMethod,
        bankCardName,
        note: form.get('note') || ''
      }
    };

    console.log('[ExpenseApp] POST addExpense payload:', payload);
    setStatus('新增中...');

    const postResponse = await requestApi('', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    console.log('[ExpenseApp] POST addExpense success response:', postResponse);

    state.month = String(expenseDate).slice(0, 7);
    elements.monthInput.value = state.month;
    elements.expenseForm.reset();
    elements.expenseForm.elements.date.value = formatDate(new Date());
    updatePaymentFields();

    setStatus('已寫入，正在更新畫面...');
    await refreshUntilExpenseVisible(postResponse.data?.expense || payload.expense);
    setStatus('已新增並更新畫面');
  } catch (error) {
    console.error('[ExpenseApp] addExpense failed:', error);
    showError(error.message || '新增失敗');
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
  const summaryPath = addCacheBust(`?action=monthlySummary&month=${encodedMonth}`);
  const expensesPath = addCacheBust(`?action=listExpenses&month=${encodedMonth}`);

  console.log('[ExpenseApp] GET dashboard request paths:', {
    summaryPath,
    expensesPath
  });

  const [summaryResponse, expensesResponse] = await Promise.all([
    requestApi(summaryPath),
    requestApi(expensesPath)
  ]);

  console.log('[ExpenseApp] GET monthlySummary JSON:', summaryResponse);
  console.log('[ExpenseApp] GET listExpenses JSON:', expensesResponse);

  return {
    summary: summaryResponse.data || emptySummary(),
    expenses: expensesResponse.data?.expenses || []
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
  console.log('[ExpenseApp] Fetch response:', {
    url,
    status: response.status,
    ok: response.ok,
    json
  });

  if (!response.ok || !json.ok) {
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
  elements.lastUpdated.textContent = summary.updatedAt ? `更新 ${summary.updatedAt}` : '';

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
    elements.expenseRows.innerHTML = '<tr><td colspan="6" class="empty-state">尚無紀錄</td></tr>';
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
