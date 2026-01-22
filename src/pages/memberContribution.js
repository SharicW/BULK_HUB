import { createEl } from '../utils/dom.js';
import { getXPosts } from '../api.js';

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    // ✅ English date
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return '';
  }
}

function stripUrls(text) {
  const t = String(text || '');
  // ✅ убираем ссылки из текста (чтобы не торчали рядом с картинками)
  return t.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim();
}

function shortText(s, max = 220) {
  const t = stripUrls(s);
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

// ✅ поддержка post.media и post.media_urls
function normalizeMedia(post) {
  let m = post?.media ?? post?.media_urls ?? [];
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch { m = []; }
  }
  if (!Array.isArray(m)) return [];

  const urls = m
    .map((x) => (typeof x === 'string' ? x : (x?.media_url_https || x?.media_url || x?.url)))
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter((x) => x.startsWith('http'));

  return Array.from(new Set(urls));
}

function createPostCard(post) {
  const a = document.createElement('a');
  a.className = 'x-post-card';
  a.href = post.url || (post.tweet_id ? `https://x.com/i/web/status/${post.tweet_id}` : '#');
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const header = document.createElement('div');
  header.className = 'x-post-card__header';

  const who = document.createElement('div');
  who.className = 'x-post-card__who';

  const name = document.createElement('div');
  name.className = 'x-post-card__name';
  name.textContent = post.name ? String(post.name) : `@${post.username || ''}`;

  const handle = document.createElement('div');
  handle.className = 'x-post-card__handle muted';
  handle.textContent = `@${post.username || ''}`;

  who.appendChild(name);
  who.appendChild(handle);

  const date = document.createElement('div');
  date.className = 'x-post-card__date muted';
  date.textContent = formatDate(post.created_at);

  header.appendChild(who);
  header.appendChild(date);

  const body = document.createElement('div');
  body.className = 'x-post-card__body';
  body.textContent = shortText(post.text);

  // ✅ MEDIA (картинки/thumbnail)
  const mediaArr = normalizeMedia(post);
  let mediaBlock = null;

  if (mediaArr.length > 0) {
    mediaBlock = document.createElement('div');
    mediaBlock.className = 'x-post-card__media';

    // максимум 4 картинки на карточку
    mediaArr.slice(0, 4).forEach((src) => {
      const img = document.createElement('img');
      img.className = 'x-post-card__img';
      img.loading = 'lazy';
      img.alt = 'X media';
      img.src = src;

      // иногда pbs.twimg.com капризничает — так стабильнее
      img.referrerPolicy = 'no-referrer';
      img.crossOrigin = 'anonymous';

      // если не загрузилось — убираем
      img.addEventListener('error', () => img.remove());

      mediaBlock.appendChild(img);
    });
  }

  const metrics = document.createElement('div');
  metrics.className = 'x-post-card__metrics';

  const m1 = document.createElement('span');
  m1.className = 'x-post-card__metric';
  m1.textContent = `❤ ${post.likes ?? 0}`;

  const m2 = document.createElement('span');
  m2.className = 'x-post-card__metric';
  m2.textContent = `↻ ${post.retweets ?? 0}`;

  const m3 = document.createElement('span');
  m3.className = 'x-post-card__metric';
  m3.textContent = `💬 ${post.replies ?? 0}`;

  const m4 = document.createElement('span');
  m4.className = 'x-post-card__metric';
  m4.textContent = `👁 ${post.views ?? 0}`;

  metrics.appendChild(m1);
  metrics.appendChild(m2);
  metrics.appendChild(m3);
  metrics.appendChild(m4);

  a.appendChild(header);
  a.appendChild(body);
  if (mediaBlock) a.appendChild(mediaBlock);
  a.appendChild(metrics);

  return a;
}

export function renderMemberContribution(target) {
  target.innerHTML = '';
  const wrapper = createEl('div', { className: 'page-shell' });

  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Dashboard</p>
        <h1>Member Contributions</h1>
        <p class="muted">All contributions from the Bulk community in X will be displayed here</p>
      </div>
    </div>

    <section class="contributions__posts">
      <div class="contributions__posts-headline">
        <p class="eyebrow">Community stream</p>
        <h2>X Posts</h2>
      </div>

      <div class="contributions__posts-search">
        <div class="form-group">
          <label for="x-posts-search">Search X username</label>
          <input type="text" id="x-posts-search" placeholder="e.g. @bulkbuilder" />
        </div>
        <button type="button" id="x-posts-search-btn" class="btn-primary">Show posts</button>
      </div>

      <div class="contributions__posts-result" id="x-posts-result">
        <span class="muted">Search results will show all posts by the selected username</span>
      </div>

      <div class="x-posts-grid" id="x-posts-grid"></div>
      <div class="x-posts-footer">
        <button type="button" id="x-posts-loadmore" class="btn-secondary" style="display:none">Load more</button>
        <p class="muted" id="x-posts-status" style="margin-top:10px"></p>
      </div>
    </section>
  `;

  target.appendChild(wrapper);

  const searchBtn = wrapper.querySelector('#x-posts-search-btn');
  const searchInput = wrapper.querySelector('#x-posts-search');
  const resultEl = wrapper.querySelector('#x-posts-result');
  const gridEl = wrapper.querySelector('#x-posts-grid');
  const loadMoreBtn = wrapper.querySelector('#x-posts-loadmore');
  const statusEl = wrapper.querySelector('#x-posts-status');

  let mounted = true;
  let currentUser = '';
  let offset = 0;
  const limit = 30;
  let loading = false;
  let reachedEnd = false;

  function normalizeUsername(v) {
    let u = String(v || '').trim();
    if (u.startsWith('@')) u = u.slice(1);
    return u.trim();
  }

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  async function loadPosts({ reset = false } = {}) {
    if (loading) return;
    if (!currentUser) return;
    if (reachedEnd && !reset) return;

    loading = true;
    setStatus('Loading posts…');

    try {
      if (reset) {
        offset = 0;
        reachedEnd = false;
        gridEl.innerHTML = '';
        loadMoreBtn.style.display = 'none';
      }

      const posts = await getXPosts(currentUser, limit, offset);
      if (!mounted) return;

      const arr = Array.isArray(posts) ? posts : [];
      if (arr.length === 0 && offset === 0) {
        resultEl.innerHTML = `<span class="muted">No posts found for @${currentUser} in this community.</span>`;
        setStatus('');
        loadMoreBtn.style.display = 'none';
        reachedEnd = true;
        return;
      }

      resultEl.innerHTML = `<span class="muted">Showing posts for <strong>@${currentUser}</strong></span>`;

      for (const p of arr) {
        gridEl.appendChild(createPostCard(p));
      }

      offset += arr.length;

      if (arr.length < limit) {
        reachedEnd = true;
        loadMoreBtn.style.display = 'none';
        setStatus('That’s all posts ✅');
      } else {
        loadMoreBtn.style.display = 'inline-flex';
        setStatus('');
      }
    } catch (e) {
      console.error(e);
      if (!mounted) return;
      setStatus('API error ❌ (check backend / CORS / endpoint)');
      loadMoreBtn.style.display = 'none';
    } finally {
      loading = false;
    }
  }

  async function handlePostsSearch() {
    const username = normalizeUsername(searchInput.value);
    if (!username) {
      resultEl.innerHTML = `<span class="muted">Enter a username to view their contributions.</span>`;
      gridEl.innerHTML = '';
      loadMoreBtn.style.display = 'none';
      setStatus('');
      return;
    }

    currentUser = username;
    await loadPosts({ reset: true });
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') handlePostsSearch();
  }

  // infinite scroll sentinel
  const sentinel = document.createElement('div');
  sentinel.style.height = '1px';
  sentinel.style.width = '100%';
  wrapper.appendChild(sentinel);

  const io = new IntersectionObserver((entries) => {
    const hit = entries.some((x) => x.isIntersecting);
    if (hit && currentUser && !loading && !reachedEnd) loadPosts();
  }, { root: null, threshold: 0.1 });

  io.observe(sentinel);

  searchBtn.addEventListener('click', handlePostsSearch);
  searchInput.addEventListener('keydown', onKeyDown);
  loadMoreBtn.addEventListener('click', () => loadPosts());

  return () => {
    mounted = false;
    io.disconnect();
    searchBtn.removeEventListener('click', handlePostsSearch);
    searchInput.removeEventListener('keydown', onKeyDown);
    loadMoreBtn.removeEventListener('click', () => loadPosts());
  };
}
