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

