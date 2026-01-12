import { createEl } from '../utils/dom.js';
import { getTelegramTop, getDiscordTop, findTelegramUser, findDiscordUser } from '../api.js';

const membershipCounts = [
  { network: 'Discord', count: 0, key: 'discord' },
  { network: 'Telegram', count: 0, key: 'telegram' },
  { network: 'X', count: 0, key: 'x' },
];

function buildLeaderboard(board) {
  return `
    <article class="leaderboard-card">
      <div class="leaderboard-card__header">
        <div>
          <p class="leaderboard-card__network">${board.network}</p>
          <p class="muted">${board.metricLabel}</p>
        </div>
        <span class="leaderboard-card__badge">${board.entries.length} entries</span>
      </div>
      <ol class="leaderboard-card__list">
        ${board.entries
          .map(
            (member, index) => `
              <li>
                <div class="leaderboard-card__entry">
                  <span class="leaderboard-card__name">${member.name}</span>
                  <span class="leaderboard-card__value">${member.value} ${board.metricLabel}</span>
                </div>
                <span class="leaderboard-card__rank">#${index + 1}</span>
              </li>
            `,
          )
          .join('')}
      </ol>
    </article>
  `;
}

function makeBoard(network, metricLabel, apiRows) {
  const entries = (Array.isArray(apiRows) ? apiRows : [])
    .filter((x) => x && !x.error)
    .slice(0, 5)
    .map((r) => ({
      name: r.username ?? 'Unknown',
      value: Number(r.messages ?? 0),
    }));

  return { network, metricLabel, entries };
}

export function renderSocialActivity(target) {
  target.innerHTML = '';

  const wrapper = createEl('div', { className: 'page-shell' });

  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Community</p>
        <h1>Social Activity</h1>
        <p class="muted">Feed and engagement metrics coming soon</p>
      </div>
    </div>

    <section class="social-activity__hero">
      <p class="social-activity__total-label">Total size of community</p>
      <h2 class="social-activity__total-value" id="total-community">0</h2>
    </section>

    <section class="social-activity__metrics" id="metrics">
      ${membershipCounts
        .map(
          (network) => `
            <article class="social-activity__stat" data-key="${network.key}">
              <div class="social-activity__stat-label">${network.network}</div>
              <div class="social-activity__stat-value">0</div>
              <p class="social-activity__stat-subtitle">Community members</p>
            </article>
          `,
        )
        .join('')}
    </section>

    <section class="social-activity__leaderboard">
      <h3 class="social-activity__leaderboard-title">Leaderboard</h3>
      <div class="social-activity__leaderboard-grid" id="leaderboard-grid">
        ${buildLeaderboard({ network: 'Discord', metricLabel: 'Messages', entries: [] })}
        ${buildLeaderboard({ network: 'Telegram', metricLabel: 'Messages', entries: [] })}
        ${buildLeaderboard({ network: 'X', metricLabel: 'Engage Points', entries: [] })}
      </div>
      <p class="muted" style="margin-top:12px" id="api-status"></p>
    </section>

    <section class="social-activity__search-area">
      <div class="social-activity__search-controls">
        <div class="form-group">
          <label for="community-search-input">Search username</label>
          <input type="text" id="community-search-input" placeholder="Enter username" />
        </div>
        <div class="form-group">
          <label for="community-filter">Filter by network</label>
          <div class="styled-select">
            <select id="community-filter" class="select-dropdown">
              <option value="discord">Discord</option>
              <option value="telegram" selected>Telegram</option>
              <option value="x">X (formerly Twitter)</option>
            </select>
          </div>
        </div>
        <button type="button" id="community-search-btn" class="btn-primary">Search</button>
      </div>
      <div class="social-activity__search-result">
        <span class="muted">Results show total messages posted across the selected network</span>
        <div class="social-activity__search-result-value">-- messages</div>
      </div>
    </section>
  `;

  target.appendChild(wrapper);

  const totalEl = wrapper.querySelector('#total-community');
  const metricsEl = wrapper.querySelector('#metrics');
  const leaderboardGrid = wrapper.querySelector('#leaderboard-grid');
  const apiStatus = wrapper.querySelector('#api-status');

  const searchBtn = wrapper.querySelector('#community-search-btn');
  const searchInput = wrapper.querySelector('#community-search-input');
  const filterInput = wrapper.querySelector('#community-filter');
  const resultValue = wrapper.querySelector('.social-activity__search-result-value');

  let isMounted = true;

  async function loadStats() {
    apiStatus.textContent = 'Loading data from API...';

    try {
      const [dcTop, tgTop] = await Promise.all([
        getDiscordTop(15),
        getTelegramTop(15),
      ]);

      if (!isMounted) return;

      const dcCount = Array.isArray(dcTop) ? dcTop.filter((x) => x && !x.error).length : 0;
      const tgCount = Array.isArray(tgTop) ? tgTop.filter((x) => x && !x.error).length : 0;

      const cards = metricsEl.querySelectorAll('.social-activity__stat');
      cards.forEach((card) => {
        const key = card.getAttribute('data-key');
        const valEl = card.querySelector('.social-activity__stat-value');
        if (!valEl) return;

        if (key === 'discord') valEl.textContent = String(dcCount);
        if (key === 'telegram') valEl.textContent = String(tgCount);
        if (key === 'x') valEl.textContent = '0';
      });

      const totalCommunity = dcCount + tgCount + 0;
      totalEl.textContent = String(totalCommunity);

      const boards = [
        makeBoard('Discord', 'Messages', dcTop),
        makeBoard('Telegram', 'Messages', tgTop),
        { network: 'X', metricLabel: 'Engage Points', entries: [] },
      ];

      leaderboardGrid.innerHTML = boards.map(buildLeaderboard).join('');

      apiStatus.textContent = 'API connected ✅';
    } catch (e) {
      console.error(e);
      if (!isMounted) return;
      apiStatus.textContent = 'API error ❌ (check CORS / API_BASE / service up)';
    }
  }

  async function handleSearch() {
    const username = searchInput.value.trim();
    const network = filterInput.value; // discord telegram x

    if (!username) {
      resultValue.textContent = '-- messages';
      return;
    }

    resultValue.textContent = 'Searching...';

    try {
      let data;

      if (network === 'telegram') {
        data = await findTelegramUser(username);
        if (data?.error) {
          resultValue.textContent = `Not found: ${username}`;
          return;
        }
        resultValue.textContent = ${data.messages ?? 0} messages for ${data.username ?? username} on Telegram;
        return;
      }

    if (network === 'discord') {
        data = await findDiscordUser(username);
        if (data?.error) {
          resultValue.textContent = Not found in Discord: ${username};
          return;
        }
        resultValue.textContent = ${data.messages ?? 0} messages for ${data.username ?? username} on Discord;
        return;
      }

      resultValue.textContent = 0 messages for ${username} on X;
    } catch (e) {
      console.error(e);
      resultValue.textContent = Search error (check API / CORS);
    }
  }

  loadStats();
  searchBtn.addEventListener('click', handleSearch);

  return () => {
    isMounted = false;
    searchBtn.removeEventListener('click', handleSearch);
  };
}

