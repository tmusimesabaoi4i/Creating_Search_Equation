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

  /**
   * BlockRepository の Word / Class / Equation 定義が変わったときに呼ぶ。
   *
   * 主な呼び出し元:
   *  - AppController.onParseClick（新規ブロック作成時）
   *  - Word / Class / Equation の編集・削除処理
   *  - 式ビルダーの renew ボタン（Word / Class 定義変更の再反映）
   *
   * ここを「近傍パネル側の再評価入口」として扱い、
   * 選択リストとボタン状態を最新のリポジトリ内容に合わせて更新する。
   */
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
      // ID非表示化: IDはフォールバックとして非表示
      let displayLabel = blk.label;
      if (!displayLabel) {
        if (blk.kind === 'WB') {
          displayLabel = blk.token || '(無名 Word)';
        } else if (blk.kind === 'CB') {
          displayLabel = blk.token || '(無名 Class)';
        } else {
          displayLabel = '(無名式)';
        }
      }
      spanText.textContent = `${kindLabel} ${displayLabel}`;

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

    if (this.btnBuildL1) {
      this.btnBuildL1.disabled = n !== 1;
    }

    // 選択中のブロック種別を判定
    const hasEquation = blocks.some((b) => b.kind === 'EB');
    const hasWord = blocks.some((b) => b.kind === 'WB');
    const hasClass = blocks.some((b) => b.kind === 'CB');
    
    // 近傍ボタン: 式ブロックが含まれる場合は不可、それ以外はWord/Class由来のみ許可
    const canProxAll = !hasEquation && blocks.every((b) => this._isProxCandidateBlock(b));
    
    if (this.btnBuildProx2) {
      this.btnBuildProx2.disabled = !(n === 2 && canProxAll);
    }
    if (this.btnBuildProx3) {
      this.btnBuildProx3.disabled = !(n === 3 && canProxAll);
    }

    // AND（積）: 2 個以上で常に有効
    if (this.btnBuildAnd) {
      this.btnBuildAnd.disabled = n < 2;
    }

    // OR（和）: 式ブロックが含まれる場合は不可
    // Word同士、Class同士、Word+Classの組み合わせのみ許可
    if (this.btnBuildOr) {
      if (hasEquation) {
        // 式ブロックが含まれる場合は和演算不可
        this.btnBuildOr.disabled = true;
      } else {
        // Word/Classのみの場合
        const orType = this._getLogicalTypeForBlocks(blocks);
        const allowOrByType = orType === 'word' || orType === 'class';
        this.btnBuildOr.disabled = n < 2 || !allowOrByType;
      }
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

    const ctx = this.app.ctx;
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
          const parts = translateExprToFieldParts(b.root, ctx);
          // parts.w は配列なので trim() ではなく length でチェック
          const hasWord = !!(Array.isArray(parts.w) && parts.w.length > 0);
          const hasClass = Array.isArray(parts.c) && parts.c.length > 0;
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

  /**
   * 「式 + Word」/「式 + Class」の OR が仕様上許可されるかを判定する。
   *
   * - 式 + Word:
   *   不可: Word×Class, Class×Class, Class+Class, Word×Word
   *   許可: Word+Word, Word NNn Word
   * - 式 + Class:
   *   許可: Word×Class, Class+Class
   *   不可: Class×Class(積), Word×Word, Word+Word, Word NNn Word
   *
   * @param {Block} left
   * @param {Block} right
   * @param {"word"|"class"|"mixed"|"empty"} logicalTypeHint
   * @returns {boolean}
   * @private
   */
  _isOrOperationAllowedForPair(left, right, logicalTypeHint) {
    const ctx = this.app.ctx;
    const isEq = (b) => b && b.kind === 'EB';
    const isWord = (b) => b && b.kind === 'WB';
    const isClass = (b) => b && b.kind === 'CB';

    // 両方とも式ブロックの場合は無条件に許可（任意の式ブロック同士の和）
    if (isEq(left) && isEq(right)) {
      return true;
    }

    const eq =
      isEq(left) && !isEq(right)
        ? left
        : isEq(right) && !isEq(left)
        ? right
        : null;
    const other = eq === left ? right : eq === right ? left : null;

    // 式ブロックを含まない場合は、従来の logicalType 判定に任せる
    if (!eq || !other || !eq.root) {
      return logicalTypeHint === 'word' || logicalTypeHint === 'class';
    }

    const structure = this._analyzeEquationBlockStructure(eq, ctx);

    // --- 式 + Word ---
    if (isWord(other)) {
      if (
        structure === 'MIX_PROD' || // Word×Class
        structure === 'C_PROD' || // Class×Class(積)
        structure === 'C_SUM' || // Class+Class
        structure === 'W_PROD' // Word×Word
      ) {
        return false;
      }
      if (structure === 'W_SUM' || structure === 'W_PROX') {
        return true;
      }
      // 判定不能な場合は安全側で禁止
      return false;
    }

    // --- 式 + Class ---
    if (isClass(other)) {
      if (structure === 'MIX_PROD' || structure === 'C_SUM') {
        return true;
      }
      // それ以外（C_PROD, W_PROD, W_SUM, W_PROX 等）は禁止
      return false;
    }

    // それ以外（式+式 など）は従来の判定に任せる
    return logicalTypeHint === 'word' || logicalTypeHint === 'class';
  }

  /**
   * EquationBlock の構造を大まかに分類するヘルパ
   *
   * 戻り値（代表例）:
   *  - "MIX_PROD" : Word×Class（積）
   *  - "C_PROD"   : Class×Class（積）
   *  - "C_SUM"    : Class+Class（和）
   *  - "W_PROD"   : Word×Word（積）
   *  - "W_SUM"    : Word+Word（和）
   *  - "W_PROX"   : Word NNn Word / SimultaneousProximity
   *  - "UNKNOWN"  : 上記に当てはまらない or 判定不能
   *
   * @param {EquationBlock} eb
   * @param {RenderContext} ctx
   * @returns {"MIX_PROD"|"C_PROD"|"C_SUM"|"W_PROD"|"W_SUM"|"W_PROX"|"UNKNOWN"}
   * @private
   */
  _analyzeEquationBlockStructure(eb, ctx) {
    if (!eb || eb.kind !== 'EB' || !eb.root) return 'UNKNOWN';
    const root = eb.root;

    // 近傍ノードは専用扱い
    if (root instanceof ProximityNode || root instanceof SimultaneousProximityNode) {
      return 'W_PROX';
    }

    // トップレベル LogicalNode の場合は OR/AND で分岐
    if (root instanceof LogicalNode) {
      const op = root.op;
      const children = Array.isArray(root.children) ? root.children : [];

      if (op === '+') {
        // 各ブランチを FieldParts に翻訳し、Word-only / Class-only を判定
        const list = children.map((ch) => translateExprToFieldParts(ch, ctx));
        let anyWord = false;
        let anyClass = false;
        list.forEach((p) => {
          // parts.w は配列なので length でチェック
          const hasWord = !!(Array.isArray(p.w) && p.w.length > 0);
          const hasClass = Array.isArray(p.c) && p.c.length > 0;
          if (hasWord) anyWord = true;
          if (hasClass) anyClass = true;
        });

        if (anyWord && !anyClass) return 'W_SUM';
        if (!anyWord && anyClass) return 'C_SUM';
        return 'UNKNOWN';
      }

      if (op === '*') {
        const parts = translateExprToFieldParts(root, ctx);
        // parts.w は配列なので length でチェック
        const hasWord = !!(Array.isArray(parts.w) && parts.w.length > 0);
        const hasClass = Array.isArray(parts.c) && parts.c.length > 0;

        if (hasWord && hasClass) return 'MIX_PROD';
        if (!hasWord && hasClass) return 'C_PROD';
        if (hasWord && !hasClass) return 'W_PROD';
        return 'UNKNOWN';
      }
    }

    // LogicalNode 以外の場合は全体を 1 式として判定（保守的に扱う）
    const parts = translateExprToFieldParts(root, ctx);
    // parts.w は配列なので length でチェック
    const hasWord = !!(Array.isArray(parts.w) && parts.w.length > 0);
    const hasClass = Array.isArray(parts.c) && parts.c.length > 0;

    if (hasWord && hasClass) return 'MIX_PROD';
    if (!hasWord && hasClass) return 'C_SUM';
    if (hasWord && !hasClass) return 'W_PROD';

    return 'UNKNOWN';
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
      // 新規作成の場合は上限チェック
      const limitCheck = this.app.repo.checkBlockLimit('EB');
      if (!limitCheck.ok) {
        this.showMessage(limitCheck.message, 'error');
        return;
      }
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
      // 新規作成の場合は上限チェック
      const limitCheck = this.app.repo.checkBlockLimit('EB');
      if (!limitCheck.ok) {
        this.showMessage(limitCheck.message, 'error');
        return;
      }
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
      // 新規作成の場合は上限チェック
      const limitCheck = this.app.repo.checkBlockLimit('EB');
      if (!limitCheck.ok) {
        this.showMessage(limitCheck.message, 'error');
        return;
      }
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

    // 2 個以上必要
    if (blocks.length < 2) {
      this.showMessage(
        op === '+' 
          ? 'OR 結合には素材を 2 つ以上選択してください。'
          : 'AND 結合には素材を 2 つ以上選択してください。',
        'error'
      );
      return;
    }

    // 選択中のブロック種別を判定
    const hasEquation = blocks.some((b) => b.kind === 'EB');
    
    if (op === '+') {
      // 式ブロックが含まれる場合は和演算不可
      if (hasEquation) {
        this.showMessage(
          '式ブロックが含まれる場合、和演算(OR)は使用できません。積演算(AND)のみ使用可能です。',
          'error'
        );
        return;
      }
      
      // Word/Classのみの場合
      const logicalType = this._getLogicalTypeForBlocks(blocks);
      
      // Word+Class の混在和演算は禁止
      if (!(logicalType === 'word' || logicalType === 'class')) {
        this.showMessage(
          '和演算は「Word系だけ」または「分類系だけ」の場合にのみ使用できます（Wordと分類の和演算は禁止）。',
          'error'
        );
        return;
      }
    }
    
    // 積演算(*)は常に許可（式ブロック含め全組み合わせOK）

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
      // 新規作成の場合は上限チェック
      const limitCheck = this.app.repo.checkBlockLimit('EB');
      if (!limitCheck.ok) {
        this.showMessage(limitCheck.message, 'error');
        return;
      }
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
