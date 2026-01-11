import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createEl } from '../utils/dom.js';

const CONFIG = {
  globe: {
    radius: 5,
    segments: 64,
    rotationSpeed: 0.0003,
    pointSize: 0.055,
    pointDensity: 0.5,
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
  },
  animation: {
    rotateToUserDuration: 2000,
  },
};

const STORAGE_KEY = 'bulkhub_user_location';

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
    await init();
    return destroyGlobalMap;
  } catch (err) {
    console.error(err);
    target.innerHTML = `<div class="page-shell"><p class="muted">Failed to load globe: ${err.message}</p></div>`;
    return () => {};
  }
}

export function destroyGlobalMap() {
  window.removeEventListener('resize', handleResize);
  resizeObserver?.disconnect();
  isActive = false;
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
    });
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

  animate();
  setupLocationPanel();
  checkSavedLocation();
  startResizeWatcher();
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
  camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    aspect,
    CONFIG.camera.near,
    CONFIG.camera.far,
  );
  camera.position.z = CONFIG.camera.initialDistance;
}

function setupRenderers() {
  const { width, height } = getStageSize();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  controls.dampingFactor = 0.05;
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
  const ambientLight = new THREE.AmbientLight(0x404050, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
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
    transparent: false,
    shininess: 5,
    depthWrite: true,
  });

  const sphere = new THREE.Mesh(geometry, material);
  sphere.renderOrder = 0;
  globeGroup.add(sphere);
  createAtmosphereGlow();
}

function createAtmosphereGlow() {
  const glowGeometry = new THREE.SphereGeometry(
    CONFIG.globe.radius + 0.1,
    CONFIG.globe.segments,
    CONFIG.globe.segments,
  );

  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x1a1a25) },
      viewVector: { value: camera.position },
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
  });

  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  globeGroup.add(glowMesh);
}

async function loadAndCreateLandPoints() {
  try {
    let topoData;
    try {
      const localResponse = await fetch('./data/land-110m.json');
      if (localResponse.ok) {
        const text = await localResponse.text();
        if (text.trim().length > 10) {
          topoData = JSON.parse(text);
        }
      }
    } catch (e) {
      console.log('Local land data not found, using CDN...');
    }

    if (!topoData) {
      const cdnResponse = await fetch('https://unpkg.com/world-atlas@2.0.2/land-110m.json');
      topoData = await cdnResponse.json();
    }

    const landGeoJSON = topojson.feature(topoData, topoData.objects.land);
    createLandPoints(landGeoJSON);
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
    const countries = topojson.feature(topoData, topoData.objects.countries);
    createCountryBorders(countries);
  } catch (error) {
    console.warn('Failed to load country borders:', error);
  }
}

function createCountryBorders(countriesGeoJSON) {
  const material = new THREE.LineBasicMaterial({
    color: 0xaaaaaa,
    transparent: true,
    opacity: 0.35,
    depthTest: true,
  });

  const bordersGroup = new THREE.Group();

  countriesGeoJSON.features.forEach((feature) => {
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon') {
      createBorderLine(geometry.coordinates, bordersGroup, material);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon) => {
        createBorderLine(polygon, bordersGroup, material);
      });
    }
  });

  bordersGroup.renderOrder = 2;
  countryBorders = bordersGroup;
  globeGroup.add(bordersGroup);
}

function createBorderLine(polygonCoords, group, material) {
  polygonCoords.forEach((ring) => {
    const points = [];
    for (let i = 0; i < ring.length; i += 2) {
      const [lon, lat] = ring[i];
      const pos = latLonToVector3(lat, lon, CONFIG.globe.radius + 0.01);
      points.push(pos);
    }
    if (points.length > 2) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      group.add(line);
    }
  });
}

function createLandPoints(landGeoJSON) {
  const positions = [];
  const step = CONFIG.globe.pointDensity;

  for (let lat = -85; lat <= 85; lat += step) {
    const rowOffset = (Math.random() - 0.5) * step;
    for (let lon = -180; lon <= 180; lon += step) {
      const jitteredLat = lat + (Math.random() - 0.5) * step * 0.9 + rowOffset * 0.3;
      const jitteredLon = lon + (Math.random() - 0.5) * step * 0.9;
      if (pointInLand(jitteredLon, jitteredLat, landGeoJSON)) {
        const pos = latLonToVector3(jitteredLat, jitteredLon, CONFIG.globe.radius);
        positions.push(pos.x, pos.y, pos.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const pointTexture = createGlowTexture();
  const material = new THREE.PointsMaterial({
    size: CONFIG.globe.pointSize,
    map: pointTexture,
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
  const count = 5000;

  for (let i = 0; i < count; i++) {
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    const x = CONFIG.globe.radius * Math.cos(theta) * Math.sin(phi);
    const y = CONFIG.globe.radius * Math.sin(theta) * Math.sin(phi);
    const z = CONFIG.globe.radius * Math.cos(phi);
    positions.push(x, y, z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: CONFIG.globe.pointSize,
    map: createGlowTexture(),
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

function pointInLand(lon, lat, landGeoJSON) {
  const point = [lon, lat];

  function pointInPolygon(testPoint, polygon) {
    let inside = false;
    const x = testPoint[0];
    const y = testPoint[1];
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function checkGeometry(geometry) {
    if (geometry.type === 'Polygon') {
      return pointInPolygon(point, geometry.coordinates[0]);
    }
    if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        if (pointInPolygon(point, polygon[0])) return true;
      }
    }
    return false;
  }

  if (landGeoJSON.type === 'FeatureCollection') {
    for (const feature of landGeoJSON.features) {
      if (checkGeometry(feature.geometry)) return true;
    }
  } else if (landGeoJSON.type === 'Feature') {
    return checkGeometry(landGeoJSON.geometry);
  } else {
    return checkGeometry(landGeoJSON);
  }
  return false;
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
  texture.needsUpdate = true;
  return texture;
}

async function loadLabels() {
  try {
    const response = await fetch('./data/labels.json');
    const labels = await response.json();
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

  handleLocationSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const city = cityInput.value.trim();
    const country = countryInput.value.trim();
    if (!city || !country) return;

    setLoading(true);
    hideError();

    try {
      const coords = await geocodeLocation(city, country);
      if (coords) {
        const payload = { city, country, ...coords };
        currentLocation = payload;
        saveUserLocation(payload);
        addUserMarker(coords.lat, coords.lon, city, country);
        rotateToLocation(coords.lat, coords.lon);
        showLocationSummary(city, country);
      } else {
        showError('Location not found. Please check the city and country names.');
      }
    } catch (error) {
      showError('Failed to find location. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  locationForm.addEventListener('submit', handleLocationSubmit);

  handleChangeLocation = () => {
    if (currentLocation) {
      cityInput.value = currentLocation.city || '';
      countryInput.value = currentLocation.country || '';
    }
    showLocationForm();
  };
  changeLocationBtn.addEventListener('click', handleChangeLocation);
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

function checkSavedLocation() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const { city, country, lat, lon } = JSON.parse(saved);
      currentLocation = { city, country, lat, lon };
      addUserMarker(lat, lon, city, country);
      showLocationSummary(city, country);
      setTimeout(() => {
        rotateToLocation(lat, lon);
      }, 500);
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

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await response.json();
  if (data && data.address) {
    return {
      city: data.address.city || data.address.town || data.address.village || data.address.municipality,
      country: data.address.country,
    };
  }
  return { city: null, country: null };
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
    color: 0xf2c14e,
    transparent: false,
    depthTest: true,
    depthWrite: true,
  });
  const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
  userMarker.add(pointMesh);

  const ringGeometry = new THREE.RingGeometry(0.1, 0.15, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xf2c14e,
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
  const now = Date.now();
  if (!isUserInteracting && now - lastInteractionTime > interactionCooldown) {
    globeGroup.rotation.y += CONFIG.globe.rotationSpeed;
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
  updateLabelVisibility();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function updateLabelVisibility() {
  const cameraPosition = camera.position.clone();
  const cameraDistance = cameraPosition.length();
  const minDist = CONFIG.camera.minDistance;
  const maxDist = CONFIG.camera.maxDistance;
  const zoomFactor = (cameraDistance - minDist) / (maxDist - minDist);
  const zoomCurve = Math.pow(zoomFactor, 0.7);
  const minSizeThreshold = 0.55 + zoomCurve * 0.75;

  labelObjects.forEach((labelObj) => {
    const labelSize = labelObj.userData.size || 1;
    const showByZoom = labelSize >= minSizeThreshold;
    if (!showByZoom) {
      if (labelObj.userData.element) {
        labelObj.userData.element.style.opacity = '0';
        labelObj.userData.element.style.pointerEvents = 'none';
      }
      return;
    }
    const labelWorldPos = new THREE.Vector3();
    labelObj.getWorldPosition(labelWorldPos);
    const labelDir = labelWorldPos.clone().normalize();
    const cameraDir = cameraPosition.clone().normalize();
    const dot = labelDir.dot(cameraDir);
    const isFacingCamera = dot > 0.1;
    if (labelObj.userData.element) {
      labelObj.userData.element.style.opacity = isFacingCamera ? '1' : '0';
      labelObj.userData.element.style.pointerEvents = isFacingCamera ? 'auto' : 'none';
    }
  });
}

function getStageSize() {
  const rect = stageEl.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(320, rect.height);
  return { width, height };
}

function handleResize() {
  const { width, height } = getStageSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
}

function startResizeWatcher() {
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(stageEl);
  window.addEventListener('resize', handleResize);
}

