const ICON_SRC = "assets/bulk.png";
const ICON_COUNT = 18;
const MIN_SIZE = 24;
const MAX_SIZE = 56;
const MIN_DURATION = 8;
const MAX_DURATION = 18;
const MIN_OPACITY = 0.04;
const MAX_OPACITY = 0.10;

export function initFallingIcons() {
  const main = document.getElementById("main");
  if (!main) return;

  const canvas = document.createElement("div");
  canvas.id = "falling-icons-canvas";
  canvas.setAttribute("aria-hidden", "true");
  main.prepend(canvas);

  for (let i = 0; i < ICON_COUNT; i++) {
    spawnIcon(canvas, i * (1000 / ICON_COUNT));
  }
}

function spawnIcon(canvas, initialDelay) {
  const el = document.createElement("img");
  el.src = ICON_SRC;
  el.className = "falling-icon";
  el.draggable = false;

  const size = rand(MIN_SIZE, MAX_SIZE);
  const left = rand(2, 98);
  const duration = rand(MIN_DURATION, MAX_DURATION);
  const opacity = randF(MIN_OPACITY, MAX_OPACITY);
  const delay = initialDelay !== undefined ? initialDelay : 0;

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
    el.style.animationDuration = rand(MIN_DURATION, MAX_DURATION) + "s";
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
