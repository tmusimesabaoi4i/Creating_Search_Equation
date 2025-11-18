// js/ui/dom-utils.js

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function create(tagName, className) {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  return el;
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// グローバル公開
window.qs = qs;
window.qsa = qsa;
window.create = create;
window.clearChildren = clearChildren;
