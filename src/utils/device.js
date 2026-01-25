
const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1025,
};


let currentDeviceType = null;
let subscribers = [];


export function getDeviceType() {
  const width = window.innerWidth;
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  

  if (width <= BREAKPOINTS.mobile) {
    return 'mobile';
  }
  

  if (width <= BREAKPOINTS.tablet) {

    return hasCoarsePointer && !hasFinePointer ? 'tablet' : 'tablet';
  }
  

  return 'desktop';
}


export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches ||
         'ontouchstart' in window ||
         navigator.maxTouchPoints > 0;
}


export function subscribeDeviceType(callback) {
  subscribers.push(callback);
  

  if (currentDeviceType) {
    callback(currentDeviceType);
  }
  

  return () => {
    subscribers = subscribers.filter(cb => cb !== callback);
  };
}


function updateDeviceState() {
  const newType = getDeviceType();
  const isTouch = isTouchDevice();
  
  const html = document.documentElement;
  

  html.setAttribute('data-device', newType);
  

  html.classList.remove('is-mobile', 'is-tablet', 'is-desktop');
  html.classList.add(`is-${newType}`);
  

  html.classList.toggle('is-touch', isTouch);
  html.classList.toggle('is-pointer', !isTouch);
  

  if (newType !== currentDeviceType) {
    currentDeviceType = newType;
    subscribers.forEach(cb => {
      try {
        cb(newType);
      } catch (e) {
        console.warn('Device type subscriber error:', e);
      }
    });
  }
}


export function initDeviceDetection() {

  updateDeviceState();
  

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(updateDeviceState, 100);
  });
  

  window.addEventListener('orientationchange', () => {

    setTimeout(updateDeviceState, 150);
  });
  

  const pointerMQ = window.matchMedia('(pointer: coarse)');
  if (pointerMQ.addEventListener) {
    pointerMQ.addEventListener('change', updateDeviceState);
  } else if (pointerMQ.addListener) {

    pointerMQ.addListener(updateDeviceState);
  }
  
  return {
    getDeviceType,
    isTouchDevice,
    subscribe: subscribeDeviceType,
  };
}


export const DEVICE_BREAKPOINTS = BREAKPOINTS;

