// js/core/block.js
// Block 抽象クラスと派生クラス群（WordBlock, ClassBlock, EquationBlock）

class Block {
  /**
   * @param {string} id
   * @param {string} label
   * @param {"WB"|"CB"|"EB"} kind
   */
  constructor(id, label, kind) {
    this.id = id;
    this.label = label || id;
    this.kind = kind; // "WB" | "CB" | "EB"
    const now = Date.now();
    this.createdAt = now;
    this.updatedAt = now;
  }

  touchUpdated() {
    this.updatedAt = Date.now();
  }

  /**
   * 共通部分の JSON 化
   * @returns {any}
   */
  toJSON() {
    return {
      id: this.id,
      label: this.label,
      kind: this.kind,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * kind に応じてサブクラスへディスパッチ
   * @param {any} obj
   * @returns {Block}
   */
  static fromJSON(obj) {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Invalid Block JSON');
    }
    switch (obj.kind) {
      case 'WB':
        return WordBlock.fromJSON(obj);
      case 'CB':
        return ClassBlock.fromJSON(obj);
      case 'EB':
        return EquationBlock.fromJSON(obj);
      default:
        throw new Error('Unknown Block kind: ' + obj.kind);
    }
  }
}

/**
 * 値を持つ Block の共通親（Word / Class）
 */
class ValueBlock extends Block {
  constructor(id, label, kind) {
    super(id, label, kind);
  }
}

/**
 * AST を持つ Block の共通親（Equation）
 */
class ExpressionBlock extends Block {
  /**
   * @param {string} id
   * @param {string} label
   * @param {"EB"} kind
   * @param {ExprNode} rootExpr
   */
  constructor(id, label, kind, rootExpr) {
    super(id, label, kind);
    this.root = rootExpr || null;
  }

  /**
   * AST ルートの更新
   * @param {ExprNode} rootExpr
   */
  setRoot(rootExpr) {
    this.root = rootExpr || null;
    this.touchUpdated();
  }
}

/**
 * 語ブロック
 */
class WordBlock extends ValueBlock {
  /**
   * @param {string} id
   * @param {string} label
   * @param {string} token
   * @param {string} queryText
   */
  constructor(id, label, token, queryText) {
    super(id, label, 'WB');
    this.token = token || '';
    this.queryText = queryText || '';
  }

  updateQueryText(newText) {
    this.queryText = newText || '';
    this.touchUpdated();
  }

  toJSON() {
    const base = super.toJSON();
    return Object.assign(base, {
      token: this.token,
      queryText: this.queryText
    });
  }

  /**
   * @param {any} obj
   * @returns {WordBlock}
   */
  static fromJSON(obj) {
    const wb = new WordBlock(
      obj.id,
      obj.label,
      obj.token || '',
      obj.queryText || ''
    );
    wb.createdAt = obj.createdAt || Date.now();
    wb.updatedAt = obj.updatedAt || wb.createdAt;
    return wb;
  }
}

/**
 * 分類ブロック
 *   - token: 分類ブロックの識別子（自動生成 or NAME）
 *   - codes: ["H04W36/00","H04W24/00"] のような分類コード列
 *   - classificationExpr: (H04W36/00+H04W24/00)
 *   - searchExpr: [(H04W36/00+H04W24/00)/CP+(H04W36/00+H04W24/00)/FI]
 */
class ClassBlock extends ValueBlock {
  /**
   * @param {string} id
   * @param {string} label
   * @param {string} token
   * @param {string[]} codes
   */
  constructor(id, label, token, codes) {
    super(id, label, 'CB');
    this.token = token || '';
    this.codes = Array.isArray(codes) ? codes : [];
    this._recalcExpressions();
  }

  /**
   * codes に応じて classificationExpr / searchExpr を再計算
   * @private
   */
  _recalcExpressions() {
    if (this.codes && this.codes.length > 0) {
      const inner = this.codes.join('+');
      this.classificationExpr = `(${inner})`;
      this.searchExpr = `[${this.classificationExpr}/CP+${this.classificationExpr}/FI]`;
    } else {
      this.classificationExpr = '';
      this.searchExpr = '';
    }
  }

  /**
   * 分類コードを更新
   * @param {string[]} codes
   */
  setCodes(codes) {
    this.codes = Array.isArray(codes) ? codes : [];
    this._recalcExpressions();
    this.touchUpdated();
  }

  toJSON() {
    const base = super.toJSON();
    return Object.assign(base, {
      token: this.token,
      codes: this.codes,
      classificationExpr: this.classificationExpr,
      searchExpr: this.searchExpr
    });
  }

  /**
   * @param {any} obj
   * @returns {ClassBlock}
   */
  static fromJSON(obj) {
    const cb = new ClassBlock(
      obj.id,
      obj.label,
      obj.token || '',
      Array.isArray(obj.codes) ? obj.codes : []
    );
    cb.createdAt = obj.createdAt || Date.now();
    cb.updatedAt = obj.updatedAt || cb.createdAt;
    // JSON に保存されている値があればそれを優先（なければ codes から再計算されたものが使われる）
    if (obj.classificationExpr) cb.classificationExpr = obj.classificationExpr;
    if (obj.searchExpr) cb.searchExpr = obj.searchExpr;
    return cb;
  }
}

/**
 * 式ブロック
 *   - root: ExprNode
 *   - canUseForProximity: 近傍素材として利用可能か
 *       * Word 由来のみ true
 *       * 分類を含む式は false
 */
class EquationBlock extends ExpressionBlock {
  /**
   * @param {string} id
   * @param {string} label
   * @param {ExprNode} rootExpr
   */
  constructor(id, label, rootExpr) {
    super(id, label, 'EB', rootExpr);
    this.canUseForProximity = false; // デフォルト false（ビルダーが必要に応じて true にする）
  }

  /**
   * 論理式表示（/TX は付けない）
   * @param {RenderContext} ctx
   * @returns {string}
   */
  renderLogical(ctx) {
    if (!this.root) return '';
    return this.root.renderLogical(ctx);
  }

  /**
   * 実際の検索式文字列を返す
   *
   * - Word のみ      → (WordExpr)/TX
   * - Class のみ     → [F/CP+F/FI] or [F1/CP+F1/FI]*[F2/CP+F2/FI]
   * - Word + Class   → (WordExpr)/TX * [F1/CP+F1/FI]*...
   *
   * - OR グループ（root が LogicalNode('+')）:
   *   * Word-only 分岐 → [E1/TX+E2/TX+...]
   *   * Class-only 分岐 → [(F1+F2+...)/CP+(F1+F2+...)/FI]
   *
   * @param {RenderContext} ctx
   * @returns {string}
   */
  renderQuery(ctx) {
    if (!this.root) return '';
    const repo = ctx && ctx.repo ? ctx.repo : null;

    const root = this.root;

    // トップレベルが OR の場合は、Word OR / Class OR を特別扱い
    if (root instanceof LogicalNode && root.op === '+') {
      const children = Array.isArray(root.children) ? root.children : [];
      if (children.length === 0) return '';

      const partList = children.map((ch) =>
        translateExprToFieldParts(ch, repo)
      );

      // 各ブランチの型判定
      const typeSet = new Set(); // "word" | "class" | "mixed" | "empty"
      partList.forEach((p) => {
        const hasWord = !!(p.w && p.w.trim().length > 0);
        const hasClass = p.c && p.c.length > 0;
        let t = 'empty';
        if (hasWord && hasClass) t = 'mixed';
        else if (hasWord) t = 'word';
        else if (hasClass) t = 'class';
        typeSet.add(t);
      });

      // mixed や word+class 混在は仕様的に「想定外」 → 単一式として処理
      if (typeSet.has('mixed') || (typeSet.has('word') && typeSet.has('class'))) {
        const whole = translateExprToFieldParts(root, repo);
        return renderFieldParts(whole);
      }

      if (typeSet.has('word')) {
        // Word-only OR: [w1/TX + w2/TX + ...]
        const terms = partList
          .map((p) => (p.w ? p.w.trim() : ''))
          .filter((s) => s.length > 0)
          .map((w) => `${w}/TX`);
        if (terms.length === 0) return '';
        return `[${terms.join('+')}]`;
      }

      if (typeSet.has('class')) {
        // Class-only OR:
        // 各ブランチの分類式を Fbranch として、
        // Fcombined = Fbranch1 + Fbranch2 + ...
        // → [(Fcombined)/CP+(Fcombined)/FI]
        const branchExprs = [];
        partList.forEach((p) => {
          if (p.c && p.c.length > 0) {
            const inner = p.c.join('+'); // そのブランチ内部の分類式を 1つにまとめる
            branchExprs.push(inner);
          }
        });
        if (branchExprs.length === 0) return '';
        const combinedInner = branchExprs.join('+');
        const classificationExpr = `(${combinedInner})`;
        return `[${classificationExpr}/CP+${classificationExpr}/FI]`;
      }

      // empty だけ
      return '';
    }

    // 通常（OR 以外）は 1 式として {w, c[]} に翻訳してから /TX・/CP・/FI を付加
    const parts = translateExprToFieldParts(root, repo);
    return renderFieldParts(parts);
  }

  toJSON() {
    const base = super.toJSON();
    return Object.assign(base, {
      root: this.root ? exprNodeToJSON(this.root) : null,
      canUseForProximity: !!this.canUseForProximity
    });
  }

  /**
   * @param {any} obj
   * @returns {EquationBlock}
   */
  static fromJSON(obj) {
    const root = obj.root ? exprNodeFromJSON(obj.root) : null;
    const eb = new EquationBlock(obj.id, obj.label, root);
    eb.createdAt = obj.createdAt || Date.now();
    eb.updatedAt = obj.updatedAt || eb.createdAt;
    eb.canUseForProximity = !!obj.canUseForProximity;
    return eb;
  }
}

/* =========================================================
 * 式 → { wordExpr, classExprList[] } 翻訳ヘルパ
 * ======================================================= */

/**
 * @typedef {Object} FieldParts
 * @property {string|null} w   - Word/TX に載せる式（/TX は含めない）
 * @property {string[]}    c   - 分類式のリスト（1要素なら [F]、2つなら [F1,F2]）
 */

/**
 * ExprNode ツリーを FieldParts に翻訳
 * @param {ExprNode} node
 * @param {BlockRepository|null} repo
 * @returns {FieldParts}
 */
function translateExprToFieldParts(node, repo) {
  /** @type {FieldParts} */
  const empty = { w: null, c: [] };
  if (!node) return empty;

  // WordTokenNode → 素の単語式（Word用途）
  if (node instanceof WordTokenNode) {
    const t = node.token || '';
    if (!t) return empty;
    return { w: t, c: [] };
  }

  // BlockRefNode → 参照先 Block に応じて分解
  if (node instanceof BlockRefNode) {
    if (!repo) return empty;
    const blk = repo.get(node.blockId);
    if (!blk) return empty;

    if (blk.kind === 'WB') {
      const w = (blk.queryText || blk.token || '').trim();
      if (!w) return empty;
      return { w, c: [] };
    }

    if (blk.kind === 'CB') {
      const cb = blk;
      const cls =
        (cb.classificationExpr && cb.classificationExpr.trim()) ||
        (cb.codes && cb.codes.length
          ? `(${cb.codes.join('+')})`
          : '');
      if (!cls) return empty;
      return { w: null, c: [cls] };
    }

    if (blk.kind === 'EB') {
      if (!blk.root) return empty;
      // 式ブロックは AST をそのまま再翻訳（/TX 等はここでは付けない）
      return translateExprToFieldParts(blk.root, repo);
    }

    return empty;
  }

  // LogicalNode（AND / OR）
  if (node instanceof LogicalNode) {
    const op = node.op;
    const children = Array.isArray(node.children) ? node.children : [];
    const list = children.map((ch) => translateExprToFieldParts(ch, repo));
    if (list.length === 0) return empty;

    if (op === '*') {
      return combineFieldPartsProduct(list);
    }
    if (op === '+') {
      return combineFieldPartsOr(list, node);
    }
    return empty;
  }

  // 2 要素近傍
  if (node instanceof ProximityNode) {
    const ch = Array.isArray(node.children) ? node.children : [];
    const left = ch[0] ? translateExprToFieldParts(ch[0], repo) : empty;
    const right = ch[1] ? translateExprToFieldParts(ch[1], repo) : empty;

    // 近傍対象に分類が混ざることは UI で禁止しているが、念のためガード
    if (!left.w || !right.w || (left.c && left.c.length) || (right.c && right.c.length)) {
      const logical = node.renderLogical(); // 近傍式全体を Word 用として扱う
      return { w: logical, c: [] };
    }

    const modeStr = node.mode === 'NNc' ? 'c' : 'n';
    const proxExpr = `${left.w},${node.k}${modeStr},${right.w}`;
    return { w: proxExpr, c: [] };
  }

  // 3 要素同時近傍
  if (node instanceof SimultaneousProximityNode) {
    const children = Array.isArray(node.children) ? node.children : [];
    const parts = children.map((ch) => translateExprToFieldParts(ch, repo));

    if (parts.some((p) => !p.w || (p.c && p.c.length))) {
      const logical = node.renderLogical();
      return { w: logical, c: [] };
    }

    const inner = parts
      .map((p) => p.w)
      .filter((s) => s && s.length > 0)
      .join(',');
    const proxExpr = `{${inner}},${node.k}n`;
    return { w: proxExpr, c: [] };
  }

  // その他未知ノード → logical 表示を Word 扱い
  const logical = node.renderLogical ? node.renderLogical() : '';
  if (!logical) return empty;
  return { w: logical, c: [] };
}

/**
 * 積演算用結合
 *  - Word 部分は "*" で結合
 *  - Class 部分は配列連結（後で [F/CP+F/FI]*... に変換）
 * @param {FieldParts[]} list
 * @returns {FieldParts}
 */
function combineFieldPartsProduct(list) {
  let wordExpr = null;
  const classExprs = [];

  list.forEach((p) => {
    if (p.w && p.w.trim().length > 0) {
      if (!wordExpr) {
        wordExpr = p.w.trim();
      } else {
        wordExpr = `(${wordExpr})*(${p.w.trim()})`;
      }
    }
    if (p.c && p.c.length > 0) {
      classExprs.push(...p.c);
    }
  });

  return { w: wordExpr, c: classExprs };
}

/**
 * OR 演算用結合
 *  - Word-only 同士 → w1+w2+...
 *  - Class-only 同士 → c = [ (F1+F2+...) ]
 *  - 混在 or mixed → 想定外 → logical 全体を Word 扱いにフォールバック
 *
 * @param {FieldParts[]} list
 * @param {ExprNode} node
 * @returns {FieldParts}
 */
function combineFieldPartsOr(list, node) {
  const empty = { w: null, c: [] };

  const typeSet = new Set(); // "word" | "class" | "mixed" | "empty"
  list.forEach((p) => {
    const hasWord = !!(p.w && p.w.trim().length > 0);
    const hasClass = p.c && p.c.length > 0;
    let t = 'empty';
    if (hasWord && hasClass) t = 'mixed';
    else if (hasWord) t = 'word';
    else if (hasClass) t = 'class';
    typeSet.add(t);
  });

  if (typeSet.has('mixed') || (typeSet.has('word') && typeSet.has('class'))) {
    // 想定外 → 全体を Word 扱い（論理表示）として返す
    const logical = node && node.renderLogical ? node.renderLogical() : '';
    if (!logical) return empty;
    return { w: logical, c: [] };
  }

  if (typeSet.has('word')) {
    const terms = list
      .map((p) => (p.w ? p.w.trim() : ''))
      .filter((s) => s.length > 0)
      .map((w) => `(${w})`);
    if (terms.length === 0) return empty;
    return { w: terms.join('+'), c: [] };
  }

  if (typeSet.has('class')) {
    const branchExprs = [];
    list.forEach((p) => {
      if (p.c && p.c.length > 0) {
        const inner = p.c.join('+');
        branchExprs.push(inner);
      }
    });
    if (branchExprs.length === 0) return empty;
    const combinedInner = branchExprs.join('+');
    const classificationExpr = `(${combinedInner})`;
    return { w: null, c: [classificationExpr] };
  }

  return empty;
}

/**
 * FieldParts → 実際の検索式文字列に変換
 * @param {FieldParts} parts
 * @returns {string}
 */
function renderFieldParts(parts) {
  const w = parts.w && parts.w.trim().length > 0 ? parts.w.trim() : null;
  const cList = Array.isArray(parts.c)
    ? parts.c.map((s) => s && s.trim()).filter((s) => s && s.length > 0)
    : [];

  const segments = [];

  if (w) {
    segments.push(`${w}/TX`);
  }

  if (cList.length > 0) {
    const classTerms = cList.map(
      (F) => `[${F}/CP+${F}/FI]`
    );
    if (segments.length > 0) {
      return segments[0] + '*' + classTerms.join('*');
    }
    return classTerms.join('*');
  }

  if (segments.length > 0) return segments[0];
  return '';
}

// グローバル公開
window.Block = Block;
window.ValueBlock = ValueBlock;
window.ExpressionBlock = ExpressionBlock;
window.WordBlock = WordBlock;
window.ClassBlock = ClassBlock;
window.EquationBlock = EquationBlock;
window.translateExprToFieldParts = translateExprToFieldParts;
