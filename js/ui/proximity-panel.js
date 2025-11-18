// js/ui/proximity-panel.js
// 近傍・OR/AND 式ビルダー UI

class ProximityPanel {
  /**
   * @param {AppController} app
   */
  constructor(app) {
    this.app = app;

    this.panelEl = null;
    this.selectionListEl = null;
    this.messageEl = null;
    this.proxModeRadios = [];
    this.proxKInput = null;

    this.btnBuildL1 = null;
    this.btnBuildProx2 = null;
    this.btnBuildProx3 = null;
    this.btnBuildOr = null;
    this.btnBuildAnd = null;
  }

  init() {
    this.panelEl = qs('#builder-panel');
    if (!this.panelEl) return;

    this.selectionListEl = qs('#builder-selection-list', this.panelEl);
    this.messageEl = qs('#builder-message', this.panelEl);
    this.proxModeRadios = Array.from(
      this.panelEl.querySelectorAll('input[name="prox-mode"]')
    );
    this.proxKInput = qs('#prox-k-input', this.panelEl);

    this.btnBuildL1 = qs('#btn-build-l1', this.panelEl);
    this.btnBuildProx2 = qs('#btn-build-prox2', this.panelEl);
    this.btnBuildProx3 = qs('#btn-build-prox3', this.panelEl);
    this.btnBuildOr = qs('#btn-build-or', this.panelEl);
    this.btnBuildAnd = qs('#btn-build-and', this.panelEl);

    if (this.selectionListEl) {
      this.selectionListEl.addEventListener('click', (e) =>
        this.onSelectionListClick(e)
      );
    }

    if (this.btnBuildL1) {
      this.btnBuildL1.addEventListener('click', () => this.handleBuildL1());
    }
    if (this.btnBuildProx2) {
      this.btnBuildProx2.addEventListener('click', () =>
        this.handleBuildProx2()
      );
    }
    if (this.btnBuildProx3) {
      this.btnBuildProx3.addEventListener('click', () =>
        this.handleBuildProx3()
      );
    }
    if (this.btnBuildOr) {
      this.btnBuildOr.addEventListener('click', () =>
        this.handleBuildLogical('+')
      );
    }
    if (this.btnBuildAnd) {
      this.btnBuildAnd.addEventListener('click', () =>
        this.handleBuildLogical('*')
      );
    }

    this.renderSelectionList();
    this.updateButtons();
  }

  setSelectionIds(ids) {
    this.renderSelectionList();
    this.updateButtons();
    this.clearMessage();
  }

  onRepositoryUpdated() {
    this.renderSelectionList();
    this.updateButtons();
  }

  showMessage(text, kind) {
    if (!this.messageEl) return;
    this.messageEl.textContent = text || '';
    this.messageEl.classList.remove('is-error', 'is-info');
    if (kind === 'error') {
      this.messageEl.classList.add('is-error');
    } else {
      this.messageEl.classList.add('is-info');
    }
  }

  clearMessage() {
    if (!this.messageEl) return;
    this.messageEl.textContent = '';
    this.messageEl.classList.remove('is-error', 'is-info');
  }

  _getSelectedBlocks() {
    const ids = this.app.state.builderSelectionIds || [];
    const result = [];
    ids.forEach((id) => {
      const b = this.app.repo.get(id);
      if (b) result.push(b);
    });
    return result;
  }

  renderSelectionList() {
    if (!this.selectionListEl) return;
    clearChildren(this.selectionListEl);

    const ids = this.app.state.builderSelectionIds || [];
    ids.forEach((id) => {
      const blk = this.app.repo.get(id);
      if (!blk) return;

      const li = create('li', 'builder-selection-item');
      li.dataset.id = id;

      const kindLabel =
        blk.kind === 'WB'
          ? '[W]'
          : blk.kind === 'CB'
          ? '[C]'
          : '[E]';

      const spanText = create('span', 'builder-selection-item__text');
      spanText.textContent = `${kindLabel} ${blk.label || blk.id}`;

      const btnUp = create('button', 'btn-small builder-selection-item__up');
      btnUp.type = 'button';
      btnUp.textContent = '↑';

      const btnDown = create(
        'button',
        'btn-small builder-selection-item__down'
      );
      btnDown.type = 'button';
      btnDown.textContent = '↓';

      const btnRemove = create(
        'button',
        'btn-small builder-selection-item__remove'
      );
      btnRemove.type = 'button';
      btnRemove.textContent = '×';

      const btnBox = create('span', 'builder-selection-item__buttons');
      btnBox.appendChild(btnUp);
      btnBox.appendChild(btnDown);
      btnBox.appendChild(btnRemove);

      li.appendChild(spanText);
      li.appendChild(btnBox);
      this.selectionListEl.appendChild(li);
    });
  }

  onSelectionListClick(event) {
    const target = event.target;
    const li = target.closest('.builder-selection-item');
    if (!li) return;

    const id = li.dataset.id;
    const ids = this.app.state.builderSelectionIds || [];
    const index = ids.indexOf(id);
    if (index < 0) return;

    if (target.classList.contains('builder-selection-item__up')) {
      if (index > 0) {
        const tmp = ids[index - 1];
        ids[index - 1] = ids[index];
        ids[index] = tmp;
        this.app.setBuilderSelectionIds(ids);
      }
    } else if (
      target.classList.contains('builder-selection-item__down')
    ) {
      if (index < ids.length - 1) {
        const tmp = ids[index + 1];
        ids[index + 1] = ids[index];
        ids[index] = tmp;
        this.app.setBuilderSelectionIds(ids);
      }
    } else if (
      target.classList.contains('builder-selection-item__remove')
    ) {
      ids.splice(index, 1);
      this.app.setBuilderSelectionIds(ids);
    }
  }

  /**
   * OR/AND/近傍 ボタンの有効・無効更新
   */
  updateButtons() {
    const blocks = this._getSelectedBlocks();
    const n = blocks.length;

    const hasBlocks = n > 0;
    const canProxAll = blocks.every((b) => this._isProxCandidateBlock(b));

    if (this.btnBuildL1) {
      this.btnBuildL1.disabled = n !== 1;
    }
    if (this.btnBuildProx2) {
      this.btnBuildProx2.disabled = !(n === 2 && canProxAll);
    }
    if (this.btnBuildProx3) {
      this.btnBuildProx3.disabled = !(n === 3 && canProxAll);
    }

    // OR/AND: 2 つ以上必要
    // ただし OR は「Word 系のみ」or「Class 系のみ」のときのみ許可
    const orType = this._getLogicalTypeForBlocks(blocks);
    if (this.btnBuildOr) {
      this.btnBuildOr.disabled =
        n < 2 || !hasBlocks || !(orType === 'word' || orType === 'class');
    }

    if (this.btnBuildAnd) {
      // AND は Word+Class も許可（積演算）
      this.btnBuildAnd.disabled = n < 2 || !hasBlocks;
    }
  }

  /**
   * 近傍候補（Word 由来のみ）
   * @param {Block} block
   * @returns {boolean}
   * @private
   */
  _isProxCandidateBlock(block) {
    if (!block) return false;
    if (block.kind === 'CB') {
      return false;
    }
    if (block.kind === 'WB') {
      return true;
    }
    if (block.kind === 'EB') {
      return !!block.canUseForProximity;
    }
    return false;
  }

  /**
   * OR/AND 用に「Word系 / Class系 / Mixed」を判定
   * @param {Block[]} blocks
   * @returns {"word"|"class"|"mixed"|"empty"}
   * @private
   */
  _getLogicalTypeForBlocks(blocks) {
    if (!blocks || blocks.length === 0) return 'empty';

    const repo = this.app.repo;
    const typeSet = new Set();

    blocks.forEach((b) => {
      if (b.kind === 'WB') {
        typeSet.add('word');
      } else if (b.kind === 'CB') {
        typeSet.add('class');
      } else if (b.kind === 'EB') {
        if (!b.root) {
          typeSet.add('empty');
        } else {
          const parts = translateExprToFieldParts(b.root, repo);
          const hasWord = !!(parts.w && parts.w.trim().length > 0);
          const hasClass = parts.c && parts.c.length > 0;
          if (hasWord && hasClass) typeSet.add('mixed');
          else if (hasWord) typeSet.add('word');
          else if (hasClass) typeSet.add('class');
          else typeSet.add('empty');
        }
      }
    });

    if (typeSet.has('mixed')) return 'mixed';
    if (typeSet.has('word') && typeSet.has('class')) return 'mixed';
    if (typeSet.has('word')) return 'word';
    if (typeSet.has('class')) return 'class';
    return 'empty';
  }

  _getProxMode() {
    const radios = this.proxModeRadios || [];
    for (const r of radios) {
      if (r.checked) {
        return r.value === 'c' ? 'NNc' : 'NNn';
      }
    }
    return 'NNn';
  }

  _getProxK() {
    if (!this.proxKInput) return 10;
    const v = parseInt(this.proxKInput.value, 10);
    if (isNaN(v)) return 10;
    return Math.max(0, Math.min(99, v));
  }

  handleBuildL1() {
    const blocks = this._getSelectedBlocks();
    if (blocks.length !== 1) {
      this.showMessage('1要素式には素材を 1 つだけ選択してください。', 'error');
      return;
    }

    const base = blocks[0];
    const root = new BlockRefNode(base.id);

    const label = `L1:${base.label || base.id}`;
    const id = this.app.repo.findOrCreateIdForLabel(label, 'EB');
    let eb = this.app.repo.get(id);

    const newRoot = root.clone ? root.clone() : root;

    if (eb && eb.kind === 'EB') {
      eb.setRoot(newRoot);
    } else {
      eb = new EquationBlock(id, label, newRoot);
    }

    eb.canUseForProximity =
      base.kind === 'WB'
        ? true
        : base.kind === 'EB'
        ? !!base.canUseForProximity
        : false;

    this.app.repo.upsert(eb);
    this.app.renderEquationsOnly();
    this.showMessage('1要素式を生成しました。', 'info');
  }

  handleBuildProx2() {
    const blocks = this._getSelectedBlocks();
    if (blocks.length !== 2) {
      this.showMessage('2近傍式には素材を 2 つ選択してください。', 'error');
      return;
    }
    if (!blocks.every((b) => this._isProxCandidateBlock(b))) {
      this.showMessage(
        '分類ブロックや分類由来の式は近傍に使用できません。',
        'error'
      );
      return;
    }

    const mode = this._getProxMode(); // "NNn" or "NNc"
    const k = this._getProxK();

    const leftRef = new BlockRefNode(blocks[0].id);
    const rightRef = new BlockRefNode(blocks[1].id);
    const proxNode = new ProximityNode(mode, k, leftRef, rightRef);

    const label = `P2:${blocks[0].label}+${blocks[1].label}`;
    const id = this.app.repo.findOrCreateIdForLabel(label, 'EB');
    let eb = this.app.repo.get(id);

    if (eb && eb.kind === 'EB') {
      eb.setRoot(proxNode);
    } else {
      eb = new EquationBlock(id, label, proxNode);
    }
    eb.canUseForProximity = true;

    this.app.repo.upsert(eb);
    this.app.renderEquationsOnly();
    this.showMessage('2近傍式を生成しました。', 'info');
  }

  handleBuildProx3() {
    const blocks = this._getSelectedBlocks();
    if (blocks.length !== 3) {
      this.showMessage('3近傍式には素材を 3 つ選択してください。', 'error');
      return;
    }
    if (!blocks.every((b) => this._isProxCandidateBlock(b))) {
      this.showMessage(
        '分類ブロックや分類由来の式は近傍に使用できません。',
        'error'
      );
      return;
    }

    const k = this._getProxK();
    const children = blocks.map((b) => new BlockRefNode(b.id));
    const proxNode = new SimultaneousProximityNode(k, children);

    const label = `P3:${blocks.map((b) => b.label).join('+')}`;
    const id = this.app.repo.findOrCreateIdForLabel(label, 'EB');
    let eb = this.app.repo.get(id);

    if (eb && eb.kind === 'EB') {
      eb.setRoot(proxNode);
    } else {
      eb = new EquationBlock(id, label, proxNode);
    }
    eb.canUseForProximity = true;

    this.app.repo.upsert(eb);
    this.app.renderEquationsOnly();
    this.showMessage('3近傍式を生成しました。', 'info');
  }

  /**
   * OR / AND 結合式を生成
   * @param {"+"|"*"} op
   */
  handleBuildLogical(op) {
    const blocks = this._getSelectedBlocks();
    if (blocks.length < 2) {
      this.showMessage('OR/AND 結合には素材を 2 つ以上選択してください。', 'error');
      return;
    }

    const logicalType = this._getLogicalTypeForBlocks(blocks);

    if (op === '+') {
      // Word+Class の和演算は禁止
      if (!(logicalType === 'word' || logicalType === 'class')) {
        this.showMessage(
          '和演算は「Word系だけ」または「分類系だけ」の場合にのみ使用できます（Wordと分類の和演算は禁止）。',
          'error'
        );
        return;
      }
    }

    const children = blocks.map((b) => new BlockRefNode(b.id));
    const logicalNode = new LogicalNode(op, children);

    const labelPrefix = op === '+' ? 'OR:' : 'AND:';
    const label =
      labelPrefix + blocks.map((b) => b.label || b.id).join('+');

    const id = this.app.repo.findOrCreateIdForLabel(label, 'EB');
    let eb = this.app.repo.get(id);

    if (eb && eb.kind === 'EB') {
      eb.setRoot(logicalNode);
    } else {
      eb = new EquationBlock(id, label, logicalNode);
    }

    // 分類が絡む式は近傍不可
    const hasClassLike = blocks.some(
      (b) =>
        b.kind === 'CB' ||
        (b.kind === 'EB' && !b.canUseForProximity)
    );
    eb.canUseForProximity = !hasClassLike;

    this.app.repo.upsert(eb);
    this.app.renderEquationsOnly();
    this.showMessage(
      op === '+'
        ? 'OR 結合式を生成しました。'
        : 'AND 結合式を生成しました。',
      'info'
    );
  }
}

// グローバル公開
window.ProximityPanel = ProximityPanel;
