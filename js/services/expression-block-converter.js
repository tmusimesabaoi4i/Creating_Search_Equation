// js/services/expression-block-converter.js
// 式からブロック生成（3レイヤ設計）

/**
 * 検索式からブロックを自動生成するコンバータークラス
 * 
 * 設計思想（3レイヤ）:
 * 1. 式文字列レイヤ: 入力式を正規化し、トップレベルの*で因子文字列に分解
 * 2. 因子分類レイヤ: 各因子文字列がWord/Class/近傍式かを文字列パターンで判定
 * 3. ブロック生成レイヤ: 因子の種別に応じてブロックを生成
 * 
 * 重要な方針:
 * - WordBlockはWord式単位で作成（トークン単位ではない）
 * - tokenはランダムID、expressionKeyで意味的識別
 * - 分割モードではEquationBlockは一切生成しない
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
    this.exprNormalizer = new ExpressionNormalizer();
    this.wordTokenGenerator = new WordTokenGenerator(repo, 8);
    
    // 内部状態（処理中の式情報）
    this.inputed_qu_raw = '';      // 入力そのまま
    this.inputed_qu_norm = '';    // 内部整形済み（記号半角化・スペース除去）
    this.inputed_qu_class = '';   // ブロック分解の基準となる式（分解対象式）
    this.joinedBlockList = [];
    this.factorMetaList = [];
  }

  /**
   * 検索式からブロックを生成（分割モード専用）
   * EquationBlockは生成せず、WordBlock/ClassBlockのみ生成
   * 
   * @param {string} rawText - 入力された検索式
   * @returns {{errors: string[], createdBlocks: {words: string[], classes: string[]}}}
   * 
   * 例: "(antenna+アンテナ)/TX*(ris+反射板)/TX*基地局/TX*[H04W12/00/CP+H04W12/00/FI]"
   *  → WordBlocks: (antenna+アンテナ), (ris+反射板), 基地局
   *  → ClassBlocks: H04W12/00/CP+H04W12/00/FI
   */
  generateBlocksFromEquationInput(rawText) {
    const errors = [];
    const createdBlocks = {
      words: [],
      classes: []
    };

    if (!rawText || !rawText.trim()) {
      errors.push('入力が空です。');
      return { errors, createdBlocks };
    }

    try {
      // ========================================
      // レイヤ1: 式文字列レイヤ
      // ========================================
      this._initializeExpressionState(rawText);
      this._splitFactorsByProduct();

      // ========================================
      // レイヤ2: 因子分類レイヤ
      // ========================================
      this._classifyFactors();

      // ========================================
      // レイヤ3: ブロック生成レイヤ
      // ========================================
      this.factorMetaList.forEach((factorMeta, index) => {
        try {
          const result = this._generateBlocksFromFactor(factorMeta);
          
          if (result.wordIds) {
            createdBlocks.words.push(...result.wordIds);
          }
          if (result.classIds) {
            createdBlocks.classes.push(...result.classIds);
          }
          
        } catch (e) {
          errors.push(`因子 ${index + 1} (${factorMeta.raw.substring(0, 20)}...): ${e.message || e}`);
        }
      });

    } catch (e) {
      errors.push(`式の処理エラー: ${e.message || e}`);
    }

    return { errors, createdBlocks };
  }

  // ========================================
  // レイヤ1: 式文字列レイヤ
  // ========================================

  /**
   * 式の状態を初期化
   * @param {string} rawText
   * @private
   */
  _initializeExpressionState(rawText) {
    this.inputed_qu_raw = rawText;
    
    // 内部整形（軽量）: 記号半角化、スペース削除
    this.inputed_qu_norm = this.exprNormalizer.normalizeInline(rawText);
    this.inputed_qu_norm = this.exprNormalizer.removeSpaces(this.inputed_qu_norm);
    
    // ブロック分解の基準となる式（分解対象式）として明示的にコピー
    // 将来的にinputed_qu_normとinputed_qu_classを分離する可能性を考慮
    this.inputed_qu_class = this.inputed_qu_norm;
    
    this.joinedBlockList = [];
    this.factorMetaList = [];
  }

  /**
   * 正規化済み式をトップレベルの*で因子分解
   * 括弧ネスト（(), [], {}）を考慮する
   * 
   * 分解対象式としてinputed_qu_classを使用（責務を明確化）
   * @private
   */
  _splitFactorsByProduct() {
    const normalized = this.inputed_qu_class;
    const factors = [];
    let currentFactor = '';
    let depth = 0; // 括弧ネストの深さ

    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];

      // 開き括弧
      if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
        currentFactor += ch;
      }
      // 閉じ括弧
      else if (ch === ')' || ch === ']' || ch === '}') {
        depth = Math.max(0, depth - 1);
        currentFactor += ch;
      }
      // トップレベルの*
      else if (ch === '*' && depth === 0) {
        // 因子の区切り
        if (currentFactor.trim().length > 0) {
          factors.push(currentFactor.trim());
        }
        currentFactor = '';
      }
      // その他の文字
      else {
        currentFactor += ch;
      }
    }

    // 最後の因子
    if (currentFactor.trim().length > 0) {
      factors.push(currentFactor.trim());
    }

    this.joinedBlockList = factors;
  }

  // ========================================
  // レイヤ2: 因子分類レイヤ
  // ========================================

  /**
   * 各因子を文字列パターンで分類
   * @private
   */
  _classifyFactors() {
    this.factorMetaList = this.joinedBlockList.map(factorStr => {
      const kind = this._detectFactorKind(factorStr);
      return {
        raw: factorStr,
        kind: kind
      };
    });
  }

  /**
   * 因子文字列の種別を判定
   * @param {string} factorStr
   * @returns {'proximity'|'class'|'word'|'unknown'}
   * @private
   */
  _detectFactorKind(factorStr) {
    // 1. 近傍式: {XXX},NNn/TX のようなパターン
    if (this._isProximityFactor(factorStr)) {
      return 'proximity';
    }

    // 2. 分類式: [XXX] で囲まれており、/CPまたは/FIを含む
    if (this._isClassFactor(factorStr)) {
      return 'class';
    }

    // 3. Word式: /TXを含み、[]や{}が含まれていない
    if (this._isWordFactor(factorStr)) {
      return 'word';
    }

    // 4. その他（想定外）
    return 'unknown';
  }

  /**
   * 近傍式かどうか判定
   * @param {string} str
   * @returns {boolean}
   * @private
   */
  _isProximityFactor(str) {
    // {XXX},NNn/TX のようなパターン
    // または {XXX},NNn/CP, {XXX},NNn/FI
    return /^\{.+\},\d+n\/(TX|CP|FI)$/i.test(str);
  }

  /**
   * 分類式かどうか判定
   * @param {string} str
   * @returns {boolean}
   * @private
   */
  _isClassFactor(str) {
    // [XXX] で囲まれている
    if (!str.startsWith('[') || !str.endsWith(']')) {
      return false;
    }

    // /CP または /FI を含む
    return /\/(CP|FI)/i.test(str);
  }

  /**
   * Word式かどうか判定
   * @param {string} str
   * @returns {boolean}
   * @private
   */
  _isWordFactor(str) {
    // /TX を含む
    if (!/\/TX/i.test(str)) {
      return false;
    }

    // [] や {} が含まれていない
    if (/[\[\]{}]/.test(str)) {
      return false;
    }

    return true;
  }

  // ========================================
  // レイヤ3: ブロック生成レイヤ
  // ========================================

  /**
   * 因子からブロックを生成
   * @param {{raw: string, kind: string}} factorMeta
   * @returns {{wordIds?: string[], classIds?: string[]}}
   * @private
   */
  _generateBlocksFromFactor(factorMeta) {
    const result = {
      wordIds: [],
      classIds: []
    };

    switch (factorMeta.kind) {
      case 'word':
        result.wordIds = this._generateWordBlockFromFactor(factorMeta.raw);
        break;

      case 'class':
        result.classIds = this._generateClassBlockFromFactor(factorMeta.raw);
        break;

      case 'proximity':
        result.wordIds = this._generateWordBlocksFromProximity(factorMeta.raw);
        break;

      case 'unknown':
        throw new Error(`想定外の因子形式です: ${factorMeta.raw}`);

      default:
        throw new Error(`不明な因子種別: ${factorMeta.kind}`);
    }

    return result;
  }

  // ========================================
  // Word因子 → WordBlock生成
  // ========================================

  /**
   * Word因子からWordBlockを生成
   * @param {string} factorStr - 例: "(antenna+アンテナ)/TX"
   * @returns {string[]} - 作成したWordBlockのID配列
   * @private
   */
  _generateWordBlockFromFactor(factorStr) {
    // 1. フィールドタグを剥がす (/TX など)
    const factorWordCore = this._stripFieldTag(factorStr);

    // 2. 括弧を外す
    const wordExpr = this._stripOuterParens(factorWordCore);

    if (!wordExpr || wordExpr.trim().length === 0) {
      return [];
    }

    // 3. WordBlock作成または再利用
    const wordId = this._createOrReuseWordBlock(wordExpr);

    return wordId ? [wordId] : [];
  }

  /**
   * フィールドタグを除去 (/TX, /CP, /FI)
   * @param {string} str
   * @returns {string}
   * @private
   */
  _stripFieldTag(str) {
    return str.replace(/\/(TX|CP|FI)$/i, '');
  }

  /**
   * 最外周の括弧を除去
   * @param {string} str
   * @returns {string}
   * @private
   */
  _stripOuterParens(str) {
    if (!str) return '';
    let stripped = str.trim();

    while (stripped.startsWith('(') && stripped.endsWith(')')) {
      // 括弧が対応しているかチェック
      let depth = 0;
      let valid = true;

      for (let i = 0; i < stripped.length; i++) {
        if (stripped[i] === '(') depth++;
        if (stripped[i] === ')') depth--;
        if (depth === 0 && i !== stripped.length - 1) {
          valid = false;
          break;
        }
      }

      if (valid && depth === 0) {
        stripped = stripped.slice(1, -1).trim();
      } else {
        break;
      }
    }

    return stripped;
  }

  /**
   * Word式文字列からWordBlockを作成または再利用
   * @param {string} wordExpr - 例: "antenna+アンテナ"
   * @returns {string|null} - WordBlockのID、またはnull
   * @private
   */
  _createOrReuseWordBlock(wordExpr) {
    if (!wordExpr || typeof wordExpr !== 'string') {
      return null;
    }

    // 1. expressionKey を生成（軽量正規化）
    const expressionKey = this.wordNormalizer.buildExpressionKey(wordExpr);

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
    const variants = this.wordNormalizer.normalizeForWordBlock(wordExpr);

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

  // ========================================
  // Class因子 → ClassBlock生成
  // ========================================

  /**
   * Class因子からClassBlockを生成
   * @param {string} factorStr - 例: "[H04W12/00/CP+H04W12/00/FI]"
   * @returns {string[]} - 作成したClassBlockのID配列
   * @private
   */
  _generateClassBlockFromFactor(factorStr) {
    // 1. 外側の [] を外す
    let classCore = factorStr.trim();
    if (classCore.startsWith('[') && classCore.endsWith(']')) {
      classCore = classCore.slice(1, -1).trim();
    }

    if (!classCore || classCore.length === 0) {
      return [];
    }

    // 2. これを1つの分類ブロック式として扱う
    // 例: "H04W12/00/CP+H04W12/00/FI"
    const classId = this._createOrReuseClassBlock(classCore);

    return classId ? [classId] : [];
  }

  /**
   * Class式文字列からClassBlockを作成または再利用
   * 
   * 新しいポリシー:
   * - classExprを+でトップレベル分割してcodes配列を作る
   * - 内部整形（全角→半角、空白削除など）はExpressionNormalizerと同じルール
   * - expressionKeyは正規化したcodesをソートして+結合
   * - labelはcodes[0]を表示名に
   * 
   * @param {string} classExpr - 例: "H04W12/00/CP+H04W12/00/FI"
   * @returns {string|null} - ClassBlockのID、またはnull
   * @private
   */
  _createOrReuseClassBlock(classExpr) {
    if (!classExpr || typeof classExpr !== 'string') {
      return null;
    }

    // 1. 内部整形（全角→半角、空白削除）
    const normalized = this.exprNormalizer.normalizeInline(classExpr);
    const normalizedClean = this.exprNormalizer.removeSpaces(normalized);

    // 2. +でトップレベル分割してcodes配列を作る（括弧ネストを考慮）
    const codes = this._splitByPlus(normalizedClean);

    if (codes.length === 0) {
      return null;
    }

    // 3. expressionKey生成: codesをソートして+結合
    const sortedCodes = [...codes].sort();
    const expressionKey = sortedCodes.join('+');

    // 4. 既存のClassBlockを検索（expressionKeyベース）
    let cb = this.repo.findClassBlockByExpressionKey(expressionKey);

    if (cb) {
      // 既存のClassBlockを再利用
      return cb.id;
    }

    // 5. 新規作成
    // 上限チェック
    const limitCheck = this.repo.checkBlockLimit('CB');
    if (!limitCheck.ok) {
      throw new Error(limitCheck.message);
    }

    // 6. labelはcodes[0]を表示名に
    const label = codes[0] || expressionKey;

    // 7. token生成（ランダムID推奨だが、現状はexpressionKeyを使用）
    const token = expressionKey;

    // 8. ClassBlock作成
    const id = this.repo.nextId('CB');
    cb = new ClassBlock(id, label, token, codes, expressionKey);
    this.repo.upsert(cb);

    return cb.id;
  }

  /**
   * +でトップレベル分割（括弧ネストを考慮）
   * @param {string} str - 例: "H04W12/00/CP+H04W12/00/FI"
   * @returns {string[]} - 例: ["H04W12/00/CP", "H04W12/00/FI"]
   * @private
   */
  _splitByPlus(str) {
    const elements = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
        current += ch;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth = Math.max(0, depth - 1);
        current += ch;
      } else if (ch === '+' && depth === 0) {
        // トップレベルの+
        if (current.trim().length > 0) {
          elements.push(current.trim());
        }
        current = '';
      } else {
        current += ch;
      }
    }

    // 最後の要素
    if (current.trim().length > 0) {
      elements.push(current.trim());
    }

    return elements;
  }

  // ========================================
  // 近傍因子 → 内部Word抽出
  // ========================================

  /**
   * 近傍因子から内部のWord式を抽出してWordBlockを生成
   * @param {string} factorStr - 例: "{(W1),(W2),基地局},10n/TX"
   * @returns {string[]} - 作成したWordBlockのID配列
   * @private
   */
  _generateWordBlocksFromProximity(factorStr) {
    const wordIds = [];

    // 1. {}の中身を取り出す
    const innerMatch = factorStr.match(/^\{(.+)\},\d+n\/(TX|CP|FI)$/i);
    if (!innerMatch) {
      return wordIds;
    }

    const proximityInnerRaw = innerMatch[1];

    // 2. カンマでトップレベル分割（括弧ネストに注意）
    const proximityElementList = this._splitByComma(proximityInnerRaw);

    // 3. 各要素をWord式として処理
    proximityElementList.forEach(element => {
      // フィールドタグを剥がす
      const wordCore = this._stripFieldTag(element);
      
      // 括弧を外す
      const wordExpr = this._stripOuterParens(wordCore);

      if (wordExpr && wordExpr.trim().length > 0) {
        const wordId = this._createOrReuseWordBlock(wordExpr);
        if (wordId) {
          wordIds.push(wordId);
        }
      }
    });

    return wordIds;
  }

  /**
   * カンマでトップレベル分割（括弧ネストを考慮）
   * @param {string} str - 例: "(W1),(W2),基地局"
   * @returns {string[]} - 例: ["(W1)", "(W2)", "基地局"]
   * @private
   */
  _splitByComma(str) {
    const elements = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
        current += ch;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth = Math.max(0, depth - 1);
        current += ch;
      } else if (ch === ',' && depth === 0) {
        // トップレベルのカンマ
        if (current.trim().length > 0) {
          elements.push(current.trim());
        }
        current = '';
      } else {
        current += ch;
      }
    }

    // 最後の要素
    if (current.trim().length > 0) {
      elements.push(current.trim());
    }

    return elements;
  }
}

// グローバル公開
window.ExpressionBlockConverter = ExpressionBlockConverter;
