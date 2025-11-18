// js/core/token-generator.js
// tokenclass 親クラス + Word / Classification 用の派生クラス

class TokenGenerator {
  /**
   * @param {number} length - token の長さ
   * @param {string} charset - 使用する文字集合
   */
  constructor(length = 5, charset) {
    this.length = length;
    this.charset =
      charset ||
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  }

  /**
   * ランダム文字列を生成（重複チェックなし）
   * @returns {string}
   * @protected
   */
  _randomString() {
    let s = '';
    const n = this.length;
    const chars = this.charset;
    const max = chars.length;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * max);
      s += chars.charAt(idx);
    }
    return s;
  }

  /**
   * 外部から渡された checkExist(token) が true を返さない token を生成する
   * @param {(token: string) => boolean} checkExist
   * @returns {string}
   * @protected
   */
  _generateUnique(checkExist) {
    // 衝突確率は非常に低いが念のためループで回避
    for (;;) {
      const t = this._randomString();
      if (!checkExist || !checkExist(t)) {
        return t;
      }
    }
  }
}

/**
 * WordBlock 用 token 生成クラス
 */
class WordTokenGenerator extends TokenGenerator {
  /**
   * @param {BlockRepository} repo
   * @param {number} length
   */
  constructor(repo, length = 5) {
    super(length);
    this.repo = repo;
  }

  /**
   * WordBlock の token を重複なしで生成
   * @returns {string}
   */
  generate() {
    const repo = this.repo;
    return this._generateUnique((token) => {
      if (!repo || typeof repo.findWordBlockByToken !== 'function') {
        return false;
      }
      return !!repo.findWordBlockByToken(token);
    });
  }
}

/**
 * ClassBlock 用 token 生成クラス
 */
class ClassTokenGenerator extends TokenGenerator {
  /**
   * @param {BlockRepository} repo
   * @param {number} length
   */
  constructor(repo, length = 5) {
    // 分類 token は大文字＋数字などにしても良いが、ここでは共通 charset を使用
    super(length);
    this.repo = repo;
  }

  /**
   * ClassBlock の token を重複なしで生成
   * @returns {string}
   */
  generate() {
    const repo = this.repo;
    return this._generateUnique((token) => {
      if (!repo || typeof repo.findClassBlockByToken !== 'function') {
        return false;
      }
      return !!repo.findClassBlockByToken(token);
    });
  }
}

// グローバル公開
window.TokenGenerator = TokenGenerator;
window.WordTokenGenerator = WordTokenGenerator;
window.ClassTokenGenerator = ClassTokenGenerator;
