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
        const hasWord = p.w && p.w.length > 0;
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
        
        // C-4: 不要な二重括弧を削除
        const F = stripOuterParens(combinedInner);
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
 * @typedef {Object} ProximityTerm
 * @property {'prox'} type
 * @property {string} left
 * @property {string[]} rightTerms
 * @property {'NNn'|'NNc'} mode
 * @property {number} k
 */

/**
 * @typedef {Object} FieldParts
 * @property {(string|ProximityTerm)[]} w   - Word因子列 (AND結合)
 * @property {string[]}    c   - 分類式のリスト（1要素なら [F]、2つなら [F1,F2] → 積として扱われる）
 */

/**
 * ExprNode ツリーを FieldParts に翻訳
 * @param {ExprNode} node
 * @param {RenderContext} ctx
 * @returns {FieldParts}
 */
function translateExprToFieldParts(node, ctx) {
  /** @type {FieldParts} */
  const empty = { w: [], c: [] };
  if (!node) return empty;

  const repo = ctx && ctx.repo ? ctx.repo : null;

  // --------------------------
  // WordTokenNode
  // --------------------------
  if (node instanceof WordTokenNode) {
    const token = node.token || '';
    if (!token) return empty;

    let expr = token;

    if (repo && typeof repo.findWordBlockByToken === 'function') {
      const wb = repo.findWordBlockByToken(token);
      if (wb) {
        if (wb.queryText && wb.queryText.trim().length > 0) {
          expr = wb.queryText.trim();
        } else if (wb.token && wb.token.trim().length > 0) {
          expr = wb.token.trim();
        }
      }
    }

    return { w: [expr], c: [] };
  }

  // --------------------------
  // BlockRefNode
  // --------------------------
  if (node instanceof BlockRefNode) {
    if (!repo) return empty;
    const blk = repo.get(node.blockId);
    if (!blk) return empty;

    if (blk.kind === 'WB') {
      const wb = blk;
      let expr =
        (wb.queryText && wb.queryText.trim()) ||
        (wb.token && wb.token.trim()) ||
        '';
      if (!expr) return empty;
      return { w: [expr], c: [] };
    }

    if (blk.kind === 'CB') {
      const cb = blk;
      let cls = '';
      if (cb.classificationExpr && cb.classificationExpr.trim().length > 0) {
        cls = cb.classificationExpr.trim();
      } else if (Array.isArray(cb.codes) && cb.codes.length > 0) {
        cls = cb.codes.join('+');
      } else if (cb.classExpr && cb.classExpr.trim().length > 0) {
        cls = cb.classExpr.trim();
      }
      if (!cls) return empty;
      return { w: [], c: [cls] };
    }

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

    // 分類が含まれている場合は近傍不可 -> 論理式フォールバック
    if (
      (left.c && left.c.length > 0) ||
      (right.c && right.c.length > 0)
    ) {
      const logical = node.renderLogical(ctx);
      if (!logical) return empty;
      return { w: [logical], c: [] };
    }

    // 左辺・右辺の w を取得 (配列の先頭要素を使う、あるいは単純結合)
    // 近傍の左右は通常「単一の語」であることを期待するが、
    // 既に複合語(A+B)になっている場合は string として扱う。
    // ProximityTerm がネストする場合の仕様は未定義だが、ここでは string 化して扱うか、
    // 左辺だけは構造を維持するか...
    // 仕様上、近傍は "Word NNn Word" なので、単純化して string を取り出す。
    
    const leftStr = left.w.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('*'); 
    // ↑仮の実装。ProximityTermがネストすることは想定外だが、もしあれば stringify などで逃げる
    // 実際には left.w[0] が string であることを期待。

    const rightStrs = right.w.map(item => {
      if (typeof item === 'string') return item;
      // 右辺に ProximityTerm が来ることは仕様上ないはず (結合順序によるが)
      return ''; 
    }).filter(s => s);

    if (!leftStr || rightStrs.length === 0) return empty;

    const proxTerm = {
      type: 'prox',
      left: leftStr,
      rightTerms: rightStrs, // 配列として保持
      mode: node.mode,
      k: node.k
    };

    return { w: [proxTerm], c: [] };
  }

  // --------------------------
  // 3 要素同時近傍
  // --------------------------
  if (node instanceof SimultaneousProximityNode) {
    // SimultaneousProximityNode は現状 ProximityTerm で表現しきれないため
    // 既存の論理式文字列生成ロジックを使うか、専用形式にする。
    // C-2 の要求は「近傍ノードの結果を... ProximityTerm として保持」。
    // 3要素近傍も {A,B,C},10n のように表現したい。
    // しかし ProximityTerm は left / rightTerms 形式。
    // ここでは単純化のため、SimultaneousProximityNode は w文字列 として返す(従来通り)。
    // あるいは ProximityTerm を拡張して 'simultaneous' type を持たせる手もあるが
    // renderFieldParts での対応が必要。今回は文字列で逃げる。
    
    const children = Array.isArray(node.children) ? node.children : [];
    const parts = children.map((ch) => translateExprToFieldParts(ch, ctx));

    if (parts.some((p) => p.c && p.c.length > 0)) {
      const logical = node.renderLogical(ctx);
      return { w: [logical], c: [] };
    }

    const inner = parts
      .flatMap((p) => p.w)
      .map(item => typeof item === 'string' ? item : '')
      .filter((s) => s && s.length > 0)
      .join(',');
    
    const proxExpr = `{${inner}},${node.k}n`;
    return { w: [proxExpr], c: [] };
  }

  // --------------------------
  // その他未知ノード
  // --------------------------
  const logical =
    typeof node.renderLogical === 'function' ? node.renderLogical(ctx) : '';
  if (!logical) return empty;
  return { w: [logical], c: [] };
}

/**
 * 積演算用結合
 *  - Word 部分は配列連結
 *  - Class 部分は配列連結
 * @param {FieldParts[]} list
 * @returns {FieldParts}
 */
function combineFieldPartsProduct(list) {
  const wList = [];
  const cList = [];

  list.forEach((p) => {
    if (p.w && p.w.length > 0) {
      wList.push(...p.w);
    }
    if (p.c && p.c.length > 0) {
      cList.push(...p.c);
    }
  });

  return { w: wList, c: cList };
}

/**
 * OR 演算用結合
 *  - Word, Class, Mixed それぞれ仕様に従ってマージする。
 *  - 結果は単一の因子(和)として表現されることが多い。
 *
 * @param {FieldParts[]} list
 * @param {ExprNode} node
 * @param {RenderContext} ctx
 * @returns {FieldParts}
 */
function combineFieldPartsOr(list, node, ctx) {
  const empty = { w: [], c: [] };

  // 1. 全体の型判定
  const typeSet = new Set();
  list.forEach((p) => {
    const hasWord = p.w && p.w.length > 0;
    const hasClass = p.c && p.c.length > 0;
    let t = 'empty';
    if (hasWord && hasClass) t = 'mixed';
    else if (hasWord) t = 'word';
    else if (hasClass) t = 'class';
    typeSet.add(t);
  });

  // C-3: Mixed Prod (Word*Class) + Class のパターン対応
  // 許可パターン: (W * C_something) + C_other
  // これを W * (C_something + C_other) にしたい。
  // つまり、すべてのブランチで「Word部分が共通(あるいは空)」であれば、
  // Word部分は共通項としてくくり出し、Class部分を足し合わせる。
  
  // 全ブランチの w, c を収集
  const allW = []; // string | ProximityTerm
  const allC = []; // string

  // Word部分の共通性チェック用
  // ここでは簡易的に「存在する全 Word 因子」をマージして保持する戦略をとる。
  // (W1*C1 + C2) -> w:[W1], c:[C1, C2] -> render -> W1 * (C1+C2)
  // (W1 + W2) -> w:[W1, W2] (積?) No. OR結合なので、Word同士は和になる。
  // combineFieldPartsOr の戻り値の w は「積因子配列」。
  // したがって、Word同士の和 "W1+W2" は「1つの因子」として w に格納されなければならない。
  
  // Class同士の和 "C1+C2" も同様だが、Classは最後に [ (Sum)/CP... ] となるので、
  // c 配列は「積」だが、ここでは「和」を作って c に 1 要素だけ入れる形になる。

  // 分類部分の統合 (Sum)
  list.forEach(p => {
    if (p.c && p.c.length > 0) {
      allC.push(...p.c);
    }
  });
  const mergedC = allC.length > 0 ? [ allC.join('+') ] : [];

  // Word部分の統合
  // ProximityTerm がある場合、それに右辺を追加する処理を行う
  const wFactors = [];
  const proxTerms = [];
  const stringTerms = [];

  list.forEach(p => {
    if (p.w && p.w.length > 0) {
      p.w.forEach(item => {
        if (typeof item === 'object' && item.type === 'prox') {
          proxTerms.push(item);
        } else if (typeof item === 'string') {
          stringTerms.push(item);
        }
      });
    }
  });

  // ケース1: ProximityTerm があり、かつ文字列項もある -> マージ
  if (proxTerms.length > 0) {
    // 最初の近傍項をベースにする (複数ある場合は仕様未定義だが、最初の1つに寄せる)
    const base = proxTerms[0];
    
    // stringTerms を右辺に追加
    // (注意: rightTerms は配列。ここに stringTerms を結合)
    // ただし、Prox は参照渡しではなくコピーすべきだが、ここでは簡易実装
    const newProx = {
      ...base,
      rightTerms: [...base.rightTerms, ...stringTerms]
    };
    
    // 他の Prox 項があった場合は無視するか、あるいは string として足す?
    // 仕様上「式(Word NNn Word) + Word」なので、Proxは1つと仮定。
    
    wFactors.push(newProx);
  } else {
    // ケース2: 文字列のみ -> 全て + で結合して 1 つの因子にする
    if (stringTerms.length > 0) {
      const combined = stringTerms.join('+');
      wFactors.push(combined);
    }
  }

  // 結果構築
  // もし Mixed の場合、wFactors と mergedC が両方入る。
  // -> render で W * C となる。
  // もし Word-only の場合、wFactors (1要素) のみ。
  // -> render で W となる。
  // もし Class-only の場合、mergedC (1要素) のみ。
  // -> render で C となる。

  return { w: wFactors, c: mergedC };
}

/**
 * FieldParts → 実際の検索式文字列に変換
 * @param {FieldParts} parts
 * @returns {string}
 */
function renderFieldParts(parts) {
  const wList = parts.w || [];
  const cList = parts.c || [];

  // Word 部分のレンダリング
  // wList は「積」の因子列。
  // 各因子について /TX 付与を行う。
  const renderedW = wList.map(item => {
    if (typeof item === 'object' && item.type === 'prox') {
      // ProximityTerm: [left, mode, (right1+right2...)/TX]
      // rightTerms の各要素に /TX をつけるかどうか?
      // 仕様: [W1,NNn,(W2)/TX + W3/TX] 
      // つまり右辺全体が 1 つの式として扱われる?
      // いや、例を見ると: [W1,NNn,(W2)/TX] (単体)
      // 追加あり: [W1,NNn,(W2)/TX+W3/TX]
      // つまり右側は「/TX付きの項の和」になっている。
      
      const left = item.left;
      const mode = item.mode === 'NNc' ? 'c' : 'n';
      const k = item.k;
      
      const rights = item.rightTerms.map(r => {
        // r は生の文字列 (例: "W2" や "A+B")
        // stripOuterParens して /TX
        const body = stripOuterParens(r);
        if (/[\+,{]/.test(body)) {
          return `(${body})/TX`;
        }
        return `${body}/TX`;
      });
      
      const rightExpr = rights.join('+');
      return `[${left},${k}${mode},${rightExpr}]`;
    } else if (typeof item === 'string') {
      // 文字列因子
      // "*" を含む場合 (WordTokenNode由来など) は分解
      if (item.indexOf('*') !== -1) {
        const factors = splitTopLevelByStar(item);
        return factors.map(f => {
          const body = stripOuterParens(f.trim());
          if (/[\+,{]/.test(body)) return `(${body})/TX`;
          return `${body}/TX`;
        }).join('*');
      } else {
        const body = stripOuterParens(item);
        if (/[\+,{]/.test(body)) return `(${body})/TX`;
        return `${body}/TX`;
      }
    }
    return '';
  }).filter(s => s).join('*');

  // Class 部分のレンダリング
  // cList は分類式のリスト。配列要素間は「積」。
  // cList要素内は既に「和」結合されている(combineFieldPartsOrで)。
  const renderedC = cList.map(F => {
    // C-4: 括弧削減 (ここでも念のため strip)
    const body = stripOuterParens(F);
    return `[(${body})/CP+(${body})/FI]`;
  }).join('*');

  if (renderedW && renderedC) return `${renderedW}*${renderedC}`;
  if (renderedW) return renderedW;
  if (renderedC) return renderedC;
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
