// js/services/expression-service.js
// 上部 textarea のテキスト → ブロック群（Word / Class / Equation）
// ・行ごとのパース
//   - 単語定義行: NAME = A+B+...          → WordBlock
//   - 分類定義行: CLS = H04W16/24+... /CP → ClassBlock
//   - 式行      : NB*UE, NB,10n,UE など   → EquationBlock
// ・Equation → Word 再分割

import { WordBlock, ClassBlock, EquationBlock } from '../core/block.js';
import { Lexer } from '../parser/lexer.js';
import { Parser } from '../parser/parser.js';
import { WordTokenNode, LogicalNode } from '../core/expr-node.js';

export class ExpressionService {
  /**
   * @param {import('../core/block-repository.js').BlockRepository} blockRepository
   */
  constructor(blockRepository) {
    // BlockRepository への参照
    this.repo = blockRepository;
  }

  /**
   * 各行を式として解析し、WordBlock / ClassBlock / EquationBlock を生成・更新する。
   *
   * 行の扱いルール:
   * 1) 分類定義行:
   *    CLS1 = H04W16/24+H04W36/00 /CP
   *      → ClassBlock.codes = ["H04W16/24", "H04W36/00"]
   *      → "*", 近傍を含む場合はエラー
   *
   * 2) 単語定義行:
   *    NB = 基地局+NB+eNB
   *      → WordBlock.token = "NB"
   *      → WordBlock.queryText = "(基地局 + NB + eNB)"
   *
   * 3) 式行:
   *    NB*UE, NB,10n,UE, {NB,UE,端末},30n など
   *      → EquationBlock として保存
   *      → expr.collectWordTokens() から WordBlock を自動生成（未登録 token）
   *
   * @param {string} text - テキストエリアの全内容
   * @returns {{ errors: string[], createdEquationIds: string[] }}
   */
  parseInputLines(text) {
    const errors = [];
    const createdEquationIds = [];

    const lines = (text || '').split(/\r?\n/);

    lines.forEach((rawLine, idx) => {
      const lineNo = idx + 1;
      const trimmed = rawLine.trim();
      if (!trimmed) return;              // 空行は無視
      if (trimmed.startsWith('#')) return; // コメント行は無視

      try {
        const lexer = new Lexer(trimmed);
        const parser = new Parser(lexer);
        const result = parser.parseLine();
        const name = result.name;
        const expr = result.expr;
        const field = result.field;

        // --- 分類定義行: /CP または /FI が末尾についている ---
        if (field === '/CP' || field === '/FI') {
          this._createOrUpdateClassBlockFromLine(name, lineNo, expr, field);
          // 分類定義行からは EquationBlock は作らない
          return;
        }

        // /TX が末尾に付いている式は「ユーザが貼り付けた完成式」とみなし、
        // /TX は無視して EquationBlock として取り込む（WordBlock 定義にはしない）。
        const effectiveField = field === '/TX' ? undefined : field;
        if (effectiveField) {
          // 現状 /CP, /FI, /TX 以外のフィールドは想定しないのでエラーにする。
          throw new Error('未対応のフィールド指定: ' + effectiveField);
        }

        // --- 単語定義行: name = expr, かつ field なし ---
        if (name && !effectiveField) {
          this._createOrUpdateWordBlockFromLine(name, expr);
          // 単語定義行も EquationBlock は作らない
          return;
        }

        // --- それ以外は式行: EquationBlock として扱う ---
        // 例: NB*UE, NB,10n,UE, {NB,UE,端末},30n など
        // → 式で使われる token から、未定義の WordBlock を自動生成する。
        const tokens = new Set();
        expr.collectWordTokens(tokens);
        this._ensureWordBlocksForTokens(tokens);

        const label = name || 'EB行' + lineNo;
        const id = this.repo.findOrCreateIdForLabel(label, 'EB');
        const eb = new EquationBlock(id, label, expr);
        this.repo.upsert(eb);
        createdEquationIds.push(id);
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        errors.push('行 ' + lineNo + ': ' + msg);
      }
    });

    return { errors: errors, createdEquationIds: createdEquationIds };
  }

  /**
   * 指定 EB の AST から語 token を再収集し、未登録の WordBlock を追加する。
   * @param {string} ebId
   */
  regenerateWordsFromEquation(ebId) {
    const block = this.repo.get(ebId);
    if (!(block instanceof EquationBlock) || !block.root) {
      return;
    }

    const tokens = new Set();
    block.root.collectWordTokens(tokens);

    this._ensureWordBlocksForTokens(tokens);
  }

  // =========================================================
  // 内部ヘルパ
  // =========================================================

  /**
   * token 集合に対して、存在しないものについて WordBlock を生成する。
   * ・token="NB" → WordBlock(token="NB", queryText="(NB)")
   *   （後でユーザが queryText を "(基地局+NB+eNB)" に編集できる）
   *
   * @param {Set<string>} tokens
   * @private
   */
  _ensureWordBlocksForTokens(tokens) {
    tokens.forEach((token) => {
      if (!this.repo.findWordBlockByToken(token)) {
        // 仕様上、queryText は括弧付きで格納
        this.repo.createWordBlockFromToken(token, '(' + token + ')');
      }
    });
  }

  /**
   * 単語定義行 (例: NB = 基地局+NB+eNB) から WordBlock を作成/更新。
   * ・token = name
   * ・queryText = "(" + expr を論理式として文字列化したもの + ")"
   *
   * @param {string} name - 左辺の識別子 (token)
   * @param {import('../core/expr-node.js').ExprNode} expr
   * @private
   */
  _createOrUpdateWordBlockFromLine(name, expr) {
    const token = name;
    const body = expr.renderLogical(); // 例: "基地局 + NB + eNB"
    const queryText = '(' + body + ')';

    let wb = this.repo.findWordBlockByToken(token);

    if (wb) {
      // 既存が見つかった場合は label/token を name に揃えつつ queryText を更新
      wb.label = name;
      wb.token = token;
      wb.updateQueryText(queryText);
      this.repo.upsert(wb);
    } else {
      // 新規作成
      const id = this.repo.findOrCreateIdForLabel(name, 'WB');
      wb = new WordBlock(id, name, token, queryText);
      this.repo.upsert(wb);
    }
  }

  /**
   * 分類定義行 (例: CLS1 = H04W16/24+H04W36/00 /CP) から ClassBlock を作成/更新。
   *
   * 制約:
   *  - expr は「分類コードの '+' 連結」のみ許可。
   *    → WordTokenNode / LogicalNode('+') のみで構成
   *  - '*', 近傍 (ProximityNode, SimultaneousProximityNode) は禁止。
   *
   * @param {string|undefined} name - 左辺の識別子（なければ "CB行n"）
   * @param {number} lineNo - 行番号（ラベル生成用）
   * @param {import('../core/expr-node.js').ExprNode} expr
   * @param {string} field - "/CP" か "/FI"
   * @private
   */
  _createOrUpdateClassBlockFromLine(name, lineNo, expr, field) {
    let codes;
    try {
      codes = this._extractCodesFromClassExpr(expr);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      throw new Error(msg + '（分類定義行: ' + (name || '行' + lineNo) + '）');
    }

    const label = name || 'CB行' + lineNo;
    const id = this.repo.findOrCreateIdForLabel(label, 'CB');
    const existing = this.repo.get(id);

    if (existing && existing instanceof ClassBlock) {
      existing.updateCodes(codes);
      existing.updateFieldSuffix(field);
      this.repo.upsert(existing);
    } else {
      const cb = new ClassBlock(id, label, codes, field);
      this.repo.upsert(cb);
    }
  }

  /**
   * 分類用 expr から分類コード配列を抽出する。
   *
   * 許可される構造:
   *  - WordTokenNode("H04W16/24") 単体
   *  - LogicalNode('+', [...WordTokenNode...]) のみからなる木
   *
   * 禁止:
   *  - LogicalNode('*', ...)
   *  - 近傍ノード (ProximityNode, SimultaneousProximityNode)
   *  - その他のノード種別
   *
   * @param {import('../core/expr-node.js').ExprNode} expr
   * @returns {string[]} codes
   * @private
   */
  _extractCodesFromClassExpr(expr) {
    const codes = new Set();

    const walk = (node) => {
      if (node instanceof WordTokenNode) {
        const token = node.token ? String(node.token).trim() : '';
        if (token) {
          codes.add(token);
        }
        return;
      }

      if (node instanceof LogicalNode) {
        if (node.op !== '+') {
          throw new Error('分類行には "*" や "-" ではなく "+" のみ使用できます');
        }
        node.children.forEach((child) => {
          walk(child);
        });
        return;
      }

      // それ以外のノードは分類定義では禁止（近傍・BlockRef 等）
      throw new Error('分類行に近傍や式ブロックを含めることはできません');
    };

    walk(expr);

    if (!codes.size) {
      throw new Error('分類行から分類コードを抽出できませんでした');
    }

    return Array.from(codes);
  }
}
