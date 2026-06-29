export const qs = (selector, scope = document) => scope.querySelector(selector);
export const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export const createEl = (tag, { className, attrs, html } = {}) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  if (html !== undefined) {
    el.innerHTML = html;
  }
  return el;
};

