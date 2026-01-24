import { renderSidebar } from './ui/sidebar.js';
import { initLoginModal } from './ui/loginModal.js';
import { initGlobalMap } from './pages/globalMap.js';
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

const mainOutlet = document.getElementById('page-container');
const sidebarEl = document.getElementById('sidebar');

function init() {
  // Инициализация определения устройства (добавляет классы на <html>)
  initDeviceDetection();
  
  initLoginModal();

  sidebarApi = renderSidebar(sidebarEl, { onNavigate: handleRouteChange });
  window.addEventListener('hashchange', handleRouteChange);

  if (!window.location.hash || !routes[window.location.hash]) {
    window.location.hash = '#map';
  }

  handleRouteChange();
}

function handleRouteChange() {
  const hash = routes[window.location.hash] ? window.location.hash : '#map';
  const route = routes[hash] || routes['#map'];

  // Страховка: принудительно скрываем/удаляем country tooltip при смене вкладки
  // Это нужно потому что tooltip добавляется в body и может "пережить" cleanup
  const countryTooltip = document.querySelector('.country-hover-tooltip-wrap');
  if (countryTooltip) {
    countryTooltip.style.display = 'none';
    // Удаляем из DOM если уходим с Global Map
    if (hash !== '#map') {
      try { countryTooltip.remove(); } catch {}
    }
  }

  if (currentCleanup) {
    try {
      currentCleanup();
    } catch (e) {
      console.warn('Cleanup error', e);
    }
    currentCleanup = null;
  }

  sidebarApi?.setActive(hash);

  const cleanupFn = route.render(mainOutlet);
  currentCleanup = cleanupFn && typeof cleanupFn === 'function' ? cleanupFn : null;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

