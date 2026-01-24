import { createEl } from '../utils/dom.js';
import { openLoginModal } from '../ui/loginModal.js';

const PASSWORD_MIN_LENGTH = 8;

const API_BASE =
  window.BULK_AUTH_API_BASE ||
  'https://bulkhubdatabase-production.up.railway.app';

const LS_TOKEN = 'bulk_auth_token';
const SS_TOKEN = 'bulk_auth_token_session';

function getAuthToken() {
  return localStorage.getItem(LS_TOKEN) || sessionStorage.getItem(SS_TOKEN);
}

function clearAuthToken() {
  localStorage.removeItem(LS_TOKEN);
  sessionStorage.removeItem(SS_TOKEN);
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const txt = await res.text();
  const looksLikeHtml = /^\s*</.test(txt);

  let data = null;
  if (txt && !looksLikeHtml) {
    try {
      data = JSON.parse(txt);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg = (data && (data.detail || data.error)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  if (data === null) {
    const err = new Error('API returned non-JSON response');
    err.status = res.status;
    throw err;
  }

  return data;
}

async function logout() {
  try {
    await api('/auth/logout', { method: 'POST', auth: true });
  } catch {
  }
  clearAuthToken();
  window.dispatchEvent(new CustomEvent('bulk:logout'));
  window.location.reload();
}

export function renderProfile(target) {
  target.innerHTML = '';
  const wrapper = createEl('div', { className: 'page-shell' });

  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Account</p>
        <h1>Profile settings</h1>
        <p class="muted">Manage your session and update your password</p>
      </div>
    </div>

    <div class="card-grid single profile-grid">
      <section class="card profile-card" aria-labelledby="account-section-title">
        <div class="card-title" id="account-section-title">Account</div>
        <p class="card-muted">Signed in as <span id="profile-email" class="mono">—</span></p>
        <p class="field-error" id="profile-auth-error" aria-live="polite"></p>
        <div class="form-actions">
          <button type="button" class="btn-primary" id="login-btn" style="display:none;">Log in</button>
          <button type="button" class="btn-secondary" id="logout-btn" style="display:none;">Log out</button>
        </div>
      </section>

      <section class="card profile-card" aria-labelledby="password-section-title">
        <div class="card-title" id="password-section-title">Password</div>
        <p class="card-muted">Change your password to keep the account secure.</p>
        <form class="profile-form" id="password-form" novalidate>
          <div class="form-group">
            <label for="current-password-input">Current password</label>
            <input type="password" id="current-password-input" name="currentPassword" autocomplete="current-password" placeholder="••••••••" required />
          </div>
          <div class="form-group">
            <label for="new-password-input">New password</label>
            <input type="password" id="new-password-input" name="newPassword" autocomplete="new-password" placeholder="At least 8 characters" required />
            <p class="field-error" id="new-password-error" aria-live="polite"></p>
          </div>
          <div class="form-group">
            <label for="confirm-password-input">Confirm new password</label>
            <input type="password" id="confirm-password-input" name="confirmPassword" autocomplete="new-password" placeholder="Re-enter new password" required />
            <p class="field-error" id="confirm-password-error" aria-live="polite"></p>
          </div>
          <p class="field-error" id="password-submit-error" aria-live="polite"></p>
          <div class="form-actions">
            <button type="submit" class="btn-primary" id="change-password-btn">Change password</button>
          </div>
        </form>
      </section>
    </div>
  `;

  target.appendChild(wrapper);

  const emailEl = wrapper.querySelector('#profile-email');
  const authErrorEl = wrapper.querySelector('#profile-auth-error');
  const loginBtn = wrapper.querySelector('#login-btn');
  const logoutBtn = wrapper.querySelector('#logout-btn');

  const passwordForm = wrapper.querySelector('#password-form');
  const currentPasswordInput = wrapper.querySelector('#current-password-input');
  const newPasswordInput = wrapper.querySelector('#new-password-input');
  const confirmPasswordInput = wrapper.querySelector('#confirm-password-input');
  const newPasswordError = wrapper.querySelector('#new-password-error');
  const confirmPasswordError = wrapper.querySelector('#confirm-password-error');
  const submitErrorEl = wrapper.querySelector('#password-submit-error');
  const changePwdBtn = wrapper.querySelector('#change-password-btn');

  let disposed = false;

  // Показываем Login или Logout в зависимости от auth состояния
  function updateAuthButtons() {
    const token = getAuthToken();
    const isLoggedIn = !!token;
    loginBtn.style.display = isLoggedIn ? 'none' : 'inline-flex';
    logoutBtn.style.display = isLoggedIn ? 'inline-flex' : 'none';
  }

  function setBusy(isBusy) {
    changePwdBtn.disabled = isBusy;
    loginBtn.disabled = isBusy;
    logoutBtn.disabled = isBusy;
    currentPasswordInput.disabled = isBusy;
    newPasswordInput.disabled = isBusy;
    confirmPasswordInput.disabled = isBusy;
  }

  async function loadMe() {
    updateAuthButtons();
    const token = getAuthToken();
    if (!token) {
      emailEl.textContent = 'Not signed in';
      authErrorEl.textContent = '';
      return;
    }
    try {
      const me = await api('/auth/me', { method: 'GET', auth: true });
      if (disposed) return;
      emailEl.textContent = me?.email || '—';
      authErrorEl.textContent = '';
      updateAuthButtons();
    } catch (e) {
      if (disposed) return;
      emailEl.textContent = 'Not signed in';
      authErrorEl.textContent = e?.message || 'Not authenticated';
      updateAuthButtons();
    }
  }

  function validatePasswordFields() {
    let valid = true;
    const newPwd = newPasswordInput.value;
    const confirmPwd = confirmPasswordInput.value;

    if (newPwd.length < PASSWORD_MIN_LENGTH) {
      newPasswordError.textContent = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
      valid = false;
    } else {
      newPasswordError.textContent = '';
    }

    if (!confirmPwd) {
      confirmPasswordError.textContent = 'Please confirm the new password.';
      valid = false;
    } else if (newPwd && newPwd !== confirmPwd) {
      confirmPasswordError.textContent = 'Passwords do not match.';
      valid = false;
    } else {
      confirmPasswordError.textContent = '';
    }

    return valid;
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    submitErrorEl.textContent = '';

    const token = getAuthToken();
    if (!token) {
      submitErrorEl.textContent = 'Not authenticated. Please sign in again.';
      return;
    }

    if (!validatePasswordFields()) return;

    const currentPwd = currentPasswordInput.value;
    const newPwd = newPasswordInput.value;

    if (!currentPwd) {
      submitErrorEl.textContent = 'Please enter your current password.';
      return;
    }

    setBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        auth: true,
        body: {
          current_password: currentPwd,
          new_password: newPwd,
        },
      });

      if (disposed) return;
      passwordForm.reset();

      await logout();
    } catch (e) {
      if (disposed) return;
      submitErrorEl.textContent = e?.message || 'Password change failed.';
    } finally {
      if (!disposed) setBusy(false);
    }
  }

  function handlePasswordInput() {
    validatePasswordFields();
  }

  function handleLogoutClick() {
    logout();
  }

  function handleLoginClick() {
    openLoginModal();
  }

  // Слушаем события авторизации для обновления UI
  function handleAuthChange() {
    if (!disposed) {
      loadMe();
    }
  }

  passwordForm.addEventListener('submit', handlePasswordSubmit);
  newPasswordInput.addEventListener('input', handlePasswordInput);
  confirmPasswordInput.addEventListener('input', handlePasswordInput);
  loginBtn.addEventListener('click', handleLoginClick);
  logoutBtn.addEventListener('click', handleLogoutClick);
  window.addEventListener('bulk:login', handleAuthChange);
  window.addEventListener('bulk:logout', handleAuthChange);

  loadMe();

  return () => {
    disposed = true;
    passwordForm.removeEventListener('submit', handlePasswordSubmit);
    newPasswordInput.removeEventListener('input', handlePasswordInput);
    confirmPasswordInput.removeEventListener('input', handlePasswordInput);
    loginBtn.removeEventListener('click', handleLoginClick);
    logoutBtn.removeEventListener('click', handleLogoutClick);
    window.removeEventListener('bulk:login', handleAuthChange);
    window.removeEventListener('bulk:logout', handleAuthChange);
  };
}
