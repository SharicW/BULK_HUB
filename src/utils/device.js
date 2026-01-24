/**
 * Device detection utility
 * Определяет тип устройства через matchMedia (без user-agent)
 * и обновляет атрибуты на <html> для CSS-хуков
 */

// Breakpoints (соответствуют CSS media queries)
const BREAKPOINTS = {
  mobile: 480,   // 0 - 480px
  tablet: 1024,  // 481px - 1024px
  desktop: 1025, // 1025px+
};

// Текущее состояние
let currentDeviceType = null;
let subscribers = [];

/**
 * Определяет тип устройства по ширине экрана и типу указателя
 * @returns {'mobile' | 'tablet' | 'desktop'}
 */
export function getDeviceType() {
  const width = window.innerWidth;
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  
  // Mobile: узкий экран ИЛИ (средний экран + только touch)
  if (width <= BREAKPOINTS.mobile) {
    return 'mobile';
  }
  
  // Tablet: средний экран (481-1024px)
  // Если есть coarse pointer (touch) — скорее всего планшет
  if (width <= BREAKPOINTS.tablet) {
    // Если только coarse pointer — это планшет/большой телефон
    // Если есть fine pointer — возможно десктоп в узком окне
    return hasCoarsePointer && !hasFinePointer ? 'tablet' : 'tablet';
  }
  
  // Desktop: широкий экран (1025px+)
  return 'desktop';
}

/**
 * Проверяет, является ли устройство touch-устройством
 * @returns {boolean}
 */
export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches ||
         'ontouchstart' in window ||
         navigator.maxTouchPoints > 0;
}

/**
 * Подписка на изменение типа устройства
 * @param {(deviceType: 'mobile' | 'tablet' | 'desktop') => void} callback
 * @returns {() => void} функция отписки
 */
export function subscribeDeviceType(callback) {
  subscribers.push(callback);
  
  // Сразу вызываем с текущим значением
  if (currentDeviceType) {
    callback(currentDeviceType);
  }
  
  // Возвращаем функцию отписки
  return () => {
    subscribers = subscribers.filter(cb => cb !== callback);
  };
}

/**
 * Обновляет атрибуты на <html> и вызывает подписчиков
 */
function updateDeviceState() {
  const newType = getDeviceType();
  const isTouch = isTouchDevice();
  
  const html = document.documentElement;
  
  // Устанавливаем data-device атрибут
  html.setAttribute('data-device', newType);
  
  // Устанавливаем классы для CSS
  html.classList.remove('is-mobile', 'is-tablet', 'is-desktop');
  html.classList.add(`is-${newType}`);
  
  // Touch-класс
  html.classList.toggle('is-touch', isTouch);
  html.classList.toggle('is-pointer', !isTouch);
  
  // Уведомляем подписчиков только при изменении
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

/**
 * Инициализация модуля
 * Вызывать один раз при старте приложения
 */
export function initDeviceDetection() {
  // Первичное определение
  updateDeviceState();
  
  // Слушаем resize с debounce
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(updateDeviceState, 100);
  });
  
  // Слушаем изменение ориентации
  window.addEventListener('orientationchange', () => {
    // Небольшая задержка для корректного определения размеров
    setTimeout(updateDeviceState, 150);
  });
  
  // Слушаем изменение media query для pointer
  const pointerMQ = window.matchMedia('(pointer: coarse)');
  if (pointerMQ.addEventListener) {
    pointerMQ.addEventListener('change', updateDeviceState);
  } else if (pointerMQ.addListener) {
    // Fallback для старых браузеров
    pointerMQ.addListener(updateDeviceState);
  }
  
  return {
    getDeviceType,
    isTouchDevice,
    subscribe: subscribeDeviceType,
  };
}

// Экспорт breakpoints для использования в других модулях
export const DEVICE_BREAKPOINTS = BREAKPOINTS;
