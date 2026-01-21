// src/ui/loginModal.js
import { createEl } from '../utils/dom.js';

const ALLOW_CLOSE = false;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

// === Настройка backend (твой Railway) ===
const API_BASE =
  window.BULK_AUTH_API_BASE ||
  'https://bulkhubdatabase-production.up.railway.app'; // <-- оставь так или поменяй

// === Storage keys ===
const LS_TOKEN = 'bulk_auth_token';
const SS_TOKEN = 'bulk_auth_token_session';
const LS_SKIP = 'bulk_skip_login';

function getToken() {
  return localStorage.getItem(LS_TOKEN) || sessionStorage.getItem(SS_TOKEN);
}
function setToken(token, remember) {
  if (remember) {
    localStorage.setItem(LS_TOKEN, token);
    sessionStorage.removeItem(SS_TOKEN);
  } else {
    sessionStorage.setItem(SS_TOKEN, token);
    localStorage.removeItem(LS_TOKEN);
  }
}
function clearToken() {
  localStorage.removeItem(LS_TOKEN);
  sessionStorage.removeItem(SS_TOKEN);
}
function isSkipped() {
  return localStorage.getItem(LS_SKIP) === '1';
}
function setSkipped(v) {
  localStorage.setItem(LS_SKIP, v ? '1' : '0');
}

// === API helpers ===
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
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

async function loginRequest(email, password) {
  // backend должен вернуть { token, user }
  return await api('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
}

async function meRequest() {
  return await api('/auth/me', { method: 'GET', auth: true });
}

const modalState = {
  overlay: null,
  panel: null,
  form: null,
  emailInput: null,
  passwordInput: null,
  rememberInput: null,
  errorNode: null,
  submitButton: null,
  skipButton: null,
  closeButton: null,
  allowClose: ALLOW_CLOSE,
};

let handlersAttached = false;
let isOpen = false;

export function openLoginModal() {
  showModal();
}

export function closeLoginModal() {
  hideModal();
}

export async function initLoginModal(options = {}) {
  const allowClose = options.allowClose ?? ALLOW_CLOSE;

  if (!modalState.overlay) {
    buildModal(allowClose);
    document.body.appendChild(modalState.overlay);
  }

  modalState.allowClose = allowClose;

  if (!handlersAttached) {
    attachHandlers();
    handlersAttached = true;
  }

  // 1) если пользователь нажал "Пропустить" ранее — не мешаем
  if (isSkipped()) {
    hideModal();
    return { show: showModal, hide: hideModal };
  }

  // 2) если есть токен — проверим /auth/me, если ок — не показываем модалку
  const token = getToken();
  if (token) {
    try {
      const user = await meRequest();
      window.BULK_USER = user;
      hideModal();
      return { show: showModal, hide: hideModal };
    } catch (e) {
      // токен битый/просрочен
      clearToken();
    }
  }

  // 3) иначе — показываем
  showModal();
  return { show: showModal, hide: hideModal };
}

function buildModal(allowClose) {
  const overlay = createEl('div', {
    className: 'login-modal-overlay hidden',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
    },
  });

  overlay.innerHTML = `
    <div class="login-modal__panel">
      <div class="login-modal__header">
        <p class="eyebrow">Secure access</p>
        <h2>Log in</h2>
        <p class="muted">Provide your credentials to continue — or skip if you don't want to place a marker.</p>
      </div>

      <form class="login-modal__form" id="login-modal-form" novalidate>
        <div class="form-group">
          <label for="login-email-input">Email</label>
          <input type="email" id="login-email-input" name="email" placeholder="you@example.com" required autocomplete="email" />
        </div>

        <div class="form-group">
          <label for="login-password-input">Password</label>
          <input type="password" id="login-password-input" name="password" placeholder="••••••••" required autocomplete="current-password" />
        </div>

        <label class="remember-toggle">
          <input type="checkbox" id="login-remember" name="remember" />
          Remember me
        </label>

        <div class="login-modal__error hidden" id="login-error" aria-live="assertive"></div>

        <div class="form-actions" style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
          <button type="button" class="btn-secondary" id="login-skip">Пропустить</button>
          <button type="submit" class="btn-primary" id="login-submit">Log in</button>
        </div>
      </form>
    </div>
  `;

  const panel = overlay.querySelector('.login-modal__panel');

  if (allowClose) {
    const closeButton = createEl('button', {
      className: 'login-modal__close',
      attrs: {
        type: 'button',
        'aria-label': 'Close login dialog',
      },
    });
    closeButton.textContent = '×';
    panel.appendChild(closeButton);
    modalState.closeButton = closeButton;
  }

  modalState.overlay = overlay;
  modalState.panel = panel;
  modalState.form = overlay.querySelector('#login-modal-form');
  modalState.emailInput = overlay.querySelector('#login-email-input');
  modalState.passwordInput = overlay.querySelector('#login-password-input');
  modalState.rememberInput = overlay.querySelector('#login-remember');
  modalState.errorNode = overlay.querySelector('#login-error');
  modalState.submitButton = overlay.querySelector('#login-submit');
  modalState.skipButton = overlay.querySelector('#login-skip');
}

function attachHandlers() {
  const { overlay, form, closeButton, skipButton } = modalState;

  form.addEventListener('submit', handleSubmit);
  overlay.addEventListener('keydown', trapFocus);

  // Skip всегда доступен
  skipButton?.addEventListener('click', handleSkip);

  if (modalState.allowClose) {
    overlay.addEventListener('click', handleOverlayClick);
    closeButton?.addEventListener('click', hideModal);
    overlay.addEventListener('keydown', handleEscape);
  }

  overlay.addEventListener('focusin', () => {
    if (!isOpen) return;
    if (document.activeElement === overlay) {
      modalState.emailInput?.focus();
    }
  });
}

function handleSkip() {
  setSkipped(true);
  hideModal();
  window.dispatchEvent(new CustomEvent('bulk:skip-login'));
}

function trapFocus(event) {
  if (event.key !== 'Tab') return;

  const focusable = getFocusableElements();
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function handleEscape(event) {
  if (!modalState.allowClose) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    hideModal();
  }
}

function handleOverlayClick(event) {
  if (!modalState.allowClose) return;
  if (event.target === modalState.overlay) {
    hideModal();
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const email = modalState.emailInput.value.trim().toLowerCase();
  const password = modalState.passwordInput.value; // любой непустой
  const remember = modalState.rememberInput.checked;

  if (!EMAIL_PATTERN.test(email)) {
    setError('Please fill in a valid email address.');
    modalState.emailInput.focus();
    return;
  }

  if (!password) {
    setError('Enter your password to continue.');
    modalState.passwordInput.focus();
    return;
  }

  clearError();

  // блокируем кнопку на время запроса
  const btn = modalState.submitButton;
  const oldText = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Logging in...';
  }

  try {
    const data = await loginRequest(email, password);
    setToken(data.token, remember);
    setSkipped(false);
    window.BULK_USER = data.user;

    hideModal();
    window.dispatchEvent(new CustomEvent('bulk:login', { detail: data.user }));
  } catch (e) {
    setError(e.message || 'Login failed');
    // НЕ закрываем модалку при ошибке
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || 'Log in';
    }
  }
}

function setError(message) {
  modalState.errorNode.textContent = message;
  modalState.errorNode.classList.remove('hidden');
}

function clearError() {
  modalState.errorNode.textContent = '';
  modalState.errorNode.classList.add('hidden');
}

function getFocusableElements() {
  const selector =
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const elements = modalState.overlay.querySelectorAll(selector);
  return Array.from(elements).filter((el) => el.offsetParent !== null);
}

function showModal() {
  modalState.overlay.classList.remove('hidden');
  document.body.classList.add('login-modal-open');
  isOpen = true;
  modalState.emailInput?.focus();
}

function hideModal() {
  modalState.overlay.classList.add('hidden');
  document.body.classList.remove('login-modal-open');
  isOpen = false;
  modalState.form?.reset();
  clearError();
}
