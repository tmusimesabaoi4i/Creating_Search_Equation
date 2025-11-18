// js/ui/view-renderer.js
// BlockRepository の内容を DOM に描画するだけの責務

// 前提: dom-utils.js で window.create / window.clearChildren が定義済み
// 前提: BlockRepository / RenderContext / WordBlock / EquationBlock 等は global

class ViewRenderer {
  /**
   * @param {BlockRepository} blockRepository
   * @param {RenderContext} renderContext
   */
  constructor(blockRepository, renderContext) {
    this.repo = blockRepository;
    this.ctx = renderContext;
  }

  /**
   * WordBlock 一覧を描画
   * @param {HTMLElement} containerEl
   */
  renderWords(containerEl) {
    clearChildren(containerEl);
    const words = this.repo.getAllWords();
    for (const wb of words) {
      containerEl.appendChild(this.renderWordCard(wb));
    }
  }

  /**
   * EquationBlock 一覧を描画
   * @param {HTMLElement} containerEl
   */
  renderEquations(containerEl) {
    clearChildren(containerEl);
    const equations = this.repo.getAllEquations();
    for (const eb of equations) {
      containerEl.appendChild(this.renderEquationCard(eb));
    }
  }

  /**
   * WordBlock → DOM カード
   * @param {WordBlock} word
   * @returns {HTMLElement}
   */
  renderWordCard(word) {
    const card = create('article', 'block-card block-card--word');
    card.dataset.id = word.id;

    const header = create('div', 'block-card__header');

    const title = create('div', 'block-card__title');
    title.textContent = word.label || word.token || word.id;

    const meta = create('div', 'block-card__meta');
    meta.textContent = word.id;

    const actions = create('div', 'block-card__actions');

    const btnToEq = create('button', 'btn-small js-word-generate-eq');
    btnToEq.type = 'button';
    btnToEq.textContent = '式生成';

    const btnEdit = create('button', 'btn-small js-edit-block');
    btnEdit.type = 'button';
    btnEdit.textContent = '編集';

    const btnDelete = create('button', 'btn-small js-delete-block');
    btnDelete.type = 'button';
    btnDelete.textContent = '削除';

    actions.appendChild(btnToEq);
    actions.appendChild(btnEdit);
    actions.appendChild(btnDelete);

    header.appendChild(title);
    header.appendChild(meta);
    header.appendChild(actions);

    const body = create('div', 'block-card__body');

    const line1 = create('div', 'block-card__line');
    const label1 = create('span', 'block-card__label');
    label1.textContent = '表示:';
    const value1 = create('span');
    value1.textContent = word.token || '(なし)';
    line1.appendChild(label1);
    line1.appendChild(value1);

    const line2 = create('div', 'block-card__line');
    const label2 = create('span', 'block-card__label');
    label2.textContent = '検索語:';
    const value2 = create('span');
    value2.textContent = word.queryText || '(未設定)';
    line2.appendChild(label2);
    line2.appendChild(value2);

    body.appendChild(line1);
    body.appendChild(line2);

    card.appendChild(header);
    card.appendChild(body);

    return card;
  }

  /**
   * EquationBlock → DOM カード
   * @param {EquationBlock} eb
   * @returns {HTMLElement}
   */
  renderEquationCard(eb) {
    const card = create('article', 'block-card block-card--equation');
    card.dataset.id = eb.id;

    const header = create('div', 'block-card__header');

    const title = create('div', 'block-card__title');
    title.textContent = eb.label || eb.id;

    const meta = create('div', 'block-card__meta');
    meta.textContent = eb.id;

    const actions = create('div', 'block-card__actions');

    const btnDecompose = create('button', 'btn-small js-decompose-words');
    btnDecompose.type = 'button';
    btnDecompose.textContent = '語再生成';

    const btnEdit = create('button', 'btn-small js-edit-block');
    btnEdit.type = 'button';
    btnEdit.textContent = '編集';

    const btnDelete = create('button', 'btn-small js-delete-block');
    btnDelete.type = 'button';
    btnDelete.textContent = '削除';

    actions.appendChild(btnDecompose);
    actions.appendChild(btnEdit);
    actions.appendChild(btnDelete);

    header.appendChild(title);
    header.appendChild(meta);
    header.appendChild(actions);

    const body = create('div', 'block-card__body');

    const logicalLine = create('div', 'block-card__line');
    const logicalLabel = create('span', 'block-card__label');
    logicalLabel.textContent = '論理式:';
    const logicalValue = create('span');
    logicalValue.textContent = eb.renderLogical(this.ctx);
    logicalLine.appendChild(logicalLabel);
    logicalLine.appendChild(logicalValue);

    const queryLine = create('div', 'block-card__line');
    const queryLabel = create('span', 'block-card__label');
    queryLabel.textContent = '検索式:';
    const queryValue = create('span');
    queryValue.textContent = eb.renderQuery(this.ctx);
    queryLine.appendChild(queryLabel);
    queryLine.appendChild(queryValue);

    body.appendChild(logicalLine);
    body.appendChild(queryLine);

    card.appendChild(header);
    card.appendChild(body);

    return card;
  }
}

// グローバル公開
window.ViewRenderer = ViewRenderer;
