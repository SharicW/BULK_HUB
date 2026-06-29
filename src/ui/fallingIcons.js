const ICON_SRC = "assets/bulk.png";
const ICON_COUNT = 18;
const MIN_SIZE = 20;
const MAX_SIZE = 52;
const MIN_DURATION = 8;
const MAX_DURATION = 18;
const MIN_OPACITY = 0.08;
const MAX_OPACITY = 0.22;

export function initFallingIcons() {
  const canvas = document.createElement("div");
  canvas.id = "falling-icons-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  for (let i = 0; i < ICON_COUNT; i++) {
    spawnIcon(canvas);
  }
}

function spawnIcon(canvas) {
  const el = document.createElement("img");
  el.src = ICON_SRC;
  el.draggable = false;
  el.setAttribute("aria-hidden", "true");
  el.className = "falling-icon";

  const size = rand(MIN_SIZE, MAX_SIZE);
  const left = rand(2, 98);
  const duration = rand(MIN_DURATION, MAX_DURATION);
  const opacity = randF(MIN_OPACITY, MAX_OPACITY);
  const delay = -(Math.random() * duration * 1000);

  el.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    left: ${left}%;
    opacity: ${opacity};
    animation-duration: ${duration}s;
    animation-delay: ${delay}ms;
  `;

  el.addEventListener("animationiteration", () => {
    el.style.left = rand(2, 98) + "%";
    el.style.opacity = randF(MIN_OPACITY, MAX_OPACITY);
  });

  canvas.appendChild(el);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randF(min, max) {
  return (Math.random() * (max - min) + min).toFixed(3);
}
