const API_URL = 'https://script.google.com/macros/s/AKfycbxq6nVaVZ74Loi4crbCkO5j8jg_gJYWfvYgI6ilJHxXGA_v7RP8fcZF-2lVEcp9GUzKuw/exec';

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
  lastUpdated: document.querySelector('#lastUpdated')
};

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  state.month = formatMonth(today);
  elements.monthInput.value = state.month;
  elements.expenseForm.elements.date.value = formatDate(today);

  elements.monthInput.addEventListener('change', () => {
    state.month = elements.monthInput.value;
    loadDashboard();
  });

  elements.refreshButton.addEventListener('click', loadDashboard);
  elements.expenseForm.addEventListener('submit', addExpense);

  loadDashboard();
});

async function loadDashboard() {
  try {
    assertConfigured();
    state.loading = true;
    setStatus('資料載入中...');
    elements.refreshButton.disabled = true;

    const month = encodeURIComponent(state.month);
    const [summaryResponse, expensesResponse] = await Promise.all([
      requestApi(`?action=monthlySummary&month=${month}`),
      requestApi(`?action=listExpenses&month=${month}`)
    ]);

    state.summary = summaryResponse.data;
    state.expenses = expensesResponse.data.expenses || [];
    renderDashboard();
    setStatus('');
  } catch (error) {
    showError(error.message || '資料載入失敗');
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
    const payload = {
      action: 'addExpense',
      expense: {
        date: form.get('date'),
        amount: Number(form.get('amount')),
        currency: 'TWD',
        category: form.get('category'),
        paymentMethod: form.get('paymentMethod'),
        vendor: form.get('vendor'),
        note: form.get('note')
      }
    };

    setStatus('新增中...');
    await requestApi('', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    elements.expenseForm.reset();
    elements.expenseForm.elements.date.value = formatDate(new Date());
    setStatus('已新增');
    await loadDashboard();
  } catch (error) {
    showError(error.message || '新增失敗');
  }
}

async function requestApi(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const json = await response.json();

  if (!response.ok || !json.ok) {
    const message = json.error?.message || `API 錯誤：${response.status}`;
    throw new Error(message);
  }

  return json;
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
  if (!categories.length) {
    elements.categoryBreakdown.innerHTML = '<p class="empty-state">這個月份還沒有支出資料</p>';
    return;
  }

  elements.categoryBreakdown.innerHTML = categories
    .slice()
    .sort((a, b) => b.total - a.total)
    .map(item => `
      <div class="category-item">
        <strong title="${escapeHtml(item.category)}">${escapeHtml(item.category)}</strong>
        <div class="bar-track" aria-hidden="true">
          <div class="bar-fill" style="width: ${Math.min(Number(item.percentage) || 0, 100)}%"></div>
        </div>
        <span class="category-total">${money.format(item.total || 0)} · ${item.percentage || 0}%</span>
      </div>
    `)
    .join('');
}

function renderRows(expenses) {
  if (!expenses.length) {
    elements.expenseRows.innerHTML = '<tr><td colspan="4" class="empty-state">尚無紀錄</td></tr>';
    return;
  }

  elements.expenseRows.innerHTML = expenses
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map(expense => `
      <tr class="${expense.isHighExpense ? 'high-expense' : ''}">
        <td>${escapeHtml(expense.date)}</td>
        <td>${escapeHtml(expense.category)}</td>
        <td class="amount">${money.format(expense.amount || 0)}</td>
        <td>${escapeHtml(expense.note || expense.vendor || '')}</td>
      </tr>
    `)
    .join('');
}

function setStatus(message) {
  elements.formStatus.textContent = message;
}

function showError(message) {
  setStatus(message);
  console.error(message);
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
    throw new Error('請先在 frontend/app.js 填入 Google Apps Script Web App URL');
  }
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
