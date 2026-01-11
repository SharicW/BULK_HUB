import { createEl } from '../utils/dom.js';

const ALLOW_CLOSE = false;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const modalState = {
  overlay: null,
  panel: null,
  form: null,
  emailInput: null,
  passwordInput: null,
  rememberInput: null,
  errorNode: null,
  submitButton: null,
  closeButton: null,
  allowClose: ALLOW_CLOSE,
};

let handlersAttached = false;
let isOpen = false;

export function onLoginSubmit({ email, password, remember }) {
  console.log('Login submit payload', { email, password, remember });
  // TODO: connect backend auth here
}

export function initLoginModal(options = {}) {
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

  showModal();
  return {
    show: showModal,
    hide: hideModal,
  };
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
        <p class="muted">Provide your credentials to continue</p>
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
        <div class="form-actions">
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
}

function attachHandlers() {
  const { overlay, form, emailInput, closeButton } = modalState;

  form.addEventListener('submit', handleSubmit);
  overlay.addEventListener('keydown', trapFocus);

  if (modalState.allowClose) {
    overlay.addEventListener('click', handleOverlayClick);
    closeButton?.addEventListener('click', hideModal);
    overlay.addEventListener('keydown', handleEscape);
  }

  overlay.addEventListener('focusin', () => {
    if (!isOpen) return;
    if (document.activeElement === overlay) {
      emailInput?.focus();
    }
  });
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

function handleSubmit(event) {
  event.preventDefault();
  const email = modalState.emailInput.value.trim();
  const password = modalState.passwordInput.value;
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
  onLoginSubmit({ email, password, remember });
  hideModal();
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

