// js/core/block.js
// Block 抽象クラスと、その派生クラス（WordBlock, ClassBlock, EquationBlock）

import {
  exprNodeToJSON,
  exprNodeFromJSON,
  LogicalNode,
} from './expr-node.js';

/**
 * 抽象基底: すべての Block の共通親
 */
export class Block {
  /**
   * @param {string} id - 一意な ID ("WB-0001" など)
   * @param {string} label - 表示ラベル
   * @param {string} kind - "WB" | "CB" | "EB"
   */
  constructor(id, label, kind) {
    this.id = id;
    this.label = label;
    this.kind = kind;
    const now = Date.now();
    this.createdAt = now;
    this.updatedAt = now;
  }

  /**
   * updatedAt を現在時刻に更新する。
   */
  touchUpdated() {
    this.updatedAt = Date.now();
  }

  /**
   * 共通フィールドを含んだ JSON オブジェクトを返す（サブクラスで拡張）。
   * @returns {any}
   */
  toJSON() {
    return {
      id: this.id,
      label: this.label,
      kind: this.kind,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * kind に応じて適切なサブクラスインスタンスを復元する。
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
        throw new Error(`Unknown Block kind: ${obj.kind}`);
    }
  }
}

/**
 * 語・分類など「値そのもの」を保持するブロックの共通親
 */
export class ValueBlock extends Block {
  /**
   * @param {string} id
   * @param {string} label
   * @param {"WB"|"CB"} kind
   */
  constructor(id, label, kind) {
    super(id, label, kind);
  }
}

/**
 * 式を表現する Block の共通クラス。AST ルートを保持する。
 */
export class ExpressionBlock extends Block {
  /**
   * @param {string} id
   * @param {string} label
   * @param {"EB"} kind
   * @param {import('./expr-node.js').ExprNode|null} rootExpr
   */
  constructor(id, label, kind, rootExpr) {
    super(id, label, kind);
    this.root = rootExpr || null;
  }

  /**
   * AST ルートを更新し、updatedAt を更新する。
   * @param {import('./expr-node.js').ExprNode} rootExpr
   */
  setRoot(rootExpr) {
    this.root = rootExpr;
    this.touchUpdated();
  }
}

/**
 * 語 token と検索式を持つ WordBlock
 */
export class WordBlock extends ValueBlock {
  /**
   * @param {string} id
   * @param {string} label
   * @param {string} token
   * @param {string} queryText
   */
  constructor(id, label, token, queryText) {
    super(id, label, 'WB');
    this.token = token;
    this.queryText = queryText;
  }

  /**
   * queryText を更新し updatedAt を更新する。
   * @param {string} newText
   */
  updateQueryText(newText) {
    this.queryText = newText;
    this.touchUpdated();
  }

  /**
   * JSON 永続化用に WordBlock の全情報を返す。
   * @returns {any}
   */
  toJSON() {
    const base = super.toJSON();
    return {
      ...base,
      token: this.token,
      queryText: this.queryText,
    };
  }

  /**
   * JSON から WordBlock を復元する。
   * @param {any} obj
   * @returns {WordBlock}
   */
  static fromJSON(obj) {
    const wb = new WordBlock(obj.id, obj.label, obj.token, obj.queryText);
    wb.createdAt = obj.createdAt ?? wb.createdAt;
    wb.updatedAt = obj.updatedAt ?? wb.createdAt;
    return wb;
  }
}

/**
 * 分類コードを扱う ClassBlock
 * codes に "H04W16/24", "H04W36/00" といった文字列をそのまま保持する。
 */
export class ClassBlock extends ValueBlock {
  /**
   * @param {string} id
   * @param {string} label
   * @param {string[]} codes
   * @param {string} fieldSuffix - "/FI", "/CP" など（現状は未使用保持）
   */
  constructor(id, label, codes, fieldSuffix) {
    super(id, label, 'CB');
    this.codes = Array.isArray(codes) ? codes : [];
    this.fieldSuffix = fieldSuffix || '';
  }

  /**
   * 分類コード集合を更新し updatedAt を更新する。
   * @param {string[]} codes
   */
  updateCodes(codes) {
    this.codes = Array.isArray(codes) ? codes : [];
    this.touchUpdated();
  }

  /**
   * フィールドサフィックス（/FI, /CP etc.）を更新する。
   * @param {string} suffix
   */
  updateFieldSuffix(suffix) {
    this.fieldSuffix = suffix || '';
    this.touchUpdated();
  }

  /**
   * JSON 永続化用に ClassBlock の全情報を返す。
   * @returns {any}
   */
  toJSON() {
    const base = super.toJSON();
    return {
      ...base,
      codes: this.codes.slice(),
      fieldSuffix: this.fieldSuffix,
    };
  }

  /**
   * JSON から ClassBlock を復元する。
   * @param {any} obj
   * @returns {ClassBlock}
   */
  static fromJSON(obj) {
    const cb = new ClassBlock(
      obj.id,
      obj.label,
      Array.isArray(obj.codes) ? obj.codes : [],
      obj.fieldSuffix || ''
    );
    cb.createdAt = obj.createdAt ?? cb.createdAt;
    cb.updatedAt = obj.updatedAt ?? cb.createdAt;
    return cb;
  }
}

/**
 * 式 bloc を表す EquationBlock
 * - 単独式: body/TX
 * - 和演算トップレベル式: [body1/TX+body2/TX+...]
 */
export class EquationBlock extends ExpressionBlock {
  /**
   * @param {string} id
   * @param {string} label
   * @param {import('./expr-node.js').ExprNode|null} rootExpr
   */
  constructor(id, label, rootExpr) {
    super(id, label, 'EB', rootExpr);
  }

  /**
   * AST ルートを人間向け論理式として表示する。
   * @param {import('./render-context.js').RenderContext} [ctx]
   * @returns {string}
   */
  renderLogical(ctx) {
    if (!this.root) return '';
    return this.root.renderLogical(ctx);
  }

  /**
   * AST を検索式に展開し、/TX および [] を付与した全文を返す。
   *
   * ルール:
   * - ルートが LogicalNode('+') の場合:
   *     [expr1/TX + expr2/TX + ...]
   *   （子の AST をフラットに + チェーンとして展開）
   *
   * - それ以外:
   *     body/TX
   *
   * ここで body / exprN は root やその子の renderQuery(ctx) の結果。
   * WordBlock.queryText は (A+B+...) の形（/TX なし）で格納されている前提。
   *
   * @param {import('./render-context.js').RenderContext} ctx
   * @returns {string}
   */
  renderQuery(ctx) {
    if (!this.root) return '';

    const root = this.root;

    // トップレベルが OR 連鎖の場合: [expr1/TX+expr2/TX+...]
    if (root instanceof LogicalNode && root.op === '+') {
      const leaves = [];
      flattenLogical(root, '+', leaves);

      const parts = leaves
        .map((child) => {
          const subBody = child.renderQuery(ctx);
          if (!subBody) return '';
          return subBody.endsWith('/TX') ? subBody : `${subBody}/TX`;
        })
        .filter((s) => !!s);

      if (!parts.length) return '';
      return `[${parts.join('+')}]`;
    }

    // それ以外は通常の 1 式として body/TX
    const body = root.renderQuery(ctx);
    if (!body) return '';
    return body.endsWith('/TX') ? body : `${body}/TX`;
  }

  /**
   * JSON 永続化用に EquationBlock の全情報を返す（AST を含む）。
   * @returns {any}
   */
  toJSON() {
    const base = super.toJSON();
    return {
      ...base,
      root: this.root ? exprNodeToJSON(this.root) : null,
    };
  }

  /**
   * JSON から EquationBlock を復元する。
   * @param {any} obj
   * @returns {EquationBlock}
   */
  static fromJSON(obj) {
    const rootExpr = obj.root ? exprNodeFromJSON(obj.root) : null;
    const eb = new EquationBlock(obj.id, obj.label, rootExpr);
    eb.createdAt = obj.createdAt ?? eb.createdAt;
    eb.updatedAt = obj.updatedAt ?? eb.createdAt;
    return eb;
  }
}

/**
 * LogicalNode の木を、指定 op に対してフラットな配列にするヘルパ。
 * 例: (A+B)+(C+D) → [A,B,C,D]
 * @param {import('./expr-node.js').ExprNode} node
 * @param {"+"|"*"} op
 * @param {import('./expr-node.js').ExprNode[]} out
 */
function flattenLogical(node, op, out) {
  if (node instanceof LogicalNode && node.op === op) {
    node.children.forEach((child) => flattenLogical(child, op, out));
  } else {
    out.push(node);
  }
}