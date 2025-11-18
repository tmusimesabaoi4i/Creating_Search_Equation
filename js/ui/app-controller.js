// js/ui/app-controller.js
// UI とドメイン層をつなぐアプリケーションコントローラ（グローバル版）

class AppController {
  constructor() {
    this.repo = new BlockRepository();
    this.ctx = new RenderContext(this.repo);
    this.exprService = new ExpressionService(this.repo);
    this.view = new ViewRenderer(this.repo, this.ctx);
    this.proxPanel = null;

    this.elements = {
      exprInput: null,
      parseButton: null,
      wordList: null,
      equationList: null,
      errorBox: null
    };

    // ビルダー用の選択 ID（Word / Equation 共通、最大3）
    this.state = {
      builderSelectionIds: []
    };
  }

  init() {
    this.elements.exprInput = qs('#expr-input');
    this.elements.parseButton = qs('#btn-parse');
    this.elements.wordList = qs('#word-list');
    this.elements.equationList = qs('#equation-list');
    this.elements.errorBox = qs('#input-errors');

    this.proxPanel = new ProximityPanel(this);
    this.proxPanel.init();

    this.bindEvents();
    this.renderAll();
  }

  bindEvents() {
    if (this.elements.parseButton) {
      this.elements.parseButton.addEventListener('click', () =>
        this.onParseClick()
      );
    }

    if (this.elements.wordList) {
      this.elements.wordList.addEventListener('click', (e) =>
        this.onWordListClick(e)
      );
      this.elements.wordList.addEventListener('dblclick', (e) =>
        this.onWordListDblClick(e)
      );
    }

    if (this.elements.equationList) {
      this.elements.equationList.addEventListener('click', (e) =>
        this.onEquationListClick(e)
      );
    }
  }

  /**
   * textarea → parse → ブロック反映
   */
  onParseClick() {
    const text = (this.elements.exprInput && this.elements.exprInput.value) || '';
    const result = this.exprService.parseInputLines(text);
    this.showErrors(result.errors || []);
    this.renderAll();
    if (this.proxPanel) {
      this.proxPanel.onRepositoryUpdated();
    }
  }

  /**
   * Word リストクリック
   */
  onWordListClick(event) {
    const target = event.target;
    const cardEl = target.closest('.block-card--word');
    if (!cardEl) return;
    const id = cardEl.dataset.id;
    const block = this.repo.get(id);
    if (!block) return;

    // 機能1: この Word から「式入力/定義」行を生成して上部 textarea に出す
    if (target.closest('.js-word-generate-eq')) {
      event.stopPropagation();
      this.handleGenerateEquationLineFromWord(block);
      return;
    }

    // 機能2: 削除
    if (target.closest('.js-delete-block')) {
      event.stopPropagation();
      this.handleDeleteBlock(block);
      return;
    }

    // 機能3: 編集
    if (target.closest('.js-edit-block')) {
      event.stopPropagation();
      this.openEditModal(block);
      return;
    }

    // それ以外のクリック → ビルダー用の素材選択トグル
    this.toggleBuilderSelection(id);
  }

  /**
   * Word リスト ダブルクリック → token を textarea に挿入
   */
  onWordListDblClick(event) {
    const target = event.target;
    const cardEl = target.closest('.block-card--word');
    if (!cardEl) return;
    const id = cardEl.dataset.id;
    const block = this.repo.get(id);
    if (!block || block.kind !== 'WB') return;
    this.insertTokenAtCursor(block.token);
  }

  /**
   * Equation リストクリック
   */
  onEquationListClick(event) {
    const target = event.target;
    const cardEl = target.closest('.block-card--equation');
    if (!cardEl) return;
    const id = cardEl.dataset.id;
    const block = this.repo.get(id);
    if (!block) return;

    // 語再生成
    if (target.closest('.js-decompose-words')) {
      event.stopPropagation();
      this.exprService.regenerateWordsFromEquation(id);
      this.renderWordsOnly();
      if (this.proxPanel) this.proxPanel.onRepositoryUpdated();
      return;
    }

    // 削除
    if (target.closest('.js-delete-block')) {
      event.stopPropagation();
      this.handleDeleteBlock(block);
      return;
    }

    // 編集
    if (target.closest('.js-edit-block')) {
      event.stopPropagation();
      this.openEditModal(block);
      return;
    }

    // それ以外のクリック → 素材選択トグル & 論理式を textarea に表示（参照用）
    this.toggleBuilderSelection(id);
    if (this.elements.exprInput && block.renderLogical) {
      this.elements.exprInput.value = block.renderLogical(this.ctx);
    }
  }

  /**
   * パースエラー表示
   * @param {string[]} errors
   */
  showErrors(errors) {
    const box = this.elements.errorBox;
    if (!box) return;

    if (!errors || errors.length === 0) {
      box.textContent = '';
      box.classList.remove('is-visible');
      return;
    }
    box.textContent = errors.join('\n');
    box.classList.add('is-visible');
  }

  /**
   * 全リストを再描画
   */
  renderAll() {
    this.renderWordsOnly();
    this.renderEquationsOnly();
    this.updateSelectionHighlight();
  }

  renderWordsOnly() {
    if (!this.elements.wordList) return;
    this.view.renderWords(this.elements.wordList);
    this.updateSelectionHighlight();
  }

  renderEquationsOnly() {
    if (!this.elements.equationList) return;
    this.view.renderEquations(this.elements.equationList);
    this.updateSelectionHighlight();
  }

  /**
   * ビルダー選択 ID をセット（ProximityPanel からも呼ばれる）
   * @param {string[]} ids
   */
  setBuilderSelectionIds(ids) {
    this.state.builderSelectionIds = Array.from(ids);
    this.updateSelectionHighlight();
    if (this.proxPanel) {
      this.proxPanel.setSelectionIds(this.state.builderSelectionIds);
    }
  }

  /**
   * builderSelectionIds に基づき .is-selected を付与
   */
  updateSelectionHighlight() {
    const allCards = qsa('.block-card');
    const selectedSet = new Set(this.state.builderSelectionIds);
    for (const card of allCards) {
      const id = card.dataset.id;
      if (selectedSet.has(id)) {
        card.classList.add('is-selected');
      } else {
        card.classList.remove('is-selected');
      }
    }
  }

  /**
   * クリックされた block.id の選択をトグル
   * @param {string} id
   */
  toggleBuilderSelection(id) {
    const idx = this.state.builderSelectionIds.indexOf(id);
    if (idx >= 0) {
      this.state.builderSelectionIds.splice(idx, 1);
    } else {
      if (this.state.builderSelectionIds.length >= 3) {
        if (this.proxPanel) {
          this.proxPanel.showMessage('素材は最大3個までです。', 'error');
        }
        return;
      }
      this.state.builderSelectionIds.push(id);
    }
    this.setBuilderSelectionIds(this.state.builderSelectionIds);
  }

  /**
   * 機能1: Word ブロックから「式入力/定義」行を生成して textarea に出す
   *
   * 仕様:
   *   NB という WordBlock で queryText = "(基地局+NB+eNB)" なら
   *   → 上部 textarea に "NB = 基地局+NB+eNB" を生成して表示
   *
   * @param {WordBlock} wordBlock
   */
  handleGenerateEquationLineFromWord(wordBlock) {
    if (!wordBlock || wordBlock.kind !== 'WB') return;
    const textarea = this.elements.exprInput;
    if (!textarea) return;

    const name = wordBlock.token || wordBlock.label || wordBlock.id;

    let body = wordBlock.queryText || '';
    body = body.trim();
    // ( ... ) で囲まれていれば外側のカッコを剥がして元の入力っぽく戻す
    if (body.startsWith('(') && body.endsWith(')')) {
      body = body.slice(1, -1);
    }

    const line = `${name} = ${body}`;

    // 既存内容があれば改行追加、なければそのまま
    const current = textarea.value;
    if (!current.trim()) {
      textarea.value = line;
    } else {
      textarea.value = current.replace(/\s*$/, '') + '\n' + line;
    }

    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
  }

  /**
   * 機能2: ブロック削除（Word / Equation 共通）
   * @param {Block} block
   */
  handleDeleteBlock(block) {
    if (!block) return;
    const ok = window.confirm(
      `ブロックを削除しますか？\n${block.kind}: ${block.label || block.id}`
    );
    if (!ok) return;

    this.repo.remove(block.id);

    // 選択状態からも除外
    const idx = this.state.builderSelectionIds.indexOf(block.id);
    if (idx >= 0) {
      this.state.builderSelectionIds.splice(idx, 1);
    }
    this.setBuilderSelectionIds(this.state.builderSelectionIds);

    this.renderAll();
    if (this.proxPanel) this.proxPanel.onRepositoryUpdated();
  }

  /**
   * 機能3: 編集モーダル起動（Word / Equation）
   * @param {Block} block
   */
  openEditModal(block) {
    if (!block) return;
    if (block.kind === 'WB') {
      this.openEditModalForWord(block);
    } else if (block.kind === 'EB') {
      this.openEditModalForEquation(block);
    } else {
      alert('この種別のブロックは編集未対応です: ' + block.kind);
    }
  }

  /**
   * モーダル骨格生成
   */
  createModalSkeleton(titleText) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'modal__header';

    const title = document.createElement('div');
    title.className = 'modal__title';
    title.textContent = titleText;

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'btn-small modal__close';
    btnClose.textContent = '×';

    header.appendChild(title);
    header.appendChild(btnClose);

    const body = document.createElement('div');
    body.className = 'modal__body';

    const footer = document.createElement('div');
    footer.className = 'modal__footer';

    const error = document.createElement('div');
    error.className = 'modal__error';

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(error);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => {
      document.body.removeChild(overlay);
    };

    btnClose.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    return { overlay, modal, header, body, footer, error, close };
  }

  /**
   * WordBlock 編集モーダル
   * @param {WordBlock} word
   */
  openEditModalForWord(word) {
    const { body, footer, error, close } = this.createModalSkeleton(
      'Word ブロックを編集'
    );

    // ラベル
    const fieldLabel = document.createElement('div');
    fieldLabel.className = 'modal__field';
    const labelLabel = document.createElement('label');
    labelLabel.className = 'modal__label';
    labelLabel.textContent = 'ラベル';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'modal__input';
    labelInput.value = word.label || '';
    fieldLabel.appendChild(labelLabel);
    fieldLabel.appendChild(labelInput);

    // token は編集すると参照が壊れるので読み取り専用表示のみ
    const fieldToken = document.createElement('div');
    fieldToken.className = 'modal__field';
    const tokenLabel = document.createElement('label');
    tokenLabel.className = 'modal__label';
    tokenLabel.textContent = 'token (参照用)';
    const tokenView = document.createElement('div');
    tokenView.className = 'modal__readonly';
    tokenView.textContent = word.token;
    fieldToken.appendChild(tokenLabel);
    fieldToken.appendChild(tokenView);

    // queryText（検索式）: ユーザが編集するのはここ
    const fieldQuery = document.createElement('div');
    fieldQuery.className = 'modal__field';
    const queryLabel = document.createElement('label');
    queryLabel.className = 'modal__label';
    queryLabel.textContent = '検索式 (queryText)';
    const queryInput = document.createElement('textarea');
    queryInput.className = 'modal__textarea';
    queryInput.value = word.queryText || '';
    fieldQuery.appendChild(queryLabel);
    fieldQuery.appendChild(queryInput);

    body.appendChild(fieldLabel);
    body.appendChild(fieldToken);
    body.appendChild(fieldQuery);

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn';
    btnCancel.textContent = 'キャンセル';

    const btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'btn';
    btnSave.textContent = '保存';

    footer.appendChild(btnCancel);
    footer.appendChild(btnSave);

    btnCancel.addEventListener('click', () => close());
    btnSave.addEventListener('click', () => {
      const newLabel = labelInput.value.trim();
      const newQuery = queryInput.value.trim();
      if (!newLabel) {
        error.textContent = 'ラベルは必須です。';
        return;
      }
      word.label = newLabel;
      word.updateQueryText(newQuery);
      this.repo.upsert(word);
      this.renderWordsOnly();
      if (this.proxPanel) this.proxPanel.onRepositoryUpdated();
      close();
    });
  }

  /**
   * EquationBlock 編集モーダル
   *
   * 仕様:
   *  - 論理式: 内部表現なので参照用に表示のみ（編集不可）
   *  - 検索式: AST を Word 展開した本体（/TX, [] なし）を編集対象とする
   *
   * @param {EquationBlock} eb
   */
  openEditModalForEquation(eb) {
    const { body, footer, error, close } = this.createModalSkeleton(
      '式ブロックを編集'
    );

    // ラベル
    const fieldLabel = document.createElement('div');
    fieldLabel.className = 'modal__field';
    const labelLabel = document.createElement('label');
    labelLabel.className = 'modal__label';
    labelLabel.textContent = 'ラベル';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'modal__input';
    labelInput.value = eb.label || '';
    fieldLabel.appendChild(labelLabel);
    fieldLabel.appendChild(labelInput);

    // 論理式 (参照用・編集不可)
    const fieldLogical = document.createElement('div');
    fieldLogical.className = 'modal__field';
    const logicalLabel = document.createElement('label');
    logicalLabel.className = 'modal__label';
    logicalLabel.textContent = '論理式 (内部表現 / 参照用)';
    const logicalView = document.createElement('div');
    logicalView.className = 'modal__readonly';
    logicalView.textContent = eb.renderLogical(this.ctx);
    fieldLogical.appendChild(logicalLabel);
    fieldLogical.appendChild(logicalView);

    // 検索式 (編集可) : ASTから WordBlock を展開した本体 (/TX は付けない)
    const fieldExpr = document.createElement('div');
    fieldExpr.className = 'modal__field';
    const exprLabel = document.createElement('label');
    exprLabel.className = 'modal__label';
    exprLabel.textContent = '検索式 (編集可 / /TX は自動付与)';
    const exprInput = document.createElement('textarea');
    exprInput.className = 'modal__textarea';
    let bodyText = '';
    if (eb.root && typeof eb.root.renderQuery === 'function') {
      bodyText = eb.root.renderQuery(this.ctx) || '';
    }
    exprInput.value = bodyText;
    fieldExpr.appendChild(exprLabel);
    fieldExpr.appendChild(exprInput);

    body.appendChild(fieldLabel);
    body.appendChild(fieldLogical);
    body.appendChild(fieldExpr);

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn';
    btnCancel.textContent = 'キャンセル';

    const btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'btn';
    btnSave.textContent = '保存';

    footer.appendChild(btnCancel);
    footer.appendChild(btnSave);

    btnCancel.addEventListener('click', () => close());
    btnSave.addEventListener('click', () => {
      const newLabel = labelInput.value.trim();
      const exprText = exprInput.value.trim();
      if (!exprText) {
        error.textContent = '検索式が空です。';
        return;
      }
      try {
        // 検索式（内部表現）は /TX や [] を含まない前提でパースする
        const lexer = new Lexer(exprText);
        const parser = new Parser(lexer);
        const exprNode = parser.parseExpr(); // 式部だけ解析

        eb.setRoot(exprNode);
        if (newLabel) eb.label = newLabel;
        this.repo.upsert(eb);
        this.renderEquationsOnly();
        if (this.proxPanel) this.proxPanel.onRepositoryUpdated();
        close();
      } catch (e) {
        error.textContent =
          '検索式の解析に失敗しました (/TX や [] は不要です): ' +
          (e.message || e);
      }
    });
  }

  /**
   * textarea のカーソル位置に token を挿入
   * @param {string} token
   */
  insertTokenAtCursor(token) {
    const textarea = this.elements.exprInput;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    const before = value.slice(0, start);
    const after = value.slice(end);

    const insertText = token;
    textarea.value = before + insertText + after;

    const newPos = before.length + insertText.length;
    textarea.selectionStart = textarea.selectionEnd = newPos;
    textarea.focus();
  }
}

// グローバル公開
window.AppController = AppController;
