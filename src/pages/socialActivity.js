import { createEl } from '../utils/dom.js';
import * as API from '../api.js';

/* ----------------------------- helpers (X) ----------------------------- */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickFirst(obj, keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/**
 * Формула Engage Points (можешь потом легко поменять веса):
 * likes*1 + replies*2 + reposts*2 + quotes*3 + bookmarks*1.5 + views/100
 * (100 просмотров = 1 point)
 *
 * Поддерживает разные названия полей из парсера/БД.
 */
function calcXEngagePoints(row) {
  const likes = num(
    pickFirst(row, ['likes', 'like_count', 'favorite_count', 'favorites', 'favourites', 'favourites_count'])
  );

  const replies = num(pickFirst(row, ['replies', 'reply_count', 'comments', 'comment_count']));

  const reposts = num(
    pickFirst(row, ['retweets', 'retweet_count', 'reposts', 'repost_count', 'shares', 'share_count'])
  );

  const quotes = num(pickFirst(row, ['quotes', 'quote_count']));

  const bookmarks = num(pickFirst(row, ['bookmarks', 'bookmark_count', 'saves', 'save_count']));

  const views = num(
    pickFirst(row, ['views', 'view_count', 'impressions', 'impression_count', 'reach', 'reach_count'])
  );

  // основная формула
  let points = likes * 1 + replies * 2 + reposts * 2 + quotes * 3 + bookmarks * 1.5 + views / 100;

  // fallback: если у тебя уже есть готовые points/score в БД
  if (!points || points === 0) {
    points = num(pickFirst(row, ['engage_points', 'engagement_points', 'points', 'score', 'engagement', 'messages']));
  }

  // если пришли сверхмалые дробные — округлим
  return Math.round(points);
}

function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.results)) return payload.results;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.top)) return payload.top;
  return [];
}

async function tryFetchJson(url) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function fetchFirstSuccessful(urls) {
  for (const url of urls) {
    try {
      const json = await tryFetchJson(url);
      const rows = unwrapRows(json);
      if (Array.isArray(rows)) return rows;
      if (Array.isArray(json)) return json;
    } catch (_) {
      // пробуем следующий
    }
  }
  return [];
}

async function callFirstApiFn(names, ...args) {
  for (const name of names) {
    const fn = API?.[name];
    if (typeof fn === 'function') {
      try {
        const out = await fn(...args);
        const rows = unwrapRows(out);
        return Array.isArray(rows) ? rows : Array.isArray(out) ? out : [];
      } catch (_) {
        // пробуем следующий
      }
    }
  }
  return null;
}

// Берём base, если он экспортится из api.js. Если нет — пробуем относительные урлы.
function getApiBase() {
  const base =
    API?.API_BASE ??
    API?.API_URL ??
    API?.BASE_URL ??
    API?.baseUrl ??
    API?.baseURL ??
    API?.apiBase ??
    '';
  return typeof base === 'string' ? base.replace(/\/$/, '') : '';
}

async function getXTopSafe(limit = 15) {
  // 1) если в api.js уже есть функция — используем её
  const rowsFromFn = await callFirstApiFn(
    ['getXTop', 'getTwitterTop', 'getXLeaderboard', 'getXTopUsers', 'getXUsersTop', 'getTopX'],
    limit
  );
  if (Array.isArray(rowsFromFn)) return rowsFromFn;

  // 2) если в api.js есть универсальный apiGet — попробуем через него
  if (typeof API?.apiGet === 'function') {
    const paths = [
      `/x/top?limit=${limit}`,
      `/x/leaderboard?limit=${limit}`,
      `/twitter/top?limit=${limit}`,
      `/api/x/top?limit=${limit}`,
      `/top/x?limit=${limit}`,
      `/x/top/${limit}`,
    ];
    for (const p of paths) {
      try {
        const out = await API.apiGet(p);
        const rows = unwrapRows(out);
        if (Array.isArray(rows) && rows.length) return rows;
      } catch (_) {}
    }
  }

  // 3) прямой fetch (самый универсальный)
  const base = getApiBase(); // может быть '' — тогда будет относительный запрос
  const urls = [
    `${base}/x/top?limit=${limit}`,
    `${base}/x/leaderboard?limit=${limit}`,
    `${base}/twitter/top?limit=${limit}`,
    `${base}/api/x/top?limit=${limit}`,
    `${base}/top/x?limit=${limit}`,
    `${base}/x/top/${limit}`,
  ].map((u) => u.replace(/\/{2,}/g, '/').replace(':/', '://'));

  return await fetchFirstSuccessful(urls);
}

async function findXUserSafe(username) {
  // 1) если в api.js уже есть функция — используем её
  const outFromFn = await callFirstApiFn(
    ['findXUser', 'findTwitterUser', 'searchXUser', 'getXUser', 'findX', 'findTwitter'],
    username
  );
  if (outFromFn && !Array.isArray(outFromFn)) return outFromFn; // на всякий

  // 2) если в api.js есть универсальный apiGet — попробуем через него
  if (typeof API?.apiGet === 'function') {
    const paths = [
      `/x/user/${encodeURIComponent(username)}`,
      `/x/user?username=${encodeURIComponent(username)}`,
      `/x/find/${encodeURIComponent(username)}`,
      `/x/find?username=${encodeURIComponent(username)}`,
      `/twitter/user/${encodeURIComponent(username)}`,
      `/twitter/user?username=${encodeURIComponent(username)}`,
      `/api/x/user?username=${encodeURIComponent(username)}`,
    ];
    for (const p of paths) {
      try {
        return await API.apiGet(p);
      } catch (_) {}
    }
  }

  // 3) прямой fetch
  const base = getApiBase();
  const urls = [
    `${base}/x/user/${encodeURIComponent(username)}`,
    `${base}/x/user?username=${encodeURIComponent(username)}`,
    `${base}/x/find/${encodeURIComponent(username)}`,
    `${base}/x/find?username=${encodeURIComponent(username)}`,
    `${base}/twitter/user/${encodeURIComponent(username)}`,
    `${base}/twitter/user?username=${encodeURIComponent(username)}`,
    `${base}/api/x/user?username=${encodeURIComponent(username)}`,
  ].map((u) => u.replace(/\/{2,}/g, '/').replace(':/', '://'));

  for (const url of urls) {
    try {
      const json = await tryFetchJson(url);
      return json;
    } catch (_) {}
  }

  return { error: 'not_found' };
}

function makeTopXBoard(apiRows) {
  const rows = Array.isArray(apiRows) ? apiRows : [];

  const entries = rows
    .filter((x) => x && !x.error)
    .map((r) => {
      const username =
        r.username ?? r.handle ?? r.screen_name ?? r.user ?? r.name ?? r.login ?? 'Unknown';
      const points = calcXEngagePoints(r);
      return { name: username, value: points };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return { network: 'X', metricLabel: 'Engage Points', entries };
}

/* ----------------------------- existing UI ----------------------------- */

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
        <p class="muted">Feed and engagement metrics coming soon</p>
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
        ${buildLeaderboardCard({ network: 'Discord', metricLabel: 'Messages', entries: [] })}
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
        <div class="social-activity__search-result-value" id="search-result">-- messages</div>
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
      // leaderboard (top 15) + реальные размеры комьюнити (COUNT(*))
      const [stats, dcTop, tgTop, xTop] = await Promise.all([
        API.getCommunityStats(),
        API.getDiscordTop(15),
        API.getTelegramTop(15),
        getXTopSafe(15), // <-- добавили X
      ]);

      if (!mounted) return;

      const dcCount = Number(stats?.discord_users ?? 0);
      const tgCount = Number(stats?.telegram_users ?? 0);
      const xCount = Number(stats?.x_users ?? 0);
      const total = Number(stats?.total_users ?? (dcCount + tgCount + xCount));

      dcCountEl.textContent = String(dcCount);
      tgCountEl.textContent = String(tgCount);
      xCountEl.textContent = String(xCount);
      totalEl.textContent = String(total);

      const boards = [
        makeTop5Board('Discord', 'Messages', dcTop),
        makeTop5Board('Telegram', 'Messages', tgTop),
        makeTopXBoard(xTop), // <-- X leaderboard с engage points
      ];

      leaderboardGrid.innerHTML = boards.map(buildLeaderboardCard).join('');
      apiStatus.textContent = 'API connected ✅';
    } catch (e) {
      console.error(e);
      apiStatus.textContent = 'API error ❌ (check CORS / API_BASE / service)';
    }
  }

  async function handleSearch() {
    const username = searchInput.value.trim();
    const network = filterInput.value;

    if (!username) {
      resultValue.textContent = '-- messages';
      return;
    }

    resultValue.textContent = 'Searching...';

    try {
      if (network === 'telegram') {
        const data = await API.findTelegramUser(username);
        if (data && data.error) {
          resultValue.textContent = `Not found in Telegram: ${username}`;
          return;
        }
        resultValue.textContent = `${data?.messages ?? 0} messages for ${data?.username ?? username} on Telegram`;
        return;
      }

      if (network === 'discord') {
        const data = await API.findDiscordUser(username);
        if (data && data.error) {
          resultValue.textContent = `Not found in Discord: ${username}`;
          return;
        }
        resultValue.textContent = `${data?.messages ?? 0} messages for ${data?.username ?? username} on Discord`;
        return;
      }

      // --------------------------- X SEARCH (NEW) ---------------------------
      const data = await findXUserSafe(username);
      if (data && data.error) {
        resultValue.textContent = `Not found in X: ${username}`;
        return;
      }

      const displayName =
        data?.username ?? data?.handle ?? data?.screen_name ?? data?.user ?? username;

      const engage = calcXEngagePoints(data);

      // Если есть количество постов/твитов — покажем красиво
      const posts = num(pickFirst(data, ['tweets', 'tweet_count', 'posts', 'post_count', 'messages']));
      if (posts > 0) {
        resultValue.textContent = `${engage} engage points for ${displayName} on X (${posts} posts)`;
      } else {
        resultValue.textContent = `${engage} engage points for ${displayName} on X`;
      }
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
