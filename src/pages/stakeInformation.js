import { createEl } from '../utils/dom.js';
import { getLatestSanctum, getLatestSolscan } from '../api/api.js';

function safeText(v, fallback = '—') {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}

function formatTxDetail(tx) {
  const action = safeText(tx.action, 'TRANSFER');
  const fromAddr = safeText(tx.from_address, '');
  const toAddr = safeText(tx.to_address, '');

  const short = (a) => (a && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
  const fromS = short(fromAddr);
  const toS = short(toAddr);

  if (fromS && toS) return `${action}: ${fromS} → ${toS}`;
  return action;
}

function formatTxAmount(tx) {
  const amt = tx.amount ?? null;
  const token = safeText(tx.token, 'BULK');

  if (amt === null || amt === undefined) return `— ${token}`;
  return `${amt} ${token}`;
}

function formatTxTime(tx) {
  // time у тебя хранится TEXT: может быть ISO, может быть “2 minutes ago”, поэтому просто покажем как есть
  return safeText(tx.time, '—');
}

export function renderStakeInformation(target) {
  target.innerHTML = '';
  const wrapper = createEl('div', { className: 'page-shell' });

  const tabs = [
    { key: 'total_staked', title: 'Total staked', description: 'BulkSOL locked' },
    { key: 'bulk_to_sol', title: '1 BulkSOL =', description: 'SOL equivalent' },
    { key: 'total_holders', title: 'Total holders', description: 'Wallets holding BulkSOL' },
  ];

  const mockTransactions = Array.from({ length: 10 }, (_, idx) => ({
    id: `tx-${idx + 1}`,
    time: '--:--',
    detail: 'Loading…',
    amount: '—',
  }));

  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Stake</p>
        <h1>Stake Information</h1>
        <p class="muted">Live data from Sanctum + Solscan</p>
      </div>
    </div>

    <section class="stake-tabs">
      ${tabs.map((tab) => `
        <article class="stake-tab" data-bind-metric="${tab.key}">
          <p class="stake-tab__label">${tab.title}</p>
          <p class="stake-tab__value" data-bind-value>—</p>
          <p class="stake-tab__description">${tab.description}</p>
        </article>
      `).join('')}
    </section>

    <section class="stake-transactions">
      <div class="stake-transactions__header">
        <div>
          <p class="eyebrow">Activity</p>
          <h2>10 recent transactions</h2>
          <p class="muted" data-bind-status>Loading…</p>
        </div>
        <button type="button" class="btn-secondary stake-transactions__refresh" aria-label="Refresh transactions">
          Refresh
        </button>
      </div>

      <ul class="stake-transactions__list" data-bind-transactions>
        ${mockTransactions.map((tx) => `
          <li class="stake-transaction" data-transaction-id="${tx.id}">
            <span class="stake-transaction__time">${tx.time}</span>
            <span class="stake-transaction__detail">${tx.detail}</span>
            <span class="stake-transaction__amount">${tx.amount}</span>
          </li>
        `).join('')}
      </ul>
    </section>
  `;

  target.appendChild(wrapper);

  const refreshBtn = wrapper.querySelector('.stake-transactions__refresh');
  const statusEl = wrapper.querySelector('[data-bind-status]');
  const listEl = wrapper.querySelector('[data-bind-transactions]');

  function setMetric(key, value) {
    const card = wrapper.querySelector(`[data-bind-metric="${key}"]`);
    if (!card) return;
    const valueEl = card.querySelector('[data-bind-value]');
    if (valueEl) valueEl.textContent = safeText(value);
  }

  function renderTxList(txs) {
    const rows = Array.isArray(txs) ? txs : [];
    const slice = rows.slice(0, 10);

    if (!slice.length) {
      listEl.innerHTML = `
        <li class="stake-transaction">
          <span class="stake-transaction__time">—</span>
          <span class="stake-transaction__detail">No transactions found</span>
          <span class="stake-transaction__amount">—</span>
        </li>
      `;
      return;
    }

    listEl.innerHTML = slice.map((tx) => `
      <li class="stake-transaction" data-transaction-id="${safeText(tx.signature, '')}">
        <span class="stake-transaction__time">${formatTxTime(tx)}</span>
        <span class="stake-transaction__detail">${formatTxDetail(tx)}</span>
        <span class="stake-transaction__amount">${formatTxAmount(tx)}</span>
      </li>
    `).join('');
  }

  async function loadStakeData() {
    statusEl.textContent = 'Loading…';

    const [sanctum, solscan] = await Promise.all([
      getLatestSanctum(),
      getLatestSolscan(10),
    ]);

    // Если бек вернул {ok:false,...} — покажем в статусе
    if (sanctum && sanctum.ok === false) {
      statusEl.textContent = `Sanctum error: ${sanctum.status || ''}`;
    } else {
      setMetric('total_staked', sanctum?.total_staked);
      setMetric('bulk_to_sol', sanctum?.bulk_to_sol);
      setMetric('total_holders', sanctum?.total_holders);
      statusEl.textContent = 'Updated';
    }

    if (solscan && solscan.ok === false) {
      statusEl.textContent = `Solscan error: ${solscan.status || ''}`;
      renderTxList([]);
    } else {
      renderTxList(solscan);
    }
  }

  async function handleRefresh() {
    try {
      await loadStakeData();
    } catch (e) {
      console.error(e);
      statusEl.textContent = 'Failed to fetch (check backend 502/CORS)';
    }
  }

  refreshBtn.addEventListener('click', handleRefresh);

  // авто-загрузка при заходе на страницу
  handleRefresh();

  return () => {
    refreshBtn.removeEventListener('click', handleRefresh);
  };
}
