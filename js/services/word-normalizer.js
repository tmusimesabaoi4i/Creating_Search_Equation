// js/services/word-normalizer.js
// Word ブロック用の外部整形（重い処理）

/**
 * WordBlock 生成時の外部整形を行うサービスクラス
 * 英単語のバリエーション展開を含む重い処理
 */
class WordNormalizer {
  constructor() {
    this.exprNormalizer = new ExpressionNormalizer();
  }

  /**
   * Word式から正規化済みキー（expressionKey）を生成
   * 軽量正規化のみ（記号半角化、スペース削除、括弧除去）
   * 
   * @param {string} rawWordExpr - 元のWord式文字列（例: "(antenna+アンテナ)"）
   * @returns {string} - 正規化済みキー（例: "antenna+アンテナ"）
   */
  buildExpressionKey(rawWordExpr) {
    if (!rawWordExpr || typeof rawWordExpr !== 'string') {
      return '';
    }

    // 内部整形（記号半角化、スペース削除）
    let normalized = this.exprNormalizer.normalizeInline(rawWordExpr);
    normalized = this.exprNormalizer.removeSpaces(normalized);

    // 最外周の括弧を除去
    normalized = this._stripOuterParens(normalized);

    return normalized;
  }

  /**
   * バリエーション配列からUI表示用ラベルを生成
   * 
   * @param {string[]} variants - バリエーション配列
   * @returns {string} - UI表示用ラベル（例: "(antenna+Antenna+アンテナ)"）
   */
  buildDisplayLabel(variants) {
    if (!Array.isArray(variants) || variants.length === 0) {
      return '';
    }

    // 最大10個まで表示、それ以上は...で省略
    const maxDisplay = 10;
    const displayVariants = variants.slice(0, maxDisplay);
    const label = displayVariants.join('+');
    
    if (variants.length > maxDisplay) {
      return `(${label}+...)`;
    }
    
    return `(${label})`;
  }

  /**
   * Word ブロック用の外部整形
   * バリエーション配列を返す（+で結合しない）
   * 
   * @param {string} rawWordExpr - 元の式文字列（例: "antenna+アンテナ"）
   * @returns {string[]} - バリエーション配列（例: ["antenna", "Antenna", "ａｎｔｅｎｎａ", ..., "アンテナ"]）
   * 
   * 処理手順:
   * 1. 記号を半角化、スペース削除（内部整形）
   * 2. + で分割 → input_word_list
   * 3. 英字のみの単語と非英字単語を分類
   * 4. 英字単語ごとに6バリエーション生成
   * 5. 重複削除
   * 6. 文字数降順でソート
   * 7. 配列で返す
   */
  normalizeForWordBlock(rawWordExpr) {
    if (!rawWordExpr || typeof rawWordExpr !== 'string') {
      return [];
    }

    // 1. 内部整形（記号半角化、スペース削除）
    let normalized = this.exprNormalizer.normalizeInline(rawWordExpr);
    normalized = this.exprNormalizer.removeSpaces(normalized);

    // 括弧を除去（最外周のみ）
    normalized = this._stripOuterParens(normalized);

    // 2. + で分割
    const inputWordList = normalized.split('+').map(w => w.trim()).filter(w => w.length > 0);

    // 3. 英字のみ / 非英字に分類
    const engWords = [];
    const jpWords = [];

    inputWordList.forEach(word => {
      if (this._isEnglishOnly(word)) {
        engWords.push(word);
      } else {
        jpWords.push(word);
      }
    });

    // 4. 英字単語のバリエーション生成
    const expandedEngWords = [];
    engWords.forEach(word => {
      const variants = this._generateEnglishVariants(word);
      expandedEngWords.push(...variants);
    });

    // 5. 重複削除
    const allWords = [...new Set([...expandedEngWords, ...jpWords])];

    // 6. 文字数降順でソート
    allWords.sort((a, b) => b.length - a.length);

    // 7. 配列で返す
    return allWords;
  }

  /**
   * 英字のみの文字列かチェック
   * @param {string} word
   * @returns {boolean}
   * @private
   */
  _isEnglishOnly(word) {
    // 半角・全角の英字のみ（アルファベット）
    return /^[a-zA-Zａ-ｚＡ-Ｚ]+$/.test(word);
  }

  /**
   * 英単語から6つのバリエーションを生成
   * 
   * @param {string} word - 元の英単語
   * @returns {string[]} - 6バリエーション
   * 
   * バリエーション:
   * 1. 先頭大文字・残り小文字・全角
   * 2. 先頭大文字・残り小文字・半角
   * 3. 全て大文字・全角
   * 4. 全て大文字・半角
   * 5. 全て小文字・全角
   * 6. 全て小文字・半角
   * 
   * @private
   */
  _generateEnglishVariants(word) {
    // まず半角・小文字に統一（base_word_eng）
    const baseWord = this._toHalfWidth(word).toLowerCase();

    const variants = [];

    // 1. 先頭大文字・残り小文字・全角
    const capitalized = baseWord.charAt(0).toUpperCase() + baseWord.slice(1).toLowerCase();
    variants.push(this._toFullWidth(capitalized));

    // 2. 先頭大文字・残り小文字・半角
    variants.push(capitalized);

    // 3. 全て大文字・全角
    variants.push(this._toFullWidth(baseWord.toUpperCase()));

    // 4. 全て大文字・半角
    variants.push(baseWord.toUpperCase());

    // 5. 全て小文字・全角
    variants.push(this._toFullWidth(baseWord.toLowerCase()));

    // 6. 全て小文字・半角
    variants.push(baseWord.toLowerCase());

    return variants;
  }

  /**
   * 文字列を半角アルファベットに変換
   * @param {string} text
   * @returns {string}
   * @private
   */
  _toHalfWidth(text) {
    return text.replace(/[Ａ-Ｚａ-ｚ]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
    });
  }

  /**
   * 文字列を全角アルファベットに変換
   * @param {string} text
   * @returns {string}
   * @private
   */
  _toFullWidth(text) {
    return text.replace(/[A-Za-z]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) + 0xFEE0);
    });
  }

  /**
   * 最外周の括弧を除去
   * @param {string} text
   * @returns {string}
   * @private
   */
  _stripOuterParens(text) {
    if (!text) return '';
    let stripped = text.trim();
    
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
}

// グローバル公開
window.WordNormalizer = WordNormalizer;

