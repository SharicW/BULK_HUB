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

let currentCleanup = null; // Функция очистки для текущего маршрута
let sidebarApi = null;

const mainOutlet = document.getElementById('page-container');
const sidebarEl = document.getElementById('sidebar');

// Инициализация
function init() {
  initLoginModal();
  sidebarApi = renderSidebar(sidebarEl, { onNavigate: handleRouteChange });
  window.addEventListener('hashchange', handleRouteChange);

  if (!window.location.hash || !routes[window.location.hash]) {
    window.location.hash = '#map';  // Если нет хэша, установим #map как дефолтный
  }

  handleRouteChange();  // Инициализация маршрута
}

// Обработчик изменения маршрута
function handleRouteChange() {
  const hash = routes[window.location.hash] ? window.location.hash : '#map'; // Проверка на существующий маршрут
  const route = routes[hash] || routes['#map'];

  // Очищаем предыдущий маршрут (если есть)
  if (currentCleanup) {
    try {
      currentCleanup(); // Очищаем ресурсы, если функция очистки существует
    } catch (e) {
      console.warn('Cleanup error', e);
    }
    currentCleanup = null; // Обнуляем текущую очистку
  }

  // Устанавливаем активный элемент в боковой панели
  sidebarApi?.setActive(hash);

  // Рендерим новый маршрут и записываем функцию очистки для этого маршрута
  const cleanupFn = route.render(mainOutlet);
  currentCleanup = cleanupFn && typeof cleanupFn === 'function' ? cleanupFn : null;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
