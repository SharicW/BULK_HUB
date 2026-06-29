import { createEl } from '../utils/dom.js';
import { getBulkTestnetLatest, getBulkTestnetSummary } from '../api.js';

function summaryCard(label) {
  const card = createEl('div', { className: 'card' });

  const title = createEl('div', { className: 'card-title', html: label });
  const value = createEl('div', { className: 'card-value', html: '—' });

  card.append(title, value);
  return { card, value };
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;

    // handle values like "$1,234.56", "1,234.56", "0.0012%", "+0.0012%"
    const cleaned = s
      .replace(/[$,%]/g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, '');

    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  return null;
}

function formatUsd(value) {
  const n = toNumber(value);
  if (n === null) return '—';

  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPrice(value) {
  const n = toNumber(value);
  if (n === null) return (value ?? '—').toString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFundingPct(value) {
  // stored as percent points, e.g. 0.0008 (meaning 0.0008%)
  const n = toNumber(value);
  if (n === null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(4)}%`;
}

function renderRow(market) {
  const tr = createEl('tr');

  const marketName = (market.market ?? '—').toString();
  const price = formatPrice(market.oracle_price);
  const vol = formatUsd(market.volume_24h);

  // For Δ we show funding (closest proxy we have in this dataset)
  const fundingNum = toNumber(market.funding);
  const fundingText = fundingNum === null ? (market.funding ?? '—').toString() : formatFundingPct(fundingNum);
  const deltaClass = fundingNum === null ? '' : (fundingNum >= 0 ? 'delta-positive' : 'delta-negative');

  const tdMarket = createEl('td', { html: marketName });
  const tdPrice = createEl('td', { html: price });
  const tdVol = createEl('td', { html: vol });
  const tdDelta = createEl('td', { className: deltaClass, html: fundingText });

  tr.append(tdMarket, tdPrice, tdVol, tdDelta);
  return tr;
}

export async function renderTestnet(target) {
  if (!target) return;

  target.innerHTML = '';

  const shell = createEl('div', { className: 'page-shell' });

  const header = createEl('div', { className: 'page-header' });
  header.append(
    createEl('span', { className: 'eyebrow', html: 'Markets' }),
    createEl('h1', { html: 'Testnet' }),
  );
  shell.appendChild(header);

  const summaryGrid = createEl('div', { className: 'card-grid' });
  const cards = {
    markets: summaryCard('Active Markets'),
    volume: summaryCard('24h Volume'),
    oi: summaryCard('Open Interest'),
    funding: summaryCard('Avg Funding'),
  };
  Object.values(cards).forEach(({ card }) => summaryGrid.appendChild(card));
  shell.appendChild(summaryGrid);

  shell.appendChild(createEl('hr', { className: 'divider' }));

  const tableCard = createEl('div', { className: 'card' });
  const table = createEl('table', { className: 'testnet-table' });

  const thead = createEl('thead');
  const headRow = createEl('tr');
  ['Market', 'Price', '24h Vol', 'Δ'].forEach((t) => headRow.appendChild(createEl('th', { html: t })));
  thead.appendChild(headRow);

  const tbody = createEl('tbody');

  table.append(thead, tbody);
  tableCard.appendChild(table);
  shell.appendChild(tableCard);

  shell.appendChild(createEl('hr', { className: 'divider' }));

  const joinBtn = createEl('a', {
    className: 'btn-primary',
    attrs: {
      href: 'https://early.bulk.trade/',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    html: 'Join the testnet',
  });
  shell.appendChild(joinBtn);

  target.appendChild(shell);

  let summary = null;
  try {
    summary = await getBulkTestnetSummary();
    cards.markets.value.textContent = String(summary?.active_markets ?? '—');
    cards.volume.value.textContent = formatUsd(summary?.total_volume);
    cards.oi.value.textContent = formatUsd(summary?.total_oi);
    cards.funding.value.textContent = formatFundingPct(summary?.avg_funding);
  } catch (e) {
    console.error('Failed to load testnet summary', e);
    // Keep placeholders — page still renders.
  }

  try {
    const markets = await getBulkTestnetLatest();

    tbody.innerHTML = '';
    if (Array.isArray(markets) && markets.length) {
      markets.forEach((m) => tbody.appendChild(renderRow(m)));
    } else {
      const empty = createEl('tr');
      const td = createEl('td', { attrs: { colspan: '4' }, html: 'No market data yet' });
      empty.appendChild(td);
      tbody.appendChild(empty);
    }
  } catch (e) {
    console.error('Failed to load testnet markets', e);
    tableCard.innerHTML = '<div class="card-muted">Failed to load testnet data</div>';
  }
}
