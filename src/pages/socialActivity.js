import { createEl } from '../utils/dom.js';

const membershipCounts = [
  { network: 'Discord', count: 0 },
  { network: 'Telegram', count: 0 },
  { network: 'X', count: 0 },
];

const leaderboardData = [
  {
    network: 'Discord',
    metricLabel: 'Messages',
    entries: [
      { name: 'Horizon', value: 0 },
      { name: 'Vela', value: 0 },
      { name: 'Rook', value: 0 },
      { name: 'Kappa', value: 0 },
      { name: 'Nova', value: 0 },
    ],
  },
  {
    network: 'Telegram',
    metricLabel: 'Messages',
    entries: [
      { name: 'Io', value: 0 },
      { name: 'Mira', value: 0 },
      { name: 'Quill', value: 0 },
      { name: 'Arris', value: 0 },
      { name: 'Lyra', value: 0 },
    ],
  },
  {
    network: 'X',
    metricLabel: 'Engage Points',
    entries: [
      { name: 'Argo', value: 0 },
      { name: 'Pulse', value: 0 },
      { name: 'Orbit', value: 0 },
      { name: 'Sable', value: 0 },
      { name: 'Vio', value: 0 },
    ],
  },
];

export function renderSocialActivity(target) {
  target.innerHTML = '';
  const totalCommunity = membershipCounts.reduce((sum, item) => sum + item.count, 0);
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
      <h2 class="social-activity__total-value">${totalCommunity}</h2>
    </section>
    <section class="social-activity__metrics">
      ${membershipCounts
        .map(
          (network) => `
            <article class="social-activity__stat">
              <div class="social-activity__stat-label">${network.network}</div>
              <div class="social-activity__stat-value">${network.count}</div>
              <p class="social-activity__stat-subtitle">Community members</p>
            </article>
          `,
        )
        .join('')}
    </section>
    <section class="social-activity__leaderboard">
      <h3 class="social-activity__leaderboard-title">Leaderboard</h3>
      <div class="social-activity__leaderboard-grid">
        ${leaderboardData
          .map(
            (board) => `
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
            `,
          )
          .join('')}
      </div>
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
              <option value="telegram">Telegram</option>
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

  const searchBtn = wrapper.querySelector('#community-search-btn');
  const searchInput = wrapper.querySelector('#community-search-input');
  const filterInput = wrapper.querySelector('#community-filter');
  const resultValue = wrapper.querySelector('.social-activity__search-result-value');

  function handleSearch() {
    const username = searchInput.value.trim();
    const selected = filterInput.options[filterInput.selectedIndex].text;
    if (!username) {
      resultValue.textContent = '-- messages';
      return;
    }
    resultValue.textContent = `0 messages for ${username} on ${selected}`;
  }

  searchBtn.addEventListener('click', handleSearch);

  return () => {
    searchBtn.removeEventListener('click', handleSearch);
  };
}

