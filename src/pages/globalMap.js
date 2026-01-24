import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createEl } from '../utils/dom.js';

import { openLoginModal } from '../ui/loginModal.js';

const CONFIG = {
  globe: {
    radius: 5,
    segments: 48,              
    rotationSpeed: 0.0003,
    pointSize: 0.055,
  },
  camera: {
    fov: 45,
    near: 0.1,
    far: 1000,
    initialDistance: 18,
    minDistance: 8,
    maxDistance: 35,
  },
  colors: {
    gold: 0xffffff,
    globeDark: 0x0d0d10,
    background: 0x0a0a0c,
    border: 0xaaaaaa,
    user: 0xf2c14e,
  },
  animation: {
    rotateToUserDuration: 2000,
    targetFps: 60,            
  },
  quality: {
    landMaskW: 1024,
    landMaskH: 512,
    landPointsHigh: 26000,    
    landPointsLow: 14000,     
    borderDecimateHigh: 1,    
    borderDecimateLow: 2,     
    pixelRatioHigh: 2,
    pixelRatioLow: 1.5,
  },
};

const STORAGE_KEY = 'bulkhub_user_location';


const PUBLIC_COUNTRY_CACHE_KEY = 'bulkhub_public_country_markers_v1';
const PUBLIC_COUNTRY_CACHE_TTL_MS = 10 * 60 * 1000; 
const PUBLIC_COUNTRY_REFRESH_MS = 60 * 1000; 


const _countryCentroidsByNorm = new Map(); 


let _publicCountryCache = null; 

function _normCountry(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z\u00C0-\u024F\u0400-\u04FF0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const _countryAliases = new Map([
  ['united kingdom', 'uk'],
  ['great britain', 'uk'],
  ['england', 'uk'],
  ['scotland', 'uk'],
  ['wales', 'uk'],
  ['u k', 'uk'],
  ['u.k', 'uk'],
  ['u.k.', 'uk'],
  ['uk', 'uk'],
  ['united states of america', 'united states'],
  ['u s a', 'united states'],
  ['u.s.a', 'united states'],
  ['usa', 'united states'],
  ['u s', 'united states'],
  ['u.s', 'united states'],
  ['russian federation', 'russia'],
  ['uae', 'uae'],
  ['united arab emirates', 'uae'],
]);

function _canonCountryKey(country) {
  let k = _normCountry(country);
  if (_countryAliases.has(k)) k = _countryAliases.get(k);
  return k;
}

function _readPublicCountryCache({ allowExpired = false } = {}) {
  if (_publicCountryCache?.items?.length) return _publicCountryCache;
  try {
    const raw = localStorage.getItem(PUBLIC_COUNTRY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !Array.isArray(parsed?.items)) return null;
    if (!allowExpired && Date.now() - parsed.ts > PUBLIC_COUNTRY_CACHE_TTL_MS) return null;
    _publicCountryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function _readPublicCountryCacheAny() {
  
  return _readPublicCountryCache({ allowExpired: true });
}


function _writePublicCountryCache(items) {
  const payload = { ts: Date.now(), items };
  _publicCountryCache = payload;
  try {
    localStorage.setItem(PUBLIC_COUNTRY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    
  }
}


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

function toFiniteNumber(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
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


async function loadMyMarkerFromBackend() {
  
  return await api('/markers/me', { method: 'GET', auth: true });
}

async function saveMarkerToBackend({ country, city, lat, lon }) {
  
  return await api('/markers', {
    method: 'POST',
    auth: true,
    body: { country, city, lat, lng: lon },
  });
}


let loginEventHandler = null;

let topojson = null;
let scene;
let camera;
let renderer;
let labelRenderer;
let controls;
let globeGroup;
let landPoints;
let countryBorders;
let userMarker = null;
let globeSphereMesh = null; 


let countriesIndex = null; 
let countriesIndexPromise = null;

let countriesIndexAbort = null; 


const publicCountryCounts = new Map();


let publicMarkersTimer = null;
let lastPublicMarkersFetchAt = 0;

let publicRaycaster = null;
let publicMouse = null;
let publicTooltipObject = null; 
let publicTooltipEl = null; 
let publicPointerX = 0;
let publicPointerY = 0;
let publicTooltipVisible = false;
let publicTooltipNameEl = null;
let publicTooltipCountEl = null;
let publicPointerMoveHandler = null;
let publicPointerLeaveHandler = null;
let publicPointerTargetEl = null;
let publicNeedsPick = false;
let publicLastPointerEvent = null;

// Tap detection для мобильных устройств
let publicTapHandler = null;
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;


let hoverCountryKey = null;
let hoverCountryOutline = null; 
const countryOutlineCache = new Map(); 

let isUserInteracting = false;
let lastInteractionTime = 0;
const interactionCooldown = 2000;

const labelObjects = [];
let animationId = null;
let isActive = false;

let mountEl;
let stageEl;
let canvasHost;
let labelsHost;

let locationPanel;
let locationForm;
let cityInput;
let countryInput;
let submitBtn;
let changeLocationBtn;
let locationStatus;
let locationSummary;
let errorMsg;

let resizeObserver;
let currentLocation = null;
let handleLocationSubmit;
let handleChangeLocation;

let glowTexture = null;


let isInView = true;
let isPaused = false;
let lastRenderTime = 0;
let labelTick = 0;
let intersectionObserver = null;
let visibilityHandler = null;


let QUALITY = null;

export async function initGlobalMap(target) {
  
  if (isActive) {
    try { destroyGlobalMap(); } catch {}
  }

  mountEl = target;
  retryCount = 0; // Сбрасываем счётчик ретраев
  
  const layout = buildLayout();
  target.innerHTML = '';
  target.appendChild(layout);

  try {
    labelObjects.length = 0;
    lastInteractionTime = 0;
    isUserInteracting = false;
    isActive = true;

    QUALITY = detectQuality();
    
    // Логируем качество для отладки на мобильных
    if (QUALITY.isMobile) {
      console.log('Globe: mobile mode enabled', {
        isIOS: QUALITY.isIOS,
        isIOSSafari: QUALITY.isIOSSafari,
        pixelRatioCap: QUALITY.pixelRatioCap,
        landPoints: QUALITY.landPoints
      });
    }

    // Ждём несколько кадров чтобы DOM layout завершился
    // На мобильных устройствах требуется больше времени
    const frameCount = QUALITY.isMobile ? 3 : 2;
    for (let i = 0; i < frameCount; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    // Проверяем что контейнер имеет реальные размеры
    // На мобильных даём больше времени
    const timeout = QUALITY.isMobile ? 5000 : 3000;
    await waitForValidSize(stageEl, timeout);

    // Используем retry-механизм для надёжности
    await initWithRetry(target);
    
    // Принудительный resize после инициализации
    // Несколько попыток для надёжности на мобильных
    const resizeAttempts = QUALITY.isMobile ? 3 : 2;
    for (let i = 0; i < resizeAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
      if (isActive && renderer && camera) {
        handleResize();
      }
    }
    
    return destroyGlobalMap;
  } catch (err) {
    console.error('Globe initialization failed:', err);
    target.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'page-shell';
    
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'text-align: center; padding: 40px 20px;';
    
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = `Не удалось загрузить глобус: ${err?.message || String(err)}`;
    
    // Кнопка повторной попытки
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn-secondary';
    retryBtn.style.marginTop = '16px';
    retryBtn.textContent = 'Попробовать снова';
    retryBtn.onclick = () => initGlobalMap(target);
    
    errorDiv.appendChild(p);
    errorDiv.appendChild(retryBtn);
    shell.appendChild(errorDiv);
    target.appendChild(shell);
    
    return () => {};
  }
}

// Утилита: ждём пока контейнер получит валидные размеры (не 0x0)
function waitForValidSize(element, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      if (!isActive) {
        reject(new Error('Globe initialization cancelled'));
        return;
      }
      
      const rect = element?.getBoundingClientRect?.();
      // На мобильных устройствах минимальный размер меньше
      const minSize = window.innerWidth <= 768 ? 50 : 100;
      
      if (rect && rect.width > minSize && rect.height > minSize) {
        resolve({ width: rect.width, height: rect.height });
        return;
      }
      
      if (Date.now() - startTime > timeoutMs) {
        // Fallback: используем window размеры если контейнер так и не получил размеры
        console.warn('Globe container did not get valid size, using fallback');
        const fallbackWidth = Math.max(300, window.innerWidth - 32);
        const fallbackHeight = Math.max(300, window.innerHeight * 0.5);
        resolve({ width: fallbackWidth, height: fallbackHeight });
        return;
      }
      
      requestAnimationFrame(check);
    };
    
    check();
  });
}

// Проверка поддержки WebGL
function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      return { supported: false, reason: 'WebGL not available' };
    }
    
    // Проверяем что контекст не потерян
    if (gl.isContextLost && gl.isContextLost()) {
      return { supported: false, reason: 'WebGL context lost' };
    }
    
    // Получаем информацию о рендерере для отладки
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
    
    return { supported: true, renderer };
  } catch (e) {
    return { supported: false, reason: e.message };
  }
}

// Auto-retry механизм при проблемах с инициализацией
let retryCount = 0;
const MAX_RETRIES = 2;

async function initWithRetry(target) {
  const webglCheck = checkWebGLSupport();
  if (!webglCheck.supported) {
    throw new Error(`WebGL не поддерживается: ${webglCheck.reason}`);
  }
  
  try {
    await init();
    retryCount = 0; // Сбрасываем счётчик при успехе
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.warn(`Globe init failed, retrying (${retryCount}/${MAX_RETRIES})...`, err);
      
      // Ждём перед повторной попыткой
      await new Promise(r => setTimeout(r, 500));
      
      // Очищаем предыдущую попытку
      try { destroyGlobalMap(); } catch {}
      isActive = true;
      
      // Пересоздаём layout
      const layout = buildLayout();
      target.innerHTML = '';
      target.appendChild(layout);
      
      // Ждём DOM
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await waitForValidSize(stageEl, 2000);
      
      return initWithRetry(target);
    }
    throw err;
  }
}

export function destroyGlobalMap() {
  isActive = false;

  // Очищаем таймаут проверки рендера
  if (renderCheckTimeout) {
    clearTimeout(renderCheckTimeout);
    renderCheckTimeout = null;
  }
  
  detachPublicHoverHandlers();

  
  try { countriesIndexAbort?.abort(); } catch {}
  countriesIndexAbort = null;
  
  countriesIndexPromise = null;
  if (Array.isArray(countriesIndex) && countriesIndex.length === 0) countriesIndex = null;

  
  if (publicTooltipEl?.parentNode) {
    try { publicTooltipEl.parentNode.removeChild(publicTooltipEl); } catch {}
  }
  publicTooltipEl = null;
  publicTooltipVisible = false;



  
  if (publicMarkersTimer) {
    clearInterval(publicMarkersTimer);
    publicMarkersTimer = null;
  }
  lastPublicMarkersFetchAt = 0;

  
  if (loginEventHandler) {
    window.removeEventListener('bulk:login', loginEventHandler);
    loginEventHandler = null;
  }


  window.removeEventListener('resize', handleResize);
  resizeObserver?.disconnect();

  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (controls) controls.dispose();

  if (renderer) {
    renderer.dispose();
    if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
  if (labelRenderer?.domElement?.parentNode) {
    labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
  }

  if (scene) {
    scene.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
      if (child.element && child.element.parentNode) {
        child.element.parentNode.removeChild(child.element);
      }
    });
  }

  
  try {
    for (const obj of countryOutlineCache.values()) {
      try { obj.parent?.remove(obj); } catch {}
      try { obj.geometry?.dispose?.(); } catch {}
      try {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose?.();
      } catch {}
    }
    countryOutlineCache.clear();
  } catch {}
  hoverCountryOutline = null;
  hoverCountryKey = null;

  if (glowTexture) {
    glowTexture.dispose?.();
    glowTexture = null;
  }

  userMarker = null;
  landPoints = null;
  countryBorders = null;
  scene = null;
  camera = null;
  renderer = null;
  labelRenderer = null;
  controls = null;
  globeGroup = null;
  mountEl = null;
  stageEl = null;
  canvasHost = null;
  labelsHost = null;

  if (locationForm && handleLocationSubmit) {
    locationForm.removeEventListener('submit', handleLocationSubmit);
  }
  if (changeLocationBtn && handleChangeLocation) {
    changeLocationBtn.removeEventListener('click', handleChangeLocation);
  }

  handleLocationSubmit = null;
  handleChangeLocation = null;

  locationPanel = null;
  locationForm = null;
  cityInput = null;
  countryInput = null;
  submitBtn = null;
  changeLocationBtn = null;
  locationStatus = null;
  locationSummary = null;
  errorMsg = null;
  currentLocation = null;

  labelObjects.length = 0;
}

async function init() {
  topojson = await loadTopoJson();

  setupScene();
  setupCamera();
  setupRenderers();
  setupControls();
  setupLights();

  globeGroup = new THREE.Group();
  scene.add(globeGroup);

  createGlobeSphere();
  await loadAndCreateLandPoints(); 
  await loadLabels();

  
  setupPublicMarkersLayer();
  renderPublicMarkersFromCache(); 
  refreshPublicCountryMarkers().catch(() => {});
  startPublicMarkersRefresh();

  setupLocationPanel();
  await checkSavedLocation();
  startResizeWatcher();
  startVisibilityWatchers();

  animate();
  
  // Проверка успешности рендера после инициализации
  // Это решает проблему "не грузится с первого раза" на десктопе
  scheduleRenderCheck();
}

// Проверяем что глобус успешно отрендерился
// Решает проблему "не грузится с первого раза" на десктопе
let renderCheckTimeout = null;
let renderCheckCount = 0;

function scheduleRenderCheck() {
  if (renderCheckTimeout) {
    clearTimeout(renderCheckTimeout);
  }
  renderCheckCount = 0;
  
  const doCheck = () => {
    if (!isActive || !renderer) return;
    renderCheckCount++;
    
    const canvas = renderer.domElement;
    const hasValidSize = canvas && canvas.width > 0 && canvas.height > 0;
    
    // Также проверяем что контейнер видим
    const containerRect = stageEl?.getBoundingClientRect?.();
    const containerVisible = containerRect && containerRect.width > 50 && containerRect.height > 50;
    
    if (!hasValidSize || !containerVisible) {
      console.warn(`Globe: render check #${renderCheckCount} failed`, {
        canvasW: canvas?.width,
        canvasH: canvas?.height,
        containerW: containerRect?.width,
        containerH: containerRect?.height
      });
      
      // Принудительный resize
      handleResize();
      
      // Если после 3 попыток всё ещё не работает - останавливаемся
      if (renderCheckCount < 3) {
        renderCheckTimeout = setTimeout(doCheck, 1000 * renderCheckCount);
      }
    } else {
      // Успешно! Делаем финальный рендер
      if (scene && camera) {
        renderer.render(scene, camera);
      }
    }
  };
  
  // Первая проверка через 300ms
  renderCheckTimeout = setTimeout(doCheck, 300);
}

function detectQuality() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const screenWidth = window.innerWidth;
  
  // Определяем мобильное устройство
  const isMobile = screenWidth <= 768 || window.matchMedia('(pointer: coarse)').matches;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  // На iOS Safari WebGL особенно требователен к ресурсам
  const isIOSSafari = isIOS && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  
  // Определяем уровень качества
  // Мобильные устройства всегда используют низкое качество для стабильности
  const low = isMobile || cores <= 4 || mem <= 4 || dpr >= 2.5;
  
  // Ещё более агрессивное ограничение для iOS Safari
  const veryLow = isIOSSafari || (isMobile && dpr >= 3);
  
  // Ограничиваем DPR: на мобильных максимум 1.5, на iOS Safari максимум 1
  let pixelRatioCap;
  if (veryLow) {
    pixelRatioCap = 1; // iOS Safari - минимальный DPR для стабильности
  } else if (isMobile) {
    pixelRatioCap = 1.5; // Мобильные - умеренный DPR
  } else if (low) {
    pixelRatioCap = CONFIG.quality.pixelRatioLow;
  } else {
    pixelRatioCap = CONFIG.quality.pixelRatioHigh;
  }
  
  // Уменьшаем количество точек на мобильных для производительности
  let landPoints;
  if (veryLow) {
    landPoints = 8000; // Минимум для iOS Safari
  } else if (isMobile) {
    landPoints = 10000; // Мобильные
  } else if (low) {
    landPoints = CONFIG.quality.landPointsLow;
  } else {
    landPoints = CONFIG.quality.landPointsHigh;
  }

  return {
    isLow: low,
    isMobile,
    isIOS,
    isIOSSafari,
    landPoints,
    borderDecimate: (isMobile || low) ? CONFIG.quality.borderDecimateLow : CONFIG.quality.borderDecimateHigh,
    pixelRatioCap,
    maskW: isMobile ? 512 : CONFIG.quality.landMaskW, // Уменьшаем текстуру на мобильных
    maskH: isMobile ? 256 : CONFIG.quality.landMaskH,
  };
}

function buildLayout() {
  const wrapper = createEl('div', { className: 'page-shell page-shell--map' });
  const header = createEl('div', { className: 'page-header' });
  header.innerHTML = `
    <div>
      <p class="eyebrow">Map</p>
      <h1>Global map</h1>
      <p class="muted">Set your own location and see the location of others</p>
    </div>
  `;

  stageEl = createEl('div', { className: 'map-stage' });
  const stageInner = createEl('div', { className: 'map-stage__inner' });

  canvasHost = createEl('div', { className: 'globe-container' });
  labelsHost = createEl('div', { className: 'labels-container' });
  locationPanel = createLocationPanel();

  stageInner.append(canvasHost, labelsHost, locationPanel);
  stageEl.appendChild(stageInner);

  wrapper.append(header, stageEl);
  return wrapper;
}

function createLocationPanel() {
  const panel = createEl('div', { className: 'location-panel', attrs: { id: 'location-panel' } });
  panel.innerHTML = `
    <div class="location-panel__header">
      <p class="eyebrow">Location</p>
      <h2>Set Your Location</h2>
      <p class="muted">Manually pin your city and country to stay private</p>
    </div>
    <div class="location-panel__status hidden" id="location-status">
      <div class="location-panel__label">Current placement</div>
      <div class="location-panel__value" id="location-summary">Location not set</div>
    </div>
    <form id="location-form">
      <div class="form-group">
        <label for="city-input">City</label>
        <input type="text" id="city-input" name="city" placeholder="e.g. London" required autocomplete="off" />
      </div>
      <div class="form-group">
        <label for="country-input">Country</label>
        <input type="text" id="country-input" name="country" placeholder="e.g. United Kingdom" required autocomplete="off" />
      </div>
      <div class="form-actions">
        <button type="submit" id="submit-btn" class="btn-primary">
          <span class="btn-text">Show on Globe</span>
          <span class="btn-loader hidden">
            <svg class="spinner" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4 31.4" stroke-linecap="round"></circle>
            </svg>
          </span>
        </button>
      </div>
      <div id="error-message" class="error-message hidden"></div>
    </form>
    <button type="button" id="change-location-btn" class="btn-secondary location-panel__change hidden">Change Location</button>
  `;
  return panel;
}

async function loadTopoJson() {
  try {
    
    const mod = await import('https://esm.sh/topojson-client@3.1.0');
    return mod;
  } catch (e) {
    
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js');
      if (window.topojson) return window.topojson;
    } catch {}
    await loadScript('https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js');
    return window.topojson;
  }
}


function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.colors.background);
}

function setupCamera() {
  const { width, height } = getStageSize();
  const aspect = width / height;
  camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, CONFIG.camera.near, CONFIG.camera.far);
  camera.position.z = CONFIG.camera.initialDistance;
}

function setupRenderers() {
  const { width, height } = getStageSize();
  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY.pixelRatioCap);

  // На мобильных отключаем антиалиасинг для производительности
  // На iOS Safari это критично для стабильности WebGL
  const useAA = !QUALITY.isMobile && dpr <= 1.5;
  
  // Для iOS Safari используем более консервативные настройки
  const powerPref = QUALITY.isIOSSafari ? 'low-power' : 'high-performance';

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: useAA,
      alpha: true,
      powerPreference: powerPref,
      depth: true,
      stencil: false,
      // На iOS Safari лучше preserveDrawingBuffer: false для производительности
      preserveDrawingBuffer: false,
      // Ограничиваем точность на мобильных
      precision: QUALITY.isMobile ? 'mediump' : 'highp',
    });
  } catch (e) {
    console.error('Failed to create WebGL renderer:', e);
    throw new Error('WebGL renderer creation failed');
  }

  renderer.setSize(width, height);
  renderer.setPixelRatio(dpr);
  
  // Устанавливаем стили для canvas чтобы он занимал весь контейнер
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  
  canvasHost.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.inset = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelsHost.appendChild(labelRenderer.domElement);
  
  // На мобильных добавляем слушатель потери контекста WebGL
  if (QUALITY.isMobile) {
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost');
    }, false);
    
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored');
      // При восстановлении контекста пересоздаём рендер
      if (isActive) {
        handleResize();
      }
    }, false);
  }
}

function setupControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.minDistance = CONFIG.camera.minDistance;
  controls.maxDistance = CONFIG.camera.maxDistance;
  controls.enablePan = false;

  controls.addEventListener('start', () => {
    isUserInteracting = true;
  });

  controls.addEventListener('end', () => {
    isUserInteracting = false;
    lastInteractionTime = Date.now();
  });

  controls.addEventListener('change', () => {
    
    if (publicLastPointerEvent) publicNeedsPick = true;
  });
}


function setupLights() {
  const ambientLight = new THREE.AmbientLight(0x404050, 0.55);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.32);
  directionalLight.position.set(5, 3, 5);
  scene.add(directionalLight);
}

function createGlobeSphere() {
  const geometry = new THREE.SphereGeometry(
    CONFIG.globe.radius - 0.03,
    CONFIG.globe.segments,
    CONFIG.globe.segments,
  );

  const material = new THREE.MeshPhongMaterial({
    color: CONFIG.colors.globeDark,
    shininess: 6,
    depthWrite: true,
  });

  const sphere = new THREE.Mesh(geometry, material);
  sphere.renderOrder = 0;
  globeGroup.add(sphere);

  
  globeSphereMesh = sphere;

  createAtmosphereGlow();
}

function createAtmosphereGlow() {
  const glowGeometry = new THREE.SphereGeometry(CONFIG.globe.radius + 0.1, CONFIG.globe.segments, CONFIG.globe.segments);

  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x1a1a25) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      uniform vec3 glowColor;
      void main() {
        float intensity = pow(0.65 - dot(vNormal, vPositionNormal), 2.0);
        gl_FragColor = vec4(glowColor, intensity * 0.5);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  glowMesh.renderOrder = 1;
  globeGroup.add(glowMesh);
}

async function loadAndCreateLandPoints() {
  try {
    let topoData;

    
    try {
      const localResponse = (await (async () => {
        const urls = ['./data/land-110m.json', '/data/land-110m.json'];
        for (const url of urls) {
          try {
            const r = await fetch(url);
            if (r && r.ok) return r;
          } catch {}
        }
        return null;
      })());
      if (localResponse && localResponse.ok) {
        const text = await localResponse.text();
        if (text.trim().length > 10) topoData = JSON.parse(text);
      }
    } catch (e) {
      
    }

    
    if (!topoData) {
      const cdnResponse = await fetch('https://unpkg.com/world-atlas@2.0.2/land-110m.json');
      topoData = await cdnResponse.json();
    }

    
    const landGeoJSON = topojson.feature(topoData, topoData.objects.land);

    
    const mask = buildLandMask(landGeoJSON, QUALITY.maskW, QUALITY.maskH);
    createLandPointsFromMask(mask, QUALITY.maskW, QUALITY.maskH, QUALITY.landPoints);

    await loadCountryBorders(); 
  } catch (error) {
    console.error('Failed to load land data:', error);
    createFallbackPoints();
  }
}

async function loadCountryBorders() {
  try {
    const response = await fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');
    const topoData = await response.json();

    
    const mesh = topojson.mesh(topoData, topoData.objects.countries, (a, b) => a !== b);
    createCountryBordersFromMesh(mesh);
  } catch (error) {
    console.warn('Failed to load country borders:', error);
  }
}

function createCountryBordersFromMesh(meshGeoJSON) {
  if (!meshGeoJSON || !meshGeoJSON.coordinates) return;

  const dec = QUALITY.borderDecimate;

  const positions = [];
  const r = CONFIG.globe.radius + 0.01;

  
  const lines = meshGeoJSON.coordinates;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line || line.length < 2) continue;

    
    for (let i = dec; i < line.length; i += dec) {
      const a = line[i - dec];
      const b = line[i];
      if (!a || !b) continue;

      const p1 = latLonToVector3(a[1], a[0], r);
      const p2 = latLonToVector3(b[1], b[0], r);
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  if (positions.length < 6) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: CONFIG.colors.border,
    transparent: true,
    opacity: 0.35,
    depthTest: true,
    depthWrite: false,
  });

  const borders = new THREE.LineSegments(geometry, material);
  borders.renderOrder = 2;
  countryBorders = borders;
  globeGroup.add(borders);
}

function buildLandMask(landGeoJSON, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#fff';

  
  const proj = (lon, lat) => {
    const x = ((lon + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return [x, y];
  };

  const unwrapRing = (ring) => {
    
    const out = [];
    let prevLon = ring[0][0];
    let offset = 0;
    out.push([prevLon, ring[0][1]]);
    for (let i = 1; i < ring.length; i++) {
      const lon = ring[i][0];
      const lat = ring[i][1];
      let d = lon - prevLon;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
      const adjLon = lon + offset;
      out.push([adjLon, lat]);
      prevLon = lon;
    }
    return out;
  };

  const drawPolygon = (poly) => {
    
    ctx.beginPath();

    for (let ri = 0; ri < poly.length; ri++) {
      const ring = poly[ri];
      if (!ring || ring.length < 3) continue;

      const unwrapped = unwrapRing(ring);

      
      const shifts = [0, -width, width];

      for (let si = 0; si < shifts.length; si++) {
        const dx = shifts[si];
        for (let i = 0; i < unwrapped.length; i++) {
          const [lon, lat] = unwrapped[i];
          const [x0, y0] = proj(lon, lat);
          const x = x0 + dx;

          if (i === 0) ctx.moveTo(x, y0);
          else ctx.lineTo(x, y0);
        }
        ctx.closePath();
      }
    }

    
    ctx.fill('evenodd');
  };

  const drawGeometry = (geom) => {
    if (!geom) return;
    if (geom.type === 'Polygon') {
      drawPolygon(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      for (let i = 0; i < geom.coordinates.length; i++) {
        drawPolygon(geom.coordinates[i]);
      }
    }
  };

  if (landGeoJSON.type === 'FeatureCollection') {
    for (let fi = 0; fi < landGeoJSON.features.length; fi++) {
      drawGeometry(landGeoJSON.features[fi].geometry);
    }
  } else if (landGeoJSON.type === 'Feature') {
    drawGeometry(landGeoJSON.geometry);
  } else {
    drawGeometry(landGeoJSON);
  }

  const img = ctx.getImageData(0, 0, width, height);
  return img.data; 
}

function isLandPixel(maskData, w, h, lon, lat) {
  
  let u = (lon + 180) / 360;
  let v = (90 - lat) / 180;

  
  u = ((u % 1) + 1) % 1;
  v = Math.min(0.999999, Math.max(0, v));

  const x = Math.floor(u * w);
  const y = Math.floor(v * h);
  const idx = (y * w + x) * 4;

  
  return maskData[idx] > 0;
}

function createLandPointsFromMask(maskData, w, h, desiredCount) {
  const positions = [];
  const r = CONFIG.globe.radius;

  if (!glowTexture) glowTexture = createGlowTexture();

  
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  
  const candidates = Math.floor(desiredCount * 2.3);

  let found = 0;

  for (let i = 0; i < candidates && found < desiredCount; i++) {
    const t = (i + 0.5) / candidates;
    const y = 1 - 2 * t; 
    const radiusXZ = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * radiusXZ;
    const z = Math.sin(theta) * radiusXZ;

    
    const lat = Math.asin(y) * (180 / Math.PI);
    const lon = Math.atan2(z, x) * (180 / Math.PI);

    if (!isLandPixel(maskData, w, h, lon, lat)) continue;

    const p = latLonToVector3(lat, lon, r);
    positions.push(p.x, p.y, p.z);
    found++;
  }

  if (positions.length < 3000) {
    
    createFallbackPoints();
    return;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: CONFIG.globe.pointSize,
    map: glowTexture,
    color: CONFIG.colors.gold,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
  });

  landPoints = new THREE.Points(geometry, material);
  landPoints.renderOrder = 1;
  globeGroup.add(landPoints);
}

function createFallbackPoints() {
  const positions = [];
  const count = QUALITY.isLow ? 9000 : 15000;

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const y = 1 - 2 * t;
    const rXZ = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = CONFIG.globe.radius * Math.cos(theta) * rXZ;
    const z = CONFIG.globe.radius * Math.sin(theta) * rXZ;
    const yy = CONFIG.globe.radius * y;
    positions.push(x, yy, z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  if (!glowTexture) glowTexture = createGlowTexture();

  const material = new THREE.PointsMaterial({
    size: CONFIG.globe.pointSize,
    map: glowTexture,
    color: CONFIG.colors.gold,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });

  landPoints = new THREE.Points(geometry, material);
  globeGroup.add(landPoints);
}

function createGlowTexture() {
  const size = 256;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.15, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

async function loadLabels() {
  try {
    const urls = ['./data/labels.json', '/data/labels.json'];
    let response = null;
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (r && r.ok) {
          response = r;
          break;
        }
      } catch {
        
      }
    }
    if (!response) throw new Error('labels.json fetch failed');

    const labels = await response.json();
    if (!Array.isArray(labels)) throw new Error('labels.json must be an array');

    indexCountryCentroids(labels);
    for (const label of labels) {
      createLabel(label?.name, label?.lat, label?.lon, label?.size || 1);
    }
  } catch (error) {
    console.error('Failed to load labels:', error);
  }
}

function createLabel(name, lat, lon, size = 1) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const labelDiv = document.createElement('div');
  labelDiv.className = 'globe-label';

  const safeSize = Number.isFinite(Number(size)) ? Number(size) : 1;
  const fontSize = Math.max(8, Math.min(12, 10 * safeSize));

  const span = document.createElement('span');
  span.className = 'label-text';
  span.style.fontSize = `${fontSize}px`;
  span.textContent = String(name || '');
  labelDiv.appendChild(span);

  const labelObject = new CSS2DObject(labelDiv);
  const position = latLonToVector3(lat, lon, CONFIG.globe.radius + 0.02);
  labelObject.position.copy(position);

  labelObject.userData = { lat, lon, element: labelDiv, size: safeSize };

  labelObjects.push(labelObject);
  globeGroup.add(labelObject);
}


function indexCountryCentroids(labels) {
  try {
    _countryCentroidsByNorm.clear();
    for (const l of labels || []) {
      const lat = toFiniteNumber(l?.lat);
      const lon = toFiniteNumber(l?.lon);
      if (!l?.name || lat === null || lon === null) continue;
      const key = _canonCountryKey(l.name);
      
      _countryCentroidsByNorm.set(key, { name: l.name, lat, lon });
    }
  } catch {
    
  }
}

function getCountryCentroid(countryName) {
  const key = _canonCountryKey(countryName);
  return _countryCentroidsByNorm.get(key) || null;
}






async function loadCountriesIndex() {
  if (countriesIndex && countriesIndex.length) return countriesIndex;
  if (countriesIndexPromise) return countriesIndexPromise;

  countriesIndexPromise = (async () => {
    try {
      
      if (!topojson) topojson = await loadTopoJson();

      
      try { countriesIndexAbort?.abort(); } catch {}
      countriesIndexAbort = new AbortController();
      const { signal } = countriesIndexAbort;

      
      
      const topoUrls = [
        '/data/countries-110m.json',
        './data/countries-110m.json',
        
        'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        
        'https://unpkg.com/world-atlas@2/countries-110m.json',
      ];

      const looksLikeHtml = (txt) => /^\s*</.test(String(txt || ''));
      const safeFetchJson = async (url) => {
        try {
          const r = await fetch(url, { cache: 'no-store', signal });
          if (!r || !r.ok) return null;

          
          
          const ct = (r.headers.get('content-type') || '').toLowerCase();
          const txt = await r.text();

          if (!txt) return null;
          if (ct.includes('text/html')) return null;
          if (looksLikeHtml(txt)) return null;

          const data = JSON.parse(txt);
          return data;
        } catch {
          return null;
        }
      };

      let topoData = null;
      for (const url of topoUrls) {
        const data = await safeFetchJson(url);
        if (data?.objects?.countries) {
          topoData = data;
          break;
        }
      }

      if (!topoData) {
        throw new Error('countries-110m.json not available (invalid JSON or HTML fallback)');
      }

      const features =
        topojson.feature(topoData, topoData.objects.countries)?.features || [];

      const index = [];
      for (const f of features) {
        const name = String(f?.properties?.name || '').trim();
        if (!name) continue;

        const key = _canonCountryKey(name);
        if (!key) continue;

        const bbox = computeGeomBBox(f.geometry);
        index.push({
          id: String(f?.id ?? ''),
          name,
          key,
          bbox,
          geometry: f.geometry,
        });
      }

      countriesIndex = index;
      return index;
    } catch (e) {
      if (e?.name !== 'AbortError' && !countriesIndexAbort?.signal?.aborted) {
        console.warn('Countries hover index failed:', e);
      }
      
      countriesIndex = null;
      countriesIndexPromise = null;
      return null;
    }
  })();

  return countriesIndexPromise;
}



function computeGeomBBox(geom) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  let minLon360 = 360, maxLon360 = 0;

  const push = (lon, lat) => {
    if (typeof lon !== 'number' || typeof lat !== 'number') return;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;

    const lon360 = ((lon % 360) + 360) % 360;
    if (lon360 < minLon360) minLon360 = lon360;
    if (lon360 > maxLon360) maxLon360 = lon360;
  };

  walkGeomCoords(geom, push);

  const span180 = maxLon - minLon;
  const span360 = maxLon360 - minLon360;

  const mode = span360 < span180 ? '360' : '180';

  return {
    minLat,
    maxLat,
    mode,
    minLon: mode === '360' ? minLon360 : minLon,
    maxLon: mode === '360' ? maxLon360 : maxLon,
  };
}

function walkGeomCoords(geom, fn) {
  if (!geom) return;
  const t = geom.type;
  const c = geom.coordinates;

  if (t === 'Polygon') {
    for (const ring of c || []) for (const p of ring || []) fn(p[0], p[1]);
  } else if (t === 'MultiPolygon') {
    for (const poly of c || []) for (const ring of poly || []) for (const p of ring || []) fn(p[0], p[1]);
  } else if (t === 'MultiLineString') {
    for (const line of c || []) for (const p of line || []) fn(p[0], p[1]);
  } else if (t === 'LineString') {
    for (const p of c || []) fn(p[0], p[1]);
  }
}

function vector3ToLatLon(worldPoint) {
  
  const v = worldPoint.clone().normalize();
  const phi = Math.acos(Math.max(-1, Math.min(1, v.y))); 
  const lat = 90 - (phi * 180) / Math.PI;

  const theta = Math.atan2(v.z, -v.x); 
  let lon = (theta * 180) / Math.PI - 180;
  
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  return { lat, lon };
}

function findCountryAt(lat, lon) {
  if (!countriesIndex || !countriesIndex.length) return null;

  const lon360 = ((lon % 360) + 360) % 360;

  for (const c of countriesIndex) {
    const b = c.bbox;
    if (!b) continue;

    if (lat < b.minLat || lat > b.maxLat) continue;

    if (b.mode === '360') {
      if (lon360 < b.minLon || lon360 > b.maxLon) continue;
    } else {
      if (lon < b.minLon || lon > b.maxLon) continue;
    }

    if (pointInGeometry(lon, lat, c.geometry)) return c;
  }

  return null;
}

function pointInGeometry(lon, lat, geom) {
  if (!geom) return false;

  if (geom.type === 'Polygon') {
    return pointInPolygon(lon, lat, geom.coordinates);
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates || []) {
      if (pointInPolygon(lon, lat, poly)) return true;
    }
  }
  return false;
}

function pointInPolygon(lon, lat, polyCoords) {
  if (!polyCoords || !polyCoords.length) return false;

  
  if (!pointInRing(lon, lat, polyCoords[0])) return false;

  for (let i = 1; i < polyCoords.length; i++) {
    if (pointInRing(lon, lat, polyCoords[i])) return false;
  }
  return true;
}

function adjustLonNear(lon, refLon) {
  let x = lon;
  while (x - refLon > 180) x -= 360;
  while (x - refLon < -180) x += 360;
  return x;
}

function pointInRing(lon, lat, ring) {
  if (!ring || ring.length < 3) return false;

  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    if (!pi || !pj) continue;

    const yi = pi[1];
    const yj = pj[1];

    
    const xi = adjustLonNear(pi[0], lon);
    const xj = adjustLonNear(pj[0], lon);

    const intersect = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

function updatePublicCountryCounts(items) {
  publicCountryCounts.clear();
  for (const i of items || []) {
    const key = i?.key ? String(i.key) : _canonCountryKey(i?.name || '');
    const count = Number(i?.count || 0);
    if (key && count > 0) publicCountryCounts.set(key, count);
  }
}


function setupPublicMarkersLayer() {
  if (!globeGroup) return;

  
  if (!countriesIndexPromise) {
    loadCountriesIndex().catch(() => {});
  }

  if (!publicRaycaster) publicRaycaster = new THREE.Raycaster();
  if (!publicMouse) publicMouse = new THREE.Vector2();

  ensurePublicHoverTooltip();
  attachPublicHoverHandlers();
}



function renderPublicMarkersFromCache() {
  const cached = _readPublicCountryCacheAny();
  if (!cached?.items?.length) return;

  
  updatePublicCountryCounts(cached.items);
}



function startPublicMarkersRefresh() {
  if (publicMarkersTimer) clearInterval(publicMarkersTimer);
  publicMarkersTimer = setInterval(() => {
    
    if (!isActive) return;
    if (isPaused) return;
    refreshPublicCountryMarkers().catch(() => {});
  }, PUBLIC_COUNTRY_REFRESH_MS);
}

 async function refreshPublicCountryMarkers() {
  
  const now = Date.now();
  if (now - lastPublicMarkersFetchAt < 2500) return;
  lastPublicMarkersFetchAt = now;

  let res;
  try {
    
    res = await api(`/markers?limit=2000`, { method: 'GET', auth: false });
  } catch {
    
    return;
  }

  const markers = Array.isArray(res)
    ? res
    : Array.isArray(res?.items)
      ? res.items
      : Array.isArray(res?.markers)
        ? res.markers
        : null;

  
  if (!markers) return;

  
  if (markers.length === 0) {
    _writePublicCountryCache([]);
    updatePublicCountryCounts([]);
    return;
  }

  const items = aggregateMarkersByCountry(markers);

  
  if (!items.length) return;

  _writePublicCountryCache(items);

  
  updatePublicCountryCounts(items);
}


function aggregateMarkersByCountry(markers) {
  const by = new Map(); 
  for (const m of markers || []) {
    const rawCountry = (m?.country || '').trim();
    if (!rawCountry) continue;

    const key = _canonCountryKey(rawCountry);
    if (!key) continue;

    const centroid = getCountryCentroid(rawCountry);
    const displayName = centroid?.name || rawCountry;

    let entry = by.get(key);
    if (!entry) {
      entry = {
        key,
        name: displayName,
        count: 0,
        latSum: 0,
        lonSum: 0,
        n: 0,
      };
      by.set(key, entry);
    }

    entry.count += 1;

    const lat = toFiniteNumber(m?.lat);
    const lon = toFiniteNumber(m?.lng);

    
    if (!centroid && lat !== null && lon !== null) {
      entry.latSum += lat;
      entry.lonSum += lon;
      entry.n += 1;
    }

    
    if (centroid?.name) entry.name = centroid.name;
  }

  const out = [];
  for (const entry of by.values()) {
    let lat = null;
    let lon = null;

    const centroid = _countryCentroidsByNorm.get(entry.key);
    if (centroid) {
      lat = centroid.lat;
      lon = centroid.lon;
    } else if (entry.n > 0) {
      lat = entry.latSum / entry.n;
      lon = entry.lonSum / entry.n;
    }

    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    out.push({
      key: entry.key,
      name: entry.name,
      count: entry.count,
      lat,
      lon,
    });
  }

  
  out.sort((a, b) => b.count - a.count);
  return out;
}


function optimisticUpdatePublicCountryCounts(prevCountry, nextCountry, coords) {
  const prevKey = prevCountry ? _canonCountryKey(prevCountry) : null;
  const nextKey = nextCountry ? _canonCountryKey(nextCountry) : null;
  if (!nextKey) return;

  const cached = _readPublicCountryCacheAny() || { ts: Date.now(), items: [] };
  const items = Array.isArray(cached?.items) ? cached.items.slice() : [];
  const by = new Map(items.map((i) => [i.key, { ...i }]));

  
  if (prevKey && prevKey !== nextKey) {
    const oldItem = by.get(prevKey);
    if (oldItem) {
      oldItem.count = Math.max(0, Number(oldItem.count || 0) - 1);
      if (oldItem.count <= 0) by.delete(prevKey);
      else by.set(prevKey, oldItem);
    }
  }

  
  let nextItem = by.get(nextKey);
  if (!nextItem) {
    const centroid = getCountryCentroid(nextCountry);
    const lat = toFiniteNumber(centroid?.lat) ?? toFiniteNumber(coords?.lat);
    const lon = toFiniteNumber(centroid?.lon) ?? toFiniteNumber(coords?.lon);

    if (typeof lat !== 'number' || typeof lon !== 'number') return;

    nextItem = {
      key: nextKey,
      name: centroid?.name || nextCountry,
      count: 0,
      lat,
      lon,
    };
  }

  
  if (!prevKey || prevKey !== nextKey) {
    nextItem.count = Number(nextItem.count || 0) + 1;
  }

  
  const cent = _countryCentroidsByNorm.get(nextKey);
  if (cent) {
    nextItem.lat = cent.lat;
    nextItem.lon = cent.lon;
    nextItem.name = cent.name || nextItem.name;
  }

  by.set(nextKey, nextItem);

  const out = Array.from(by.values()).filter((i) => Number(i.count || 0) > 0);
  out.sort((a, b) => Number(b.count || 0) - Number(a.count || 0));

  _writePublicCountryCache(out);
  updatePublicCountryCounts(out);
}





function clearCountryHighlight() {
  hoverCountryKey = null;
  if (hoverCountryOutline?.parent) {
    try { hoverCountryOutline.parent.remove(hoverCountryOutline); } catch {}
  }
  hoverCountryOutline = null;
}

function setCountryHighlight(country) {
  if (!country || !country.key || !country.geometry) return;
  if (!globeGroup) return;

  if (hoverCountryKey === country.key && hoverCountryOutline?.parent === globeGroup) return;

  clearCountryHighlight();

  const outline = getCountryOutlineMesh(country);
  if (!outline) return;

  hoverCountryKey = country.key;
  hoverCountryOutline = outline;

  
  if (outline.parent && outline.parent !== globeGroup) {
    try { outline.parent.remove(outline); } catch {}
  }
  if (outline.parent !== globeGroup) {
    globeGroup.add(outline);
  }
}

function getCountryOutlineMesh(country) {
  const key = country.key;
  const cached = countryOutlineCache.get(key);
  if (cached) return cached;

  const mesh = buildCountryOutlineMesh(country.geometry);
  if (!mesh) return null;

  countryOutlineCache.set(key, mesh);
  return mesh;
}

function buildCountryOutlineMesh(geometry) {
  if (!geometry) return null;

  const radius = (CONFIG?.globe?.radius || 10) + 0.18; 
  const positions = [];

  const addRing = (ring) => {
    if (!Array.isArray(ring) || ring.length < 2) return;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      if (!a || !b) continue;

      const lon1 = Number(a[0]); const lat1 = Number(a[1]);
      const lon2 = Number(b[0]); const lat2 = Number(b[1]);
      if (!Number.isFinite(lon1) || !Number.isFinite(lat1) || !Number.isFinite(lon2) || !Number.isFinite(lat2)) continue;

      const v1 = latLonToVector3(lat1, lon1, radius);
      const v2 = latLonToVector3(lat2, lon2, radius);

      positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    }
  };

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates || []) addRing(ring);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates || []) {
      for (const ring of poly || []) addRing(ring);
    }
  } else {
    return null;
  }

  if (positions.length < 6) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeBoundingSphere();

  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false,
  });
  mat.blending = THREE.AdditiveBlending;

  const lines = new THREE.LineSegments(geom, mat);
  lines.renderOrder = 20;
  lines.frustumCulled = false;

  return lines;
}


function ensurePublicHoverTooltip() {
  if (publicTooltipEl) return;

  const wrap = document.createElement('div');
  wrap.className = 'country-hover-tooltip-wrap';
  wrap.style.pointerEvents = 'none';
  wrap.style.position = 'fixed';
  wrap.style.left = '0px';
  wrap.style.top = '0px';
  
  
  
  
  wrap.style.transform = 'translate(-50%, calc(-100% - 9px))';
  wrap.style.zIndex = '9999';
  wrap.style.display = 'none';
  wrap.style.transition = 'none';
  wrap.style.willChange = 'left, top';

  
  const bubble = document.createElement('div');
  bubble.className = 'country-hover-tooltip';

  const title = document.createElement('div');
  title.className = 'country-hover-tooltip__title';

  const count = document.createElement('div');
  count.className = 'country-hover-tooltip__count';

  bubble.appendChild(title);
  bubble.appendChild(count);
  wrap.appendChild(bubble);

  publicTooltipNameEl = title;
  publicTooltipCountEl = count;

  document.body.appendChild(wrap);
  publicTooltipEl = wrap;
}

function attachPublicHoverHandlers() {
  const el = renderer?.domElement;
  if (!el) return;

  
  if (publicPointerMoveHandler && publicPointerTargetEl && publicPointerTargetEl !== el) {
    try { publicPointerTargetEl.removeEventListener('pointermove', publicPointerMoveHandler); } catch {}
    try { publicPointerTargetEl.removeEventListener('pointerleave', publicPointerLeaveHandler); } catch {}
    publicPointerTargetEl = null;
  }

  if (publicPointerMoveHandler && publicPointerTargetEl === el) return; 

  publicPointerMoveHandler = (ev) => {
    publicLastPointerEvent = ev;
    publicPointerX = ev.clientX;
    publicPointerY = ev.clientY;

    
    if (publicTooltipVisible && publicTooltipEl) {
      publicTooltipEl.style.left = `${publicPointerX}px`;
      publicTooltipEl.style.top = `${publicPointerY}px`;
    }

    publicNeedsPick = true;
  };

  publicPointerLeaveHandler = () => {
    clearPublicHoverTooltip();
  };

  el.addEventListener('pointermove', publicPointerMoveHandler, { passive: true });
  el.addEventListener('pointerleave', publicPointerLeaveHandler, { passive: true });
  
  // Tap detection для мобильных — показывает tooltip при коротком тапе
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }
  }, { passive: true });
  
  publicTapHandler = (e) => {
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);
    const dt = Date.now() - touchStartTime;
    
    // Если движение < 12px и время < 300ms — это tap
    if (dx < 12 && dy < 12 && dt < 300) {
      // Эмулируем pointermove в точке тапа для raycast
      publicLastPointerEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY
      };
      publicPointerX = touch.clientX;
      publicPointerY = touch.clientY;
      publicNeedsPick = true;
      
      // Принудительно обрабатываем pick сразу
      processPublicHoverPick();
    }
  };
  el.addEventListener('touchend', publicTapHandler, { passive: true });
  
  publicPointerTargetEl = el;
}


function detachPublicHoverHandlers() {
  const el = publicPointerTargetEl || renderer?.domElement;
  if (!el) return;

  if (publicPointerMoveHandler) {
    el.removeEventListener('pointermove', publicPointerMoveHandler);
    publicPointerMoveHandler = null;
  }
  if (publicPointerLeaveHandler) {
    el.removeEventListener('pointerleave', publicPointerLeaveHandler);
    publicPointerLeaveHandler = null;
  }
  if (publicTapHandler) {
    el.removeEventListener('touchend', publicTapHandler);
    publicTapHandler = null;
  }

  publicPointerTargetEl = null;
  clearPublicHoverTooltip();
}


function processPublicHoverPick() {
  if (!publicNeedsPick) return;
  if (!publicLastPointerEvent) return;
  if (!publicRaycaster || !publicMouse) return;
  if (!camera || !renderer) return;

  publicNeedsPick = false;

  
  if (!countriesIndex || !countriesIndex.length) {
    clearPublicHoverTooltip();
    return;
  }

  if (!globeSphereMesh) {
    clearPublicHoverTooltip();
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((publicLastPointerEvent.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((publicLastPointerEvent.clientY - rect.top) / rect.height) * 2 - 1);

  publicMouse.set(x, y);
  publicRaycaster.setFromCamera(publicMouse, camera);

  
  try { globeGroup?.updateMatrixWorld?.(true); } catch {}
  try { camera?.updateMatrixWorld?.(true); } catch {}
  try { globeSphereMesh?.updateMatrixWorld?.(true); } catch {}

  const hits = publicRaycaster.intersectObject(globeSphereMesh, true);
  if (!hits || !hits.length) {
    clearPublicHoverTooltip();
    return;
  }

  const hitPoint = hits[0].point;
  
  
  const hitLocal = globeSphereMesh.worldToLocal(hitPoint.clone());
  const { lat, lon } = vector3ToLatLon(hitLocal);

  const country = findCountryAt(lat, lon);
  if (!country) {
    clearPublicHoverTooltip();
    return;
  }

  setCountryHighlight(country);

  const key = country.key;
  const count = Number(publicCountryCounts.get(key) || 0);

  showPublicHoverTooltipAt(hitPoint, { name: country.name, count });
}

function showPublicHoverTooltipAt(_worldPoint, data) {
  ensurePublicHoverTooltip();
  if (!publicTooltipEl) return;

  const name = String(data?.name || '').trim();
  const count = Number(data?.count || 0);

  if (publicTooltipNameEl) publicTooltipNameEl.textContent = name || 'Unknown';
  if (publicTooltipCountEl) publicTooltipCountEl.textContent = `Members: ${count.toLocaleString()}`;

  
  const bubble = publicTooltipEl.querySelector?.('.country-hover-tooltip');
  if (bubble) {
    bubble.classList.toggle('country-hover-tooltip--zero', !(count > 0));
  }

  
  publicTooltipEl.style.left = `${publicPointerX}px`;
  publicTooltipEl.style.top = `${publicPointerY}px`;
  publicTooltipEl.style.display = 'block';
  publicTooltipVisible = true;
}


function clearPublicHoverTooltip() {
  if (publicTooltipEl) {
    publicTooltipEl.style.display = 'none';
  }
  publicTooltipVisible = false;
  clearCountryHighlight();
}

function updatePublicMarkersVisibility(_camDir) {
  
  return;
}

function setupLocationPanel() {
  if (!locationPanel) return;

  locationForm = locationPanel.querySelector('#location-form');
  submitBtn = locationPanel.querySelector('#submit-btn');
  changeLocationBtn = locationPanel.querySelector('#change-location-btn');
  errorMsg = locationPanel.querySelector('#error-message');
  locationStatus = locationPanel.querySelector('#location-status');
  locationSummary = locationPanel.querySelector('#location-summary');
  cityInput = locationForm.querySelector('#city-input');
  countryInput = locationForm.querySelector('#country-input');

  if (!locationForm) return;
  
  // Мобильный collapse toggle
  const panelHeader = locationPanel.querySelector('.location-panel__header');
  if (panelHeader && QUALITY?.isMobile) {
    // По умолчанию свёрнут на мобиле
    locationPanel.classList.add('is-collapsed');
    
    panelHeader.addEventListener('click', (e) => {
      // Не сворачиваем если кликнули на input/button
      if (e.target.closest('input, button, a')) return;
      locationPanel.classList.toggle('is-collapsed');
    });
  }

  showLocationForm();
  applyAuthUiState();

  
  loginEventHandler = () => {
    applyAuthUiState();
    checkSavedLocation().catch(() => {});
  };
  window.addEventListener('bulk:login', loginEventHandler);

  handleLocationSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    
    const token = getAuthToken();
    if (!token) {
      showError('Log in required to show your location on the globe.');
      openLoginModal();
      return;
    }

    const city = cityInput.value.trim();
    const country = countryInput.value.trim();
    const prevCountry =
      currentLocation?.country ||
      (() => {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')?.country || null;
        } catch {
          return null;
        }
      })();
    if (!city || !country) return;

    setLoading(true);
    hideError();

    try {
      const coords = await geocodeLocation(city, country);
      if (!coords) {
        showError('Location not found. Please check the city and country names.');
        return;
      }

      
      try {
        await saveMarkerToBackend({
          city,
          country,
          lat: coords.lat,
          lon: coords.lon,
        });
      } catch (err) {
        
        if (err?.status === 401) {
          clearAuthToken();
          applyAuthUiState();
          showError('Session expired. Please log in again.');
          openLoginModal();
          return;
        }
        showError('Failed to save your marker. Please try again.');
        return;
      }

            
      optimisticUpdatePublicCountryCounts(prevCountry, country, { lat: coords.lat, lon: coords.lon });
      
      refreshPublicCountryMarkers().catch(() => {});


      const payload = { city, country, ...coords };
      currentLocation = payload;

      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

      addUserMarker(coords.lat, coords.lon, city, country);
      rotateToLocation(coords.lat, coords.lon);
      showLocationSummary(city, country);
    } catch (error) {
      showError('Failed to find location. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  locationForm.addEventListener('submit', handleLocationSubmit);

  handleChangeLocation = () => {
    
    if (!getAuthToken()) {
      showError('Log in required to change your location.');
      openLoginModal();
      return;
    }

    if (currentLocation) {
      cityInput.value = currentLocation.city || '';
      countryInput.value = currentLocation.country || '';
    }
    showLocationForm();
  };
  changeLocationBtn.addEventListener('click', handleChangeLocation);
}

function applyAuthUiState() {
  const token = getAuthToken();

  
  if (!token) {
    localStorage.removeItem(STORAGE_KEY);
    currentLocation = null;

    
    if (userMarker) {
      userMarker.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
        if (child.element && child.element.parentNode) {
          child.element.parentNode.removeChild(child.element);
        }
      });
      globeGroup?.remove(userMarker);
      userMarker = null;
    }

    showLocationForm();
    hideError();

    
    const btnText = submitBtn?.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Log in to show on Globe';
    return;
  }

  const btnText = submitBtn?.querySelector('.btn-text');
  if (btnText) btnText.textContent = 'Show on Globe';
}

function showLocationForm() {
  locationForm?.classList.remove('hidden');
  locationStatus?.classList.add('hidden');
  changeLocationBtn?.classList.add('hidden');
  hideError();
}

function showLocationSummary(city, country) {
  if (!locationStatus || !locationSummary) return;
  const display = [city, country].filter(Boolean).join(', ');
  locationSummary.textContent = display || 'Location set';
  locationStatus.classList.remove('hidden');
  changeLocationBtn?.classList.remove('hidden');
  locationForm?.classList.add('hidden');
}

function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoader = submitBtn.querySelector('.btn-loader');
  if (loading) {
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
  } else {
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
}

async function checkSavedLocation() {
  const token = getAuthToken();
  if (!token) {
    
    return;
  }

  
  try {
    const m = await loadMyMarkerFromBackend();
    const lat = toFiniteNumber(m?.lat);
    const lon = toFiniteNumber(m?.lng);
    if (m && m.city && m.country && lat !== null && lon !== null) {
      currentLocation = { city: m.city, country: m.country, lat, lon };

      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentLocation));

      addUserMarker(lat, lon, m.city, m.country);
      showLocationSummary(m.city, m.country);
      setTimeout(() => rotateToLocation(lat, lon), 500);
      return;
    }
  } catch (err) {
    if (err?.status === 401) {
      clearAuthToken();
      applyAuthUiState();
      return;
    }
    
  }

  
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const { city, country, lat, lon } = JSON.parse(saved);
      const latN = toFiniteNumber(lat);
      const lonN = toFiniteNumber(lon);
      if (city && country && latN !== null && lonN !== null) {
        currentLocation = { city, country, lat: latN, lon: lonN };
        addUserMarker(latN, lonN, city, country);
        showLocationSummary(city, country);
        setTimeout(() => rotateToLocation(latN, lonN), 500);
      }
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

function saveUserLocation(data) {
  currentLocation = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function geocodeLocation(city, country) {
  const query = encodeURIComponent(`${city}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await response.json();
  if (data && data.length > 0) {
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  }
  return null;
}

function addUserMarker(lat, lon, city, country) {
  if (userMarker) {
    userMarker.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
      if (child.element && child.element.parentNode) {
        child.element.parentNode.removeChild(child.element);
      }
    });
    globeGroup.remove(userMarker);
    userMarker = null;
  }

  userMarker = new THREE.Group();

  const pointGeometry = new THREE.SphereGeometry(0.08, 16, 16);
  const pointMaterial = new THREE.MeshBasicMaterial({
    color: CONFIG.colors.user,
    depthTest: true,
    depthWrite: true,
  });
  const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
  userMarker.add(pointMesh);

  const ringGeometry = new THREE.RingGeometry(0.1, 0.15, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: CONFIG.colors.user,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
  ringMesh.userData.isPulseRing = true;
  ringMesh.userData.pulsePhase = 0;
  userMarker.add(ringMesh);

  const position = latLonToVector3(lat, lon, CONFIG.globe.radius + 0.05);
  userMarker.position.copy(position);
  userMarker.lookAt(new THREE.Vector3(0, 0, 0));
  userMarker.rotateX(Math.PI / 2);
  globeGroup.add(userMarker);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'user-marker-label';

  const pulse = document.createElement('div');
  pulse.className = 'marker-pulse';
  const dot = document.createElement('div');
  dot.className = 'marker-dot';
  const text = document.createElement('div');
  text.className = 'marker-text';
  const cityStr = String(city || '').trim();
  const countryStr = String(country || '').trim();
  text.textContent = cityStr + (countryStr ? ', ' + countryStr : '');

  labelDiv.append(pulse, dot, text);

  const labelObject = new CSS2DObject(labelDiv);
  labelObject.position.set(0, 0.3, 0);
  userMarker.add(labelObject);
}

function rotateToLocation(lat, lon) {
  const theta = (lon + 180) * (Math.PI / 180);
  const targetRotationY = -theta + Math.PI;
  const startRotation = globeGroup.rotation.y;
  const startTime = Date.now();
  const duration = CONFIG.animation.rotateToUserDuration;

  function animateRotation() {
    if (!isActive) return;
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    let deltaRotation = targetRotationY - startRotation;
    while (deltaRotation > Math.PI) deltaRotation -= 2 * Math.PI;
    while (deltaRotation < -Math.PI) deltaRotation += 2 * Math.PI;

    globeGroup.rotation.y = startRotation + deltaRotation * eased;

    if (progress < 1) requestAnimationFrame(animateRotation);
  }
  animateRotation();
}

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function animate() {
  if (!isActive) return;

  animationId = requestAnimationFrame(animate);

  
  if (isPaused) return;

  const now = performance.now();
  const frameInterval = 1000 / CONFIG.animation.targetFps;
  if (now - lastRenderTime < frameInterval) return;
  lastRenderTime = now;

  const tNow = Date.now();
  if (!isUserInteracting && tNow - lastInteractionTime > interactionCooldown) {
    
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (!reduceMotion) globeGroup.rotation.y += CONFIG.globe.rotationSpeed;
    if (publicLastPointerEvent) publicNeedsPick = true;
  }

  if (userMarker) {
    userMarker.children.forEach((child) => {
      if (child.userData && child.userData.isPulseRing) {
        child.userData.pulsePhase += 0.03;
        const scale = 1 + Math.sin(child.userData.pulsePhase) * 0.5;
        child.scale.set(scale, scale, 1);
        child.material.opacity = 0.8 - Math.sin(child.userData.pulsePhase) * 0.6;
      }
    });
  }

  controls.update();

  
  processPublicHoverPick();

  
  labelTick++;
  if (labelTick % 2 === 0) updateLabelVisibility();

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function updateLabelVisibility() {
  const cameraPosition = camera.position.clone();
  const cameraDistance = cameraPosition.length();
  const minDist = CONFIG.camera.minDistance;
  const maxDist = CONFIG.camera.maxDistance;
  const zoomFactor = (cameraDistance - minDist) / (maxDist - minDist);
  const zoomCurve = Math.pow(Math.max(0, Math.min(1, zoomFactor)), 0.7);
  const minSizeThreshold = 0.55 + zoomCurve * 0.75;

  
  const camDir = cameraPosition.clone().normalize();

  for (let i = 0; i < labelObjects.length; i++) {
    const labelObj = labelObjects[i];
    const labelSize = labelObj.userData.size || 1;

    const showByZoom = labelSize >= minSizeThreshold;
    if (!showByZoom) {
      if (labelObj.userData.element) labelObj.userData.element.style.opacity = '0';
      continue;
    }

    const labelWorldPos = new THREE.Vector3();
    labelObj.getWorldPosition(labelWorldPos);
    const labelDir = labelWorldPos.clone().normalize();

    const dot = labelDir.dot(camDir);
    const isFacingCamera = dot > 0.12;

    if (labelObj.userData.element) {
      labelObj.userData.element.style.opacity = isFacingCamera ? '1' : '0';
    }
  }

  
  updatePublicMarkersVisibility(camDir);
}

function getStageSize() {
  // На мобильных минимальный размер меньше
  const minSize = QUALITY?.isMobile ? 50 : 100;
  
  const rect = stageEl?.getBoundingClientRect?.();
  
  // Проверяем что rect валидный и имеет реальные размеры
  if (rect && rect.width > minSize && rect.height > minSize) {
    return { width: rect.width, height: rect.height };
  }
  
  // Fallback: пробуем получить размеры из offsetWidth/offsetHeight
  if (stageEl && stageEl.offsetWidth > minSize && stageEl.offsetHeight > minSize) {
    return { width: stageEl.offsetWidth, height: stageEl.offsetHeight };
  }
  
  // Fallback 2: пробуем из map-stage__inner
  const innerEl = stageEl?.querySelector?.('.map-stage__inner');
  if (innerEl) {
    const innerRect = innerEl.getBoundingClientRect();
    if (innerRect.width > minSize && innerRect.height > minSize) {
      return { width: innerRect.width, height: innerRect.height };
    }
  }
  
  // Последний fallback: используем процент от окна
  // На мобильных используем меньшие размеры
  const isMobile = window.innerWidth <= 768;
  const fallbackWidth = isMobile 
    ? Math.max(280, window.innerWidth - 32) 
    : Math.max(320, window.innerWidth * 0.7);
  const fallbackHeight = isMobile 
    ? Math.max(250, window.innerHeight * 0.4) 
    : Math.max(320, window.innerHeight * 0.6);
  
  console.warn('Globe: using fallback size', { width: fallbackWidth, height: fallbackHeight, isMobile });
  return { width: fallbackWidth, height: fallbackHeight };
}

function handleResize() {
  if (!camera || !renderer || !labelRenderer || !isActive) return;

  const { width, height } = getStageSize();
  
  // Защита от невалидных размеров (на мобильных минимум меньше)
  const minSize = QUALITY?.isMobile ? 50 : 100;
  if (width < minSize || height < minSize) {
    console.warn('Globe: invalid resize dimensions, skipping', width, height);
    return;
  }
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY?.pixelRatioCap || 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
  
  // Принудительный рендер после resize
  if (scene && camera) {
    renderer.render(scene, camera);
  }
}

function startResizeWatcher() {
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(stageEl);
  window.addEventListener('resize', handleResize);
}

function startVisibilityWatchers() {
  
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      isInView = entries?.[0]?.isIntersecting ?? true;
      updatePausedState();
    },
    { root: null, threshold: 0.05 }
  );
  intersectionObserver.observe(stageEl);

  
  visibilityHandler = () => {
    updatePausedState();
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  updatePausedState();
}

function updatePausedState() {
  const hidden = document.hidden;
  isPaused = hidden || !isInView;
}


