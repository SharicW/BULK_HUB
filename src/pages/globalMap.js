import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createEl } from '../utils/dom.js';

/*
  CHANGELOG (public countries hover):
  - Публичные маркеры/точки больше НЕ рисуются (чтобы ничего не накладывалось).
  - Загружаем реальные полигоны стран (countries-110m) и определяем страну по наведению курсора (raycast по сфере + point-in-polygon).
  - При наведении на страну показываем только число пользователей, отметивших эту страну (tooltip).
  - Счётчики стран читаются из localStorage-кеша сразу при входе на страницу и обновляются периодически из /markers.
  - Добавлен локальный fallback: если положишь countries-110m.json/tsv в /public/data, будет грузиться локально.
*/

import { openLoginModal } from '../ui/loginModal.js';

const CONFIG = {
  globe: {
    radius: 5,
    segments: 48,              // было 64 — чуть легче, визуально почти без разницы
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
    targetFps: 60,            // throttling FPS
  },
  quality: {
    landMaskW: 1024,
    landMaskH: 512,
    landPointsHigh: 26000,    // ~ПК/норм
    landPointsLow: 14000,     // ~слабые/мобилки
    borderDecimateHigh: 1,    // 1 = без пропуска точек
    borderDecimateLow: 2,     // 2 = пропускаем через одну (легче)
    pixelRatioHigh: 2,
    pixelRatioLow: 1.5,
  },
};

const STORAGE_KEY = 'bulkhub_user_location';
// === Public country markers (aggregated) ===
// Кешируем только страны, где есть отметки, чтобы при возврате на #map точки появлялись сразу.
const PUBLIC_COUNTRY_CACHE_KEY = 'bulkhub_public_country_markers_v1';
const PUBLIC_COUNTRY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 минут
const PUBLIC_COUNTRY_REFRESH_MS = 60 * 1000; // 1 минута (обновление с бэка)

// центры стран (берём из ./data/labels.json)
const _countryCentroidsByNorm = new Map(); // norm -> { name, lat, lon }

// кэш в памяти (переживает переходы по вкладкам внутри SPA)
let _publicCountryCache = null; // { ts, items: [{key,name,count,lat,lon}] }

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
  // читаем кеш даже если TTL истёк — нужен для мгновенного восстановления после переключения вкладок
  return _readPublicCountryCache({ allowExpired: true });
}


function _writePublicCountryCache(items) {
  const payload = { ts: Date.now(), items };
  _publicCountryCache = payload;
  try {
    localStorage.setItem(PUBLIC_COUNTRY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

// === BACKEND (markers) ===
const API_BASE =
  window.BULK_AUTH_API_BASE ||
  'https://bulkhubdatabase-production.up.railway.app';

// ключи токена (как в loginModal.js)
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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.detail || data?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function loadMyMarkerFromBackend() {
  // GET /markers/me -> либо null, либо { user_id, country, city, lat, lng }
  return await api('/markers/me', { method: 'GET', auth: true });
}

async function saveMarkerToBackend({ country, city, lat, lon }) {
  // backend ждёт lat/lng, а у тебя lon — это долгота
  return await api('/markers', {
    method: 'POST',
    auth: true,
    body: { country, city, lat, lng: lon },
  });
}

// слушатель на успешный логин (loginModal.js кидает событие)
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
let globeSphereMesh = null; // for raycasting hover

// --- Countries (polygons) index for hover ---
let countriesIndex = null; // [{ name, key, bbox, geometry }]
let countriesIndexPromise = null;

// --- Public counts (countryKey -> count) ---
const publicCountryCounts = new Map();

// --- Public markers layer (aggregates by country) ---
let publicMarkersGroup = null;
let publicMarkersTimer = null;
let lastPublicMarkersFetchAt = 0;
const publicCountryLabelObjects = [];
// --- Public hover (show count only on hover) ---
const publicMarkerSprites = []; // sprites for raycasting
let publicRaycaster = null;
let publicMouse = null;
let publicHoveredSprite = null;
let publicTooltipObject = null; // CSS2DObject
let publicTooltipDiv = null;
let publicPointerMoveHandler = null;
let publicPointerLeaveHandler = null;
let publicNeedsPick = false;
let publicLastPointerEvent = null;

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

// visibility/perf helpers
let isInView = true;
let isPaused = false;
let lastRenderTime = 0;
let labelTick = 0;
let intersectionObserver = null;
let visibilityHandler = null;

// derived quality
let QUALITY = null;

export async function initGlobalMap(target) {
  mountEl = target;
  const layout = buildLayout();
  target.innerHTML = '';
  target.appendChild(layout);

  try {
    labelObjects.length = 0;
    lastInteractionTime = 0;
    isUserInteracting = false;
    isActive = true;

    QUALITY = detectQuality();

    await init();
    return destroyGlobalMap;
  } catch (err) {
    console.error(err);
    target.innerHTML = `<div class="page-shell"><p class="muted">Failed to load globe: ${err.message}</p></div>`;
    return () => {};
  }
}

export function destroyGlobalMap() {
  isActive = false;

  // detach hover handlers for public markers
  detachPublicHoverHandlers();


  // stop public markers refresh
  if (publicMarkersTimer) {
    clearInterval(publicMarkersTimer);
    publicMarkersTimer = null;
  }
  lastPublicMarkersFetchAt = 0;

  // remove login handler
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

  if (loginEventHandler) {
    window.removeEventListener('bulk:login', loginEventHandler);
    loginEventHandler = null;
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

  if (glowTexture) {
    glowTexture.dispose?.();
    glowTexture = null;
  }

  userMarker = null;
  publicMarkersGroup = null;
  publicCountryLabelObjects.length = 0;
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
  await loadAndCreateLandPoints(); // маска + равномерные точки
  await loadLabels();

  // публичные маркеры (по странам) — показываем всем, даже если логин пропущен
  setupPublicMarkersLayer();
  renderPublicMarkersFromCache(); // мгновенно из кеша (если есть)
  refreshPublicCountryMarkers().catch(() => {});
  startPublicMarkersRefresh();

  setupLocationPanel();
  await checkSavedLocation();
  startResizeWatcher();
  startVisibilityWatchers();

  animate();
}

function detectQuality() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;

  // очень грубая эвристика: слабое устройство = меньше точек, меньше dpr, проще borders
  const low = cores <= 4 || mem <= 4 || dpr >= 2.5;

  return {
    isLow: low,
    landPoints: low ? CONFIG.quality.landPointsLow : CONFIG.quality.landPointsHigh,
    borderDecimate: low ? CONFIG.quality.borderDecimateLow : CONFIG.quality.borderDecimateHigh,
    pixelRatioCap: low ? CONFIG.quality.pixelRatioLow : CONFIG.quality.pixelRatioHigh,
    maskW: CONFIG.quality.landMaskW,
    maskH: CONFIG.quality.landMaskH,
  };
}

function buildLayout() {
  const wrapper = createEl('div', { className: 'page-shell page-shell--map' });
  const header = createEl('div', { className: 'page-header' });
  header.innerHTML = `
    <div>
      <p class="eyebrow">Global</p>
      <h1>Global map</h1>
      <p class="muted">Explore ports and set your own position</p>
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

  // antialias не всегда стоит включать на высоком dpr
  const useAA = dpr <= 1.5;

  renderer = new THREE.WebGLRenderer({
    antialias: useAA,
    alpha: true,
    powerPreference: 'high-performance',
    depth: true,
    stencil: false,
  });

  renderer.setSize(width, height);
  renderer.setPixelRatio(dpr);
  canvasHost.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.inset = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelsHost.appendChild(labelRenderer.domElement);
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

  // сохраняем для raycast (hover по странам)
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

    // 1) local
    try {
      const localResponse = await fetch('./data/land-110m.json');
      if (localResponse.ok) {
        const text = await localResponse.text();
        if (text.trim().length > 10) topoData = JSON.parse(text);
      }
    } catch (e) {
      // ignore
    }

    // 2) CDN fallback
    if (!topoData) {
      const cdnResponse = await fetch('https://unpkg.com/world-atlas@2.0.2/land-110m.json');
      topoData = await cdnResponse.json();
    }

    // GeoJSON land
    const landGeoJSON = topojson.feature(topoData, topoData.objects.land);

    // Быстро строим маску земли (canvas) и по ней генерим точки равномерно по сфере
    const mask = buildLandMask(landGeoJSON, QUALITY.maskW, QUALITY.maskH);
    createLandPointsFromMask(mask, QUALITY.maskW, QUALITY.maskH, QUALITY.landPoints);

    await loadCountryBorders(); // mesh -> один LineSegments
  } catch (error) {
    console.error('Failed to load land data:', error);
    createFallbackPoints();
  }
}

async function loadCountryBorders() {
  try {
    const response = await fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');
    const topoData = await response.json();

    // ВАЖНО: topojson.mesh сильно быстрее, чем feature->каждая страна->линии
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

  // meshGeoJSON = MultiLineString
  const lines = meshGeoJSON.coordinates;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line || line.length < 2) continue;

    // decimate points a bit on low quality
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

  // equirectangular proj: x = (lon+180)/360 * W, y = (90-lat)/180 * H
  const proj = (lon, lat) => {
    const x = ((lon + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return [x, y];
  };

  const unwrapRing = (ring) => {
    // Разворачиваем долготные скачки через 180 (антимеридиан)
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
    // poly: [outerRing, holeRing1, ...]
    ctx.beginPath();

    for (let ri = 0; ri < poly.length; ri++) {
      const ring = poly[ri];
      if (!ring || ring.length < 3) continue;

      const unwrapped = unwrapRing(ring);

      // рисуем основной путь + копии со сдвигом, чтобы закрыть шов
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

    // even-odd: чтобы дырки в полигонах (озёра и т.д.) работали корректно
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
  return img.data; // Uint8ClampedArray
}

function isLandPixel(maskData, w, h, lon, lat) {
  // lon [-180..180], lat [-90..90]
  let u = (lon + 180) / 360;
  let v = (90 - lat) / 180;

  // wrap u
  u = ((u % 1) + 1) % 1;
  v = Math.min(0.999999, Math.max(0, v));

  const x = Math.floor(u * w);
  const y = Math.floor(v * h);
  const idx = (y * w + x) * 4;

  // alpha не используем — маска белым по RGB
  return maskData[idx] > 0;
}

function createLandPointsFromMask(maskData, w, h, desiredCount) {
  const positions = [];
  const r = CONFIG.globe.radius;

  if (!glowTexture) glowTexture = createGlowTexture();

  // Fibonacci sphere (равномерно) — убирает "полосы" и "дырки"
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // берём кандидатов больше, потому что океан отсеется
  const candidates = Math.floor(desiredCount * 2.3);

  let found = 0;

  for (let i = 0; i < candidates && found < desiredCount; i++) {
    const t = (i + 0.5) / candidates;
    const y = 1 - 2 * t; // [-1..1]
    const radiusXZ = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * radiusXZ;
    const z = Math.sin(theta) * radiusXZ;

    // convert to lat/lon for mask sampling
    const lat = Math.asin(y) * (180 / Math.PI);
    const lon = Math.atan2(z, x) * (180 / Math.PI);

    if (!isLandPixel(maskData, w, h, lon, lat)) continue;

    const p = latLonToVector3(lat, lon, r);
    positions.push(p.x, p.y, p.z);
    found++;
  }

  if (positions.length < 3000) {
    // на всякий — если вдруг мало нашли (крайне редко)
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
    const response = await fetch('./data/labels.json');
    const labels = await response.json();
    indexCountryCentroids(labels);
    labels.forEach((label) => {
      createLabel(label.name, label.lat, label.lon, label.size || 1);
    });
  } catch (error) {
    console.error('Failed to load labels:', error);
  }
}

function createLabel(name, lat, lon, size = 1) {
  const labelDiv = document.createElement('div');
  labelDiv.className = 'globe-label';

  const fontSize = Math.max(8, Math.min(12, 10 * size));
  labelDiv.innerHTML = `<span class="label-text" style="font-size: ${fontSize}px">${name}</span>`;

  const labelObject = new CSS2DObject(labelDiv);
  const position = latLonToVector3(lat, lon, CONFIG.globe.radius + 0.02);
  labelObject.position.copy(position);

  labelObject.userData = { lat, lon, element: labelDiv, size };

  labelObjects.push(labelObject);
  globeGroup.add(labelObject);
}

// === Country centroids ===
function indexCountryCentroids(labels) {
  try {
    _countryCentroidsByNorm.clear();
    for (const l of labels || []) {
      if (!l?.name || typeof l?.lat !== 'number' || typeof l?.lon !== 'number') continue;
      const key = _canonCountryKey(l.name);
      // сохраняем оригинальное имя из labels.json (для отображения)
      _countryCentroidsByNorm.set(key, { name: l.name, lat: l.lat, lon: l.lon });
    }
  } catch {
    // ignore
  }
}

function getCountryCentroid(countryName) {
  const key = _canonCountryKey(countryName);
  return _countryCentroidsByNorm.get(key) || null;


// === Countries hover (real polygons) ===
// Загружаем страны (границы) из world-atlas и делаем point-in-polygon по lat/lon.
// Это позволяет показывать число пользователей при наведении *на страну*, а не на маркер.

async function loadCountriesIndex() {
  if (countriesIndex) return countriesIndex;
  if (countriesIndexPromise) return countriesIndexPromise;

  countriesIndexPromise = (async () => {
    try {
      // topojson уже загружен в init(), но на всякий случай:
      if (!topojson) topojson = await loadTopoJson();

      // world-atlas: геометрия + табличка id->name
      // сначала пробуем локально (если положишь файлы в /public/data), затем CDN
      const tryFetch = async (url) => {
        try {
          const r = await fetch(url);
          if (r && r.ok) return r;
        } catch {}
        return null;
      };

      const topoRes =
        (await tryFetch('./data/countries-110m.json')) ||
        (await tryFetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json'));
      const tsvRes =
        (await tryFetch('./data/countries-110m.tsv')) ||
        (await tryFetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.tsv'));

      if (!topoRes) throw new Error('countries-110m.json fetch failed');
      if (!tsvRes) throw new Error('countries-110m.tsv fetch failed');
const topoData = await topoRes.json();
      const tsvText = await tsvRes.text();

      const idToName = parseIdNameTSV(tsvText);
      const features = topojson.feature(topoData, topoData.objects.countries)?.features || [];

      const index = [];
      for (const f of features) {
        const id = String(f?.id ?? f?.properties?.id ?? '');
        const name = idToName.get(id) || f?.properties?.name || '';
        const key = _canonCountryKey(name);

        if (!name || !key) continue;

        const bbox = computeGeomBBox(f.geometry);
        index.push({ id, name, key, bbox, geometry: f.geometry });
      }

      countriesIndex = index;
      return index;
    } catch (e) {
      console.warn('Countries hover index failed:', e);
      countriesIndex = [];
      return countriesIndex;
    }
  })();

  return countriesIndexPromise;
}

function parseIdNameTSV(tsvText) {
  const map = new Map();
  const lines = String(tsvText || '').trim().split('\n').filter(Boolean);
  if (lines.length < 2) return map;

  const head = lines[0].split('\t');
  const idxId = Math.max(0, head.indexOf('id'));
  const idxName = head.indexOf('name') >= 0 ? head.indexOf('name') : 1;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const id = String(cols[idxId] || '').trim();
    const name = String(cols[idxName] || '').trim();
    if (id && name) map.set(id, name);
  }
  return map;
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
  // инверсия latLonToVector3()
  const v = worldPoint.clone().normalize();
  const phi = Math.acos(Math.max(-1, Math.min(1, v.y))); // 0..pi
  const lat = 90 - (phi * 180) / Math.PI;

  const theta = Math.atan2(v.z, -v.x); // 0..2pi-ish
  let lon = (theta * 180) / Math.PI - 180;
  // normalize [-180..180]
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

  // 0 - outer ring, others - holes
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

    // переносим долготы ближе к точке (защита от анти-меридиана)
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

}

// === Public country markers layer ===
function setupPublicMarkersLayer() {
  if (!globeGroup) return;

  // запускаем загрузку стран (границы) — нужно для hover
  if (!countriesIndexPromise) {
    loadCountriesIndex().catch(() => {});
  }

  // В этой версии НЕ рисуем публичные маркеры, только показываем число на hover по стране.
  // Если вдруг осталась группа от прошлого инстанса — удалим.
  if (publicMarkersGroup) {
    try {
      globeGroup.remove(publicMarkersGroup);
    } catch {
      // ignore
    }
    publicMarkersGroup = null;
  }

  // подготовка hover-инфы
  publicMarkerSprites.length = 0;
  publicHoveredSprite = null;

  if (!publicRaycaster) publicRaycaster = new THREE.Raycaster();
  if (!publicMouse) publicMouse = new THREE.Vector2();

  ensurePublicHoverTooltip();
  attachPublicHoverHandlers();
}


function renderPublicMarkersFromCache() {
  const cached = _readPublicCountryCacheAny();
  if (!cached?.items?.length) return;

  // обновляем мапу подсчётов сразу из кеша (чтобы после возврата на вкладку всё работало без перезапуска)
  updatePublicCountryCounts(cached.items);
}



function startPublicMarkersRefresh() {
  if (publicMarkersTimer) clearInterval(publicMarkersTimer);
  publicMarkersTimer = setInterval(() => {
    // не дергаем сеть слишком часто + не мешаем паузе
    if (!isActive) return;
    if (isPaused) return;
    refreshPublicCountryMarkers().catch(() => {});
  }, PUBLIC_COUNTRY_REFRESH_MS);
}

async function refreshPublicCountryMarkers() {
  // троттлинг (защита от частых вызовов при повторном монтировании)
  const now = Date.now();
  if (now - lastPublicMarkersFetchAt < 2500) return;
  lastPublicMarkersFetchAt = now;

  // /markers не требует авторизации
  const markers = await api(`/markers?limit=2000`, { method: 'GET', auth: false });

  const items = aggregateMarkersByCountry(markers);
  _writePublicCountryCache(items);

  // обновляем счётчики (для hover)
  updatePublicCountryCounts(items);
}

function aggregateMarkersByCountry(markers) {
  const by = new Map(); // key -> { key, name, count, latSum, lonSum, n, fallbackLat, fallbackLon }
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

    const lat = typeof m?.lat === 'number' ? m.lat : null;
    const lon = typeof m?.lng === 'number' ? m.lng : null;

    // если нет центроида, можно собрать fallback среднее
    if (!centroid && lat !== null && lon !== null) {
      entry.latSum += lat;
      entry.lonSum += lon;
      entry.n += 1;
    }

    // если центроид есть — переименуем на центроидное имя (стабильно)
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

  // крупные страны/где больше людей — сверху (приятнее)
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

  // если страна изменилась — уменьшаем старую
  if (prevKey && prevKey !== nextKey) {
    const oldItem = by.get(prevKey);
    if (oldItem) {
      oldItem.count = Math.max(0, Number(oldItem.count || 0) - 1);
      if (oldItem.count <= 0) by.delete(prevKey);
      else by.set(prevKey, oldItem);
    }
  }

  // новая страна
  let nextItem = by.get(nextKey);
  if (!nextItem) {
    const centroid = getCountryCentroid(nextCountry);
    const lat = typeof centroid?.lat === 'number' ? centroid.lat : coords?.lat;
    const lon = typeof centroid?.lon === 'number' ? centroid.lon : coords?.lon;

    if (typeof lat !== 'number' || typeof lon !== 'number') return;

    nextItem = {
      key: nextKey,
      name: centroid?.name || nextCountry,
      count: 0,
      lat,
      lon,
    };
  }

  // если это новая метка или смена страны — увеличиваем счётчик
  if (!prevKey || prevKey !== nextKey) {
    nextItem.count = Number(nextItem.count || 0) + 1;
  }

  // стабилизируем позицию центроидом (если есть)
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


function clearThreeGroup(group) {
  if (!group) return;

  const children = group.children.slice();
  for (const child of children) {
    group.remove(child);

    // рекурсивно чистим вложенные группы
    if (child.children && child.children.length) {
      clearThreeGroup(child);
    }

    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }

    // CSS2D nodes
    if (child.element && child.element.parentNode) {
      child.element.parentNode.removeChild(child.element);
    }
  }

  publicCountryLabelObjects.length = 0;
  publicMarkerSprites.length = 0;

  // сбрасываем hover
  publicHoveredSprite = null;
  if (publicTooltipDiv) {
    publicTooltipDiv.style.display = 'none';
  }
  if (publicTooltipObject?.parent) {
    try { publicTooltipObject.parent.remove(publicTooltipObject); } catch {}
  }
}


function renderPublicCountryMarkers(items) {
  if (!publicMarkersGroup || !globeGroup) return;

  // очищаем слой
  clearThreeGroup(publicMarkersGroup);

  // общий материал/текстура
  if (!glowTexture) glowTexture = createGlowTexture();

  for (const item of items || []) {
    addPublicCountryMarker(item);
  }
}

function addPublicCountryMarker({ name, count, lat, lon }) {
  if (!publicMarkersGroup) return;

  // позиция на поверхности
  const pos = latLonToVector3(lat, lon, CONFIG.globe.radius + 0.07);

  const markerGroup = new THREE.Group();
  markerGroup.position.copy(pos);
  markerGroup.lookAt(new THREE.Vector3(0, 0, 0));
  markerGroup.rotateX(Math.PI / 2);

  // нормаль для "видно/не видно" (обратная сторона)
  const dir = markerGroup.position.clone().normalize();
  markerGroup.userData.publicDir = dir;

  // размер пузыря (зависит от количества)
  const base = 0.20;
  const scale = base + Math.min(1.6, Math.sqrt(Math.max(1, count)) * 0.06);

  // видимый маркер (точка/свечение)
  const spriteMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0x3aa0ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(scale, scale, 1);
  sprite.userData.publicCountry = { name, count, lat, lon };
  sprite.userData.publicDir = dir;
  markerGroup.add(sprite);

  // "хитбокс" для удобного наведения (невидимый шар)
  const hitGeom = new THREE.SphereGeometry(0.25, 10, 10);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
  const hitMesh = new THREE.Mesh(hitGeom, hitMat);
  hitMesh.userData.publicCountry = { name, count, lat, lon };
  hitMesh.userData.publicDir = dir;
  markerGroup.add(hitMesh);

  // в список для raycast
  publicMarkerSprites.push(hitMesh);

  publicMarkersGroup.add(markerGroup);
}


// простая защита от XSS в label
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// --- Public markers hover tooltip (only number on hover) ---
function ensurePublicHoverTooltip() {
  if (publicTooltipObject) return;

  const wrap = document.createElement('div');
  wrap.className = 'public-country-tooltip';
  wrap.style.pointerEvents = 'none';
  wrap.style.display = 'none';
  wrap.style.transform = 'translateY(-10px)';
  wrap.style.position = 'relative';
  wrap.style.zIndex = '999999';

  wrap.innerHTML = `
    <div style="
      background: rgba(255,255,255,0.95);
      color: #111;
      padding: 8px 10px;
      border-radius: 10px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.35);
      font-weight: 800;
      font-size: 14px;
      line-height: 1;
      white-space: nowrap;
      min-width: 44px;
      text-align: center;
    "></div>
  `;

  publicTooltipDiv = wrap.firstElementChild;

  const obj = new CSS2DObject(wrap);
  obj.position.set(0, 0.55, 0);
  publicTooltipObject = obj;
}

function attachPublicHoverHandlers() {
  if (!renderer?.domElement) return;
  if (publicPointerMoveHandler) return; // уже подключено

  const el = renderer.domElement;

  publicPointerMoveHandler = (ev) => {
    publicLastPointerEvent = ev;
    publicNeedsPick = true;
  };

  publicPointerLeaveHandler = () => {
    clearPublicHoverTooltip();
  };

  el.addEventListener('pointermove', publicPointerMoveHandler, { passive: true });
  el.addEventListener('pointerleave', publicPointerLeaveHandler, { passive: true });
}

function detachPublicHoverHandlers() {
  const el = renderer?.domElement;
  if (!el) return;

  if (publicPointerMoveHandler) {
    el.removeEventListener('pointermove', publicPointerMoveHandler);
    publicPointerMoveHandler = null;
  }
  if (publicPointerLeaveHandler) {
    el.removeEventListener('pointerleave', publicPointerLeaveHandler);
    publicPointerLeaveHandler = null;
  }

  clearPublicHoverTooltip();
}

function processPublicHoverPick() {
  if (!publicNeedsPick) return;
  if (!publicLastPointerEvent) return;
  if (!publicRaycaster || !publicMouse) return;
  if (!camera || !renderer) return;

  publicNeedsPick = false;

  // если индекс стран ещё не готов — просто скрываем
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

  const hits = publicRaycaster.intersectObject(globeSphereMesh, true);
  if (!hits || !hits.length) {
    clearPublicHoverTooltip();
    return;
  }

  const hitPoint = hits[0].point;
  const { lat, lon } = vector3ToLatLon(hitPoint);

  const country = findCountryAt(lat, lon);
  if (!country) {
    clearPublicHoverTooltip();
    return;
  }

  const key = country.key;
  const count = Number(publicCountryCounts.get(key) || 0);

  if (!count || count <= 0) {
    clearPublicHoverTooltip();
    return;
  }

  showPublicHoverTooltipAt(hitPoint, { name: country.name, count });
}

function showPublicHoverTooltipAt(worldPoint, data) {
  ensurePublicHoverTooltip();
  if (!publicTooltipObject || !publicTooltipDiv || !globeGroup) return;

  // показываем только число
  const count = Number(data?.count || 0);
  publicTooltipDiv.textContent = count.toLocaleString();
  publicTooltipDiv.title = String(data?.name || '');

  // добавляем тултип в globeGroup
  if (publicTooltipObject.parent && publicTooltipObject.parent !== globeGroup) {
    try { publicTooltipObject.parent.remove(publicTooltipObject); } catch {}
  }
  if (publicTooltipObject.parent !== globeGroup) {
    globeGroup.add(publicTooltipObject);
  }

  // позиция: над точкой пересечения (чуть приподнимаем)
  const local = globeGroup.worldToLocal(worldPoint.clone());
  const dir = local.clone().normalize();
  publicTooltipObject.position.copy(dir.multiplyScalar(CONFIG.globe.radius + 0.55));

  publicTooltipObject.element.style.display = 'block';
  publicHoveredSprite = null;
}

function showPublicHoverTooltip(_hitObj, data) {
  // legacy: marker-hover mode (отключён). Оставлено, чтобы ничего не падало.
  if (!_hitObj) return;
  try {
    const p = _hitObj.getWorldPosition ? _hitObj.getWorldPosition(new THREE.Vector3()) : null;
    if (p) showPublicHoverTooltipAt(p, data);
  } catch {
    // ignore
  }
}

function clearPublicHoverTooltip() {
  publicHoveredSprite = null;
  if (publicTooltipObject?.parent) {
    try { publicTooltipObject.parent.remove(publicTooltipObject); } catch {}
  }
  if (publicTooltipObject?.element) {
    publicTooltipObject.element.style.display = 'none';
  }
}

function updatePublicMarkersVisibility(camDir) {
  // Маркеры мы не рисуем, но если tooltip остался видимым,
  // прячем его, когда точка уходит на обратную сторону.
  if (!camDir) return;
  if (!publicTooltipObject?.parent) return;

  try {
    const wp = new THREE.Vector3();
    publicTooltipObject.getWorldPosition(wp);
    const dir = wp.clone().normalize();
    if (dir.dot(camDir) <= 0.05) {
      clearPublicHoverTooltip();
    }
  } catch {
    // ignore
  }
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

  showLocationForm();
  applyAuthUiState();

  // если пользователь залогинился — включаем UI
  loginEventHandler = () => {
    applyAuthUiState();
    checkSavedLocation().catch(() => {});
  };
  window.addEventListener('bulk:login', loginEventHandler);

  handleLocationSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // ✅ БЛОК: без токена — не даём ставить метку вообще
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

      // ✅ сначала сохраняем в БД
      try {
        await saveMarkerToBackend({
          city,
          country,
          lat: coords.lat,
          lon: coords.lon,
        });
      } catch (err) {
        // токен мог протухнуть
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

            // ✅ оптимистично обновим публичные счётчики (чтобы не ждать рефреша/перезагрузки)
      optimisticUpdatePublicCountryCounts(prevCountry, country, { lat: coords.lat, lon: coords.lon });
      // синхронизация с бэком (в фоне)
      refreshPublicCountryMarkers().catch(() => {});

// ✅ только после успешного сохранения — показываем на глобусе
      const payload = { city, country, ...coords };
      currentLocation = payload;

      // кеш на клиенте (только залогиненным)
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
    // без токена — не даём
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

  // если нет токена — убираем любое сохранённое местоположение (чтобы skip не обходил)
  if (!token) {
    localStorage.removeItem(STORAGE_KEY);
    currentLocation = null;

    // убираем маркер с глобуса, если был
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

    // меняем текст кнопки
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
    // без токена ничего не показываем
    return;
  }

  // 1) пробуем взять из БД
  try {
    const m = await loadMyMarkerFromBackend();
    if (m && m.city && m.country && typeof m.lat === 'number' && typeof m.lng === 'number') {
      currentLocation = { city: m.city, country: m.country, lat: m.lat, lon: m.lng };

      // кеш на клиенте (не обязательно)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentLocation));

      addUserMarker(m.lat, m.lng, m.city, m.country);
      showLocationSummary(m.city, m.country);
      setTimeout(() => rotateToLocation(m.lat, m.lng), 500);
      return;
    }
  } catch (err) {
    if (err?.status === 401) {
      clearAuthToken();
      applyAuthUiState();
      return;
    }
    // если БД недоступна — упадём на кеш ниже
  }

  // 2) fallback на локальный кеш (только если залогинен)
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const { city, country, lat, lon } = JSON.parse(saved);
      if (city && country && typeof lat === 'number' && typeof lon === 'number') {
        currentLocation = { city, country, lat, lon };
        addUserMarker(lat, lon, city, country);
        showLocationSummary(city, country);
        setTimeout(() => rotateToLocation(lat, lon), 500);
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
  labelDiv.innerHTML = `
    <div class="marker-pulse"></div>
    <div class="marker-dot"></div>
    <div class="marker-text">${city}${country ? ', ' + country : ''}</div>
  `;
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

  // pause when hidden or out of view
  if (isPaused) return;

  const now = performance.now();
  const frameInterval = 1000 / CONFIG.animation.targetFps;
  if (now - lastRenderTime < frameInterval) return;
  lastRenderTime = now;

  const tNow = Date.now();
  if (!isUserInteracting && tNow - lastInteractionTime > interactionCooldown) {
    // если reduce motion — можно выключить авто-вращение
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (!reduceMotion) globeGroup.rotation.y += CONFIG.globe.rotationSpeed;
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

  // hover по публичным странам (только при движении мыши)
  processPublicHoverPick();

  // labels visibility не каждый кадр (дешевле)
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

  // камера направление
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

  // публичные страны — прячем на обратной стороне
  updatePublicMarkersVisibility(camDir);
}

function getStageSize() {
  const rect = stageEl.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(320, rect.height);
  return { width, height };
}

function handleResize() {
  if (!camera || !renderer || !labelRenderer) return;

  const { width, height } = getStageSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY.pixelRatioCap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
}

function startResizeWatcher() {
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(stageEl);
  window.addEventListener('resize', handleResize);
}

function startVisibilityWatchers() {
  // pause when element out of viewport
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      isInView = entries?.[0]?.isIntersecting ?? true;
      updatePausedState();
    },
    { root: null, threshold: 0.05 }
  );
  intersectionObserver.observe(stageEl);

  // pause when tab hidden
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
