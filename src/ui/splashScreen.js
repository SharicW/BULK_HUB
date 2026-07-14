const ICON_SRC = "assets/bulk.png";
const ICON_COUNT = 18;
const REPULSE_RADIUS = 140;
const REPULSE_FORCE = 320;
const DAMPING = 0.88;

class Star {
  constructor(container, w, h) {
    this.el = document.createElement("img");
    this.el.src = ICON_SRC;
    this.el.draggable = false;
    this.el.setAttribute("aria-hidden", "true");
    this.el.style.cssText =
      "position:absolute;top:0;left:0;pointer-events:none;user-select:none;" +
      "filter:brightness(10);will-change:transform;";
    container.appendChild(this.el);
    this.vx = 0;
    this.vy = 0;
    this.reset(w, h, true);
  }

  reset(w, h, initial = false) {
    this.size = 20 + Math.random() * 32;
    this.x = Math.random() * w;
    this.y = initial ? Math.random() * (h + 80) - 80 : -this.size - 10;
    this.fallSpeed = 48 + Math.random() * 72;
    this.rotSpeed = (Math.random() - 0.5) * 110;
    this.rotation = Math.random() * 360;
    this.opacity = 0.08 + Math.random() * 0.14;
    this.vx = 0;
    this.vy = 0;
    this.el.style.width = this.size + "px";
    this.el.style.height = this.size + "px";
    this.el.style.opacity = this.opacity;
  }

  update(dt, mx, my, w, h) {
    this.y += this.fallSpeed * dt;
    this.rotation += this.rotSpeed * dt;

    const cx = this.x + this.size / 2;
    const cy = this.y + this.size / 2;
    const dx = cx - mx;
    const dy = cy - my;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < REPULSE_RADIUS && dist > 1) {
      const f = (1 - dist / REPULSE_RADIUS) * REPULSE_FORCE;
      this.vx += (dx / dist) * f * dt;
      this.vy += (dy / dist) * f * dt;
    }

    const damp = Math.pow(DAMPING, dt * 60);
    this.vx *= damp;
    this.vy *= damp;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.el.style.transform =
      `translate(${this.x}px,${this.y}px) rotate(${this.rotation}deg)`;

    if (this.y > h + 100) this.reset(w, h);
  }
}

export function initSplash() {
  const splash = document.createElement("div");
  splash.id = "splash";

  const iconsEl = document.createElement("div");
  iconsEl.id = "splash-icons";

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
  btn.textContent = "Enter";

  content.appendChild(logo);
  content.appendChild(btn);
  splash.appendChild(iconsEl);
  splash.appendChild(content);
  document.body.appendChild(splash);

  let w = window.innerWidth;
  let h = window.innerHeight;
  const stars = Array.from({ length: ICON_COUNT }, () => new Star(iconsEl, w, h));

  let mx = -9999;
  let my = -9999;

  splash.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
  });
  splash.addEventListener("mouseleave", () => { mx = -9999; my = -9999; });

  const onResize = () => { w = window.innerWidth; h = window.innerHeight; };
  window.addEventListener("resize", onResize);

  let rafId;
  let last = null;

  function tick(ts) {
    if (!last) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    stars.forEach((s) => s.update(dt, mx, my, w, h));
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  btn.addEventListener("click", () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    splash.classList.add("splash--exit");
    setTimeout(() => splash.remove(), 900);
  }, { once: true });
}
