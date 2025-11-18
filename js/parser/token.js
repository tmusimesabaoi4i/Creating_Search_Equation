// js/parser/token.js
// トークン種別定義と Token クラス

// export const TokenType = {
const TokenType = {
  IDENT: 'ident',
  PLUS: 'plus',
  STAR: 'star',
  COMMA: 'comma',
  LPAREN: 'lparen',
  RPAREN: 'rparen',
  LBRACE: 'lbrace',
  RBRACE: 'rbrace',
  ASSIGN: 'assign',
  FIELD: 'field',  // /TX, /CP, /FI 等
  PROX: 'prox',    // 10n, 5c 等
  EOF: 'eof',
};

// export class Token {
class Token {
  /**
   * @param {string} type - TokenType のいずれか
   * @param {string} text - 元の文字列
   */
  constructor(type, text) {
    this.type = type;
    this.text = text;
  }

  toString() {
    return `Token(${this.type}, "${this.text}")`;
  }
}

window.TokenType = TokenType;
window.Token = Token;