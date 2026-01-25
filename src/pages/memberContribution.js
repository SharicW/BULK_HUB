import { createEl } from '../utils/dom.js';
import { getXPosts, getXUserTotals } from '../api.js';

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return '';
  }
}

function stripUrls(text) {
  const t = String(text || '');
  return t.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim();
}

function shortText(s, max = 220) {
  const t = stripUrls(s);
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

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
  date.className = 'x-post-card
