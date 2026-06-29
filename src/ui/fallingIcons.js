const ICON_COUNT = 18;
const MIN_SIZE = 20;
const MAX_SIZE = 52;
const MIN_DURATION = 8;
const MAX_DURATION = 18;
const MIN_OPACITY = 0.08;
const MAX_OPACITY = 0.22;

const STAR_PATH = "M12 2 L13.5 8.5 L20 7 L15.5 12 L20 17 L13.5 15.5 L12 22 L10.5 15.5 L4 17 L8.5 12 L4 7 L10.5 8.5 Z";
const STAR_COLOR = "#F7B32B";

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
  const ns = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(ns, "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("fill", STAR_COLOR);
  el.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", STAR_PATH);
  el.appendChild(path);

  el.className = "falling-icon";

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
