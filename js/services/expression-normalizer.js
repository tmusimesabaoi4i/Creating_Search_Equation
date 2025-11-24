// js/services/expression-normalizer.js
// 式の内部整形（軽量）：検索式コピー時などに使用

/**
 * 検索式の内部整形を行うサービスクラス
 * 記号の半角統一とスペース削除を実行
 */
class ExpressionNormalizer {
  constructor() {
    // 全角→半角の変換マップ
    this.fullToHalfMap = {
      '＋': '+',
      '＊': '*',
      '（': '(',
      '）': ')',
      '［': '[',
      '］': ']',
      '｛': '{',
      '｝': '}',
      '／': '/',
      '　': '', // 全角スペース → 削除
      ' ': ''   // 半角スペース → 削除
    };
  }

  /**
   * 内部整形（軽量）：記号を半角に統一し、スペースを削除
   * 
   * @param {string} exprString - 整形対象の式文字列
   * @returns {string} - 整形済みの式文字列
   * 
   * 処理内容:
   * 1. +, (, ), /TX, /CP, /FI, [, ], {, }, * を半角に変換
   * 2. 全角・半角スペースを削除
   * 
   * 例: "(A + B) /ＴＸ * ( C + D ) /tx"
   *  → "(A+B)/TX*(C+D)/tx"
   *  → さらにスペース削除 → "(A+B)/TX*(C+D)/tx"
   */
  normalizeInline(exprString) {
    if (!exprString || typeof exprString !== 'string') {
      return '';
    }

    let result = exprString;

    // 全角記号を半角に変換
    for (const [fullWidth, halfWidth] of Object.entries(this.fullToHalfMap)) {
      result = result.split(fullWidth).join(halfWidth);
    }

    // /TX, /CP, /FI の大文字小文字を統一（大文字に）
    result = result.replace(/\/tx/gi, '/TX');
    result = result.replace(/\/cp/gi, '/CP');
    result = result.replace(/\/fi/gi, '/FI');

    // Ｔ, Ｘ, Ｃ, Ｐ, Ｆ, Ｉ などの全角アルファベットを半角に
    // result = result.replace(/Ｔ/g, 'T');
    // result = result.replace(/Ｘ/g, 'X');
    // result = result.replace(/Ｃ/g, 'C');
    // result = result.replace(/Ｐ/g, 'P');
    // result = result.replace(/Ｆ/g, 'F');
    // result = result.replace(/Ｉ/g, 'I');

    result = result.replace(/\/tx/gi, '/TX');
    result = result.replace(/\/Tx/gi, '/TX');
    result = result.replace(/\/tX/gi, '/TX');
    result = result.replace(/\/TX/gi, '/TX');

    result = result.replace(/\/ｔx/gi, '/TX');
    result = result.replace(/\/Ｔx/gi, '/TX');
    result = result.replace(/\/ｔX/gi, '/TX');
    result = result.replace(/\/ＴX/gi, '/TX');

    result = result.replace(/\／tx/gi, '/TX');
    result = result.replace(/\／Tx/gi, '/TX');
    result = result.replace(/\／tX/gi, '/TX');
    result = result.replace(/\／TX/gi, '/TX');

    result = result.replace(/\/tｘ/gi, '/TX');
    result = result.replace(/\/Tｘ/gi, '/TX');
    result = result.replace(/\/tＸ/gi, '/TX');
    result = result.replace(/\/TＸ/gi, '/TX');

    result = result.replace(/\／ｔx/gi, '/TX');
    result = result.replace(/\／Ｔx/gi, '/TX');
    result = result.replace(/\／ｔX/gi, '/TX');
    result = result.replace(/\／ＴX/gi, '/TX');

    result = result.replace(/\／tｘ/gi, '/TX');
    result = result.replace(/\／Tｘ/gi, '/TX');
    result = result.replace(/\／tＸ/gi, '/TX');
    result = result.replace(/\／TＸ/gi, '/TX');

    result = result.replace(/\/ｔｘ/gi, '/TX');
    result = result.replace(/\/Ｔｘ/gi, '/TX');
    result = result.replace(/\/ｔＸ/gi, '/TX');
    result = result.replace(/\/ＴＸ/gi, '/TX');

    result = result.replace(/\／ｔｘ/gi, '/TX');
    result = result.replace(/\／Ｔｘ/gi, '/TX');
    result = result.replace(/\／ｔＸ/gi, '/TX');
    result = result.replace(/\／ＴＸ/gi, '/TX');

    result = result.replace(/\／cp/gi, '/CP');
    result = result.replace(/\／Cp/gi, '/CP');
    result = result.replace(/\／cP/gi, '/CP');
    result = result.replace(/\／CP/gi, '/CP');

    result = result.replace(/\／ｃp/gi, '/CP');
    result = result.replace(/\／Ｃp/gi, '/CP');
    result = result.replace(/\／ｃP/gi, '/CP');
    result = result.replace(/\／ＣP/gi, '/CP');

    result = result.replace(/\／ｃｐ/gi, '/CP');
    result = result.replace(/\／Ｃｐ/gi, '/CP');
    result = result.replace(/\／ｃＰ/gi, '/CP');
    result = result.replace(/\／ＣＰ/gi, '/CP');

    result = result.replace(/\/ｃｐ/gi, '/CP');
    result = result.replace(/\/Ｃｐ/gi, '/CP');
    result = result.replace(/\/ｃＰ/gi, '/CP');
    result = result.replace(/\/ＣＰ/gi, '/CP');

    result = result.replace(/\/cｐ/gi, '/CP');
    result = result.replace(/\/Cｐ/gi, '/CP');
    result = result.replace(/\/cＰ/gi, '/CP');
    result = result.replace(/\/CＰ/gi, '/CP');

    result = result.replace(/\/ｃp/gi, '/CP');
    result = result.replace(/\/Ｃp/gi, '/CP');
    result = result.replace(/\/ｃP/gi, '/CP');
    result = result.replace(/\/ＣP/gi, '/CP');

    result = result.replace(/\／cｐ/gi, '/CP');
    result = result.replace(/\／Cｐ/gi, '/CP');
    result = result.replace(/\／cＰ/gi, '/CP');
    result = result.replace(/\／CＰ/gi, '/CP');

    result = result.replace(/\/cp/gi, '/CP');
    result = result.replace(/\/Cp/gi, '/CP');
    result = result.replace(/\/cP/gi, '/CP');
    result = result.replace(/\/CP/gi, '/CP');

    result = result.replace(/\／fi/gi, '/FI');
    result = result.replace(/\／Fi/gi, '/FI');
    result = result.replace(/\／fI/gi, '/FI');
    result = result.replace(/\／FI/gi, '/FI');

    result = result.replace(/\／ｆi/gi, '/FI');
    result = result.replace(/\／Ｆi/gi, '/FI');
    result = result.replace(/\／ｆI/gi, '/FI');
    result = result.replace(/\／ＦI/gi, '/FI');

    result = result.replace(/\／ｆｉ/gi, '/FI');
    result = result.replace(/\／Ｆｉ/gi, '/FI');
    result = result.replace(/\／ｆＩ/gi, '/FI');
    result = result.replace(/\／ＦＩ/gi, '/FI');

    result = result.replace(/\/ｆｉ/gi, '/FI');
    result = result.replace(/\/Ｆｉ/gi, '/FI');
    result = result.replace(/\/ｆＩ/gi, '/FI');
    result = result.replace(/\/ＦＩ/gi, '/FI');

    result = result.replace(/\/fｉ/gi, '/FI');
    result = result.replace(/\/Fｉ/gi, '/FI');
    result = result.replace(/\/fＩ/gi, '/FI');
    result = result.replace(/\/FＩ/gi, '/FI');

    result = result.replace(/\/ｆi/gi, '/FI');
    result = result.replace(/\/Ｆi/gi, '/FI');
    result = result.replace(/\/ｆI/gi, '/FI');
    result = result.replace(/\/ＦI/gi, '/FI');

    result = result.replace(/\／fｉ/gi, '/FI');
    result = result.replace(/\／Fｉ/gi, '/FI');
    result = result.replace(/\／fＩ/gi, '/FI');
    result = result.replace(/\／FＩ/gi, '/FI');

    result = result.replace(/\/fi/gi, '/FI');
    result = result.replace(/\/Fi/gi, '/FI');
    result = result.replace(/\/fI/gi, '/FI');
    result = result.replace(/\/FI/gi, '/FI');

    return result;
  }

  /**
   * 文字列から全角・半角スペースを削除
   * @param {string} text
   * @returns {string}
   */
  removeSpaces(text) {
    if (!text) return '';
    return text.replace(/[\s　]/g, '');
  }
}

// グローバル公開
window.ExpressionNormalizer = ExpressionNormalizer;

