// js/ui/view-renderer.js
// BlockRepository の内容を DOM に描画するだけのクラス

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
   * Word / Class ブロック一覧を描画
   * @param {HTMLElement} containerEl
   */
  renderWords(containerEl) {
    clearChildren(containerEl);

    const all =
      typeof this.repo.getAll === 'function' ? this.repo.getAll() : [];
    const words = all.filter((b) => b.kind === 'WB');
    const classes = all.filter((b) => b.kind === 'CB');

    words.forEach((wb) => {
      containerEl.appendChild(this._renderWordCard(wb));
    });

    classes.forEach((cb) => {
      containerEl.appendChild(this._renderClassCard(cb));
    });
  }

  /**
   * Equation ブロック一覧を描画
   * @param {HTMLElement} containerEl
   */
  renderEquations(containerEl) {
    clearChildren(containerEl);

    const all =
      typeof this.repo.getAll === 'function' ? this.repo.getAll() : [];
    const eqs = all.filter((b) => b.kind === 'EB');

    eqs.forEach((eb) => {
      containerEl.appendChild(this._renderEquationCard(eb));
    });
  }

  /**
   * WordBlock 用カード
   * @param {WordBlock} word
   * @returns {HTMLElement}
   * @private
   */
  _renderWordCard(word) {
    const card = create('div', 'block-card block-card--word');
    card.dataset.id = word.id;

    const header = create('div', 'block-card__title');
    const labelSpan = create('span', 'block-card__label');
    labelSpan.textContent = word.label || word.token || word.id;

    const pill = create('span', 'block-card__pill');
    pill.textContent = 'WORD';

    const btnRow = create('div', 'block-card__buttons');

    const btnGenerate = create(
      'button',
      'btn-small js-word-generate-eq'
    );
    btnGenerate.type = 'button';
    btnGenerate.textContent = '式入力へ';

    const btnEdit = create('button', 'btn-small js-edit-block');
    btnEdit.type = 'button';
    btnEdit.textContent = '編集';

    const btnDelete = create('button', 'btn-small js-delete-block');
    btnDelete.type = 'button';
    btnDelete.textContent = '削除';

    btnRow.appendChild(btnGenerate);
    btnRow.appendChild(btnEdit);
    btnRow.appendChild(btnDelete);

    header.appendChild(labelSpan);
    header.appendChild(pill);
    header.appendChild(btnRow);

    const body = create('div', 'block-card__body');
    const rowToken = create('div');
    rowToken.textContent = `token: ${word.token}`;

    const rowQuery = create('div');
    rowQuery.textContent = `検索式: ${word.queryText || ''}`;

    body.appendChild(rowToken);
    body.appendChild(rowQuery);

    card.appendChild(header);
    card.appendChild(body);

    return card;
  }

  /**
   * ClassBlock 用カード
   * @param {ClassBlock} cb
   * @returns {HTMLElement}
   * @private
   */
  _renderClassCard(cb) {
    const card = create('div', 'block-card block-card--word block-card--class');
    card.dataset.id = cb.id;

    const header = create('div', 'block-card__title');
    const labelSpan = create('span', 'block-card__label');
    labelSpan.textContent = cb.label || cb.id;

    const pill = create('span', 'block-card__pill block-card__pill--class');
    pill.textContent = 'CLASS';

    const btnRow = create('div', 'block-card__buttons');

    // ClassBlock は「式入力へ」ボタンは付けない（必要なら後で追加）
    const btnEdit = create('button', 'btn-small js-edit-block');
    btnEdit.type = 'button';
    btnEdit.textContent = '編集';

    const btnDelete = create('button', 'btn-small js-delete-block');
    btnDelete.type = 'button';
    btnDelete.textContent = '削除';

    btnRow.appendChild(btnEdit);
    btnRow.appendChild(btnDelete);

    header.appendChild(labelSpan);
    header.appendChild(pill);
    header.appendChild(btnRow);

    const body = create('div', 'block-card__body');
    const codes = Array.isArray(cb.codes) ? cb.codes.join(' + ') : '';

    const rowCodes = create('div');
    rowCodes.textContent = `分類コード: ${codes}`;

    // 検索式表示 (RenderContext に委譲)
    let queryStr = '';
    try {
      if (this.ctx && typeof this.ctx.renderBlockQuery === 'function') {
        queryStr = this.ctx.renderBlockQuery(cb);
      }
    } catch (e) {
      queryStr = '(render error)';
    }

    const rowQuery = create('div');
    rowQuery.textContent = `検索式: ${queryStr}`;

    body.appendChild(rowCodes);
    body.appendChild(rowQuery);

    card.appendChild(header);
    card.appendChild(body);

    return card;
  }

  /**
   * EquationBlock 用カード
   * @param {EquationBlock} eb
   * @returns {HTMLElement}
   * @private
   */
  _renderEquationCard(eb) {
    const card = create('div', 'block-card block-card--equation');
    card.dataset.id = eb.id;

    const header = create('div', 'block-card__title');
    const labelSpan = create('span', 'block-card__label');
    labelSpan.textContent = eb.label || eb.id;

    const btnRow = create('div', 'block-card__buttons');

    const btnDecompose = create(
      'button',
      'btn-small js-decompose-words'
    );
    btnDecompose.type = 'button';
    btnDecompose.textContent = '語再生成';

    const btnEdit = create('button', 'btn-small js-edit-block');
    btnEdit.type = 'button';
    btnEdit.textContent = '編集';

    // ★ 追加: 検索式コピー用ボタン
    const copyBtn = create('button', 'btn-small js-copy-equation-query');
    copyBtn.type = 'button';
    copyBtn.textContent = 'コピー';

    const btnDelete = create('button', 'btn-small js-delete-block');
    btnDelete.type = 'button';
    btnDelete.textContent = '削除';

    btnRow.appendChild(btnDecompose);
    btnRow.appendChild(btnEdit);
    btnRow.appendChild(copyBtn);    // ← ここでヘッダに追加
    btnRow.appendChild(btnDelete);

    header.appendChild(labelSpan);
    header.appendChild(btnRow);

    const body = create('div', 'block-card__body');

    const logicalDiv = create('div');
    logicalDiv.textContent = '論理式: ' + (eb.renderLogical(this.ctx) || '');

    const queryDiv = create('div');
    queryDiv.textContent = '検索式: ' + (eb.renderQuery(this.ctx) || '');

    body.appendChild(logicalDiv);
    body.appendChild(queryDiv);

    card.appendChild(header);
    card.appendChild(body);

    return card;
  }
}

// グローバル公開
window.ViewRenderer = ViewRenderer;
