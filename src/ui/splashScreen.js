const ICON_SRC = "assets/bulk.png";
const ICON_COUNT = 18;

export function initSplash() {
  const splash = document.createElement("div");
  splash.id = "splash";

  const iconsEl = document.createElement("div");
  iconsEl.id = "splash-icons";

  for (let i = 0; i < ICON_COUNT; i++) {
    iconsEl.appendChild(createStar());
  }

  const content = document.createElement("div");
  content.className = "splash-content";

  const logo = document.createElement("img");
  logo.src = "assets/BULK_HUB_LOGO.png";
  logo.className = "splash-logo";
  logo.draggable = false;
  logo.alt = "Bulk Hub";

  const btn = document.createElement("button");
  btn.className = "splash-btn";
  btn.type = "button";
  btn.textContent = "Войти на сайт";

  content.appendChild(logo);
  content.appendChild(btn);
  splash.appendChild(iconsEl);
  splash.appendChild(content);
  document.body.appendChild(splash);

  btn.addEventListener("click", () => {
    splash.classList.add("splash--exit");
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
  }, { once: true });
}

function createStar() {
  const el = document.createElement("img");
  el.src = ICON_SRC;
  el.draggable = false;
  el.setAttribute("aria-hidden", "true");
  el.className = "splash-star";

  const size = rand(20, 52);
  const left = rand(2, 98);
  const duration = rand(8, 18);
  const opacity = randF(0.08, 0.22);
  const delay = -(Math.random() * duration * 1000);

  el.style.cssText = `width:${size}px;height:${size}px;left:${left}%;opacity:${opacity};animation-duration:${duration}s;animation-delay:${delay}ms;`;

  el.addEventListener("animationiteration", () => {
    el.style.left = rand(2, 98) + "%";
    el.style.opacity = randF(0.08, 0.22);
  });

  return el;
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randF(min, max) { return (Math.random() * (max - min) + min).toFixed(3); }
