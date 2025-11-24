// js/core/expr-node.js
// 式の抽象構文木（AST）ノードクラス群と、そのシリアライズヘルパー

/**
 * 抽象基底: すべての式ノードの共通インターフェース
 */

/** export class */ class ExprNode {
  /**
   * 人間が読むための簡易論理式文字列を返す。
   * @param {import('./render-context.js').RenderContext} [ctx]
   * @returns {string}
   */
  renderLogical(ctx) {
    throw new Error('renderLogical() must be implemented by subclasses');
  }

  /**
   * 実際に検索システムに送る式文字列を返す（末尾に /TX は付けない）。
   * @param {import('./render-context.js').RenderContext} ctx
   * @returns {string}
   */
  renderQuery(ctx) {
    throw new Error('renderQuery() must be implemented by subclasses');
  }

  /**
   * このノード以下に含まれる語 token を Set に追加する。
   * （WordBlock token や分類コードなど「式を構成する単位の文字列」が対象）
   * @param {Set<string>} targetSet
   */
  collectWordTokens(targetSet) {
    throw new Error('collectWordTokens() must be implemented by subclasses');
  }

  /**
   * このノード以下に含まれる BlockRefNode の blockId を Set に追加する。
   * （IDベースでブロック参照を追跡するために使用）
   * @param {Set<string>} targetSet
   */
  collectBlockRefIds(targetSet) {
    throw new Error('collectBlockRefIds() must be implemented by subclasses');
  }

  /**
   * ノード自身と子ノードを再帰的にコピーして新インスタンスを返す。
   * @returns {ExprNode}
   */
  clone() {
    throw new Error('clone() must be implemented by subclasses');
  }
}

/**
 * 子ノードを持たないノードの共通親
 */
/** export class */ class LeafNode extends ExprNode {
  // 共通ロジックなし（型整理用）
}

/**
 * 複数の子ノードを持つノードの基底クラス
 */
/** export class */ class CompositeNode extends ExprNode {
  /**
   * @param {ExprNode[]} children
   */
  constructor(children) {
    super();
    this.children = Array.isArray(children) ? children : [];
  }

  /**
   * 全ての子ノードに対して関数 fn を適用する。
   * @param {(child: ExprNode) => void} fn
   */
  forEachChild(fn) {
    this.children.forEach(fn);
  }
}

/**
 * 語 token を表す AST ノード
 * token には「H04W16/24」のようなスラッシュを含む文字列もそのまま入る。
 */
/** export class */ class WordTokenNode extends LeafNode {
  /**
   * @param {string} token - 生の語（例: "a", "基地局", "H04W16/24"）
   */
  constructor(token) {
    super();
    this.token = token;
  }

  /**
   * そのまま token を論理式表示として返す。
   * @returns {string}
   */
  renderLogical() {
    return this.token;
  }

  /**
   * token に対応する WordBlock があればその queryText を返し、なければ token を返す。
   * 分類コードなど WordBlock 化していない token はそのまま返る。
   * @param {import('./render-context.js').RenderContext} ctx
   * @returns {string}
   */
  renderQuery(ctx) {
    if (ctx && typeof ctx.getWordForToken === 'function') {
      const wb = ctx.getWordForToken(this.token);
      if (wb && typeof wb.queryText === 'string') {
        return wb.queryText;
      }
    }
    return this.token;
  }

  /**
   * targetSet にこの token を追加する。
   * @param {Set<string>} targetSet
   */
  collectWordTokens(targetSet) {
    if (targetSet && typeof targetSet.add === 'function') {
      targetSet.add(this.token);
    }
  }

  /**
   * WordTokenNode は BlockRef を持たないので何もしない。
   * @param {Set<string>} targetSet
   */
  collectBlockRefIds(targetSet) {
    // WordTokenNode は BlockRef を持たない
  }

  /**
   * 自身の token をコピーした新しい WordTokenNode を返す。
   * @returns {WordTokenNode}
   */
  clone() {
    return new WordTokenNode(this.token);
  }
}

/**
 * 指定 ID のブロックへの参照ノード
 */
/** export class */ class BlockRefNode extends LeafNode {
  /**
   * @param {string} blockId - 参照先ブロック ID ("WB-0001" など)
   */
  constructor(blockId) {
    super();
    this.blockId = blockId;
  }

  /**
   * ブロックIDを論理式表示として返す。
   * @returns {string}
   */
  renderLogical() {
    return this.blockId;
  }

  /**
   * RenderContext 経由でブロックを展開し、検索式文字列を返す。
   * @param {import('./render-context.js').RenderContext} ctx
   * @returns {string}
   */
  renderQuery(ctx) {
    if (ctx && typeof ctx.renderBlockQuery === 'function') {
      return ctx.renderBlockQuery(this.blockId);
    }
    return this.blockId;
  }

  /**
   * デフォルトでは何もしない（必要なら拡張で中身まで追う）。
   * @param {Set<string>} targetSet
   */
  collectWordTokens(targetSet) {
    // BlockRefNode 自体は token を直接は持たない
  }

  /**
   * このノードの blockId を targetSet に追加する。
   * @param {Set<string>} targetSet
   */
  collectBlockRefIds(targetSet) {
    if (targetSet && typeof targetSet.add === 'function') {
      targetSet.add(this.blockId);
    }
  }

  /**
   * 参照先ブロック ID を保ったまま新しい BlockRefNode を返す。
   * @returns {BlockRefNode}
   */
  clone() {
    return new BlockRefNode(this.blockId);
  }
}

/**
 * OR / AND の論理演算ノード
 * 式作成 phase では「式+式」「式*式」などもここで表現される。
 */
/** export class */ class LogicalNode extends CompositeNode {
  /**
   * @param {"+"|"*"} op
   * @param {ExprNode[]} operands
   */
  constructor(op, operands) {
    super(operands || []);
    this.op = op;
  }

  /**
   * 子ノードの論理表示を op で結合した文字列を返す。
   * @param {import('./render-context.js').RenderContext} [ctx]
   * @returns {string}
   */
  renderLogical(ctx) {
    if (!this.children.length) return '';
    const parts = this.children.map((c) => c.renderLogical(ctx));
    return parts.join(` ${this.op} `);
  }

  /**
   * 子ノードの検索式を op で結合し、括弧で囲んで返す。
   * @param {import('./render-context.js').RenderContext} ctx
   * @returns {string}
   */
  renderQuery(ctx) {
    if (!this.children.length) return '';
    const parts = this.children.map((c) => c.renderQuery(ctx));
    const body = parts.join(` ${this.op} `);
    return `(${body})`;
  }

  /**
   * 全子ノードに collectWordTokens を委譲する。
   * @param {Set<string>} targetSet
   */
  collectWordTokens(targetSet) {
    this.forEachChild((child) => child.collectWordTokens(targetSet));
  }

  /**
   * 全子ノードに collectBlockRefIds を委譲する。
   * @param {Set<string>} targetSet
   */
  collectBlockRefIds(targetSet) {
    this.forEachChild((child) => child.collectBlockRefIds(targetSet));
  }

  /**
   * 各子ノードを clone し、同じ op を持つ新 LogicalNode を返す。
   * @returns {LogicalNode}
   */
  clone() {
    const clonedChildren = this.children.map((c) => c.clone());
    return new LogicalNode(this.op, clonedChildren);
  }
}

/**
 * 近傍演算子の共通プロパティ（mode, k）を持つ基底クラス
 */
/** export class */ class ProximityBaseNode extends CompositeNode {
  /**
   * @param {"NNn"|"NNc"} mode
   * @param {number} k
   * @param {ExprNode[]} children
   */
  constructor(mode, k, children) {
    super(children || []);
    this.mode = mode;
    this.k = k;
  }
}

/**
 * 2 要素の近傍式 A,10n,B / A,10c,B
 */
/** export class */ class ProximityNode extends ProximityBaseNode {
  /**
   * @param {"NNn"|"NNc"} mode
   * @param {number} k
   * @param {ExprNode} left
   * @param {ExprNode} right
   */
  constructor(mode, k, left, right) {
    super(mode, k, [left, right]);
  }

  /**
   * 左/右を論理表示し、"A,10n,B" の形で返す。
   * @param {import('./render-context.js').RenderContext} [ctx]
   * @returns {string}
   */
  renderLogical(ctx) {
    const suffix = this.mode === 'NNc' ? 'c' : 'n';
    const left = this.children[0]?.renderLogical(ctx) ?? '';
    const right = this.children[1]?.renderLogical(ctx) ?? '';
    return `${left},${this.k}${suffix},${right}`;
  }

  /**
   * 左/右を検索式として展開し、括弧付きで返す。
   * @param {import('./render-context.js').RenderContext} ctx
   * @returns {string}
   */
  renderQuery(ctx) {
    const suffix = this.mode === 'NNc' ? 'c' : 'n';
    const left = this.children[0]?.renderQuery(ctx) ?? '';
    const right = this.children[1]?.renderQuery(ctx) ?? '';
    return `(${left},${this.k}${suffix},${right})`;
  }

  /**
   * 左右の子ノードに collectWordTokens を委譲する。
   * @param {Set<string>} targetSet
   */
  collectWordTokens(targetSet) {
    this.forEachChild((child) => child.collectWordTokens(targetSet));
  }

  /**
   * 左右の子ノードに collectBlockRefIds を委譲する。
   * @param {Set<string>} targetSet
   */
  collectBlockRefIds(targetSet) {
    this.forEachChild((child) => child.collectBlockRefIds(targetSet));
  }

  /**
   * mode, k を保ちつつ左右ノードを clone した新インスタンスを返す。
   * @returns {ProximityNode}
   */
  clone() {
    const leftClone = this.children[0]?.clone();
    const rightClone = this.children[1]?.clone();
    return new ProximityNode(this.mode, this.k, leftClone, rightClone);
  }
}

/**
 * 3 要素の同時近傍 {A,B,C},10n
 * 制約: mode は常に "NNn"
 */
/** export class */ class SimultaneousProximityNode extends ProximityBaseNode {
  /**
   * @param {number} k
   * @param {ExprNode[]} operands - 長さ 3 の ExprNode 配列を想定
   */
  constructor(k, operands) {
    super('NNn', k, operands || []);
  }

  /**
   * 子ノード 3 つを {} で囲み、",k n" を付けた文字列を返す。
   * 例: {A,B,C},10n
   * @param {import('./render-context.js').RenderContext} [ctx]
   * @returns {string}
   */
  renderLogical(ctx) {
    const inner = this.children.map((c) => c.renderLogical(ctx)).join(',');
    return `{${inner}},${this.k}n`;
  }

  /**
   * 3 つの子ノードを検索式として展開し、同形式で返す。
   * 例: {A展開,B展開,C展開},10n
   * @param {import('./render-context.js').RenderContext} ctx
   * @returns {string}
   */
  renderQuery(ctx) {
    const inner = this.children.map((c) => c.renderQuery(ctx)).join(',');
    return `{${inner}},${this.k}n`;
  }

  /**
   * 全子ノードに collectWordTokens を委譲する。
   * @param {Set<string>} targetSet
   */
  collectWordTokens(targetSet) {
    this.forEachChild((child) => child.collectWordTokens(targetSet));
  }

  /**
   * 全子ノードに collectBlockRefIds を委譲する。
   * @param {Set<string>} targetSet
   */
  collectBlockRefIds(targetSet) {
    this.forEachChild((child) => child.collectBlockRefIds(targetSet));
  }

  /**
   * 3 子ノードを clone した新しい SimultaneousProximityNode を返す。
   * @returns {SimultaneousProximityNode}
   */
  clone() {
    const clonedChildren = this.children.map((c) => c.clone());
    return new SimultaneousProximityNode(this.k, clonedChildren);
  }
}

/**
 * AST ノードを JSON シリアライズするユーティリティ。
 * @param {ExprNode} node
 * @returns {any}
 */
/** export function*/ function exprNodeToJSON(node) {
  if (node instanceof WordTokenNode) {
    return { type: 'word', token: node.token };
  }
  if (node instanceof BlockRefNode) {
    return { type: 'blockRef', blockId: node.blockId };
  }
  if (node instanceof LogicalNode) {
    return {
      type: 'logical',
      op: node.op,
      children: node.children.map(exprNodeToJSON),
    };
  }
  if (node instanceof ProximityNode) {
    return {
      type: 'proximity',
      mode: node.mode,
      k: node.k,
      children: node.children.map(exprNodeToJSON),
    };
  }
  if (node instanceof SimultaneousProximityNode) {
    return {
      type: 'simulProx',
      mode: node.mode,
      k: node.k,
      children: node.children.map(exprNodeToJSON),
    };
  }
  throw new Error('Unsupported ExprNode subtype in exprNodeToJSON');
}

/**
 * JSON から AST ノードを復元するユーティリティ。
 * @param {any} obj
 * @returns {ExprNode}
 */
/** export function*/ function exprNodeFromJSON(obj) {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid AST JSON');
  }
  switch (obj.type) {
    case 'word':
      return new WordTokenNode(obj.token);
    case 'blockRef':
      return new BlockRefNode(obj.blockId);
    case 'logical':
      return new LogicalNode(
        obj.op,
        Array.isArray(obj.children)
          ? obj.children.map(exprNodeFromJSON)
          : []
      );
    case 'proximity':
      return new ProximityNode(
        obj.mode,
        obj.k,
        exprNodeFromJSON(obj.children[0]),
        exprNodeFromJSON(obj.children[1])
      );
    case 'simulProx':
      return new SimultaneousProximityNode(
        obj.k,
        Array.isArray(obj.children)
          ? obj.children.map(exprNodeFromJSON)
          : []
      );
    default:
      throw new Error(`Unknown AST node type: ${obj.type}`);
  }
}

// グローバル公開
window.ExprNode = ExprNode;
window.LeafNode = LeafNode;
window.CompositeNode = CompositeNode;
window.WordTokenNode = WordTokenNode;
window.BlockRefNode = BlockRefNode;
window.LogicalNode = LogicalNode;
window.ProximityBaseNode = ProximityBaseNode;
window.ProximityNode = ProximityNode;
window.SimultaneousProximityNode = SimultaneousProximityNode;

window.exprNodeToJSON = exprNodeToJSON;
window.exprNodeFromJSON = exprNodeFromJSON;