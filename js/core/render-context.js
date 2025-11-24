// js/core/render-context.js
// AST が Block や token をクエリ文字列に解決するためのコンテキスト。

class RenderContext {
  /**
   * @param {BlockRepository} blockRepository
   */
  constructor(blockRepository) {
    this.repo = blockRepository;
  }

  /**
   * ID から Block を取得
   * @param {string} blockId
   * @returns {Block|undefined}
   */
  resolveBlock(blockId) {
    if (!this.repo) return undefined;
    return this.repo.get(blockId);
  }

  /**
   * Block → 検索式文字列
   *   - WordBlock  → queryText そのもの（/TX なし）
   *   - ClassBlock → searchExpr（[(F)/CP+(F)/FI] の形）
   *   - EquationBlock → EquationBlock.renderQuery(ctx)
   *
   * @param {string|Block} blockOrId
   * @returns {string}
   */
  renderBlockQuery(blockOrId) {
    let block = blockOrId;
    if (typeof blockOrId === 'string') {
      block = this.resolveBlock(blockOrId);
    }
    if (!block) return '';

    if (block.kind === 'WB') {
      const wb = block;
      return wb.queryText || wb.token || '';
    }

    if (block.kind === 'CB') {
      const cb = block;
      if (cb.searchExpr) return cb.searchExpr;
      // フォールバック（searchExprが空の古いデータ用）
      if (cb.codes && cb.codes.length) {
        const inner = cb.codes.join('+');
        // 要素数に応じて括弧を付ける（ClassBlock._recalcExpressionsと同じルール）
        const classificationExpr = cb.codes.length >= 2 ? `(${inner})` : inner;
        return `[${classificationExpr}]`;
      }
      return '';
    }

    if (block.kind === 'EB') {
      const eb = block;
      return eb.renderQuery(this);
    }

    return '';
  }

  /**
   * token → WordBlock を取得
   * @param {string} token
   * @returns {WordBlock|undefined}
   */
  getWordForToken(token) {
    if (!this.repo) return undefined;
    return this.repo.findWordBlockByToken(token);
  }
}

// グローバル公開
window.RenderContext = RenderContext;
