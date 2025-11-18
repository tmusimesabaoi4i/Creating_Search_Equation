// js/ui/dom-utils.js
// DOM 操作の小ヘルパ関数群

/**
 * root 内で selector に一致する最初の要素を返す。
 * @param {string} selector
 * @param {Document|HTMLElement} [root=document]
 * @returns {HTMLElement|null}
 */
/** export function*/ function qs(selector, root = document) {
  return /** @type {HTMLElement|null} */ (root.querySelector(selector));
}

/**
 * root 内で selector に一致する全要素を配列で返す。
 * @param {string} selector
 * @param {Document|HTMLElement} [root=document]
 * @returns {HTMLElement[]}
 */
/** export function*/ function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * 指定タグの要素を作成し、className があれば設定して返す。
 * @param {string} tagName
 * @param {string} [className]
 * @returns {HTMLElement}
 */
/** export function*/ function create(tagName, className) {
  const el = document.createElement(tagName);
  if (className) {
    el.className = className;
  }
  return el;
}

/**
 * 要素 el の子要素を全て削除する。
 * @param {HTMLElement} el
 */
/** export function*/ function clearChildren(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

window.qs = qs
window.qsa = qsa
window.create = create
window.clearChildren = clearChildren