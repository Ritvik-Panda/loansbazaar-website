const loginPanel = document.querySelector('#loginPanel');
const loginForm = document.querySelector('#loginForm');
const loginStatus = document.querySelector('#loginStatus');
const loginButton = document.querySelector('#loginButton');
const dashboard = document.querySelector('#dashboard');

const rows = document.querySelector('#rows');
const statusEl = document.querySelector('#status');
const search = document.querySelector('#search');
const typeFilter = document.querySelector('#typeFilter');

let records = [];

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.headers || {}),
      'Content-Type': 'application/json'
    }
  });

  let data = {};
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    if (res.status === 401 && path === '/api/admin/enquiries') {
      showLogin('Your admin session has expired. Please log in again.');
    }
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function showLogin(message = '') {
  dashboard.style.display = 'none';
  loginPanel.style.display = 'block';
  loginStatus.textContent = message;
}

function showDashboard() {
  loginPanel.style.display = 'none';
  dashboard.style.display = 'block';
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginStatus.textContent = 'Signing in…';

  try {
    const username = document.querySelector('#username').value.trim();
    const password = document.querySelector('#password').value;

    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    loginForm.reset();
    showDashboard();
    await load();
  } catch (error) {
    loginStatus.textContent = error.message;
  } finally {
    loginButton.disabled = false;
  }
});

document.querySelector('#logout').addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST', body: '{}' });
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    records = [];
    rows.innerHTML = '';
    showLogin('You have been logged out.');
  }
});

document.querySelector('#refresh').addEventListener('click', load);
search.addEventListener('input', render);
typeFilter.addEventListener('change', render);

document.querySelector('#export').addEventListener('click', () => {
  const filtered = getFiltered();
  const head = [
    'ID', 'Date', 'Type', 'Service', 'Name',
    'Age', 'Mobile', 'Email', 'Message'
  ];

  const csv = [head, ...filtered.map(r => [
    r.id, r.created_at, r.type, r.service, r.name,
    r.age, r.mobile, r.email, r.message
  ])]
    .map(row => row.map(csvCell).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'loansbazaar-enquiries.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function csvCell(value) {
  return '"' + String(value ?? '').replaceAll('"', '""') + '"';
}

function getFiltered() {
  const q = search.value.trim().toLowerCase();
  const type = typeFilter.value;

  return records.filter(r =>
    (!type || r.type === type) &&
    (!q || [
      r.name, r.mobile, r.email, r.service, r.message
    ].some(value => String(value || '').toLowerCase().includes(q)))
  );
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function render() {
  const data = getFiltered();

  rows.innerHTML = data.length
    ? data.map(r => `<tr>
        <td>${esc(r.id)}</td>
        <td>${esc(r.created_at)}</td>
        <td>${esc(r.type)}</td>
        <td>${esc(r.service)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.age)}</td>
        <td>${esc(r.mobile)}</td>
        <td>${esc(r.email)}</td>
        <td>${esc(r.message || '')}</td>
      </tr>`).join('')
    : '<tr><td colspan="9" class="empty">No enquiries found.</td></tr>';

  statusEl.textContent = `Showing ${data.length} of ${records.length} enquiries`;
}

async function load() {
  statusEl.textContent = 'Loading enquiries…';

  try {
    const data = await api('/api/admin/enquiries');
    records = data.enquiries || [];

    const stats = data.stats || {};
    document.querySelector('#total').textContent = stats.total ?? 0;
    document.querySelector('#customers').textContent = stats.customers ?? 0;
    document.querySelector('#partners').textContent = stats.partners ?? 0;
    document.querySelector('#today').textContent = stats.today ?? 0;

    showDashboard();
    render();
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

// Check whether an existing admin session is valid.
async function init() {
  try {
    await load();

    if (dashboard.style.display !== 'block') {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

init();
