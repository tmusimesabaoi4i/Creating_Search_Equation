// js/ui/proximity-panel.js
// 式ビルダー（右側パネル）のロジック

class ProximityPanel {
  /**
   * @param {AppController} appController
   */
  constructor(appController) {
    this.app = appController;
    this.repo = appController.repo;

    this.selectionIds = []; // 素材として選択された block.id の配列（最大3）

    this.elements = {
      panel: null,
      list: null,
      message: null,
      modeInputs: [],
      kInput: null,
      btnL1: null,
      btnProx2: null,
      btnProx3: null,
      btnOr: null,
      btnAnd: null
    };
  }

  init() {
    this.elements.panel = qs('#builder-panel');
    if (!this.elements.panel) return;

    this.elements.list = qs('#builder-selection-list', this.elements.panel);
    this.elements.message = qs('#builder-message', this.elements.panel);
    this.elements.modeInputs = Array.from(
      this.elements.panel.querySelectorAll('input[name="prox-mode"]')
    );
    this.elements.kInput = qs('#prox-k-input', this.elements.panel);

    this.elements.btnL1 = qs('#btn-build-l1', this.elements.panel);
    this.elements.btnProx2 = qs('#btn-build-prox2', this.elements.panel);
    this.elements.btnProx3 = qs('#btn-build-prox3', this.elements.panel);
    this.elements.btnOr = qs('#btn-build-or', this.elements.panel);
    this.elements.btnAnd = qs('#btn-build-and', this.elements.panel);

    if (this.elements.btnL1) {
      this.elements.btnL1.addEventListener('click', () => this.buildL1());
    }
    if (this.elements.btnProx2) {
      this.elements.btnProx2.addEventListener('click', () => this.buildProx2());
    }
    if (this.elements.btnProx3) {
      this.elements.btnProx3.addEventListener('click', () => this.buildProx3());
    }
    if (this.elements.btnOr) {
      this.elements.btnOr.addEventListener('click', () => this.buildOr());
    }
    if (this.elements.btnAnd) {
      this.elements.btnAnd.addEventListener('click', () => this.buildAnd());
    }

    // 選択リスト内の ↑ / ↓ / × ボタン
    if (this.elements.list) {
      this.elements.list.addEventListener('click', (e) =>
        this.onSelectionListClick(e)
      );
    }

    this.renderSelectionList();
  }

  /**
   * AppController から呼ばれる: 選択されている block.id 配列を受け取り反映
   * @param {string[]} ids
   */
  setSelectionIds(ids) {
    this.selectionIds = Array.from(ids);
    this.renderSelectionList();
  }

  /**
   * リポジトリ更新時に選択をクリーニング
   */
  onRepositoryUpdated() {
    this.selectionIds = this.selectionIds.filter((id) => !!this.repo.get(id));
    this.renderSelectionList();
  }

  /**
   * 選択中ブロック配列を取得
   * @returns {Block[]}
   */
  getSelectedBlocks() {
    return this.selectionIds
      .map((id) => this.repo.get(id))
      .filter((b) => !!b);
  }

  /**
   * UI上の選択リスト描画
   */
  renderSelectionList() {
    if (!this.elements.list) return;
    clearChildren(this.elements.list);

    const blocks = this.getSelectedBlocks();
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      const li = create('li', 'builder-selection-item');
      li.dataset.id = block.id;

      const label = create('span', 'builder-selection-item__label');
      label.textContent = `${block.kind}: ${block.label || block.id}`;

      const controls = create('div', 'builder-selection-item__controls');

      const btnUp = create('button', 'btn-tiny js-builder-move-up');
      btnUp.type = 'button';
      btnUp.textContent = '↑';

      const btnDown = create('button', 'btn-tiny js-builder-move-down');
      btnDown.type = 'button';
      btnDown.textContent = '↓';

      const btnRemove = create('button', 'btn-tiny js-builder-remove');
      btnRemove.type = 'button';
      btnRemove.textContent = '×';

      controls.appendChild(btnUp);
      controls.appendChild(btnDown);
      controls.appendChild(btnRemove);

      li.appendChild(label);
      li.appendChild(controls);

      this.elements.list.appendChild(li);
    }
  }

  /**
   * 選択リスト内（↑/↓/×）クリック処理
   */
  onSelectionListClick(event) {
    const target = event.target;
    const li = target.closest('.builder-selection-item');
    if (!li) return;
    const id = li.dataset.id;
    const idx = this.selectionIds.indexOf(id);
    if (idx === -1) return;

    if (target.classList.contains('js-builder-remove')) {
      this.selectionIds.splice(idx, 1);
    } else if (target.classList.contains('js-builder-move-up')) {
      if (idx > 0) {
        const tmp = this.selectionIds[idx - 1];
        this.selectionIds[idx - 1] = this.selectionIds[idx];
        this.selectionIds[idx] = tmp;
      }
    } else if (target.classList.contains('js-builder-move-down')) {
      if (idx < this.selectionIds.length - 1) {
        const tmp = this.selectionIds[idx + 1];
        this.selectionIds[idx + 1] = this.selectionIds[idx];
        this.selectionIds[idx] = tmp;
      }
    }

    // AppController 側にも更新を反映（ハイライト維持のため）
    this.app.setBuilderSelectionIds(this.selectionIds);
  }

  /**
   * 近傍モード (n or c)
   */
  getProxMode() {
    const checked = this.elements.modeInputs.find((i) => i.checked);
    return checked && checked.value === 'c' ? 'NNc' : 'NNn';
  }

  /**
   * 近傍数 k
   */
  getK() {
    const v = parseInt(this.elements.kInput.value, 10);
    if (Number.isNaN(v) || v < 0) return 0;
    if (v > 99) return 99;
    return v;
  }

  /**
   * Block -> ExprNode への変換
   * @param {Block} block
   * @returns {ExprNode}
   */
  exprFromBlock(block) {
    if (block.kind === 'EB') {
      // EquationBlock: AST を clone
      return block.root.clone();
    }
    if (block.kind === 'WB') {
      // WordBlock: token から WordTokenNode
      return new WordTokenNode(block.token);
    }
    // ClassBlock などは現状ビルダー対象外
    throw new Error('この種別のブロックは式ビルダーでは使用できません: ' + block.kind);
  }

  /**
   * EquationBlock 生成共通処理
   * @param {ExprNode} expr
   * @param {string} labelHint
   */
  createEquationFromExpr(expr, labelHint) {
    const base = labelHint || '式';
    const index = this.repo.getAllEquations().length + 1;
    const label = `${base} #${index}`;
    const id = this.repo.findOrCreateIdForLabel
      ? this.repo.findOrCreateIdForLabel(label, 'EB')
      : `EB-${Date.now()}`;

    const eb = new EquationBlock(id, label, expr);
    this.repo.add(eb);

    this.showMessage(`式を生成しました: ${eb.label}`, 'info');
    this.app.renderEquationsOnly();
  }

  /**
   * 1要素式生成（Word または Equation 1つ → /TX）
   */
  buildL1() {
    const blocks = this.getSelectedBlocks();
    if (blocks.length !== 1) {
      this.showMessage('1要素式を作るには、素材を1つだけ選択してください。', 'error');
      return;
    }
    const block = blocks[0];
    if (block.kind === 'CB') {
      this.showMessage('分類ブロックからの 1要素式は、別UIで扱う想定です。', 'error');
      return;
    }
    try {
      const expr = this.exprFromBlock(block);
      this.createEquationFromExpr(expr, '1要素式');
    } catch (e) {
      this.showMessage(e.message, 'error');
    }
  }

  /**
   * 2近傍式生成
   */
  buildProx2() {
    const blocks = this.getSelectedBlocks();
    if (blocks.length !== 2) {
      this.showMessage('2近傍式を作るには、素材を2つ選択してください。', 'error');
      return;
    }
    if (blocks.some((b) => b.kind === 'CB')) {
      this.showMessage('分類ブロックは 2近傍には使用できません。', 'error');
      return;
    }
    const mode = this.getProxMode(); // 'NNn' or 'NNc'
    const k = this.getK();

    try {
      const leftExpr = this.exprFromBlock(blocks[0]);
      const rightExpr = this.exprFromBlock(blocks[1]);
      const expr = new ProximityNode(mode, k, leftExpr, rightExpr);
      this.createEquationFromExpr(expr, '2近傍式');
    } catch (e) {
      this.showMessage(e.message, 'error');
    }
  }

  /**
   * 3近傍式生成（単語のみ可）
   */
  buildProx3() {
    const blocks = this.getSelectedBlocks();
    if (blocks.length !== 3) {
      this.showMessage('3近傍式を作るには、素材を3つ選択してください。', 'error');
      return;
    }
    if (blocks.some((b) => b.kind !== 'WB')) {
      this.showMessage('3近傍は単語 (WordBlock) のみ使用できます。', 'error');
      return;
    }
    const k = this.getK(); // 3近傍は NNn 固定

    try {
      const exprs = blocks.map((b) => this.exprFromBlock(b));
      const expr = new SimultaneousProximityNode(k, exprs);
      this.createEquationFromExpr(expr, '3近傍式');
    } catch (e) {
      this.showMessage(e.message, 'error');
    }
  }

  /**
   * OR 結合 (E1 + E2 + ...)
   */
  buildOr() {
    const blocks = this.getSelectedBlocks();
    if (blocks.length < 2) {
      this.showMessage('OR 結合は2個以上の素材が必要です。', 'error');
      return;
    }
    try {
      const exprs = blocks.map((b) => this.exprFromBlock(b));
      const expr = new LogicalNode('+', exprs);
      this.createEquationFromExpr(expr, 'OR結合');
    } catch (e) {
      this.showMessage(e.message, 'error');
    }
  }

  /**
   * AND 結合 (E1 * E2 * ...)
   */
  buildAnd() {
    const blocks = this.getSelectedBlocks();
    if (blocks.length < 2) {
      this.showMessage('AND 結合は2個以上の素材が必要です。', 'error');
      return;
    }
    try {
      const exprs = blocks.map((b) => this.exprFromBlock(b));
      const expr = new LogicalNode('*', exprs);
      this.createEquationFromExpr(expr, 'AND結合');
    } catch (e) {
      this.showMessage(e.message, 'error');
    }
  }

  /**
   * ビルダーパネル内メッセージ表示
   * @param {string} text
   * @param {"info"|"error"} kind
   */
  showMessage(text, kind) {
    if (!this.elements.message) return;
    this.elements.message.textContent = text;
    this.elements.message.classList.remove('is-error', 'is-info');
    if (kind === 'error') {
      this.elements.message.classList.add('is-error');
    } else if (kind === 'info') {
      this.elements.message.classList.add('is-info');
    }
  }
}

// グローバル公開
window.ProximityPanel = ProximityPanel;
