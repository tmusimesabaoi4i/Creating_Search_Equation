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

// =========================
// EquationBlock
// =========================

class EquationBlock extends ExpressionBlock {
  /**
   * @param {string} id
   * @param {string} label
   * @param {ExprNode} rootExpr
   */
  constructor(id, label, rootExpr) {
    super(id, label, 'EB', rootExpr);
    // 2近傍・3近傍に使えるかどうか（UI側で制御）
    this.canUseForProximity = false;
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
   * 実際の検索式文字列を返す。
   *
   * - Word のみ      → (WordExpr)/TX or WordExpr/TX
   * - Class のみ     → [(F)/CP+(F)/FI] or それを * で連結
   * - Word + Class   → Word部/TX * [(F)/CP+(F)/FI]*...
   *
   * - トップレベル OR（root が LogicalNode('+')）:
   *   * Word-only      → [E1/TX+E2/TX+...]
   *   * Class-only     → [(F_sum)/CP+(F_sum)/FI]
   *
   * @param {RenderContext} ctx
   * @returns {string}
   */
  renderQuery(ctx) {
    if (!this.root) return '';
    ctx = ctx || new RenderContext(window.blockRepository || null);
    const root = this.root;

    // --------------------------
    // トップレベルが OR の場合は特別扱い
    // --------------------------
    if (root instanceof LogicalNode && root.op === '+') {
      const children = Array.isArray(root.children) ? root.children : [];
      if (children.length === 0) return '';

      /** @type {FieldParts[]} */
      const partList = children.map((ch) => translateExprToFieldParts(ch, ctx));

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

      // Word+Class 混在 OR や mixed が含まれる場合は「通常式」として処理
      if (typeSet.has('mixed') || (typeSet.has('word') && typeSet.has('class'))) {
        const whole = translateExprToFieldParts(root, ctx);
        return renderFieldParts(whole);
      }

      // ---- Word-only OR: [branch1/TX + branch2/TX + ...]
      if (typeSet.has('word')) {
        const terms = partList
          .map((p) => renderFieldParts({ w: p.w, c: [] })) // 各 Word 式を /TX 付きでレンダリング
          .filter((s) => s && s.trim().length > 0);

        if (terms.length === 0) return '';
        return `[${terms.join('+')}]`;
      }

      // ---- Class-only OR:
      // 各ブランチの分類式を Fbranch とし、
      //  F_sum = Fbranch1 + Fbranch2 + ...
      // → [(F_sum)/CP+(F_sum)/FI]
      if (typeSet.has('class')) {
        const branchExprs = [];
        partList.forEach((p) => {
          if (p.c && p.c.length > 0) {
            const inner = p.c.join('+'); // ブランチ内部の分類式を + でまとめる
            if (inner && inner.trim().length > 0) {
              branchExprs.push(inner.trim());
            }
          }
        });
        if (branchExprs.length === 0) return '';
        const combinedInner = branchExprs.join('+');
        const F = combinedInner; // ここでは ( ) で二重にくくらず、生の式を渡す
        return `[(${F})/CP+(${F})/FI]`;
      }

      // empty only
      return '';
    }

    // --------------------------
    // 通常（OR 以外）は 1 式として {w, c[]} に翻訳し、最後に /TX・/CP・/FI を付加
    // --------------------------
    const parts = translateExprToFieldParts(root, ctx);
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
 * 式 → { w, c[] } 翻訳ヘルパ
 * ======================================================= */

/**
 * @typedef {Object} FieldParts
 * @property {string|null} w   - Word/TX に載せる式（/TX は含めない）
 * @property {string[]}    c   - 分類式のリスト（1要素なら [F]、2つなら [F1,F2]）
 */

/**
 * ExprNode ツリーを FieldParts に翻訳
 * @param {ExprNode} node
 * @param {RenderContext} ctx
 * @returns {FieldParts}
 */
function translateExprToFieldParts(node, ctx) {
  /** @type {FieldParts} */
  const empty = { w: null, c: [] };
  if (!node) return empty;

  const repo = ctx && ctx.repo ? ctx.repo : null;

  // --------------------------
  // WordTokenNode → WordBlock.queryText を優先して Word 式にする
  // --------------------------
  if (node instanceof WordTokenNode) {
    const token = node.token || '';
    if (!token) return empty;

    let expr = token;

    if (repo && typeof repo.findWordBlockByToken === 'function') {
      const wb = repo.findWordBlockByToken(token);
      if (wb) {
        if (wb.queryText && wb.queryText.trim().length > 0) {
          expr = wb.queryText.trim(); // 例: "A+B+C"
        } else if (wb.token && wb.token.trim().length > 0) {
          expr = wb.token.trim(); // フォールバック
        }
      }
    }

    return { w: expr, c: [] };
  }

  // --------------------------
  // BlockRefNode → 参照先 Block に応じて分解
  // --------------------------
  if (node instanceof BlockRefNode) {
    if (!repo) return empty;
    const blk = repo.get(node.blockId);
    if (!blk) return empty;

    // WordBlock 参照
    if (blk.kind === 'WB') {
      const wb = blk;
      let expr =
        (wb.queryText && wb.queryText.trim()) ||
        (wb.token && wb.token.trim()) ||
        '';
      if (!expr) return empty;
      return { w: expr, c: [] };
    }

    // ClassBlock 参照
    if (blk.kind === 'CB') {
      const cb = blk;
      let cls = '';

      // 分類本体（(H04W16/24+H04W36/00) のような形）を優先
      if (cb.classificationExpr && cb.classificationExpr.trim().length > 0) {
        cls = cb.classificationExpr.trim();
      } else if (Array.isArray(cb.codes) && cb.codes.length > 0) {
        cls = cb.codes.join('+');
      } else if (cb.classExpr && cb.classExpr.trim().length > 0) {
        cls = cb.classExpr.trim();
      }

      if (!cls) return empty;
      return { w: null, c: [cls] };
    }

    // EquationBlock を参照している場合 → AST をそのまま再翻訳
    if (blk.kind === 'EB') {
      const eb = blk;
      if (!eb.root) return empty;
      return translateExprToFieldParts(eb.root, ctx);
    }

    return empty;
  }

  // --------------------------
  // LogicalNode（AND / OR）
  // --------------------------
  if (node instanceof LogicalNode) {
    const op = node.op;
    const children = Array.isArray(node.children) ? node.children : [];
    const list = children.map((ch) => translateExprToFieldParts(ch, ctx));
    if (list.length === 0) return empty;

    if (op === '*') {
      return combineFieldPartsProduct(list);
    }
    if (op === '+') {
      return combineFieldPartsOr(list, node, ctx);
    }
    return empty;
  }

  // --------------------------
  // 2 要素近傍
  // --------------------------
  if (node instanceof ProximityNode) {
    const ch = Array.isArray(node.children) ? node.children : [];
    const left = ch[0] ? translateExprToFieldParts(ch[0], ctx) : empty;
    const right = ch[1] ? translateExprToFieldParts(ch[1], ctx) : empty;

    // 近傍対象に分類が混ざることは UI 側で禁止しているが、念のためガード
    if (!left.w || !right.w || (left.c && left.c.length) || (right.c && right.c.length)) {
      const logical = node.renderLogical(ctx);
      if (!logical) return empty;
      return { w: logical, c: [] };
    }

    const modeStr = node.mode === 'NNc' ? 'c' : 'n';
    const proxExpr = `${left.w},${node.k}${modeStr},${right.w}`;
    return { w: proxExpr, c: [] };
  }

  // --------------------------
  // 3 要素同時近傍
  // --------------------------
  if (node instanceof SimultaneousProximityNode) {
    const children = Array.isArray(node.children) ? node.children : [];
    const parts = children.map((ch) => translateExprToFieldParts(ch, ctx));

    if (parts.some((p) => !p.w || (p.c && p.c.length))) {
      const logical = node.renderLogical(ctx);
      if (!logical) return empty;
      return { w: logical, c: [] };
    }

    const inner = parts
      .map((p) => p.w)
      .filter((s) => s && s.length > 0)
      .join(',');
    const proxExpr = `{${inner}},${node.k}n`;
    return { w: proxExpr, c: [] };
  }

  // --------------------------
  // その他未知ノード → logical 表示を Word 扱い
  // --------------------------
  const logical =
    typeof node.renderLogical === 'function' ? node.renderLogical(ctx) : '';
  if (!logical) return empty;
  return { w: logical, c: [] };
}

/**
 * 積演算用結合
 *  - Word 部分は "*" で結合（後で /TX を各因子に付与）
 *  - Class 部分は配列連結（後で [F/CP+F/FI]*... に変換）
 * @param {FieldParts[]} list
 * @returns {FieldParts}
 */
function combineFieldPartsProduct(list) {
  let wordExpr = null;
  const classExprs = [];

  list.forEach((p) => {
    if (p.w && p.w.trim().length > 0) {
      const w = p.w.trim();
      if (!wordExpr) {
        wordExpr = w;
      } else {
        // 一旦 "(prev)*(w)" の形にしておき、後で splitTopLevelByStar() で分解
        wordExpr = `(${wordExpr})*(${w})`;
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
 *  - Word-only 同士 → w1 + w2 + ...
 *  - Class-only 同士 → c = [ (F1+F2+...) ]
 *  - 混在 or mixed → 想定外 → logical 全体を Word 扱いにフォールバック
 *
 * @param {FieldParts[]} list
 * @param {ExprNode} node
 * @param {RenderContext} ctx
 * @returns {FieldParts}
 */
function combineFieldPartsOr(list, node, ctx) {
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

  // Word+Class 混在 OR / mixed は「論理式を Word 扱い」にフォールバック
  if (typeSet.has('mixed') || (typeSet.has('word') && typeSet.has('class'))) {
    const logical =
      node && typeof node.renderLogical === 'function'
        ? node.renderLogical(ctx)
        : '';
    if (!logical) return empty;
    return { w: logical, c: [] };
  }

  // Word-only OR: w1+w2+...
  if (typeSet.has('word')) {
    const terms = list
      .map((p) => (p.w ? p.w.trim() : ''))
      .filter((s) => s.length > 0)
      .map((w) => `(${w})`);
    if (terms.length === 0) return empty;
    return { w: terms.join('+'), c: [] };
  }

  // Class-only OR: [(F1+F2+...)/CP+(F1+F2+...)/FI]
  if (typeSet.has('class')) {
    const branchExprs = [];
    list.forEach((p) => {
      if (p.c && p.c.length > 0) {
        const inner = p.c.join('+');
        if (inner && inner.trim().length > 0) {
          branchExprs.push(inner.trim());
        }
      }
    });
    if (branchExprs.length === 0) return empty;
    const combinedInner = branchExprs.join('+'); // F1+F2+...
    return { w: null, c: [combinedInner] };
  }

  return empty;
}

/**
 * FieldParts → 実際の検索式文字列に変換
 *  - Word 部分は /TX を付与（* があれば各因子ごとに /TX）
 *  - Class 部分は [ (F)/CP+(F)/FI ] を * で連結
 * @param {FieldParts} parts
 * @returns {string}
 */
function renderFieldParts(parts) {
  const rawW = parts.w && parts.w.trim().length > 0 ? parts.w.trim() : null;
  const cList = Array.isArray(parts.c)
    ? parts.c.map((s) => s && s.trim()).filter((s) => s && s.length > 0)
    : [];

  let wordSegment = null;

  if (rawW) {
    // "*" が含まれていれば、トップレベルで分解して各因子に /TX を付与
    if (rawW.indexOf('*') !== -1) {
      const factors = splitTopLevelByStar(rawW);
      const decorated = factors.map((f) => {
        const body = stripOuterParens(f.trim());
        if (/[\+,{]/.test(body)) {
          // OR や 近傍など「複合」の場合は括弧付きで /TX
          return `(${body})/TX`;
        }
        return `${body}/TX`;
      });
      wordSegment = decorated.join('*');
    } else {
      // 単一因子の場合
      const body = stripOuterParens(rawW);
      if (/[\+,{]/.test(body)) {
        // A+B や {A,B} などの場合は (A+B)/TX
        wordSegment = `(${body})/TX`;
      } else {
        // 単語 1 個の場合 → A/TX
        wordSegment = `${body}/TX`;
      }
    }
  }

  let classSegment = null;

  if (cList.length > 0) {
    const classTerms = cList.map((F) => `[(${F})/CP+(${F})/FI]`);
    classSegment = classTerms.join('*');
  }

  if (wordSegment && classSegment) return `${wordSegment}*${classSegment}`;
  if (wordSegment) return wordSegment;
  if (classSegment) return classSegment;
  return '';
}

/* =========================================================
 * 文字列処理ヘルパ
 * ======================================================= */

/**
 * トップレベルの "*" で式を分割する。
 * 括弧 "( )" と "{ }" の内側の "*" は無視する。
 * @param {string} expr
 * @returns {string[]}
 */
function splitTopLevelByStar(expr) {
  const result = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (ch === '*' && depth === 0) {
      const part = expr.slice(start, i).trim();
      if (part) result.push(part);
      start = i + 1;
    }
  }

  const last = expr.slice(start).trim();
  if (last) result.push(last);

  return result;
}

/**
 * 文字列全体を包んでいる最外周の括弧 "( )" または "{ }" を可能な限り剥がす。
 * @param {string} s
 * @returns {string}
 */
function stripOuterParens(s) {
  let changed = true;
  while (changed) {
    changed = false;
    s = s.trim();
    if (s.length < 2) return s;

    const first = s[0];
    const last = s[s.length - 1];
    if (
      !(
        (first === '(' && last === ')') ||
        (first === '{' && last === '}')
      )
    ) {
      return s;
    }

    // 括弧の対応をチェック
    let depth = 0;
    let ok = true;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === first) {
        depth++;
      } else if (ch === last) {
        depth--;
        if (depth === 0 && i !== s.length - 1) {
          ok = false;
          break;
        }
      }
    }

    if (ok && depth === 0) {
      // 最外周の括弧で全体が閉じている → 1段剥がす
      s = s.slice(1, -1).trim();
      changed = true;
    }
  }
  return s;
}

// グローバル公開
window.Block = Block;
window.ValueBlock = ValueBlock;
window.ExpressionBlock = ExpressionBlock;
window.WordBlock = WordBlock;
window.ClassBlock = ClassBlock;
window.EquationBlock = EquationBlock;
window.translateExprToFieldParts = translateExprToFieldParts;
