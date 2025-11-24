// js/services/expression-block-converter.js
// 式からブロック生成（新機能1の中核）

/**
 * 検索式からブロックを自動生成するコンバータークラス
 * 
 * 役割:
 * - 入力された検索式を * で因子に分解
 * - 各因子を解析して Word/Class/Equation ブロックを生成
 * - 近傍式の内部から Word を抽出
 * 
 * 設計思想:
 * - WordBlockはWord式単位で作成（トークン単位ではない）
 * - tokenはランダムID、expressionKeyで意味的識別
 * - 正規化は2段階：軽量（expressionKey）と重い（variants生成）
 */
class ExpressionBlockConverter {
  /**
   * @param {ExpressionService} exprService
   * @param {BlockRepository} repo
   * @param {RenderContext} ctx
   */
  constructor(exprService, repo, ctx) {
    this.exprService = exprService;
    this.repo = repo;
    this.ctx = ctx;
    this.wordNormalizer = new WordNormalizer();
    this.wordTokenGenerator = new WordTokenGenerator(repo, 8);
  }

  /**
   * 検索式からブロックを生成（新機能1のメイン処理）
   * 
   * @param {string} rawText - 入力された検索式
   * @returns {{errors: string[], createdBlocks: {words: string[], classes: string[], equations: string[]}}}
   * 
   * 例: "(A+B)/TX*(A + B + C)/TX*(F + D)/TX*S/TX"
   *  → Expression blocks: 4個
   *  → Word blocks: A, B, C, F, D, S など
   */
  generateBlocksFromEquationInput(rawText) {
    const errors = [];
    const createdBlocks = {
      words: [],
      classes: [],
      equations: []
    };

    if (!rawText || !rawText.trim()) {
      errors.push('入力が空です。');
      return { errors, createdBlocks };
    }

    try {
      // 1. 全体を1つの式としてパース
      const lexer = new Lexer(rawText);
      const parser = new Parser(lexer);
      const rootExpr = parser.parseExpr();

      if (!rootExpr) {
        throw new Error('式が解析できませんでした。');
      }

      // 2. * で因子に分解（トップレベルの積演算）
      const factors = this._splitByProduct(rootExpr);

      // 3. 各因子を解析してブロック生成
      factors.forEach((factor, index) => {
        try {
          const result = this._processFactor(factor, index);
          
          if (result.wordIds) createdBlocks.words.push(...result.wordIds);
          if (result.classIds) createdBlocks.classes.push(...result.classIds);
          if (result.equationId) createdBlocks.equations.push(result.equationId);
          
        } catch (e) {
          errors.push(`因子 ${index + 1}: ${e.message || e}`);
        }
      });

    } catch (e) {
      errors.push(`式の解析エラー: ${e.message || e}`);
    }

    return { errors, createdBlocks };
  }

  /**
   * 式を * で因子に分解
   * @param {ExprNode} expr
   * @returns {ExprNode[]}
   * @private
   */
  _splitByProduct(expr) {
    if (!expr) return [];

    // LogicalNode('*') でない場合は、そのまま1要素として返す
    if (!(expr instanceof LogicalNode) || expr.op !== '*') {
      return [expr];
    }

    // * を再帰的に展開
    const factors = [];
    const stack = [expr];

    while (stack.length > 0) {
      const node = stack.pop();
      
      if (node instanceof LogicalNode && node.op === '*') {
        // 子要素を逆順でスタックに追加（順序保持のため）
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push(node.children[i]);
        }
      } else {
        factors.push(node);
      }
    }

    return factors;
  }

  /**
   * 因子を解析してブロックを生成
   * @param {ExprNode} factor
   * @param {number} index
   * @returns {{wordIds?: string[], classIds?: string[], equationId?: string}}
   * @private
   */
  _processFactor(factor, index) {
    const result = {
      wordIds: [],
      classIds: [],
      equationId: null
    };

    // 因子の種別を判定
    const factorType = this._classifyFactor(factor);

    switch (factorType) {
      case 'word':
        // Word のみの式 → WordBlock + EquationBlock
        result.wordIds = this._extractAndCreateWords(factor);
        result.equationId = this._createEquationBlock(factor, `E${index + 1}`, true);
        break;

      case 'class':
        // Class のみの式 → ClassBlock + EquationBlock
        result.classIds = this._extractAndCreateClasses(factor);
        result.equationId = this._createEquationBlock(factor, `E${index + 1}`, false);
        break;

      case 'proximity':
        // 近傍式 → 内部の Word 抽出 + EquationBlock
        result.wordIds = this._extractWordsFromProximity(factor);
        result.equationId = this._createEquationBlock(factor, `P${index + 1}`, true);
        break;

      case 'mixed':
        // 混在式 → そのまま EquationBlock
        result.equationId = this._createEquationBlock(factor, `E${index + 1}`, false);
        break;

      default:
        result.equationId = this._createEquationBlock(factor, `E${index + 1}`, false);
    }

    return result;
  }

  /**
   * 因子の種別を判定
   * @param {ExprNode} factor
   * @returns {'word'|'class'|'proximity'|'mixed'|'unknown'}
   * @private
   */
  _classifyFactor(factor) {
    // 近傍ノード
    if (factor instanceof ProximityNode || factor instanceof SimultaneousProximityNode) {
      return 'proximity';
    }

    // Word/Class の判定
    const parts = translateExprToFieldParts(factor, this.ctx);
    const hasWord = Array.isArray(parts.w) && parts.w.length > 0;
    const hasClass = Array.isArray(parts.c) && parts.c.length > 0;

    if (hasWord && hasClass) return 'mixed';
    if (hasWord) return 'word';
    if (hasClass) return 'class';
    
    return 'unknown';
  }

  /**
   * 因子からWord式文字列を抽出
   * @param {ExprNode} factor
   * @returns {string|null} - Word式文字列（例: "A+B"）、またはnull
   * @private
   */
  _extractWordExpressionString(factor) {
    if (!factor) return null;

    // translateExprToFieldPartsでWord/Class部分を取得
    const parts = translateExprToFieldParts(factor, this.ctx);
    
    // Word部分がない場合はnull
    if (!Array.isArray(parts.w) || parts.w.length === 0) {
      return null;
    }

    // Word部分を文字列に変換
    // parts.w は [string | ProximityTerm, ...] の配列
    // ここではシンプルに文字列のみを結合（Proximityは後で別処理）
    const wordStrings = parts.w.filter(item => typeof item === 'string');
    
    if (wordStrings.length === 0) {
      return null;
    }

    // + で結合してWord式文字列を作成
    return wordStrings.join('+');
  }

  /**
   * Word式文字列からWordBlockを作成または再利用
   * @param {string} wordExprString - Word式文字列（例: "A+B"）
   * @returns {string|null} - 作成または再利用したWordBlockのID、またはnull
   * @private
   */
  _createOrReuseWordBlock(wordExprString) {
    if (!wordExprString || typeof wordExprString !== 'string') {
      return null;
    }

    // 1. expressionKey を生成（軽量正規化）
    const expressionKey = this.wordNormalizer.buildExpressionKey(wordExprString);
    
    if (!expressionKey) {
      return null;
    }

    // 2. 既存のWordBlockを検索
    let wb = this.repo.findWordBlockByExpressionKey(expressionKey);
    
    if (wb) {
      // 既存のWordBlockを再利用
      return wb.id;
    }

    // 3. 新規作成
    // 外部整形：バリエーション生成（重い処理）
    const variants = this.wordNormalizer.normalizeForWordBlock(wordExprString);
    
    // displayLabel生成
    const displayLabel = this.wordNormalizer.buildDisplayLabel(variants);
    
    // ランダムtoken生成
    const randomToken = this.wordTokenGenerator.generate();

    // WordBlock作成
    try {
      wb = this.repo.createWordBlockFromExpression(
        expressionKey,
        variants,
        displayLabel,
        randomToken
      );
      return wb.id;
    } catch (e) {
      console.error('WordBlock作成エラー:', e.message);
      return null;
    }
  }

  /**
   * 因子から Word を抽出して WordBlock 作成（Word式単位）
   * @param {ExprNode} factor
   * @returns {string[]} - 作成した WordBlock の ID 配列
   * @private
   */
  _extractAndCreateWords(factor) {
    const wordIds = [];

    // Word式文字列を抽出
    const wordExprString = this._extractWordExpressionString(factor);
    
    if (!wordExprString) {
      return wordIds;
    }

    // WordBlock作成または再利用
    const wordId = this._createOrReuseWordBlock(wordExprString);
    
    if (wordId) {
      wordIds.push(wordId);
    }

    return wordIds;
  }

  /**
   * 因子から Class を抽出して ClassBlock 作成
   * @param {ExprNode} factor
   * @returns {string[]} - 作成した ClassBlock の ID 配列
   * @private
   */
  _extractAndCreateClasses(factor) {
    const classIds = [];
    const tokens = new Set();
    factor.collectWordTokens(tokens);

    tokens.forEach(token => {
      if (!token || token.trim().length === 0) return;

      // 分類コードっぽいかチェック
      if (!/^[A-Z]\d{2}[A-Z]\d+\/\d+/.test(token)) return;

      // 既存チェック
      let cb = this.repo.findClassBlockByToken(token);
      
      if (!cb) {
        // 上限チェック
        if (!this.repo.canAddBlock('CB')) {
          console.warn(`分類ブロックの上限に達しています: ${token}`);
          return;
        }

        const id = this.repo.findOrCreateIdForLabel(token, 'CB');
        cb = new ClassBlock(id, token, token, [token]);
        this.repo.upsert(cb);
        classIds.push(cb.id);
      }
    });

    return classIds;
  }

  /**
   * 近傍式から Word を抽出（各子要素からWord式単位で）
   * @param {ExprNode} proximityNode
   * @returns {string[]} - 作成した WordBlock の ID 配列
   * @private
   */
  _extractWordsFromProximity(proximityNode) {
    const wordIds = [];

    if (!proximityNode.children || !Array.isArray(proximityNode.children)) {
      return wordIds;
    }

    // 各子要素からWord式を抽出
    proximityNode.children.forEach(child => {
      // 各子要素（A+B、F+D+H、I など）からWord式文字列を抽出
      const wordExprString = this._extractWordExpressionString(child);
      
      if (wordExprString) {
        // Word式単位でWordBlock作成または再利用
        const wordId = this._createOrReuseWordBlock(wordExprString);
        
        if (wordId) {
          wordIds.push(wordId);
        }
      }
    });

    return wordIds;
  }

  /**
   * EquationBlock を作成
   * @param {ExprNode} factor
   * @param {string} labelPrefix
   * @param {boolean} canUseForProximity
   * @returns {string} - 作成した EquationBlock の ID
   * @private
   */
  _createEquationBlock(factor, labelPrefix, canUseForProximity) {
    // 式のレンダリング（内部整形を適用してきれいな形に）
    const rawLogical = factor.renderLogical ? factor.renderLogical(this.ctx) : 'unknown';
    
    // ExpressionNormalizer がある場合は内部整形を適用
    const logical = this.exprService && this.exprService.exprNormalizer
      ? this.exprService.exprNormalizer.normalizeInline(rawLogical)
      : rawLogical;

    const label = `${labelPrefix}: ${logical.substring(0, 30)}${logical.length > 30 ? '...' : ''}`;

    const id = this.repo.findOrCreateIdForLabel(label, 'EB');
    let eb = this.repo.get(id);

    if (eb && eb.kind === 'EB') {
      // 既存の更新
      eb.setRoot(factor.clone ? factor.clone() : factor);
      eb.canUseForProximity = canUseForProximity;
      this.repo.upsert(eb);
    } else {
      // 新規作成
      const limitCheck = this.repo.checkBlockLimit('EB');
      if (!limitCheck.ok) {
        throw new Error(limitCheck.message);
      }

      eb = new EquationBlock(id, label, factor.clone ? factor.clone() : factor);
      eb.canUseForProximity = canUseForProximity;
      this.repo.upsert(eb);
    }

    return eb.id;
  }
}

// グローバル公開
window.ExpressionBlockConverter = ExpressionBlockConverter;

