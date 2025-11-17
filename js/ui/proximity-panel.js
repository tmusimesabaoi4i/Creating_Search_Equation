// js/ui/proximity-panel.js
// 式ビルダーパネル（2近傍・3近傍・OR・AND 用 UI コントロール）

import { qs, qsa, create } from './dom-utils.js';

/**
 * @typedef {Object} ProxOptions
 * @property {"n"|"c"} mode
 * @property {number} k
 */

/**
 * @typedef {Object} BuilderHandlers
 * @property {(orderIds: string[], opts: ProxOptions) => void} [onBuildL1]
 * @property {(orderIds: string[], opts: ProxOptions) => void} [onBuildProx2]
 * @property {(orderIds: string[], opts: ProxOptions) => void} [onBuildProx3]
 * @property {(orderIds: string[]) => void} [onBuildOr]
 * @property {(orderIds: string[]) => void} [onBuildAnd]
 * @property {(orderIds: string[]) => void} [onOrderChanged]
 * @property {(id: string) => void} [onItemRemoved]
 */

/**
 * 式ビルダーパネル UI。
 * - 素材一覧の表示・順序変更
 * - 近傍パラメータ入力
 * - 1要素式 / 2近傍 / 3近傍 / OR / AND ボタン
 * -> 実際の AST 組立ては AppController 側のハンドラに委譲。
 */
export class ProximityPanel {
  /**
   * @param {HTMLElement} rootEl - #builder-panel
   */
  constructor(rootEl) {
    this.root = rootEl;

    this.elements = {
      selectionList: qs('#builder-selection-list', this.root),
      proxModeRadios: /** @type {HTMLInputElement[]} */ (qsa(
        'input[name="prox-mode"]',
        this.root
      )),
      proxKInput: /** @type {HTMLInputElement} */ (qs('#prox-k-input', this.root)),
      btnL1: /** @type {HTMLButtonElement} */ (qs('#btn-build-l1', this.root)),
      btnProx2: /** @type {HTMLButtonElement} */ (qs('#btn-build-prox2', this.root)),
      btnProx3: /** @type {HTMLButtonElement} */ (qs('#btn-build-prox3', this.root)),
      btnOr: /** @type {HTMLButtonElement} */ (qs('#btn-build-or', this.root)),
      btnAnd: /** @type {HTMLButtonElement} */ (qs('#btn-build-and', this.root)),
      messageBox: /** @type {HTMLElement} */ (qs('#builder-message', this.root))
    };

    /** @type {string[]} */
    this.selectionOrder = [];

    /** @type {BuilderHandlers} */
    this.handlers = {};

    this._bindInternalEvents();
  }

  /**
   * AppController からハンドラを登録する。
   * @param {BuilderHandlers} handlers
   */
  bindHandlers(handlers) {
    this.handlers = handlers || {};
  }

  /**
   * 素材一覧（最大 3 個）を UI に描画し、内部の selectionOrder を更新する。
   * @param {{ id: string, kind: "WB"|"EB", label: string }[]} blockSummaries
   */
  updateSelection(blockSummaries) {
    this.selectionOrder = blockSummaries.map((b) => b.id);

    const list = this.elements.selectionList;
    if (!list) return;

    list.innerHTML = '';

    blockSummaries.forEach((b) => {
      const li = create('li', 'builder-selection-item');
      li.dataset.id = b.id;
      li.dataset.kind = b.kind;

      const labelSpan = create(
        'span',
        'builder-selection-item__label'
      );
      labelSpan.textContent = `[${b.kind}] ${b.label}`;
      li.appendChild(labelSpan);

      const controls = create(
        'div',
        'builder-selection-item__controls'
      );

      const btnUp = create('button', 'btn-tiny js-move-up');
      btnUp.type = 'button';
      btnUp.textContent = '↑';
      controls.appendChild(btnUp);

      const btnDown = create('button', 'btn-tiny js-move-down');
      btnDown.type = 'button';
      btnDown.textContent = '↓';
      controls.appendChild(btnDown);

      const btnRemove = create('button', 'btn-tiny js-remove');
      btnRemove.type = 'button';
      btnRemove.textContent = '×';
      controls.appendChild(btnRemove);

      li.appendChild(controls);

      list.appendChild(li);
    });
  }

  /**
   * 近傍/論理演算ボタンを enable/disable 切り替えする。
   * @param {{ l1?: boolean, prox2?: boolean, prox3?: boolean, or?: boolean, and?: boolean }} flags
   */
  setOperationEnabled(flags) {
    flags = flags || {};
    if (this.elements.btnL1) {
      this.elements.btnL1.disabled = !flags.l1;
    }
    if (this.elements.btnProx2) {
      this.elements.btnProx2.disabled = !flags.prox2;
    }
    if (this.elements.btnProx3) {
      this.elements.btnProx3.disabled = !flags.prox3;
    }
    if (this.elements.btnOr) {
      this.elements.btnOr.disabled = !flags.or;
    }
    if (this.elements.btnAnd) {
      this.elements.btnAnd.disabled = !flags.and;
    }
  }

  /**
   * 近傍形式ラジオボタンの有効/無効を制御する。
   * 例: 3近傍の場合 allowC=false, allowN=true として c を無効化。
   * @param {{ allowC: boolean, allowN: boolean }} options
   */
  setProximityModeOptions(options) {
    const allowC = !!options.allowC;
    const allowN = !!options.allowN;

    let anyChecked = false;

    this.elements.proxModeRadios.forEach((radio) => {
      if (radio.value === 'c') {
        radio.disabled = !allowC;
        if (!allowC && radio.checked) {
          radio.checked = false;
        }
      } else if (radio.value === 'n') {
        radio.disabled = !allowN;
        if (!allowN && radio.checked) {
          radio.checked = false;
        }
      }

      if (radio.checked) {
        anyChecked = true;
      }
    });

    // どれもチェックされていない場合、許可されている方を優先的に選択
    if (!anyChecked) {
      if (allowN) {
        const nRadio = this.elements.proxModeRadios.find(
          (r) => r.value === 'n'
        );
        if (nRadio) nRadio.checked = true;
      } else if (allowC) {
        const cRadio = this.elements.proxModeRadios.find(
          (r) => r.value === 'c'
        );
        if (cRadio) cRadio.checked = true;
      }
    }
  }

  /**
   * ビルダーパネル内のメッセージ表示領域にメッセージを表示 or クリアする。
   * @param {string} text
   * @param {"info"|"error"|"none"} [kind]
   */
  showMessage(text, kind = 'info') {
    const box = this.elements.messageBox;
    if (!box) return;

    box.textContent = text || '';

    box.classList.remove('is-error', 'is-info');

    if (!text || kind === 'none') {
      return;
    }
    if (kind === 'error') {
      box.classList.add('is-error');
    } else if (kind === 'info') {
      box.classList.add('is-info');
    }
  }

  // =======================================
  // 内部イベント
  // =======================================

  _bindInternalEvents() {
    if (this.elements.btnL1) {
      this.elements.btnL1.addEventListener('click', () => {
        const order = this.selectionOrder.slice();
        const opts = this._getProxOptions();
        if (this.handlers.onBuildL1) {
          this.handlers.onBuildL1(order, opts);
        }
      });
    }

    if (this.elements.btnProx2) {
      this.elements.btnProx2.addEventListener('click', () => {
        const order = this.selectionOrder.slice();
        const opts = this._getProxOptions();
        if (this.handlers.onBuildProx2) {
          this.handlers.onBuildProx2(order, opts);
        }
      });
    }

    if (this.elements.btnProx3) {
      this.elements.btnProx3.addEventListener('click', () => {
        const order = this.selectionOrder.slice();
        const opts = this._getProxOptions();
        if (this.handlers.onBuildProx3) {
          this.handlers.onBuildProx3(order, opts);
        }
      });
    }

    if (this.elements.btnOr) {
      this.elements.btnOr.addEventListener('click', () => {
        const order = this.selectionOrder.slice();
        if (this.handlers.onBuildOr) {
          this.handlers.onBuildOr(order);
        }
      });
    }

    if (this.elements.btnAnd) {
      this.elements.btnAnd.addEventListener('click', () => {
        const order = this.selectionOrder.slice();
        if (this.handlers.onBuildAnd) {
          this.handlers.onBuildAnd(order);
        }
      });
    }

    // 選択リストの ↑ / ↓ / × ボタン
    if (this.elements.selectionList) {
      this.elements.selectionList.addEventListener('click', (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        const li = target.closest('.builder-selection-item');
        if (!li || !li.dataset.id) return;
        const id = li.dataset.id;

        if (target.classList.contains('js-move-up')) {
          this._handleMove(id, -1);
        } else if (target.classList.contains('js-move-down')) {
          this._handleMove(id, +1);
        } else if (target.classList.contains('js-remove')) {
          this._handleRemove(id);
        }
      });
    }
  }

  /**
   * 近傍オプションを UI から取得する。
   * @returns {ProxOptions}
   * @private
   */
  _getProxOptions() {
    let mode = 'n';
    const checked = this.elements.proxModeRadios.find((r) => r.checked);
    if (checked && (checked.value === 'n' || checked.value === 'c')) {
      mode = checked.value;
    }

    let k = parseInt(this.elements.proxKInput.value, 10);
    if (isNaN(k)) k = 0;
    if (k < 0) k = 0;
    if (k > 99) k = 99;

    return { mode: /** @type {"n"|"c"} */ (mode), k: k };
  }

  /**
   * 順序変更（↑ / ↓）を処理。
   * 新しい順序を onOrderChanged に通知する。UI の再描画自体は AppController 側に任せる。
   * @param {string} id
   * @param {number} delta - -1: 上へ, +1: 下へ
   * @private
   */
  _handleMove(id, delta) {
    const order = this.selectionOrder.slice();
    const idx = order.indexOf(id);
    if (idx < 0) return;

    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= order.length) return;

    // 要素入れ替え
    const tmp = order[idx];
    order[idx] = order[newIdx];
    order[newIdx] = tmp;

    if (this.handlers.onOrderChanged) {
      this.handlers.onOrderChanged(order);
    }
  }

  /**
   * 素材削除（×）を処理。
   * @param {string} id
   * @private
   */
  _handleRemove(id) {
    if (this.handlers.onItemRemoved) {
      this.handlers.onItemRemoved(id);
    } else if (this.handlers.onOrderChanged) {
      const order = this.selectionOrder.filter((x) => x !== id);
      this.handlers.onOrderChanged(order);
    }
  }
}