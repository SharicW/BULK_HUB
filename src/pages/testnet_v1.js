import { createEl } from '../utils/dom.js';
import { getBulkTestnetLatest, getBulkTestnetSummary } from '../api.js';

export async function renderTestnet(target) {
  target.innerHTML = '';

  const shell = createEl('div', { class: 'page-shell' });

  const header = createEl('div', { class: 'page-header' }, [
    createEl('span', { class: 'eyebrow' }, 'Markets'),
    createEl('h1', {}, 'Testnet')
  ]);

  shell.appendChild(header);

  const summaryGrid = createEl('div', { class: 'card-grid' });
  const cards = {
    markets: summaryCard('Active Markets'),
    volume: summaryCard('24h Volume'),
    oi: summaryCard('Open Interest'),
    funding: summaryCard('Avg Funding'),
  };

  Object.values(cards).forEach(c => summaryGrid.appendChild(c.card));
  shell.appendChild(summaryGrid);

  shell.appendChild(createEl('hr', { class: 'divider' }));

  const tableCard = createEl('div', { class: 'card' });
  const table = createEl('table', { class: 'testnet-table' });

  table.appendChild(createEl('thead', {}, [
    createEl('tr', {}, [
      createEl('th', {}, 'Market'),
      createEl('th', {}, 'Price'),
      createEl('th', {}, '24h Vol'),
      createEl('th', {}, 'Δ'),
    ])
  ]));

  const tbody = createEl('tbody');
  table.appendChild(tbody);
  tableCard.appendChild(table);
  shell.appendChild(tableCard);

  target.appendChild(shell);

  try {
    const [summary, markets] = await Promise.all([
      getBulkTestnetSummary(),
      getBulkTestnetLatest()
    ]);

    cards.volume.setValue(`$${(summary.total_volume / 1e6).toFixed(1)}M`);
    cards.oi.setValue(`$${(summary.total_oi / 1e3).toFixed(0)}K`);
    cards.funding.setValue(`${summary.avg_funding > 0 ? '+' : ''}${summary.avg_funding.toFixed(4)}%`);
    cards.markets.setValue(summary.active_markets);
    cards.markets.value.textContent = summary.active_markets ?? '–';
    cards.volume.value.textContent = formatUsd(summary.total_volume);
    cards.oi.value.textContent = formatUsd(summary.total_oi);
    cards.funding.value.textContent =
      (summary.avg_funding >= 0 ? '+' : '') +
      Number(summary.avg_funding).toFixed(3) + '%';

    markets.forEach(m => {
      const delta = m.funding || '0%';
      const positive = !delta.startsWith('-');

      tbody.appendChild(createEl('tr', {}, [
        createEl('td', {}, m.market),
        createEl('td', {}, m.oracle_price || '–'),
        createEl('td', {}, formatUsd(m.volume_24h)),
        createEl('td', {
          class: positive ? 'delta-positive' : 'delta-negative'
        }, (positive ? '+' : '') + delta.replace('+', ''))
      ]));
    });

  } catch (e) {
    tableCard.textContent = 'Failed to load testnet data';
  }
}

function summaryCard(label) {
  const value = createEl('div', { class: 'card-value' }, '–');
  const card = createEl('div', { class: 'card' }, [
    createEl('div', { class: 'card-title' }, label),
    value
  ]);
  return { card, value };
}

function formatUsd(v) {
  if (!v) return '–';
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}


