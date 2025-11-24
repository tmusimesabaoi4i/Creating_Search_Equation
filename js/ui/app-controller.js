// js/ui/app-controller.js
// UI とドメイン層をつなぐアプリケーションコントローラ（グローバル版）

class AppController {
  constructor() {
    this.repo = new BlockRepository();
    this.ctx = new RenderContext(this.repo);
    this.exprService = new ExpressionService(this.repo);
    this.view = new ViewRenderer(this.repo, this.ctx);
    this.proxPanel = null;

    // 新機能: 式の正規化とブロック変換
    this.exprNormalizer = new ExpressionNormalizer();
    this.wordNormalizer = new WordNormalizer();
    this.blockConverter = new ExpressionBlockConverter(this.exprService, this.repo, this.ctx);

    this.elements = {
      exprInput: null,
      parseButton: null,
      wordList: null,
      equationList: null,
      errorBox: null,
      builderRenewButton: null
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
    this.elements.builderRenewButton = qs('#btn-builder-renew');

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

    if (this.elements.builderRenewButton) {
      this.elements.builderRenewButton.addEventListener('click', function () {
        this.onBuilderRenewClick();
      });
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
   * ブロックビルダー: 入力 → 単語/分類/ブロック生成
   */
  onParseClick() {
    const text = (this.elements.exprInput && this.elements.exprInput.value) || '';
    const kind = this._getCurrentBuilderKind(); // "word" | "class" | "block"

    if (kind === 'block') {
      // 新機能1: ブロックモード - 検索式からブロック生成
      const result = this.blockConverter.generateBlocksFromEquationInput(text);
      this.showErrors(result.errors || []);

      // 成功していれば入力をクリア
      if (!result.errors || result.errors.length === 0) {
        if (this.elements.exprInput) {
          this.elements.exprInput.value = '';
        }
      }

      this.renderAll();
      if (this.proxPanel) {
        this.proxPanel.onRepositoryUpdated();
      }
    } else {
      // 従来の Word/Class ブロック生成
      const result = this.exprService.parseInputLines(text, kind);
      this.showErrors(result.errors || []);

      // 成功していれば入力をクリア
      if (!result.errors || result.errors.length === 0) {
        if (this.elements.exprInput) {
          this.elements.exprInput.value = '';
        }
      }

      this.renderAll();
      if (this.proxPanel) {
        this.proxPanel.onRepositoryUpdated();
      }
    }
  }

  /**
   * 式ビルダーの renew ボタン押下時:
   * - Word / Class ブロックの現在の定義に基づいて
   *   式ブロックの表示を再評価（renderQuery 再呼び出し）する。
   * - AST は WordTokenNode / BlockRefNode を参照しているので、
   *   WordBlock / ClassBlock の queryText を変更しても、再描画だけで反映される。
   */
  onBuilderRenewClick = function () {
    // 必要に応じてエラー表示をクリア
    this.showErrors([]);

    // Word 定義を変えたあとでも、AST は token / blockId ベースで保持されているので
    // renderQuery(ctx) を呼び直せば新しい検索式になります。
    // ⇒ ここでは単純に Equation リストを再描画すればよい。
    this.renderEquationsOnly();

    // ついでに Word 側も見た目を同期しておく
    this.renderWordsOnly();

    // 右下トーストで通知（以前 copy ボタン用に showToast を定義していればそれを再利用）
    if (typeof this.showToast === 'function') {
      this.showToast('Word / Class の変更内容を式ブロックに再反映しました');
    }
  };

  /**
   * ラジオボタンからブロック種別を取得
   * @returns {"word"|"class"|"block"}
   * @private
   */
  _getCurrentBuilderKind() {
    const radios = document.querySelectorAll('input[name="builder-kind"]');
    for (const radio of radios) {
      if (radio.checked) {
        if (radio.value === 'class') return 'class';
        if (radio.value === 'block') return 'block';
        return 'word';
      }
    }
    return 'word';
  }

  /**
   * Word / Class リストクリック
   */
  onWordListClick(event) {
    const target = event.target;
    const cardEl = target.closest('.block-card');
    if (!cardEl) return;

    const id = cardEl.dataset.id;
    const block = this.repo.get(id);
    if (!block) return;

    // 機能1: この Word から「式入力/定義」行を生成して上部 textarea に出す
    if (target.closest('.js-word-generate-eq')) {
      event.stopPropagation();
      if (block.kind === 'WB') {
        this.handleGenerateEquationLineFromWord(block);
      }
      return;
    }

    // 機能2: 削除（Word / Class 共通）
    if (target.closest('.js-delete-block')) {
      event.stopPropagation();
      this.handleDeleteBlock(block);
      return;
    }

    // 新機能1により「編集」機能は削除済み

    // それ以外のクリック → ビルダー用の素材選択トグル
    this.toggleBuilderSelection(id);
  }

  /**
   * Word リスト ダブルクリック → token を textarea に挿入
   */
  onWordListDblClick(event) {
    const target = event.target;
    const cardEl = target.closest('.block-card');
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

    // 新機能1により「式からブロック生成」機能は削除済み

    // ★ 検索式コピー
    if (target.classList.contains('js-copy-equation-query')) {
      this.handleCopyEquationQuery(id);
      return;
    }

    // 削除
    if (target.closest('.js-delete-block')) {
      event.stopPropagation();
      this.handleDeleteBlock(block);
      return;
    }

    // 新機能1により「編集」機能は削除済み

    // それ以外のクリック → 素材選択トグル & 論理式を textarea に表示（参照用）
    this.toggleBuilderSelection(id);
    if (this.elements.exprInput && block.renderLogical) {
      this.elements.exprInput.value = block.renderLogical(this.ctx);
    }
  }

  /**
   * 式ブロックの検索式をクリップボードへコピー
   * @param {string} ebId
   */
  handleCopyEquationQuery(ebId) {
    const eb = this.repo.get(ebId);
    if (!eb || eb.kind !== 'EB') return;
    const rawText = eb.renderQuery(this.ctx) || '';
    if (!rawText) {
      this.showToast('検索式が空です。', 'error');
      return;
    }

    // 新機能2: 内部整形を適用（記号半角化、スペース削除）
    const normalizedText = this.exprNormalizer.normalizeInline(rawText);

    this._copyTextToClipboard(normalizedText)
      .then(() => {
        this.showToast('検索式をクリップボードにコピーしました。', 'success');
      })
      .catch((err) => {
        console.error('Clipboard copy failed:', err);
        this.showToast('クリップボードへのコピーに失敗しました。', 'error');
      });
  }

  /**
   * クリップボードコピー共通処理
   * @param {string} text
   * @returns {Promise<void>}
   * @private
   */
  _copyTextToClipboard(text) {
    // navigator.clipboard が使える場合
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    // フォールバック: 一時 textarea + execCommand('copy')
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!successful) {
          reject(new Error('execCommand("copy") が失敗しました'));
        } else {
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * 右下にトーストメッセージを表示する
   * @param {string} message
   * @param {"success"|"error"|"info"} [kind="info"]
   */
  showToast(message, kind = 'info') {
    const container = this._ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = 'toast';
    if (kind === 'success') {
      toast.classList.add('toast--success');
    } else if (kind === 'error') {
      toast.classList.add('toast--error');
    }
    toast.textContent = message;

    container.appendChild(toast);

    // アニメーション開始のために次フレームで is-visible 付与
    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    const visibleDuration = 2000; // 2秒表示
    setTimeout(() => {
      toast.classList.remove('is-visible');
      // フェードアウト後に DOM から削除
      const removeDelay = 250;
      setTimeout(() => {
        if (toast.parentNode === container) {
          container.removeChild(toast);
        }
      }, removeDelay);
    }, visibleDuration);
  }

  /**
   * トースト用コンテナを確保する（なければ作る）
   * @returns {HTMLElement}
   * @private
   */
  _ensureToastContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
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

  setBuilderSelectionIds(ids) {
    this.state.builderSelectionIds = Array.from(ids);
    this.updateSelectionHighlight();
    if (this.proxPanel) {
      this.proxPanel.setSelectionIds(this.state.builderSelectionIds);
    }
  }

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

  toggleBuilderSelection(id) {
    const idx = this.state.builderSelectionIds.indexOf(id);
    if (idx >= 0) {
      this.state.builderSelectionIds.splice(idx, 1);
    } else {
      // 選択上限を30個に拡大（積演算で複数選択可能にするため）
      // 近傍演算の個数制限はProximityPanel側で判定
      if (this.state.builderSelectionIds.length >= 30) {
        if (this.proxPanel) {
          this.proxPanel.showMessage('素材は最大30個までです。', 'error');
        }
        return;
      }
      this.state.builderSelectionIds.push(id);
    }
    this.setBuilderSelectionIds(this.state.builderSelectionIds);
  }

  /**
   * Word ブロックから「式入力/定義」行を生成して textarea に出す
   *
   * NB という WordBlock で queryText = "(基地局+NB+eNB)" なら
   * → "NB = 基地局+NB+eNB" を追加
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
    if (body.startsWith('(') && body.endsWith(')')) {
      body = body.slice(1, -1);
    }

    const line = `${name} = ${body}`;
    const current = textarea.value;

    if (!current.trim()) {
      textarea.value = line;
    } else {
      textarea.value = current.replace(/\s*$/, '') + '\n' + line;
    }

    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
  }

  handleDeleteBlock(block) {
    if (!block) return;
    const ok = window.confirm(
      `ブロックを削除しますか？\n${block.kind}: ${block.label || block.id}`
    );
    if (!ok) return;

    this.repo.remove(block.id);

    const idx = this.state.builderSelectionIds.indexOf(block.id);
    if (idx >= 0) {
      this.state.builderSelectionIds.splice(idx, 1);
    }
    this.setBuilderSelectionIds(this.state.builderSelectionIds);

    this.renderAll();
    if (this.proxPanel) this.proxPanel.onRepositoryUpdated();
  }

  openEditModal(block) {
    if (!block) return;
    if (block.kind === 'WB') {
      this.openEditModalForWord(block);
    } else if (block.kind === 'EB') {
      this.openEditModalForEquation(block);
    } else {
      showToast('この種別のブロックは編集未対応です: ' + block.kind);
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
