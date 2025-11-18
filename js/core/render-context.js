// js/core/render-context.js
// AST が Block や token をクエリ文字列に解決するためのコンテキスト。

// import {
//   Block,
//   WordBlock,
//   ClassBlock,
//   EquationBlock,
// } from './block.js';
// import { BlockRepository } from './block-repository.js';

/** export class */ class RenderContext {
  /**
   * @param {BlockRepository} blockRepository
   */
  constructor(blockRepository) {
    /** @type {BlockRepository} */
    this.repo = blockRepository;
  }

  /**
   * ID から Block を取得する。
   * @param {string} blockId
   * @returns {Block|undefined}
   */
  resolveBlock(blockId) {
    if (!this.repo) return undefined;
    return this.repo.get(blockId);
  }

  /**
   * WordBlock, ClassBlock, EquationBlock を適切な形式で検索式に変換する。
   *
   * - WordBlock:
   *     queryText (例: "(基地局+NB+eNB)")
   *
   * - ClassBlock:
   *     (A+B+...)/CP+(A+B+...)/FI
   *   （codes: ["H04W16/24","H04W36/00"] → "(H04W16/24+H04W36/00)/CP+(H04W16/24+H04W36/00)/FI"）
   *
   * - EquationBlock:
   *     EquationBlock.renderQuery(ctx) の結果（/TX や [] 付き）
   *
   * @param {string|Block} blockOrId
   * @returns {string}
   */
  renderBlockQuery(blockOrId) {
    if (!this.repo) return '';

    /** @type {Block|undefined} */
    let block = undefined;
    if (typeof blockOrId === 'string') {
      block = this.repo.get(blockOrId);
    } else {
      block = blockOrId;
    }

    if (!block) return '';

    if (block instanceof WordBlock || block.kind === 'WB') {
      return block.queryText || '';
    }

    if (block instanceof ClassBlock || block.kind === 'CB') {
      const codes = Array.isArray(block.codes) ? block.codes : [];
      if (!codes.length) return '';
      const joined = codes.join('+'); // "H04W16/24+H04W36/00"
      // 分類は常に /CP と /FI の両方で検索
      return `(${joined})/CP+(${joined})/FI`;
    }

    if (block instanceof EquationBlock || block.kind === 'EB') {
      // EquationBlock の renderQuery は /TX や [] を含む完成形を返す
      return block.renderQuery(this);
    }

    // 未知種別
    return '';
  }

  /**
   * token に対応する WordBlock を返す。
   * @param {string} token
   * @returns {WordBlock|undefined}
   */
  getWordForToken(token) {
    if (!this.repo) return undefined;
    if (typeof this.repo.findWordBlockByToken === 'function') {
      return this.repo.findWordBlockByToken(token);
    }

    // フォールバック: 線形探索
    const words = this.repo.getAllWords();
    return words.find((wb) => wb.token === token);
  }
}

window.RenderContext = RenderContext;