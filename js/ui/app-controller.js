// js/ui/app-controller.js
// UI（DOM）とドメイン層（BlockRepository / ExpressionService）をつなぐコントローラ。

import { qs, qsa } from './dom-utils.js';
import { BlockRepository } from '../core/block-repository.js';
import { RenderContext } from '../core/render-context.js';
import { ExpressionService } from '../services/expression-service.js';
import { ViewRenderer } from './view-renderer.js';
import { ProximityPanel } from './proximity-panel.js';

import {
  EquationBlock,
  WordBlock
} from '../core/block.js';

import {
  BlockRefNode,
  LogicalNode,
  ProximityNode,
  SimultaneousProximityNode
} from '../core/expr-node.js';

export class AppController {
  constructor() {
    // --- ドメイン層の準備 ---
    /** @type {BlockRepository} */
    this.repo = new BlockRepository();

    /** @type {RenderContext} */
    this.ctx = new RenderContext(this.repo);

    /** @type {ExpressionService} */
    this.exprService = new ExpressionService(this.repo);

    /** @type {ViewRenderer} */
    this.view = new ViewRenderer(this.repo, this.ctx);

    /** @type {ProximityPanel} */
    this.proximityPanel = null;

    // --- DOM 要素参照 ---
    this.elements = {
      exprInput: null,
      parseButton: null,
      wordList: null,
      equationList: null,
      errorBox: null,
      btnGenerateExprFromWords: null,
      builderPanel: null
    };

    // --- UI 状態 ---
    this.state = {
      // 素材として選択されているブロック ID の順序
      selectedSourceIds: /** @type {string[]} */ ([]),
      // 各 ID の種別（"WB"|"EB"）
      selectedSourceKinds: /** @type {Map<string, string>} */ (new Map())
    };

    // this を束縛したハンドラ
    this.onParseClick = this.onParseClick.bind(this);
    this.onEquationListClick = this.onEquationListClick.bind(this);
    this.onWordListClick = this.onWordListClick.bind(this);
    this.onWordListDblClick = this.onWordListDblClick.bind(this);

    // ProximityPanel からのコールバック用
    this.handleBuildL1 = this.handleBuildL1.bind(this);
    this.handleBuildProx2 = this.handleBuildProx2.bind(this);
    this.handleBuildProx3 = this.handleBuildProx3.bind(this);
    this.handleBuildOr = this.handleBuildOr.bind(this);
    this.handleBuildAnd = this.handleBuildAnd.bind(this);
    this.handleSelectionOrderChanged =
      this.handleSelectionOrderChanged.bind(this);
    this.handleSelectionItemRemoved =
      this.handleSelectionItemRemoved.bind(this);
  }

  /**
   * DOM 要素を取得し、イベントバインドと初期描画を行う。
   */
  init() {
    // --- DOM 要素取得 ---
    this.elements.exprInput = qs('#expr-input');
    this.elements.parseButton = qs('#btn-parse');
    this.elements.wordList = qs('#word-list');
    this.elements.equationList = qs('#equation-list');
    this.elements.errorBox = qs('#input-errors');
    this.elements.btnGenerateExprFromWords = qs(
      '#btn-generate-expr-from-words'
    );
    this.elements.builderPanel = qs('#builder-panel');

    if (
      !this.elements.exprInput ||
      !this.elements.parseButton ||
      !this.elements.wordList ||
      !this.elements.equationList ||
      !this.elements.errorBox ||
      !this.elements.builderPanel
    ) {
      console.error('必要な DOM 要素の一部が見つかりません。');
      return;
    }

    // ProximityPanel の初期化
    this.proximityPanel = new ProximityPanel(this.elements.builderPanel);
    this.proximityPanel.bindHandlers({
      onBuildL1: this.handleBuildL1,
      onBuildProx2: this.handleBuildProx2,
      onBuildProx3: this.handleBuildProx3,
      onBuildOr: this.handleBuildOr,
      onBuildAnd: this.handleBuildAnd,
      onOrderChanged: this.handleSelectionOrderChanged,
      onItemRemoved: this.handleSelectionItemRemoved
    });

    // --- イベントバインド ---
    this.bindEvents();

    // --- 初期描画 ---
    this.renderAll();
    this.updateBuilderButtonsState();
  }

  /**
   * ボタン・リストへのイベントリスナーを登録する。
   * @private
   */
  bindEvents() {
    this.elements.parseButton.addEventListener('click', this.onParseClick);

    // Equation リスト: クリックで選択 / Word 再分割ボタン処理
    this.elements.equationList.addEventListener(
      'click',
      this.onEquationListClick
    );

    // Word リスト: クリックで選択トグル、ダブルクリックで token 挿入
    this.elements.wordList.addEventListener('click', this.onWordListClick);
    this.elements.wordList.addEventListener(
      'dblclick',
      this.onWordListDblClick
    );
  }

  // =========================================================
  // イベントハンドラ
  // =========================================================

  /**
   * 「解析してブロックに反映」クリック時。
   */
  onParseClick() {
    const text = this.elements.exprInput.value || '';
    const result = this.exprService.parseInputLines(text);

    this.renderAll();

    this.showErrors(result.errors);
    // 定義が変わったので選択状態はリセット
    this.state.selectedSourceIds = [];
    this.state.selectedSourceKinds.clear();
    this.updateSelectionUi();
  }

  /**
   * Equation カードのクリック（選択・Word再分割）を処理する。
   * @param {MouseEvent} event
   */
  onEquationListClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);

    // Word 再生成ボタンが押された場合
    if (target.classList.contains('js-decompose-words')) {
      const card = target.closest('.block-card');
      if (!card) return;
      const ebId = card.dataset.id;
      if (!ebId) return;

      this.exprService.regenerateWordsFromEquation(ebId);
      this.renderWordsOnly();
      // selection は維持
      this.updateSelectionUi();
      return;
    }

    // カード本体のクリックで素材選択トグル
    const card = target.closest('.block-card');
    if (!card || !card.dataset.id) return;
    const ebId = card.dataset.id;

    this.toggleSelectSource(ebId, 'EB');
    this.updateSelectionUi();

    // 選択された Equation の論理式を textarea にロード
    const block = this.repo.get(ebId);
    if (block && block instanceof EquationBlock) {
      const logical = block.renderLogical(this.ctx);
      this.elements.exprInput.value = logical;
    }
  }

  /**
   * Word カードのクリックによる素材選択トグル。
   * @param {MouseEvent} event
   */
  onWordListClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const card = target.closest('.block-card');
    if (!card || !card.dataset.id) return;
    const id = card.dataset.id;

    this.toggleSelectSource(id, 'WB');
    this.updateSelectionUi();
  }

  /**
   * Word カードのダブルクリックで、その token を textarea のカーソル位置に挿入する。
   * @param {MouseEvent} event
   */
  onWordListDblClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const card = target.closest('.block-card');
    if (!card || !card.dataset.id) return;
    const id = card.dataset.id;

    const block = this.repo.get(id);
    if (!block || !(block instanceof WordBlock)) return;

    this.insertTokenAtCursor(block.token || block.label || '');
  }

  // =========================================================
  // ProximityPanel からのコールバック
  // =========================================================

  /**
   * 1要素式生成。
   * @param {string[]} orderIds
   * @param {{mode: "n"|"c", k: number}} opts
   */
  handleBuildL1(orderIds, opts) {
    if (!orderIds || orderIds.length !== 1) {
      this.proximityPanel.showMessage(
        '1要素式には素材がちょうど 1 個必要です。',
        'error'
      );
      return;
    }
    const id = orderIds[0];

    try {
      const expr = this._buildExprFromSourceId(id);
      const label = 'L1式 ' + id;
      const ebId = this.repo.findOrCreateIdForLabel(label, 'EB');
      const eb = new EquationBlock(ebId, label, expr);
      this.repo.upsert(eb);

      this.renderEquationsOnly();
      this.updateSelectionUi();
      this.proximityPanel.showMessage('1要素式を作成しました。', 'info');
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      this.proximityPanel.showMessage(
        '1要素式の作成に失敗しました: ' + msg,
        'error'
      );
    }
  }

  /**
   * 2近傍式生成。
   * @param {string[]} orderIds
   * @param {{mode: "n"|"c", k: number}} opts
   */
  handleBuildProx2(orderIds, opts) {
    if (!orderIds || orderIds.length !== 2) {
      this.proximityPanel.showMessage(
        '2近傍式には素材がちょうど 2 個必要です。',
        'error'
      );
      return;
    }

    try {
      const left = this._buildExprFromSourceId(orderIds[0]);
      const right = this._buildExprFromSourceId(orderIds[1]);
      const mode = opts.mode === 'c' ? 'NNc' : 'NNn';
      const k = opts.k;

      const proxNode = new ProximityNode(mode, k, left, right);

      const label =
        'Prox2 ' + orderIds[0] + ' ' + mode + '(' + k + ') ' + orderIds[1];
      const ebId = this.repo.findOrCreateIdForLabel(label, 'EB');
      const eb = new EquationBlock(ebId, label, proxNode);
      this.repo.upsert(eb);

      this.renderEquationsOnly();
      this.updateSelectionUi();
      this.proximityPanel.showMessage('2近傍式を作成しました。', 'info');
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      this.proximityPanel.showMessage(
        '2近傍式の作成に失敗しました: ' + msg,
        'error'
      );
    }
  }

  /**
   * 3近傍式生成（mode は常に NNn）。
   * @param {string[]} orderIds
   * @param {{mode: "n"|"c", k: number}} opts
   */
  handleBuildProx3(orderIds, opts) {
    if (!orderIds || orderIds.length !== 3) {
      this.proximityPanel.showMessage(
        '3近傍式には素材がちょうど 3 個必要です。',
        'error'
      );
      return;
    }

    try {
      const exprs = orderIds.map((id) => this._buildExprFromSourceId(id));
      const k = opts.k; // mode は強制 NNn
      const proxNode = new SimultaneousProximityNode(k, exprs);

      const label =
        'Prox3 {' + orderIds.join(',') + '}, NNn(' + k + ')';
      const ebId = this.repo.findOrCreateIdForLabel(label, 'EB');
      const eb = new EquationBlock(ebId, label, proxNode);
      this.repo.upsert(eb);

      this.renderEquationsOnly();
      this.updateSelectionUi();
      this.proximityPanel.showMessage('3近傍式を作成しました。', 'info');
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      this.proximityPanel.showMessage(
        '3近傍式の作成に失敗しました: ' + msg,
        'error'
      );
    }
  }

  /**
   * OR 結合式生成（E1 + E2 (+ E3)）。
   * @param {string[]} orderIds
   */
  handleBuildOr(orderIds) {
    if (!orderIds || orderIds.length < 2) {
      this.proximityPanel.showMessage(
        'OR 結合には素材が 2 個以上必要です。',
        'error'
      );
      return;
    }

    try {
      const exprs = orderIds.map((id) => this._buildExprFromSourceId(id));
      const orNode = new LogicalNode('+', exprs);

      const label = 'OR {' + orderIds.join('+') + '}';
      const ebId = this.repo.findOrCreateIdForLabel(label, 'EB');
      const eb = new EquationBlock(ebId, label, orNode);
      this.repo.upsert(eb);

      this.renderEquationsOnly();
      this.updateSelectionUi();
      this.proximityPanel.showMessage('OR 結合式を作成しました。', 'info');
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      this.proximityPanel.showMessage(
        'OR 結合式の作成に失敗しました: ' + msg,
        'error'
      );
    }
  }

  /**
   * AND 結合式生成（E1 * E2 (* E3)）。
   * @param {string[]} orderIds
   */
  handleBuildAnd(orderIds) {
    if (!orderIds || orderIds.length < 2) {
      this.proximityPanel.showMessage(
        'AND 結合には素材が 2 個以上必要です。',
        'error'
      );
      return;
    }

    try {
      const exprs = orderIds.map((id) => this._buildExprFromSourceId(id));
      const andNode = new LogicalNode('*', exprs);

      const label = 'AND {' + orderIds.join('*') + '}';
      const ebId = this.repo.findOrCreateIdForLabel(label, 'EB');
      const eb = new EquationBlock(ebId, label, andNode);
      this.repo.upsert(eb);

      this.renderEquationsOnly();
      this.updateSelectionUi();
      this.proximityPanel.showMessage('AND 結合式を作成しました。', 'info');
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      this.proximityPanel.showMessage(
        'AND 結合式の作成に失敗しました: ' + msg,
        'error'
      );
    }
  }

  /**
   * ProximityPanel からの順序変更通知。
   * @param {string[]} orderIds
   */
  handleSelectionOrderChanged(orderIds) {
    // state の順序を置き換え
    this.state.selectedSourceIds = orderIds.slice();
    this.updateSelectionUi();
  }

  /**
   * ProximityPanel からの削除通知。
   * @param {string} id
   */
  handleSelectionItemRemoved(id) {
    const idx = this.state.selectedSourceIds.indexOf(id);
    if (idx >= 0) {
      this.state.selectedSourceIds.splice(idx, 1);
      this.state.selectedSourceKinds.delete(id);
      this.updateSelectionUi();
    }
  }

  // =========================================================
  // ユーティリティ / 選択管理
  // =========================================================

  /**
   * 素材選択トグル。
   * @param {string} id
   * @param {"WB"|"EB"} kind
   */
  toggleSelectSource(id, kind) {
    const ids = this.state.selectedSourceIds;
    const kinds = this.state.selectedSourceKinds;
    const idx = ids.indexOf(id);

    if (idx >= 0) {
      // 選択解除
      ids.splice(idx, 1);
      kinds.delete(id);
    } else {
      // 新規選択（最大 3 個）
      if (ids.length >= 3) {
        if (this.proximityPanel) {
          this.proximityPanel.showMessage(
            '素材は最大 3 個まで選択できます。',
            'info'
          );
        }
        return;
      }
      ids.push(id);
      kinds.set(id, kind);
    }
  }

  /**
   * exprInput の選択位置に token を挿入し、カーソルをその後ろに移動する。
   * @param {string} token
   */
  insertTokenAtCursor(token) {
    const textarea = this.elements.exprInput;
    textarea.focus();

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;

    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);

    const insertText = token;

    textarea.value = before + insertText + after;

    const newPos = start + insertText.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;
  }

  /**
   * エラー配列を結合して input-errors に表示する（なければクリア）。
   * @param {string[]} errors
   */
  showErrors(errors) {
    const box = this.elements.errorBox;
    if (!errors || errors.length === 0) {
      box.textContent = '';
      box.classList.remove('is-visible');
      return;
    }
    box.textContent = errors.join('\n');
    box.classList.add('is-visible');
  }

  /**
   * Word リストと Equation リストを両方再描画する。
   */
  renderAll() {
    this.renderWordsOnly();
    this.renderEquationsOnly();
  }

  /**
   * Word リストだけ描画。
   */
  renderWordsOnly() {
    this.view.renderWords(this.elements.wordList);
    this.applySelectionToCards();
  }

  /**
   * Equation リストだけ描画。
   */
  renderEquationsOnly() {
    this.view.renderEquations(this.elements.equationList);
    this.applySelectionToCards();
  }

  /**
   * state.selectedSourceIds に基づいて Word / Equation カードの .is-selected を付け直す。
   * さらに ProximityPanel 側の素材一覧・ボタン状態も更新。
   * @private
   */
  updateSelectionUi() {
    this.applySelectionToCards();

    // ProximityPanel に選択情報を渡す
    if (this.proximityPanel) {
      const summaries = this.state.selectedSourceIds.map((id) => {
        const block = this.repo.get(id);
        let kind = this.state.selectedSourceKinds.get(id);
        if (!kind && block && typeof block.kind === 'string') {
          kind = block.kind;
        }
        const label = block ? block.label || id : id;
        return {
          id: id,
          kind: /** @type {"WB"|"EB"} */ (kind === 'EB' ? 'EB' : 'WB'),
          label: label
        };
      });
      this.proximityPanel.updateSelection(summaries);
      this.updateBuilderButtonsState();
    }
  }

  /**
   * カード側の .is-selected を更新。
   * @private
   */
  applySelectionToCards() {
    const selected = new Set(this.state.selectedSourceIds);

    const wordCards = qsa('.block-card--word', this.elements.wordList);
    const eqCards = qsa(
      '.block-card--equation',
      this.elements.equationList
    );

    wordCards.forEach((card) => {
      const id = card.dataset.id;
      if (id && selected.has(id)) {
        card.classList.add('is-selected');
      } else {
        card.classList.remove('is-selected');
      }
    });

    eqCards.forEach((card) => {
      const id = card.dataset.id;
      if (id && selected.has(id)) {
        card.classList.add('is-selected');
      } else {
        card.classList.remove('is-selected');
      }
    });
  }

  /**
   * Builder の各ボタンの有効/無効を更新。
   * @private
   */
  updateBuilderButtonsState() {
    if (!this.proximityPanel) return;

    const n = this.state.selectedSourceIds.length;

    const flags = {
      l1: n === 1,
      prox2: n === 2,
      prox3: n === 3,
      or: n >= 2,
      and: n >= 2
    };

    this.proximityPanel.setOperationEnabled(flags);

    if (n === 3) {
      // 3近傍では c を禁止
      this.proximityPanel.setProximityModeOptions({
        allowC: false,
        allowN: true
      });
    } else if (n === 2) {
      // 2近傍では c / n 両方許可
      this.proximityPanel.setProximityModeOptions({
        allowC: true,
        allowN: true
      });
    } else {
      // それ以外はとりあえず両方許可
      this.proximityPanel.setProximityModeOptions({
        allowC: true,
        allowN: true
      });
    }
  }

  /**
   * 素材 ID から式の AST ノードを構築する。
   * - WordBlock → BlockRefNode(id)
   * - EquationBlock → root.clone()
   * @param {string} id
   * @returns {import('../core/expr-node.js').ExprNode}
   * @private
   */
  _buildExprFromSourceId(id) {
    const block = this.repo.get(id);
    if (!block) {
      throw new Error('ブロックが見つかりません: ' + id);
    }

    if (block.kind === 'WB' || block instanceof WordBlock) {
      // WordBlock は BlockRef として参照（レンダリング時に queryText 展開）
      return new BlockRefNode(block.id);
    }

    if (block.kind === 'EB' || block instanceof EquationBlock) {
      if (!block.root || typeof block.root.clone !== 'function') {
        throw new Error('式ブロックに有効な AST がありません: ' + id);
      }
      return block.root.clone();
    }

    throw new Error('この種別のブロックは素材として使用できません: ' + block.kind);
  }
}