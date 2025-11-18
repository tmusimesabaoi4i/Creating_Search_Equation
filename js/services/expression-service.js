// js/services/expression-service.js
// ブロック生成サービス（1行入力 + 単語/分類 切り替え）

class ExpressionService {
  /**
   * @param {BlockRepository} blockRepository
   */
  constructor(blockRepository) {
    this.repo = blockRepository;
  }

  /**
   * ブロックビルダー用: テキストエリア入力 → 単語 or 分類ブロック生成
   *
   * @param {string} text - textarea 全体の内容
   * @param {"word"|"class"} builderKind - ラジオボタンの選択
   * @returns {{ errors: string[], createdBlockIds: string[] }}
   */
  parseInputLines(text, builderKind) {
    const errors = [];
    const createdIds = [];

    const kind = builderKind === 'class' ? 'class' : 'word';
    const raw = (text || '').split(/\r?\n/);
    const nonEmpty = raw.map((l) => l.trim()).filter((l) => l.length > 0);

    if (nonEmpty.length === 0) {
      errors.push('入力が空です。');
      return { errors, createdBlockIds: createdIds };
    }

    if (nonEmpty.length > 1) {
      errors.push(
        '一度に登録できるのは 1 行だけです。先頭行のみ処理しました。'
      );
    }

    const line = nonEmpty[0];

    try {
      const lexer = new Lexer(line);
      const parser = new Parser(lexer);
      const parsed = parser.parseLine(); // { name, expr, field }

      const name = parsed.name || null;
      const expr = parsed.expr;

      if (!expr) {
        throw new Error('式が解析できませんでした。');
      }

      let newId;
      if (kind === 'word') {
        newId = this._createWordBlockFromExpr(name, expr);
      } else {
        newId = this._createClassBlockFromExpr(name, expr);
      }
      if (newId) {
        createdIds.push(newId);
      }
    } catch (e) {
      errors.push('行 1: ' + (e && e.message ? e.message : String(e)));
    }

    return { errors, createdBlockIds: createdIds };
  }

  /**
   * EquationBlock の AST から WordBlock を再生成
   * @param {string} ebId
   */
  regenerateWordsFromEquation(ebId) {
    const eb = this.repo.get(ebId);
    if (!eb || eb.kind !== 'EB' || !eb.root) return;

    const tokens = new Set();
    eb.root.collectWordTokens(tokens);

    tokens.forEach((token) => {
      if (!this.repo.findWordBlockByToken(token)) {
        // 既存ユーティリティに委譲
        this.repo.createWordBlockFromToken(token, `(${token})`);
      }
    });
  }

  /**
   * 単語ブロック生成:
   *  NAME = expr  → token = NAME
   *  expr         → token = ランダム5文字
   *
   * queryText は (exprの論理表示) として保存
   *
   * @param {string|null} name
   * @param {ExprNode} expr
   * @returns {string} 生成・更新した WordBlock の ID
   * @private
   */
  _createWordBlockFromExpr(name, expr) {
    const logical = expr.renderLogical(); // 例: "基地局+NB+eNB"
    const body = logical.trim();

    // token: name があればそれを使う。無ければランダム5文字。
    let token = name && String(name).trim();
    if (!token) {
      token = this._generateUniqueToken(5);
    }

    const label = token;
    const id = this.repo.findOrCreateIdForLabel(label, 'WB');
    let wb = this.repo.get(id);

    if (wb && wb.kind === 'WB') {
      wb.token = token;
      wb.updateQueryText(`(${body})`);
      this.repo.upsert(wb);
    } else {
      wb = new WordBlock(id, label, token, `(${body})`);
      this.repo.upsert(wb);
    }

    return id;
  }

  /**
   * 分類ブロック生成:
   *  - 使用可能: 識別子 + '+' のみ
   *  - 禁止: '*', 近傍演算(10n/10c), BlockRef, ProximityNode など
   *
   * @param {string|null} name
   * @param {ExprNode} expr
   * @returns {string} 生成・更新した ClassBlock の ID
   * @private
   */
  _createClassBlockFromExpr(name, expr) {
    if (!this._isValidClassificationExpr(expr)) {
      throw new Error(
        '分類ブロックでは "+" とコード列のみ使用できます（"*", 近傍演算, ブロック参照は不可）。'
      );
    }

    const tokenSet = new Set();
    expr.collectWordTokens(tokenSet);
    const codes = Array.from(tokenSet);

    if (codes.length === 0) {
      throw new Error('分類コードが 1 つも見つかりませんでした。');
    }

    const label = (name && String(name).trim()) || codes[0];
    const id = this.repo.findOrCreateIdForLabel(label, 'CB');
    let cb = this.repo.get(id);

    if (cb && cb.kind === 'CB') {
      cb.codes = codes;
      if (typeof cb.touchUpdated === 'function') {
        cb.touchUpdated();
      }
      this.repo.upsert(cb);
    } else {
      // ClassBlock は core/block.js で定義済み想定
      cb = new ClassBlock(id, label, codes);
      this.repo.upsert(cb);
    }

    return id;
  }

  /**
   * 分類式として許容されるか判定
   * 許容:
   *  - WordTokenNode のみ
   *  - LogicalNode(op='+') とその再帰構造
   *
   * 不許可:
   *  - LogicalNode(op='*')
   *  - ProximityNode / SimultaneousProximityNode
   *  - BlockRefNode など
   *
   * これにより、H04W16/24*H04W36/00 などを分類として登録しない。
   *
   * @param {ExprNode} node
   * @returns {boolean}
   * @private
   */
  _isValidClassificationExpr(node) {
    if (!node) return false;

    if (node instanceof WordTokenNode) {
      return true;
    }

    if (node instanceof LogicalNode) {
      if (node.op !== '+') return false;
      if (!Array.isArray(node.children) || node.children.length === 0) {
        return false;
      }
      return node.children.every((ch) => this._isValidClassificationExpr(ch));
    }

    // それ以外（近傍、BlockRef など）は分類ブロックとしては不許可
    return false;
  }

  /**
   * ランダムな 5 文字 token を生成し、既存 WordBlock の token と重複しないようにする
   *
   * @param {number} length
   * @returns {string}
   * @private
   */
  _generateUniqueToken(length = 5) {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const repo = this.repo;

    // 衝突する可能性は極めて低いが、念のためループで確認
    for (;;) {
      let token = '';
      for (let i = 0; i < length; i++) {
        const idx = Math.floor(Math.random() * chars.length);
        token += chars.charAt(idx);
      }

      const existing =
        typeof repo.findWordBlockByToken === 'function'
          ? repo.findWordBlockByToken(token)
          : null;

      if (!existing) {
        return token;
      }
    }
  }
}

// グローバル公開
window.ExpressionService = ExpressionService;
