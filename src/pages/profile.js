import { createEl } from '../utils/dom.js';

const PASSWORD_MIN_LENGTH = 8;

export function renderProfile(target) {
  target.innerHTML = '';
  const wrapper = createEl('div', { className: 'page-shell' });
  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Account</p>
        <h1>Profile settings</h1>
        <p class="muted">Secure your account by updating your password.</p>
      </div>
    </div>
    <div class="card-grid single profile-grid">
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
          <div class="form-actions">
            <button type="submit" class="btn-primary">Change password</button>
          </div>
        </form>
      </section>
    </div>
  `;

  target.appendChild(wrapper);

  const passwordForm = wrapper.querySelector('#password-form');
  const currentPasswordInput = wrapper.querySelector('#current-password-input');
  const newPasswordInput = wrapper.querySelector('#new-password-input');
  const confirmPasswordInput = wrapper.querySelector('#confirm-password-input');
  const newPasswordError = wrapper.querySelector('#new-password-error');
  const confirmPasswordError = wrapper.querySelector('#confirm-password-error');

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

  function handlePasswordSubmit(event) {
    event.preventDefault();
    if (!validatePasswordFields()) return;

    console.log('Password change submitted', {
      currentPassword: currentPasswordInput.value,
      newPassword: newPasswordInput.value,
    });
    // TODO: integrate with password endpoint
    passwordForm.reset();
  }

  function handlePasswordInput() {
    validatePasswordFields();
  }

  passwordForm.addEventListener('submit', handlePasswordSubmit);
  newPasswordInput.addEventListener('input', handlePasswordInput);
  confirmPasswordInput.addEventListener('input', handlePasswordInput);

  return () => {
    passwordForm.removeEventListener('submit', handlePasswordSubmit);
    newPasswordInput.removeEventListener('input', handlePasswordInput);
    confirmPasswordInput.removeEventListener('input', handlePasswordInput);
  };
}

// src/pages/profile.js
import { openLoginModal } from "../app.js";

const API_BASE =
  window.BULK_AUTH_API_BASE ||
  "https://bulkhubdatabase-production.up.railway.app"; // <-- поменяй

const LS_TOKEN = "bulk_auth_token";

function getToken() {
  return localStorage.getItem(LS_TOKEN);
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

// === экспортируем функцию сохранения метки, чтобы её можно было дергать из глобуса ===
export async function saveMyMarker({ country, city, lat = null, lng = null }) {
  const token = getToken();
  if (!token) {
    openLoginModal();
    throw new Error("Нужно войти, чтобы сохранить метку");
  }
  return await api("/markers", {
    method: "POST",
    body: { country, city, lat, lng },
  });
}

export async function loadMyMarker() {
  const token = getToken();
  if (!token) return null;
  return await api("/markers/me");
}

// --- UI wiring (если у тебя на profile есть форма) ---
document.addEventListener("DOMContentLoaded", async () => {
  const form = document.querySelector("#marker-form") || document.querySelector('[data-marker="form"]');
  const countryEl =
    document.querySelector("#marker-country") || document.querySelector('[data-marker="country"]');
  const cityEl =
    document.querySelector("#marker-city") || document.querySelector('[data-marker="city"]');
  const latEl =
    document.querySelector("#marker-lat") || document.querySelector('[data-marker="lat"]');
  const lngEl =
    document.querySelector("#marker-lng") || document.querySelector('[data-marker="lng"]');
  const msgEl =
    document.querySelector("#marker-msg") || document.querySelector('[data-marker="msg"]');

  const setMsg = (t) => {
    if (msgEl) {
      msgEl.textContent = t || "";
      msgEl.style.display = t ? "block" : "none";
    }
  };

  // подгружаем текущую метку (если залогинен)
  try {
    const m = await loadMyMarker();
    if (m && countryEl && cityEl) {
      countryEl.value = m.country || "";
      cityEl.value = m.city || "";
      if (latEl) latEl.value = m.lat ?? "";
      if (lngEl) lngEl.value = m.lng ?? "";
    }
  } catch (e) {
    // не критично
  }

  if (!form) return;

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setMsg("");

    const country = (countryEl?.value || "").trim();
    const city = (cityEl?.value || "").trim();
    const lat = latEl?.value ? Number(latEl.value) : null;
    const lng = lngEl?.value ? Number(lngEl.value) : null;

    if (!country || !city) {
      setMsg("Заполни страну и город");
      return;
    }

    try {
      await saveMyMarker({ country, city, lat, lng });
      setMsg("✅ Метка сохранена");
    } catch (e) {
      setMsg(e.message || "Ошибка сохранения");
    }
  });
});

