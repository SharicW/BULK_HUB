import { renderSidebar } from './ui/sidebar.js';
import { initLoginModal } from './ui/loginModal.js';
import { initGlobalMap } from './pages/globalMap.js';
import { renderMemberContribution } from './pages/memberContribution.js';
import { renderSocialActivity } from './pages/socialActivity.js';
import { renderStakeInformation } from './pages/stakeInformation.js';
import { renderProfile } from './pages/profile.js';

const routes = {
  '#map': { id: 'map', render: initGlobalMap },
  '#contrib': { id: 'contrib', render: renderMemberContribution },
  '#social': { id: 'social', render: renderSocialActivity },
  '#stake': { id: 'stake', render: renderStakeInformation },
  '#profile': { id: 'profile', render: renderProfile },
};

let currentCleanup = null;
let sidebarApi = null;
const mainOutlet = document.getElementById('page-container');
const sidebarEl = document.getElementById('sidebar');

function init() {
  initLoginModal();
  sidebarApi = renderSidebar(sidebarEl, { onNavigate: handleRouteChange });
  window.addEventListener('hashchange', handleRouteChange);

  if (!window.location.hash  !routes[window.location.hash]) {
    window.location.hash = '#map';
  }
  handleRouteChange();
}

function handleRouteChange() {
  const hash = normalizeHash(window.location.hash);
  const route = routes[hash]  routes['#map'];

  if (currentCleanup) {
    try {
      currentCleanup();
    } catch (e) {
      console.warn('Cleanup error', e);
    }
    currentCleanup = null;
  }

  sidebarApi?.setActive(hash);
  const cleanup = route.render(mainOutlet) || null;
  currentCleanup = cleanup;
}

function normalizeHash(hash) {
  return routes[hash] ? hash : '#map';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export const API_BASE = "https://bulk_hub_database.railway.internal.up.railway.app";

export async function getDiscordTop(limit = 15) {
  const r = await fetch(${API_BASE}/discord/top/${limit});
  return await r.json();
}

export async function getTelegramTop(limit = 15) {
  const r = await fetch(${API_BASE}/telegram/top/${limit});
  return await r.json();
}

export async function findDiscordUser(username) {
  const r = await fetch(${API_BASE}/dc/${encodeURIComponent(username)});
  return await r.json();
}

export async function findTelegramUser(username) {
  const r = await fetch(${API_BASE}/tg/${encodeURIComponent(username)});
  return await r.json();
