/**
 * Bulk Hub — 3D Globe Visualization
 * 
 * A Three.js powered interactive globe with:
 * - Land points generated from TopoJSON data
 * - Port/city labels as CSS2D overlays
 * - User location marker with pulsing animation
 * - Smooth auto-rotation and orbit controls
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

console.log('Script loaded, Three.js version:', THREE.REVISION);

// TopоJSON будет загружен динамически
let topojson = null;

// ============================================
// Constants & Configuration
// ============================================
const CONFIG = {
  globe: {
    radius: 5,
    segments: 64,
    rotationSpeed: 0.0003,
    pointSize: 0.055,
    pointDensity: 0.5, // degrees between points (smaller = more points)
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
    gold: 0xffffff, // White color for land points
    globeDark: 0x0d0d10,
    background: 0x0a0a0c,
  },
  animation: {
    rotateToUserDuration: 2000,
  },
};

const STORAGE_KEY = 'bulkhub_user_location';

// ============================================
// Global State
// ============================================
let scene, camera, renderer, labelRenderer;
let controls;
let globeGroup;
let landPoints;
let countryBorders;
let userMarker = null;
let isUserInteracting = false;
let lastInteractionTime = 0;
const interactionCooldown = 2000;

// Store label objects for visibility updates
const labelObjects = [];

// ============================================
// Initialization
// ============================================
async function init() {
  console.log('Initializing globe...');
  
  // Load topojson dynamically
  try {
    topojson = await import('https://esm.sh/topojson-client@3.1.0');
    console.log('TopоJSON loaded');
  } catch (e) {
    console.warn('Failed to load topojson from esm.sh, trying jsdelivr...', e);
    // Fallback: load as script
    await loadScript('https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js');
    topojson = window.topojson;
    console.log('TopоJSON loaded via script tag');
  }
  
  setupScene();
  setupCamera();
  setupRenderers();
  setupControls();
  setupLights();
  
  // Create globe group for rotation
  globeGroup = new THREE.Group();
  scene.add(globeGroup);
  
  // Build the globe
  createGlobeSphere();
  await loadAndCreateLandPoints();
  await loadLabels();
  
  // Start animation loop
  animate();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Setup modal & location handling
  setupLocationModal();
  console.log('Modal setup complete');
  
  // Check for saved location
  checkSavedLocation();
  
  console.log('Globe initialized successfully');
}

// Helper to load script dynamically
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ============================================
// Scene Setup
// ============================================
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.colors.background);
}

function setupCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    aspect,
    CONFIG.camera.near,
    CONFIG.camera.far
  );
  camera.position.z = CONFIG.camera.initialDistance;
}

function setupRenderers() {
  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('globe-container').appendChild(renderer.domElement);
  
  // CSS2D Renderer for labels
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  document.getElementById('labels-container').appendChild(labelRenderer.domElement);
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
  
  // Track user interaction
  controls.addEventListener('start', () => {
    isUserInteracting = true;
  });
  
  controls.addEventListener('end', () => {
    isUserInteracting = false;
    lastInteractionTime = Date.now();
  });
}

function setupLights() {
  // Ambient light for base illumination
  const ambientLight = new THREE.AmbientLight(0x404050, 0.5);
  scene.add(ambientLight);
  
  // Directional light for subtle highlights
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
  directionalLight.position.set(5, 3, 5);
  scene.add(directionalLight);
}

// ============================================
// Globe Creation
// ============================================
function createGlobeSphere() {
  // Main dark sphere - OPAQUE to prevent see-through issues
  const geometry = new THREE.SphereGeometry(
    CONFIG.globe.radius - 0.03,
    CONFIG.globe.segments,
    CONFIG.globe.segments
  );
  
  // Solid dark material (not transparent)
  const material = new THREE.MeshPhongMaterial({
    color: CONFIG.colors.globeDark,
    transparent: false,
    shininess: 5,
    depthWrite: true,
  });
  
  const sphere = new THREE.Mesh(geometry, material);
  sphere.renderOrder = 0;
  globeGroup.add(sphere);
  
  // Atmospheric glow ring (subtle)
  createAtmosphereGlow();
}

function createAtmosphereGlow() {
  // Create a subtle glow effect around the globe edges
  const glowGeometry = new THREE.SphereGeometry(
    CONFIG.globe.radius + 0.1,
    CONFIG.globe.segments,
    CONFIG.globe.segments
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

// ============================================
// Land Points Generation
// ============================================
async function loadAndCreateLandPoints() {
  try {
    // Try local file first, fallback to CDN
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
    
    // Convert TopoJSON to GeoJSON
    const landGeoJSON = topojson.feature(topoData, topoData.objects.land);
    
    // Generate land points
    createLandPoints(landGeoJSON);
    
    // Load and create country borders
    await loadCountryBorders();
    
  } catch (error) {
    console.error('Failed to load land data:', error);
    // Create fallback simple globe pattern
    createFallbackPoints();
  }
}

// Load country borders from countries TopoJSON
async function loadCountryBorders() {
  try {
    const response = await fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');
    const topoData = await response.json();
    
    // Get country mesh (borders between countries)
    const countries = topojson.feature(topoData, topoData.objects.countries);
    
    // Create border lines
    createCountryBorders(countries);
    console.log('Country borders loaded');
  } catch (error) {
    console.warn('Failed to load country borders:', error);
  }
}

// Create country border lines
function createCountryBorders(countriesGeoJSON) {
  const material = new THREE.LineBasicMaterial({
    color: 0xaaaaaa, // Light gray for borders
    transparent: true,
    opacity: 0.35,
    depthTest: true,
  });
  
  const bordersGroup = new THREE.Group();
  
  countriesGeoJSON.features.forEach(feature => {
    const geometry = feature.geometry;
    
    if (geometry.type === 'Polygon') {
      createBorderLine(geometry.coordinates, bordersGroup, material);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(polygon => {
        createBorderLine(polygon, bordersGroup, material);
      });
    }
  });
  
  bordersGroup.renderOrder = 2;
  countryBorders = bordersGroup;
  globeGroup.add(bordersGroup);
}

// Create a single border line from coordinates
function createBorderLine(polygonCoords, group, material) {
  polygonCoords.forEach(ring => {
    const points = [];
    
    // Sample points along the border (skip some for performance)
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
  
  // Generate points with strong randomization to avoid visible grid lines
  for (let lat = -85; lat <= 85; lat += step) {
    // Offset each row by random amount to break horizontal lines
    const rowOffset = (Math.random() - 0.5) * step;
    
    for (let lon = -180; lon <= 180; lon += step) {
      // Add strong random jitter to break any visible patterns
      const jitteredLat = lat + (Math.random() - 0.5) * step * 0.9 + rowOffset * 0.3;
      const jitteredLon = lon + (Math.random() - 0.5) * step * 0.9;
      
      // Check if point is on land using d3-geo logic
      if (pointInLand(jitteredLon, jitteredLat, landGeoJSON)) {
        const pos = latLonToVector3(jitteredLat, jitteredLon, CONFIG.globe.radius);
        positions.push(pos.x, pos.y, pos.z);
      }
    }
  }
  
  console.log(`Generated ${positions.length / 3} land points`);
  
  // Create BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  
  // Create glowing point texture
  const pointTexture = createGlowTexture();
  
  // Points material with additive blending for glow effect
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
  // Simple random distribution as fallback
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

/**
 * Check if a point is inside any land polygon
 * Simplified point-in-polygon using ray casting
 */
function pointInLand(lon, lat, landGeoJSON) {
  const point = [lon, lat];
  
  function pointInPolygon(point, polygon) {
    let inside = false;
    const x = point[0], y = point[1];
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
  
  function checkGeometry(geometry) {
    if (geometry.type === 'Polygon') {
      return pointInPolygon(point, geometry.coordinates[0]);
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        if (pointInPolygon(point, polygon[0])) {
          return true;
        }
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

/**
 * Create a glowing point texture using canvas
 */
function createGlowTexture() {
  // Higher resolution for better quality when zoomed in
  const size = 256;
  const half = size / 2;
  
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Create radial gradient for soft glow
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

// ============================================
// Labels Loading & Creation
// ============================================
async function loadLabels() {
  try {
    const response = await fetch('./data/labels.json');
    const labels = await response.json();
    
    labels.forEach(label => {
      createLabel(label.name, label.lat, label.lon, label.size || 1);
    });
  } catch (error) {
    console.error('Failed to load labels:', error);
  }
}

function createLabel(name, lat, lon, size = 1) {
  // Create DOM element for label (without bubble)
  const labelDiv = document.createElement('div');
  labelDiv.className = 'globe-label';
  // Scale font size based on country size
  const fontSize = Math.max(8, Math.min(12, 10 * size));
  labelDiv.innerHTML = `<span class="label-text" style="font-size: ${fontSize}px">${name}</span>`;
  
  // Create CSS2DObject - position exactly on globe surface
  const labelObject = new CSS2DObject(labelDiv);
  const position = latLonToVector3(lat, lon, CONFIG.globe.radius + 0.02);
  labelObject.position.copy(position);
  
  // Store reference for visibility updates (including size for zoom-based filtering)
  labelObject.userData = { lat, lon, element: labelDiv, size: size };
  labelObjects.push(labelObject);
  
  globeGroup.add(labelObject);
}

// ============================================
// User Location Handling
// ============================================
function setupLocationModal() {
  console.log('Setting up location modal...');
  
  const modal = document.getElementById('location-modal');
  const form = document.getElementById('location-form');
  const submitBtn = document.getElementById('submit-btn');
  const geoBtn = document.getElementById('geolocation-btn');
  const changeBtn = document.getElementById('change-location-btn');
  const errorMsg = document.getElementById('error-message');
  
  console.log('Elements found:', { modal: !!modal, form: !!form, submitBtn: !!submitBtn, geoBtn: !!geoBtn });
  
  if (!form) {
    console.error('Form not found!');
    return;
  }
  
  // Form submission
  form.addEventListener('submit', async (e) => {
    console.log('Form submitted!');
    e.preventDefault();
    e.stopPropagation();
    
    const city = document.getElementById('city-input').value.trim();
    const country = document.getElementById('country-input').value.trim();
    
    if (!city || !country) return;
    
    setLoading(true);
    hideError();
    
    try {
      const coords = await geocodeLocation(city, country);
      if (coords) {
        saveUserLocation({ city, country, ...coords });
        addUserMarker(coords.lat, coords.lon, city, country);
        hideModal();
        rotateToLocation(coords.lat, coords.lon);
      } else {
        showError('Location not found. Please check the city and country names.');
      }
    } catch (error) {
      showError('Failed to find location. Please try again.');
    }
    
    setLoading(false);
  });
  
  // Geolocation button
  geoBtn.addEventListener('click', async (e) => {
    console.log('Geolocation button clicked!');
    e.preventDefault();
    if (!navigator.geolocation) {
      showError('Geolocation is not supported by your browser.');
      return;
    }
    
    setLoading(true);
    hideError();
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lon } = position.coords;
        
        try {
          // Reverse geocode to get city/country
          const locationInfo = await reverseGeocode(lat, lon);
          const city = locationInfo.city || 'Your Location';
          const country = locationInfo.country || '';
          
          saveUserLocation({ city, country, lat, lon });
          addUserMarker(lat, lon, city, country);
          hideModal();
          rotateToLocation(lat, lon);
        } catch (error) {
          // Use coordinates even if reverse geocoding fails
          saveUserLocation({ city: 'Your Location', country: '', lat, lon });
          addUserMarker(lat, lon, 'Your Location', '');
          hideModal();
          rotateToLocation(lat, lon);
        }
        
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            showError('Location permission denied. Please enter your location manually.');
            break;
          case error.POSITION_UNAVAILABLE:
            showError('Location unavailable. Please enter your location manually.');
            break;
          default:
            showError('Failed to get location. Please enter it manually.');
        }
      },
      { timeout: 10000 }
    );
  });
  
  // Change location button
  changeBtn.addEventListener('click', () => {
    showModal();
  });
  
  function setLoading(loading) {
    submitBtn.disabled = loading;
    geoBtn.disabled = loading;
    
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
}

function showModal() {
  document.getElementById('location-modal').classList.remove('hidden');
  document.getElementById('change-location-btn').classList.add('hidden');
}

function hideModal() {
  document.getElementById('location-modal').classList.add('hidden');
  document.getElementById('change-location-btn').classList.remove('hidden');
}

function checkSavedLocation() {
  const saved = localStorage.getItem(STORAGE_KEY);
  
  if (saved) {
    try {
      const { city, country, lat, lon } = JSON.parse(saved);
      hideModal();
      addUserMarker(lat, lon, city, country);
      
      // Delayed rotation for smoother initial experience
      setTimeout(() => {
        rotateToLocation(lat, lon);
      }, 500);
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

function saveUserLocation(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ============================================
// Geocoding API
// ============================================
async function geocodeLocation(city, country) {
  const query = encodeURIComponent(`${city}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });
  
  const data = await response.json();
  
  if (data && data.length > 0) {
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
    };
  }
  
  return null;
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });
  
  const data = await response.json();
  
  if (data && data.address) {
    return {
      city: data.address.city || data.address.town || data.address.village || data.address.municipality,
      country: data.address.country,
    };
  }
  
  return { city: null, country: null };
}

// ============================================
// User Marker
// ============================================
function addUserMarker(lat, lon, city, country) {
  // Remove existing marker if any - full cleanup
  if (userMarker) {
    // Dispose all children geometries and materials
    userMarker.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      // Remove CSS2DObject elements
      if (child.element && child.element.parentNode) {
        child.element.parentNode.removeChild(child.element);
      }
    });
    globeGroup.remove(userMarker);
    userMarker = null;
  }
  
  // Create marker group
  userMarker = new THREE.Group();
  
  // Create glowing point
  const pointGeometry = new THREE.SphereGeometry(0.08, 16, 16);
  const pointMaterial = new THREE.MeshBasicMaterial({
    color: 0xf2c14e, // Gold color for user marker
    transparent: false,
    depthTest: true,
    depthWrite: true,
  });
  const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
  userMarker.add(pointMesh);
  
  // Create pulsing ring
  const ringGeometry = new THREE.RingGeometry(0.1, 0.15, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xf2c14e, // Gold color for pulse ring
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
  
  // Position marker
  const position = latLonToVector3(lat, lon, CONFIG.globe.radius + 0.05);
  userMarker.position.copy(position);
  
  // Orient marker to face outward
  userMarker.lookAt(new THREE.Vector3(0, 0, 0));
  userMarker.rotateX(Math.PI / 2);
  
  globeGroup.add(userMarker);
  
  // Add label
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

// ============================================
// Globe Rotation Animation
// ============================================
function rotateToLocation(lat, lon) {
  // Calculate target rotation to show the location on the front
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  
  // Target rotation for the globe group
  const targetRotationY = -theta + Math.PI;
  
  // Animate rotation
  const startRotation = globeGroup.rotation.y;
  const startTime = Date.now();
  const duration = CONFIG.animation.rotateToUserDuration;
  
  function animateRotation() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    
    // Calculate shortest rotation path
    let deltaRotation = targetRotationY - startRotation;
    while (deltaRotation > Math.PI) deltaRotation -= 2 * Math.PI;
    while (deltaRotation < -Math.PI) deltaRotation += 2 * Math.PI;
    
    globeGroup.rotation.y = startRotation + deltaRotation * eased;
    
    if (progress < 1) {
      requestAnimationFrame(animateRotation);
    }
  }
  
  animateRotation();
}

// ============================================
// Utility Functions
// ============================================
function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// ============================================
// Animation Loop
// ============================================
function animate() {
  requestAnimationFrame(animate);
  
  const now = Date.now();
  
  // Auto-rotation when not interacting
  if (!isUserInteracting && now - lastInteractionTime > interactionCooldown) {
    globeGroup.rotation.y += CONFIG.globe.rotationSpeed;
  }
  
  // Animate user marker pulse ring
  if (userMarker) {
    userMarker.children.forEach(child => {
      if (child.userData && child.userData.isPulseRing) {
        child.userData.pulsePhase += 0.03;
        const scale = 1 + Math.sin(child.userData.pulsePhase) * 0.5;
        child.scale.set(scale, scale, 1);
        child.material.opacity = 0.8 - Math.sin(child.userData.pulsePhase) * 0.6;
      }
    });
  }
  
  // Update label visibility (hide labels on back side)
  updateLabelVisibility();
  
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// Hide labels that are on the far side of the globe
function updateLabelVisibility() {
  const cameraPosition = camera.position.clone();
  const cameraDistance = cameraPosition.length();
  
  // Calculate minimum size threshold based on zoom level
  // More aggressive filtering - show fewer labels when zoomed out
  const minDist = CONFIG.camera.minDistance;
  const maxDist = CONFIG.camera.maxDistance;
  const zoomFactor = (cameraDistance - minDist) / (maxDist - minDist); // 0 (close) to 1 (far)
  
  // Use exponential curve for more aggressive filtering at medium distances
  const zoomCurve = Math.pow(zoomFactor, 0.7); // Makes it more sensitive
  
  // Size threshold: 0.55 when very close, 1.3 when far (only biggest countries)
  const minSizeThreshold = 0.55 + zoomCurve * 0.75;
  
  labelObjects.forEach(labelObj => {
    const labelSize = labelObj.userData.size || 1;
    
    // Check if label should be shown based on zoom level
    const showByZoom = labelSize >= minSizeThreshold;
    
    if (!showByZoom) {
      // Hide small labels when zoomed out
      if (labelObj.userData.element) {
        labelObj.userData.element.style.opacity = '0';
        labelObj.userData.element.style.pointerEvents = 'none';
      }
      return;
    }
    
    // Get world position of the label
    const labelWorldPos = new THREE.Vector3();
    labelObj.getWorldPosition(labelWorldPos);
    
    // Vector from globe center to label
    const labelDir = labelWorldPos.clone().normalize();
    
    // Vector from globe center to camera
    const cameraDir = cameraPosition.clone().normalize();
    
    // Dot product: positive = facing camera, negative = facing away
    const dot = labelDir.dot(cameraDir);
    
    // Show label only if facing camera (with small threshold)
    const isFacingCamera = dot > 0.1;
    
    if (labelObj.userData.element) {
      labelObj.userData.element.style.opacity = isFacingCamera ? '1' : '0';
      labelObj.userData.element.style.pointerEvents = isFacingCamera ? 'auto' : 'none';
    }
  });
}

// ============================================
// Window Resize Handler
// ============================================
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// Start Application
// ============================================
// Wait for DOM to be ready
function domReady() {
  return new Promise(resolve => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve);
    } else {
      resolve();
    }
  });
}

// Start the app (wrapped in async IIFE to avoid top-level await)
(async function() {
  try {
    await domReady();
    console.log('DOM ready, starting init...');
    await init();
  } catch (error) {
    console.error('Failed to initialize globe:', error);
    // Hide modal and show error on page
    document.body.innerHTML = `
      <div style="color: white; padding: 40px; font-family: sans-serif;">
        <h1>Error loading globe</h1>
        <p>${error.message}</p>
        <pre>${error.stack}</pre>
      </div>
    `;
  }
})();
