import { createEl } from '../utils/dom.js';
import {
  getTelegramTop,
  getCommunityStats,
  findTelegramUser,
  getXTop,
  findXUser,
} from '../api.js';

function buildLeaderboardCard(board) {
  const entriesHtml = board.entries
    .map((member, index) => {
      return `
        <li>
          <div class="leaderboard-card__entry">
            <span class="leaderboard-card__name">${member.name}</span>
            <span class="leaderboard-card__value">${member.value} ${board.metricLabel}</span>
          </div>
          <span class="leaderboard-card__rank">#${index + 1}</span>
        </li>
      `;
    })
    .join('');

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
        ${entriesHtml}
      </ol>
    </article>
  `;
}

function makeTop5Board(network, metricLabel, apiRows) {
  const rows = Array.isArray(apiRows) ? apiRows : [];
  const entries = rows
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
        <p class="muted">Check out the engagement metrics for the Bulk community</p>
      </div>
    </div>

    <section class="social-activity__hero">
      <p class="social-activity__total-label">Total size of community</p>
      <h2 class="social-activity__total-value" id="total-community">0</h2>
    </section>

    <section class="social-activity__metrics" id="metrics">
      <article class="social-activity__stat" data-key="discord">
        <div class="social-activity__stat-label">Discord</div>
        <div class="social-activity__stat-value" id="count-discord">0</div>
        <p class="social-activity__stat-subtitle">Community members</p>
      </article>

      <article class="social-activity__stat" data-key="telegram">
        <div class="social-activity__stat-label">Telegram</div>
        <div class="social-activity__stat-value" id="count-telegram">0</div>
        <p class="social-activity__stat-subtitle">Community members</p>
      </article>

      <article class="social-activity__stat" data-key="x">
        <div class="social-activity__stat-label">X</div>
        <div class="social-activity__stat-value" id="count-x">0</div>
        <p class="social-activity__stat-subtitle">Community members</p>
      </article>
    </section>

    <section class="social-activity__leaderboard">
      <h3 class="social-activity__leaderboard-title">Leaderboard</h3>
      <div class="social-activity__leaderboard-grid" id="leaderboard-grid">
        ${buildLeaderboardCard({ network: 'Telegram', metricLabel: 'Messages', entries: [] })}
        ${buildLeaderboardCard({ network: 'X', metricLabel: 'Engage Points', entries: [] })}
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
              <option value="telegram" selected>Telegram</option>
              <option value="x">X (formerly Twitter)</option>
            </select>
          </div>
        </div>

        <button type="button" id="community-search-btn" class="btn-primary">Search</button>
      </div>

      <div class="social-activity__search-result">
        <span class="muted">Results show total messages/points across the selected network</span>
        <div class="social-activity__search-result-value" id="search-result">--</div>
      </div>
    </section>
  `;

  target.appendChild(wrapper);

  const totalEl = wrapper.querySelector('#total-community');
  const dcCountEl = wrapper.querySelector('#count-discord');
  const tgCountEl = wrapper.querySelector('#count-telegram');
  const xCountEl = wrapper.querySelector('#count-x');
  const leaderboardGrid = wrapper.querySelector('#leaderboard-grid');
  const apiStatus = wrapper.querySelector('#api-status');

  const searchBtn = wrapper.querySelector('#community-search-btn');
  const searchInput = wrapper.querySelector('#community-search-input');
  const filterInput = wrapper.querySelector('#community-filter');
  const resultValue = wrapper.querySelector('#search-result');

  let mounted = true;

  async function loadStats() {
    apiStatus.textContent = 'Loading data from API...';

    try {
      const [stats, tgTop, xTop] = await Promise.all([
        getCommunityStats(),
        getTelegramTop(15),
        getXTop(15),
      ]);

      if (!mounted) return;


      const dcCount = Number(stats?.discord_server_members ?? stats?.discord_users ?? 0);
      const tgCount = Number(stats?.telegram_users ?? 0);
      const xCount = Number(stats?.x_users ?? 0);


      const total = dcCount + tgCount + xCount;

      dcCountEl.textContent = String(dcCount);
      tgCountEl.textContent = String(tgCount);
      xCountEl.textContent = String(xCount);
      totalEl.textContent = String(total);

      const xEntries = (Array.isArray(xTop) ? xTop : [])
        .filter((x) => x && !x.error)
        .slice(0, 5)
        .map((r) => ({
          name: r.username ?? 'Unknown',
          value: Number(r.messages ?? 0),
        }));

      const boards = [
        makeTop5Board('Telegram', 'Messages', tgTop),
        { network: 'X', metricLabel: 'Engage Points', entries: xEntries },
      ];

      leaderboardGrid.innerHTML = boards.map(buildLeaderboardCard).join('');
      apiStatus.textContent = 'Engage Points = posts*5+ likes*2+ retweets*3+ replies*4+ quotes*3+ bookmarks*2+ floor(views/100)';
      
      const communityInfo = document.createElement('span');
      communityInfo.style.display = 'block';
      communityInfo.style.marginTop = '4px';
      communityInfo.style.fontSize = '12px';

      const communityLink = document.createElement('span');
      communityLink.textContent = 'X';
      communityLink.style.cursor = 'pointer';
      communityLink.style.color = '#1d9bf0';
      communityLink.style.textDecoration = 'underline';
      communityLink.addEventListener('click', () => {
        window.open(
          'https://x.com/i/communities/1979868469400363142',
          '_blank'
        );
      });

      communityInfo.append(
        'Points are awarded only to those who are members of ',
        communityLink,
        ' community.'
      );

      apiStatus.appendChild(document.createElement('br'));
      apiStatus.appendChild(communityInfo);
    } catch (e) {
      console.error(e);
      apiStatus.textContent = 'API error ❌ (check CORS / API_BASE / service)';
    }
  })

  async function handleSearch() {
    const username = searchInput.value.trim();
    const network = filterInput.value;

    if (!username) {
      resultValue.textContent = '--';
      return;
    }

    resultValue.textContent = 'Searching...';

    try {
      if (network === 'telegram') {
        const data = await findTelegramUser(username);
        if (data && data.error) {
          resultValue.textContent = `Not found in Telegram: ${username}`;
          return;
        }
        resultValue.textContent = `${data?.messages ?? 0} messages for ${data?.username ?? username} on Telegram`;
        return;
      }

      const data = await findXUser(username);
      if (data && data.error) {
        resultValue.textContent = `Not found in X: ${username}`;
        return;
      }
      resultValue.textContent = `${data?.messages ?? 0} engage points for ${data?.username ?? username} on X`;
    } catch (e) {
      console.error(e);
      resultValue.textContent = 'Search error (check API / CORS)';
    }
  }

  loadStats();
  searchBtn.addEventListener('click', handleSearch);

  return () => {
    mounted = false;
    searchBtn.removeEventListener('click', handleSearch);
  };
}



