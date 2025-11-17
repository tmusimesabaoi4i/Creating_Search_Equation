// js/parser/lexer.js
// 1 行の文字列から Token 列を生成するレキサ
//
// 重要ポイント:
// - "/" は基本的に IDENT の一部として扱う
//   → "H04W16/24" は IDENT("H04W16/24")
// - ただし、式の境界の直後に現れる "/TX", "/CP", "/FI" などは FIELD として扱う
//   → ")/TX", " + /CP" など
// - 数字から始まる "10n", "5c" は PROX トークン

import { TokenType, Token } from './token.js';

export class Lexer {
  /**
   * @param {string} input - 1行の式
   */
  constructor(input) {
    this.input = input || '';
    this.index = 0;
    this.length = this.input.length;
  }

  /**
   * 現在位置から次のトークンを読み取り、インデックスを進める。
   * @returns {Token}
   */
  nextToken() {
    this.skipWhitespace();

    if (this.index >= this.length) {
      return new Token(TokenType.EOF, '');
    }

    const ch = this.peekChar();

    // 単一文字トークン
    if (ch === '+') {
      this.advance();
      return new Token(TokenType.PLUS, '+');
    }
    if (ch === '*') {
      this.advance();
      return new Token(TokenType.STAR, '*');
    }
    if (ch === ',') {
      this.advance();
      return new Token(TokenType.COMMA, ',');
    }
    if (ch === '(') {
      this.advance();
      return new Token(TokenType.LPAREN, '(');
    }
    if (ch === ')') {
      this.advance();
      return new Token(TokenType.RPAREN, ')');
    }
    if (ch === '{') {
      this.advance();
      return new Token(TokenType.LBRACE, '{');
    }
    if (ch === '}') {
      this.advance();
      return new Token(TokenType.RBRACE, '}');
    }
    if (ch === '=') {
      this.advance();
      return new Token(TokenType.ASSIGN, '=');
    }

    // "/" は「フィールドの開始」か「IDENT の一部」かを文脈で判定する
    if (ch === '/') {
      const prev = this.peekPrevNonWhitespaceChar();
      const next = this.peekChar(1);
      const isFieldStart =
        this.isFieldBoundary(prev) && this.isAlpha(next);

      if (isFieldStart) {
        return this.readField();
      }
      // フィールド開始でなければ "/" から始まる IDENT として扱う
      return this.readIdentifier();
    }

    // 数字開始: 数字列＋n/c を PROX、そうでなければ IDENT として返す。
    if (this.isDigit(ch)) {
      return this.readNumberOrProx();
    }

    // その他: 識別子（英数・日本語・"/" 等を含む）
    return this.readIdentifier();
  }

  /**
   * 現在位置+offset の文字を返す。範囲外なら null。
   * @param {number} [offset=0]
   * @returns {string|null}
   */
  peekChar(offset = 0) {
    const idx = this.index + offset;
    if (idx < 0 || idx >= this.length) return null;
    return this.input.charAt(idx);
  }

  /**
   * 現在の文字を返しつつ index++ する。範囲外なら null。
   * @returns {string|null}
   */
  advance() {
    if (this.index >= this.length) return null;
    const ch = this.input.charAt(this.index);
    this.index += 1;
    return ch;
  }

  /**
   * 空白やタブを飛ばす。
   */
  skipWhitespace() {
    while (this.index < this.length) {
      const ch = this.input.charAt(this.index);
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.index += 1;
      } else {
        break;
      }
    }
  }

  /**
   * predicate が true の間文字を読み連結する。
   * @param {(ch: string) => boolean} predicate
   * @returns {string}
   */
  readWhile(predicate) {
    let result = '';
    while (this.index < this.length) {
      const ch = this.input.charAt(this.index);
      if (!predicate(ch)) break;
      result += ch;
      this.index += 1;
    }
    return result;
  }

  /**
   * 数字列＋n/c を PROX、そうでなければ IDENT として返す。
   * 例) "10n" -> PROX, "123" -> IDENT
   * @returns {Token}
   */
  readNumberOrProx() {
    const digits = this.readWhile((ch) => this.isDigit(ch));
    const next = this.peekChar();
    if (next === 'n' || next === 'N' || next === 'c' || next === 'C') {
      // PROX トークン
      this.advance(); // n/c を消費
      const text = digits + next;
      return new Token(TokenType.PROX, text);
    }
    // 純粋な数字列は IDENT として扱う（分類コードの一部に数字だけ現れるケースを許容）
    return new Token(TokenType.IDENT, digits);
  }

  /**
   * /TX, /FI, /CP を FIELD、その他は IDENT として扱う。
   * （呼び出し元で「フィールド開始」であることが確認済み）
   * @returns {Token}
   */
  readField() {
    // 先頭の '/' を消費しつつ、連続する英字を読む。
    let text = this.advance(); // '/'
    text += this.readWhile((ch) => this.isAlpha(ch));

    const upper = text.toUpperCase();
    if (upper === '/TX' || upper === '/FI' || upper === '/CP') {
      return new Token(TokenType.FIELD, upper);
    }
    // その他は IDENT として扱う（例: "/ABC"）
    return new Token(TokenType.IDENT, text);
  }

  /**
   * 英数・日本語など、空白と「明示的な演算子・区切り記号」以外の連続を IDENT とする。
   * "/" は IDENT の一部として扱うので、分類コード "H04W16/24" は 1 トークン。
   * @returns {Token}
   */
  readIdentifier() {
    const text = this.readWhile((ch) => !this.isSeparator(ch));
    return new Token(TokenType.IDENT, text);
  }

  /**
   * 数字かどうか。
   * @param {string} ch
   * @returns {boolean}
   */
  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  /**
   * 英字かどうか。
   * @param {string} ch
   * @returns {boolean}
   */
  isAlpha(ch) {
    return (
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z')
    );
  }

  /**
   * トークンを区切るセパレータかどうか。
   * 空白 + 明示的な演算子・記号類。
   * "/" はここには含めない → "H04W16/24" は1トークン。
   * @param {string} ch
   * @returns {boolean}
   */
  isSeparator(ch) {
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') return true;
    // これらは個別のトークンとして扱う
    if ('+*(),{}='.includes(ch)) return true;
    return false;
  }

  /**
   * 直前の「非空白文字」を返す（無ければ null）。
   * @returns {string|null}
   */
  peekPrevNonWhitespaceChar() {
    let i = this.index - 1;
    while (i >= 0) {
      const ch = this.input.charAt(i);
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        i -= 1;
        continue;
      }
      return ch;
    }
    return null;
  }

  /**
   * 直前文字が「フィールド開始にふさわしい境界」かどうか。
   * 例: null (先頭), 空白, "+", "*", "(", ")", "{", "}", ",", "="
   * @param {string|null} prev
   * @returns {boolean}
   */
  isFieldBoundary(prev) {
    if (prev == null) return true;
    if (prev === ' ' || prev === '\t' || prev === '\r' || prev === '\n') return true;
    if ('+*(),{}='.includes(prev)) return true;
    return false;
  }
}