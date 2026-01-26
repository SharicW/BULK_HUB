import { renderSidebar } from './ui/sidebar.js';
import { initLoginModal } from './ui/loginModal.js';
import { initGlobalMap, destroyGlobalMap } from './pages/globalMap.js';
import { renderMemberContribution } from './pages/memberContribution.js';
import { renderSocialActivity } from './pages/socialActivity.js';
import { renderStakeInformation } from './pages/stakeInformation.js';
import { renderProfile } from './pages/profile.js';
import { initDeviceDetection } from './utils/device.js';

const routes = {
  '#map': { id: 'map', render: initGlobalMap },
  '#contrib': { id: 'contrib', render: renderMemberContribution },
  '#social': { id: 'social', render: renderSocialActivity },
  '#stake': { id: 'stake', render: renderStakeInformation },
  '#profile': { id: 'profile', render: renderProfile },
};

let currentCleanup = null;
let sidebarApi = null;
let navSeq = 0;

const mainOutlet = document.getElementById('page-container');
const sidebarEl = document.getElementById('sidebar');

function init() {
  initDeviceDetection();
  initLoginModal();

  sidebarApi = renderSidebar(sidebarEl, { onNavigate: handleRouteChange });

  if (!window.location.hash || !routes[window.location.hash]) {
    history.replaceState(null, '', '#map');
  }

  window.addEventListener('hashchange', () => { handleRouteChange(); });
  handleRouteChange();
}

async function handleRouteChange() {
  const seq = ++navSeq;

  const hash = routes[window.location.hash] ? window.location.hash : '#map';
  const route = routes[hash] || routes['#map'];

  const countryTooltip = document.querySelector('.country-hover-tooltip-wrap');
  if (countryTooltip) {
    countryTooltip.style.display = 'none';
    if (hash !== '#map') {
      try { countryTooltip.remove(); } catch {}
    }
  }

  if (currentCleanup) {
    try { currentCleanup(); } catch (e) { console.warn('Cleanup error', e); }
    currentCleanup = null;
  }

  sidebarApi?.setActive(hash);

  if (route.id === 'map') {
    currentCleanup = () => { try { destroyGlobalMap(); } catch {} };
  }

  try { document.getElementById('main')?.scrollTo({ top: 0, behavior: 'auto' }); } catch {}

  let result = route.render(mainOutlet);

  if (result && typeof result.then === 'function') {
    result = await result;
  }

  if (seq !== navSeq) {
    if (typeof result === 'function') {
      try { result(); } catch {}
    }
    return;
  }

  currentCleanup = typeof result === 'function' ? result : currentCleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
