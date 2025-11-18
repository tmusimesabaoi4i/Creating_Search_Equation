// js/parser/parser.js
// Lexer → AST + 行名 を生成する構文解析器
//
// - H04W16/24 のような分類コードは Lexer 側で IDENT("H04W16/24") になる前提。
// - /TX, /CP, /FI は FIELD トークンとして末尾に 1 個だけ現れる想定。
// - PROX ("10n","5c") は PROX トークンとして扱う。

// import { Lexer } from './lexer.js';
// import { TokenType } from './token.js';
// import {
//   WordTokenNode,
//   LogicalNode,
//   ProximityNode,
//   SimultaneousProximityNode,
// } from '../core/expr-node.js';

// export class Parser {
class Parser {
  /**
   * @param {Lexer} lexer
   */
  constructor(lexer) {
    this.lexer = lexer;

    /** @type {import('./token.js').Token[]} */
    this.tokens = [];
    let t;
    do {
      t = this.lexer.nextToken();
      this.tokens.push(t);
    } while (t.type !== TokenType.EOF);

    this.pos = 0;
    this.current = this.tokens[0];
  }

  /**
   * [IDENT '='] expr [field] 形式の 1 行を解析し、名前と式とフィールドを返す。
   * 例:
   *   NB = 基地局+NB+eNB
   *    → name="NB", expr=(...), field=undefined
   *
   *   CLS1 = H04W16/24+H04W36/00 /CP
   *    → name="CLS1", expr=(...), field="/CP"
   *
   *   NB*UE
   *    → name=undefined, expr=(NB*UE), field=undefined
   *
   * @returns {{ name?: string, expr: import('../core/expr-node.js').ExprNode, field?: string }}
   */
  parseLine() {
    let name;
    let field;

    // 先頭が IDENT '=' なら、行名とみなす
    if (
      this.current.type === TokenType.IDENT &&
      this.peek().type === TokenType.ASSIGN
    ) {
      name = this.current.text;
      this.advance(); // IDENT
      this.advance(); // '='
    }

    const expr = this.parseExpr();

    // expr の後に /TX,/FI,/CP 等のフィールドがあれば拾う
    if (this.current.type === TokenType.FIELD) {
      field = this.current.text; // "/TX", "/FI", "/CP"
      this.advance();
    }

    // 末尾は EOF であることを期待
    if (this.current.type !== TokenType.EOF) {
      throw new Error(
        `Unexpected token at end of line: ${this.current.text} (${this.current.type})`
      );
    }

    const result = { expr };
    if (name) result.name = name;
    if (field) result.field = field;
    return result;
  }

  // ==============================
  // 基本ヘルパ
  // ==============================

  /**
   * 現在トークンを消費して次へ進める。
   * @returns {import('./token.js').Token}
   */
  advance() {
    if (this.pos < this.tokens.length - 1) {
      this.pos += 1;
      this.current = this.tokens[this.pos];
    }
    return this.current;
  }

  /**
   * 現在位置から offset だけ先のトークンを返す（範囲外なら EOF）。
   * @param {number} [offset=1]
   * @returns {import('./token.js').Token}
   */
  peek(offset = 1) {
    const idx = this.pos + offset;
    if (idx < 0 || idx >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1];
    }
    return this.tokens[idx];
  }

  /**
   * current.type === expectedType かをチェックしつつトークンを前進する。
   * 違う場合はエラー。
   * @param {string} expectedType
   * @param {string} [errorMessage]
   * @returns {import('./token.js').Token}
   */
  consume(expectedType, errorMessage) {
    const tok = this.current;
    if (tok.type !== expectedType) {
      throw new Error(
        errorMessage ||
          `Expected token type ${expectedType} but got ${tok.type} (${tok.text})`
      );
    }
    this.advance();
    return tok;
  }

  /**
   * current.type === type かどうかを返す。
   * @param {string} type
   * @returns {boolean}
   */
  match(type) {
    return this.current.type === type;
  }

  // ==============================
  // 式パーサ
  // ==============================

  /**
   * OR, AND, 近傍を含む完全な式を解析。
   * @returns {import('../core/expr-node.js').ExprNode}
   */
  parseExpr() {
    return this.parseOrExpr();
  }

  /**
   * and_expr ('+' and_expr)* を解析。
   * @returns {import('../core/expr-node.js').ExprNode}
   */
  parseOrExpr() {
    let node = this.parseAndExpr();

    while (this.match(TokenType.PLUS)) {
      this.advance(); // '+'
      const right = this.parseAndExpr();
      // 左結合で LogicalNode を積み上げる
      node = new LogicalNode('+', [node, right]);
    }

    return node;
  }

  /**
   * prox_expr ('*' prox_expr)* を解析。
   * @returns {import('../core/expr-node.js').ExprNode}
   */
  parseAndExpr() {
    let node = this.parseProxExpr();

    while (this.match(TokenType.STAR)) {
      this.advance(); // '*'
      const right = this.parseProxExpr();
      node = new LogicalNode('*', [node, right]);
    }

    return node;
  }

  /**
   * 2 要素近傍 (A,10n,B) を優先的に判定して解析。
   * 3 要素同時近傍 ({A,B,C},10n) は primary 側で 1 トークン扱いにする。
   * 条件に合わなければ primary を返す。
   * @returns {import('../core/expr-node.js').ExprNode}
   */
  parseProxExpr() {
    // 左辺
    let left = this.parsePrimary();

    // パターン: "," PROX "," <primary>
    if (this.match(TokenType.COMMA) && this.peek().type === TokenType.PROX) {
      this.consume(TokenType.COMMA);
      const proxTok = this.consume(
        TokenType.PROX,
        'Expected proximity spec (e.g. 10n or 5c)'
      );
      this.consume(
        TokenType.COMMA,
        'Expected "," after proximity specifier (e.g. 10n,)'
      );
      const right = this.parsePrimary();

      const { mode, k } = this.parseProxSpec(proxTok.text);
      return new ProximityNode(mode, k, left, right);
    }

    return left;
  }

  /**
   * IDENT → WordTokenNode
   * ( expr ) → expr
   * {A,B,C},10n → SimultaneousProximityNode として扱う
   *
   * @returns {import('../core/expr-node.js').ExprNode}
   */
  parsePrimary() {
    const tok = this.current;

    // 3要素同時近傍 {A,B,C},10n を primary として扱う
    if (this.match(TokenType.LBRACE)) {
      return this.parseSimultaneousProximityPrimary();
    }

    if (this.match(TokenType.LPAREN)) {
      this.advance(); // '('
      const expr = this.parseExpr();
      this.consume(TokenType.RPAREN, 'Expected ")" to close "("');
      return expr;
    }

    if (this.match(TokenType.IDENT)) {
      this.advance();
      // ここでは IDENT はすべて WordTokenNode として扱い、
      // 後段のロジック（BlockRepository）で WordBlock / ClassBlock などに解決する。
      //
      // 例:
      //  - "NB"           → WordBlock token
      //  - "H04W16/24"    → ClassBlock.codes の要素
      return new WordTokenNode(tok.text);
    }

    if (this.match(TokenType.EOF) || this.match(TokenType.FIELD)) {
      throw new Error('Unexpected end of expression');
    }

    throw new Error(
      `Unexpected token in primary: ${tok.text} (${tok.type})`
    );
  }

  /**
   * {A,B,C},10n のような 3要素同時近傍を primary として解析する。
   * @returns {import('../core/expr-node.js').ExprNode}
   */
  parseSimultaneousProximityPrimary() {
    // 先頭 '{'
    this.consume(TokenType.LBRACE, 'Expected "{" to start simultaneous proximity');

    const first = this.parsePrimary();
    this.consume(TokenType.COMMA, 'Expected "," after first operand in "{A,B,C}"');
    const second = this.parsePrimary();
    this.consume(TokenType.COMMA, 'Expected "," after second operand in "{A,B,C}"');
    const third = this.parsePrimary();
    this.consume(TokenType.RBRACE, 'Expected "}" after third operand in "{A,B,C}"');

    // "},10n" 部分
    this.consume(TokenType.COMMA, 'Expected "," after "}" in "{A,B,C},10n"');
    const proxTok = this.consume(
      TokenType.PROX,
      'Expected proximity spec (e.g. 10n) after "{A,B,C},"'
    );

    const { mode, k } = this.parseProxSpec(proxTok.text);

    // 仕様上、3要素同時近傍は NNn のみ（段落近傍 NNc は不可）
    if (mode !== 'NNn') {
      throw new Error('Simultaneous proximity supports NNn (n) only');
    }

    return new SimultaneousProximityNode(k, [first, second, third]);
  }

  /**
   * "10n" / "5c" のような proximity 文字列から mode と k を取り出す。
   * @param {string} text
   * @returns {{ mode: "NNn"|"NNc", k: number }}
   */
  parseProxSpec(text) {
    const m = /^(\d+)([nc])$/i.exec(text);
    if (!m) {
      throw new Error(`Invalid proximity spec: ${text}`);
    }
    const k = parseInt(m[1], 10);
    const suffix = m[2].toLowerCase();
    const mode = suffix === 'c' ? 'NNc' : 'NNn';
    return { mode, k };
  }
}

window.Parser = Parser;