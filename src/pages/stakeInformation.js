import { createEl } from '../utils/dom.js';
import { getLatestSanctum, getLatestSolscan } from '../api.js';

function safeText(v, fallback = '—') {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}

function shortAddr(a) {
  if (!a) return '';
  const s = String(a);
  return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function formatTxDetail(tx) {
  const action = safeText(tx.action, 'TRANSFER');
  const fromA = shortAddr(tx.from_address);
  const toA = shortAddr(tx.to_address);
  if (fromA && toA) return `${action}: ${fromA} → ${toA}`;
  return action;
}

function formatTxAmount(tx) {
  const token = safeText(tx.token, 'BULK');
  const amt = tx.amount;
  if (amt === null || amt === undefined) return `— ${token}`;
  return `${amt} ${token}`;
}

function formatTxTime(tx) {
  // time у тебя TEXT, просто показываем как есть
  return safeText(tx.time, '—');
}

export function renderStakeInformation(target) {
  target.innerHTML = '';
  const wrapper = createEl('div', { className: 'page-shell' });

  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Stake</p>
        <h1>Stake Information</h1>
        <p class="muted">Live data from Sanctum + Solscan</p>
      </div>
    </div>

    <section class="stake-tabs">
      <article class="stake-tab" data-bind-metric="total_staked">
        <p class="stake-tab__label">Total staked</p>
        <p class="stake-tab__value" data-bind-value>—</p>
        <p class="stake-tab__description">BulkSOL locked</p>
      </article>

      <article class="stake-tab" data-bind-metric="bulk_to_sol">
        <p class="stake-tab__label">1 BulkSOL =</p>
        <p class="stake-tab__value" data-bind-value>—</p>
        <p class="stake-tab__description">SOL equivalent</p>
      </article>

      <article class="stake-tab" data-bind-metric="total_holders">
        <p class="stake-tab__label">Total holders</p>
        <p class="stake-tab__value" data-bind-value>—</p>
        <p class="stake-tab__description">Wallets holding BulkSOL</p>
      </article>
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
        ${Array.from({ length: 10 }).map(() => `
          <li class="stake-transaction">
            <span class="stake-transaction__time">—</span>
            <span class="stake-transaction__detail">Loading…</span>
            <span class="stake-transaction__amount">—</span>
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

  async function loadStake() {
    statusEl.textContent = 'Loading…';

    const [sanctum, solscan] = await Promise.all([
      getLatestSanctum(),
      getLatestSolscan(10),
    ]);

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
      await loadStake();
    } catch (e) {
      console.error(e);
      statusEl.textContent = 'Failed to fetch (backend 502 / CORS)';
    }
  }

  refreshBtn.addEventListener('click', handleRefresh);
  handleRefresh();

  return () => refreshBtn.removeEventListener('click', handleRefresh);
}
