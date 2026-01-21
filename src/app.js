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

// src/app.js

// === НАСТРОЙКА ===
const API_BASE =
  window.BULK_AUTH_API_BASE ||
  "https://bulkhubdatabase-production.up.railway.app"; // <-- поменяй

const LS_TOKEN = "bulk_auth_token";
const LS_SKIP = "bulk_skip_login";

// --- helpers ---
function getToken() {
  return localStorage.getItem(LS_TOKEN);
}
function setToken(token) {
  localStorage.setItem(LS_TOKEN, token);
}
function clearToken() {
  localStorage.removeItem(LS_TOKEN);
}
function isSkipped() {
  return localStorage.getItem(LS_SKIP) === "1";
}
function setSkipped(v) {
  localStorage.setItem(LS_SKIP, v ? "1" : "0");
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.detail || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// --- auth API ---
export async function login(email, password) {
  const data = await api("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
  setToken(data.token);
  setSkipped(false);
  return data.user;
}

export async function me() {
  return await api("/auth/me");
}

export function logout() {
  clearToken();
}

export function openLoginModal() {
  const modal = document.querySelector("#login-modal") || document.querySelector("[data-login-modal]");
  if (modal) modal.style.display = "block";
}

export function closeLoginModal() {
  const modal = document.querySelector("#login-modal") || document.querySelector("[data-login-modal]");
  if (modal) modal.style.display = "none";
}

// --- UI wiring (не ломает проект, если элементов нет) ---
async function bootAuthUI() {
  // элементы (поддержка и id и data-атрибутов)
  const emailEl =
    document.querySelector("#login-email") || document.querySelector('[data-auth="email"]');
  const passEl =
    document.querySelector("#login-password") || document.querySelector('[data-auth="password"]');
  const submitBtn =
    document.querySelector("#login-submit") || document.querySelector('[data-auth="submit"]');
  const skipBtn =
    document.querySelector("#login-skip") || document.querySelector('[data-auth="skip"]');
  const errorEl =
    document.querySelector("#login-error") || document.querySelector('[data-auth="error"]');

  const showError = (msg) => {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = msg ? "block" : "none";
    } else if (msg) {
      console.warn("Login error:", msg);
    }
  };

  // 1) если есть токен — проверяем
  const token = getToken();
  if (token) {
    try {
      const user = await me();
      window.BULK_USER = user;
      closeLoginModal();
      showError("");
      return;
    } catch (e) {
      clearToken();
    }
  }

  // 2) если пропущено — не показываем логин
  if (isSkipped()) {
    closeLoginModal();
    return;
  }

  // 3) иначе показываем логин
  openLoginModal();

  // submit
  if (submitBtn) {
    submitBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      showError("");

      const email = (emailEl?.value || "").trim();
      const password = (passEl?.value || "").trim();

      if (!email || !password) {
        showError("Введите email и пароль");
        return;
      }

      try {
        const user = await login(email, password);
        window.BULK_USER = user;
        closeLoginModal();
      } catch (e) {
        showError(e.message || "Ошибка логина");
      }
    });
  }

  // skip
  if (skipBtn) {
    skipBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      setSkipped(true);
      closeLoginModal();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bootAuthUI().catch((e) => console.warn(e));
});
