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

let currentCleanup = null;
let sidebarApi = null;
const mainOutlet = document.getElementById('page-container');
const sidebarEl = document.getElementById('sidebar');

function init() {
  initLoginModal();
  sidebarApi = renderSidebar(sidebarEl, { onNavigate: handleRouteChange });
  window.addEventListener('hashchange', handleRouteChange);

  if (!window.location.hash || !routes[window.location.hash]) {
    window.location.hash = '#map';
  }
  handleRouteChange();
}

function handleRouteChange() {
  const hash = normalizeHash(window.location.hash);
  const route = routes[hash] || routes['#map'];

  if (currentCleanup) {
    try {
      currentCleanup();
    } catch (e) {
      console.warn('Cleanup error', e);
    }
    currentCleanup = null;
  }

  sidebarApi?.setActive(hash);
  const cleanup = route.render(mainOutlet) || null;
  currentCleanup = cleanup;
}

function normalizeHash(hash) {
  return routes[hash] ? hash : '#map';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

const express = require('express');
const client = require('./utils/db');  // Подключаем клиент базы данных
const app = express();

// Пример маршрута для получения данных из таблицы discord_users
app.get('/discord', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM discord_users'); // Запрос к таблице discord_users
    res.json(result.rows);  // Отправляем данные в формате JSON
  } catch (err) {
    console.error('Error fetching discord data', err);
    res.status(500).send('Internal Server Error');
  }
});

// Пример маршрута для получения данных из таблицы telegram_users
app.get('/telegram', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM telegram_users'); // Запрос к таблице telegram_users
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching telegram data', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/discord/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  try {
    const result = await client.query('SELECT * FROM discord_users WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching discord user', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/telegram/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  try {
    const result = await client.query('SELECT * FROM telegram_users WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching telegram user', err);
    res.status(500).send('Internal Server Error');
  }
});