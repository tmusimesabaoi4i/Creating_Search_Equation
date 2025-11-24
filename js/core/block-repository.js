// js/core/block-repository.js
// Block の集中管理（追加・検索・削除・永続化）

// ブロック種別ごとの上限数
const MAX_BLOCKS_PER_KIND = 30;

class BlockRepository {
  constructor() {
    /** @type {Map<string, Block>} */
    this.blocks = new Map();
    /** @type {Map<string, string>} token -> WordBlock.id */
    this.tokenToWordId = new Map();
    /** @type {Map<string, string>} token -> ClassBlock.id */
    this.tokenToClassId = new Map();
    /** @type {Map<string, string>} expressionKey -> WordBlock.id */
    this.expressionKeyToWordId = new Map();
    /** @type {Map<string, string>} expressionKey -> ClassBlock.id */
    this.expressionKeyToClassId = new Map();

    this.counters = {
      WB: 0,
      CB: 0,
      EB: 0
    };
  }

  /**
   * Block を登録
   * @param {Block} block
   */
  add(block) {
    if (!block || !block.id) return;
    this.blocks.set(block.id, block);

    if (block.kind === 'WB') {
      if (block.token) {
        this.tokenToWordId.set(block.token, block.id);
      }
      if (block.expressionKey) {
        this.expressionKeyToWordId.set(block.expressionKey, block.id);
      }
    } else if (block.kind === 'CB') {
      if (block.token) {
        this.tokenToClassId.set(block.token, block.id);
      }
      if (block.expressionKey) {
        this.expressionKeyToClassId.set(block.expressionKey, block.id);
      }
    }
  }

  /**
   * 既存なら上書き、なければ追加
   * @param {Block} block
   */
  upsert(block) {
    this.add(block);
  }

  /**
   * id に対応する Block を削除
   * @param {string} id
   */
  remove(id) {
    const blk = this.blocks.get(id);
    if (!blk) return;

    if (blk.kind === 'WB') {
      if (blk.token) {
        this.tokenToWordId.delete(blk.token);
      }
      if (blk.expressionKey) {
        this.expressionKeyToWordId.delete(blk.expressionKey);
      }
    } else if (blk.kind === 'CB') {
      if (blk.token) {
        this.tokenToClassId.delete(blk.token);
      }
      if (blk.expressionKey) {
        this.expressionKeyToClassId.delete(blk.expressionKey);
      }
    }

    this.blocks.delete(id);
  }

  /**
   * id 取得
   * @param {string} id
   * @returns {Block|undefined}
   */
  get(id) {
    return this.blocks.get(id);
  }

  /**
   * 全 Block を配列で取得
   * @returns {Block[]}
   */
  getAll() {
    return Array.from(this.blocks.values());
  }

  /**
   * WordBlock のみ取得
   * @returns {WordBlock[]}
   */
  getAllWords() {
    return this.getAll().filter((b) => b.kind === 'WB');
  }

  /**
   * ClassBlock のみ取得
   * @returns {ClassBlock[]}
   */
  getAllClasses() {
    return this.getAll().filter((b) => b.kind === 'CB');
  }

  /**
   * EquationBlock のみ取得
   * @returns {EquationBlock[]}
   */
  getAllEquations() {
    return this.getAll().filter((b) => b.kind === 'EB');
  }

  /**
   * 指定種別のブロック数をカウント
   * @param {"WB"|"CB"|"EB"} kind
   * @returns {number}
   */
  countBlocksByKind(kind) {
    return this.getAll().filter((b) => b.kind === kind).length;
  }

  /**
   * 指定種別のブロックを追加可能かチェック（上限30個）
   * @param {"WB"|"CB"|"EB"} kind
   * @returns {boolean}
   */
  canAddBlock(kind) {
    return this.countBlocksByKind(kind) < MAX_BLOCKS_PER_KIND;
  }

  /**
   * 指定種別のブロック追加可否をチェックし、不可の場合はエラーメッセージを返す
   * @param {"WB"|"CB"|"EB"} kind
   * @returns {{ok: boolean, message?: string}}
   */
  checkBlockLimit(kind) {
    if (this.canAddBlock(kind)) {
      return { ok: true };
    }
    
    const kindName = kind === 'WB' ? 'Wordブロック' 
                   : kind === 'CB' ? '分類ブロック' 
                   : '式ブロック';
    
    return {
      ok: false,
      message: `${kindName}は${MAX_BLOCKS_PER_KIND}個までしか作成できません。既存のブロックを削除してから再度お試しください。`
    };
  }

  /**
   * token に紐づく WordBlock を返す
   * @param {string} token
   * @returns {WordBlock|undefined}
   */
  findWordBlockByToken(token) {
    const id = this.tokenToWordId.get(token);
    if (!id) return undefined;
    const blk = this.blocks.get(id);
    if (blk && blk.kind === 'WB') {
      return blk;
    }
    return undefined;
  }

  /**
   * expressionKey に紐づく WordBlock を返す
   * @param {string} expressionKey
   * @returns {WordBlock|undefined}
   */
  findWordBlockByExpressionKey(expressionKey) {
    if (!expressionKey) return undefined;
    const id = this.expressionKeyToWordId.get(expressionKey);
    if (!id) return undefined;
    const blk = this.blocks.get(id);
    if (blk && blk.kind === 'WB') {
      return blk;
    }
    return undefined;
  }

  /**
   * expressionKey に紐づく ClassBlock を返す
   * @param {string} expressionKey
   * @returns {ClassBlock|undefined}
   */
  findClassBlockByExpressionKey(expressionKey) {
    if (!expressionKey) return undefined;
    const id = this.expressionKeyToClassId.get(expressionKey);
    if (!id) return undefined;
    const blk = this.blocks.get(id);
    if (blk && blk.kind === 'CB') {
      return blk;
    }
    return undefined;
  }

  /**
   * token に紐づく ClassBlock を返す
   * @param {string} token
   * @returns {ClassBlock|undefined}
   */
  findClassBlockByToken(token) {
    const id = this.tokenToClassId.get(token);
    if (!id) return undefined;
    const blk = this.blocks.get(id);
    if (blk && blk.kind === 'CB') {
      return blk;
    }
    return undefined;
  }

  /**
   * 単語 token から WordBlock を生成し登録
   * @param {string} token
   * @param {string} [initialQueryText]
   * @returns {WordBlock}
   */
  createWordBlockFromToken(token, initialQueryText) {
    const label = token;
    const id = this.findOrCreateIdForLabel(label, 'WB');
    let wb = this.get(id);
    if (wb && wb.kind === 'WB') {
      wb.token = token;
      wb.updateQueryText(initialQueryText || `(${token})`);
      this.upsert(wb);
      return wb;
    }
    wb = new WordBlock(id, label, token, initialQueryText || `(${token})`);
    this.upsert(wb);
    return wb;
  }

  /**
   * expressionKey から WordBlock を生成し登録（新API）
   * 
   * @param {string} expressionKey - 正規化済みキー
   * @param {string[]} variants - バリエーション配列
   * @param {string} displayLabel - UI表示用ラベル
   * @param {string} randomToken - ランダム生成されたトークン
   * @returns {WordBlock}
   */
  createWordBlockFromExpression(expressionKey, variants, displayLabel, randomToken) {
    if (!expressionKey) {
      throw new Error('expressionKey is required');
    }

    // 既存チェック
    let existing = this.findWordBlockByExpressionKey(expressionKey);
    if (existing) {
      return existing;
    }

    // 上限チェック
    const limitCheck = this.checkBlockLimit('WB');
    if (!limitCheck.ok) {
      throw new Error(limitCheck.message);
    }

    // 新規ID発番
    const id = this.nextId('WB');

    // queryText: variantsを+で結合し、括弧で囲む
    const queryText = variants && variants.length > 0
      ? `(${variants.join('+')})`
      : `(${expressionKey})`;

    // label: variants[0]を優先、なければdisplayLabel、それもなければexpressionKey
    const label = (variants && variants.length > 0) 
      ? variants[0] 
      : (displayLabel || expressionKey);

    // WordBlock作成
    const wb = new WordBlock(
      id,
      label,
      randomToken || id, // tokenはランダムIDまたはid
      queryText,
      expressionKey,
      variants,
      displayLabel
    );

    this.upsert(wb);
    return wb;
  }

  /**
   * ラベル＋種別で既存 Block を探し、あればその id、なければ新規採番 id を返す
   * @param {string} label
   * @param {"WB"|"CB"|"EB"} kind
   * @returns {string}
   */
  findOrCreateIdForLabel(label, kind) {
    const all = this.getAll();
    const found = all.find(
      (b) => b.kind === kind && b.label === label
    );
    if (found) return found.id;
    return this.nextId(kind);
  }

  /**
   * 種別ごと ID 採番
   * @param {"WB"|"CB"|"EB"} kind
   * @returns {string}
   */
  nextId(kind) {
    if (!this.counters.hasOwnProperty(kind)) {
      this.counters[kind] = 0;
    }
    this.counters[kind] += 1;
    const num = this.counters[kind];
    const padded = String(num).padStart(4, '0');
    return `${kind}-${padded}`;
  }

  /**
   * リポジトリ全体を JSON 化
   * @returns {any}
   */
  toJSON() {
    return {
      counters: this.counters,
      blocks: this.getAll().map((b) => b.toJSON())
    };
  }

  /**
   * JSON からリポジトリ内容を復元
   * @param {any} json
   */
  loadFromJSON(json) {
    this.blocks.clear();
    this.tokenToWordId.clear();
    this.tokenToClassId.clear();
    this.expressionKeyToWordId.clear();
    this.expressionKeyToClassId.clear();
    this.counters = {
      WB: 0,
      CB: 0,
      EB: 0
    };

    if (json && typeof json.counters === 'object') {
      this.counters = Object.assign(this.counters, json.counters);
    }

    if (Array.isArray(json.blocks)) {
      json.blocks.forEach((obj) => {
        const blk = Block.fromJSON(obj);
        this.add(blk);
      });
    }
  }
}

// グローバル公開
window.BlockRepository = BlockRepository;