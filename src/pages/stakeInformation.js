import { createEl } from '../utils/dom.js';

export function renderStakeInformation(target) {
  target.innerHTML = '';
  const wrapper = createEl('div', { className: 'page-shell' });
  const tabs = [
    { title: 'Total staked', value: '0', description: 'BulkSOL locked' },
    { title: '1 BulkSOL =', value: '0', description: 'USD equivalent' },
    { title: 'Total holders', value: '0', description: 'Wallets holding BulkSOL' },
  ];
  const mockTransactions = Array.from({ length: 10 }, (_, idx) => ({
    id: `tx-${idx + 1}`,
    time: '--:--',
    detail: 'Pending transaction data',
    amount: '0 BulkSOL',
  }));

  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Stake</p>
        <h1>Stake Information</h1>
        <p class="muted">Holdings, pools, and yields will appear here</p>
      </div>
    </div>
    <section class="stake-tabs">
      ${tabs
        .map(
          (tab) => `
            <article class="stake-tab" data-bind-metric="${tab.title}">
              <p class="stake-tab__label">${tab.title}</p>
              <p class="stake-tab__value" data-bind-value="0">${tab.value}</p>
              <p class="stake-tab__description">${tab.description}</p>
            </article>
          `,
        )
        .join('')}
    </section>
    <section class="stake-transactions">
      <div class="stake-transactions__header">
        <div>
          <p class="eyebrow">Activity</p>
          <h2>10 recent transactions</h2>
          <p class="muted">Fetched dynamically from the network</p>
        </div>
        <button type="button" class="btn-secondary stake-transactions__refresh" aria-label="Refresh transactions">
          Refresh
        </button>
      </div>
      <ul class="stake-transactions__list" data-bind-transactions>
        ${mockTransactions
          .map(
            (tx) => `
              <li class="stake-transaction" data-transaction-id="${tx.id}">
                <span class="stake-transaction__time">${tx.time}</span>
                <span class="stake-transaction__detail">${tx.detail}</span>
                <span class="stake-transaction__amount">${tx.amount}</span>
              </li>
            `,
          )
          .join('')}
      </ul>
    </section>
  `;
  target.appendChild(wrapper);

  const refreshBtn = wrapper.querySelector('.stake-transactions__refresh');
  function handleRefresh() {
    console.log('Refresh requested for stake transactions');
    // TODO: trigger data refresh from the backend
  }
  refreshBtn.addEventListener('click', handleRefresh);

  return () => {
    refreshBtn.removeEventListener('click', handleRefresh);
  };
}

