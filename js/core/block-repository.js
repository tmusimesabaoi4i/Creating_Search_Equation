// js/core/block-repository.js
// Block の集中管理（追加・検索・削除・永続化）

import {
  Block,
  WordBlock,
  ClassBlock,
  EquationBlock,
} from './block.js';

export class BlockRepository {
  constructor() {
    /** @type {Map<string, Block>} */
    this.blocks = new Map();
    /** @type {Map<string, string>} token -> WordBlock.id */
    this.tokenToWordId = new Map();
    /** @type {{ WB: number; CB: number; EB: number }} */
    this.counters = { WB: 0, CB: 0, EB: 0 };
  }

  /**
   * Block を登録し、必要であれば token マップも更新する。
   * @param {Block} block
   */
  add(block) {
    this.blocks.set(block.id, block);
    if (block instanceof WordBlock && block.token) {
      this.tokenToWordId.set(block.token, block.id);
    }
  }

  /**
   * 同一 ID のブロックがあれば上書き、なければ追加する。
   * @param {Block} block
   */
  upsert(block) {
    this.add(block);
  }

  /**
   * ID に対応する Block を削除し、WordBlock であれば token マップも削除する。
   * @param {string} id
   */
  remove(id) {
    const block = this.blocks.get(id);
    if (block instanceof WordBlock && block.token) {
      this.tokenToWordId.delete(block.token);
    }
    this.blocks.delete(id);
  }

  /**
   * 指定 ID の Block を返す。
   * @param {string} id
   * @returns {Block|undefined}
   */
  get(id) {
    return this.blocks.get(id);
  }

  /**
   * 登録されている全 Block を配列で返す。
   * @returns {Block[]}
   */
  getAll() {
    return Array.from(this.blocks.values());
  }

  /**
   * kind が 'WB' の Block だけを配列で返す。
   * @returns {WordBlock[]}
   */
  getAllWords() {
    return Array.from(this.blocks.values()).filter(
      (b) => b instanceof WordBlock || b.kind === 'WB'
    );
  }

  /**
   * kind が 'EB' の Block だけを配列で返す。
   * @returns {EquationBlock[]}
   */
  getAllEquations() {
    return Array.from(this.blocks.values()).filter(
      (b) => b instanceof EquationBlock || b.kind === 'EB'
    );
  }

  /**
   * token に紐づく WordBlock を返す。
   * @param {string} token
   * @returns {WordBlock|undefined}
   */
  findWordBlockByToken(token) {
    const id = this.tokenToWordId.get(token);
    if (!id) return undefined;
    const block = /** @type {WordBlock} */ (this.blocks.get(id));
    if (block && (block instanceof WordBlock || block.kind === 'WB')) {
      return block;
    }
    return undefined;
  }

  /**
   * token から新しい WordBlock を作成し登録して返す。
   * queryText はデフォルトで "(" + token + ")" とする。
   * @param {string} token
   * @param {string} [initialQueryText]
   * @returns {WordBlock}
   */
  createWordBlockFromToken(token, initialQueryText) {
    const id = this.nextId('WB');
    const label = token;
    const queryText =
      typeof initialQueryText === 'string' ? initialQueryText : `(${token})`;
    const wb = new WordBlock(id, label, token, queryText);
    this.add(wb);
    return wb;
  }

  /**
   * 同じラベル・種別の Block があればその ID を返し、なければ新規 ID を採番して返す。
   * @param {string} label
   * @param {"WB"|"CB"|"EB"} kind
   * @returns {string}
   */
  findOrCreateIdForLabel(label, kind) {
    for (const block of this.blocks.values()) {
      if (block.kind === kind && block.label === label) {
        return block.id;
      }
    }
    return this.nextId(kind);
  }

  /**
   * リポジトリ全体を永続化用 JSON に変換する。
   * @returns {{ blocks: any[]; counters: {WB:number;CB:number;EB:number} }}
   */
  toJSON() {
    const blocksJson = Array.from(this.blocks.values()).map((b) => b.toJSON());
    return {
      blocks: blocksJson,
      counters: { ...this.counters },
    };
  }

  /**
   * JSON からリポジトリ内容を復元する。
   * @param {{ blocks?: any[]; counters?: {WB?:number;CB?:number;EB?:number} }} json
   */
  loadFromJSON(json) {
    this.blocks.clear();
    this.tokenToWordId.clear();

    if (json && Array.isArray(json.blocks)) {
      for (const obj of json.blocks) {
        const block = Block.fromJSON(obj);
        this.add(block);
      }
    }

    const counters = (json && json.counters) || {};
    this.counters = {
      WB: counters.WB || 0,
      CB: counters.CB || 0,
      EB: counters.EB || 0,
    };
  }

  /**
   * 種別ごとのカウンタをインクリメントして ID を生成する。
   * 例: "WB-0001"
   * @param {"WB"|"CB"|"EB"} kind
   * @returns {string}
   */
  nextId(kind) {
    if (!this.counters[kind] && this.counters[kind] !== 0) {
      this.counters[kind] = 0;
    }
    const n = ++this.counters[kind];
    const suffix = String(n).padStart(4, '0');
    return `${kind}-${suffix}`;
  }
}