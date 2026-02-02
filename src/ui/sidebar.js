import { globeIcon, usersIcon, activityIcon, pieIcon, userIcon, testnetIcon } from './icons.js';
import { createEl } from '../utils/dom.js';


const NAV_ITEMS = [
  { id: 'map', label: 'Global map', hash: '#map', icon: globeIcon },
  { id: 'contrib', label: 'Member Contributions', hash: '#contrib', icon: usersIcon },
  { id: 'social', label: 'Social Activity', hash: '#social', icon: activityIcon },
  { id: 'stake', label: 'Stake information', hash: '#stake', icon: pieIcon },
  { id: 'testnet', label: 'Testnet', hash: '#testnet', icon: testnetIcon },
];

const PROFILE_ITEM = { id: 'profile', label: 'Profile', hash: '#profile', icon: userIcon };

export function renderSidebar(target, { onNavigate }) {
  if (!target) return { setActive: () => {} };

  target.innerHTML = '';
  target.classList.add('sidebar');

  const header = createEl('div', { className: 'sidebar__brand' });
  header.innerHTML = `
    <img class="sidebar__brand-logo" src="assets/BULK_HUB_LOGO.png" alt="Bulk Hub logo" />
  `;

  const navBlock = createEl('div', { className: 'sidebar__nav-group' });
  navBlock.appendChild(createEl('div', { className: 'sidebar__label', html: 'Main' }));

  const navList = createEl('div', { className: 'sidebar__links' });
  NAV_ITEMS.forEach((item) => {
    const btn = createNavButton(item);
    navList.appendChild(btn);
  });
  navBlock.appendChild(navList);

  const profileBlock = createEl('div', { className: 'sidebar__profile' });
  profileBlock.appendChild(createNavButton(PROFILE_ITEM));

  target.append(header, navBlock, profileBlock);

  target.addEventListener('click', (e) => {
    const link = e.target.closest('[data-hash]');
    if (!link) return;
    e.preventDefault();
    const nextHash = link.dataset.hash;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    } else {
      onNavigate?.(nextHash);
    }
  });

  const setActive = (hash) => {
    target.querySelectorAll('.sidebar__link').forEach((el) => {
      const isActive = el.dataset.hash === hash;
      el.classList.toggle('is-active', isActive);
      el.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  };

  return { setActive };
}

function createNavButton({ hash, label, icon }) {
  const safeIcon = icon ?? '';

  const btn = createEl('a', {
    className: 'sidebar__link',
    attrs: { href: hash, 'data-hash': hash, role: 'button' },
  });

  btn.innerHTML = `
    <span class="sidebar__icon">${safeIcon}</span>
    <span class="sidebar__text">${label}</span>
  `;

  return btn;
}

