// js/ui/view-renderer.js
// BlockRepository の状態を HTML DOM に描画する「描画専用」クラス。

import { create, clearChildren } from './dom-utils.js';
import { EquationBlock, WordBlock } from '../core/block.js';

/**
 * 描画専用クラス。
 * - repo: BlockRepository
 * - ctx : RenderContext
 */
export class ViewRenderer {
  /**
   * @param {import('../core/block-repository.js').BlockRepository} blockRepository
   * @param {import('../core/render-context.js').RenderContext} renderContext
   */
  constructor(blockRepository, renderContext) {
    this.repo = blockRepository;
    this.ctx = renderContext;
  }

  /**
   * WordBlock の一覧を Word カードとして containerEl に描画する。
   * @param {HTMLElement} containerEl - #word-list
   */
  renderWords(containerEl) {
    clearChildren(containerEl);

    /** @type {WordBlock[]} */
    const words = this.repo.getAllWords();

    // 表示順はラベル昇順
    words.sort((a, b) => (a.label || '').localeCompare(b.label || '', 'ja'));

    for (const wb of words) {
      const card = this._renderWordCard(wb);
      containerEl.appendChild(card);
    }
  }

  /**
   * EquationBlock の一覧を Equation カードとして containerEl に描画する。
   * @param {HTMLElement} containerEl - #equation-list
   */
  renderEquations(containerEl) {
    clearChildren(containerEl);

    /** @type {EquationBlock[]} */
    const equations = this.repo.getAllEquations();

    // 作成順（id など）で並べる（必要なら updatedAt ソートにしても良い）
    equations.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    for (const eb of equations) {
      const card = this._renderEquationCard(eb);
      containerEl.appendChild(card);
    }
  }

  // =======================================
  // プライベートヘルパ
  // =======================================

  /**
   * WordBlock → .block-card block-card--word な DOM を生成。
   * 例:
   *  [ラベル] token / queryText を表示
   * @param {WordBlock} word
   * @returns {HTMLElement}
   * @private
   */
  _renderWordCard(word) {
    const card = create('article', 'block-card block-card--word');
    card.dataset.id = word.id;
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const header = create('header', 'block-card__header');
    const title = create('div', 'block-card__title');
    title.textContent = word.label || word.token || word.id;
    header.appendChild(title);

    const meta = create('div', 'block-card__meta');
    meta.textContent = 'ID: ' + word.id;
    header.appendChild(meta);

    card.appendChild(header);

    const body = create('div', 'block-card__body');

    const lineToken = create('div', 'block-card__line');
    lineToken.innerHTML =
      '<span class="block-card__label">表示:</span> <code>' +
      escapeHtml(word.token || '') +
      '</code>';
    body.appendChild(lineToken);

    const lineQuery = create('div', 'block-card__line');
    lineQuery.innerHTML =
      '<span class="block-card__label">検索語:</span> <code>' +
      escapeHtml(word.queryText || '') +
      '</code>';
    body.appendChild(lineQuery);

    card.appendChild(body);

    return card;
  }

  /**
   * EquationBlock → .block-card block-card--equation な DOM を生成。
   * 中に
   *  - 論理式: eb.renderLogical(ctx)
   *  - 検索式: eb.renderQuery(ctx)
   * を表示。
   * ヘッダに Word 分解ボタン .btn-small.js-decompose-words を置く。
   *
   * @param {EquationBlock} eb
   * @returns {HTMLElement}
   * @private
   */
  _renderEquationCard(eb) {
    const card = create('article', 'block-card block-card--equation');
    card.dataset.id = eb.id;
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const header = create('header', 'block-card__header');

    const title = create('div', 'block-card__title');
    title.textContent = eb.label || eb.id;
    header.appendChild(title);

    const meta = create('div', 'block-card__meta');
    meta.textContent = 'ID: ' + eb.id;
    header.appendChild(meta);

    const btnDecompose = create(
      'button',
      'btn-small js-decompose-words'
    );
    btnDecompose.type = 'button';
    btnDecompose.textContent = '式から Word 再生成';
    header.appendChild(btnDecompose);

    card.appendChild(header);

    const body = create('div', 'block-card__body');

    // 論理式表示
    const logicalLine = create('div', 'block-card__line');
    const logicalText =
      typeof eb.renderLogical === 'function' ? eb.renderLogical(this.ctx) : '';
    logicalLine.innerHTML =
      '<span class="block-card__label">論理式:</span> <code>' +
      escapeHtml(logicalText) +
      '</code>';
    body.appendChild(logicalLine);

    // 検索式表示（/TX・[] を含む最終形）
    const queryLine = create('div', 'block-card__line');
    const queryText =
      typeof eb.renderQuery === 'function' ? eb.renderQuery(this.ctx) : '';
    queryLine.innerHTML =
      '<span class="block-card__label">検索式:</span> <code>' +
      escapeHtml(queryText) +
      '</code>';
    body.appendChild(queryLine);

    card.appendChild(body);

    return card;
  }
}

/**
 * 最低限の HTML エスケープ
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}